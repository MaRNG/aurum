import { displayColor } from "@/domain/defaults";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { DEFAULT_SETTINGS, type Account, type Budget, type Category, type RecurringPayment, type Scenario, type MonthStatus, type Settings, type Transaction } from "@/domain/schema";

/** Reaktivní dotazy – komponenty se automaticky překreslí při změně dat v IndexedDB. */

const EMPTY: never[] = [];

export function useCategories(): Category[] {
  return useLiveQuery(async () => (await db.categories.toArray()).map((c) => ({ ...c, color: displayColor(c.color) })), [], EMPTY);
}

export function useAccounts(): Account[] {
  return useLiveQuery(() => db.accounts.toArray(), [], EMPTY);
}

export function useSettings(): Settings {
  return useLiveQuery(async () => (await db.settings.get("app")) ?? DEFAULT_SETTINGS, [], DEFAULT_SETTINGS);
}

export function useMonthStatuses(): MonthStatus[] {
  return useLiveQuery(() => db.monthStatus.toArray(), [], EMPTY);
}

/** Transakce v uzavřeném rozsahu dat (YYYY-MM-DD). `undefined` = ještě se načítá. */
export function useTransactionsBetween(from: string, to: string): Transaction[] | undefined {
  return useLiveQuery(() => db.transactions.where("date").between(from, to, true, true).toArray(), [from, to]);
}

export function useAllTransactions(): Transaction[] | undefined {
  return useLiveQuery(() => db.transactions.orderBy("date").toArray(), []);
}

export function useFirstTransactionDate(): string | null | undefined {
  return useLiveQuery(async () => (await db.transactions.orderBy("date").first())?.date ?? null, []);
}

export function useBudgets(): Budget[] {
  return useLiveQuery(() => db.budgets.toArray(), [], EMPTY);
}

export function useRecurring(): RecurringPayment[] {
  return useLiveQuery(() => db.recurring.toArray(), [], EMPTY);
}

export function useScenarios(): Scenario[] {
  return useLiveQuery(() => db.scenarios.toArray(), [], EMPTY);
}
