import { useRef, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Download, FileJson, FlaskConical, Info, Landmark, Trash2, Upload } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { db } from "@/db/db";
import { useAccounts, useSettings } from "@/db/hooks";
import { settingsRepo } from "@/db/repositories";
import { analyzeImport, applyImport, buildBackup, downloadJson, parseBackup, wipeAllData, type ImportMode, type ImportPlan } from "@/data/backup";
import { COLLECTION_LABEL, COLLECTIONS, CURRENT_FORMAT_VERSION, type Backup } from "@/data/format";
import { todayIso } from "@/domain/months";
import { formatDate, formatMoney } from "@/lib/format";
import { analyzeBankImport, applyBankImport, matchAccount, parseBankFile, suggestedAccount, type BankImportPlan } from "@/data/bankImport";
import { SUPPORTED_BANKS, type BankImport } from "@/integrations/bank";
import { Modal } from "@/components/ui/Modal";
import { createDemoData, DEMO_ACCOUNT_ID, removeDemoData } from "@/data/demo";

const MODES: { value: ImportMode; label: string; description: string }[] = [
  { value: "merge-keep-local", label: "Sloučit – ponechat moje data", description: "Přidá nové záznamy. Při shodě ID zůstane verze v tomto prohlížeči." },
  { value: "merge-prefer-import", label: "Sloučit – přednost má záloha", description: "Přidá nové záznamy. Při shodě ID se lokální záznam přepíše verzí ze zálohy." },
  { value: "replace", label: "Nahradit vše", description: "Smaže všechna současná data a nahradí je obsahem zálohy." },
];

export function Data() {
  return (
    <>
      <PageHeader title="Data" subtitle="Záloha a obnova. Data jsou uložena pouze v tomto prohlížeči (IndexedDB)." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ExportCard />
        <ImportCard />
        <BankImportCard />
        <DemoCard />
      </div>
      <DangerZone />
    </>
  );
}

function useCounts() {
  return useLiveQuery(async () => ({
    transactions: await db.transactions.count(),
    categories: await db.categories.count(),
    accounts: await db.accounts.count(),
    months: await db.monthStatus.count(),
    budgets: await db.budgets.count(),
    recurring: await db.recurring.count(),
    scenarios: await db.scenarios.count(),
  }));
}

function ExportCard() {
  const counts = useCounts();
  const settings = useSettings();
  const [busy, setBusy] = useState(false);

  async function exportNow() {
    setBusy(true);
    try {
      const backup = await buildBackup();
      downloadJson(backup, `finance-zaloha-${todayIso()}.json`);
      await settingsRepo.update({ lastExportAt: backup.exportedAt });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Export do JSON" subtitle={`Kompletní stav aplikace ve verzovaném formátu (verze ${CURRENT_FORMAT_VERSION}).`} />
      <div className="p-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
          {COLLECTIONS.map((c) => (
            <div key={c} className="flex justify-between gap-2">
              <dt className="text-slate-500">{COLLECTION_LABEL[c]}</dt>
              <dd className="num font-medium">{counts?.[c] ?? "…"}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {settings.lastExportAt ? `Poslední export: ${formatDate(settings.lastExportAt.slice(0, 10))}` : "Data zatím nebyla exportována."}
          </p>
          <Button variant="primary" onClick={exportNow} disabled={busy}>
            <Download className="size-4" /> Stáhnout zálohu
          </Button>
        </div>
      </div>
    </Card>
  );
}

type ImportState =
  | { step: "idle" }
  | { step: "error"; fileName: string; errors: string[] }
  | { step: "preview"; fileName: string; backup: Backup; plan: ImportPlan; migrations: string[]; sourceVersion: number }
  | { step: "done"; message: string };

function ImportCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ step: "idle" });
  const [mode, setMode] = useState<ImportMode>("merge-keep-local");
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    const result = parseBackup(await file.text());
    if (!result.ok) {
      setState({ step: "error", fileName: file.name, errors: result.errors });
      return;
    }
    const plan = await analyzeImport(result.backup);
    setState({ step: "preview", fileName: file.name, backup: result.backup, plan, migrations: result.migrations, sourceVersion: result.sourceVersion });
  }

  async function confirmImport() {
    if (state.step !== "preview") return;
    if (mode === "replace" && !confirm("Opravdu smazat všechna současná data a nahradit je zálohou?")) return;
    setBusy(true);
    try {
      await applyImport(state.backup, mode);
      setState({ step: "done", message: `Import ze souboru ${state.fileName} proběhl úspěšně.` });
    } catch (e) {
      setState({ step: "error", fileName: state.fileName, errors: [`Zápis selhal, databáze zůstala beze změny: ${e instanceof Error ? e.message : String(e)}`] });
    } finally {
      setBusy(false);
    }
  }

  const reset = () => {
    setState({ step: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Card>
      <CardHeader title="Import z JSON" subtitle="Soubor se ověří, případně převede ze starší verze a před uložením uvidíš náhled." />
      <div className="p-5">
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />

        {state.step === "idle" && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) void onFile(f);
            }}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500 transition-colors hover:border-net hover:bg-net/5"
          >
            <Upload className="size-5 text-slate-400" />
            Vyber nebo přetáhni soubor zálohy (.json)
          </button>
        )}

        {state.step === "error" && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4" /> Soubor {state.fileName} nelze importovat
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-6 text-xs">
              {state.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs">Do databáze nebylo nic zapsáno.</p>
            <Button size="sm" className="mt-3" onClick={reset}>Zkusit jiný soubor</Button>
          </div>
        )}

        {state.step === "done" && (
          <div className="rounded-xl border border-income/30 bg-income/5 p-4 text-sm text-income-ink">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-4" /> {state.message}
            </p>
            <Button size="sm" className="mt-3" onClick={reset}>Hotovo</Button>
          </div>
        )}

        {state.step === "preview" && <ImportPreview state={state} mode={mode} setMode={setMode} busy={busy} onConfirm={confirmImport} onCancel={reset} />}
      </div>
    </Card>
  );
}

function ImportPreview({
  state,
  mode,
  setMode,
  busy,
  onConfirm,
  onCancel,
}: {
  state: Extract<ImportState, { step: "preview" }>;
  mode: ImportMode;
  setMode: (m: ImportMode) => void;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { plan, backup } = state;
  const totalConflicts = COLLECTIONS.reduce((a, c) => a + plan.stats[c].conflicts, 0);
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-3">
        <FileJson className="mt-0.5 size-5 text-net" />
        <div>
          <p className="font-medium">{state.fileName}</p>
          <p className="text-xs text-slate-500">
            Exportováno {formatDate(backup.exportedAt.slice(0, 10))} · formát v{state.sourceVersion}
            {state.migrations.length > 0 && ` · migrace ${state.migrations.join(", ")}`}
            {plan.dateRange && ` · transakce ${formatDate(plan.dateRange.from)} – ${formatDate(plan.dateRange.to)}`}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50/60 text-slate-500">
              <th className="px-3 py-2 text-left font-medium">Kolekce</th>
              <th className="px-3 py-2 text-right font-medium">V záloze</th>
              <th className="px-3 py-2 text-right font-medium">Nové</th>
              <th className="px-3 py-2 text-right font-medium">Shodné</th>
              <th className="px-3 py-2 text-right font-medium">Konflikty</th>
              <th className="px-3 py-2 text-right font-medium">Lokálně</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {COLLECTIONS.map((c) => {
              const s = plan.stats[c];
              return (
                <tr key={c}>
                  <td className="px-3 py-1.5">{COLLECTION_LABEL[c]}</td>
                  <td className="num px-3 py-1.5 text-right">{s.incoming}</td>
                  <td className="num px-3 py-1.5 text-right text-income-ink">{s.added || "—"}</td>
                  <td className="num px-3 py-1.5 text-right text-slate-500">{s.identical || "—"}</td>
                  <td className={clsx("num px-3 py-1.5 text-right", s.conflicts && "font-medium text-amber-700")}>
                    {s.conflicts || "—"}
                    {s.bankDuplicates > 0 && <span className="text-slate-400"> (+{s.bankDuplicates} dupl.)</span>}
                  </td>
                  <td className="num px-3 py-1.5 text-right text-slate-500">{s.local}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {plan.conflictExamples.length > 0 && (
        <details className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <summary className="cursor-pointer font-medium">Ukázky konfliktů ({totalConflicts})</summary>
          <ul className="mt-2 space-y-1.5">
            {plan.conflictExamples.map((c) => (
              <li key={`${c.collection}-${c.key}`}>
                <span className="text-amber-700">{COLLECTION_LABEL[c.collection]}:</span> lokálně „{c.local}“ → v záloze „{c.incoming}“
              </li>
            ))}
          </ul>
        </details>
      )}

      {plan.warnings.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-800">
          {plan.warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle className="size-3.5 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-medium text-slate-600">Způsob importu</legend>
        {MODES.map((m) => (
          <label
            key={m.value}
            className={clsx(
              "flex cursor-pointer gap-3 rounded-lg border px-3 py-2",
              mode === m.value ? "border-net bg-net/5" : "border-slate-200 hover:bg-slate-50",
              m.value === "replace" && mode === m.value && "border-red-400 bg-red-50",
            )}
          >
            <input type="radio" name="mode" className="mt-1 accent-navy-900" checked={mode === m.value} onChange={() => setMode(m.value)} />
            <span>
              <span className="block font-medium">{m.label}</span>
              <span className="block text-xs text-slate-500">{m.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Zrušit</Button>
        <Button variant={mode === "replace" ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
          {mode === "replace" ? "Nahradit data" : "Importovat"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ Import z banky ------------------------------ */

const NEW_ACCOUNT = "__new";

type BankState =
  | { step: "idle" }
  | { step: "error"; fileName: string; errors: string[] }
  | { step: "preview"; fileName: string; data: BankImport; plan: BankImportPlan }
  | { step: "done"; message: string };

function BankImportCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const accounts = useAccounts();
  const [state, setState] = useState<BankState>({ step: "idle" });
  const [accountId, setAccountId] = useState(NEW_ACCOUNT);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    const result = await parseBankFile(await file.arrayBuffer());
    if (!result.ok) {
      setState({ step: "error", fileName: file.name, errors: result.errors });
      return;
    }
    setAccountId(matchAccount(result.data, accounts)?.id ?? NEW_ACCOUNT);
    setState({ step: "preview", fileName: file.name, data: result.data, plan: await analyzeBankImport(result.data) });
  }

  async function confirmImport() {
    if (state.step !== "preview") return;
    setBusy(true);
    try {
      const target = accountId === NEW_ACCOUNT ? { newAccount: suggestedAccount(state.data) } : { accountId };
      const added = await applyBankImport(state.data, target);
      setState({ step: "done", message: `Přidáno ${added} transakcí ze souboru ${state.fileName}.` });
    } catch (e) {
      setState({ step: "error", fileName: state.fileName, errors: [`Zápis selhal, databáze zůstala beze změny: ${e instanceof Error ? e.message : String(e)}`] });
    } finally {
      setBusy(false);
    }
  }

  const reset = () => {
    setState({ step: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  const fresh = state.step === "preview" ? state.plan.fresh.length : 0;

  return (
    <Card>
      <CardHeader
        title="Import z banky (CSV)"
        subtitle={`${SUPPORTED_BANKS.join(", ")}. Před uložením uvidíš, co přesně se importuje; už importované transakce se přeskočí.`}
      />
      <div className="p-5">
        <input
          ref={inputRef}
          type="file"
          accept="text/csv,.csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />

        {(state.step === "idle" || state.step === "preview") && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) void onFile(f);
            }}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500 transition-colors hover:border-net hover:bg-net/5"
          >
            <Upload className="size-5 text-slate-400" />
            Vyber nebo přetáhni výpis z bankovnictví (.csv)
          </button>
        )}

        {state.step === "error" && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4" /> Soubor {state.fileName} nelze importovat
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-6 text-xs">
              {state.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs">Do databáze nebylo nic zapsáno.</p>
            <Button size="sm" className="mt-3" onClick={reset}>Zkusit jiný soubor</Button>
          </div>
        )}

        {state.step === "done" && (
          <div className="rounded-xl border border-income/30 bg-income/5 p-4 text-sm text-income-ink">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="size-4" /> {state.message}
            </p>
            <Button size="sm" className="mt-3" onClick={reset}>Hotovo</Button>
          </div>
        )}
      </div>

      <Modal
        open={state.step === "preview"}
        size="lg"
        title="Potvrdit import z banky"
        // Dialog volá onClose i při programovém zavření po importu – rušíme jen rozpracovaný náhled
        onClose={() => !busy && state.step === "preview" && reset()}
        footer={
          <>
            <Button variant="ghost" onClick={reset} disabled={busy}>Zrušit</Button>
            <Button variant="primary" onClick={confirmImport} disabled={busy || fresh === 0}>
              {fresh === 0 ? "Vše už je importováno" : `Importovat ${fresh} transakcí`}
            </Button>
          </>
        }
      >
        {state.step === "preview" && <BankImportPreview state={state} accountId={accountId} setAccountId={setAccountId} />}
      </Modal>
    </Card>
  );
}

function BankImportPreview({
  state,
  accountId,
  setAccountId,
}: {
  state: Extract<BankState, { step: "preview" }>;
  accountId: string;
  setAccountId: (id: string) => void;
}) {
  const accounts = useAccounts().filter((a) => !a.archived);
  const { data, plan } = state;
  const suggested = suggestedAccount(data);
  const unbalanced = Object.entries(data.foreignTotals).filter(([, v]) => v !== 0);
  const check = data.balanceCheck;
  const checkOk = check && Math.abs(check.expected - check.actual) < 0.005;
  const income = plan.fresh.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = plan.fresh.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const rows = [...plan.fresh].sort((a, b) => b.date.localeCompare(a.date));
  const selected = accounts.find((a) => a.id === accountId);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-3">
        <Landmark className="mt-0.5 size-5 text-net" />
        <div>
          <p className="font-medium">
            {data.bankName}
            {data.accountNumber && ` · účet ${data.accountNumber}`}
            {data.accountName && ` · ${data.accountName}`}
          </p>
          <p className="text-xs text-slate-500">
            {state.fileName}
            {data.from && data.to && ` · ${formatDate(data.from)} – ${formatDate(data.to)}`}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 p-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">Importuje se</dt>
          <dd className="num text-base font-medium">{plan.fresh.length}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Už v aplikaci (přeskočí se)</dt>
          <dd className="num text-base font-medium text-slate-500">{plan.existing}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Příjmy</dt>
          <dd className="num text-base font-medium text-income-ink">{formatMoney(income, data.currency)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Výdaje</dt>
          <dd className="num text-base font-medium text-expense-ink">{formatMoney(expense, data.currency)}</dd>
        </div>
      </dl>

      <ul className="space-y-1 text-xs text-slate-600">
        {check && (
          <li className={clsx("flex gap-2", !checkOk && "text-amber-800")}>
            {checkOk ? <CheckCircle2 className="size-3.5 shrink-0 text-income-ink" /> : <AlertTriangle className="size-3.5 shrink-0" />}
            {checkOk
              ? `Součet transakcí ve výpisu odpovídá změně zůstatku (${formatMoney(check.expected, data.currency, { signed: true })}).`
              : `Součet transakcí (${formatMoney(check.actual, data.currency)}) neodpovídá změně zůstatku ve výpisu (${formatMoney(check.expected, data.currency)}).`}
          </li>
        )}
        {!check && accountId === NEW_ACCOUNT && (
          <li className="flex gap-2">
            <Info className="size-3.5 shrink-0 text-slate-400" />
            Výpis neobsahuje zůstatek. U nového účtu po importu doplň aktuální zůstatek, jinak bude zůstatek účtu jen součtem transakcí.
          </li>
        )}
        {data.foreignRows > 0 && (
          <li className="flex gap-2">
            <Info className="size-3.5 shrink-0 text-slate-400" />
            {data.foreignRows} řádků v cizí měně ({Object.keys(data.foreignTotals).join(", ")}) se samostatně neimportuje – jde o průchozí platby přes
            měnové podúčty. V {data.currency} je zastupuje směna, která dostane popis původní platby.
          </li>
        )}
        {unbalanced.map(([cur, total]) => (
          <li key={cur} className="flex gap-2 text-amber-800">
            <AlertTriangle className="size-3.5 shrink-0" /> Podúčet {cur} se ve výpisu nevyrovnal ({formatMoney(total, cur, { signed: true })}) – tato částka v aplikaci nebude.
          </li>
        ))}
      </ul>

      {rows.length > 0 && (
        <div className="max-h-[min(22rem,40vh)] overflow-y-auto rounded-xl border border-slate-100">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-face">
              <tr className="text-slate-500">
                <th className="px-3 py-2 text-left font-medium">Datum</th>
                <th className="px-3 py-2 text-left font-medium">Popis</th>
                <th className="px-3 py-2 text-right font-medium">Částka</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="num px-3 py-1.5 whitespace-nowrap text-slate-500">{formatDate(t.date)}</td>
                  <td className="px-3 py-1.5">{t.description}</td>
                  <td className={clsx("num px-3 py-1.5 text-right whitespace-nowrap", t.type === "income" ? "text-income-ink" : "text-expense-ink")}>
                    {formatMoney(t.type === "income" ? t.amount : -t.amount, t.currency, { signed: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Field label="Importovat do účtu">
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value={NEW_ACCOUNT}>
            Nový účet „{suggested.name}“
            {suggested.initialBalance !== undefined && suggested.initialBalanceDate &&
              ` (počáteční zůstatek ${formatMoney(suggested.initialBalance, suggested.currency)} k ${formatDate(suggested.initialBalanceDate)})`}
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
          ))}
        </Select>
      </Field>
      {selected && selected.currency !== data.currency && (
        <p className="text-xs text-amber-800">Vybraný účet je v jiné měně než výpis ({data.currency}).</p>
      )}
    </div>
  );
}

/* ------------------------------ Testovací účet ------------------------------ */

function DemoCard() {
  const demo = useLiveQuery(async () => {
    const account = await db.accounts.get(DEMO_ACCOUNT_ID);
    return { exists: account !== undefined, count: await db.transactions.where("accountId").equals(DEMO_ACCOUNT_ID).count() };
  });
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Testovací účet"
        subtitle="Vymyšlená data za poslední rok na vyzkoušení aplikace: výplata 30 000 Kč, zhruba 40 výdajů měsíčně a platby s kamarády."
      />
      <div className="p-5">
        <p className="flex gap-2 text-xs text-slate-500">
          <FlaskConical className="size-4 shrink-0 text-slate-400" />
          {demo?.exists
            ? `Testovací účet existuje (${demo.count} transakcí). Jeho data se promítají do přehledů a statistik spolu se skutečnými.`
            : "Vytvoří se samostatný účet „Testovací účet“. Tvoje skutečná data zůstanou beze změny a testovací půjdou kdykoli smazat."}
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {demo?.exists ? (
            <>
              <Button disabled={busy} onClick={() => run(() => createDemoData())}>Vygenerovat znovu</Button>
              <Button
                variant="secondary"
                className="!text-red-600"
                disabled={busy}
                onClick={() => confirm("Smazat testovací účet a všechny jeho transakce?") && run(removeDemoData)}
              >
                <Trash2 className="size-4" /> Smazat testovací účet
              </Button>
            </>
          ) : (
            <Button variant="primary" disabled={busy || !demo} onClick={() => run(() => createDemoData())}>
              <FlaskConical className="size-4" /> Vytvořit testovací účet
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function DangerZone() {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const CONFIRM = "SMAZAT";
  return (
    <Card className="mt-4 border-red-200">
      <CardHeader title="Smazat všechna data" subtitle="Nevratně odstraní transakce, kategorie, účty, rozpočty i nastavení z tohoto prohlížeče." />
      <div className="p-5">
        {!open ? (
          <Button variant="secondary" className="!text-red-600" onClick={() => setOpen(true)}>
            <Trash2 className="size-4" /> Smazat data…
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600">Pro potvrzení napiš {CONFIRM}:</span>
            <Input className="w-36" value={text} onChange={(e) => setText(e.target.value)} />
            <Button
              variant="danger"
              disabled={text !== CONFIRM}
              onClick={async () => {
                await wipeAllData();
                location.assign("/");
              }}
            >
              Smazat nevratně
            </Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setText(""); }}>Zrušit</Button>
          </div>
        )}
      </div>
    </Card>
  );
}
