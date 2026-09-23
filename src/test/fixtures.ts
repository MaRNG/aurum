import type { Transaction } from "@/domain/schema";

let n = 0;
export function tx(partial: Partial<Transaction> & Pick<Transaction, "type" | "amount" | "date">): Transaction {
  n++;
  return {
    id: `t${n}`,
    currency: "CZK",
    source: "manual",
    accountId: "acc-main",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}
