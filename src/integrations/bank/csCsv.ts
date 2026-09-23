import { hashRows, norm, parseCzDate, parseCzNumber, round2, splitLine } from "./csv";
import { BankParseError, type BankImport, type BankTransactionDraft } from "./types";

/**
 * Import CSV exportu České spořitelny (George).
 *
 * UTF-16 s BOM, oddělovač `;`, všechny hodnoty v uvozovkách, desetinná čárka a mezera
 * jako oddělovač tisíců („2 105,00“). Soubor nemá hlavičku výpisu ani zůstatky –
 * jen tabulku: vlastník, datum zaúčtování, protistrana, částka, měna.
 *
 * Export nenese identifikaci transakce, takže ID = `cs-` + SHA-256 ze všech polí řádku
 * a pořadí výskytu. Zcela shodné řádky (3× jízdenka za 30 Kč týž den) tak dostanou
 * různá, ale při opakovaném exportu stejná ID – pokud export pokrývá celé dny.
 */

export const CS_PROVIDER = "cs";

const COLUMNS = {
  ownerName: "nazev uctu vlastnika",
  ownerAccount: "cislo uctu vlastnika",
  bookingDate: "datum zauctovani",
  counterName: "nazev protiuctu",
  iban: "iban",
  bic: "bic",
  counterAccount: "protiucet",
  amount: "castka",
  currency: "mena",
} as const;

interface CsRow {
  ownerName: string;
  ownerAccount: string;
  bookingDate: string;
  counterName: string;
  iban: string;
  counterAccount: string;
  amount: number;
  currency: string;
}

function headerOf(text: string): string[] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  return splitLine(first).map(norm);
}

/** Rozpozná export ČS podle hlavičky tabulky. */
export function isCsCsv(text: string): boolean {
  const h = headerOf(text);
  return h.includes(COLUMNS.ownerAccount) && h.includes(COLUMNS.bookingDate) && h.includes(COLUMNS.amount);
}

function parseRows(text: string): CsRow[] {
  const lines = text.split(/\r?\n/);
  const header = splitLine(lines[0] ?? "").map(norm);
  const col = {} as Record<keyof typeof COLUMNS, number>;
  for (const [field, name] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) {
    col[field] = header.indexOf(name);
  }
  for (const required of ["ownerAccount", "bookingDate", "amount", "currency"] as const) {
    if (col[required] < 0) throw new BankParseError(`Ve výpisu chybí sloupec „${COLUMNS[required]}“.`);
  }

  const rows: CsRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]!);
    if (cells.every((c) => c === "")) continue;
    const get = (f: keyof typeof COLUMNS) => (col[f] >= 0 ? (cells[col[f]] ?? "") : "");
    const bookingDate = parseCzDate(get("bookingDate"));
    const amount = parseCzNumber(get("amount"));
    if (!bookingDate) throw new BankParseError(`Řádek ${i + 1}: neplatné datum zaúčtování „${get("bookingDate")}“.`);
    if (amount === null) throw new BankParseError(`Řádek ${i + 1}: neplatná částka „${get("amount")}“.`);
    rows.push({
      ownerName: get("ownerName"),
      ownerAccount: get("ownerAccount"),
      bookingDate,
      counterName: get("counterName"),
      iban: get("iban"),
      counterAccount: get("counterAccount"),
      amount,
      currency: get("currency").toUpperCase() || "CZK",
    });
  }
  return rows;
}

function describe(r: CsRow): string {
  if (r.counterName) return r.counterName;
  const direction = r.amount > 0 ? "Příchozí platba" : "Odchozí platba";
  return r.counterAccount ? `${direction} ${r.counterAccount}` : direction;
}

export async function buildCsImport(text: string): Promise<BankImport> {
  const rows = parseRows(text).filter((r) => r.amount !== 0);
  const owners = new Set(rows.map((r) => r.ownerAccount));
  if (owners.size > 1) throw new BankParseError(`Soubor obsahuje více účtů (${[...owners].join(", ")}). Exportuj každý účet zvlášť.`);

  // Měna účtu = nejčastější měna řádků (export ji v hlavičce neuvádí)
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
  const currency = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "CZK";

  // Pořadí polí je součást ID – neměnit, jinak by se už importované transakce při dalším importu zdvojily.
  const hashes = await hashRows(
    CS_PROVIDER,
    rows.map((r) => [r.ownerAccount, r.bookingDate, r.amount.toFixed(2), r.currency, r.counterName, r.counterAccount, r.iban]),
  );

  const transactions: BankTransactionDraft[] = rows.map((r, i) => ({
    id: `${CS_PROVIDER}-${hashes[i]}`,
    type: r.amount > 0 ? "income" : "expense",
    amount: round2(Math.abs(r.amount)),
    currency: r.currency,
    date: r.bookingDate,
    description: describe(r),
    source: "bank",
    bankProvider: CS_PROVIDER,
    externalId: hashes[i],
  }));

  const dates = rows.map((r) => r.bookingDate).sort();
  return {
    provider: CS_PROVIDER,
    bankName: "Česká spořitelna",
    bankShort: "ČS",
    accountNumber: rows[0]?.ownerAccount ?? "",
    accountName: rows[0]?.ownerName ?? "",
    currency,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    openingBalance: null,
    closingBalance: null,
    transactions,
    foreignRows: 0,
    foreignTotals: {},
    balanceCheck: null,
  };
}
