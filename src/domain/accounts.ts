import type { Account, AccountType, Transaction } from "./schema";
import { monthBounds } from "./months";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: "Běžný účet",
  savings: "Spořicí účet",
  cash: "Hotovost",
  credit: "Kreditní karta",
  investment: "Investiční účet",
  other: "Jiný",
};

/** Typy, které se počítají do likvidních prostředků (rezervy). */
export const LIQUID_TYPES: AccountType[] = ["checking", "savings", "cash"];

/**
 * Vliv transakce na zůstatek účtu:
 * příjem +, výdaj −, převod − na zdrojovém a + na cílovém účtu.
 */
export function txDelta(tx: Transaction, accountId: string): number {
  let d = 0;
  if (tx.accountId === accountId) d += tx.type === "income" ? tx.amount : -tx.amount;
  if (tx.type === "transfer" && tx.destinationAccountId === accountId) d += tx.amount;
  return d;
}

export const touchesAccount = (tx: Transaction, accountId: string): boolean =>
  tx.accountId === accountId || (tx.type === "transfer" && tx.destinationAccountId === accountId);

/** Je zůstatek účtu známý (uživatel zadal počáteční zůstatek)? */
export const hasKnownBalance = (a: Account): boolean => a.initialBalance !== undefined;

/**
 * Zůstatek na konci dne `atDate` (včetně). Bez data = aktuální zůstatek (všechny transakce).
 *
 *   zůstatek(t) = počáteční + Σ transakcí v [datum počátku, t] − Σ transakcí v (t, datum počátku)
 *
 * Bez `initialBalanceDate` platí počáteční zůstatek před všemi transakcemi.
 */
export function accountBalance(account: Account, txs: Transaction[], atDate?: string): number {
  const start = account.initialBalanceDate ?? "";
  let balance = account.initialBalance ?? 0;
  for (const t of txs) {
    if (!touchesAccount(t, account.id)) continue;
    const d = txDelta(t, account.id);
    if (t.date >= start) {
      if (!atDate || t.date <= atDate) balance += d;
    } else if (atDate && t.date > atDate) {
      // transakce mezi `atDate` a datem počátku: zpětný dopočet
      balance -= d;
    }
  }
  return Math.round(balance * 100) / 100;
}

export interface BalancePoint {
  month: string;
  balance: number;
}

/** Zůstatek ke konci každého měsíce. */
export function balanceHistory(account: Account, txs: Transaction[], months: string[]): BalancePoint[] {
  return months.map((m) => ({ month: m, balance: accountBalance(account, txs, monthBounds(m).to) }));
}

export interface ReserveResult {
  /** účty zahrnuté do likvidních prostředků */
  included: { account: Account; balance: number }[];
  /** dluh z kreditních karet (záporný zůstatek), odečítá se */
  debt: { account: Account; balance: number }[];
  /** účty vynechané a proč */
  excluded: { account: Account; reason: string }[];
  liquid: number;
  avgMonthlyExpense: number;
  /** počet měsíců, na které rezerva vystačí; null bez výdajů nebo bez známých zůstatků */
  months: number | null;
}

/**
 * Rezerva = (likvidní prostředky − dluh na kreditních kartách) / průměrné měsíční výdaje.
 * Investiční účty se nepočítají – nejsou okamžitě dostupné a jejich hodnota kolísá.
 */
export function computeReserve(
  accounts: Account[],
  txs: Transaction[],
  avgMonthlyExpense: number,
  baseCurrency: string,
): ReserveResult {
  const included: ReserveResult["included"] = [];
  const debt: ReserveResult["debt"] = [];
  const excluded: ReserveResult["excluded"] = [];
  for (const a of accounts) {
    if (a.archived) excluded.push({ account: a, reason: "archivovaný" });
    else if (!hasKnownBalance(a)) excluded.push({ account: a, reason: "nezadaný počáteční zůstatek" });
    else if (a.currency !== baseCurrency) excluded.push({ account: a, reason: `jiná měna (${a.currency})` });
    else if (a.type === "credit") {
      const b = accountBalance(a, txs);
      if (b < 0) debt.push({ account: a, balance: b });
    } else if (LIQUID_TYPES.includes(a.type)) included.push({ account: a, balance: accountBalance(a, txs) });
    else excluded.push({ account: a, reason: a.type === "investment" ? "investice nejsou likvidní" : "typ „jiný“" });
  }
  const liquid = included.reduce((s, x) => s + x.balance, 0) + debt.reduce((s, x) => s + x.balance, 0);
  return {
    included,
    debt,
    excluded,
    liquid,
    avgMonthlyExpense,
    months: included.length && avgMonthlyExpense > 0 ? liquid / avgMonthlyExpense : null,
  };
}
