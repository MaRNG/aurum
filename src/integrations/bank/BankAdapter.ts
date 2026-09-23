import type { Account, Transaction } from "@/domain/schema";

/**
 * Připraveno pro Fázi 4 – zatím bez implementace.
 *
 * Každá banka dostane vlastní adapter. Importované transakce musí mít
 * `source: "bank"`, `bankProvider` a `externalId`; deduplikace poběží přes
 * index [bankProvider+externalId] v IndexedDB.
 *
 * Pokud API banky vyžaduje client secret nebo certifikát, adapter nesmí tajemství
 * držet v prohlížeči – bude volat samostatnou serverless proxy. Základní aplikace
 * na ní ale nesmí záviset.
 */
export interface BankAdapter {
  readonly provider: string;
  connect(): Promise<void>;
  getAccounts(): Promise<Account[]>;
  getTransactions(): Promise<Transaction[]>;
  disconnect(): Promise<void>;
}
