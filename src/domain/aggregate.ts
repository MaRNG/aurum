import type { Category, Transaction } from "./schema";
import { addMonths, monthOfDate, monthRange } from "./months";

/**
 * Čisté výpočetní funkce nad transakcemi. Žádný přístup k DB – snadno testovatelné
 * a znovupoužitelné pro statistiky, insights i budoucí AI (strukturovaná data).
 *
 * Převody (transfer) se do příjmů ani výdajů nikdy nezapočítávají.
 */

export interface MonthSummary {
  month: string;
  income: number;
  expense: number;
  /** income − expense */
  net: number;
  /** net / income, null pokud nebyl žádný příjem */
  savingsRate: number | null;
  transactionCount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function emptySummary(month: string): MonthSummary {
  return { month, income: 0, expense: 0, net: 0, savingsRate: null, transactionCount: 0 };
}

export function summarize(month: string, txs: Transaction[]): MonthSummary {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.type === "income") income += t.amount;
    else if (t.type === "expense") expense += t.amount;
  }
  income = round2(income);
  expense = round2(expense);
  const net = round2(income - expense);
  return { month, income, expense, net, savingsRate: income > 0 ? net / income : null, transactionCount: txs.length };
}

export function groupByMonth(txs: Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>();
  for (const t of txs) {
    const key = monthOfDate(t.date);
    const list = map.get(key);
    if (list) list.push(t);
    else map.set(key, [t]);
  }
  return map;
}

/** Souhrny pro zadané měsíce; měsíce bez transakcí mají nuly. */
export function summarizeMonths(months: string[], txs: Transaction[]): MonthSummary[] {
  const grouped = groupByMonth(txs);
  return months.map((m) => summarize(m, grouped.get(m) ?? []));
}

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  color: string;
  total: number;
  share: number;
}

const UNCATEGORIZED_COLOR = "#cbd5e1";

export function expensesByCategory(txs: Transaction[], categories: Category[]): CategoryTotal[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string | null, number>();
  let sum = 0;
  for (const t of txs) {
    if (t.type !== "expense") continue;
    const key = t.categoryId && byId.has(t.categoryId) ? t.categoryId : null;
    totals.set(key, (totals.get(key) ?? 0) + t.amount);
    sum += t.amount;
  }
  return [...totals.entries()]
    .map(([id, total]) => {
      const c = id ? byId.get(id) : undefined;
      return {
        categoryId: id,
        name: c?.name ?? "Bez kategorie",
        color: c?.color ?? UNCATEGORIZED_COLOR,
        total: round2(total),
        share: sum > 0 ? total / sum : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Průměrné měsíční výdaje za posledních `lookback` uzavřených měsíců (před `currentMonth`),
 * počítané jen z měsíců, které mají nějaká data.
 */
export function averageMonthlyExpense(txs: Transaction[], currentMonth: string, lookback = 6): { months: string[]; avg: number } {
  const grouped = groupByMonth(txs);
  const months = monthRange(addMonths(currentMonth, -1), lookback).filter((m) => grouped.has(m));
  return { months, avg: mean(months.map((m) => summarize(m, grouped.get(m)!).expense)) };
}
