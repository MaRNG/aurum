import { useMemo, useState, type FormEvent } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { ZodError } from "zod";
import { Card } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/PageHeader";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { useBudgets, useCategories, useSettings, useTransactionsBetween } from "@/db/hooks";
import { budgetsRepo } from "@/db/repositories";
import { groupByMonth } from "@/domain/aggregate";
import { budgetStatuses, MIN_DAYS_FOR_PROJECTION, type BudgetStatus } from "@/domain/budgets";
import { addMonths, currentMonthKey, monthBounds, monthLabel, monthRange, todayIso } from "@/domain/months";
import type { Budget } from "@/domain/schema";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";

const HISTORY = 6;

export function Budgets() {
  const [month, setMonth] = useState(currentMonthKey());
  const budgets = useBudgets();
  const categories = useCategories();
  const { baseCurrency: currency } = useSettings();
  const historyStart = addMonths(month, -HISTORY);
  const txs = useTransactionsBetween(monthBounds(historyStart).from, monthBounds(month).to);
  const [editing, setEditing] = useState<Budget | "new" | null>(null);

  const today = todayIso();
  const view = useMemo(() => {
    if (!txs) return null;
    const grouped = groupByMonth(txs);
    const statuses = budgetStatuses(budgets, categories, grouped.get(month) ?? [], month, today);
    // Historie: v kolika z posledních N uzavřených měsíců s daty byl rozpočet dodržen
    const past = monthRange(addMonths(month, -1), HISTORY).filter((m) => grouped.has(m));
    const history = new Map(
      budgets.map((b) => {
        const results = past.map((m) => {
          const spent = (grouped.get(m) ?? []).filter((t) => t.type === "expense" && t.categoryId === b.categoryId).reduce((a, t) => a + t.amount, 0);
          return { month: m, spent, ok: spent <= b.amount };
        });
        return [b.id, results] as const;
      }),
    );
    return { statuses, history };
  }, [txs, budgets, categories, month, today]);

  const totalBudget = budgets.reduce((a, b) => a + b.amount, 0);
  const totalSpent = view?.statuses.reduce((a, s) => a + s.spent, 0) ?? 0;

  async function remove(b: Budget) {
    if (confirm("Smazat rozpočet?")) await budgetsRepo.remove(b.id);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <MonthPicker value={month} onChange={setMonth} />
        <Button variant="primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Nový rozpočet
        </Button>
      </div>

      {budgets.length === 0 ? (
        <Card>
          <EmptyState icon={<Target className="size-5" />} title="Zatím nemáš žádné rozpočty">
            Nastav měsíční limit pro kategorie, které chceš hlídat – třeba jídlo nebo zábavu.
            <div className="mt-4">
              <Button variant="primary" onClick={() => setEditing("new")}>
                <Plus className="size-4" /> Přidat rozpočet
              </Button>
            </div>
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card className="mb-4 p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-slate-500">Celkem za rozpočtované kategorie – {monthLabel(month)}</p>
                <p className="num mt-1 text-2xl font-semibold">
                  {formatMoney(totalSpent, currency)} <span className="text-base font-normal text-slate-400">/ {formatMoney(totalBudget, currency)}</span>
                </p>
              </div>
              <p className="num text-sm text-slate-500">{formatPercent(totalBudget ? totalSpent / totalBudget : 0, { digits: 0 })} vyčerpáno</p>
            </div>
            <ProgressBar ratio={totalBudget ? totalSpent / totalBudget : 0} className="mt-3" />
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {view?.statuses.map((s) => (
              <BudgetCard
                key={s.budget.id}
                s={s}
                currency={currency}
                history={view.history.get(s.budget.id) ?? []}
                onEdit={() => setEditing(s.budget)}
                onDelete={() => remove(s.budget)}
              />
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Odhad překročení je lineární: dosavadní čerpání ÷ uplynulé dny × dny v měsíci. Počítá se až od {MIN_DAYS_FOR_PROJECTION}. dne
            měsíce a nerovnoměrné platby (např. nájem na začátku měsíce) jej zkreslují.
          </p>
        </>
      )}

      <BudgetDialog budget={editing} existing={budgets} onClose={() => setEditing(null)} />
    </>
  );
}

function ProgressBar({ ratio, className, projected }: { ratio: number; projected?: number | null; className?: string }) {
  const color = ratio > 1 ? "bg-expense" : ratio >= 0.9 ? "bg-amber-500" : "bg-income";
  return (
    <div className={clsx("relative h-2 overflow-hidden rounded-full bg-slate-100", className)}>
      {projected != null && projected > ratio && (
        <div className="absolute inset-y-0 left-0 rounded-full bg-slate-300/70" style={{ width: `${Math.min(100, projected * 100)}%` }} />
      )}
      <div className={clsx("absolute inset-y-0 left-0 rounded-full", color)} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </div>
  );
}

function BudgetCard({
  s,
  currency,
  history,
  onEdit,
  onDelete,
}: {
  s: BudgetStatus;
  currency: string;
  history: { month: string; spent: number; ok: boolean }[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const kept = history.filter((h) => h.ok).length;
  return (
    <Card className="group">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: s.category?.color ?? "#8c8a81" }} />
            <h3 className="font-medium">{s.category?.name ?? "Smazaná kategorie"}</h3>
          </div>
          <div className="flex gap-0.5 opacity-60 group-hover:opacity-100">
            <IconButton label="Upravit" onClick={onEdit}>
              <Pencil className="size-3.5" />
            </IconButton>
            <IconButton label="Smazat" onClick={onDelete} className="hover:!bg-red-50 hover:!text-red-600">
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>
        </div>

        <div className="mt-3 flex items-baseline justify-between">
          <p className="num text-xl font-semibold">
            {formatMoney(s.spent, currency)} <span className="text-sm font-normal text-slate-400">/ {formatMoney(s.budget.amount, currency)}</span>
          </p>
          <p className="num text-sm font-medium text-slate-600">{formatPercent(s.ratio, { digits: 0 })}</p>
        </div>
        <ProgressBar ratio={s.ratio} projected={s.projected !== null ? s.projected / s.budget.amount : null} className="mt-2" />

        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-slate-500">{s.remaining >= 0 ? "Zbývá" : "Překročeno o"}</dt>
            <dd className={clsx("num font-medium", s.remaining < 0 && "text-expense-ink")}>{formatMoney(Math.abs(s.remaining), currency)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Odhad na konci měsíce</dt>
            <dd className="num font-medium">{s.projected !== null ? `≈ ${formatMoney(Math.round(s.projected / 100) * 100, currency)}` : "—"}</dd>
          </div>
        </dl>

        <div className="mt-3 text-sm">
          {s.exceededOn ? (
            <p className="flex items-start gap-2 text-expense-ink">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Rozpočet překročen {formatDate(s.exceededOn)}.
            </p>
          ) : s.projectedExceedOn ? (
            <p className="flex items-start gap-2 text-amber-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Při současném tempu pravděpodobně překročíš rozpočet kolem {formatDate(s.projectedExceedOn)}.
            </p>
          ) : (
            <p className="flex items-start gap-2 text-income-ink">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> V rámci rozpočtu.
            </p>
          )}
        </div>
      </div>
      {history.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span>
            Dodrženo v {kept} z {history.length} předchozích měsíců
          </span>
          <span className="flex gap-1" aria-hidden>
            {history.map((h) => (
              <span
                key={h.month}
                title={`${monthLabel(h.month)}: ${formatMoney(h.spent, s.budget.currency)}`}
                className={clsx("size-2.5 rounded-sm", h.ok ? "bg-income" : "bg-expense")}
              />
            ))}
          </span>
        </div>
      )}
    </Card>
  );
}

function BudgetDialog({ budget, existing, onClose }: { budget: Budget | "new" | null; existing: Budget[]; onClose: () => void }) {
  const categories = useCategories();
  const { baseCurrency } = useSettings();
  const current = budget && budget !== "new" ? budget : null;
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [lastKey, setLastKey] = useState<string | null>(null);

  const key = budget === null ? null : budget === "new" ? "new" : budget.id;
  if (key !== lastKey) {
    setLastKey(key);
    setError("");
    setCategoryId(current?.categoryId ?? "");
    setAmount(current ? String(current.amount) : "");
  }

  const used = new Set(existing.filter((b) => b.id !== current?.id).map((b) => b.categoryId));
  const options = categories.filter((c) => c.type !== "income" && !used.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, "cs"));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(/[\s ]/g, "").replace(",", "."));
    try {
      await budgetsRepo.save({ id: current?.id, categoryId, amount: value, currency: current?.currency ?? baseCurrency });
      onClose();
    } catch (err) {
      setError(err instanceof ZodError ? err.issues[0]?.message ?? "Neplatná data" : String(err));
    }
  }

  return (
    <Modal
      open={budget !== null}
      title={current ? "Upravit rozpočet" : "Nový rozpočet"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Zrušit</Button>
          <Button variant="primary" type="submit" form="budget-form">Uložit</Button>
        </>
      }
    >
      <form id="budget-form" onSubmit={submit} className="space-y-4">
        <Field label="Kategorie">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} autoFocus>
            <option value="">Vyber kategorii…</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Měsíční limit">
          <Input inputMode="decimal" className="num text-right" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}
