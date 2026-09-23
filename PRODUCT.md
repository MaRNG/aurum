# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Veřejnost: kdokoli, kdo si chce vést osobní finance, včetně lidí, kteří aplikaci vidí poprvé. Typická situace: u počítače, jednou za čas (měsíční kontrola) projdou uplynulý měsíc, doplní transakce, zkontrolují rozpočty a podívají se na vývoj a odhady.

## Product Purpose

Aurum je local-first přehled osobních financí. Transakce jsou základní entita, z nich se odvozují měsíce, statistiky, rozpočty, cashflow po účtech, rezerva, predikce, scénáře „co kdyby“ a vysvětlitelné insights. Úspěch = uživatel po měsíční kontrole ví, jak na tom je a proč, a věří číslům.

## Positioning

Bez backendu a bez účtu: data zůstávají v prohlížeči (IndexedDB), aplikace funguje offline jako PWA. Každé číslo je vysvětlitelné: insights nesou výchozí čísla (`basis`) a popis metody, predikce se ukazují jako rozsah (≈80% interval) s metodou a zpětným testem, nikdy jako jistota.

## Operating Context

Měsíční rituál u desktopu: výběr měsíce, doplnění chybějících záznamů, označení měsíce jako zkontrolovaného, kontrola rozpočtů a neobvyklých výdajů. Pravidelná JSON záloha je na uživateli (aplikace na ni upozorňuje).

## Capabilities and Constraints

- Stack: React + TypeScript + Vite + Tailwind v4, Dexie, Zod, Recharts, lucide-react. PWA s precache (fonty musí být lokální, ne z CDN).
- Rozhraní je česky; částky v CZK (výchozí měna v nastavení), tabulková čísla.
- Převody se nezapočítávají do příjmů ani výdajů. Částky jsou vždy kladné, směr určuje typ.
- Predikce se při < 3 měsících historie nezobrazují.
- Sekce: Přehled, Měsíce, Transakce, Účty, Cashflow, Statistiky, Analýza (rozpočty, pravidelné platby, neobvyklé výdaje), Predikce (+ scénáře), Insights, Data, Nastavení.

## Brand Commitments

Název „Aurum“. Tykání v textech („Zadej…“, „doporučuji…“), věcný, klidný tón.

## Evidence on Hand

Žádné reference, recenze ani čísla uživatelů. Ukázková data existují jen v `e2e/smoke.mjs` (seed) a nesmí se prezentovat jako skutečná.

## Product Principles

- Čísla na prvním místě, vždy s tím, jak vznikla.
- Odhad je rozsah, ne slib.
- Data patří uživateli: lokálně, exportovatelně, bez účtu.
- Klid místo alarmu: upozornit, ale nestrašit.
