import { db } from "@/db/db";
import { newId, nowIso } from "@/lib/id";
import { accountSchema, transactionSchema, type Account, type Transaction } from "@/domain/schema";
import { BankParseError, parseBankStatement, type BankImport, type BankTransactionDraft } from "@/integrations/bank";

/**
 * Import bankovního výpisu (CSV). Stejně jako JSON záloha:
 * soubor → parsování → náhled (co je nové, co už v DB je) → potvrzení → zápis v jedné transakci.
 *
 * Deduplikace stojí na ID odvozeném z hashe řádku: transakce, která už v DB je,
 * se nikdy nepřepíše – ruční úpravy (kategorie, popis, typ…) zůstanou zachované.
 */

export type BankParseResult = { ok: true; data: BankImport } | { ok: false; errors: string[] };

export async function parseBankFile(bytes: ArrayBuffer): Promise<BankParseResult> {
  try {
    const data = await parseBankStatement(bytes);
    if (data.transactions.length === 0) return { ok: false, errors: ["Výpis neobsahuje žádné transakce."] };
    return { ok: true, data };
  } catch (e) {
    if (e instanceof BankParseError) return { ok: false, errors: [e.message] };
    throw e;
  }
}

export interface BankImportPlan {
  /** transakce, které v DB ještě nejsou */
  fresh: BankTransactionDraft[];
  /** už importované dřív (stejné ID) */
  existing: number;
  dateRange: { from: string; to: string } | null;
}

export async function analyzeBankImport(data: BankImport): Promise<BankImportPlan> {
  const found = await db.transactions.bulkGet(data.transactions.map((t) => t.id));
  const fresh = data.transactions.filter((_, i) => found[i] === undefined);
  const dates = data.transactions.map((t) => t.date).sort();
  return {
    fresh,
    existing: data.transactions.length - fresh.length,
    dateRange: dates.length ? { from: dates[0]!, to: dates[dates.length - 1]! } : null,
  };
}

/** Účet navržený pro nový import – počáteční zůstatek z hlavičky výpisu, aby zůstatek seděl s bankou. */
export function suggestedAccount(data: BankImport): Omit<Account, "id"> {
  return {
    name: `${data.bankShort} ${data.accountNumber}`.trim(),
    type: "checking",
    currency: data.currency,
    ...(data.openingBalance !== null && data.from ? { initialBalance: data.openingBalance, initialBalanceDate: data.from } : {}),
  };
}

/**
 * Účet založený importem má číslo účtu v názvu – při dalším importu se předvybere.
 * Výpis bez čísla účtu (Trinity) se páruje s účtem pojmenovaným přesně podle návrhu.
 */
export function matchAccount(data: BankImport, accounts: Account[]): Account | undefined {
  const number = data.accountNumber;
  const active = accounts.filter((a) => !a.archived);
  if (number) return active.find((a) => a.name.includes(number));
  const name = suggestedAccount(data).name;
  return active.find((a) => a.name === name);
}

export type BankImportTarget = { accountId: string } | { newAccount: Omit<Account, "id"> };

/**
 * Zapíše nové transakce (a případně nový účet) v jediné DB transakci.
 * Existující ID se znovu ověří uvnitř transakce, takže souběžný import nic nezdvojí.
 * Vrací počet skutečně přidaných transakcí.
 */
export async function applyBankImport(data: BankImport, target: BankImportTarget): Promise<number> {
  const now = nowIso();
  return db.transaction("rw", [db.accounts, db.transactions], async () => {
    let accountId: string;
    if ("newAccount" in target) {
      const account = accountSchema.parse({ ...target.newAccount, id: newId() });
      await db.accounts.add(account);
      accountId = account.id;
    } else {
      if (!(await db.accounts.get(target.accountId))) throw new Error("Vybraný účet neexistuje.");
      accountId = target.accountId;
    }

    const found = await db.transactions.bulkGet(data.transactions.map((t) => t.id));
    const toAdd: Transaction[] = data.transactions
      .filter((_, i) => found[i] === undefined)
      .map((t) => transactionSchema.parse({ ...t, accountId, createdAt: now, updatedAt: now }));
    if (toAdd.length) await db.transactions.bulkAdd(toAdd);
    return toAdd.length;
  });
}
