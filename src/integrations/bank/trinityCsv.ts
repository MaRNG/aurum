import { hashRows, norm, parseCzDate, parseCzNumber, round2, splitLine } from "./csv";
import { BankParseError, type BankImport, type BankTransactionDraft } from "./types";

/**
 * Import CSV exportu Trinity Bank.
 *
 * UTF-8 s BOM, CRLF, oddělovač `;`, desetinná čárka bez oddělovače tisíců („-981,89“).
 * Jen tabulka bez hlavičky výpisu – chybí číslo vlastního účtu, měna i zůstatky.
 * Sloupec „#“ je pořadí řádku v exportu (od nejnovějšího), při dalším exportu se posune,
 * proto do ID nevstupuje. ID = `trinity-` + SHA-256 ze stálých polí a pořadí výskytu.
 */

export const TRINITY_PROVIDER = "trinity";

const COLUMNS = {
  dateTime: "datum a cas",
  kind: "popis",
  counterAccount: "cislo protiuctu/kod banky",
  bookingDate: "datum uctovani",
  message: "textova zprava",
  vs: "vs",
  ss: "ss",
  ks: "ks",
  amount: "castka",
  detail: "popis transakce",
} as const;

interface TrinityRow {
  dateTime: string;
  kind: string;
  counterAccount: string;
  bookingDate: string;
  message: string;
  vs: string;
  ss: string;
  ks: string;
  amount: number;
}

function headerOf(text: string): string[] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  return splitLine(first).map(norm);
}

/** Rozpozná export Trinity Bank podle hlavičky tabulky. */
export function isTrinityCsv(text: string): boolean {
  const h = headerOf(text);
  return h.includes(COLUMNS.dateTime) && h.includes(COLUMNS.counterAccount) && h.includes(COLUMNS.detail);
}

function parseRows(text: string): TrinityRow[] {
  const lines = text.split(/\r?\n/);
  const header = splitLine(lines[0] ?? "").map(norm);
  const col = {} as Record<keyof typeof COLUMNS, number>;
  for (const [field, name] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) {
    col[field] = header.indexOf(name);
  }
  for (const required of ["dateTime", "bookingDate", "amount"] as const) {
    if (col[required] < 0) throw new BankParseError(`Ve výpisu chybí sloupec „${COLUMNS[required]}“.`);
  }

  const rows: TrinityRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]!);
    if (cells.every((c) => c === "")) continue;
    const get = (f: keyof typeof COLUMNS) => (col[f] >= 0 ? (cells[col[f]] ?? "") : "");
    const bookingDate = parseCzDate(get("bookingDate"));
    const amount = parseCzNumber(get("amount"));
    if (!bookingDate) throw new BankParseError(`Řádek ${i + 1}: neplatné datum účtování „${get("bookingDate")}“.`);
    if (amount === null) throw new BankParseError(`Řádek ${i + 1}: neplatná částka „${get("amount")}“.`);
    rows.push({
      dateTime: get("dateTime"),
      kind: get("kind"),
      counterAccount: get("counterAccount"),
      bookingDate,
      message: get("message"),
      vs: get("vs"),
      ss: get("ss"),
      ks: get("ks"),
      amount,
    });
  }
  return rows;
}

/** „Připsání úroků“, „Platba na cizí účet 2948284123/0800 · Na termínovaný vklad“ */
function describe(r: TrinityRow): string {
  const base = [r.kind || (r.amount > 0 ? "Příchozí platba" : "Odchozí platba"), r.counterAccount].filter(Boolean).join(" ");
  return r.message ? `${base} · ${r.message}` : base;
}

export async function buildTrinityImport(text: string): Promise<BankImport> {
  const rows = parseRows(text).filter((r) => r.amount !== 0);

  // Pořadí polí je součást ID – neměnit, jinak by se už importované transakce při dalším importu zdvojily.
  const hashes = await hashRows(
    TRINITY_PROVIDER,
    rows.map((r) => [r.dateTime, r.bookingDate, r.amount.toFixed(2), r.kind, r.counterAccount, r.message, r.vs, r.ss, r.ks]),
  );

  const transactions: BankTransactionDraft[] = rows.map((r, i) => ({
    id: `${TRINITY_PROVIDER}-${hashes[i]}`,
    type: r.amount > 0 ? "income" : "expense",
    amount: round2(Math.abs(r.amount)),
    currency: "CZK",
    date: r.bookingDate,
    description: describe(r),
    source: "bank",
    bankProvider: TRINITY_PROVIDER,
    externalId: hashes[i],
  }));

  const dates = rows.map((r) => r.bookingDate).sort();
  return {
    provider: TRINITY_PROVIDER,
    bankName: "Trinity Bank",
    bankShort: "Trinity",
    // Export číslo vlastního účtu neuvádí
    accountNumber: "",
    accountName: "",
    currency: "CZK",
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
