#!/usr/bin/env bash
# Deployer pro Aurum – nasazuje z gitu (GitHub), build probíhá na serveru.
#
# Použití:
#   deploy/deploy.sh setup                 jednorázová příprava serveru (uživatel, adresáře, Caddy site) – idempotentní
#   deploy/deploy.sh [deploy] [volby]      nasazení commitu z GitHubu + přepnutí `current`
#   deploy/deploy.sh check [volby]         jen zkušební build na serveru, web se nepřepne
#   deploy/deploy.sh rollback              přepnutí `current` na předchozí verzi
#   deploy/deploy.sh releases              výpis verzí na serveru (s commitem)
#
# Volby:
#   --ref <větev|tag|sha>   co nasadit (výchozí main)
#   --skip-tests            vynechá testy (typecheck proběhne v rámci buildu vždy)
#
# Server si repozitář stahuje sám (root má v ~/.ssh deploy klíč pro GitHub), takže se nasazuje
# přesně to, co je na GitHubu – necommitnuté ani nepushnuté změny se nenasadí.
#
# Struktura na serveru (konvence z /www/AI/ na serveru):
#   /www/<domain>/repo.git                           bare mirror repozitáře (root, 700)
#   /www/<domain>/build/<id>/                        dočasný checkout pro build (smaže se)
#   /www/<domain>/.cache/                            npm cache uživatele projektu
#   /www/<domain>/releases/<YYYYmmdd-HHMMSS>-<sha>/  jedna verze: www/ (obsah dist/) + REVISION
#   /www/<domain>/current -> releases/<id>           aktivní verze, Caddy servíruje current/www
set -euo pipefail

HOST="${DEPLOY_HOST:-marng-contabo}"
REPO="${DEPLOY_REPO:-git@github.com:MaRNG/aurum.git}"
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

# Rozparsuje volby do proměnných REF a SKIP_TESTS.
parse_opts() {
  REF="main"
  SKIP_TESTS=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --ref) [ $# -ge 2 ] || die "--ref potřebuje hodnotu"; REF="$2"; shift ;;
      --ref=*) REF="${1#--ref=}" ;;
      --skip-tests) SKIP_TESTS=1 ;;
      deploy | check) ;;
      *) die "Neznámá volba: $1" ;;
    esac
    shift
  done
}

# Nasazuje se z GitHubu – upozorní na lokální změny, které by se do nasazení nedostaly.
check_local_git() {
  git rev-parse --git-dir >/dev/null 2>&1 || return 0
  git fetch --quiet origin || die "Nelze načíst origin (git fetch)"
  if [ -n "$(git status --porcelain)" ]; then
    printf '\033[1;33m!\033[0m Máš necommitnuté změny – nasadí se jen to, co je na GitHubu.\n'
  fi
  if git rev-parse --verify --quiet "refs/remotes/origin/$REF" >/dev/null; then
    local ahead
    ahead="$(git rev-list --count "origin/$REF..HEAD" 2>/dev/null || echo 0)"
    if [ "$(git rev-parse --abbrev-ref HEAD)" = "$REF" ] && [ "$ahead" -gt 0 ]; then
      die "Větev $REF má $ahead nepushnutých commitů – nejdřív git push"
    fi
  fi
}

# Na serveru: fetch → checkout commitu → npm ci → (testy) → build pod uživatelem projektu.
# Při MODE=deploy výsledek uloží jako novou verzi a přepne `current`; při MODE=check jen ověří build.
remote_build() {
  local mode="$1"
  remote MODE="$mode" REF="$REF" SKIP_TESTS="$SKIP_TESTS" REPO="$REPO" BASE="$BASE" USER_NAME="$USER_NAME" \
    ID_TIME="$(date +%Y%m%d-%H%M%S)" bash -s <<'REMOTE'
set -euo pipefail
step() { printf '  \033[1;34m·\033[0m %s\n' "$*"; }

mirror="$BASE/repo.git"
if [ ! -d "$mirror" ]; then
  step "Klonuji $REPO"
  git clone --quiet --mirror "$REPO" "$mirror"
  chmod 700 "$mirror"
else
  git -C "$mirror" remote set-url origin "$REPO"
  git -C "$mirror" fetch --quiet --prune origin
fi

sha="$(git -C "$mirror" rev-parse --verify --quiet "$REF^{commit}")" || { echo "  ✗ '$REF' v repozitáři neexistuje" >&2; exit 1; }
short="${sha:0:7}"
id="$ID_TIME-$short"
step "Commit $short: $(git -C "$mirror" log -1 --format='%s (%an, %cr)' "$sha")"

build="$BASE/build/$id"
cache="$BASE/.cache"
install -d -o "$USER_NAME" -g "$USER_NAME" -m 750 "$BASE/build" "$build" "$cache"
trap 'rm -rf "$build"' EXIT
git -C "$mirror" archive "$sha" | tar -x -C "$build"
chown -R "$USER_NAME:$USER_NAME" "$build"

# Build běží pod uživatelem projektu, ne pod rootem (npm skripty závislostí nemají práva roota).
as_user() {
  runuser -u "$USER_NAME" -- env -i PATH=/usr/local/bin:/usr/bin:/bin HOME="$cache" \
    npm_config_cache="$cache/npm" npm_config_update_notifier=false CI=1 \
    bash -c "cd '$build' && $1"
}
# Výstup kroku jde do logu; při chybě se vypíše jeho konec (tsc hlásí chyby na stdout).
run() {
  local name="$1" log="$BASE/build/$id.log"
  step "$name"
  if ! as_user "$2" >"$log" 2>&1; then
    echo "  ✗ $name selhal:" >&2
    tail -n 40 "$log" | sed 's/^/    /' >&2
    rm -f "$log"
    exit 1
  fi
  rm -f "$log"
}
run "npm ci" "npm ci --no-audit --no-fund --loglevel=error"
if [ "$SKIP_TESTS" = 0 ]; then run "Testy" "npx vitest run --reporter=dot"; fi
run "Build (typecheck + vite)" "npm run build"
[ -f "$build/dist/index.html" ] || { echo "  ✗ Build nevytvořil dist/index.html" >&2; exit 1; }

if [ "$MODE" = check ]; then
  echo "  build v pořádku, web se nepřepnul"
  exit 0
fi

release="$BASE/releases/$id"
install -d -o "$USER_NAME" -g "$USER_NAME" -m 750 "$release"
cp -a "$build/dist" "$release/www"
echo "$sha" > "$release/REVISION"
chown -R "$USER_NAME:$USER_NAME" "$release"
find "$release" -type d -exec chmod 750 {} + && find "$release" -type f -exec chmod 640 {} +

prev="$(readlink "$BASE/current" 2>/dev/null | xargs -r basename || true)"
cd "$BASE" && ln -sfn "releases/$id" current.tmp && mv -Tf current.tmp current && chown -h "$USER_NAME:$USER_NAME" current
step "current → releases/$id${prev:+ (předchozí $prev)}"
REMOTE
}

cmd_deploy() {
  parse_opts "$@"
  check_local_git
  info "Nasazuji $REF z $REPO"
  remote_build deploy
  verify
  cleanup
  ok "Nasazeno: https://$DOMAIN ($(remote "readlink $BASE/current | xargs basename"))"
}

cmd_check() {
  parse_opts "$@"
  check_local_git
  info "Zkušební build $REF na serveru"
  remote_build check
  ok "Build prošel"
}

verify() {
  info "Ověřuji https://$DOMAIN"
  local expected served
  expected="$(remote "sha256sum $BASE/current/www/index.html" | cut -d' ' -f1)"
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
  remote BASE="$BASE" bash -s <<'REMOTE'
cd "$BASE"
echo "current -> $(readlink current)"
for r in $(ls -1 releases | sort -r); do
  rev="$(cat "releases/$r/REVISION" 2>/dev/null | cut -c1-7)"
  printf '  %s  %s\n' "$r" "${rev:-(rsync)}"
done
REMOTE
}

case "${1:-deploy}" in
  setup) cmd_setup ;;
  deploy | --*) cmd_deploy "$@" ;;
  check) cmd_check "$@" ;;
  rollback) cmd_rollback ;;
  releases) cmd_releases ;;
  *) die "Neznámý příkaz: $1 (setup | deploy | check | rollback | releases)" ;;
esac
