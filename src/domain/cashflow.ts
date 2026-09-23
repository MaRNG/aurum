import type { Account, Category, Transaction } from "./schema";
import { groupByMonth, summarize, type MonthSummary } from "./aggregate";

/**
 * Cashflow = příjmy − výdaje. Převody mezi vlastními účty do cashflow nevstupují
 * (peníze neopouští domácnost), ale ukazují se v pohybech jednotlivých účtů.
 */

export interface CashflowPoint extends MonthSummary {
  /** kumulativní cashflow od začátku zobrazeného období */
  cumulative: number;
}

export function cashflowSeries(months: string[], txs: Transaction[]): CashflowPoint[] {
  const grouped = groupByMonth(txs);
  let cumulative = 0;
  return months.map((m) => {
    const s = summarize(m, grouped.get(m) ?? []);
    cumulative += s.net;
    return { ...s, cumulative: Math.round(cumulative * 100) / 100 };
  });
}

export interface StatementLine {
  categoryId: string | null;
  name: string;
  color: string;
  total: number;
}

export interface CashflowStatement {
  income: StatementLine[];
  expense: StatementLine[];
  totalIncome: number;
  totalExpense: number;
  cashflow: number;
  /** objem převodů v měsíci – informativně, do cashflow se nepočítá */
  transfers: number;
}

function byCategory(txs: Transaction[], type: "income" | "expense", categories: Map<string, Category>): StatementLine[] {
  const totals = new Map<string | null, number>();
  for (const t of txs) {
    if (t.type !== type) continue;
    const key = t.categoryId && categories.has(t.categoryId) ? t.categoryId : null;
    totals.set(key, (totals.get(key) ?? 0) + t.amount);
  }
  return [...totals.entries()]
    .map(([id, total]) => {
      const c = id ? categories.get(id) : undefined;
      return { categoryId: id, name: c?.name ?? "Bez kategorie", color: c?.color ?? "#cbd5e1", total: Math.round(total * 100) / 100 };
    })
    .sort((a, b) => b.total - a.total);
}

export function cashflowStatement(monthTxs: Transaction[], categories: Category[]): CashflowStatement {
  const map = new Map(categories.map((c) => [c.id, c]));
  const s = summarize("", monthTxs);
  return {
    income: byCategory(monthTxs, "income", map),
    expense: byCategory(monthTxs, "expense", map),
    totalIncome: s.income,
    totalExpense: s.expense,
    cashflow: s.net,
    transfers: monthTxs.filter((t) => t.type === "transfer").reduce((a, t) => a + t.amount, 0),
  };
}

export interface AccountFlow {
  account: Account | null;
  income: number;
  expense: number;
  transfersIn: number;
  transfersOut: number;
  /** změna zůstatku = příjmy − výdaje + převody dovnitř − převody ven */
  net: number;
}

/** Pohyby po účtech. Transakce bez účtu se sečtou do řádku `account: null`. */
export function accountFlows(monthTxs: Transaction[], accounts: Account[]): AccountFlow[] {
  const flows = new Map<string | null, AccountFlow>();
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const get = (id: string | undefined) => {
    const key = id && byId.has(id) ? id : null;
    let f = flows.get(key);
    if (!f) {
      f = { account: key ? byId.get(key)! : null, income: 0, expense: 0, transfersIn: 0, transfersOut: 0, net: 0 };
      flows.set(key, f);
    }
    return f;
  };
  for (const t of monthTxs) {
    if (t.type === "income") get(t.accountId).income += t.amount;
    else if (t.type === "expense") get(t.accountId).expense += t.amount;
    else {
      get(t.accountId).transfersOut += t.amount;
      get(t.destinationAccountId).transfersIn += t.amount;
    }
  }
  for (const f of flows.values()) f.net = Math.round((f.income - f.expense + f.transfersIn - f.transfersOut) * 100) / 100;
  return [...flows.values()].sort((a, b) => (a.account?.name ?? "~").localeCompare(b.account?.name ?? "~", "cs"));
}
