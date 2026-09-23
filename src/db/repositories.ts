import { db } from "./db";
import { newId, nowIso } from "@/lib/id";
import {
  accountSchema,
  budgetSchema,
  categorySchema,
  recurringPaymentSchema,
  scenarioSchema,
  monthStatusSchema,
  transactionSchema,
  type Account,
  type Budget,
  type Category,
  type RecurringPayment,
  type Scenario,
  type MonthStatus,
  type Settings,
  type Transaction,
} from "@/domain/schema";
import { DEFAULT_SETTINGS } from "@/domain/schema";

/**
 * Jediné místo, kde UI zapisuje do databáze. Každý zápis prochází Zod validací,
 * takže do IndexedDB se nikdy nedostanou nevalidní data.
 */

export type TransactionInput = Omit<Transaction, "id" | "createdAt" | "updatedAt" | "source"> &
  Partial<Pick<Transaction, "source">>;

/** Odstraní pole, která pro daný typ transakce nedávají smysl. */
function normalizeTransaction(t: Transaction): Transaction {
  const out: Transaction = { ...t, amount: Math.round(t.amount * 100) / 100 };
  if (out.type === "transfer") {
    delete out.categoryId;
  } else {
    delete out.destinationAccountId;
  }
  for (const key of Object.keys(out) as (keyof Transaction)[]) {
    if (out[key] === "" || out[key] === undefined) delete out[key];
  }
  return out;
}

export const transactionsRepo = {
  async create(input: TransactionInput): Promise<Transaction> {
    const now = nowIso();
    const tx = transactionSchema.parse(
      normalizeTransaction({ source: "manual", ...input, id: newId(), createdAt: now, updatedAt: now }),
    );
    await db.transactions.add(tx);
    return tx;
  },

  async update(id: string, input: TransactionInput): Promise<Transaction> {
    const existing = await db.transactions.get(id);
    if (!existing) throw new Error(`Transakce ${id} neexistuje`);
    const tx = transactionSchema.parse(
      normalizeTransaction({
        ...input,
        source: existing.source,
        externalId: existing.externalId,
        bankProvider: existing.bankProvider,
        id,
        createdAt: existing.createdAt,
        updatedAt: nowIso(),
      }),
    );
    await db.transactions.put(tx);
    return tx;
  },

  remove: (id: string) => db.transactions.delete(id),
};

export const categoriesRepo = {
  async save(input: Omit<Category, "id"> & { id?: string }): Promise<Category> {
    const category = categorySchema.parse({ ...input, id: input.id ?? newId() });
    await db.categories.put(category);
    return category;
  },

  usageCount: (id: string) => db.transactions.where("categoryId").equals(id).count(),

  /** Smaže kategorii; transakce a pravidelné platby zůstanou bez kategorie, rozpočet se smaže. */
  async remove(id: string): Promise<void> {
    await db.transaction("rw", [db.categories, db.transactions, db.budgets, db.recurring], async () => {
      await db.budgets.where("categoryId").equals(id).delete();
      await db.recurring
        .filter((r) => r.categoryId === id)
        .modify((r) => {
          delete r.categoryId;
        });
      await db.transactions
        .where("categoryId")
        .equals(id)
        .modify((t) => {
          delete t.categoryId;
          t.updatedAt = nowIso();
        });
      await db.categories.delete(id);
    });
  },
};

export const accountsRepo = {
  async save(input: Omit<Account, "id"> & { id?: string }): Promise<Account> {
    const account = accountSchema.parse({ ...input, id: input.id ?? newId() });
    await db.accounts.put(account);
    return account;
  },

  async usageCount(id: string): Promise<number> {
    const [a, b] = await Promise.all([
      db.transactions.where("accountId").equals(id).count(),
      db.transactions.where("destinationAccountId").equals(id).count(),
    ]);
    return a + b;
  },

  /** Účet s transakcemi nelze smazat – převody by ztratily smysl. */
  async remove(id: string): Promise<void> {
    if ((await accountsRepo.usageCount(id)) > 0) {
      throw new Error("Účet má přiřazené transakce, nelze jej smazat.");
    }
    await db.accounts.delete(id);
  },
};

export const monthStatusRepo = {
  async set(status: MonthStatus): Promise<void> {
    await db.monthStatus.put(monthStatusSchema.parse(status));
  },
};

export const settingsRepo = {
  async get(): Promise<Settings> {
    const row = await db.settings.get("app");
    if (!row) return DEFAULT_SETTINGS;
    const { key: _key, ...settings } = row;
    return settings;
  },

  async update(patch: Partial<Settings>): Promise<void> {
    const current = await settingsRepo.get();
    await db.settings.put({ key: "app", ...current, ...patch });
  },
};

export const budgetsRepo = {
  /** Jedna kategorie = jeden rozpočet; uložení pro existující kategorii jej přepíše. */
  async save(input: Omit<Budget, "id"> & { id?: string }): Promise<Budget> {
    const existing = await db.budgets.where("categoryId").equals(input.categoryId).first();
    const budget = budgetSchema.parse({ ...input, id: input.id ?? existing?.id ?? newId() });
    await db.transaction("rw", db.budgets, async () => {
      if (existing && existing.id !== budget.id) await db.budgets.delete(existing.id);
      await db.budgets.put(budget);
    });
    return budget;
  },
  remove: (id: string) => db.budgets.delete(id),
};

export type RecurringInput = Omit<RecurringPayment, "id" | "createdAt" | "updatedAt">;

export const recurringRepo = {
  async save(input: RecurringInput, id?: string): Promise<RecurringPayment> {
    const existing = id ? await db.recurring.get(id) : undefined;
    const now = nowIso();
    const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== "" && v !== undefined));
    const payment = recurringPaymentSchema.parse({
      ...clean,
      id: existing?.id ?? newId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    await db.recurring.put(payment);
    return payment;
  },
  remove: (id: string) => db.recurring.delete(id),
};

export const scenariosRepo = {
  async save(input: Omit<Scenario, "id" | "createdAt" | "updatedAt">, id?: string): Promise<Scenario> {
    const existing = id ? await db.scenarios.get(id) : undefined;
    const now = nowIso();
    const scenario = scenarioSchema.parse({ ...input, id: existing?.id ?? newId(), createdAt: existing?.createdAt ?? now, updatedAt: now });
    await db.scenarios.put(scenario);
    return scenario;
  },
  remove: (id: string) => db.scenarios.delete(id),
};
