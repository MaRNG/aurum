import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import { transactionsRepo } from "@/db/repositories";
import { createDemoData, DEMO_ACCOUNT_ID, generateDemoData, hasDemoData, removeDemoData } from "./demo";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const TODAY = "2026-09-23";

describe("testovací data", () => {
  it("pokryjí poslední rok: každý měsíc výplata 30 000, ~40 výdajů a platby s kamarády", () => {
    const { transactions } = generateDemoData(TODAY);
    const months = [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort();
    expect(months[0]).toBe("2025-09");
    expect(months.at(-1)).toBe("2026-09");
    expect(transactions.every((t) => t.date <= TODAY)).toBe(true);

    for (const m of months.slice(0, -1)) {
      const inMonth = transactions.filter((t) => t.date.startsWith(m));
      const salary = inMonth.filter((t) => t.categoryId === "cat-salary");
      expect(salary).toHaveLength(1);
      expect(salary[0]!.amount).toBe(30000);
      const expenses = inMonth.filter((t) => t.type === "expense").length;
      expect(expenses).toBeGreaterThanOrEqual(40);
      expect(expenses).toBeLessThanOrEqual(43);
      expect(inMonth.some((t) => t.type === "income" && t.categoryId === "cat-other-income")).toBe(true);
    }
  });

  it("jsou deterministická", () => {
    const a = generateDemoData(TODAY).transactions.map((t) => [t.date, t.amount, t.description]);
    const b = generateDemoData(TODAY).transactions.map((t) => [t.date, t.amount, t.description]);
    expect(a).toEqual(b);
  });

  it("vytvoří a smažou se bez dopadu na skutečná data", async () => {
    const real = await transactionsRepo.create({ type: "expense", amount: 100, currency: "CZK", date: "2026-09-01", accountId: "acc-main", description: "Skutečná" });

    const count = await createDemoData(TODAY);
    expect(await hasDemoData()).toBe(true);
    expect(await db.transactions.where("accountId").equals(DEMO_ACCOUNT_ID).count()).toBe(count);

    // opakované vytvoření data nahradí, nezdvojí
    await createDemoData(TODAY);
    expect(await db.transactions.count()).toBe(count + 1);

    await removeDemoData();
    expect(await hasDemoData()).toBe(false);
    expect(await db.transactions.toArray()).toEqual([real]);
    expect(await db.accounts.get("acc-main")).toBeDefined();
  });
});
