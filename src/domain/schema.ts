import { z } from "zod";

// České chybové hlášky validace (formuláře i JSON import)
z.config(z.locales.cs());

/**
 * Doménové entity. Zod schémata jsou zdrojem pravdy – typy se z nich odvozují,
 * aby validace (formuláře, budoucí JSON import) a typy nemohly utéct od sebe.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum musí být ve formátu YYYY-MM-DD");
const isoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Měsíc musí být ve formátu YYYY-MM");
const currency = z.string().length(3);

export const transactionTypeSchema = z.enum(["income", "expense", "transfer"]);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const transactionSourceSchema = z.enum(["manual", "bank"]);
export type TransactionSource = z.infer<typeof transactionSourceSchema>;

export const transactionSchema = z
  .object({
    id: z.string().min(1),
    type: transactionTypeSchema,
    /** Vždy kladná částka; směr určuje `type`. */
    amount: z.number().positive().finite(),
    currency,
    date: isoDate,
    accountId: z.string().optional(),
    destinationAccountId: z.string().optional(),
    categoryId: z.string().optional(),
    description: z.string().optional(),
    source: transactionSourceSchema,
    externalId: z.string().optional(),
    bankProvider: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .superRefine((t, ctx) => {
    if (t.type === "transfer") {
      if (!t.accountId || !t.destinationAccountId) {
        ctx.addIssue({ code: "custom", message: "Převod vyžaduje zdrojový i cílový účet", path: ["destinationAccountId"] });
      } else if (t.accountId === t.destinationAccountId) {
        ctx.addIssue({ code: "custom", message: "Zdrojový a cílový účet se musí lišit", path: ["destinationAccountId"] });
      }
    }
  });
export type Transaction = z.infer<typeof transactionSchema>;

export const categoryTypeSchema = z.enum(["income", "expense", "both"]);
export type CategoryType = z.infer<typeof categoryTypeSchema>;

export const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Název je povinný"),
  type: categoryTypeSchema,
  icon: z.string().optional(),
  /** Rozšíření nad spec: barva pro grafy. Nepovinné, aby šlo zpětně kompatibilně. */
  color: z.string().optional(),
});
export type Category = z.infer<typeof categorySchema>;

export const accountTypeSchema = z.enum(["checking", "savings", "cash", "credit", "investment", "other"]);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Název je povinný"),
  type: accountTypeSchema,
  currency,
  /** Zůstatek k datu `initialBalanceDate` (nebo před první transakcí, pokud datum chybí). */
  initialBalance: z.number().finite().optional(),
  /**
   * Den, ke kterému platí počáteční zůstatek (ráno, před transakcemi toho dne).
   * Transakce před tímto datem zůstatek „zpětně“ dopočítávají, takže lze zadat dnešní zůstatek
   * a přitom mít v aplikaci i starší historii.
   */
  initialBalanceDate: isoDate.optional(),
  /** Archivovaný účet se nenabízí u nových transakcí a nepočítá se do rezervy. */
  archived: z.boolean().optional(),
});
export type Account = z.infer<typeof accountSchema>;

export const monthStatusSchema = z.object({
  month: isoMonth,
  status: z.enum(["open", "completed"]),
  note: z.string().optional(),
});
export type MonthStatus = z.infer<typeof monthStatusSchema>;

export const settingsSchema = z.object({
  baseCurrency: currency,
  locale: z.string(),
  /** čas posledního JSON exportu – pro připomínku zálohy */
  lastExportAt: z.string().optional(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = { baseCurrency: "CZK", locale: "cs-CZ" };

/* ------------------------------- Fáze 2 ------------------------------- */

/** Měsíční rozpočet pro jednu výdajovou kategorii. */
export const budgetSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1, "Vyber kategorii"),
  amount: z.number().positive("Rozpočet musí být kladný").finite(),
  currency,
});
export type Budget = z.infer<typeof budgetSchema>;

export const recurringFrequencySchema = z.enum(["weekly", "monthly", "quarterly", "yearly"]);
export type RecurringFrequency = z.infer<typeof recurringFrequencySchema>;

/** Ručně evidovaná pravidelná platba. */
export const recurringPaymentSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Název je povinný"),
  amount: z.number().positive("Částka musí být kladná").finite(),
  currency,
  frequency: recurringFrequencySchema,
  categoryId: z.string().optional(),
  accountId: z.string().optional(),
  /**
   * Text, podle kterého se platba páruje s transakcemi (hledá se v popisu,
   * bez ohledu na velikost písmen). Umožňuje zjistit poslední platbu a změny ceny.
   */
  match: z.string().optional(),
  active: z.boolean(),
  note: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RecurringPayment = z.infer<typeof recurringPaymentSchema>;

/* ------------------------------- Fáze 3 ------------------------------- */

const adjustmentMode = z.enum(["amount", "percent"]);

/** Jedna změna ve scénáři „co kdyby“. Částky jsou měsíční. */
export const scenarioAdjustmentSchema = z.discriminatedUnion("kind", [
  /** Každý měsíc ušetřit navíc (utratit méně). */
  z.object({ kind: z.literal("savings"), amount: z.number().finite() }),
  /** Změna příjmu o částku nebo procento. */
  z.object({ kind: z.literal("income"), mode: adjustmentMode, value: z.number().finite() }),
  /** Změna výdajů kategorie o částku nebo procento (např. zvýšení nájmu). */
  z.object({ kind: z.literal("category"), categoryId: z.string().min(1), mode: adjustmentMode, value: z.number().finite() }),
  /** Výdaje kategorie přesně na nové úrovni rozpočtu. */
  z.object({ kind: z.literal("budget"), categoryId: z.string().min(1), amount: z.number().nonnegative().finite() }),
  /** Pravidelné investování s očekávaným ročním zhodnocením (v %). */
  z.object({ kind: z.literal("investment"), amount: z.number().nonnegative().finite(), annualReturn: z.number().min(-50).max(50) }),
]);
export type ScenarioAdjustment = z.infer<typeof scenarioAdjustmentSchema>;

export const scenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Název je povinný"),
  adjustments: z.array(scenarioAdjustmentSchema),
  horizonMonths: z.number().int().min(1).max(600),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Scenario = z.infer<typeof scenarioSchema>;
