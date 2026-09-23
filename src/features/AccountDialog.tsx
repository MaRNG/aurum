import { useState, type FormEvent } from "react";
import { ZodError } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { useSettings } from "@/db/hooks";
import { accountsRepo } from "@/db/repositories";
import { ACCOUNT_TYPE_LABEL } from "@/domain/accounts";
import type { Account, AccountType } from "@/domain/schema";
import { todayIso } from "@/domain/months";

const parseNumber = (raw: string) => {
  const s = raw.replace(/[\s ]/g, "").replace(",", ".");
  return s === "" ? undefined : Number(s);
};

export function AccountDialog({ account, onClose }: { account: Account | "new" | null; onClose: () => void }) {
  const { baseCurrency } = useSettings();
  const current = account && account !== "new" ? account : null;
  const [form, setForm] = useState({ name: "", type: "checking" as AccountType, balance: "", balanceDate: "", archived: false });
  const [error, setError] = useState("");
  const [lastKey, setLastKey] = useState<string | null>(null);

  const key = account === null ? null : account === "new" ? "new" : account.id;
  if (key !== lastKey) {
    setLastKey(key);
    setError("");
    setForm({
      name: current?.name ?? "",
      type: current?.type ?? "checking",
      balance: current?.initialBalance !== undefined ? String(current.initialBalance).replace(".", ",") : "",
      balanceDate: current?.initialBalanceDate ?? (current ? "" : todayIso()),
      archived: current?.archived ?? false,
    });
  }
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const initialBalance = parseNumber(form.balance);
    if (initialBalance !== undefined && !Number.isFinite(initialBalance)) {
      setError("Neplatný zůstatek");
      return;
    }
    try {
      await accountsRepo.save({
        id: current?.id,
        name: form.name,
        type: form.type,
        currency: current?.currency ?? baseCurrency,
        initialBalance,
        initialBalanceDate: initialBalance !== undefined && form.balanceDate ? form.balanceDate : undefined,
        archived: form.archived || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof ZodError ? err.issues[0]?.message ?? "Neplatná data" : err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Modal
      open={account !== null}
      title={current ? "Upravit účet" : "Nový účet"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Zrušit</Button>
          <Button variant="primary" type="submit" form="acc-form">Uložit</Button>
        </>
      }
    >
      <form id="acc-form" onSubmit={submit} className="space-y-4">
        <Field label="Název">
          <Input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Např. Spořicí účet" />
        </Field>
        <Field label="Typ">
          <Select value={form.type} onChange={(e) => set("type", e.target.value as AccountType)}>
            {Object.entries(ACCOUNT_TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Zůstatek (nepovinné)">
            <Input inputMode="decimal" className="num text-right" value={form.balance} onChange={(e) => set("balance", e.target.value)} placeholder="Neznámý" />
          </Field>
          <Field label="Platný ke dni">
            <Input type="date" value={form.balanceDate} disabled={form.balance.trim() === ""} onChange={(e) => set("balanceDate", e.target.value)} />
          </Field>
        </div>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Zadej zůstatek, jaký byl na účtu na začátku zvoleného dne. Transakce od tohoto dne se k němu přičítají, starší transakce
          se dopočítají zpětně. {form.type === "credit" && "U kreditní karty zadej dluh jako zápornou částku."}
        </p>
        {current && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-navy-900" checked={form.archived} onChange={(e) => set("archived", e.target.checked)} />
            Archivovat (nenabízet u nových transakcí, nepočítat do rezervy)
          </label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}
