import type { Table } from "dexie";
import { ZodError } from "zod";
import { db } from "@/db/db";
import { settingsRepo } from "@/db/repositories";
import { nowIso } from "@/lib/id";
import {
  backupSchema,
  COLLECTIONS,
  CURRENT_FORMAT_VERSION,
  envelopeSchema,
  FORMAT_ID,
  keyOf,
  type Backup,
  type CollectionName,
} from "./format";
import { migrate } from "./migrations";

/* -------------------------------- Export -------------------------------- */

export async function buildBackup(): Promise<Backup> {
  return db.transaction("r", [db.categories, db.accounts, db.transactions, db.monthStatus, db.budgets, db.recurring, db.scenarios, db.settings], async () => ({
    format: FORMAT_ID,
    version: CURRENT_FORMAT_VERSION,
    exportedAt: nowIso(),
    settings: await settingsRepo.get(),
    categories: await db.categories.toArray(),
    accounts: await db.accounts.toArray(),
    transactions: await db.transactions.orderBy("date").toArray(),
    months: await db.monthStatus.toArray(),
    budgets: await db.budgets.toArray(),
    recurring: await db.recurring.toArray(),
    scenarios: await db.scenarios.toArray(),
  }));
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------ Parse + validace ------------------------------ */

export type ParseResult =
  | { ok: true; backup: Backup; migrations: string[]; sourceVersion: number }
  | { ok: false; errors: string[] };

function formatZodError(err: ZodError, max = 8): string[] {
  const out = err.issues.slice(0, max).map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));
  if (err.issues.length > max) out.push(`… a dalších ${err.issues.length - max} chyb`);
  return out;
}

/** JSON → obálka → migrace → plná validace. Nic se nezapisuje do DB. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["Soubor není platný JSON."] };
  }

  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) return { ok: false, errors: formatZodError(envelope.error) };

  let migrated;
  try {
    migrated = migrate(envelope.data);
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }

  const parsed = backupSchema.safeParse(migrated.data);
  if (!parsed.success) return { ok: false, errors: formatZodError(parsed.error) };

  const dupes = findDuplicateKeys(parsed.data);
  if (dupes.length) return { ok: false, errors: dupes };

  return { ok: true, backup: parsed.data, migrations: migrated.applied, sourceVersion: envelope.data.version };
}

function findDuplicateKeys(b: Backup): string[] {
  const errors: string[] = [];
  for (const c of COLLECTIONS) {
    const seen = new Set<string>();
    for (const item of b[c]) {
      const k = keyOf(c, item);
      if (seen.has(k)) {
        errors.push(`${c}: duplicitní identifikátor „${k}“`);
        break;
      }
      seen.add(k);
    }
  }
  return errors;
}

/* ------------------------------ Analýza konfliktů ------------------------------ */

export type ImportMode = "replace" | "merge-keep-local" | "merge-prefer-import";

export interface CollectionStats {
  incoming: number;
  /** v DB neexistuje */
  added: number;
  /** existuje a je shodné */
  identical: number;
  /** existuje se stejným klíčem, ale jiným obsahem */
  conflicts: number;
  /** transakce z banky, které už v DB jsou pod jiným id (bankProvider + externalId) */
  bankDuplicates: number;
  local: number;
}

export interface ImportPlan {
  stats: Record<CollectionName, CollectionStats>;
  warnings: string[];
  dateRange: { from: string; to: string } | null;
  conflictExamples: { collection: CollectionName; key: string; local: string; incoming: string }[];
}

/** Porovnání bez ohledu na pořadí klíčů. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

function describe(collection: CollectionName, item: Record<string, unknown>): string {
  if (collection === "transactions") return `${item.date} · ${item.description ?? "—"} · ${item.amount} ${item.currency}`;
  if (collection === "months") return `${item.month} · ${item.status}`;
  if (collection === "budgets") return `${item.categoryId} · ${item.amount}`;
  if (collection === "scenarios") return String(item.name);
  return String(item.name ?? keyOf(collection, item));
}

export async function analyzeImport(backup: Backup): Promise<ImportPlan> {
  const local = await buildBackup();
  const stats = {} as Record<CollectionName, CollectionStats>;
  const conflictExamples: ImportPlan["conflictExamples"] = [];

  const localBankKeys = new Map<string, string>();
  for (const t of local.transactions) {
    if (t.bankProvider && t.externalId) localBankKeys.set(`${t.bankProvider}|${t.externalId}`, t.id);
  }

  for (const c of COLLECTIONS) {
    const localMap = new Map<string, Record<string, unknown>>(local[c].map((x) => [keyOf(c, x), x as Record<string, unknown>]));
    const s: CollectionStats = { incoming: backup[c].length, added: 0, identical: 0, conflicts: 0, bankDuplicates: 0, local: local[c].length };
    for (const item of backup[c] as Record<string, unknown>[]) {
      const key = keyOf(c, item);
      const existing = localMap.get(key);
      if (!existing) {
        const bankKey = c === "transactions" && item.bankProvider && item.externalId ? `${item.bankProvider}|${item.externalId}` : null;
        if (bankKey && localBankKeys.has(bankKey)) s.bankDuplicates++;
        else s.added++;
      } else if (stableStringify(existing) === stableStringify(item)) {
        s.identical++;
      } else {
        s.conflicts++;
        if (conflictExamples.length < 5) {
          conflictExamples.push({ collection: c, key, local: describe(c, existing), incoming: describe(c, item) });
        }
      }
    }
    stats[c] = s;
  }

  // Referenční integrita – jen varování; UI si s chybějící kategorií/účtem poradí.
  const warnings: string[] = [];
  const catIds = new Set([...backup.categories, ...local.categories].map((c) => c.id));
  const accIds = new Set([...backup.accounts, ...local.accounts].map((a) => a.id));
  const missingCat = backup.transactions.filter((t) => t.categoryId && !catIds.has(t.categoryId)).length;
  const missingAcc = backup.transactions.filter(
    (t) => (t.accountId && !accIds.has(t.accountId)) || (t.destinationAccountId && !accIds.has(t.destinationAccountId)),
  ).length;
  if (missingCat) warnings.push(`${missingCat} transakcí odkazuje na neexistující kategorii – zobrazí se jako „Bez kategorie“.`);
  if (missingAcc) warnings.push(`${missingAcc} transakcí odkazuje na neexistující účet.`);
  const currencies = new Set(backup.transactions.map((t) => t.currency));
  if (currencies.size > 1) warnings.push(`Záloha obsahuje více měn (${[...currencies].join(", ")}). Statistiky zatím nepřepočítávají kurzy.`);

  const dates = backup.transactions.map((t) => t.date).sort();
  return {
    stats,
    warnings,
    dateRange: dates.length ? { from: dates[0]!, to: dates[dates.length - 1]! } : null,
    conflictExamples,
  };
}

/* -------------------------------- Zápis -------------------------------- */

/**
 * Zapíše ověřenou zálohu do IndexedDB v jediné transakci – buď projde celá, nebo nic.
 *  - replace:              smaže vše a nahraje zálohu
 *  - merge-keep-local:     přidá nové záznamy, při konfliktu ponechá lokální verzi
 *  - merge-prefer-import:  přidá nové záznamy, při konfliktu přepíše lokální verzí ze zálohy
 * Bankovní transakce, které už v DB jsou (stejný bankProvider + externalId), se nikdy nezdvojí.
 */
export async function applyImport(backup: Backup, mode: ImportMode): Promise<void> {
  const tables = [db.categories, db.accounts, db.transactions, db.monthStatus, db.budgets, db.recurring, db.scenarios, db.settings];
  await db.transaction("rw", tables, async () => {
    if (mode === "replace") {
      await Promise.all(tables.map((t) => t.clear()));
      await db.settings.put({ key: "app", ...backup.settings });
      await db.categories.bulkAdd(backup.categories);
      await db.accounts.bulkAdd(backup.accounts);
      await db.transactions.bulkAdd(backup.transactions);
      await db.monthStatus.bulkAdd(backup.months);
      await db.budgets.bulkAdd(backup.budgets);
      await db.recurring.bulkAdd(backup.recurring);
      await db.scenarios.bulkAdd(backup.scenarios);
      return;
    }

    const preferImport = mode === "merge-prefer-import";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function merge<T>(table: Table<T, string, any>, items: T[], key: (x: T) => string) {
      const existing = await table.bulkGet(items.map(key));
      const toWrite = items.filter((_, i) => preferImport || existing[i] === undefined);
      if (toWrite.length) await table.bulkPut(toWrite);
    }

    await merge(db.categories, backup.categories, (x) => x.id);
    await merge(db.accounts, backup.accounts, (x) => x.id);
    await merge(db.monthStatus, backup.months, (x) => x.month);
    await merge(db.recurring, backup.recurring, (x) => x.id);
    await merge(db.scenarios, backup.scenarios, (x) => x.id);

    // Bankovní deduplikace
    const txs = [];
    for (const t of backup.transactions) {
      if (t.bankProvider && t.externalId) {
        const dup = await db.transactions.where("[bankProvider+externalId]").equals([t.bankProvider, t.externalId]).first();
        if (dup && dup.id !== t.id) continue;
      }
      txs.push(t);
    }
    await merge(db.transactions, txs, (x) => x.id);

    // Rozpočty jsou unikátní podle kategorie
    for (const b of backup.budgets) {
      const local = await db.budgets.where("categoryId").equals(b.categoryId).first();
      if (!local) await db.budgets.put(b);
      else if (preferImport) {
        await db.budgets.delete(local.id);
        await db.budgets.put(b);
      }
    }
  });
}

/** Úplné smazání všech dat a návrat do výchozího stavu. */
export async function wipeAllData(): Promise<void> {
  await db.delete();
  await db.open();
}
