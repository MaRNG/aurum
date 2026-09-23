import Dexie, { type EntityTable } from "dexie";
import type { Account, Budget, Category, MonthStatus, RecurringPayment, Scenario, Settings, Transaction } from "@/domain/schema";
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from "@/domain/defaults";
import { DEFAULT_SETTINGS } from "@/domain/schema";

export interface SettingsRow extends Settings {
  key: "app";
}

/**
 * IndexedDB je primární úložiště. Změny schématu vždy přes nové `this.version(n)`
 * – nikdy neupravovat starší verze, Dexie je potřebuje pro upgrade existujících dat.
 */
export class FinanceDB extends Dexie {
  transactions!: EntityTable<Transaction, "id">;
  categories!: EntityTable<Category, "id">;
  accounts!: EntityTable<Account, "id">;
  monthStatus!: EntityTable<MonthStatus, "month">;
  settings!: EntityTable<SettingsRow, "key">;
  budgets!: EntityTable<Budget, "id">;
  recurring!: EntityTable<RecurringPayment, "id">;
  scenarios!: EntityTable<Scenario, "id">;

  constructor() {
    super("finance-app");
    this.version(1).stores({
      // Indexy pouze pro pole, podle kterých se dotazuje. [bankProvider+externalId] slouží budoucí deduplikaci bankovních importů.
      transactions: "id, date, type, categoryId, accountId, destinationAccountId, [bankProvider+externalId]",
      categories: "id, type",
      accounts: "id",
      monthStatus: "month",
      settings: "key",
    });

    this.version(2).stores({
      budgets: "id, &categoryId",
      recurring: "id, active",
    });

    this.version(3).stores({
      scenarios: "id",
    });

    this.on("populate", (tx) => {
      tx.table("categories").bulkAdd(DEFAULT_CATEGORIES);
      tx.table("accounts").bulkAdd(DEFAULT_ACCOUNTS);
      tx.table("settings").add({ key: "app", ...DEFAULT_SETTINGS });
    });
  }
}

export const db = new FinanceDB();
