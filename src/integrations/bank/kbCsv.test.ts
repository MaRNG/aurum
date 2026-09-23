import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import { transactionsRepo } from "@/db/repositories";
import { analyzeBankImport, applyBankImport, parseBankFile, suggestedAccount } from "@/data/bankImport";
import { buildKbImport, parseKbCsv } from "./kbCsv";
import { decodeBankFile, sha256Hex } from "./csv";
import { BankParseError } from "./types";

const HEADER =
  "Datum zauctovani;Datum provedeni;Protistrana;Nazev protiuctu;Castka;Mena;Originalni castka;Originalni mena;Smenny kurz;VS;KS;SS;Identifikace transakce;Typ transakce;Popis pro me;Zprava pro prijemce;Reference platby;BIC / SWIFT;Poplatek";

function statement(rows: string[], { opening = "0", closing = "0" } = {}): string {
  return [
    "KB+, vypis v csv. formatu;;;;;;;;;;;;;;;;;;",
    "Datum vytvoreni souboru;23.09.2026;;;;;;;;;;;;;;;;;",
    ";;;;;;;;;;;;;;;;;;",
    "Cislo uctu;11112222;;;;;;;;;;;;;;;;;",
    "Mena uctu / Hlavni mena uctu;CZK;;;;;;;;;;;;;;;;;",
    "IBAN;CZ0001000000000011112222;;;;;;;;;;;;;;;;;",
    "Nazev uctu;JAN NOVÁK;;;;;;;;;;;;;;;;;",
    "Vypis od;01.03.2026;;;;;;;;;;;;;;;;;",
    "Vypis do;31.03.2026;;;;;;;;;;;;;;;;;",
    `Pocet polozek;${rows.length};;;;;;;;;;;;;;;;;`,
    `Pocatecni zustatek;${opening};;;;;;;;;;;;;;;;;`,
    `Konecny zustatek;${closing};;;;;;;;;;;;;;;;;`,
    ";;;;;;;;;;;;;;;;;;",
    HEADER,
    ...rows,
  ].join("\r\n");
}

const ROWS = [
  "02.03.2026;02.03.2026;123456789/0800;Zaměstnavatel s.r.o.;50000;CZK;;;;2026;0308;;SGW0001;Příchozí úhrada;;Mzda 02/2026;;;",
  "04.03.2026;03.03.2026;519211******2808;ALBERT VAM DEKUJE;-134,3;CZK;;;;;;;5001;Mobilní platba;;;;;",
  "05.03.2026;05.03.2026;281615924/0300;;-322;CZK;;;;;;;SGW0002;Trvalý příkaz;;;;;",
  // platba kartou v EUR vyrovnaná z CZK
  "06.04.2026;04.04.2026;519211******2808;STEAMGAMES.COM 4259522;-3,99;EUR;;;;;;;5002;Nákup na internetu;;;;;",
  "06.04.2026;06.04.2026;11112222/0100;JAN NOVÁK;-101,52;CZK;;;25,4428;;;;FT0001;Vyrovnávací úhrada;;;;;",
  "06.04.2026;06.04.2026;11112222/0100;JAN NOVÁK;3,99;EUR;;;25,4428;;;;FT0001;Vyrovnávací úhrada;;;;;",
];

const encode = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("parseKbCsv", () => {
  it("přečte hlavičku výpisu i řádky", () => {
    const s = parseKbCsv(statement(ROWS, { closing: "49442,18" }));
    expect(s.accountNumber).toBe("11112222");
    expect(s.currency).toBe("CZK");
    expect(s.from).toBe("2026-03-01");
    expect(s.closingBalance).toBe(49442.18);
    expect(s.rows).toHaveLength(6);
    expect(s.rows[1]).toMatchObject({ bookingDate: "2026-03-04", valueDate: "2026-03-03", amount: -134.3, counterName: "ALBERT VAM DEKUJE" });
  });

  it("odmítne jiný soubor", () => {
    expect(() => parseKbCsv("a;b;c\n1;2;3")).toThrow(BankParseError);
  });

  it("dekóduje windows-1250", () => {
    // „Příchozí“ ve windows-1250
    const bytes = new Uint8Array([0x50, 0xf8, 0xed, 0x63, 0x68, 0x6f, 0x7a, 0xed]);
    expect(decodeBankFile(bytes)).toBe("Příchozí");
  });
});

describe("buildKbImport", () => {
  it("importuje jen řádky v měně účtu a směnu popíše podle platby v cizí měně", async () => {
    const r = await buildKbImport(parseKbCsv(statement(ROWS, { closing: "49442,18" })));
    expect(r.transactions).toHaveLength(4);
    expect(r.foreignRows).toBe(2);
    expect(r.foreignTotals).toEqual({ EUR: 0 });
    expect(r.balanceCheck).toEqual({ expected: 49442.18, actual: 49442.18 });

    const [salary, albert, standing, steam] = r.transactions;
    expect(salary).toMatchObject({ type: "income", amount: 50000, date: "2026-03-02", description: "Zaměstnavatel s.r.o. · Mzda 02/2026" });
    expect(albert).toMatchObject({ type: "expense", amount: 134.3, date: "2026-03-03", source: "bank", bankProvider: "kb" });
    expect(standing!.description).toBe("Trvalý příkaz 281615924/0300");
    expect(steam).toMatchObject({ type: "expense", amount: 101.52, description: "STEAMGAMES.COM 4259522 (3,99 EUR)" });
  });

  it("ID je hash řádku – stabilní mezi importy, nezávislé na poznámce", async () => {
    const a = await buildKbImport(parseKbCsv(statement(ROWS)));
    const b = await buildKbImport(parseKbCsv(statement([...ROWS].reverse())));
    expect(new Set(b.transactions.map((t) => t.id))).toEqual(new Set(a.transactions.map((t) => t.id)));
    expect(a.transactions[0]!.id).toMatch(/^kb-[0-9a-f]{64}$/);
    expect(a.transactions[0]!.externalId).toBe(a.transactions[0]!.id.slice(3));

    const noted = ROWS[1]!.replace("Mobilní platba;;", "Mobilní platba;nákup na víkend;");
    const c = await buildKbImport(parseKbCsv(statement([noted])));
    expect(c.transactions[0]!.id).toBe(a.transactions[1]!.id);
  });

  it("ID se nemění mezi verzemi aplikace (už importovaná data se nesmí zdvojit)", async () => {
    const r = await buildKbImport(parseKbCsv(statement([ROWS[1]!])));
    const fields = ["kb", "11112222", "2026-03-04", "2026-03-03", "-134.30", "CZK", "5001", "Mobilní platba", "519211******2808", "", "", "", 0];
    expect(r.transactions[0]!.externalId).toBe(await sha256Hex(fields.join("\u001f")));
  });

  it("dva shodné řádky dostanou různá ID", async () => {
    const r = await buildKbImport(parseKbCsv(statement([ROWS[1]!, ROWS[1]!])));
    expect(r.transactions).toHaveLength(2);
    expect(r.transactions[0]!.id).not.toBe(r.transactions[1]!.id);
  });
});

describe("import do DB", () => {
  it("opakovaný import nic nezdvojí a nepřepíše ruční úpravy", async () => {
    const parsed = await parseBankFile(encode(statement(ROWS, { closing: "49442,18" })));
    if (!parsed.ok) throw new Error(parsed.errors.join());

    const added = await applyBankImport(parsed.data, { newAccount: suggestedAccount(parsed.data) });
    expect(added).toBe(4);
    const account = (await db.accounts.toArray()).find((a) => a.name === "KB 11112222");
    expect(account).toMatchObject({ initialBalance: 0, initialBalanceDate: "2026-03-01" });

    // úprava importované transakce
    const albert = parsed.data.transactions[1]!;
    await transactionsRepo.update(albert.id, { type: "expense", amount: 134.3, currency: "CZK", date: "2026-03-03", accountId: account!.id, categoryId: "cat-food", description: "Nákup" });

    const plan = await analyzeBankImport(parsed.data);
    expect(plan).toMatchObject({ existing: 4, fresh: [] });
    expect(await applyBankImport(parsed.data, { accountId: account!.id })).toBe(0);

    expect(await db.transactions.count()).toBe(4);
    expect(await db.transactions.get(albert.id)).toMatchObject({ categoryId: "cat-food", description: "Nákup", source: "bank", externalId: albert.externalId });
  });

  it("překrývající se výpis přidá jen nové transakce", async () => {
    const first = await parseBankFile(encode(statement(ROWS.slice(0, 2))));
    const second = await parseBankFile(encode(statement(ROWS)));
    if (!first.ok || !second.ok) throw new Error("parse");
    const accountId = (await db.accounts.toArray())[0]!.id;
    expect(await applyBankImport(first.data, { accountId })).toBe(2);
    expect((await analyzeBankImport(second.data)).fresh).toHaveLength(2);
    expect(await applyBankImport(second.data, { accountId })).toBe(2);
    expect(await db.transactions.count()).toBe(4);
  });
});
