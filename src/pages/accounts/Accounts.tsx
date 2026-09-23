import { useMemo, useState } from "react";
import { Link } from "react-router";
import clsx from "clsx";
import { Archive, ChevronRight, Landmark, Plus, ShieldCheck } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { useAccounts, useAllTransactions, useSettings } from "@/db/hooks";
import { accountBalance, ACCOUNT_TYPE_LABEL, balanceHistory, computeReserve, hasKnownBalance, touchesAccount, txDelta } from "@/domain/accounts";
import { averageMonthlyExpense } from "@/domain/aggregate";
import { CATEGORY_PALETTE } from "@/domain/defaults";
import { currentMonthKey, monthLabelLower, monthOfDate, monthRange } from "@/domain/months";
import type { Account } from "@/domain/schema";
import { formatMoney, formatMonths } from "@/lib/format";
import { AccountDialog } from "@/features/AccountDialog";
import { MultiLineChart } from "@/features/charts";

export function Accounts() {
  const accounts = useAccounts();
  const txs = useAllTransactions();
  const { baseCurrency: currency } = useSettings();
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const today = currentMonthKey();

  const view = useMemo(() => {
    if (!txs) return null;
    const active = accounts.filter((a) => !a.archived);
    const monthTxs = txs.filter((t) => monthOfDate(t.date) === today);
    const rows = active.map((a) => ({
      account: a,
      balance: accountBalance(a, txs),
      monthChange: monthTxs.filter((t) => touchesAccount(t, a.id)).reduce((s, t) => s + txDelta(t, a.id), 0),
      count: txs.filter((t) => touchesAccount(t, a.id)).length,
    }));
    const { months: expenseMonths, avg } = averageMonthlyExpense(txs, today);
    const reserve = computeReserve(accounts, txs, avg, currency);
    const known = rows.filter((r) => hasKnownBalance(r.account) && r.account.currency === currency);
    const netWorth = known.reduce((s, r) => s + r.balance, 0);

    const months = monthRange(today, 12);
    const histAccounts = known.slice(0, CATEGORY_PALETTE.length);
    const perAccount = histAccounts.map((r) => balanceHistory(r.account, txs, months));
    const history = months.map((m, i) => {
      const row: { month: string } & Record<string, number> = { month: m } as never;
      for (const [j, r] of histAccounts.entries()) row[r.account.id] = perAccount[j]![i]!.balance;
      return row;
    });
    return { rows, reserve, expenseMonths, netWorth, known, histAccounts, history };
  }, [txs, accounts, today, currency]);

  const archived = accounts.filter((a) => a.archived);

  return (
    <>
      <PageHeader
        title="Účty"
        subtitle="Zůstatky se počítají z počátečního zůstatku a transakcí včetně převodů."
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Nový účet
          </Button>
        }
      />

      {view && (
        <>
          <div className="overflow-hidden rounded-xl ring-1 ring-slate-900/8">
            <div className="grid grid-cols-1 gap-px bg-slate-900/8 sm:grid-cols-3">
              <Register
                label="Celkový zůstatek"
                value={view.known.length ? formatMoney(view.netWorth, currency) : "—"}
                hint={view.known.length ? `Součet ${view.known.length} účtů se známým zůstatkem` : "Zadej u účtů počáteční zůstatek"}
              />
              <Register
                label="Likvidní prostředky"
                value={view.reserve.included.length ? formatMoney(view.reserve.liquid, currency) : "—"}
                hint="Běžné, spořicí účty a hotovost − dluh na kartách"
              />
              <Register
                label="Rezerva"
                value={view.reserve.months === null ? "—" : formatMonths(view.reserve.months)}
                hint={view.reserve.months === null ? "Chybí zůstatky nebo výdaje" : "Na kolik měsíců průměrných výdajů vystačí"}
              />
            </div>
            <ul className="divide-y divide-slate-900/8 border-t border-slate-900/8 bg-face">
              {view.rows.map((r) => (
                <li key={r.account.id}>
                  <Link to={`/ucty/${r.account.id}`} className="group flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4 transition-colors hover:bg-slate-50">
                    <div className="min-w-44 flex-1">
                      <p className="font-semibold text-slate-900">{r.account.name}</p>
                      <p className="text-xs text-slate-500">
                        {ACCOUNT_TYPE_LABEL[r.account.type]} · {r.account.currency}
                      </p>
                    </div>
                    <p className="num text-xs text-slate-500 max-sm:order-last max-sm:w-full">
                      Tento měsíc{" "}
                      <span className={clsx("font-medium", r.monthChange > 0 && "text-income-ink", r.monthChange < 0 && "text-expense-ink")}>
                        {formatMoney(r.monthChange, r.account.currency, { signed: true })}
                      </span>{" "}
                      · {r.count} transakcí
                    </p>
                    <p className="num w-36 text-right text-lg font-semibold tracking-[-0.02em] max-sm:w-auto">
                      {hasKnownBalance(r.account) ? formatMoney(r.balance, r.account.currency) : <span className="text-slate-500">neznámý</span>}
                    </p>
                    <ChevronRight className="size-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-700" />
                  </Link>
                </li>
              ))}
              {!view.rows.length && (
                <li>
                  <EmptyState icon={<Landmark className="size-5" />} title="Žádné aktivní účty" />
                </li>
              )}
            </ul>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader title="Vývoj zůstatků" subtitle="Stav ke konci měsíce, posledních 12 měsíců" />
              <CardBody>
                {view.histAccounts.length ? (
                  <MultiLineChart
                    rows={view.history}
                    currency={currency}
                    series={view.histAccounts.map((r, i) => ({ key: r.account.id, name: r.account.name, color: CATEGORY_PALETTE[i]! }))}
                  />
                ) : (
                  <EmptyState title="Graf potřebuje účty se zadaným počátečním zůstatkem" />
                )}
              </CardBody>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <ShieldCheck className="size-4 text-net" /> Jak se počítá rezerva
                  </span>
                }
              />
              <CardBody className="text-sm">
                <dl className="space-y-1.5">
                  {view.reserve.included.map((x) => (
                    <Row key={x.account.id} label={x.account.name} value={formatMoney(x.balance, currency)} />
                  ))}
                  {view.reserve.debt.map((x) => (
                    <Row key={x.account.id} label={`${x.account.name} (dluh)`} value={formatMoney(x.balance, currency)} negative />
                  ))}
                  <Row label="Likvidní prostředky" value={formatMoney(view.reserve.liquid, currency)} strong />
                  <Row
                    label={`Průměrné měsíční výdaje (${view.expenseMonths.length} měs.)`}
                    value={formatMoney(view.reserve.avgMonthlyExpense, currency)}
                  />
                  <Row
                    label="Rezerva"
                    value={view.reserve.months === null ? "—" : formatMonths(view.reserve.months)}
                    strong
                  />
                </dl>
                <p className="mt-3 text-xs text-slate-500">
                  Rezerva = likvidní prostředky ÷ průměrné měsíční výdaje za uzavřené měsíce s daty
                  {view.expenseMonths.length > 0 && ` (${view.expenseMonths.map(monthLabelLower).join(", ")})`}. Investiční účty se
                  nezapočítávají.
                </p>
                {view.reserve.excluded.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
                    {view.reserve.excluded.map((x) => (
                      <li key={x.account.id}>
                        Vynecháno: {x.account.name} – {x.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          {archived.length > 0 && (
            <div className="mt-4">
              <button type="button" onClick={() => setShowArchived((v) => !v)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
                <Archive className="size-4" /> Archivované účty ({archived.length})
              </button>
              {showArchived && (
                <ul className="mt-2 space-y-1 text-sm">
                  {archived.map((a) => (
                    <li key={a.id}>
                      <Link to={`/ucty/${a.id}`} className="text-slate-600 hover:underline">
                        {a.name}
                      </Link>{" "}
                      <span className="num text-slate-400">{txs && hasKnownBalance(a) ? formatMoney(accountBalance(a, txs), a.currency) : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      <AccountDialog account={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function Row({ label, value, strong, negative }: { label: string; value: string; strong?: boolean; negative?: boolean }) {
  return (
    <div className={clsx("flex justify-between gap-4", strong && "border-t border-slate-100 pt-1.5 font-medium")}>
      <dt className={strong ? "text-slate-800" : "text-slate-500"}>{label}</dt>
      <dd className={clsx("num", negative && "text-expense-ink")}>{value}</dd>
    </div>
  );
}

function Register({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-face px-5 py-4.5">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <p className="num mt-2 text-[1.625rem] leading-none font-semibold tracking-[-0.02em] text-slate-900">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
