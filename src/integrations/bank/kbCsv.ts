import { formatForeign, hashRows, norm, parseCzDate, parseCzNumber, round2, splitLine } from "./csv";
import { BankParseError, type BankImport, type BankTransactionDraft } from "./types";

/**
 * Import výpisu Komerční banky ve formátu „KB+, vypis v csv. formatu“.
 *
 * Soubor je ve windows-1250, oddělovač `;`, desetinná čárka, data `DD.MM.YYYY`.
 * Nad tabulkou je hlavička výpisu (číslo účtu, období, zůstatky), sloupce tabulky
 * se hledají podle názvu, ne podle pořadí.
 *
 * ID transakce = `kb-` + SHA-256 z polí, která banka u zaúčtované transakce nemění
 * (bez volných textů, které si lze v bankovnictví upravit). Opakovaný import stejného
 * nebo překrývajícího se výpisu proto vytvoří stejná ID a nic se nezdvojí.
 *
 * Měnové podúčty: KB+ vede EUR/USD jako průchozí zůstatky. Platba kartou v EUR
 * se ve výpisu objeví jako −EUR a hned ji vyrovná pár řádků se stejnou identifikací
 * (+EUR / −CZK). Importují se jen řádky v měně účtu – řádek v CZK je skutečný pohyb
 * peněz – a jeho popis se doplní podle platby v cizí měně, kterou pokryl.
 */

export const KB_PROVIDER = "kb";

export interface KbRow {
  bookingDate: string;
  valueDate: string;
  counterAccount: string;
  counterName: string;
  amount: number;
  currency: string;
  vs: string;
  ks: string;
  ss: string;
  reference: string;
  kind: string;
  noteForMe: string;
  message: string;
}

export interface KbStatement {
  accountNumber: string;
  iban: string;
  accountName: string;
  currency: string;
  from: string | null;
  to: string | null;
  declaredCount: number | null;
  openingBalance: number | null;
  closingBalance: number | null;
  rows: KbRow[];
}

const FX_KINDS = new Set(["Směna peněz", "Vyrovnávací úhrada"]);

/* -------------------------------- Parsování -------------------------------- */

const COLUMNS = {
  bookingDate: "datum zauctovani",
  valueDate: "datum provedeni",
  counterAccount: "protistrana",
  counterName: "nazev protiuctu",
  amount: "castka",
  currency: "mena",
  vs: "vs",
  ks: "ks",
  ss: "ss",
  reference: "identifikace transakce",
  kind: "typ transakce",
  noteForMe: "popis pro me",
  message: "zprava pro prijemce",
} as const;

export function parseKbCsv(text: string): KbStatement {
  const lines = text.split(/\r?\n/);
  if (!norm(lines[0] ?? "").startsWith("kb+")) {
    throw new BankParseError("Soubor není výpis KB+ v CSV (chybí úvodní řádek „KB+, vypis v csv. formatu“).");
  }

  const headerIdx = lines.findIndex((l) => norm(splitLine(l)[0] ?? "") === COLUMNS.bookingDate);
  if (headerIdx < 0) throw new BankParseError("Ve výpisu chybí hlavička tabulky transakcí („Datum zauctovani;…“).");

  const meta = new Map<string, string>();
  for (const line of lines.slice(0, headerIdx)) {
    const [key, value] = splitLine(line);
    if (key) meta.set(norm(key), value ?? "");
  }

  const header = splitLine(lines[headerIdx]!).map(norm);
  const col = {} as Record<keyof typeof COLUMNS, number>;
  for (const [field, name] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) {
    col[field] = header.indexOf(name);
  }
  for (const required of ["bookingDate", "amount", "currency", "reference"] as const) {
    if (col[required] < 0) throw new BankParseError(`Ve výpisu chybí sloupec „${COLUMNS[required]}“.`);
  }

  const rows: KbRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]!);
    if (cells.every((c) => c === "")) continue;
    const get = (f: keyof typeof COLUMNS) => (col[f] >= 0 ? (cells[col[f]] ?? "") : "");
    const line = i + 1;
    const bookingDate = parseCzDate(get("bookingDate"));
    const amount = parseCzNumber(get("amount"));
    if (!bookingDate) throw new BankParseError(`Řádek ${line}: neplatné datum zaúčtování „${get("bookingDate")}“.`);
    if (amount === null) throw new BankParseError(`Řádek ${line}: neplatná částka „${get("amount")}“.`);
    rows.push({
      bookingDate,
      valueDate: parseCzDate(get("valueDate")) ?? bookingDate,
      counterAccount: get("counterAccount"),
      counterName: get("counterName"),
      amount,
      currency: get("currency").toUpperCase(),
      vs: get("vs"),
      ks: get("ks"),
      ss: get("ss"),
      reference: get("reference"),
      kind: get("kind"),
      noteForMe: get("noteForMe"),
      message: get("message"),
    });
  }

  const count = parseCzNumber(meta.get("pocet polozek") ?? "");
  return {
    accountNumber: meta.get("cislo uctu") ?? "",
    iban: meta.get("iban") ?? "",
    accountName: meta.get("nazev uctu") ?? "",
    currency: (meta.get("mena uctu / hlavni mena uctu") || meta.get("mena uctu") || "CZK").toUpperCase(),
    from: parseCzDate(meta.get("vypis od") ?? ""),
    to: parseCzDate(meta.get("vypis do") ?? ""),
    declaredCount: count,
    openingBalance: parseCzNumber(meta.get("pocatecni zustatek") ?? ""),
    closingBalance: parseCzNumber(meta.get("konecny zustatek") ?? ""),
    rows,
  };
}

/* ------------------------------ Převod na transakce ------------------------------ */

function describeRow(r: KbRow): string {
  const name = r.counterName || [r.kind, r.counterAccount].filter(Boolean).join(" ");
  const extra = [r.message, r.noteForMe].filter((x) => x && x !== name);
  return [name, ...extra].join(" · ");
}

/**
 * Popis řádku směny v měně účtu podle platby v cizí měně, kterou pokryl
 * (stejná měna, opačné znaménko, částka do 2 %, nejbližší datum v okně ±7 dní).
 */
function describeFx(czkRow: KbRow, rows: KbRow[], used: Set<KbRow>, accountCurrency: string): string {
  const leg = rows.find((r) => r !== czkRow && r.reference === czkRow.reference && r.currency !== accountCurrency);
  if (!leg) return describeRow(czkRow);
  const dayMs = 86_400_000;
  const candidates = rows
    .filter(
      (r) =>
        !used.has(r) &&
        r.currency === leg.currency &&
        !FX_KINDS.has(r.kind) &&
        Math.sign(r.amount) === -Math.sign(leg.amount) &&
        Math.abs(r.amount) <= Math.abs(leg.amount) * 1.02 &&
        Math.abs(r.amount) >= Math.abs(leg.amount) * 0.98,
    )
    .map((r) => ({ r, dist: Math.abs(Date.parse(r.bookingDate) - Date.parse(leg.bookingDate)) / dayMs }))
    .filter((c) => c.dist <= 7)
    .sort((a, b) => a.dist - b.dist);
  const match = candidates[0]?.r;
  if (match) {
    used.add(match);
    return `${describeRow(match)} (${formatForeign(match.amount, match.currency)})`;
  }

  // Jedna vyrovnávací úhrada občas pokryje víc plateb zaúčtovaných týž den
  const sameDay = rows.filter(
    (r) =>
      !used.has(r) &&
      r.currency === leg.currency &&
      r.bookingDate === leg.bookingDate &&
      !FX_KINDS.has(r.kind) &&
      Math.sign(r.amount) === -Math.sign(leg.amount),
  );
  const sum = sameDay.reduce((s, r) => s + r.amount, 0);
  if (sameDay.length > 1 && Math.abs(sum + leg.amount) < 0.005) {
    for (const r of sameDay) used.add(r);
    const names = [...new Set(sameDay.map(describeRow))].join(" + ");
    return `${names} (${sameDay.map((r) => formatForeign(r.amount, r.currency)).join(" + ")})`;
  }
  return `${czkRow.message || czkRow.kind} (${formatForeign(leg.amount, leg.currency)})`;
}

export async function buildKbImport(statement: KbStatement): Promise<BankImport> {
  const accountCurrency = statement.currency;
  const own = statement.rows.filter((r) => r.currency === accountCurrency && r.amount !== 0);
  const foreign = statement.rows.filter((r) => r.currency !== accountCurrency);

  const foreignTotals: Record<string, number> = {};
  for (const r of foreign) foreignTotals[r.currency] = round2((foreignTotals[r.currency] ?? 0) + r.amount);

  // Pořadí polí je součást ID – neměnit, jinak by se už importované transakce při dalším importu zdvojily.
  const hashes = await hashRows(
    KB_PROVIDER,
    own.map((r) => [statement.accountNumber, r.bookingDate, r.valueDate, r.amount.toFixed(2), r.currency, r.reference, r.kind, r.counterAccount, r.vs, r.ks, r.ss]),
  );

  const usedForeign = new Set<KbRow>();
  const transactions: BankTransactionDraft[] = own.map((r, i) => ({
    id: `${KB_PROVIDER}-${hashes[i]}`,
    type: r.amount > 0 ? "income" : "expense",
    amount: round2(Math.abs(r.amount)),
    currency: r.currency,
    date: r.valueDate,
    description: FX_KINDS.has(r.kind) ? describeFx(r, statement.rows, usedForeign, accountCurrency) : describeRow(r),
    source: "bank",
    bankProvider: KB_PROVIDER,
    externalId: hashes[i],
  }));

  const { openingBalance: open, closingBalance: close } = statement;
  return {
    provider: KB_PROVIDER,
    bankName: "Komerční banka",
    bankShort: "KB",
    accountNumber: statement.accountNumber,
    accountName: statement.accountName,
    currency: accountCurrency,
    from: statement.from,
    to: statement.to,
    openingBalance: open,
    closingBalance: close,
    transactions,
    foreignRows: foreign.length,
    foreignTotals,
    balanceCheck:
      open !== null && close !== null
        ? { expected: round2(close - open), actual: round2(own.reduce((s, r) => s + r.amount, 0)) }
        : null,
  };
}

/** Rozpozná výpis KB+ podle úvodního řádku. */
export const isKbCsv = (text: string) => norm(text.slice(0, 40)).startsWith("kb+");
