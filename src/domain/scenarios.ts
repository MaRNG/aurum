import type { Category, ScenarioAdjustment, Transaction } from "./schema";
import { expensesByCategory, groupByMonth, mean, summarize } from "./aggregate";
import { addMonths, monthRange } from "./months";

/**
 * Scénáře „co kdyby“. Výchozí stav = průměr posledních uzavřených měsíců s daty.
 * Každá úprava mění měsíční cashflow o spočitatelnou částku, výsledek je jednoduchá
 * lineární projekce (investice se úročí měsíčně). Nejde o předpověď, ale o srovnání.
 */

export const BASELINE_MONTHS = 6;

export interface Baseline {
  months: string[];
  income: number;
  expense: number;
  net: number;
  /** průměrné měsíční výdaje podle kategorie */
  categories: Map<string, number>;
}

export function computeBaseline(txs: Transaction[], categories: Category[], currentMonth: string): Baseline {
  const grouped = groupByMonth(txs);
  const months = monthRange(addMonths(currentMonth, -1), BASELINE_MONTHS).filter((m) => grouped.has(m));
  const sums = months.map((m) => summarize(m, grouped.get(m)!));
  const cats = new Map<string, number>();
  for (const m of months) {
    for (const c of expensesByCategory(grouped.get(m)!, categories)) {
      if (c.categoryId) cats.set(c.categoryId, (cats.get(c.categoryId) ?? 0) + c.total / months.length);
    }
  }
  const income = mean(sums.map((s) => s.income));
  const expense = mean(sums.map((s) => s.expense));
  return { months, income, expense, net: income - expense, categories: cats };
}

export interface AdjustmentEffect {
  adjustment: ScenarioAdjustment;
  label: string;
  /** změna měsíčního cashflow (kladná = víc peněz) */
  cashDelta: number;
  /** měsíčně odloženo do investic (není v cashflow, ale je v majetku) */
  invested: number;
}

const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("cs-CZ")} %`;

export function adjustmentEffect(a: ScenarioAdjustment, base: Baseline, categories: Category[]): AdjustmentEffect {
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "neznámá kategorie";
  const money = (n: number) => `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
  switch (a.kind) {
    case "savings":
      return { adjustment: a, label: `Ušetřit navíc ${money(a.amount)} měsíčně`, cashDelta: a.amount, invested: 0 };
    case "income": {
      const d = a.mode === "amount" ? a.value : (base.income * a.value) / 100;
      return { adjustment: a, label: `Příjem ${a.mode === "amount" ? `${a.value > 0 ? "+" : ""}${money(a.value)}` : pct(a.value)}`, cashDelta: d, invested: 0 };
    }
    case "category": {
      const avg = base.categories.get(a.categoryId) ?? 0;
      const d = a.mode === "amount" ? a.value : (avg * a.value) / 100;
      return {
        adjustment: a,
        label: `${catName(a.categoryId)} ${a.mode === "amount" ? `${a.value > 0 ? "+" : ""}${money(a.value)}` : pct(a.value)} (průměr ${money(avg)})`,
        cashDelta: -d,
        invested: 0,
      };
    }
    case "budget": {
      const avg = base.categories.get(a.categoryId) ?? 0;
      return { adjustment: a, label: `${catName(a.categoryId)}: rozpočet ${money(a.amount)} místo průměru ${money(avg)}`, cashDelta: avg - a.amount, invested: 0 };
    }
    case "investment":
      return {
        adjustment: a,
        label: `Investovat ${money(a.amount)} měsíčně (zhodnocení ${a.annualReturn.toLocaleString("cs-CZ")} % ročně)`,
        cashDelta: -a.amount,
        invested: a.amount,
      };
  }
}

export interface ProjectionPoint {
  month: number;
  baseline: number;
  scenarioCash: number;
  investments: number;
  scenarioTotal: number;
}

export interface ScenarioResult {
  effects: AdjustmentEffect[];
  baseNet: number;
  /** nové měsíční cashflow (bez investic) */
  newNet: number;
  /** nové měsíční tempo růstu majetku (cashflow + investované) */
  newPace: number;
  diffMonthly: number;
  diffYearly: number;
  projection: ProjectionPoint[];
  final: ProjectionPoint;
}

export function runScenario(base: Baseline, adjustments: ScenarioAdjustment[], categories: Category[], horizonMonths: number): ScenarioResult {
  const effects = adjustments.map((a) => adjustmentEffect(a, base, categories));
  const cashDelta = effects.reduce((s, e) => s + e.cashDelta, 0);
  const investments = effects.filter((e) => e.adjustment.kind === "investment");
  const newNet = base.net + cashDelta;
  const investedMonthly = investments.reduce((s, e) => s + e.invested, 0);
  const newPace = newNet + investedMonthly;

  const projection: ProjectionPoint[] = [{ month: 0, baseline: 0, scenarioCash: 0, investments: 0, scenarioTotal: 0 }];
  const balances = investments.map(() => 0);
  for (let m = 1; m <= horizonMonths; m++) {
    investments.forEach((e, i) => {
      const r = (e.adjustment as Extract<ScenarioAdjustment, { kind: "investment" }>).annualReturn / 100;
      const monthly = Math.pow(1 + r, 1 / 12) - 1;
      balances[i] = balances[i]! * (1 + monthly) + e.invested;
    });
    const inv = balances.reduce((a, b) => a + b, 0);
    projection.push({ month: m, baseline: base.net * m, scenarioCash: newNet * m, investments: inv, scenarioTotal: newNet * m + inv });
  }
  return {
    effects,
    baseNet: base.net,
    newNet,
    newPace,
    diffMonthly: newPace - base.net,
    diffYearly: (newPace - base.net) * 12,
    projection,
    final: projection[projection.length - 1]!,
  };
}
