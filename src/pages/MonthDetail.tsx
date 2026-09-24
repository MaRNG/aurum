import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, CheckCircle2, Plus } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { useAccounts, useCategories, useMonthStatuses, useSettings, useTransactionsBetween } from "@/db/hooks";
import { monthStatusRepo, transactionsRepo } from "@/db/repositories";
import { expensesByCategory, summarize } from "@/domain/aggregate";
import type { Transaction } from "@/domain/schema";
import { currentMonthKey, monthBounds, monthLabel } from "@/domain/months";
import { SERIES_COLORS } from "@/domain/defaults";
import { formatMoney, formatPercent } from "@/lib/format";
import { CategoryBars } from "@/features/charts";
import { StatCard } from "@/features/StatCard";
import { TransactionForm } from "@/features/TransactionForm";
import { TransactionTable } from "@/features/TransactionTable";

export function MonthDetail() {
  const { month: param } = useParams();
  const navigate = useNavigate();
  const month = param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) ? param : currentMonthKey();
  const { from, to } = monthBounds(month);

  const { baseCurrency: currency } = useSettings();
  const categories = useCategories();
  const accounts = useAccounts();
  const statuses = useMonthStatuses();
  const txs = useTransactionsBetween(from, to);
  const status = statuses.find((s) => s.month === month);

  const [editing, setEditing] = useState<Transaction | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const sorted = useMemo(() => [...(txs ?? [])].sort((a, b) => b.date.localeCompare(a.date)), [txs]);
  const summary = summarize(month, txs ?? []);
  const byCategory = useMemo(() => expensesByCategory(txs ?? [], categories), [txs, categories]);
  const completed = status?.status === "completed";

  return (
    <>
      <Link to={`/mesice?y=${month.slice(0, 4)}`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Měsíce
      </Link>
      <PageHeader
        title={monthLabel(month)}
        actions={
          <>
            <MonthPicker value={month} onChange={(m) => navigate(`/mesice/${m}`, { replace: true })} />
            <Button
              variant={completed ? "secondary" : "primary"}
              onClick={() => monthStatusRepo.set({ month, status: completed ? "open" : "completed", note: status?.note })}
            >
              <CheckCircle2 className="size-4" />
              {completed ? "Znovu otevřít" : "Označit jako zkontrolovaný"}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-slate-900/8 ring-1 ring-slate-900/8 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Příjmy" accent={SERIES_COLORS.income} value={formatMoney(summary.income, currency)} />
        <StatCard label="Výdaje" accent={SERIES_COLORS.expense} value={formatMoney(summary.expense, currency)} />
        <StatCard label="Úspora" accent={SERIES_COLORS.net} value={formatMoney(summary.net, currency, { signed: true })} />
        <StatCard label="Míra úspor" value={summary.savingsRate === null ? "—" : formatPercent(summary.savingsRate)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Výdaje podle kategorií" />
          <CardBody>
            {byCategory.length ? <CategoryBars items={byCategory} currency={currency} /> : <EmptyState title="Žádné výdaje" />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Poznámka k měsíci" subtitle="Např. mimořádné výdaje, dovolená…" />
          <CardBody>
            <NoteEditor
              key={month + (status?.note ?? "")}
              initial={status?.note ?? ""}
              onSave={(note) => monthStatusRepo.set({ month, status: status?.status ?? "open", note: note || undefined })}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Stav" />
          <CardBody className="text-sm text-slate-600">
            <p>
              {completed
                ? "Měsíc je označen jako zkontrolovaný."
                : "Měsíc je otevřený. Až zadáš všechny transakce, označ jej jako zkontrolovaný."}
            </p>
            <p className="mt-2 text-slate-500">Počet transakcí: {summary.transactionCount}</p>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Transakce"
          action={
            <Button size="sm" variant="primary" onClick={() => { setEditing(null); setDuplicating(false); setFormOpen(true); }}>
              <Plus className="size-3.5" /> Přidat
            </Button>
          }
        />
        <div className="pt-3">
          {sorted.length ? (
            <TransactionTable
              transactions={sorted}
              categories={categories}
              accounts={accounts}
              onEdit={(tx) => { setEditing(tx); setDuplicating(false); setFormOpen(true); }}
              onDuplicate={(tx) => { setEditing(tx); setDuplicating(true); setFormOpen(true); }}
              onDelete={(tx) => confirm("Opravdu smazat transakci?") && transactionsRepo.remove(tx.id)}
              onCategoryChange={(tx, id) => transactionsRepo.bulkUpdate([tx.id], { categoryId: id })}
            />
          ) : (
            <EmptyState title="V tomto měsíci nejsou žádné transakce" />
          )}
        </div>
      </Card>

      <TransactionForm
        open={formOpen}
        transaction={editing}
        duplicate={duplicating}
        defaultDate={month === currentMonthKey() ? undefined : from}
        onClose={() => setFormOpen(false)}
      />
    </>
  );
}

function NoteEditor({ initial, onSave }: { initial: string; onSave: (note: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <Input
      value={value}
      placeholder="Bez poznámky"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value.trim() !== initial && onSave(value.trim())}
    />
  );
}
