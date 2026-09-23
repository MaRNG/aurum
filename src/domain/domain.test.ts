import { describe, expect, it } from "vitest";
import { summarize } from "./aggregate";
import { budgetStatus } from "./budgets";
import { detectRecurring, matchRecurring, monthlyEquivalent } from "./recurring";
import { findUnusualTransactions } from "./anomalies";
import { compareYears, slope } from "./stats";
import { DEFAULT_CATEGORIES } from "./defaults";
import { tx } from "@/test/fixtures";

describe("summarize", () => {
  it("nezapočítává převody do příjmů ani výdajů", () => {
    const s = summarize("2026-08", [
      tx({ type: "income", amount: 42000, date: "2026-08-10" }),
      tx({ type: "expense", amount: 27438, date: "2026-08-12" }),
      tx({ type: "transfer", amount: 20000, date: "2026-08-15", destinationAccountId: "acc-sav" }),
    ]);
    expect(s.income).toBe(42000);
    expect(s.expense).toBe(27438);
    expect(s.net).toBe(14562);
    expect(s.savingsRate).toBeCloseTo(0.3467, 3);
  });
});

describe("budgetStatus", () => {
  const budget = { id: "b1", categoryId: "cat-fun", amount: 2000, currency: "CZK" };
  it("odhadne datum překročení při současném tempu", () => {
    const txs = [tx({ type: "expense", amount: 1000, date: "2026-09-05", categoryId: "cat-fun" })];
    const s = budgetStatus(budget, undefined, txs, "2026-09", "2026-09-10");
    // tempo 100 Kč/den → 2000 Kč 20. den, odhad na konci měsíce 3000 Kč
    expect(s.projected).toBeCloseTo(3000);
    expect(s.projectedExceedOn).toBe("2026-09-20");
    expect(s.state).toBe("warning");
  });
  it("zaznamená skutečné překročení", () => {
    const txs = [
      tx({ type: "expense", amount: 1500, date: "2026-08-03", categoryId: "cat-fun" }),
      tx({ type: "expense", amount: 800, date: "2026-08-17", categoryId: "cat-fun" }),
    ];
    const s = budgetStatus(budget, undefined, txs, "2026-08", "2026-09-22");
    expect(s.exceededOn).toBe("2026-08-17");
    expect(s.projected).toBeNull(); // uzavřený měsíc se neodhaduje
    expect(s.state).toBe("exceeded");
  });
  it("neodhaduje v prvních dnech měsíce", () => {
    const txs = [tx({ type: "expense", amount: 1500, date: "2026-09-01", categoryId: "cat-fun" })];
    expect(budgetStatus(budget, undefined, txs, "2026-09", "2026-09-03").projected).toBeNull();
  });
});

describe("recurring", () => {
  const monthly = (desc: string, amounts: number[], day = 12) =>
    amounts.map((amount, i) => tx({ type: "expense", amount, date: `2026-0${i + 1}-${day}`, description: `${desc} ${i}`, categoryId: "cat-fun" }));

  it("najde měsíční platbu a ignoruje nepravidelné nákupy", () => {
    const txs = [
      ...monthly("NETFLIX.COM", [259, 259, 259, 259, 289]),
      tx({ type: "expense", amount: 300, date: "2026-01-02", description: "Albert" }),
      tx({ type: "expense", amount: 900, date: "2026-01-09", description: "Albert" }),
      tx({ type: "expense", amount: 450, date: "2026-01-25", description: "Albert" }),
      tx({ type: "expense", amount: 700, date: "2026-02-20", description: "Albert" }),
    ];
    const found = detectRecurring(txs, []);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ frequency: "monthly", occurrences: 5, amount: 289, categoryId: "cat-fun" });
  });

  it("vynechá platby, které už jsou evidované", () => {
    const txs = monthly("Spotify", [179, 179, 179]);
    const existing = [{ id: "r", name: "Spotify", amount: 179, currency: "CZK", frequency: "monthly" as const, active: true, createdAt: "", updatedAt: "" }];
    expect(detectRecurring(txs, existing)).toHaveLength(0);
  });

  it("zjistí změnu ceny", () => {
    const rec = { id: "r", name: "Netflix", amount: 289, currency: "CZK", frequency: "monthly" as const, active: true, createdAt: "", updatedAt: "" };
    const m = matchRecurring(rec, monthly("NETFLIX", [259, 259, 289]));
    expect(m.priceChange).toEqual({ from: 259, to: 289, date: "2026-03-12" });
    expect(m.lastPaid?.amount).toBe(289);
  });

  it("přepočítá frekvence na měsíc", () => {
    expect(monthlyEquivalent(1200, "yearly")).toBe(100);
    expect(monthlyEquivalent(300, "quarterly")).toBe(100);
  });
});

describe("findUnusualTransactions", () => {
  it("označí transakci výrazně nad mediánem kategorie", () => {
    const history = Array.from({ length: 12 }, (_, i) =>
      tx({ type: "expense", amount: 500 + (i % 4) * 50, date: `2026-0${1 + (i % 6)}-10`, categoryId: "cat-food" }),
    );
    const big = tx({ type: "expense", amount: 4000, date: "2026-08-15", categoryId: "cat-food", description: "Oslava" });
    const normal = tx({ type: "expense", amount: 1100, date: "2026-08-16", categoryId: "cat-food" });
    const result = findUnusualTransactions([...history, big, normal], DEFAULT_CATEGORIES, ["2026-08"]);
    expect(result.map((r) => r.tx.id)).toEqual([big.id]);
    expect(result[0]!.comparedTo).toBe("category");
  });
});

describe("compareYears", () => {
  it("porovná stejné období a spočítá procentní změnu", () => {
    const txs = [
      tx({ type: "income", amount: 100, date: "2025-02-01" }),
      tx({ type: "income", amount: 999, date: "2025-11-01" }), // mimo období leden–září
      tx({ type: "income", amount: 150, date: "2026-02-01" }),
    ];
    const c = compareYears(txs, DEFAULT_CATEGORIES, 2025, 2026, 9);
    expect(c.income).toMatchObject({ a: 100, b: 150, diff: 50, pct: 0.5 });
  });
});

describe("slope", () => {
  it("vrací průměrnou změnu za krok", () => {
    expect(slope([1000, 2250, 3500])).toBe(1250);
  });
});
