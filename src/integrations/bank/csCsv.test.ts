import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import { analyzeBankImport, applyBankImport, matchAccount, parseBankFile, suggestedAccount } from "@/data/bankImport";
import { buildCsImport, isCsCsv } from "./csCsv";

const HEADER = '"Název účtu vlastníka";"Číslo účtu vlastníka";"Datum zaúčtování";"Název protiúčtu";"IBAN";"BIC";"Protiúčet";"Bankovní kód protiúčtu";"Částka";"Měna"';

const ROWS = [
  '"Plus účet";"1234567890/0800";"01.09.2026";"Zaměstnavatel s.r.o.";"CZ4420700000000052411661";"MPUBCZPP";"52411661/2070";"2070";"32 105,00";"CZK"',
  '"Plus účet";"1234567890/0800";"02.09.2026";"ALBERT VAM DEKUJE";"";"";"";"0";"-715,10";"CZK"',
  '"Plus účet";"1234567890/0800";"03.09.2026";"";"";"";"";"0";"-100,00";"CZK"',
  '"Plus účet";"1234567890/0800";"07.09.2026";"PIDLitacka jizdne";"";"";"";"0";"-30,00";"CZK"',
  '"Plus účet";"1234567890/0800";"07.09.2026";"PIDLitacka jizdne";"";"";"";"0";"-30,00";"CZK"',
];

/** ČS exportuje v UTF-16LE s BOM. */
function utf16(text: string): ArrayBuffer {
  const out = new Uint8Array(2 + text.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[2 + i * 2] = c & 0xff;
    out[3 + i * 2] = c >> 8;
  }
  return out.buffer;
}

const file = (rows: string[]) => [HEADER, ...rows].join("\n") + "\n";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("Česká spořitelna CSV", () => {
  it("rozpozná formát a převede řádky", async () => {
    expect(isCsCsv(file(ROWS))).toBe(true);
    const r = await buildCsImport(file(ROWS));
    expect(r).toMatchObject({ provider: "cs", accountNumber: "1234567890/0800", currency: "CZK", from: "2026-09-01", to: "2026-09-07", balanceCheck: null });
    expect(r.transactions).toHaveLength(5);
    expect(r.transactions[0]).toMatchObject({ type: "income", amount: 32105, date: "2026-09-01", description: "Zaměstnavatel s.r.o.", bankProvider: "cs" });
    expect(r.transactions[1]).toMatchObject({ type: "expense", amount: 715.1, description: "ALBERT VAM DEKUJE" });
    expect(r.transactions[2]!.description).toBe("Odchozí platba");
    expect(r.transactions[0]!.id).toMatch(/^cs-[0-9a-f]{64}$/);
  });

  it("shodné řádky dostanou různá ID, stabilní i při jiném pořadí", async () => {
    const a = await buildCsImport(file(ROWS));
    const b = await buildCsImport(file([...ROWS].reverse()));
    expect(a.transactions[3]!.id).not.toBe(a.transactions[4]!.id);
    expect(new Set(b.transactions.map((t) => t.id))).toEqual(new Set(a.transactions.map((t) => t.id)));
  });

  it("načte UTF-16 soubor, opakovaný a překrývající se import nic nezdvojí", async () => {
    const first = await parseBankFile(utf16(file(ROWS.slice(0, 4))));
    if (!first.ok) throw new Error(first.errors.join());
    expect(await applyBankImport(first.data, { newAccount: suggestedAccount(first.data) })).toBe(4);

    const accounts = await db.accounts.toArray();
    const account = matchAccount(first.data, accounts);
    expect(account?.name).toBe("ČS 1234567890/0800");
    expect(account?.initialBalance).toBeUndefined();

    const second = await parseBankFile(utf16(file(ROWS)));
    if (!second.ok) throw new Error(second.errors.join());
    const plan = await analyzeBankImport(second.data);
    expect(plan.existing).toBe(4);
    expect(plan.fresh).toHaveLength(1);
    expect(await applyBankImport(second.data, { accountId: account!.id })).toBe(1);
    expect(await db.transactions.count()).toBe(5);
  });

  it("neznámý formát odmítne se srozumitelnou chybou", async () => {
    const r = await parseBankFile(new TextEncoder().encode("a;b;c\n1;2;3").buffer as ArrayBuffer);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/Podporované výpisy/);
  });
});
