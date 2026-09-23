import { z } from "zod";
import {
  accountSchema,
  budgetSchema,
  categorySchema,
  DEFAULT_SETTINGS,
  monthStatusSchema,
  recurringPaymentSchema,
  scenarioSchema,
  settingsSchema,
  transactionSchema,
} from "@/domain/schema";

/**
 * Formát zálohy (JSON export). Verze formátu je nezávislá na verzi IndexedDB schématu.
 *
 * Při změně formátu:
 *  1. zvýšit CURRENT_FORMAT_VERSION,
 *  2. přidat migraci z předchozí verze do `migrations.ts`,
 *  3. upravit `backupSchema` na novou podobu.
 * Staré zálohy pak projdou řetězem v1 → v2 → … → aktuální.
 */
export const FORMAT_ID = "finance-app";
export const CURRENT_FORMAT_VERSION = 1;

/** Obálka – kontroluje se jako první, ještě před migrací. */
export const envelopeSchema = z.looseObject({
  format: z.literal(FORMAT_ID, { error: "Soubor není záloha této aplikace (chybí format: \"finance-app\")" }),
  version: z.number({ error: "Záloha neobsahuje číslo verze" }).int().positive(),
});

/** Aktuální podoba zálohy. Nová nepovinná pole lze přidávat bez zvýšení verze. */
export const backupSchema = z.object({
  format: z.literal(FORMAT_ID),
  version: z.literal(CURRENT_FORMAT_VERSION),
  exportedAt: z.string(),
  settings: settingsSchema.partial().default({}).transform((s) => ({ ...DEFAULT_SETTINGS, ...s })),
  categories: z.array(categorySchema).default([]),
  accounts: z.array(accountSchema).default([]),
  transactions: z.array(transactionSchema).default([]),
  months: z.array(monthStatusSchema).default([]),
  budgets: z.array(budgetSchema).default([]),
  recurring: z.array(recurringPaymentSchema).default([]),
  /** od Fáze 3; nepovinné, starší zálohy ho nemají */
  scenarios: z.array(scenarioSchema).default([]),
});
export type Backup = z.infer<typeof backupSchema>;

/** Kolekce zálohy, které se ukládají do DB (bez metadat a nastavení). */
export const COLLECTIONS = ["categories", "accounts", "transactions", "months", "budgets", "recurring", "scenarios"] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export const COLLECTION_LABEL: Record<CollectionName, string> = {
  categories: "Kategorie",
  accounts: "Účty",
  transactions: "Transakce",
  months: "Stavy měsíců",
  budgets: "Rozpočty",
  recurring: "Pravidelné platby",
  scenarios: "Scénáře",
};

/** Primární klíč každé kolekce. */
export const keyOf = (collection: CollectionName, item: Record<string, unknown>): string =>
  String(collection === "months" ? item.month : item.id);
