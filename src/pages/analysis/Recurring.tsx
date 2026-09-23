import { useMemo, useState, type FormEvent } from "react";
import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, Pencil, Plus, Repeat, Sparkles, Trash2 } from "lucide-react";
import { ZodError } from "zod";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/PageHeader";
import { useCategories, useRecurring, useSettings, useTransactionsBetween } from "@/db/hooks";
import { recurringRepo, type RecurringInput } from "@/db/repositories";
import { addMonths, currentMonthKey, monthBounds } from "@/domain/months";
import {
  detectRecurring,
  FREQUENCY_LABEL,
  matchRecurring,
  monthlyEquivalent,
  yearlyEquivalent,
  type DetectedRecurring,
} from "@/domain/recurring";
import type { RecurringFrequency } from "@/domain/schema";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { StatCard } from "@/features/StatCard";
import { CategoryLabel } from "@/features/TransactionTable";

/** Historie pro párování a detekci. */
const HISTORY_MONTHS = 24;

type Draft = Partial<RecurringInput> & { id?: string };

export function Recurring() {
  const recurring = useRecurring();
  const categories = useCategories();
  const { baseCurrency: currency } = useSettings();
  const today = currentMonthKey();
  const txs = useTransactionsBetween(monthBounds(addMonths(today, -HISTORY_MONTHS)).from, monthBounds(today).to);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const catMap = new Map(categories.map((c) => [c.id, c]));
  const matches = useMemo(() => new Map(recurring.map((r) => [r.id, matchRecurring(r, txs ?? [])])), [recurring, txs]);
  const detected = useMemo(() => (txs ? detectRecurring(txs, recurring).filter((d) => !dismissed.has(d.key)) : []), [txs, recurring, dismissed]);

  const active = recurring.filter((r) => r.active);
  const monthly = active.reduce((a, r) => a + monthlyEquivalent(r.amount, r.frequency), 0);
  const sorted = [...recurring].sort((a, b) => Number(b.active) - Number(a.active) || monthlyEquivalent(b.amount, b.frequency) - monthlyEquivalent(a.amount, a.frequency));

  const fromDetected = (d: DetectedRecurring): Draft => ({
    name: d.name,
    amount: d.amount,
    frequency: d.frequency,
    categoryId: d.categoryId,
    accountId: d.accountId,
    match: d.name,
    active: true,
  });

  return (
    <>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-slate-900/8 ring-1 ring-slate-900/8 sm:grid-cols-3">
        <StatCard label="Pravidelné výdaje měsíčně" value={formatMoney(monthly, currency)} hint="Přepočteno na měsíc, jen aktivní platby" />
        <StatCard label="Pravidelné výdaje ročně" value={formatMoney(monthly * 12, currency)} />
        <StatCard label="Aktivní platby" value={String(active.length)} hint={recurring.length > active.length ? `+ ${recurring.length - active.length} neaktivní` : undefined} />
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader
          title="Pravidelné platby"
          subtitle="Poslední platba a změny ceny se dohledávají podle textu v popisu transakcí."
          action={
            <Button size="sm" variant="primary" onClick={() => setDraft({ frequency: "monthly", active: true })}>
              <Plus className="size-3.5" /> Přidat
            </Button>
          }
        />
        {sorted.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                  <th className="px-5 py-2.5 text-left font-medium">Název</th>
                  <th className="px-5 py-2.5 text-left font-medium">Kategorie</th>
                  <th className="px-5 py-2.5 text-right font-medium">Částka</th>
                  <th className="px-5 py-2.5 text-left font-medium">Frekvence</th>
                  <th className="px-5 py-2.5 text-right font-medium">Měsíčně</th>
                  <th className="px-5 py-2.5 text-right font-medium">Ročně</th>
                  <th className="px-5 py-2.5 text-left font-medium">Poslední platba</th>
                  <th className="px-5 py-2.5 text-left font-medium">Změna ceny</th>
                  <th className="px-5 py-2.5"><span className="sr-only">Akce</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((r) => {
                  const m = matches.get(r.id);
                  const pc = m?.priceChange;
                  return (
                    <tr key={r.id} className={clsx("group", !r.active && "text-slate-400")}>
                      <td className="px-5 py-2.5 font-medium">
                        {r.name}
                        {!r.active && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">neaktivní</span>}
                      </td>
                      <td className="px-5 py-2.5 text-slate-600">
                        <CategoryLabel category={r.categoryId ? catMap.get(r.categoryId) : undefined} />
                      </td>
                      <td className="num px-5 py-2.5 text-right">{formatMoney(r.amount, r.currency)}</td>
                      <td className="px-5 py-2.5 text-slate-600">{FREQUENCY_LABEL[r.frequency]}</td>
                      <td className="num px-5 py-2.5 text-right">{formatMoney(monthlyEquivalent(r.amount, r.frequency), r.currency)}</td>
                      <td className="num px-5 py-2.5 text-right text-slate-600">{formatMoney(yearlyEquivalent(r.amount, r.frequency), r.currency)}</td>
                      <td className="num px-5 py-2.5 text-slate-600">
                        {m?.lastPaid ? (
                          <span title={`${m.transactions.length} spárovaných transakcí`}>
                            {formatDate(m.lastPaid.date)} · {formatMoney(m.lastPaid.amount, m.lastPaid.currency)}
                          </span>
                        ) : (
                          <span className="text-slate-400">nenalezena</span>
                        )}
                      </td>
                      <td className="px-5 py-2.5">
                        {pc ? (
                          <span
                            title={`Změna ${formatDate(pc.date)}`}
                            className={clsx("num inline-flex items-center gap-1 text-xs font-medium", pc.to > pc.from ? "text-expense-ink" : "text-income-ink")}
                          >
                            {pc.to > pc.from ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                            {formatMoney(pc.from, r.currency)} → {formatMoney(pc.to, r.currency)} ({formatPercent((pc.to - pc.from) / pc.from, { signed: true, digits: 0 })})
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="w-0 px-5 py-2.5 whitespace-nowrap">
                        <div className="flex justify-end gap-0.5 opacity-60 group-hover:opacity-100">
                          <IconButton label="Upravit" onClick={() => setDraft({ ...r })}>
                            <Pencil className="size-3.5" />
                          </IconButton>
                          <IconButton
                            label="Smazat"
                            onClick={() => confirm(`Smazat pravidelnou platbu „${r.name}“?`) && recurringRepo.remove(r.id)}
                            className="hover:!bg-red-50 hover:!text-red-600"
                          >
                            <Trash2 className="size-3.5" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Repeat className="size-5" />} title="Zatím žádné pravidelné platby">
            Přidej je ručně nebo z automaticky nalezených níže.
          </EmptyState>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Sparkles className="size-4 text-net" /> Nalezené v transakcích
            </span>
          }
          subtitle="Výdaje se stejným popisem, alespoň 3× v pravidelném intervalu a s podobnou částkou (odchylka do 15 %)."
        />
        <div className="p-5">
          {detected.length ? (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {detected.map((d) => (
                <li key={d.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-slate-500">
                      {d.occurrences}× {FREQUENCY_LABEL[d.frequency]} · {formatDate(d.firstDate)} – {formatDate(d.lastDate)} · medián intervalu{" "}
                      {d.medianInterval} dní
                    </p>
                  </div>
                  <span className="num text-sm font-medium">
                    {formatMoney(d.amount, currency)} <span className="font-normal text-slate-500">/ {FREQUENCY_LABEL[d.frequency]}</span>
                  </span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setDismissed((s) => new Set(s).add(d.key))}>
                      Skrýt
                    </Button>
                    <Button size="sm" onClick={() => setDraft(fromDetected(d))}>
                      <Plus className="size-3.5" /> Přidat
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Žádné další pravidelné platby jsem v transakcích nenašel.</p>
          )}
        </div>
      </Card>

      <RecurringDialog draft={draft} onClose={() => setDraft(null)} />
    </>
  );
}

function RecurringDialog({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const categories = useCategories();
  const { baseCurrency } = useSettings();
  const [form, setForm] = useState({ name: "", amount: "", frequency: "monthly" as RecurringFrequency, categoryId: "", match: "", active: true, note: "" });
  const [error, setError] = useState("");
  const [last, setLast] = useState<Draft | null>(null);

  if (draft !== last) {
    setLast(draft);
    setError("");
    if (draft) {
      setForm({
        name: draft.name ?? "",
        amount: draft.amount !== undefined ? String(draft.amount).replace(".", ",") : "",
        frequency: draft.frequency ?? "monthly",
        categoryId: draft.categoryId ?? "",
        match: draft.match ?? "",
        active: draft.active ?? true,
        note: draft.note ?? "",
      });
    }
  }

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const amount = Number(form.amount.replace(/[\s ]/g, "").replace(",", "."));
    try {
      await recurringRepo.save(
        {
          name: form.name,
          amount,
          currency: draft.currency ?? baseCurrency,
          frequency: form.frequency,
          categoryId: form.categoryId || undefined,
          accountId: draft.accountId,
          match: form.match.trim() || undefined,
          active: form.active,
          note: form.note.trim() || undefined,
        },
        draft.id,
      );
      onClose();
    } catch (err) {
      setError(err instanceof ZodError ? err.issues[0]?.message ?? "Neplatná data" : String(err));
    }
  }

  return (
    <Modal
      open={draft !== null}
      title={draft?.id ? "Upravit pravidelnou platbu" : "Nová pravidelná platba"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Zrušit</Button>
          <Button variant="primary" type="submit" form="rec-form">Uložit</Button>
        </>
      }
    >
      <form id="rec-form" onSubmit={submit} className="space-y-4">
        <Field label="Název">
          <Input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Např. Spotify" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Částka">
            <Input inputMode="decimal" className="num text-right" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
          </Field>
          <Field label="Frekvence">
            <Select value={form.frequency} onChange={(e) => set("frequency", e.target.value as RecurringFrequency)}>
              {Object.entries(FREQUENCY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Kategorie">
          <Select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">Bez kategorie</option>
            {categories
              .filter((c) => c.type !== "income")
              .sort((a, b) => a.name.localeCompare(b.name, "cs"))
              .map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
          </Select>
        </Field>
        <Field label="Párovat s transakcemi, jejichž popis obsahuje">
          <Input value={form.match} onChange={(e) => set("match", e.target.value)} placeholder={form.name || "Text v popisu transakce"} />
        </Field>
        <Field label="Poznámka">
          <Input value={form.note} onChange={(e) => set("note", e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-navy-900" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
          Aktivní (započítat do součtů)
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}

