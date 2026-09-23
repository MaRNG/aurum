import { useMemo } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/PageHeader";
import { useSettings, useTransactionsBetween } from "@/db/hooks";
import { summarizeMonths } from "@/domain/aggregate";
import { monthBounds, monthLabel } from "@/domain/months";
import { periodStats } from "@/domain/stats";
import { SERIES_COLORS } from "@/domain/defaults";
import { formatMoney, formatPercent } from "@/lib/format";
import { TrendChart } from "@/features/charts";
import { PeriodControls } from "@/features/PeriodControls";
import { StatCard } from "@/features/StatCard";
import { usePeriod } from "@/features/usePeriod";

export function StatsTrend() {
  const period = usePeriod();
  const { baseCurrency: currency } = useSettings();
  const txs = useTransactionsBetween(monthBounds(period.from).from, monthBounds(period.to).to);

  const summaries = useMemo(() => (txs ? summarizeMonths(period.months, txs) : []), [txs, period.months]);
  const stats = periodStats(summaries);
  const avgNote = `Průměr z ${stats.monthsWithData} ${stats.monthsWithData === 1 ? "měsíce" : "měsíců"} s daty`;

  return (
    <>
      <div className="mb-4">
        <PeriodControls period={period} />
      </div>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-slate-900/8 ring-1 ring-slate-900/8 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Průměrný příjem" accent={SERIES_COLORS.income} value={formatMoney(stats.avgIncome, currency)} hint={avgNote} />
        <StatCard label="Průměrné výdaje" accent={SERIES_COLORS.expense} value={formatMoney(stats.avgExpense, currency)} hint={avgNote} />
        <StatCard label="Průměrná úspora" accent={SERIES_COLORS.net} value={formatMoney(stats.avgNet, currency, { signed: true })} hint={avgNote} />
        <StatCard
          label="Míra úspor"
          value={stats.savingsRate === null ? "—" : formatPercent(stats.savingsRate)}
          hint={`Celkem ušetřeno ${formatMoney(stats.totalNet, currency, { signed: true })}`}
        />
      </div>

      <Card className="mt-4">
        <CardHeader title="Vývoj financí" subtitle={`${monthLabel(period.from)} – ${monthLabel(period.to)}`} />
        <CardBody>
          {stats.monthsWithData ? <TrendChart data={summaries} currency={currency} /> : <EmptyState title="V tomto období nejsou žádná data" />}
        </CardBody>
      </Card>

      {stats.monthsWithData > 0 && (
        <Card className="mt-4 overflow-hidden">
          <CardHeader title="Tabulka" />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                  <th className="px-5 py-2.5 text-left font-medium">Měsíc</th>
                  <th className="px-5 py-2.5 text-right font-medium">Příjmy</th>
                  <th className="px-5 py-2.5 text-right font-medium">Výdaje</th>
                  <th className="px-5 py-2.5 text-right font-medium">Úspora</th>
                  <th className="px-5 py-2.5 text-right font-medium">Míra úspor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...summaries].reverse().map((s) => (
                  <tr key={s.month} className={s.transactionCount ? "" : "text-slate-400"}>
                    <td className="px-5 py-2.5">{monthLabel(s.month)}</td>
                    <td className="num px-5 py-2.5 text-right">{s.transactionCount ? formatMoney(s.income, currency) : "—"}</td>
                    <td className="num px-5 py-2.5 text-right">{s.transactionCount ? formatMoney(s.expense, currency) : "—"}</td>
                    <td className="num px-5 py-2.5 text-right font-medium">{s.transactionCount ? formatMoney(s.net, currency, { signed: true }) : "—"}</td>
                    <td className="num px-5 py-2.5 text-right text-slate-600">{s.savingsRate === null ? "—" : formatPercent(s.savingsRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
