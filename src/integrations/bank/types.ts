import type { Transaction } from "@/domain/schema";

/** Transakce připravená k importu; účet se doplní až při zápisu. */
export type BankTransactionDraft = Omit<Transaction, "accountId" | "createdAt" | "updatedAt">;

/** Výsledek parsování výpisu – stejný tvar pro všechny banky. */
export interface BankImport {
  /** `bankProvider` u transakcí a prefix jejich ID */
  provider: string;
  /** název banky pro UI */
  bankName: string;
  /** zkratka do názvu nově zakládaného účtu („KB 27035123“) */
  bankShort: string;
  accountNumber: string;
  accountName: string;
  currency: string;
  /** období výpisu (z hlavičky, jinak podle transakcí) */
  from: string | null;
  to: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  transactions: BankTransactionDraft[];
  /** řádky v cizí měně, které se samostatně neimportují */
  foreignRows: number;
  /** součet cizoměnových řádků po měnách – 0 znamená, že se podúčet celý vyrovnal */
  foreignTotals: Record<string, number>;
  /** kontrola: součet importovaných řádků vs. rozdíl zůstatků výpisu (jen když je výpis uvádí) */
  balanceCheck: { expected: number; actual: number } | null;
}

export class BankParseError extends Error {}
