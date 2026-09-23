import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Link, useSearchParams } from "react-router";
import { Check, HardDriveDownload, Plus, Receipt, Sparkles } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { useAccounts, useAllTransactions, useBudgets, useCategories, useFirstTransactionDate, useMonthStatuses, useSettings, useTransactionsBetween } from "@/db/hooks";
import { monthStatusRepo } from "@/db/repositories";
import { averageMonthlyExpense, expensesByCategory, summarizeMonths } from "@/domain/aggregate";
import { computeReserve } from "@/domain/accounts";
import { buildForecastModel } from "@/domain/forecastModel";
import { computeInsights, findMissingMonths, monthsWithData } from "@/domain/insights";
import { addMonths, currentMonthKey, monthBounds, monthLabel, monthLabelLower, monthOfDate, monthRange, todayIso } from "@/domain/months";
import { formatDate, formatMoney, formatMonths, formatPercent, formatRange } from "@/lib/format";
import { CategoryBars, IncomeExpenseChart } from "@/features/charts";
import { InsightItem } from "@/features/InsightItem";
import { TransactionForm } from "@/features/TransactionForm";
import { TransactionTable } from "@/features/TransactionTable";

const CHART_MONTHS = 6;
/** Pro insights potřebujeme srovnávací období (6 měsíců) + zvolený měsíc; pro upozornění 12 měsíců zpět. */
const LOOKBACK_MONTHS = 12;

export function Dashboard() {
  const [params, setParams] = useSearchParams();
  const today = currentMonthKey();
  const month = params.get("m") ?? today;
  const setMonth = (m: string) => setParams(m === today ? {} : { m }, { replace: true });

  const settings = useSettings();
  const currency = settings.baseCurrency;
  const categories = useCategories();
  const accounts = useAccounts();
  const statuses = useMonthStatuses();
  const firstDate = useFirstTransactionDate();
  const budgets = useBudgets();
  const allTxs = useAllTransactions();

  // Výhled: rezerva (potřebuje celou historii kvůli zůstatkům) a odhad příštího měsíce
  const outlook = useMemo(() => {
    if (!allTxs) return null;
    const reserve = computeReserve(accounts, allTxs, averageMonthlyExpense(allTxs, today).avg, currency);
    const model = buildForecastModel(allTxs, categories, budgets, today, 2);
    return { reserve, next: model.periods[1]! };
  }, [allTxs, accounts, today, currency, categories, budgets]);

  const windowStart = addMonths(month < today ? month : today, -LOOKBACK_MONTHS);
  const windowEnd = month > today ? month : today;
  const txs = useTransactionsBetween(monthBounds(windowStart).from, monthBounds(windowEnd).to);

  const [formOpen, setFormOpen] = useState(false);

  const view = useMemo(() => {
    if (!txs) return null;
    const monthTxs = txs.filter((t) => monthOfDate(t.date) === month);
    const chartMonths = monthRange(month, CHART_MONTHS);
    const series = summarizeMonths(chartMonths, txs);
    const current = series[series.length - 1]!;
    const previous = series[series.length - 2]!;
    const recent = [...monthTxs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
    return {
      current,
      previous,
      series,
      recent,
      byCategory: expensesByCategory(monthTxs, categories),
      insights: computeInsights({ month, today: todayIso(), txs, categories, currency, budgets }),
      missing: findMissingMonths(monthsWithData(txs), firstDate ? monthOfDate(firstDate) : null, statuses, today),
    };
  }, [txs, month, today, categories, currency, statuses, firstDate, budgets]);

  const inProgress = month === today;
  const currentStatus = statuses.find((st) => st.month === month);
  const closed = currentStatus?.status === "completed";
  const isEmptyDb = firstDate === null;

  return (
    <>
      <PageHeader
        title="Přehled"
        subtitle={inProgress ? "Aktuální měsíc – hodnoty jsou průběžné." : `Souhrn za ${monthLabelLower(month)}.`}
        actions={
          <>
            <MonthPicker value={month} onChange={setMonth} />
            <Button variant="primary" onClick={() => setFormOpen(true)}>
              <Plus className="size-4" /> Transakce
            </Button>
          </>
        }
      />

      {isEmptyDb && (
        <Card className="mb-6">
          <EmptyState icon={<Sparkles className="size-5" />} title="Vítej! Zatím tu nejsou žádná data.">
            Začni přidáním první transakce. Vše se ukládá pouze lokálně v tomto prohlížeči.
            <div className="mt-4">
              <Button variant="primary" onClick={() => setFormOpen(true)}>
                <Plus className="size-4" /> Přidat první transakci
              </Button>
            </div>
          </EmptyState>
        </Card>
      )}

      {view && view.missing.length > 0 && (
        <div className="mb-5 divide-y divide-slate-900/8 rounded-xl bg-face ring-1 ring-slate-900/8">
          {view.missing.map(({ month: m }) => (
            <div key={m} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm text-slate-800">
              <span className="lamp bg-expense" aria-hidden />
              <span className="flex-1">Chybí záznam za {monthLabelLower(m)}.</span>
              <Button size="sm" variant="ghost" onClick={() => setMonth(m)}>
                Zobrazit
              </Button>
              <Button size="sm" variant="secondary" onClick={() => monthStatusRepo.set({ month: m, status: "completed" })}>
                Označit jako zkontrolovaný
              </Button>
            </div>
          ))}
        </div>
      )}

      {!isEmptyDb && firstDate !== undefined && backupDue(settings.lastExportAt) && (
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm text-slate-700">
          <HardDriveDownload className="size-4 shrink-0 text-slate-500" />
          <span className="flex-1">
            {settings.lastExportAt
              ? `Poslední záloha je z ${formatDate(settings.lastExportAt.slice(0, 10))}.`
              : "Data zatím nejsou zálohovaná."}{" "}
            <span className="text-slate-500">Jsou uložená jen v tomto prohlížeči – doporučuji pravidelně stáhnout JSON zálohu.</span>
          </span>
          <Link to="/data" className="text-xs link">
            Zálohovat
          </Link>
        </div>
      )}

      {view && (
        <>
          <MonthDisplay
            income={view.current.income}
            expense={view.current.expense}
            net={view.current.net}
            savingsRate={view.current.savingsRate}
            previous={view.previous}
            inProgress={inProgress}
            month={month}
            currency={currency}
            register={
              outlook && (
                <>
                  <RegisterLink to="/ucty" label="Finanční rezerva">
                    {outlook.reserve.months !== null ? (
                      <>
                        <span className="font-semibold text-display-ink">{formatMonths(outlook.reserve.months)}</span>{" "}
                        <span className="max-md:hidden">
                          ({formatMoney(outlook.reserve.liquid, currency)} ÷ {formatMoney(outlook.reserve.avgMonthlyExpense, currency)} průměrných výdajů)
                        </span>
                      </>
                    ) : (
                      "zadej u účtů zůstatek"
                    )}
                  </RegisterLink>
                  <RegisterLink to="/predikce" label={`Odhad výdajů – ${monthLabelLower(outlook.next.month)}`}>
                    {outlook.next.expense.status === "ok" ? (
                      <>
                        <span className="font-semibold text-display-ink">{formatRange(outlook.next.expense.low, outlook.next.expense.high, currency)}</span>{" "}
                        <span className="max-md:hidden">· odhad, ne jistota ({outlook.next.expense.method.label.toLowerCase()})</span>
                      </>
                    ) : (
                      "potřebuji více historie"
                    )}
                  </RegisterLink>
                </>
              )
            }
            action={
              month < today && !isEmptyDb ? (
                closed ? (
                  <span className="inline-flex items-center gap-2 text-xs font-medium text-display-dim">
                    <span className="lamp bg-[#7fbf6e]" aria-hidden /> Zkontrolováno
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => monthStatusRepo.set({ ...currentStatus, month, status: "completed" })}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#34342f] px-3.5 text-xs font-semibold text-display-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(0_0_0/0.5)] transition-colors hover:bg-[#3f3f39] active:translate-y-px"
                  >
                    <Check className="size-3.5" /> Označit jako zkontrolovaný
                  </button>
                )
              ) : null
            }
          />

          <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-slate-900/8 ring-1 ring-slate-900/8 xl:grid-cols-5">
            <Card flush className="xl:col-span-3">
              <CardHeader title="Příjmy vs. výdaje" subtitle={`Posledních ${CHART_MONTHS} měsíců`} />
              <CardBody>
                <IncomeExpenseChart data={view.series} currency={currency} highlight={month} />
              </CardBody>
            </Card>
            <Card flush className="xl:col-span-2">
              <CardHeader title="Výdaje podle kategorií" subtitle={monthLabel(month)} />
              <CardBody>
                {view.byCategory.length ? (
                  <CategoryBars items={view.byCategory} currency={currency} />
                ) : (
                  <EmptyState title="Žádné výdaje v tomto měsíci" />
                )}
              </CardBody>
            </Card>
            <Card flush className="xl:col-span-3">
              <CardHeader
                title="Poslední transakce"
                subtitle={monthLabel(month)}
                action={
                  <Link to={`/transakce?month=${month}`} className="text-xs link">
                    Zobrazit vše
                  </Link>
                }
              />
              <div className="pb-2 pt-3">
                {view.recent.length ? (
                  <TransactionTable compact transactions={view.recent} categories={categories} accounts={accounts} />
                ) : (
                  <EmptyState icon={<Receipt className="size-5" />} title="Žádné transakce" />
                )}
              </div>
            </Card>
            <Card flush className="xl:col-span-2">
              <CardHeader
                title="Rychlé insights"
                subtitle="Vypočteno z tvých dat"
                action={
                  <Link to="/insights" className="text-xs link">
                    Všechny insights
                  </Link>
                }
              />
              <CardBody>
                {view.insights.length ? (
                  <ul className="divide-y divide-slate-100">
                    {view.insights.map((i) => (
                      <InsightItem key={i.id} insight={i} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">
                    Pro srovnání potřebuji alespoň 3 předchozí měsíce s daty. Nic neobvyklého zatím nevidím.
                  </p>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}

      <TransactionForm
        open={formOpen}
        transaction={null}
        defaultDate={inProgress ? undefined : monthBounds(month).from}
        onClose={() => setFormOpen(false)}
      />
    </>
  );
}

const BACKUP_INTERVAL_DAYS = 30;

function backupDue(lastExportAt: string | undefined): boolean {
  return !lastExportAt || Date.now() - Date.parse(lastExportAt) > BACKUP_INTERVAL_DAYS * 86_400_000;
}

function Delta({ current, previous, good }: { current: number; previous: number; good: "up" | "down" }) {
  if (previous <= 0) return <>předchozí měsíc bez dat</>;
  const diff = current / previous - 1;
  const better = good === "up" ? diff >= 0 : diff <= 0;
  return (
    <>
      <span className={clsx("font-semibold", better ? "text-[#9fd08f]" : "text-[#ff9d84]")}>{formatPercent(diff, { signed: true })}</span> oproti
      předchozímu
    </>
  );
}

/**
 * Displej měsíce: bilance jako výpočet „příjmy − výdaje = bilance“, tak jak ji aplikace počítá.
 * Převody se nezapočítávají.
 */
function MonthDisplay({
  income,
  expense,
  net,
  savingsRate,
  previous,
  inProgress,
  month,
  currency,
  register,
  action,
}: {
  register?: ReactNode;
  action?: ReactNode;
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null;
  previous: { income: number; expense: number };
  inProgress: boolean;
  month: string;
  currency: string;
}) {
  const hint = (value: number, prev: number, good: "up" | "down") =>
    inProgress ? "průběžně za tento měsíc" : <Delta current={value} previous={prev} good={good} />;
  return (
    <section aria-label={`Bilance – ${monthLabelLower(month)}`} className="rounded-2xl bg-display p-1.5 text-display-ink shadow-[0_1px_0_rgb(255_255_255/0.6)]">
      <div className="rounded-xl bg-[#191917] px-5 pt-5 pb-5 shadow-[inset_0_2px_6px_rgb(0_0_0/0.45)] sm:px-7 sm:pt-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-display-dim">
          <span className={clsx("lamp", inProgress ? "border border-display-dim bg-transparent" : "bg-display-ink")} aria-hidden />
          <span>{inProgress ? "Průběžný stav" : "Uplynulý měsíc"} · {monthLabel(month)}</span>
          <span className="ml-auto max-sm:hidden">Příjmy − výdaje, bez převodů</span>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-y-5 sm:grid-cols-[1fr_auto_1fr_auto_1.35fr] sm:items-end sm:gap-x-5">
          <Readout label="Příjmy" lamp="bg-[#7fbf6e]" value={formatMoney(income, currency)} hint={hint(income, previous.income, "up")} />
          <Operator>−</Operator>
          <Readout op="−" label="Výdaje" lamp="bg-[#f07a5e]" value={formatMoney(expense, currency)} hint={hint(expense, previous.expense, "down")} />
          <Operator>=</Operator>
          <Readout
            op="="
            label="Čistá bilance"
            value={formatMoney(net, currency, { signed: true })}
            hint={savingsRate === null ? "míru úspor nelze bez příjmu spočítat" : <>míra úspor <span className="font-semibold text-display-ink">{formatPercent(savingsRate)}</span></>}
            large
          />
        </div>
        {(register || action) && (
          <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-white/8 pt-4">
            {register}
            {action && <div className="ml-auto">{action}</div>}
          </div>
        )}
      </div>
    </section>
  );
}

function Operator({ children }: { children: string }) {
  return (
    <span aria-hidden className={clsx("max-sm:hidden pb-7 text-3xl font-light", children === "=" ? "text-key" : "text-display-dim")}>
      {children}
    </span>
  );
}

function RegisterLink({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  return (
    <Link to={to} className="group min-w-0 text-xs text-display-dim transition-colors hover:text-display-ink">
      <span className="underline decoration-white/15 underline-offset-3 group-hover:decoration-white/60">{label}</span>{" "}
      <span className="num">{children}</span>
    </Link>
  );
}

function Readout({ label, value, hint, lamp, large, op }: { label: string; value: string; hint: ReactNode; lamp?: string; large?: boolean; op?: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-xs font-medium text-display-dim">
        {lamp && <span className={clsx("lamp", lamp)} aria-hidden />}
        {label}
      </p>
      <p
        className={clsx(
          "num mt-1.5 leading-none font-semibold tracking-[-0.03em] whitespace-nowrap",
          large ? "text-[2.75rem] sm:text-[3.25rem]" : "text-[1.75rem] sm:text-[2rem]",
        )}
      >
        {op && (
          <span aria-hidden className={clsx("mr-2 font-light sm:hidden", op === "=" ? "text-key" : "text-display-dim")}>
            {op}
          </span>
        )}
        {value}
      </p>
      <p className="mt-2 text-xs text-display-dim">{hint}</p>
    </div>
  );
}
