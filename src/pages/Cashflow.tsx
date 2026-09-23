import { useMemo, useState } from "react";
import { Link } from "react-router";
import clsx from "clsx";
import { ArrowLeftRight } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { Segmented } from "@/components/ui/Tabs";
import { useAccounts, useCategories, useSettings, useTransactionsBetween } from "@/db/hooks";
import { accountFlows, cashflowSeries, cashflowStatement, type StatementLine } from "@/domain/cashflow";
import { currentMonthKey, monthBounds, monthLabel, monthOfDate, monthRange } from "@/domain/months";
import { formatMoney } from "@/lib/format";
import { CashflowChart } from "@/features/charts";

export function Cashflow() {
  const [month, setMonth] = useState(currentMonthKey());
  const [range, setRange] = useState<"12" | "24">("12");
  const months = useMemo(() => monthRange(month, Number(range)), [month, range]);
  const txs = useTransactionsBetween(monthBounds(months[0]!).from, monthBounds(month).to);
  const categories = useCategories();
  const accounts = useAccounts();
  const { baseCurrency: currency } = useSettings();

  const view = useMemo(() => {
    if (!txs) return null;
    const monthTxs = txs.filter((t) => monthOfDate(t.date) === month);
    return {
      series: cashflowSeries(months, txs),
      statement: cashflowStatement(monthTxs, categories),
      flows: accountFlows(monthTxs, accounts),
      hasData: monthTxs.length > 0,
    };
  }, [txs, month, months, categories, accounts]);

  const money = (n: number, signed = false) => formatMoney(n, currency, { signed });

  return (
    <>
      <PageHeader
        title="Cashflow"
        subtitle="Kolik peněz za měsíc přibylo nebo ubylo. Převody mezi vlastními účty se nezapočítávají."
        actions={<MonthPicker value={month} onChange={setMonth} />}
      />

      {view && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <Card className="xl:col-span-2">
            <CardHeader title={`Výkaz – ${monthLabel(month)}`} subtitle={month === currentMonthKey() ? "Průběžný stav" : undefined} />
            <CardBody>
              {view.hasData ? (
                <div className="num text-sm">
                  <StatementSection title="Příjmy" total={view.statement.totalIncome} lines={view.statement.income} sign={1} currency={currency} />
                  <StatementSection title="Výdaje" total={view.statement.totalExpense} lines={view.statement.expense} sign={-1} currency={currency} />
                  <div className="mt-3 flex justify-between border-t-2 border-slate-800 pt-2 text-base font-semibold">
                    <span>Cashflow</span>
                    <span className={view.statement.cashflow >= 0 ? "text-income-ink" : "text-expense-ink"}>{money(view.statement.cashflow, true)}</span>
                  </div>
                  {view.statement.transfers > 0 && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                      <ArrowLeftRight className="size-3.5" /> Převody mezi účty {money(view.statement.transfers)} – nezapočítány
                    </p>
                  )}
                </div>
              ) : (
                <EmptyState title="V tomto měsíci nejsou žádné transakce" />
              )}
            </CardBody>
          </Card>

          <div className="space-y-4 xl:col-span-3">
            <Card>
              <CardHeader title="Historie cashflow" action={<Segmented label="Období" value={range} onChange={setRange} options={[{ value: "12", label: "12 měs." }, { value: "24", label: "24 měs." }]} />} />
              <CardBody>
                <CashflowChart data={view.series} currency={currency} />
                <p className="mt-2 text-xs text-slate-500">
                  Kumulativně za období: <b className="num font-medium text-slate-700">{money(view.series[view.series.length - 1]?.cumulative ?? 0, true)}</b>
                  {" "}({monthLabel(months[0]!)} – {monthLabel(month)})
                </p>
              </CardBody>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title="Pohyby po účtech" subtitle="Převody se tu projeví jako přesun mezi účty; jejich součet přes všechny účty je nulový." />
              {view.flows.length ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="num w-full text-sm">
                    <thead>
                      <tr className="border-y border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                        <th className="px-5 py-2.5 text-left font-medium">Účet</th>
                        <th className="px-5 py-2.5 text-right font-medium">Příjmy</th>
                        <th className="px-5 py-2.5 text-right font-medium">Výdaje</th>
                        <th className="px-5 py-2.5 text-right font-medium">Převody dovnitř</th>
                        <th className="px-5 py-2.5 text-right font-medium">Převody ven</th>
                        <th className="px-5 py-2.5 text-right font-medium">Změna zůstatku</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {view.flows.map((f) => (
                        <tr key={f.account?.id ?? "none"}>
                          <td className="px-5 py-2.5 font-sans whitespace-nowrap">
                            {f.account ? (
                              <Link to={`/ucty/${f.account.id}`} className="hover:link">{f.account.name}</Link>
                            ) : (
                              <span className="text-slate-400">Bez účtu</span>
                            )}
                          </td>
                          <td className="px-5 py-2.5 text-right">{f.income ? money(f.income) : "—"}</td>
                          <td className="px-5 py-2.5 text-right">{f.expense ? money(-f.expense) : "—"}</td>
                          <td className="px-5 py-2.5 text-right text-slate-600">{f.transfersIn ? money(f.transfersIn, true) : "—"}</td>
                          <td className="px-5 py-2.5 text-right text-slate-600">{f.transfersOut ? money(-f.transfersOut) : "—"}</td>
                          <td className={clsx("px-5 py-2.5 text-right font-medium", f.net > 0 && "text-income-ink", f.net < 0 && "text-expense-ink")}>{money(f.net, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="Žádné pohyby" />
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function StatementSection({ title, total, lines, sign, currency }: { title: string; total: number; lines: StatementLine[]; sign: 1 | -1; currency: string }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between font-medium">
        <span className="font-sans">{title}</span>
        <span>{formatMoney(sign * total, currency, { signed: true })}</span>
      </div>
      <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
        {lines.map((l) => (
          <li key={l.categoryId ?? "none"} className="flex justify-between pl-3">
            <span className="inline-flex items-center gap-1.5 font-sans">
              <span className="size-2 rounded-sm" style={{ background: l.color }} />
              {l.name}
            </span>
            <span>{formatMoney(sign * l.total, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

