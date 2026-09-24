import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import { analyzeBankImport, applyBankImport, matchAccount, parseBankFile, suggestedAccount } from "@/data/bankImport";
import { buildTrinityImport, isTrinityCsv } from "./trinityCsv";

const HEADER = '"#";"Datum a čas";"Popis";"Číslo protiúčtu/kód banky";"Datum účtování";"Textová zpráva";"VS";"SS";"KS";"Částka";"Popis transakce";"Poznámka příkazce"';

const ROWS = [
  '1;"24.09.2026 00:00:00";"Platba z cizího účtu";"27035123/0100";"24.09.2026";;;;;"30000";"Platba z cizího účtu 000000-0027035123/0100";',
  '2;"31.08.2026 00:00:00";"Platba na cizí účet";"2948284123/0800";"31.08.2026";;;;;"-981,89";"Platba na cizí účet 000000-2948284123/0800";',
  '3;"31.08.2026 00:00:00";"Připsání úroků";;"31.08.2026";;;;;"1155,16";;',
  '4;"31.08.2026 00:00:00";"Daň z připsaných úroků";;"31.08.2026";;;;;"-173,27";;',
  '5;"07.01.2025 00:00:00";"Platba na cizí účet";"272381337/0600";"07.01.2025";"Na termínovaný vklad";;;;"-400000";"Platba na cizí účet 000000-0272381337/0600";',
];

/** Trinity exportuje v UTF-8 s BOM a CRLF; „#“ čísluje řádky od nejnovějšího. */
const file = (rows: string[]) => new TextEncoder().encode("﻿" + [HEADER, ...rows].join("\r\n") + "\r\n").buffer as ArrayBuffer;
const text = (rows: string[]) => [HEADER, ...rows].join("\r\n");
/** Nový export: nahoře přibude řádek, čísla „#“ se posunou. */
const renumber = (rows: string[]) => rows.map((r, i) => r.replace(/^\d+;/, `${i + 1};`));

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("Trinity Bank CSV", () => {
  it("rozpozná formát a převede řádky", async () => {
    expect(isTrinityCsv(text(ROWS))).toBe(true);
    const r = await buildTrinityImport(text(ROWS));
    expect(r).toMatchObject({ provider: "trinity", accountNumber: "", currency: "CZK", from: "2025-01-07", to: "2026-09-24", balanceCheck: null });
    expect(r.transactions).toHaveLength(5);
    expect(r.transactions[0]).toMatchObject({ type: "income", amount: 30000, date: "2026-09-24", description: "Platba z cizího účtu 27035123/0100" });
    expect(r.transactions[1]).toMatchObject({ type: "expense", amount: 981.89 });
    expect(r.transactions[2]).toMatchObject({ type: "income", amount: 1155.16, description: "Připsání úroků" });
    expect(r.transactions[3]).toMatchObject({ type: "expense", amount: 173.27, description: "Daň z připsaných úroků" });
    expect(r.transactions[4]!.description).toBe("Platba na cizí účet 272381337/0600 · Na termínovaný vklad");
    expect(r.transactions[0]!.id).toMatch(/^trinity-[0-9a-f]{64}$/);
  });

  it("ID nezávisí na pořadovém čísle řádku", async () => {
    const newer = '1;"25.09.2026 00:00:00";"Připsání úroků";;"25.09.2026";;;;;"10";;';
    const a = await buildTrinityImport(text(ROWS));
    const b = await buildTrinityImport(text(renumber([newer, ...ROWS])));
    expect(b.transactions.slice(1).map((t) => t.id)).toEqual(a.transactions.map((t) => t.id));
  });

  it("opakovaný import nic nezdvojí a účet se předvybere podle názvu", async () => {
    const first = await parseBankFile(file(ROWS.slice(1)));
    if (!first.ok) throw new Error(first.errors.join());
    expect(await applyBankImport(first.data, { newAccount: suggestedAccount(first.data) })).toBe(4);

    const account = matchAccount(first.data, await db.accounts.toArray());
    expect(account?.name).toBe("Trinity");

    const second = await parseBankFile(file(renumber(ROWS)));
    if (!second.ok) throw new Error(second.errors.join());
    const plan = await analyzeBankImport(second.data);
    expect(plan.existing).toBe(4);
    expect(plan.fresh).toHaveLength(1);
    expect(await applyBankImport(second.data, { accountId: account!.id })).toBe(1);
    expect(await db.transactions.count()).toBe(5);
  });
});
