import type { Budget, Category, Transaction } from "./schema";
import { monthBounds, monthOfDate, parseMonthKey } from "./months";

/** Minimální počet uplynulých dní, od kterého má smysl odhadovat tempo čerpání. */
export const MIN_DAYS_FOR_PROJECTION = 5;

export interface BudgetStatus {
  budget: Budget;
  category: Category | undefined;
  spent: number;
  /** spent / budget */
  ratio: number;
  remaining: number;
  daysInMonth: number;
  /** uplynulé dny měsíce (u minulého měsíce = celý měsíc) */
  daysElapsed: number;
  /** lineární odhad čerpání na konci měsíce; null pokud nelze odhadnout */
  projected: number | null;
  /** datum (YYYY-MM-DD), kdy byl rozpočet skutečně překročen */
  exceededOn: string | null;
  /** odhadované datum překročení při současném tempu; null pokud se nepředpokládá */
  projectedExceedOn: string | null;
  state: "ok" | "warning" | "exceeded";
}

/**
 * Stav rozpočtu pro měsíc. `today` (YYYY-MM-DD) určuje, kolik dní už uplynulo –
 * u minulých měsíců se počítá celý měsíc a nic se neodhaduje.
 */
export function budgetStatus(budget: Budget, category: Category | undefined, monthTxs: Transaction[], month: string, today: string): BudgetStatus {
  const { year, month: m } = parseMonthKey(month);
  const daysInMonth = new Date(year, m, 0).getDate();
  const todayMonth = monthOfDate(today);
  const daysElapsed = month < todayMonth ? daysInMonth : month > todayMonth ? 0 : Number(today.slice(8, 10));

  const relevant = monthTxs
    .filter((t) => t.type === "expense" && t.categoryId === budget.categoryId)
    .sort((a, b) => a.date.localeCompare(b.date));
  let cumulative = 0;
  let exceededOn: string | null = null;
  for (const t of relevant) {
    cumulative += t.amount;
    if (!exceededOn && cumulative > budget.amount) exceededOn = t.date;
  }
  const spent = Math.round(cumulative * 100) / 100;

  let projected: number | null = null;
  let projectedExceedOn: string | null = null;
  const inProgress = daysElapsed > 0 && daysElapsed < daysInMonth;
  if (inProgress && daysElapsed >= MIN_DAYS_FOR_PROJECTION && spent > 0) {
    const pace = spent / daysElapsed;
    projected = pace * daysInMonth;
    if (!exceededOn && projected > budget.amount) {
      const day = Math.min(daysInMonth, Math.max(daysElapsed + 1, Math.ceil(budget.amount / pace)));
      projectedExceedOn = `${month}-${String(day).padStart(2, "0")}`;
    }
  }

  const ratio = spent / budget.amount;
  return {
    budget,
    category,
    spent,
    ratio,
    remaining: budget.amount - spent,
    daysInMonth,
    daysElapsed,
    projected,
    exceededOn,
    projectedExceedOn,
    state: exceededOn ? "exceeded" : projectedExceedOn || ratio >= 0.9 ? "warning" : "ok",
  };
}

export function budgetStatuses(budgets: Budget[], categories: Category[], monthTxs: Transaction[], month: string, today: string): BudgetStatus[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return budgets
    .map((b) => budgetStatus(b, byId.get(b.categoryId), monthTxs, month, today))
    .sort((a, b) => b.ratio - a.ratio);
}

export const budgetRange = (month: string) => monthBounds(month);
