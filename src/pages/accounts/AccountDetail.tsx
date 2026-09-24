import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import clsx from "clsx";
import { ArrowLeft, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { useAccounts, useAllTransactions, useCategories } from "@/db/hooks";
import { accountsRepo, transactionsRepo } from "@/db/repositories";
import { accountBalance, ACCOUNT_TYPE_LABEL, balanceHistory, hasKnownBalance, touchesAccount, txDelta } from "@/domain/accounts";
import { currentMonthKey, monthRange } from "@/domain/months";
import type { Transaction } from "@/domain/schema";
import { formatDate, formatMoney } from "@/lib/format";
import { AccountDialog } from "@/features/AccountDialog";
import { MultiLineChart } from "@/features/charts";
import { TransactionForm } from "@/features/TransactionForm";
import { CategoryLabel, TypeBadge } from "@/features/TransactionTable";

const PAGE = 100;

export function AccountDetail() {
  const { id } = useParams();
  const accounts = useAccounts();
  const categories = useCategories();
  const txs = useAllTransactions();
  const account = accounts.find((a) => a.id === id);
  const [editing, setEditing] = useState(false);
  const [txEdit, setTxEdit] = useState<Transaction | null | "new">(null);
  const [txDuplicate, setTxDuplicate] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const view = useMemo(() => {
    if (!txs || !account) return null;
    const own = txs.filter((t) => touchesAccount(t, account.id));
    // Průběžný zůstatek po každé transakci (vzestupně), zobrazení sestupně
    const sorted = [...own].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    let running = accountBalance(account, txs, "0000-00-00");
    const withBalance = sorted.map((t) => {
      running += txDelta(t, account.id);
      return { tx: t, delta: txDelta(t, account.id), balance: Math.round(running * 100) / 100 };
    });
    withBalance.reverse();
    const months = monthRange(currentMonthKey(), 12);
    return { rows: withBalance, balance: accountBalance(account, txs), history: balanceHistory(account, txs, months) };
  }, [txs, account]);

  if (!account) {
    return accounts.length ? (
      <Card>
        <EmptyState title="Účet nenalezen">
          <Link to="/ucty" className="link">Zpět na účty</Link>
        </EmptyState>
      </Card>
    ) : null;
  }

  const catMap = new Map(categories.map((c) => [c.id, c]));
  const accMap = new Map(accounts.map((a) => [a.id, a]));
  const known = hasKnownBalance(account);

  async function remove() {
    if (!account || !confirm(`Smazat účet „${account.name}“?`)) return;
    try {
      await accountsRepo.remove(account.id);
      history.back();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <Link to="/ucty" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Účty
      </Link>
      <PageHeader
        title={account.name}
        subtitle={`${ACCOUNT_TYPE_LABEL[account.type]} · ${account.currency}${account.archived ? " · archivovaný" : ""}${
          known && account.initialBalanceDate ? ` · počáteční zůstatek ${formatMoney(account.initialBalance!, account.currency)} k ${formatDate(account.initialBalanceDate)}` : ""
        }`}
        actions={
          <>
            <Button onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Upravit
            </Button>
            <Button onClick={remove} className="!text-red-600" disabled={(view?.rows.length ?? 0) > 0} title={(view?.rows.length ?? 0) > 0 ? "Účet s transakcemi nelze smazat – můžeš ho archivovat" : undefined}>
              <Trash2 className="size-4" /> Smazat
            </Button>
            <Button variant="primary" onClick={() => setTxEdit("new")}>
              <Plus className="size-4" /> Transakce
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-xl bg-face p-5 ring-1 ring-slate-900/8">
          <p className="text-xs font-medium text-slate-500">Aktuální zůstatek</p>
          <p className="num mt-2 text-3xl font-semibold tracking-tight">
            {known ? formatMoney(view?.balance ?? 0, account.currency) : <span className="text-slate-400">neznámý</span>}
          </p>
          {!known && (
            <p className="mt-2 text-xs text-slate-500">
              Zadej počáteční zůstatek v úpravě účtu – pak se zobrazí i průběžný zůstatek a vývoj.
            </p>
          )}
        </div>
        <Card className="xl:col-span-2">
          <CardHeader title="Vývoj zůstatku" subtitle="Ke konci měsíce" />
          <CardBody>
            {known && view ? (
              <MultiLineChart rows={view.history} currency={account.currency} height={180} series={[{ key: "balance", name: account.name, color: "#3a3934" }]} />
            ) : (
              <p className="text-sm text-slate-500">Není k dispozici bez počátečního zůstatku.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader title="Pohyby na účtu" />
        {view?.rows.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                  <th className="px-5 py-2.5 text-left font-medium">Datum</th>
                  <th className="px-5 py-2.5 text-left font-medium">Popis</th>
                  <th className="px-5 py-2.5 text-left font-medium">Kategorie / protiúčet</th>
                  <th className="px-5 py-2.5 text-left font-medium">Typ</th>
                  <th className="px-5 py-2.5 text-right font-medium">Pohyb</th>
                  {known && <th className="px-5 py-2.5 text-right font-medium">Zůstatek</th>}
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {view.rows.slice(0, limit).map(({ tx, delta, balance }) => {
                  const other = tx.type === "transfer" ? accMap.get(tx.accountId === account.id ? tx.destinationAccountId ?? "" : tx.accountId ?? "") : undefined;
                  return (
                    <tr key={tx.id} className="group">
                      <td className="num px-5 py-2.5 whitespace-nowrap text-slate-500">{formatDate(tx.date)}</td>
                      <td className="max-w-64 truncate px-5 py-2.5">{tx.description || "—"}</td>
                      <td className="px-5 py-2.5 text-slate-600">
                        {tx.type === "transfer" ? (
                          <span className="text-slate-500">
                            {delta < 0 ? "→" : "←"} {other?.name ?? "?"}
                          </span>
                        ) : (
                          <CategoryLabel category={tx.categoryId ? catMap.get(tx.categoryId) : undefined} />
                        )}
                      </td>
                      <td className="px-5 py-2.5">
                        <TypeBadge type={tx.type} />
                      </td>
                      <td className={clsx("num px-5 py-2.5 text-right font-medium whitespace-nowrap", delta > 0 && "text-income-ink")}>
                        {formatMoney(delta, tx.currency, { signed: true })}
                      </td>
                      {known && <td className="num px-5 py-2.5 text-right whitespace-nowrap text-slate-600">{formatMoney(balance, account.currency)}</td>}
                      <td className="w-0 px-3 py-2.5 whitespace-nowrap">
                        <div className="flex justify-end gap-0.5 opacity-60 group-hover:opacity-100">
                          <IconButton label="Upravit" onClick={() => { setTxDuplicate(false); setTxEdit(tx); }}>
                            <Pencil className="size-3.5" />
                          </IconButton>
                          <IconButton label="Duplikovat" onClick={() => { setTxDuplicate(true); setTxEdit(tx); }}>
                            <Copy className="size-3.5" />
                          </IconButton>
                          <IconButton label="Smazat" onClick={() => confirm("Opravdu smazat transakci?") && transactionsRepo.remove(tx.id)} className="hover:!bg-red-50 hover:!text-red-600">
                            <Trash2 className="size-3.5" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {view.rows.length > limit && (
              <div className="border-t border-slate-100 p-3 text-center">
                <Button size="sm" onClick={() => setLimit((l) => l + PAGE)}>Načíst další ({view.rows.length - limit})</Button>
              </div>
            )}
          </div>
        ) : (
          <EmptyState title="Na účtu zatím nejsou žádné pohyby" />
        )}
      </Card>

      <AccountDialog account={editing ? account : null} onClose={() => setEditing(false)} />
      <TransactionForm
        open={txEdit !== null}
        transaction={txEdit === "new" ? null : txEdit}
        duplicate={txDuplicate && txEdit !== "new"}
        defaultAccountId={account.id}
        onClose={() => setTxEdit(null)}
      />
    </>
  );
}
