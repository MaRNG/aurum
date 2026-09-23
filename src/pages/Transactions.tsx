import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Plus, Receipt, Search, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { useAccounts, useAllTransactions, useCategories, useSettings } from "@/db/hooks";
import { transactionsRepo } from "@/db/repositories";
import { summarize } from "@/domain/aggregate";
import type { Transaction } from "@/domain/schema";
import { monthBounds } from "@/domain/months";
import { formatMoney } from "@/lib/format";
import { TransactionForm } from "@/features/TransactionForm";
import { TransactionTable } from "@/features/TransactionTable";

type SortKey = "date" | "description" | "category" | "type" | "amount" | "account" | "source";

const COLUMNS: { key: SortKey | "actions"; label: string; align?: "right" }[] = [
  { key: "date", label: "Datum" },
  { key: "description", label: "Popis" },
  { key: "category", label: "Kategorie" },
  { key: "type", label: "Typ" },
  { key: "amount", label: "Částka", align: "right" },
  { key: "account", label: "Účet" },
  { key: "source", label: "Zdroj" },
  { key: "actions", label: "" },
];

const PAGE_SIZE = 100;

export function Transactions() {
  const [params, setParams] = useSearchParams();
  const monthParam = params.get("month");
  const initialRange = monthParam ? monthBounds(monthParam) : { from: "", to: "" };

  const all = useAllTransactions();
  const categories = useCategories();
  const accounts = useAccounts();
  const { baseCurrency: currency } = useSettings();

  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [type, setType] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [limit, setLimit] = useState(PAGE_SIZE);

  const [editing, setEditing] = useState<Transaction | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const accMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const filtered = useMemo(() => {
    if (!all) return [];
    const q = query.trim().toLocaleLowerCase("cs");
    const rows = all.filter(
      (t) =>
        (!from || t.date >= from) &&
        (!to || t.date <= to) &&
        (!type || t.type === type) &&
        (!categoryId || (categoryId === "__none" ? !t.categoryId && t.type !== "transfer" : t.categoryId === categoryId)) &&
        (!accountId || t.accountId === accountId || t.destinationAccountId === accountId) &&
        (!q ||
          (t.description ?? "").toLocaleLowerCase("cs").includes(q) ||
          (t.categoryId && catMap.get(t.categoryId)?.name.toLocaleLowerCase("cs").includes(q)) ||
          String(t.amount).includes(q)),
    );
    const val = (t: Transaction): string | number => {
      switch (sort.key) {
        case "date": return t.date + t.createdAt;
        case "description": return t.description ?? "";
        case "category": return (t.categoryId && catMap.get(t.categoryId)?.name) || "";
        case "type": return t.type;
        case "amount": return t.type === "expense" ? -t.amount : t.amount;
        case "account": return (t.accountId && accMap.get(t.accountId)?.name) || "";
        case "source": return t.source;
      }
    };
    return rows.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "cs");
      return cmp * sort.dir;
    });
  }, [all, from, to, type, categoryId, accountId, query, sort, catMap, accMap]);

  const totals = summarize("", filtered);
  const hasFilters = !!(from || to || type || categoryId || accountId || query);

  const resetFilters = () => {
    setFrom(""); setTo(""); setType(""); setCategoryId(""); setAccountId(""); setQuery("");
    if (monthParam) setParams({}, { replace: true });
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "date" || key === "amount" ? -1 : 1 }));

  const header = (
    <thead>
      <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs text-slate-500">
        {COLUMNS.map((c) => (
          <th key={c.key} className={clsx("px-4 py-3 font-medium", c.align === "right" && "text-right")}>
            {c.key === "actions" ? (
              <span className="sr-only">Akce</span>
            ) : (
              <button
                type="button"
                onClick={() => toggleSort(c.key as SortKey)}
                className={clsx("inline-flex items-center gap-1 hover:text-slate-900", sort.key === c.key && "text-slate-900")}
              >
                {c.label}
                {sort.key === c.key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
              </button>
            )}
          </th>
        ))}
      </tr>
    </thead>
  );

  return (
    <>
      <PageHeader
        title="Transakce"
        subtitle="Všechny příjmy, výdaje a převody."
        actions={
          <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="size-4" /> Nová transakce
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <div className="relative col-span-2 xl:col-span-2">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
            <Input placeholder="Hledat popis, kategorii, částku…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>
          <Input type="date" aria-label="Od" title="Od" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" aria-label="Do" title="Do" value={to} onChange={(e) => setTo(e.target.value)} />
          <Select aria-label="Typ" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Všechny typy</option>
            <option value="income">Příjmy</option>
            <option value="expense">Výdaje</option>
            <option value="transfer">Převody</option>
          </Select>
          <Select aria-label="Kategorie" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Všechny kategorie</option>
            <option value="__none">Bez kategorie</option>
            {[...categories].sort((a, b) => a.name.localeCompare(b.name, "cs")).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.type === "income" ? " (příjem)" : c.type === "expense" ? " (výdaj)" : ""}
              </option>
            ))}
          </Select>
          <Select aria-label="Účet" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Všechny účty</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
          <span>{filtered.length} transakcí</span>
          <span>Příjmy <b className="num font-medium text-income-ink">{formatMoney(totals.income, currency)}</b></span>
          <span>Výdaje <b className="num font-medium text-expense-ink">{formatMoney(totals.expense, currency)}</b></span>
          <span>Bilance <b className="num font-medium text-slate-800">{formatMoney(totals.net, currency, { signed: true })}</b></span>
          {hasFilters && (
            <button type="button" onClick={resetFilters} className="ml-auto inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900">
              <X className="size-3" /> Zrušit filtry
            </button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {all === undefined ? null : filtered.length ? (
          <>
            <TransactionTable
              header={header}
              transactions={filtered.slice(0, limit)}
              categories={categories}
              accounts={accounts}
              onEdit={(tx) => { setEditing(tx); setFormOpen(true); }}
              onDelete={(tx) => confirm("Opravdu smazat transakci?") && transactionsRepo.remove(tx.id)}
            />
            {filtered.length > limit && (
              <div className="border-t border-slate-100 p-3 text-center">
                <Button size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                  Načíst další ({filtered.length - limit})
                </Button>
              </div>
            )}
          </>
        ) : (
          <EmptyState icon={<Receipt className="size-5" />} title={hasFilters ? "Filtrům neodpovídá žádná transakce" : "Zatím žádné transakce"}>
            {!hasFilters && "Přidej první příjem nebo výdaj tlačítkem vpravo nahoře."}
          </EmptyState>
        )}
      </Card>

      <TransactionForm open={formOpen} transaction={editing} onClose={() => setFormOpen(false)} />
    </>
  );
}
