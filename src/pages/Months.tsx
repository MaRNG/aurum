import { roundKey } from "@/components/ui/MonthPicker";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import clsx from "clsx";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { useMonthStatuses, useSettings, useTransactionsBetween } from "@/db/hooks";
import { monthStatusRepo } from "@/db/repositories";
import { summarize, summarizeMonths } from "@/domain/aggregate";
import { currentMonthKey, monthLabel, toMonthKey } from "@/domain/months";
import { formatMoney, formatPercent } from "@/lib/format";
import { IncomeExpenseChart } from "@/features/charts";

export function Months() {
  const [params, setParams] = useSearchParams();
  const now = new Date();
  const year = Number(params.get("y")) || now.getFullYear();
  const setYear = (y: number) => setParams(y === now.getFullYear() ? {} : { y: String(y) }, { replace: true });
  const today = currentMonthKey();

  const { baseCurrency: currency } = useSettings();
  const statuses = useMonthStatuses();
  const txs = useTransactionsBetween(`${year}-01-01`, `${year}-12-31`);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => toMonthKey(year, i + 1)), [year]);
  const rows = useMemo(() => (txs ? summarizeMonths(months, txs) : []), [months, txs]);
  const total = useMemo(() => summarize(String(year), txs ?? []), [txs, year]);
  const statusMap = new Map(statuses.map((s) => [s.month, s]));

  const toggleStatus = (month: string) => {
    const s = statusMap.get(month);
    void monthStatusRepo.set({ month, status: s?.status === "completed" ? "open" : "completed", note: s?.note });
  };

  return (
    <>
      <PageHeader
        title="Měsíce"
        subtitle="Měsíční přehled odvozený z transakcí."
        actions={
          <div className="inline-flex items-center gap-1.5">
            <button type="button" aria-label="Předchozí rok" title="Předchozí rok" className={roundKey} onClick={() => setYear(year - 1)}>
              <ChevronLeft className="size-4" />
            </button>
            <span className="num inline-flex h-9 min-w-20 items-center justify-center rounded-lg bg-display px-3 text-sm font-semibold text-display-ink">{year}</span>
            <button type="button" aria-label="Další rok" title="Další rok" className={roundKey} onClick={() => setYear(year + 1)}>
              <ChevronRight className="size-4" />
            </button>
          </div>
        }
      />

      <Card className="mb-4 p-5">
        <IncomeExpenseChart data={rows} currency={currency} height={200} highlight={months.includes(today) ? today : undefined} />
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                <th className="px-5 py-3 text-left font-medium">Měsíc</th>
                <th className="px-5 py-3 text-right font-medium">Příjmy</th>
                <th className="px-5 py-3 text-right font-medium">Výdaje</th>
                <th className="px-5 py-3 text-right font-medium">Úspora</th>
                <th className="px-5 py-3 text-right font-medium">Úspora %</th>
                <th className="px-5 py-3 text-right font-medium">Transakcí</th>
                <th className="px-5 py-3 text-left font-medium">Stav</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const isCurrent = r.month === today;
                const isFuture = r.month > today;
                const completed = statusMap.get(r.month)?.status === "completed";
                return (
                  <tr key={r.month} className={clsx(isCurrent ? "bg-net/5" : "hover:bg-slate-50/70", isFuture && "text-slate-400")}>
                    <td className="px-5 py-3">
                      <Link to={`/mesice/${r.month}`} className="font-medium hover:link">
                        {monthLabel(r.month, { withYear: false })}
                      </Link>
                      {isCurrent && <span className="ml-2 rounded-full bg-net/10 px-2 py-0.5 text-[11px] font-medium text-net-ink">aktuální</span>}
                    </td>
                    <Amount value={r.income} currency={currency} empty={r.transactionCount === 0} />
                    <Amount value={r.expense} currency={currency} empty={r.transactionCount === 0} />
                    <td className={clsx("num px-5 py-3 text-right font-medium", r.transactionCount && (r.net >= 0 ? "text-income-ink" : "text-expense-ink"))}>
                      {r.transactionCount ? formatMoney(r.net, currency, { signed: true }) : "—"}
                    </td>
                    <td className="num px-5 py-3 text-right text-slate-600">{r.savingsRate === null ? "—" : formatPercent(r.savingsRate)}</td>
                    <td className="num px-5 py-3 text-right text-slate-500">{r.transactionCount || "—"}</td>
                    <td className="px-5 py-3">
                      {!isFuture && (
                        <button
                          type="button"
                          onClick={() => toggleStatus(r.month)}
                          className={clsx(
                            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                            completed ? "bg-income/10 text-income-ink" : "text-slate-500 hover:bg-slate-100",
                          )}
                          title={completed ? "Označit jako otevřený" : "Označit jako zkontrolovaný"}
                        >
                          {completed ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />}
                          {completed ? "Zkontrolováno" : "Otevřený"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-semibold">
                <td className="px-5 py-3">Celkem {year}</td>
                <td className="num px-5 py-3 text-right">{formatMoney(total.income, currency)}</td>
                <td className="num px-5 py-3 text-right">{formatMoney(total.expense, currency)}</td>
                <td className="num px-5 py-3 text-right">{formatMoney(total.net, currency, { signed: true })}</td>
                <td className="num px-5 py-3 text-right">{total.savingsRate === null ? "—" : formatPercent(total.savingsRate)}</td>
                <td className="num px-5 py-3 text-right text-slate-500">{total.transactionCount}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}

function Amount({ value, currency, empty }: { value: number; currency: string; empty: boolean }) {
  return <td className="num px-5 py-3 text-right">{empty ? <span className="text-slate-300">—</span> : formatMoney(value, currency)}</td>;
}
