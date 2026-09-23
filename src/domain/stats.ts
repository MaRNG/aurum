import type { Category, Transaction } from "./schema";
import { expensesByCategory, groupByMonth, mean, summarize, type MonthSummary } from "./aggregate";
import { monthOfDate } from "./months";

/** Statistiky za období. Průměry se počítají jen z měsíců, které mají nějaká data. */
export interface PeriodStats {
  months: number;
  monthsWithData: number;
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
  avgIncome: number;
  avgExpense: number;
  avgNet: number;
  /** celková úspora / celkové příjmy za období */
  savingsRate: number | null;
}

export function periodStats(summaries: MonthSummary[]): PeriodStats {
  const withData = summaries.filter((s) => s.transactionCount > 0);
  const totalIncome = withData.reduce((a, s) => a + s.income, 0);
  const totalExpense = withData.reduce((a, s) => a + s.expense, 0);
  const totalNet = totalIncome - totalExpense;
  return {
    months: summaries.length,
    monthsWithData: withData.length,
    totalIncome,
    totalExpense,
    totalNet,
    avgIncome: mean(withData.map((s) => s.income)),
    avgExpense: mean(withData.map((s) => s.expense)),
    avgNet: mean(withData.map((s) => s.net)),
    savingsRate: totalIncome > 0 ? totalNet / totalIncome : null,
  };
}

export interface CategorySeries {
  /** kategorie v pořadí podle celkové částky; poslední může být souhrnná „Další“ */
  keys: { id: string; name: string; color: string; total: number }[];
  /** řádek na měsíc: { month, [categoryId]: částka } */
  rows: ({ month: string } & Record<string, number | string>)[];
}

export const REST_KEY = "__rest";
const REST_COLOR = "#94a3b8";

/** Výdaje po kategoriích v čase; kategorie nad limit se sloučí do „Další“ (paleta necyklí). */
export function categorySeries(months: string[], txs: Transaction[], categories: Category[], maxKeys = 7): CategorySeries {
  const totals = expensesByCategory(txs, categories);
  const main = totals.length > maxKeys + 1 ? totals.slice(0, maxKeys) : totals;
  const mainIds = new Set(main.map((c) => c.categoryId ?? "none"));
  const keys = main.map((c) => ({ id: c.categoryId ?? "none", name: c.name, color: c.color, total: c.total }));
  if (main.length < totals.length) {
    const rest = totals.slice(main.length);
    keys.push({ id: REST_KEY, name: `Další (${rest.length})`, color: REST_COLOR, total: rest.reduce((a, c) => a + c.total, 0) });
  }

  const grouped = groupByMonth(txs);
  const rows = months.map((month) => {
    const row: { month: string } & Record<string, number | string> = { month };
    for (const k of keys) row[k.id] = 0;
    for (const c of expensesByCategory(grouped.get(month) ?? [], categories)) {
      const id = c.categoryId ?? "none";
      const key = mainIds.has(id) ? id : REST_KEY;
      row[key] = (row[key] as number) + c.total;
    }
    return row;
  });
  return { keys, rows };
}

/* --------------------------- Meziroční porovnání --------------------------- */

export interface Change {
  a: number;
  b: number;
  diff: number;
  /** relativní změna b oproti a; null pokud a = 0 */
  pct: number | null;
}

const change = (a: number, b: number): Change => ({ a, b, diff: b - a, pct: a !== 0 ? (b - a) / Math.abs(a) : null });

export interface YearComparison {
  yearA: number;
  yearB: number;
  /** poslední porovnávaný měsíc (1–12) – pro férové srovnání neúplného roku */
  upToMonth: number;
  /** počet měsíců s daty v porovnávaném období každého roku */
  monthsWithDataA: number;
  monthsWithDataB: number;
  income: Change;
  expense: Change;
  net: Change;
  categories: ({ categoryId: string | null; name: string; color: string } & Change)[];
}

export function compareYears(txs: Transaction[], categories: Category[], yearA: number, yearB: number, upToMonth = 12): YearComparison {
  const inYear = (y: number) =>
    txs.filter((t) => {
      const m = monthOfDate(t.date);
      return m.startsWith(`${y}-`) && Number(m.slice(5)) <= upToMonth;
    });
  const ta = inYear(yearA);
  const tb = inYear(yearB);
  const sa = summarize(String(yearA), ta);
  const sb = summarize(String(yearB), tb);
  const ca = expensesByCategory(ta, categories);
  const cb = expensesByCategory(tb, categories);
  const ids = new Set([...ca, ...cb].map((c) => c.categoryId));
  const cats = [...ids].map((id) => {
    const x = ca.find((c) => c.categoryId === id);
    const y = cb.find((c) => c.categoryId === id);
    const meta = (y ?? x)!;
    return { categoryId: id, name: meta.name, color: meta.color, ...change(x?.total ?? 0, y?.total ?? 0) };
  });
  cats.sort((p, q) => Math.max(q.a, q.b) - Math.max(p.a, p.b));
  return {
    yearA,
    yearB,
    upToMonth,
    monthsWithDataA: new Set(ta.map((t) => monthOfDate(t.date))).size,
    monthsWithDataB: new Set(tb.map((t) => monthOfDate(t.date))).size,
    income: change(sa.income, sb.income),
    expense: change(sa.expense, sb.expense),
    net: change(sa.net, sb.net),
    categories: cats,
  };
}

/* ------------------------------ Pomocné statistiky ------------------------------ */

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Směrnice lineární regrese y ~ x pro x = 0..n-1 (změna za jeden krok). */
export function slope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = mean(ys);
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  return num / den;
}
