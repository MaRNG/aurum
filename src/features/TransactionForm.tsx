import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ZodError } from "zod";
import clsx from "clsx";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { useAccounts, useCategories, useSettings } from "@/db/hooks";
import { transactionsRepo } from "@/db/repositories";
import type { Transaction, TransactionType } from "@/domain/schema";
import { todayIso } from "@/domain/months";

const TYPE_OPTIONS: { value: TransactionType; label: string; active: string }[] = [
  { value: "expense", label: "Výdaj", active: "bg-white text-expense-ink shadow-sm" },
  { value: "income", label: "Příjem", active: "bg-white text-income-ink shadow-sm" },
  { value: "transfer", label: "Převod", active: "bg-white text-slate-700 shadow-sm" },
];

interface FormState {
  type: TransactionType;
  amount: string;
  date: string;
  categoryId: string;
  accountId: string;
  destinationAccountId: string;
  description: string;
}

function initialState(tx: Transaction | null, defaultAccountId: string, defaultDate?: string): FormState {
  return {
    type: tx?.type ?? "expense",
    amount: tx ? String(tx.amount).replace(".", ",") : "",
    date: tx?.date ?? defaultDate ?? todayIso(),
    categoryId: tx?.categoryId ?? "",
    accountId: tx?.accountId ?? defaultAccountId,
    destinationAccountId: tx?.destinationAccountId ?? "",
    description: tx?.description ?? "",
  };
}

/** Přijímá české i anglické zápisy: „1 250,50“, „1250.5“. */
function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[\s ]/g, "").replace(",", ".");
  return cleaned === "" ? NaN : Number(cleaned);
}

export function TransactionForm({
  open,
  transaction,
  defaultDate,
  defaultAccountId: preferredAccountId,
  duplicate = false,
  onClose,
}: {
  open: boolean;
  /** `null` = nová transakce */
  transaction: Transaction | null;
  /** `transaction` slouží jen jako předloha – uloží se jako nová (ruční) transakce */
  duplicate?: boolean;
  defaultDate?: string;
  /** předvybraný účet u nové transakce */
  defaultAccountId?: string;
  onClose: () => void;
}) {
  const categories = useCategories();
  const allAccounts = useAccounts();
  // Archivované účty se nenabízí – kromě účtů, které už upravovaná transakce používá.
  const accounts = allAccounts.filter(
    (a) => !a.archived || a.id === transaction?.accountId || a.id === transaction?.destinationAccountId,
  );
  const settings = useSettings();
  const defaultAccountId = preferredAccountId ?? accounts[0]?.id ?? "";

  const [form, setForm] = useState<FormState>(() => initialState(transaction, defaultAccountId, defaultDate));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | "form", string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialState(transaction, defaultAccountId, defaultDate));
      setErrors({});
    }
    // Reset jen při otevření – ne při každé změně seznamu účtů.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction, duplicate]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const categoryOptions = useMemo(
    () =>
      categories
        .filter((c) => c.type === "both" || c.type === form.type)
        .sort((a, b) => a.name.localeCompare(b.name, "cs")),
    [categories, form.type],
  );

  const canTransfer = accounts.length >= 2;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amount = parseAmount(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrors({ amount: "Zadej kladnou částku" });
      return;
    }
    const account = allAccounts.find((a) => a.id === form.accountId);
    const input = {
      type: form.type,
      amount,
      currency: account?.currency ?? settings.baseCurrency,
      date: form.date,
      categoryId: form.type === "transfer" ? undefined : form.categoryId || undefined,
      accountId: form.accountId || undefined,
      destinationAccountId: form.type === "transfer" ? form.destinationAccountId || undefined : undefined,
      description: form.description.trim() || undefined,
    };

    setSaving(true);
    try {
      if (transaction && !duplicate) await transactionsRepo.update(transaction.id, input);
      else await transactionsRepo.create(input);
      onClose();
    } catch (err) {
      if (err instanceof ZodError) {
        const next: typeof errors = {};
        for (const issue of err.issues) {
          const key = (issue.path[0] as keyof FormState) ?? "form";
          next[key] ??= issue.message;
        }
        setErrors(next);
      } else {
        setErrors({ form: err instanceof Error ? err.message : "Uložení se nezdařilo" });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={duplicate ? "Duplikovat transakci" : transaction ? "Upravit transakci" : "Nová transakce"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button variant="primary" type="submit" form="tx-form" disabled={saving}>
            {duplicate ? "Vytvořit kopii" : transaction ? "Uložit změny" : "Přidat transakci"}
          </Button>
        </>
      }
    >
      <form id="tx-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Typ transakce">
          {TYPE_OPTIONS.map((opt) => {
            const disabled = opt.value === "transfer" && !canTransfer;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={form.type === opt.value}
                disabled={disabled}
                title={disabled ? "Pro převod přidej v Nastavení alespoň dva účty" : undefined}
                onClick={() => setForm((f) => ({ ...f, type: opt.value, categoryId: "" }))}
                className={clsx(
                  "rounded-md py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  form.type === opt.value ? opt.active : "text-slate-500 hover:text-slate-800",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Částka" error={errors.amount}>
            <Input
              inputMode="decimal"
              autoFocus
              placeholder="0"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              className="num text-right"
            />
          </Field>
          <Field label="Datum" error={errors.date}>
            <Input type="date" required value={form.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
        </div>

        {form.type === "transfer" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Z účtu" error={errors.accountId}>
              <Select value={form.accountId} onChange={(e) => set("accountId", e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Na účet" error={errors.destinationAccountId}>
              <Select value={form.destinationAccountId} onChange={(e) => set("destinationAccountId", e.target.value)}>
                <option value="">Vyber účet…</option>
                {accounts
                  .filter((a) => a.id !== form.accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kategorie" error={errors.categoryId}>
              <Select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">Bez kategorie</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Účet" error={errors.accountId}>
              <Select value={form.accountId} onChange={(e) => set("accountId", e.target.value)}>
                <option value="">—</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        <Field label="Popis" error={errors.description}>
          <Input
            placeholder={form.type === "transfer" ? "Např. spoření" : "Např. nákup Albert"}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        {form.type === "transfer" && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Převod mezi vlastními účty se nezapočítává do příjmů ani výdajů.
          </p>
        )}
        {errors.form && <p className="text-sm text-red-600">{errors.form}</p>}
      </form>
    </Modal>
  );
}
