import { useMemo } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/PageHeader";
import { useBudgets, useCategories, useSettings, useTransactionsBetween } from "@/db/hooks";
import { summarize } from "@/domain/aggregate";
import { MIN_FORECAST_HISTORY, type Forecast } from "@/domain/forecast";
import { buildForecastModel, FORECAST_LOOKBACK, type CategoryForecast } from "@/domain/forecastModel";
import { addMonths, currentMonthKey, monthBounds, monthLabel, monthLabelLower, monthOfDate } from "@/domain/months";
import { SERIES_COLORS } from "@/domain/defaults";
import { formatMoney, formatRange } from "@/lib/format";
import { ForecastChart, type ForecastRow } from "@/features/charts";
import { ForecastExplain } from "@/features/ForecastExplain";

export function Forecasts() {
  const today = currentMonthKey();
  const txs = useTransactionsBetween(monthBounds(addMonths(today, -FORECAST_LOOKBACK)).from, monthBounds(today).to);
  const categories = useCategories();
  const budgets = useBudgets();
  const { baseCurrency: currency } = useSettings();

  const model = useMemo(() => (txs ? buildForecastModel(txs, categories, budgets, today) : null), [txs, categories, budgets, today]);
  const soFar = useMemo(() => summarize(today, (txs ?? []).filter((t) => monthOfDate(t.date) === today)), [txs, today]);

  if (!model) return null;
  const next = model.periods[1]!;
  if (next.expense.status === "insufficient") {
    return (
      <Card>
        <EmptyState icon={<HelpCircle className="size-5" />} title="Pro smysluplný odhad potřebuji více historických dat.">
          Mám {model.historyMonths.length} uzavřených měsíců s daty, potřebuji alespoň {MIN_FORECAST_HISTORY}. Trend se počítá od 6 měsíců, sezónnost
          od 24 měsíců.
        </EmptyState>
      </Card>
    );
  }

  // Graf: posledních 12 skutečných měsíců + odhady
  const history = model.incomeHistory.slice(-12);
  const rows: ForecastRow[] = history.map((p, i) => ({ month: p.month, income: p.value, expense: model.expenseHistory.slice(-12)[i]!.value }));
  const last = rows[rows.length - 1];
  if (last) {
    // napojení přerušované čáry na poslední skutečný bod
    last.incomeForecast = last.income;
    last.expenseForecast = last.expense;
  }
  for (const p of model.periods) {
    if (p.income.status !== "ok" || p.expense.status !== "ok") continue;
    rows.push({
      month: p.month,
      incomeForecast: p.income.point,
      expenseForecast: p.expense.point,
      incomeRange: [p.income.low, p.income.high],
      expenseRange: [p.expense.low, p.expense.high],
    });
  }

  return (
    <>
      <p className="mb-4 text-sm text-slate-600">
        Odhad na <b className="font-medium">{monthLabelLower(next.month)}</b>. Vychází z {model.historyMonths.length} uzavřených měsíců s daty; rozsah
        odpovídá přibližně 80% pravděpodobnosti.
      </p>
      <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-dashed border-slate-400/80 bg-face max-md:divide-y md:grid-cols-3 md:divide-x divide-dashed divide-slate-400/60">
        <RangeCard label="Příjmy" f={next.income} accent={SERIES_COLORS.income} currency={currency} />
        <RangeCard label="Výdaje" f={next.expense} accent={SERIES_COLORS.expense} currency={currency} />
        <div className="p-5">
          <p className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <span className="lamp" style={{ background: SERIES_COLORS.net }} /> Úspora – odhad
          </p>
          <p className="num mt-2 text-2xl font-semibold tracking-tight">{next.net ? formatRange(next.net.low, next.net.high, currency) : "—"}</p>
          <p className="mt-1 text-xs text-slate-500">Rozdíl odhadů příjmů a výdajů, nejistoty obou se sčítají.</p>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader title="Skutečnost a odhad" subtitle="Plná čára = skutečná data, přerušovaná = odhad s pravděpodobným rozsahem" />
        <CardBody>
          <ForecastChart rows={rows} currency={currency} boundary={last?.month ?? today} />
        </CardBody>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Odhady po měsících" />
          <div className="mt-3 overflow-x-auto">
            <table className="num w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                  <th className="px-5 py-2.5 text-left font-medium">Měsíc</th>
                  <th className="px-5 py-2.5 text-right font-medium">Příjmy</th>
                  <th className="px-5 py-2.5 text-right font-medium">Výdaje</th>
                  <th className="px-5 py-2.5 text-right font-medium">Úspora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {model.periods.map((p) => (
                  <tr key={p.month}>
                    <td className="px-5 py-2.5 font-sans">
                      {monthLabel(p.month)}
                      {p.month === today && (
                        <span className="block text-xs text-slate-500">
                          zatím skutečně {formatMoney(soFar.income, currency)} / {formatMoney(soFar.expense, currency)}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right">{rangeOf(p.income, currency)}</td>
                    <td className="px-5 py-2.5 text-right">{rangeOf(p.expense, currency)}</td>
                    <td className="px-5 py-2.5 text-right">{p.net ? formatRange(p.net.low, p.net.high, currency) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-xs text-slate-500">Čím dál do budoucna, tím širší rozsah.</p>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title={`Kategorie a rozpočty – ${monthLabelLower(next.month)}`} subtitle="Největší kategorie a všechny kategorie s rozpočtem" />
          <div className="mt-3 overflow-x-auto">
            <table className="num w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                  <th className="px-5 py-2.5 text-left font-medium">Kategorie</th>
                  <th className="px-5 py-2.5 text-right font-medium">Průměr 6 měs.</th>
                  <th className="px-5 py-2.5 text-right font-medium">Odhad</th>
                  <th className="px-5 py-2.5 text-left font-medium">Rozpočet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {model.categories.map((c) => (
                  <tr key={c.categoryId}>
                    <td className="px-5 py-2.5 font-sans">
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2.5 rounded-sm" style={{ background: c.color }} />
                        {c.name}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right text-slate-600">{formatMoney(c.average, currency)}</td>
                    <td className="px-5 py-2.5 text-right">{rangeOf(c.forecast, currency)}</td>
                    <td className="px-5 py-2.5 font-sans">
                      <BudgetOutlook c={c} currency={currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

function rangeOf(f: Forecast, currency: string) {
  return f.status === "ok" ? formatRange(f.low, f.high, currency) : <span className="text-slate-400">málo dat</span>;
}

function RangeCard({ label, f, accent, currency }: { label: string; f: Forecast; accent: string; currency: string }) {
  return (
    <div className="p-5">
      <p className="flex items-center gap-2 text-xs font-medium text-slate-600">
        <span className="lamp" style={{ background: accent }} /> {label} – odhad
      </p>
      <p className="num mt-2 text-2xl font-semibold tracking-tight">{f.status === "ok" ? formatRange(f.low, f.high, currency) : "—"}</p>
      {f.status === "ok" && <p className="mt-1 text-xs text-slate-500">Nejpravděpodobněji kolem {formatMoney(Math.round(f.point / 100) * 100, currency)}</p>}
      <ForecastExplain f={f} currency={currency} />
    </div>
  );
}

function BudgetOutlook({ c, currency }: { c: CategoryForecast; currency: string }) {
  if (!c.budget) return <span className="text-slate-400">—</span>;
  const f = c.forecast;
  const amount = formatMoney(c.budget.amount, currency);
  if (f.status !== "ok") return <span className="text-slate-500">{amount}</span>;
  const state = f.low > c.budget.amount ? "over" : f.high > c.budget.amount ? "risk" : "ok";
  return (
    <span className="block text-xs">
      <span className="num block text-slate-600">{amount}</span>
      <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap", state === "over" && "text-expense-ink", state === "risk" && "text-amber-700", state === "ok" && "text-income-ink")}>
        {state === "ok" ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
        {state === "over" ? "pravděpodobně překročen" : state === "risk" ? "může být překročen" : "pravděpodobně dodržen"}
      </span>
    </span>
  );
}
