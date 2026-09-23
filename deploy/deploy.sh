#!/usr/bin/env bash
# Deployer pro Aurum (rsync). Později nahradit gitem – struktura na serveru už je na to připravená.
#
# Použití:
#   deploy/deploy.sh setup          jednorázová příprava serveru (uživatel, adresáře, Caddy site) – idempotentní
#   deploy/deploy.sh [deploy]       test + build + nahrání nové verze + přepnutí `current`
#   deploy/deploy.sh rollback       přepnutí `current` na předchozí verzi
#   deploy/deploy.sh releases       výpis verzí na serveru
#
# Volby:  --skip-tests   vynechá typecheck a testy (build proběhne vždy)
#
# Struktura na serveru (konvence z /www/AI/ na serveru):
#   /www/<domain>/releases/<YYYYmmdd-HHMMSS>/www/   jedna verze (obsah dist/)
#   /www/<domain>/current -> releases/<id>          aktivní verze, Caddy servíruje current/www
set -euo pipefail

HOST="${DEPLOY_HOST:-marng-contabo}"
DOMAIN="aurum.marng.dev"
SLUG="${DOMAIN//./}"
USER_NAME="www-$SLUG"
BASE="/www/$DOMAIN"
KEEP=5

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

info() { printf '\033[1;34m→\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
remote() { ssh -o BatchMode=yes "$HOST" "$@"; }

cmd_setup() {
  info "Kontrola DNS $DOMAIN"
  [ -n "$(dig +short A "$DOMAIN")" ] || die "$DOMAIN nemá A záznam – Caddy by nezískal certifikát"

  info "Příprava serveru $HOST"
  remote DOMAIN="$DOMAIN" USER_NAME="$USER_NAME" BASE="$BASE" bash -s <<'REMOTE'
set -euo pipefail
restart_caddy=0
if ! id "$USER_NAME" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin --user-group "$USER_NAME"
  echo "  vytvořen uživatel $USER_NAME"
fi
if ! id -nG caddy | tr ' ' '\n' | grep -qx "$USER_NAME"; then
  usermod -aG "$USER_NAME" caddy
  echo "  caddy přidán do skupiny $USER_NAME"
fi
# Běžící Caddy vidí novou skupinu až po plném restartu – ověřuje se na skutečném procesu,
# takže opakované spuštění setupu restart nevynechá.
gid="$(getent group "$USER_NAME" | cut -d: -f3)"
pid="$(systemctl show -p MainPID --value caddy)"
if [ "$pid" = 0 ] || ! grep -E '^Groups:' "/proc/$pid/status" | tr -s ' \t' '\n' | grep -qx "$gid"; then
  restart_caddy=1
fi
mkdir -p "$BASE/releases"
chown "$USER_NAME:$USER_NAME" "$BASE" "$BASE/releases"
chmod 750 "$BASE" "$BASE/releases"
echo "$restart_caddy" > /tmp/aurum-restart-caddy
REMOTE

  info "Caddy site /etc/caddy/sites/$DOMAIN.caddy"
  scp -q -o BatchMode=yes "deploy/$DOMAIN.caddy" "$HOST:/tmp/$DOMAIN.caddy.new"
  remote DOMAIN="$DOMAIN" bash -s <<'REMOTE'
set -euo pipefail
site="/etc/caddy/sites/$DOMAIN.caddy"
log="/var/log/caddy/$DOMAIN.log"
backup="$(mktemp)"
[ -f "$site" ] && cp "$site" "$backup" || rm -f "$backup"
install -o root -g root -m 644 "/tmp/$DOMAIN.caddy.new" "$site"
rm -f "/tmp/$DOMAIN.caddy.new"

# Log musí patřit uživateli caddy. `caddy validate` pod rootem by ho jinak založil jako root
# a běžící Caddy by pak nenastartoval (známý problém na tomto serveru).
[ -e "$log" ] || install -o caddy -g caddy -m 640 /dev/null "$log"
chown caddy:caddy "$log"

restore() {
  echo "  ✗ Caddy nenaběhl s novou konfigurací – vracím původní stav" >&2
  if [ -f "$backup" ]; then install -o root -g root -m 644 "$backup" "$site"; else rm -f "$site"; fi
  systemctl stop caddy || true
  systemctl start caddy
  systemctl is-active --quiet caddy && echo "  Caddy běží s původní konfigurací" >&2
  journalctl -u caddy -n 5 --no-pager >&2
  exit 1
}

runuser -u caddy -- caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || {
  runuser -u caddy -- caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || true
  if [ -f "$backup" ]; then install -o root -g root -m 644 "$backup" "$site"; else rm -f "$site"; fi
  echo "  ✗ Neplatná konfigurace – nic nezměněno" >&2
  exit 1
}

if [ "$(cat /tmp/aurum-restart-caddy)" = 1 ]; then
  systemctl restart caddy || restore
  echo "  caddy restartován (nová skupina)"
elif ! timeout 30 systemctl reload caddy; then
  # reload může na tomto serveru zatuhnout
  { systemctl stop caddy && systemctl start caddy; } || restore
  echo "  reload zatuhl – caddy restartován"
fi
rm -f /tmp/aurum-restart-caddy "$backup"
sleep 1
systemctl is-active --quiet caddy || restore
REMOTE
  ok "Server připraven"
}

cmd_deploy() {
  command -v rsync >/dev/null || die "Chybí rsync (sudo apt install rsync)"
  local skip_tests=0
  for a in "$@"; do [ "$a" = "--skip-tests" ] && skip_tests=1; done

  if [ "$skip_tests" = 0 ]; then
    info "Typecheck + testy"
    npx tsc -b
    npx vitest run --reporter=dot
  fi
  info "Build"
  npm run build >/dev/null
  [ -f dist/index.html ] || die "Build nevytvořil dist/index.html"

  local id prev
  id="$(date +%Y%m%d-%H%M%S)"
  prev="$(remote "readlink $BASE/current 2>/dev/null | xargs -r basename" || true)"

  info "Nahrávám verzi $id"
  remote "install -d -o $USER_NAME -g $USER_NAME -m 750 $BASE/releases/$id"
  # --link-dest: nezměněné soubory se jen hardlinkují z předchozí verze (rychlé, šetří místo)
  rsync -az --delete \
    --chown="$USER_NAME:$USER_NAME" --chmod=D750,F640 \
    ${prev:+--link-dest="$BASE/releases/$prev/www/"} \
    dist/ "$HOST:$BASE/releases/$id/www/"

  info "Přepínám current → releases/$id"
  remote "cd $BASE && ln -sfn releases/$id current.tmp && mv -Tf current.tmp current && chown -h $USER_NAME:$USER_NAME current"

  verify
  cleanup
  ok "Nasazeno: https://$DOMAIN (verze $id${prev:+, předchozí $prev})"
}

verify() {
  info "Ověřuji https://$DOMAIN"
  local expected served
  expected="$(sha256sum dist/index.html | cut -d' ' -f1)"
  for _ in 1 2 3 4 5; do
    served="$(curl -fsS "https://$DOMAIN/" | sha256sum | cut -d' ' -f1)" && [ "$served" = "$expected" ] && break
    sleep 2
  done
  [ "$served" = "$expected" ] || die "Server nevrací nově nasazený index.html"
  curl -fsS -o /dev/null "https://$DOMAIN/sw.js" || die "sw.js není dostupný"
  curl -fsS -o /dev/null "https://$DOMAIN/mesice" || die "SPA fallback nefunguje"
  ok "Web odpovídá nové verzi"
}

cleanup() {
  remote "cd $BASE/releases && ls -1 | sort | head -n -$KEEP | xargs -r rm -rf"
}

cmd_rollback() {
  local current prev
  current="$(remote "readlink $BASE/current | xargs basename")"
  prev="$(remote "ls -1 $BASE/releases | sort | grep -B1 -x '$current' | head -n1")"
  [ -n "$prev" ] && [ "$prev" != "$current" ] || die "Není na co se vrátit (aktuální: $current)"
  remote "cd $BASE && ln -sfn releases/$prev current.tmp && mv -Tf current.tmp current && chown -h $USER_NAME:$USER_NAME current"
  ok "Vráceno na $prev (bylo $current)"
}

cmd_releases() {
  remote "cd $BASE && echo \"current -> \$(readlink current)\" && ls -1 releases | sort -r"
}

case "${1:-deploy}" in
  setup) cmd_setup ;;
  deploy | --skip-tests) cmd_deploy "$@" ;;
  rollback) cmd_rollback ;;
  releases) cmd_releases ;;
  *) die "Neznámý příkaz: $1 (setup | deploy | rollback | releases)" ;;
esac
