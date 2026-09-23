import type { Budget, Category, Transaction } from "./schema";
import { expensesByCategory, groupByMonth, mean, summarize } from "./aggregate";
import { addMonths, monthRange } from "./months";
import { combineDifference, forecast, type Forecast, type SeriesPoint } from "./forecast";

/** Kolik měsíců historie se pro predikce bere. */
export const FORECAST_LOOKBACK = 36;
const TOP_CATEGORIES = 5;

export interface PeriodForecast {
  month: string;
  income: Forecast;
  expense: Forecast;
  net: { point: number; low: number; high: number } | null;
}

export interface CategoryForecast {
  categoryId: string;
  name: string;
  color: string;
  average: number;
  forecast: Forecast;
  budget?: Budget;
}

export interface ForecastModel {
  /** uzavřené měsíce s daty, ze kterých se predikuje */
  historyMonths: string[];
  incomeHistory: SeriesPoint[];
  expenseHistory: SeriesPoint[];
  periods: PeriodForecast[];
  categories: CategoryForecast[];
}

/**
 * Predikce pro aktuální (neúplný) měsíc a následující měsíce.
 * Historie = uzavřené měsíce před aktuálním, které mají nějaká data.
 */
export function buildForecastModel(txs: Transaction[], categories: Category[], budgets: Budget[], currentMonth: string, horizons = 3): ForecastModel {
  const grouped = groupByMonth(txs);
  const historyMonths = monthRange(addMonths(currentMonth, -1), FORECAST_LOOKBACK).filter((m) => grouped.has(m));
  const summaries = historyMonths.map((m) => summarize(m, grouped.get(m)!));
  const incomeHistory = summaries.map((s) => ({ month: s.month, value: s.income }));
  const expenseHistory = summaries.map((s) => ({ month: s.month, value: s.expense }));

  const periods = Array.from({ length: horizons }, (_, i) => {
    const month = addMonths(currentMonth, i);
    const income = forecast(incomeHistory, month);
    const expense = forecast(expenseHistory, month);
    return { month, income, expense, net: combineDifference(income, expense) };
  });

  // Významné kategorie = nejvyšší průměrné výdaje za posledních 6 měsíců s daty
  const recent = historyMonths.slice(-6);
  const catHistory = new Map<string, SeriesPoint[]>();
  for (const m of historyMonths) {
    const totals = expensesByCategory(grouped.get(m)!, categories);
    for (const c of categories) {
      if (c.type === "income") continue;
      const list = catHistory.get(c.id) ?? [];
      list.push({ month: m, value: totals.find((t) => t.categoryId === c.id)?.total ?? 0 });
      catHistory.set(c.id, list);
    }
  }
  const nextMonth = addMonths(currentMonth, 1);
  const budgetByCat = new Map(budgets.map((b) => [b.categoryId, b]));
  const categoryForecasts = [...catHistory.entries()]
    .map(([id, series]) => {
      const c = categories.find((x) => x.id === id)!;
      return {
        categoryId: id,
        name: c.name,
        color: c.color ?? "#94a3b8",
        average: mean(series.filter((p) => recent.includes(p.month)).map((p) => p.value)),
        series,
      };
    })
    .filter((c) => c.average > 0)
    .sort((a, b) => b.average - a.average);
  // Top N + všechny kategorie s rozpočtem
  const selected = categoryForecasts.filter((c, i) => i < TOP_CATEGORIES || budgetByCat.has(c.categoryId));

  return {
    historyMonths,
    incomeHistory,
    expenseHistory,
    periods,
    categories: selected.map((c) => ({
      categoryId: c.categoryId,
      name: c.name,
      color: c.color,
      average: c.average,
      forecast: forecast(c.series, nextMonth),
      budget: budgetByCat.get(c.categoryId),
    })),
  };
}
