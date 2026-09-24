import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Plus, Receipt, Search, Trash2, X } from "lucide-react";
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
import { SelectBox, TransactionTable } from "@/features/TransactionTable";

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
  const [duplicating, setDuplicating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkAccount, setBulkAccount] = useState("");
  const [bulkNote, setBulkNote] = useState("");

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

  // Hromadné akce pracují jen s vybranými transakcemi, které odpovídají aktuálním filtrům.
  const selectedIds = filtered.filter((t) => selected.has(t.id)).map((t) => t.id);
  const allSelected = filtered.length > 0 && selectedIds.length === filtered.length;

  const toggleOne = (tx: Transaction, checked: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (checked) next.add(tx.id);
      else next.delete(tx.id);
      return next;
    });
  const clearSelection = () => {
    setSelected(new Set());
    setBulkCategory("");
    setBulkAccount("");
  };

  const applyBulk = async () => {
    const { updated, skipped } = await transactionsRepo.bulkUpdate(selectedIds, {
      categoryId: bulkCategory === "" ? undefined : bulkCategory === "__none" ? null : bulkCategory,
      accountId: bulkAccount || undefined,
    });
    const unchanged = selectedIds.length - updated - skipped;
    setBulkNote(
      [
        `Upraveno ${updated} z ${selectedIds.length}`,
        unchanged > 0 && `${unchanged} už nastavení mělo`,
        skipped > 0 && `${skipped} přeskočeno (převod nebo kategorie jiného typu)`,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    clearSelection();
  };

  const removeBulk = async () => {
    if (!confirm(`Opravdu smazat ${selectedIds.length} vybraných transakcí?`)) return;
    await transactionsRepo.bulkRemove(selectedIds);
    setBulkNote(`Smazáno ${selectedIds.length} transakcí`);
    clearSelection();
  };

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
        <th className="w-0 py-3 pr-0 pl-4 font-medium">
          <SelectBox
            label={allSelected ? "Zrušit výběr" : `Vybrat všech ${filtered.length} transakcí`}
            checked={allSelected}
            indeterminate={selectedIds.length > 0 && !allSelected}
            onChange={(c) => (c ? setSelected(new Set(filtered.map((t) => t.id))) : clearSelection())}
          />
        </th>
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
          <Button variant="primary" onClick={() => { setEditing(null); setDuplicating(false); setFormOpen(true); }}>
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

      {selectedIds.length > 0 ? (
        <Card className="sticky top-16 z-20 mb-4 lg:top-2 flex flex-wrap items-center gap-3 p-3">
          <span className="px-1 text-sm font-medium text-slate-900">
            Vybráno <span className="num">{selectedIds.length}</span>
            {!allSelected && (
              <button type="button" onClick={() => setSelected(new Set(filtered.map((t) => t.id)))} className="ml-2 text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">
                vybrat všech {filtered.length}
              </button>
            )}
          </span>
          <Select aria-label="Nastavit kategorii" value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="w-56">
            <option value="">Kategorie beze změny</option>
            <option value="__none">— Bez kategorie</option>
            {[...categories].sort((a, b) => a.name.localeCompare(b.name, "cs")).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.type === "income" ? " (příjem)" : c.type === "expense" ? " (výdaj)" : ""}
              </option>
            ))}
          </Select>
          <Select aria-label="Nastavit účet" value={bulkAccount} onChange={(e) => setBulkAccount(e.target.value)} className="w-48">
            <option value="">Účet beze změny</option>
            {accounts.filter((a) => !a.archived).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <Button size="sm" variant="primary" disabled={!bulkCategory && !bulkAccount} onClick={applyBulk}>
            Použít
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={removeBulk} className="hover:!bg-expense/10 hover:!text-expense-ink">
              <Trash2 className="size-3.5" /> Smazat
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              <X className="size-3.5" /> Zrušit výběr
            </Button>
          </div>
        </Card>
      ) : (
        bulkNote && (
          <div className="mb-3 flex items-center gap-2 px-1 text-xs text-slate-600" role="status">
            {bulkNote}
            <button type="button" aria-label="Skrýt" onClick={() => setBulkNote("")} className="text-slate-400 hover:text-slate-900">
              <X className="size-3" />
            </button>
          </div>
        )
      )}

      <Card className="overflow-hidden">
        {all === undefined ? null : filtered.length ? (
          <>
            <TransactionTable
              header={header}
              transactions={filtered.slice(0, limit)}
              categories={categories}
              accounts={accounts}
              onEdit={(tx) => { setEditing(tx); setDuplicating(false); setFormOpen(true); }}
              onDuplicate={(tx) => { setEditing(tx); setDuplicating(true); setFormOpen(true); }}
              onDelete={(tx) => confirm("Opravdu smazat transakci?") && transactionsRepo.remove(tx.id)}
              onCategoryChange={(tx, id) => transactionsRepo.bulkUpdate([tx.id], { categoryId: id })}
              selected={selected}
              onToggleSelect={toggleOne}
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

      <TransactionForm open={formOpen} transaction={editing} duplicate={duplicating} onClose={() => setFormOpen(false)} />
    </>
  );
}
