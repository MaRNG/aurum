import { describe, expect, it } from "vitest";
import { accountBalance, balanceHistory, computeReserve } from "./accounts";
import { accountFlows, cashflowStatement } from "./cashflow";
import { combineDifference, forecast, niceStep } from "./forecast";
import { computeBaseline, runScenario } from "./scenarios";
import { DEFAULT_CATEGORIES } from "./defaults";
import type { Account } from "./schema";
import { tx } from "@/test/fixtures";

const main: Account = { id: "acc-main", name: "Běžný", type: "checking", currency: "CZK", initialBalance: 10000 };
const sav: Account = { id: "acc-sav", name: "Spořicí", type: "savings", currency: "CZK", initialBalance: 50000 };

const txs = [
  tx({ type: "income", amount: 40000, date: "2026-08-10" }),
  tx({ type: "expense", amount: 25000, date: "2026-08-20", categoryId: "cat-food" }),
  tx({ type: "transfer", amount: 5000, date: "2026-08-25", destinationAccountId: "acc-sav" }),
];

describe("accountBalance", () => {
  it("započítá příjmy, výdaje a převody na obou stranách", () => {
    expect(accountBalance(main, txs)).toBe(10000 + 40000 - 25000 - 5000);
    expect(accountBalance(sav, txs)).toBe(55000);
  });

  it("zůstatek k datu v minulosti", () => {
    expect(accountBalance(main, txs, "2026-08-15")).toBe(50000);
    expect(accountBalance(main, txs, "2026-07-31")).toBe(10000);
  });

  it("počáteční zůstatek k datu dopočítá starší transakce zpětně", () => {
    // Uživatel zadal: 25. 8. ráno bylo na účtu 25 000
    const a: Account = { ...main, initialBalance: 25000, initialBalanceDate: "2026-08-25" };
    expect(accountBalance(a, txs)).toBe(20000); // − převod 25. 8.
    expect(accountBalance(a, txs, "2026-08-24")).toBe(25000);
    expect(accountBalance(a, txs, "2026-08-15")).toBe(50000); // + zpětně výdaj 20. 8.
    expect(accountBalance(a, txs, "2026-08-01")).toBe(10000); // − zpětně příjem 10. 8.
  });

  it("historie zůstatků ke konci měsíců", () => {
    expect(balanceHistory(main, txs, ["2026-07", "2026-08"]).map((p) => p.balance)).toEqual([10000, 20000]);
  });
});

describe("computeReserve", () => {
  it("sečte likvidní účty, odečte dluh na kartě a vynechá investice", () => {
    const card: Account = { id: "card", name: "Karta", type: "credit", currency: "CZK", initialBalance: -3000 };
    const inv: Account = { id: "inv", name: "ETF", type: "investment", currency: "CZK", initialBalance: 100000 };
    const unknown: Account = { id: "u", name: "Hotovost", type: "cash", currency: "CZK" };
    const r = computeReserve([main, sav, card, inv, unknown], txs, 20000, "CZK");
    expect(r.liquid).toBe(20000 + 55000 - 3000);
    expect(r.months).toBeCloseTo(3.6);
    expect(r.excluded.map((x) => x.account.id).sort()).toEqual(["inv", "u"]);
  });
});

describe("cashflow", () => {
  it("převody nejsou v cashflow, ale jsou v pohybech účtů a v součtu se vyruší", () => {
    const st = cashflowStatement(txs, DEFAULT_CATEGORIES);
    expect(st.cashflow).toBe(15000);
    expect(st.transfers).toBe(5000);
    const flows = accountFlows(txs, [main, sav]);
    expect(flows.find((f) => f.account?.id === "acc-sav")?.net).toBe(5000);
    expect(flows.find((f) => f.account?.id === "acc-main")?.net).toBe(10000);
    expect(flows.reduce((s, f) => s + f.transfersIn - f.transfersOut, 0)).toBe(0);
  });
});

describe("forecast", () => {
  const series = (values: number[]) => values.map((value, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, value }));

  it("při málo datech odmítne odhadovat", () => {
    expect(forecast(series([100, 200]), "2025-03")).toMatchObject({ status: "insufficient", historyCount: 2 });
  });

  it("u rostoucí řady vybere trend a rozsah obsahuje pokračování trendu", () => {
    const f = forecast(series([10000, 11000, 12000, 13000, 14000, 15000, 16000, 17000, 18000, 19000]), "2025-11");
    expect(f.status).toBe("ok");
    if (f.status !== "ok") return;
    expect(f.method.id).toBe("trend");
    expect(f.point).toBeCloseTo(20000, -1);
    expect(f.low).toBeLessThanOrEqual(20000);
    expect(f.high).toBeGreaterThanOrEqual(20000);
  });

  it("rozsah se s horizontem rozšiřuje", () => {
    const h = series([25000, 27000, 24000, 26000, 28000, 25000, 27000]);
    const a = forecast(h, "2025-08");
    const b = forecast(h, "2025-10");
    if (a.status !== "ok" || b.status !== "ok") throw new Error();
    expect(b.high - b.low).toBeGreaterThan(a.high - a.low);
  });

  it("zaokrouhluje hranice – žádná falešná přesnost", () => {
    const f = forecast(series([26345, 27112, 28901, 25777, 27433]), "2025-06");
    if (f.status !== "ok") throw new Error();
    expect(f.low % niceStep(f.point)).toBe(0);
    expect(f.high % niceStep(f.point)).toBe(0);
    const net = combineDifference(forecast(series([42000, 42000, 42000, 42000]), "2025-05"), f);
    expect(net).not.toBeNull();
  });
});

describe("scénáře", () => {
  const history = ["2026-06", "2026-07", "2026-08"].flatMap((m) => [
    tx({ type: "income", amount: 40000, date: `${m}-10` }),
    tx({ type: "expense", amount: 15000, date: `${m}-02`, categoryId: "cat-housing" }),
    tx({ type: "expense", amount: 13000, date: `${m}-15`, categoryId: "cat-food" }),
  ]);
  const base = computeBaseline(history, DEFAULT_CATEGORIES, "2026-09");

  it("výchozí stav z průměru uzavřených měsíců", () => {
    expect(base).toMatchObject({ income: 40000, expense: 28000, net: 12000 });
  });

  it("šetřit o 3 000 Kč víc = +36 000 Kč za rok (příklad ze specifikace)", () => {
    const r = runScenario(base, [{ kind: "savings", amount: 3000 }], DEFAULT_CATEGORIES, 12);
    expect(r).toMatchObject({ baseNet: 12000, newPace: 15000, diffYearly: 36000 });
  });

  it("zvýšení nájmu a snížení kategorie v procentech", () => {
    const r = runScenario(
      base,
      [
        { kind: "category", categoryId: "cat-housing", mode: "amount", value: 2000 },
        { kind: "category", categoryId: "cat-food", mode: "percent", value: -10 },
      ],
      DEFAULT_CATEGORIES,
      12,
    );
    expect(r.newNet).toBeCloseTo(12000 - 2000 + 1300);
  });

  it("investice snižují volné cashflow, ale zvyšují majetek o výnos", () => {
    const r = runScenario(base, [{ kind: "investment", amount: 1000, annualReturn: 10 }], DEFAULT_CATEGORIES, 12);
    expect(r.newNet).toBe(11000);
    expect(r.final.investments).toBeGreaterThan(12000);
    expect(r.final.scenarioTotal).toBeGreaterThan(r.final.baseline);
  });
});

import { formatMonths } from "@/lib/format";
describe("formatMonths", () => {
  it("skloňuje správně", () => {
    expect(formatMonths(1)).toBe("1 měsíc");
    expect(formatMonths(3)).toBe("3 měsíce");
    expect(formatMonths(13)).toBe("13 měsíců");
    expect(formatMonths(4.66)).toBe("4,7 měsíce");
  });
});
