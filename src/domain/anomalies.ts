import type { Category, Transaction } from "./schema";
import { expensesByCategory, groupByMonth, mean } from "./aggregate";
import { addMonths, monthOfDate, monthRange } from "./months";
import { median } from "./stats";

/**
 * Detekce neobvyklých výdajů. Dvě úrovně:
 *  1. neobvyklá transakce – výrazně nad obvyklou částkou ve své kategorii,
 *  2. neobvyklý měsíc kategorie – součet výrazně nad průměrem předchozích měsíců.
 * Všechny prahy jsou konstanty níže, aby šly v UI vysvětlit.
 */

export const TX_RULE = {
  /** robustní z-skóre (medián + MAD) */
  minZ: 3.5,
  /** zároveň aspoň N× medián kategorie */
  minRatio: 2,
  /** a aspoň tato částka – drobnosti nejsou zajímavé */
  minAmount: 1000,
  /** minimální počet historických transakcí v kategorii */
  minSamples: 8,
  /** historie pro srovnání */
  lookbackMonths: 12,
} as const;

export const CATEGORY_RULE = {
  lookbackMonths: 6,
  minHistoryMonths: 3,
  minRatio: 1.5,
  minDiff: 1000,
} as const;

export interface UnusualTransaction {
  tx: Transaction;
  categoryName: string;
  median: number;
  mad: number;
  z: number;
  ratio: number;
  samples: number;
  /** s čím se srovnávalo: vlastní kategorie, nebo všechny výdaje (když kategorie nemá dost historie) */
  comparedTo: "category" | "all";
}

export interface UnusualCategoryMonth {
  month: string;
  categoryId: string;
  categoryName: string;
  color: string;
  total: number;
  average: number;
  ratio: number;
  history: { month: string; total: number }[];
}

export function findUnusualTransactions(txs: Transaction[], categories: Category[], months: string[]): UnusualTransaction[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const monthSet = new Set(months);
  const out: UnusualTransaction[] = [];
  const expenses = txs.filter((t) => t.type === "expense");

  for (const tx of expenses) {
    const m = monthOfDate(tx.date);
    if (!monthSet.has(m) || tx.amount < TX_RULE.minAmount) continue;
    const from = addMonths(m, -TX_RULE.lookbackMonths);
    // Historie = předchozích 12 měsíců bez aktuálního (anomálie se nesmí „naředit“ sama sebou).
    // Primárně stejná kategorie; pokud jich je málo, všechny výdaje.
    const window = expenses.filter((t) => {
      const tm = monthOfDate(t.date);
      return tm >= from && tm < m;
    });
    let comparedTo: UnusualTransaction["comparedTo"] = "category";
    let history = window.filter((t) => t.categoryId === tx.categoryId).map((t) => t.amount);
    if (history.length < TX_RULE.minSamples) {
      comparedTo = "all";
      history = window.map((t) => t.amount);
    }
    if (history.length < TX_RULE.minSamples) continue;
    const med = median(history);
    const mad = median(history.map((a) => Math.abs(a - med))) * 1.4826;
    const z = mad > 0 ? (tx.amount - med) / mad : tx.amount > med ? Infinity : 0;
    const ratio = med > 0 ? tx.amount / med : Infinity;
    if (z >= TX_RULE.minZ && ratio >= TX_RULE.minRatio) {
      out.push({
        tx,
        categoryName: (tx.categoryId && byId.get(tx.categoryId)?.name) || "Bez kategorie",
        median: med,
        mad,
        z,
        ratio,
        samples: history.length,
        comparedTo,
      });
    }
  }
  return out.sort((a, b) => b.tx.date.localeCompare(a.tx.date));
}

export function findUnusualCategoryMonths(txs: Transaction[], categories: Category[], months: string[]): UnusualCategoryMonth[] {
  const grouped = groupByMonth(txs);
  const out: UnusualCategoryMonth[] = [];
  for (const month of months) {
    const current = grouped.get(month);
    if (!current) continue;
    const histMonths = monthRange(addMonths(month, -1), CATEGORY_RULE.lookbackMonths).filter((m) => grouped.has(m));
    if (histMonths.length < CATEGORY_RULE.minHistoryMonths) continue;
    const histByMonth = histMonths.map((m) => ({ month: m, cats: expensesByCategory(grouped.get(m)!, categories) }));
    for (const c of expensesByCategory(current, categories)) {
      if (!c.categoryId) continue;
      const history = histByMonth.map((h) => ({ month: h.month, total: h.cats.find((x) => x.categoryId === c.categoryId)?.total ?? 0 }));
      const avg = mean(history.map((h) => h.total));
      if (avg <= 0) continue;
      const ratio = c.total / avg;
      if (ratio >= CATEGORY_RULE.minRatio && c.total - avg >= CATEGORY_RULE.minDiff) {
        out.push({ month, categoryId: c.categoryId, categoryName: c.name, color: c.color, total: c.total, average: avg, ratio, history });
      }
    }
  }
  return out.sort((a, b) => b.month.localeCompare(a.month) || b.ratio - a.ratio);
}
