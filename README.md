# Aurum – local-first osobní finance

React + TypeScript + Vite + Tailwind, data v IndexedDB (Dexie), validace Zod, grafy Recharts.
Bez backendu – vše běží v prohlížeči.

```bash
npm install
npm run dev      # vývojový server
npm run build    # typecheck + produkční build do dist/ (servíruje ho Caddy na https://project-gold.localhost)
npm test         # Vitest – výpočty, import/export, upgrade DB
npm run preview  # náhled produkčního buildu na http://localhost:4173
npm run smoke    # smoke test v Chrome proti běžícímu preview (seed dat, všechny stránky, offline, mobil)
```

Aplikace je PWA: po prvním načtení funguje offline (service worker ukládá celou aplikaci předem).
Nová verze se nainstaluje až po potvrzení v hlášce „Je k dispozici nová verze“.

## Struktura

| Složka | Obsah |
| --- | --- |
| `src/domain/` | Zod schémata a typy, výchozí kategorie, práce s měsíci, čisté výpočty (`aggregate.ts`), vysvětlitelné insights |
| `src/domain/` (Fáze 2) | `stats.ts` průměry a meziroční srovnání, `budgets.ts` čerpání a odhad překročení, `recurring.ts` detekce pravidelných plateb a změn cen, `anomalies.ts` neobvyklé výdaje |
| `src/db/` | Dexie databáze (`db.ts`), repozitáře – jediné místo zápisu, vše validované (`repositories.ts`), reaktivní hooky |
| `src/domain/` (Fáze 3) | `accounts.ts` zůstatky a rezerva, `cashflow.ts` výkaz a pohyby po účtech, `forecast.ts` + `forecastModel.ts` predikce se zpětným testem, `scenarios.ts` scénáře „co kdyby“ |
| `src/data/` | JSON záloha: formát (`format.ts`), migrace starších verzí (`migrations.ts`), export/validace/náhled/import (`backup.ts`) |
| `src/integrations/bank/` | CSV výpisy bank: rozpoznání formátu (`index.ts`), KB+ (`kbCsv.ts`), Česká spořitelna (`csCsv.ts`), společné pomůcky a hash (`csv.ts`); rozhraní budoucích API adaptérů (`BankAdapter`) |
| `src/data/bankImport.ts` | Náhled a zápis bankovního importu (deduplikace podle ID) |
| `src/data/demo.ts` | Testovací účet s vymyšlenými daty za poslední rok (Data → Testovací účet) |
| `src/features/` | Znovupoužitelné bloky UI: formulář a tabulka transakcí, grafy, insights |
| `src/pages/` | Obrazovky (Přehled, Měsíce, Detail měsíce, Transakce, Nastavení, placeholdery dalších fází) |

## Zásady

- Transakce jsou základní entita, měsíce se z nich odvozují (`MonthStatus` ukládá jen stav „zkontrolováno“ a poznámku).
- Převody (`transfer`) se nikdy nezapočítávají do příjmů ani výdajů.
- Změna schématu DB = nové `db.version(n)`; starší verze se nemění.
- Změna formátu zálohy = zvýšit `CURRENT_FORMAT_VERSION` a přidat migraci do `src/data/migrations.ts`.
  Import vždy: JSON → obálka → migrace → Zod → kontrola konfliktů → náhled → potvrzení → zápis v jedné transakci.
- Predikce se vždy zobrazují jako rozsah (≈80% interval) a s popisem metody; při < 3 měsících historie se nezobrazují.
- Zůstatek účtu = počáteční zůstatek k datu + transakce od toho dne; starší transakce se dopočítají zpětně.
- Každý insight nese čísla, ze kterých vznikl (`basis`), a popis metody (`method`).
- Částky jsou vždy kladné, směr určuje `type`.
- Bankovní import: ID transakce = `<banka>-` + SHA-256 ze stálých polí řádku (bez poznámek, které jde v bankovnictví upravit)
  a pořadí výskytu u zcela shodných řádků. Pole v hashi se nesmí měnit, jinak by se už importovaná data při dalším importu zdvojila.
  Import vždy ukáže potvrzovací okno se seznamem transakcí, které se přidají.
  Opakovaný import stejného či překrývajícího se výpisu nic nezdvojí a existující (i upravené) transakce nepřepíše.
  Řádky v cizí měně (měnové podúčty KB+) se neimportují samostatně – v měně účtu je zastupuje směna s popisem platby.

## Nasazení (produkce: https://aurum.marng.dev)

Server `marng-contabo` (Debian 13, Caddy; konvence v `/www/AI/` na serveru). Nasazuje se **z gitu**:
server si stáhne commit z GitHubu (`git@github.com:MaRNG/aurum.git`) a sám ho postaví.
Nasadí se jen to, co je pushnuté – skript odmítne nasadit větev s nepushnutými commity.

```bash
git push                                   # nasazuje se z GitHubu
npm run deploy                             # main: npm ci + testy + build na serveru, přepnutí verze, ověření
npm run deploy -- --skip-tests             # bez testů (typecheck proběhne v buildu vždy)
bash deploy/deploy.sh deploy --ref v1.2    # konkrétní větev, tag nebo commit
bash deploy/deploy.sh check                # zkušební build na serveru, web se nepřepne
bash deploy/deploy.sh rollback             # přepnout zpět na předchozí verzi
bash deploy/deploy.sh releases             # výpis verzí na serveru i s commitem
bash deploy/deploy.sh setup                # jednorázová příprava serveru (idempotentní)
```

- Server drží mirror repozitáře v `/www/aurum.marng.dev/repo.git` (root, stahuje přes root deploy klíč
  `~/.ssh/marng-github`). Build běží v dočasném `build/<id>/` pod uživatelem projektu, ne pod rootem.
- Každé nasazení = nová složka `/www/aurum.marng.dev/releases/<datum-čas>-<commit>/www/` + soubor `REVISION`
  s hashem commitu; symlink `current` se přepne atomicky až po úspěšném buildu. Drží se 5 posledních verzí.
- Konfigurace webu je v repozitáři (`deploy/aurum.marng.dev.caddy`), na server ji nahrává `setup`.
  Setup ověří konfiguraci pod uživatelem `caddy` a pokud by Caddy nenaběhl, vrátí původní stav.
- Web patří uživateli `www-aurummarngdev` (práva 750/640), Caddy je členem jeho skupiny.
- Aplikace nemá backend – data uživatelů zůstávají v jejich prohlížečích, na serveru jsou jen statické soubory.
