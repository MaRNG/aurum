import { useState, type FormEvent } from "react";
import clsx from "clsx";
import { Link } from "react-router";
import { ArrowRight, Pencil, Plus, Trash2 } from "lucide-react";
import { ZodError } from "zod";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { useCategories, useSettings } from "@/db/hooks";
import { categoriesRepo } from "@/db/repositories";
import { CATEGORY_PALETTE } from "@/domain/defaults";
import type { Category, CategoryType } from "@/domain/schema";

const CATEGORY_TYPE_LABEL: Record<CategoryType, string> = { expense: "Výdaje", income: "Příjmy", both: "Obojí" };

const errorMessage = (err: unknown) =>
  err instanceof ZodError ? err.issues[0]?.message ?? "Neplatná data" : err instanceof Error ? err.message : "Chyba";

export function Settings() {
  return (
    <>
      <PageHeader title="Nastavení" subtitle="Kategorie a obecné předvolby." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CategoriesSection />
        <div className="space-y-4">
          <GeneralSection />
          <Card>
            <CardHeader title="Účty" subtitle="Správa účtů, zůstatků a rezervy je na samostatné stránce." />
            <div className="p-5">
              <Link to="/ucty" className="inline-flex items-center gap-1 text-sm link">
                Přejít na Účty <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

/* ------------------------------ Kategorie ------------------------------ */

function CategoriesSection() {
  const categories = useCategories();
  const [editing, setEditing] = useState<Category | "new" | null>(null);

  const groups: CategoryType[] = ["expense", "income", "both"];

  async function remove(c: Category) {
    const used = await categoriesRepo.usageCount(c.id);
    const msg = used
      ? `Kategorii „${c.name}“ používá ${used} transakcí. Po smazání zůstanou bez kategorie. Pokračovat?`
      : `Smazat kategorii „${c.name}“?`;
    if (confirm(msg)) await categoriesRepo.remove(c.id);
  }

  return (
    <Card>
      <CardHeader
        title="Kategorie"
        subtitle="Používají se pro třídění příjmů a výdajů."
        action={
          <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
            <Plus className="size-3.5" /> Přidat
          </Button>
        }
      />
      <div className="space-y-5 p-5">
        {groups.map((g) => {
          const items = categories.filter((c) => c.type === g).sort((a, b) => a.name.localeCompare(b.name, "cs"));
          if (!items.length) return null;
          return (
            <div key={g}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">{CATEGORY_TYPE_LABEL[g]}</h3>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {items.map((c) => (
                  <li key={c.id} className="group flex items-center gap-3 px-3 py-2">
                    <span className="size-3 rounded-full" style={{ background: c.color ?? "#8c8a81" }} />
                    <span className="flex-1 text-sm">{c.name}</span>
                    <div className="flex gap-0.5 opacity-60 group-hover:opacity-100">
                      <IconButton label="Upravit" onClick={() => setEditing(c)}>
                        <Pencil className="size-3.5" />
                      </IconButton>
                      <IconButton label="Smazat" onClick={() => remove(c)} className="hover:!bg-red-50 hover:!text-red-600">
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <CategoryDialog category={editing} onClose={() => setEditing(null)} existing={categories} />
    </Card>
  );
}

function CategoryDialog({ category, existing, onClose }: { category: Category | "new" | null; existing: Category[]; onClose: () => void }) {
  const isNew = category === "new";
  const current = category && category !== "new" ? category : null;
  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("expense");
  const [color, setColor] = useState(CATEGORY_PALETTE[0]!);
  const [error, setError] = useState("");
  const [lastKey, setLastKey] = useState<string | null>(null);

  // Naplnění formuláře při otevření dialogu
  const key = category === null ? null : isNew ? "new" : current!.id;
  if (key !== lastKey) {
    setLastKey(key);
    setError("");
    setName(current?.name ?? "");
    setType(current?.type ?? "expense");
    const used = new Set(existing.map((c) => c.color));
    setColor(current?.color ?? CATEGORY_PALETTE.find((c) => !used.has(c)) ?? CATEGORY_PALETTE[0]!);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await categoriesRepo.save({ id: current?.id, name, type, color, icon: current?.icon });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal
      open={category !== null}
      title={isNew ? "Nová kategorie" : "Upravit kategorii"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Zrušit</Button>
          <Button variant="primary" type="submit" form="cat-form">Uložit</Button>
        </>
      }
    >
      <form id="cat-form" onSubmit={submit} className="space-y-4">
        <Field label="Název" error={error}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Použití">
          <Select value={type} onChange={(e) => setType(e.target.value as CategoryType)}>
            <option value="expense">Výdaje</option>
            <option value="income">Příjmy</option>
            <option value="both">Příjmy i výdaje</option>
          </Select>
        </Field>
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">Barva v grafech</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Barva ${c}`}
                onClick={() => setColor(c)}
                className={clsx("size-7 rounded-full ring-offset-2 transition", color === c ? "ring-2 ring-slate-900" : "hover:scale-110")}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------- Obecné ------------------------------- */

function GeneralSection() {
  const settings = useSettings();
  const [persisted, setPersisted] = useState<boolean | null>(null);

  async function requestPersist() {
    setPersisted(navigator.storage?.persist ? await navigator.storage.persist() : false);
  }

  return (
    <Card>
      <CardHeader title="Obecné" />
      <dl className="space-y-3 p-5 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Základní měna</dt>
          <dd className="font-medium">{settings.baseCurrency}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500">
            Trvalé úložiště
            <span className="block text-xs text-slate-400">Požádá prohlížeč, aby data nemazal při nedostatku místa.</span>
          </dt>
          <dd>
            {persisted === null ? (
              <Button size="sm" onClick={requestPersist}>Povolit</Button>
            ) : (
              <span className={persisted ? "text-income-ink" : "text-slate-500"}>{persisted ? "Povoleno" : "Nepovoleno"}</span>
            )}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
