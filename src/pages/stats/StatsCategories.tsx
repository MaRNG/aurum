import { useMemo } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/PageHeader";
import { useCategories, useSettings, useTransactionsBetween } from "@/db/hooks";
import { expensesByCategory, groupByMonth } from "@/domain/aggregate";
import { monthBounds, monthLabel } from "@/domain/months";
import { categorySeries } from "@/domain/stats";
import { formatMoney, formatPercent } from "@/lib/format";
import { CategoryBars, CategoryStackChart } from "@/features/charts";
import { PeriodControls } from "@/features/PeriodControls";
import { StatCard } from "@/features/StatCard";
import { usePeriod } from "@/features/usePeriod";

export function StatsCategories() {
  const period = usePeriod();
  const { baseCurrency: currency } = useSettings();
  const categories = useCategories();
  const txs = useTransactionsBetween(monthBounds(period.from).from, monthBounds(period.to).to);

  const data = useMemo(() => {
    if (!txs) return null;
    const totals = expensesByCategory(txs, categories);
    const grouped = groupByMonth(txs);
    const monthsWithData = period.months.filter((m) => grouped.has(m)).length;
    // Pro každou kategorii: měsíc s nejvyššími výdaji
    const peaks = new Map<string | null, { month: string; total: number }>();
    for (const m of period.months) {
      for (const c of expensesByCategory(grouped.get(m) ?? [], categories)) {
        const p = peaks.get(c.categoryId);
        if (!p || c.total > p.total) peaks.set(c.categoryId, { month: m, total: c.total });
      }
    }
    return { totals, monthsWithData, peaks, series: categorySeries(period.months, txs, categories) };
  }, [txs, categories, period.months]);

  const top = data?.totals[0];
  const total = data?.totals.reduce((a, c) => a + c.total, 0) ?? 0;

  return (
    <>
      <div className="mb-4">
        <PeriodControls period={period} />
      </div>

      {data && data.totals.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-slate-900/8 ring-1 ring-slate-900/8 sm:grid-cols-3">
            <StatCard label="Výdaje celkem" value={formatMoney(total, currency)} hint={`${monthLabel(period.from)} – ${monthLabel(period.to)}`} />
            <StatCard
              label="Největší kategorie"
              accent={top?.color}
              value={top?.name ?? "—"}
              hint={top && `${formatMoney(top.total, currency)} · ${formatPercent(top.share)} výdajů`}
            />
            <StatCard
              label="Průměrné měsíční výdaje"
              value={formatMoney(data.monthsWithData ? total / data.monthsWithData : 0, currency)}
              hint={`Z ${data.monthsWithData} měsíců s daty`}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader title="Vývoj kategorií v čase" />
              <CardBody>
                <CategoryStackChart series={data.series} currency={currency} />
              </CardBody>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader title="Podíl kategorií" />
              <CardBody>
                <CategoryBars items={data.totals} currency={currency} />
              </CardBody>
            </Card>
          </div>

          <Card className="mt-4 overflow-hidden">
            <CardHeader title="Kategorie" subtitle="Seřazeno podle celkových výdajů" />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                    <th className="px-5 py-2.5 text-left font-medium">Kategorie</th>
                    <th className="px-5 py-2.5 text-right font-medium">Celkem</th>
                    <th className="px-5 py-2.5 text-left font-medium">Podíl</th>
                    <th className="px-5 py-2.5 text-right font-medium">Průměr / měsíc</th>
                    <th className="px-5 py-2.5 text-right font-medium">Nejvyšší měsíc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.totals.map((c) => {
                    const peak = data.peaks.get(c.categoryId);
                    return (
                      <tr key={c.categoryId ?? "none"}>
                        <td className="px-5 py-2.5">
                          <span className="inline-flex items-center gap-2">
                            <span className="size-2.5 rounded-sm" style={{ background: c.color }} />
                            {c.name}
                          </span>
                        </td>
                        <td className="num px-5 py-2.5 text-right font-medium">{formatMoney(c.total, currency)}</td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full" style={{ width: `${c.share * 100}%`, background: c.color }} />
                            </div>
                            <span className="num text-xs text-slate-500">{formatPercent(c.share)}</span>
                          </div>
                        </td>
                        <td className="num px-5 py-2.5 text-right text-slate-600">
                          {formatMoney(data.monthsWithData ? c.total / data.monthsWithData : 0, currency)}
                        </td>
                        <td className="num px-5 py-2.5 text-right text-slate-600">
                          {peak ? `${formatMoney(peak.total, currency)} (${monthLabel(peak.month, { short: true })})` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        data && (
          <Card>
            <EmptyState title="V tomto období nejsou žádné výdaje" />
          </Card>
        )
      )}
    </>
  );
}
