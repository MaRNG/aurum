import { describe, expect, it } from "vitest";
import Dexie from "dexie";
import { FinanceDB } from "./db";

describe("upgrade IndexedDB v1 → aktuální verze", () => {
  it("zachová data z Fáze 1 a přidá nové tabulky", async () => {
    await Dexie.delete("finance-app");
    const v1 = new Dexie("finance-app");
    v1.version(1).stores({
      transactions: "id, date, type, categoryId, accountId, destinationAccountId, [bankProvider+externalId]",
      categories: "id, type",
      accounts: "id",
      monthStatus: "month",
      settings: "key",
    });
    await v1.table("transactions").add({ id: "old-1", type: "expense", amount: 10, currency: "CZK", date: "2026-01-01", source: "manual", createdAt: "", updatedAt: "" });
    await v1.table("categories").add({ id: "cat-x", name: "X", type: "expense" });
    v1.close();

    const db = new FinanceDB();
    await db.open();
    expect(db.verno).toBe(3);
    expect(await db.transactions.get("old-1")).toMatchObject({ amount: 10 });
    expect(await db.categories.count()).toBe(1); // populate se při upgradu nespouští
    expect(await db.budgets.count()).toBe(0);
    await db.budgets.add({ id: "b", categoryId: "cat-x", amount: 100, currency: "CZK" });
    expect(await db.budgets.where("categoryId").equals("cat-x").count()).toBe(1);
    db.close();
  });
});
