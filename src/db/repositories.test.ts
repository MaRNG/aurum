import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { accountsRepo, categoriesRepo, transactionsRepo } from "./repositories";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("transactionsRepo.bulkUpdate", () => {
  it("změní kategorii a účet, nevhodné transakce přeskočí", async () => {
    const food = await categoriesRepo.save({ name: "Jídlo", type: "expense" });
    const a = await accountsRepo.save({ name: "Běžný", type: "checking", currency: "CZK" });
    const b = await accountsRepo.save({ name: "Eurový", type: "checking", currency: "EUR" });
    const base = { amount: 100, currency: "CZK", date: "2026-03-01", accountId: a.id };
    const exp = await transactionsRepo.create({ ...base, type: "expense" });
    const inc = await transactionsRepo.create({ ...base, type: "income" });
    const tr = await transactionsRepo.create({ ...base, type: "transfer", destinationAccountId: b.id });

    expect(await transactionsRepo.bulkUpdate([exp.id, inc.id, tr.id], { categoryId: food.id })).toEqual({ updated: 1, skipped: 2 });
    expect(await db.transactions.get(exp.id)).toMatchObject({ categoryId: food.id });
    expect((await db.transactions.get(inc.id))?.categoryId).toBeUndefined();

    expect(await transactionsRepo.bulkUpdate([exp.id, tr.id], { accountId: b.id })).toEqual({ updated: 1, skipped: 1 });
    expect(await db.transactions.get(exp.id)).toMatchObject({ accountId: b.id, currency: "EUR", categoryId: food.id });
    expect(await db.transactions.get(tr.id)).toMatchObject({ accountId: a.id });

    expect(await transactionsRepo.bulkUpdate([exp.id], { categoryId: null })).toEqual({ updated: 1, skipped: 0 });
    expect((await db.transactions.get(exp.id))?.categoryId).toBeUndefined();
  });
});
