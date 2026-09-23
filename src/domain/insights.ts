import type { Budget, Category, MonthStatus, RecurringPayment, Transaction } from "./schema";
import { expensesByCategory, groupByMonth, mean, summarize } from "./aggregate";
import { addMonths, monthLabelLower, monthOfDate, monthRange } from "./months";
import { findUnusualTransactions, TX_RULE } from "./anomalies";
import { budgetStatuses } from "./budgets";
import { matchRecurring } from "./recurring";
import { slope, stddev } from "./stats";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";

/**
 * Deterministické, vysvětlitelné poznatky. Každý insight nese `basis` –
 * přesná čísla, ze kterých vznikl – a `method` s popisem výpočtu.
 * Nejde o finanční rady, jen o popis toho, co je v datech.
 */

export type InsightTone = "positive" | "negative" | "neutral" | "warning";
export type InsightKind = "spending" | "category" | "anomaly" | "trend" | "savings" | "income" | "budget" | "recurring";

export const INSIGHT_KIND_LABEL: Record<InsightKind, string> = {
  spending: "Výdaje",
  category: "Kategorie",
  anomaly: "Neobvyklé výdaje",
  trend: "Trendy",
  savings: "Úspory",
  income: "Příjmy",
  budget: "Rozpočty",
  recurring: "Pravidelné platby",
};

export interface InsightBasisRow {
  label: string;
  value: string;
}

export interface Insight {
  id: string;
  kind: InsightKind;
  tone: InsightTone;
  text: string;
  basis: InsightBasisRow[];
  method: string;
}

/** Kolik předchozích měsíců se bere jako srovnávací období. */
const LOOKBACK = 6;
/** Minimální počet měsíců s daty, aby mělo srovnání smysl. */
const MIN_HISTORY = 3;
const CATEGORY_THRESHOLD = 0.3;
const CATEGORY_MIN_DIFF = 500;
const TREND_MONTHS = 3;

export interface InsightContext {
  month: string;
  /** dnešní datum YYYY-MM-DD */
  today: string;
  txs: Transaction[];
  categories: Category[];
  currency: string;
  budgets?: Budget[];
  recurring?: RecurringPayment[];
  /** "quick" = jen poznatky o zvoleném měsíci (Přehled), "full" = vše (stránka Insights) */
  scope?: "quick" | "full";
}

export function computeInsights(ctx: InsightContext): Insight[] {
  const { month, today, txs, categories, currency, scope = "quick" } = ctx;
  const inProgress = month === monthOfDate(today);
  const grouped = groupByMonth(txs);
  const money = (n: number) => formatMoney(n, currency);
  const progressNote = inProgress ? " (zatím)" : "";
  const current = grouped.get(month) ?? [];
  const insights: Insight[] = [];

  // Předchozí měsíce s alespoň jednou transakcí (měsíce bez dat by průměr zkreslily).
  const history = monthRange(addMonths(month, -1), LOOKBACK).filter((m) => (grouped.get(m)?.length ?? 0) > 0);
  const periodLabel = `${history.length} předchozích měsíců s daty (${history.map(monthLabelLower).join(", ")})`;
  const hasHistory = history.length >= MIN_HISTORY && current.length > 0;

  // 1) Celkové výdaje vs. průměr
  if (hasHistory) {
    const cur = summarize(month, current);
    const avgExpense = mean(history.map((m) => summarize(m, grouped.get(m)!).expense));
    const diff = avgExpense > 0 ? cur.expense / avgExpense - 1 : 0;
    // U běžícího měsíce má smysl jen upozornění na překročení – nižší číslo je dané tím, že měsíc ještě neskončil.
    if (avgExpense > 0 && Math.abs(diff) >= 0.05 && (!inProgress || diff > 0)) {
      insights.push({
        id: "expense-vs-avg",
        kind: "spending",
        tone: diff > 0 ? "negative" : "positive",
        text: `Výdaje${progressNote} jsou o ${formatPercent(Math.abs(diff))} ${diff > 0 ? "vyšší" : "nižší"} než průměr posledních ${history.length} měsíců.`,
        basis: [
          { label: `Výdaje ${monthLabelLower(month)}${progressNote}`, value: money(cur.expense) },
          { label: "Průměr srovnávacího období", value: money(avgExpense) },
          { label: "Rozdíl", value: formatPercent(diff, { signed: true }) },
        ],
        method: `Srovnání s aritmetickým průměrem měsíčních výdajů za ${periodLabel}. Převody se nezapočítávají.`,
      });
    }
  }

  // 2) Kategorie výrazně nad průměrem
  if (hasHistory) {
    const histCats = history.map((m) => expensesByCategory(grouped.get(m)!, categories));
    for (const c of expensesByCategory(current, categories)) {
      if (!c.categoryId) continue;
      const histTotals = histCats.map((cats) => cats.find((x) => x.categoryId === c.categoryId)?.total ?? 0);
      const avg = mean(histTotals);
      if (avg <= 0) continue;
      const diff = c.total / avg - 1;
      if (diff >= CATEGORY_THRESHOLD && c.total - avg >= CATEGORY_MIN_DIFF) {
        const ratio = c.total / avg;
        insights.push({
          id: `category-${c.categoryId}`,
          kind: "category",
          tone: "warning",
          text:
            ratio >= 1.9
              ? `Výdaje za kategorii ${c.name}${progressNote} jsou přibližně ${ratio.toFixed(1).replace(".", ",")}× vyšší než průměr posledních ${history.length} měsíců.`
              : `${c.name}${progressNote}: o ${formatPercent(diff, { digits: 0 })} nad běžným průměrem.`,
          basis: [
            { label: `${c.name} – ${monthLabelLower(month)}`, value: money(c.total) },
            { label: "Průměr srovnávacího období", value: money(avg) },
            ...history.map((m, i) => ({ label: monthLabelLower(m), value: money(histTotals[i]!) })),
          ],
          method: `Kategorie se zobrazí, pokud je alespoň o ${formatPercent(CATEGORY_THRESHOLD, { digits: 0 })} a ${money(CATEGORY_MIN_DIFF)} nad průměrem za ${periodLabel}.`,
        });
      }
    }
  }

  // 3) Neobvykle vysoké transakce
  for (const u of findUnusualTransactions(txs, categories, [month]).slice(0, 3)) {
    insights.push({
      id: `outlier-${u.tx.id}`,
      kind: "anomaly",
      tone: "neutral",
      text: `Neobvykle vysoká transakce: ${money(u.tx.amount)}${u.tx.description ? ` (${u.tx.description})` : ""}, ${formatDate(u.tx.date)}.`,
      basis: [
        { label: "Částka", value: money(u.tx.amount) },
        { label: u.comparedTo === "category" ? `Obvyklá částka v kategorii ${u.categoryName} (medián)` : "Obvyklá výdajová transakce (medián)", value: money(u.median) },
        { label: "Násobek obvyklé částky", value: `${u.ratio.toFixed(1).replace(".", ",")}×` },
        { label: "Počet transakcí ve srovnání", value: String(u.samples) },
      ],
      method:
        `Transakce je aspoň ${TX_RULE.minRatio}× vyšší než medián a má robustní z-skóre ≥ ${TX_RULE.minZ} (medián + MAD) vůči ` +
        (u.comparedTo === "category" ? "výdajům ve stejné kategorii" : "všem výdajům (kategorie nemá dost historie)") +
        ` za předchozích ${TX_RULE.lookbackMonths} měsíců.`,
    });
  }

  // 4) Rozpočty – skutečné nebo předpokládané překročení
  if (ctx.budgets?.length) {
    for (const s of budgetStatuses(ctx.budgets, categories, current, month, today)) {
      const name = s.category?.name ?? "Neznámá kategorie";
      const basis = [
        { label: "Rozpočet", value: money(s.budget.amount) },
        { label: "Vyčerpáno", value: `${money(s.spent)} (${formatPercent(s.ratio, { digits: 0 })})` },
        { label: "Uplynulo dní", value: `${s.daysElapsed} z ${s.daysInMonth}` },
      ];
      if (s.exceededOn) {
        insights.push({
          id: `budget-${s.budget.id}`,
          kind: "budget",
          tone: "negative",
          text: `Rozpočet kategorie ${name} byl překročen ${formatDate(s.exceededOn)} o ${money(-s.remaining)}.`,
          basis,
          method: "Součet výdajů kategorie v měsíci ve chvíli, kdy přesáhl nastavený rozpočet.",
        });
      } else if (s.projectedExceedOn && s.projected !== null) {
        insights.push({
          id: `budget-${s.budget.id}`,
          kind: "budget",
          tone: "warning",
          text: `Při současném tempu pravděpodobně překročíš rozpočet kategorie ${name} kolem ${formatDate(s.projectedExceedOn)}.`,
          basis: [...basis, { label: "Odhad na konci měsíce", value: money(s.projected) }],
          method: "Lineární odhad: dosavadní čerpání / uplynulé dny × počet dní v měsíci. Jde o odhad, nerovnoměrné platby jej zkreslují.",
        });
      }
    }
  }

  if (scope === "quick") return insights;

  /* --------------------------- jen stránka Insights --------------------------- */

  // Pro trendy a srovnání se berou jen uzavřené měsíce.
  const lastComplete = inProgress ? addMonths(month, -1) : month;

  // 5) Úspory – pořadí mezi posledními 12 měsíci
  const year = monthRange(lastComplete, 12).filter((m) => grouped.has(m));
  if (year.length >= 6 && grouped.has(lastComplete)) {
    const nets = year.map((m) => ({ m, net: summarize(m, grouped.get(m)!).net }));
    const target = nets.find((x) => x.m === lastComplete)!;
    const others = nets.filter((x) => x.m !== lastComplete);
    const beaten = others.filter((x) => target.net > x.net).length;
    const share = beaten / others.length;
    if (share >= 0.6 || share <= 0.25) {
      insights.push({
        id: "savings-rank",
        kind: "savings",
        tone: share >= 0.6 ? "positive" : "negative",
        text:
          share >= 0.6
            ? `Úspora za ${monthLabelLower(lastComplete)} byla vyšší než v ${beaten} z ${others.length} předchozích měsíců.`
            : `Úspora za ${monthLabelLower(lastComplete)} byla nižší než v ${others.length - beaten} z ${others.length} předchozích měsíců.`,
        basis: [
          { label: `Úspora ${monthLabelLower(lastComplete)}`, value: formatMoney(target.net, currency, { signed: true }) },
          { label: "Průměrná úspora ostatních měsíců", value: formatMoney(mean(others.map((x) => x.net)), currency, { signed: true }) },
          { label: "Nejlepší měsíc", value: formatMoney(Math.max(...nets.map((x) => x.net)), currency, { signed: true }) },
        ],
        method: `Úspora = příjmy − výdaje. Porovnáno s ${others.length} měsíci s daty v posledním roce.`,
      });
    }
  }

  // 6) Stabilita příjmů
  const incomeMonths = monthRange(lastComplete, LOOKBACK)
    .filter((m) => grouped.has(m))
    .map((m) => ({ m, income: summarize(m, grouped.get(m)!).income }))
    .filter((x) => x.income > 0);
  if (incomeMonths.length >= 4) {
    const values = incomeMonths.map((x) => x.income);
    const avg = mean(values);
    const cv = stddev(values) / avg;
    if (cv <= 0.1 || cv >= 0.3) {
      insights.push({
        id: "income-stability",
        kind: "income",
        tone: cv <= 0.1 ? "positive" : "neutral",
        text:
          cv <= 0.1
            ? `Příjmy jsou za posledních ${incomeMonths.length} měsíců relativně stabilní.`
            : `Příjmy za posledních ${incomeMonths.length} měsíců výrazně kolísají.`,
        basis: [
          { label: "Průměrný příjem", value: money(avg) },
          { label: "Směrodatná odchylka", value: money(stddev(values)) },
          { label: "Variační koeficient", value: formatPercent(cv) },
          { label: "Nejnižší / nejvyšší", value: `${money(Math.min(...values))} / ${money(Math.max(...values))}` },
        ],
        method: "Variační koeficient (odchylka / průměr) do 10 % = stabilní, od 30 % = kolísavé. Počítají se jen měsíce s příjmem.",
      });
    }
  }

  // 7) Trendy kategorií za poslední 3 uzavřené měsíce
  const trendMonths = monthRange(lastComplete, TREND_MONTHS);
  if (trendMonths.every((m) => grouped.has(m))) {
    const perMonth = trendMonths.map((m) => expensesByCategory(grouped.get(m)!, categories));
    const ids = new Set(perMonth.flat().map((c) => c.categoryId).filter((x): x is string => !!x));
    for (const id of ids) {
      const values = perMonth.map((cats) => cats.find((c) => c.categoryId === id)?.total ?? 0);
      const k = slope(values);
      const avg = mean(values);
      const monotonic = values.every((v, i) => i === 0 || (k > 0 ? v > values[i - 1]! : v < values[i - 1]!));
      if (!monotonic || Math.abs(k) < Math.max(300, avg * 0.1)) continue;
      const name = categories.find((c) => c.id === id)?.name ?? "?";
      insights.push({
        id: `trend-${id}`,
        kind: "trend",
        tone: k > 0 ? "warning" : "positive",
        text: `Výdaje za kategorii ${name} ${k > 0 ? "rostou" : "klesají"} – za poslední ${TREND_MONTHS} měsíce průměrně o ${money(Math.abs(k))} měsíčně.`,
        basis: trendMonths.map((m, i) => ({ label: monthLabelLower(m), value: money(values[i]!) })),
        method: `Směrnice lineární regrese měsíčních výdajů kategorie. Zobrazí se, když výdaje ${TREND_MONTHS} měsíce po sobě jednoznačně rostou/klesají a změna je aspoň ${money(300)} nebo 10 % průměru.`,
      });
    }
  }

  // 8) Změny cen pravidelných plateb (za posledních 90 dní)
  for (const r of ctx.recurring ?? []) {
    if (!r.active) continue;
    const { priceChange } = matchRecurring(r, txs);
    if (!priceChange || Date.parse(today) - Date.parse(priceChange.date) > 90 * 86_400_000) continue;
    const diff = priceChange.to - priceChange.from;
    insights.push({
      id: `recurring-price-${r.id}`,
      kind: "recurring",
      tone: diff > 0 ? "warning" : "positive",
      text: `${r.name}: cena se ${diff > 0 ? "zvýšila" : "snížila"} z ${money(priceChange.from)} na ${money(priceChange.to)} (${formatPercent(diff / priceChange.from, { signed: true })}).`,
      basis: [
        { label: "Předchozí platba", value: money(priceChange.from) },
        { label: "Nová platba", value: money(priceChange.to) },
        { label: "Datum změny", value: formatDate(priceChange.date) },
      ],
      method: `Porovnání dvou po sobě jdoucích transakcí spárovaných s pravidelnou platbou podle textu „${r.match || r.name}“ v popisu.`,
    });
  }

  return insights;
}

/* ---------------------------- Chybějící měsíce ---------------------------- */

export interface MissingMonthAlert {
  month: string;
}

/**
 * Měsíce bez jediné transakce, které uživatel neoznačil jako zkontrolované.
 * Hledá se od prvního měsíce s daty do minulého měsíce (max. 12 měsíců zpět).
 */
export function findMissingMonths(
  txMonths: Set<string>,
  firstMonth: string | null,
  statuses: MonthStatus[],
  currentMonth: string,
): MissingMonthAlert[] {
  if (!firstMonth) return [];
  const completed = new Set(statuses.filter((s) => s.status === "completed").map((s) => s.month));
  return monthRange(addMonths(currentMonth, -1), 12)
    .filter((m) => m >= firstMonth && !txMonths.has(m) && !completed.has(m))
    .map((month) => ({ month }));
}

export const monthsWithData = (txs: Transaction[]): Set<string> => new Set(txs.map((t) => monthOfDate(t.date)));
