import { useMemo, useState } from "react";
import clsx from "clsx";
import { Copy, Plus, Save, Trash2, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/PageHeader";
import { useCategories, useScenarios, useSettings, useTransactionsBetween } from "@/db/hooks";
import { scenariosRepo } from "@/db/repositories";
import { addMonths, currentMonthKey, monthBounds, monthLabelLower } from "@/domain/months";
import { BASELINE_MONTHS, computeBaseline, runScenario } from "@/domain/scenarios";
import { SERIES_COLORS } from "@/domain/defaults";
import type { Category, Scenario, ScenarioAdjustment } from "@/domain/schema";
import { formatMoney } from "@/lib/format";
import { MultiLineChart } from "@/features/charts";

interface Draft {
  id?: string;
  name: string;
  horizonMonths: number;
  adjustments: ScenarioAdjustment[];
}

const TEMPLATES: { label: string; draft: (cats: Category[]) => Draft }[] = [
  { label: "Šetřit o 3 000 Kč víc", draft: () => ({ name: "Šetřit o 3 000 Kč víc", horizonMonths: 12, adjustments: [{ kind: "savings", amount: 3000 }] }) },
  {
    label: "Zvýšení nájmu",
    draft: (c) => ({ name: "Zvýšení nájmu o 2 000 Kč", horizonMonths: 12, adjustments: [{ kind: "category", categoryId: c.find((x) => x.id === "cat-housing")?.id ?? expenseCats(c)[0]?.id ?? "", mode: "amount", value: 2000 }] }),
  },
  { label: "Příjem +10 %", draft: () => ({ name: "Zvýšení příjmu o 10 %", horizonMonths: 12, adjustments: [{ kind: "income", mode: "percent", value: 10 }] }) },
  { label: "Investovat 3 000 Kč měsíčně", draft: () => ({ name: "Pravidelné investování", horizonMonths: 120, adjustments: [{ kind: "investment", amount: 3000, annualReturn: 5 }] }) },
];

const HORIZONS = [
  { value: 12, label: "1 rok" },
  { value: 36, label: "3 roky" },
  { value: 60, label: "5 let" },
  { value: 120, label: "10 let" },
];

const ADJ_LABEL: Record<ScenarioAdjustment["kind"], string> = {
  savings: "Ušetřit navíc",
  income: "Změna příjmu",
  category: "Změna výdajů kategorie",
  budget: "Nový rozpočet kategorie",
  investment: "Pravidelné investování",
};

const expenseCats = (cats: Category[]) => cats.filter((c) => c.type !== "income").sort((a, b) => a.name.localeCompare(b.name, "cs"));

function emptyAdjustment(kind: ScenarioAdjustment["kind"], cats: Category[]): ScenarioAdjustment {
  const cat = expenseCats(cats)[0]?.id ?? "";
  switch (kind) {
    case "savings": return { kind, amount: 1000 };
    case "income": return { kind, mode: "amount", value: 2000 };
    case "category": return { kind, categoryId: cat, mode: "percent", value: -10 };
    case "budget": return { kind, categoryId: cat, amount: 3000 };
    case "investment": return { kind, amount: 2000, annualReturn: 5 };
  }
}

export function Scenarios() {
  const today = currentMonthKey();
  const txs = useTransactionsBetween(monthBounds(addMonths(today, -BASELINE_MONTHS)).from, monthBounds(today).to);
  const categories = useCategories();
  const scenarios = useScenarios();
  const { baseCurrency: currency } = useSettings();
  const [draft, setDraft] = useState<Draft>(() => TEMPLATES[0]!.draft([]));
  const [saved, setSaved] = useState(false);
  // Zvyšuje se při načtení jiného scénáře – vynutí nové vykreslení polí s defaultValue
  const [rev, setRev] = useState(0);

  const baseline = useMemo(() => (txs ? computeBaseline(txs, categories, today) : null), [txs, categories, today]);
  const result = useMemo(
    () => (baseline && baseline.months.length ? runScenario(baseline, draft.adjustments, categories, draft.horizonMonths) : null),
    [baseline, draft, categories],
  );

  const money = (n: number, signed = false) => formatMoney(n, currency, { signed });
  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  };
  const setAdj = (i: number, a: ScenarioAdjustment) => update({ adjustments: draft.adjustments.map((x, j) => (j === i ? a : x)) });

  async function save() {
    const s = await scenariosRepo.save({ name: draft.name, horizonMonths: draft.horizonMonths, adjustments: draft.adjustments }, draft.id);
    setDraft((d) => ({ ...d, id: s.id }));
    setSaved(true);
  }

  if (!baseline) return null;
  if (!baseline.months.length) {
    return (
      <Card>
        <EmptyState title="Pro scénáře potřebuji alespoň jeden uzavřený měsíc s daty." />
      </Card>
    );
  }

  const chartRows = result?.projection.map((p) => ({
    month: addMonths(today, p.month),
    baseline: Math.round(p.baseline),
    scenario: Math.round(p.scenarioTotal),
    ...(result.effects.some((e) => e.invested) ? { investments: Math.round(p.investments) } : {}),
  }));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Výchozí stav" subtitle={`Průměr ${baseline.months.length} uzavřených měsíců (${baseline.months.map(monthLabelLower).join(", ")})`} />
          <CardBody className="num space-y-1.5 text-sm">
            <Line label="Příjmy" value={money(baseline.income)} />
            <Line label="Výdaje" value={money(baseline.expense)} />
            <Line label="Současné tempo" value={`${money(baseline.net, true)} / měsíc`} strong />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Uložené scénáře" />
          <div className="p-5 pt-3">
            {scenarios.length ? (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {scenarios.map((s: Scenario) => (
                  <li key={s.id} className={clsx("group flex items-center gap-2 px-3 py-2 text-sm", draft.id === s.id && "bg-net/5")}>
                    <button type="button" className="flex-1 text-left hover:text-net" onClick={() => { setDraft({ id: s.id, name: s.name, horizonMonths: s.horizonMonths, adjustments: s.adjustments }); setSaved(true); setRev((r) => r + 1); }}>
                      {s.name}
                    </button>
                    <IconButton label="Smazat" className="opacity-60 group-hover:opacity-100 hover:!text-red-600" onClick={() => confirm(`Smazat scénář „${s.name}“?`) && scenariosRepo.remove(s.id)}>
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Zatím žádné.</p>
            )}
            <p className="mt-4 mb-2 text-xs font-medium text-slate-500">Začít ze šablony</p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => (
                <Button key={t.label} size="sm" onClick={() => { setDraft(t.draft(categories)); setSaved(false); setRev((r) => r + 1); }}>
                  {t.label}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-4 xl:col-span-2">
        <Card>
          <div className="flex flex-wrap items-end gap-3 p-5">
            <Field label="Název scénáře" className="min-w-48 flex-1">
              <Input value={draft.name} onChange={(e) => update({ name: e.target.value })} />
            </Field>
            <Field label="Horizont">
              <Select className="w-32" value={draft.horizonMonths} onChange={(e) => update({ horizonMonths: Number(e.target.value) })}>
                {HORIZONS.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              {draft.id && (
                <Button onClick={() => { update({ id: undefined, name: `${draft.name} (kopie)` }); }}>
                  <Copy className="size-4" /> Kopie
                </Button>
              )}
              <Button variant="primary" onClick={save} disabled={!draft.name.trim() || saved}>
                <Save className="size-4" /> {saved ? "Uloženo" : "Uložit"}
              </Button>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 p-5">
            {draft.adjustments.map((a, i) => (
              <AdjustmentEditor key={`${rev}-${i}-${a.kind}`} a={a} categories={categories} onChange={(x) => setAdj(i, x)} onRemove={() => update({ adjustments: draft.adjustments.filter((_, j) => j !== i) })} />
            ))}
            <div className="flex items-center gap-2 pt-1">
              <Plus className="size-4 text-slate-400" />
              <Select
                aria-label="Přidat změnu"
                className="h-8 w-64"
                value=""
                onChange={(e) => e.target.value && update({ adjustments: [...draft.adjustments, emptyAdjustment(e.target.value as ScenarioAdjustment["kind"], categories)] })}
              >
                <option value="">Přidat změnu…</option>
                {Object.entries(ADJ_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </Select>
            </div>
          </div>
        </Card>

        {result && (
          <Card>
            <CardHeader title="Výsledek" subtitle="Jednoduchá projekce: průměrné měsíční hodnoty se opakují, investice se úročí měsíčně." />
            <CardBody>
              <div className="num grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
                <Metric label="Současné tempo" value={`${money(result.baseNet, true)} / měsíc`} />
                <Metric label="Nové tempo" value={`${money(result.newPace, true)} / měsíc`} strong />
                <Metric label="Rozdíl za rok" value={money(result.diffYearly, true)} tone={result.diffYearly} strong />
              </div>
              {result.effects.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-slate-600">
                  {result.effects.map((e, i) => (
                    <li key={i} className="flex justify-between gap-4">
                      <span>{e.label}</span>
                      <span className="num whitespace-nowrap">
                        {e.invested ? `${money(e.invested)} do investic` : `${money(e.cashDelta, true)} / měsíc`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <MultiLineChart
                  rows={chartRows!}
                  currency={currency}
                  series={[
                    { key: "baseline", name: "Současné tempo", color: "#8c8a81", dashed: true },
                    { key: "scenario", name: "Scénář (celkem)", color: SERIES_COLORS.net },
                    ...(result.effects.some((e) => e.invested) ? [{ key: "investments", name: "Z toho investice", color: SERIES_COLORS.income }] : []),
                  ]}
                />
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Za {HORIZONS.find((h) => h.value === draft.horizonMonths)?.label ?? `${draft.horizonMonths} měsíců`}: současné tempo{" "}
                <b className="num font-medium">{money(result.final.baseline, true)}</b>, scénář <b className="num font-medium">{money(result.final.scenarioTotal, true)}</b>
                {result.final.investments > 0 && <> (z toho investice {money(result.final.investments)})</>}.
              </p>
              <p className="mt-2 text-xs text-slate-500">Jde o modelový výpočet, ne o finanční doporučení. Výnos investic není zaručený.</p>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

function AdjustmentEditor({ a, categories, onChange, onRemove }: { a: ScenarioAdjustment; categories: Category[]; onChange: (a: ScenarioAdjustment) => void; onRemove: () => void }) {
  const num = (v: string) => Number(v.replace(",", ".")) || 0;
  const catSelect = (value: string, set: (id: string) => void) => (
    <Select aria-label="Kategorie" className="h-8 w-44" value={value} onChange={(e) => set(e.target.value)}>
      {expenseCats(categories).map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </Select>
  );
  const numInput = (value: number, set: (n: number) => void, label: string, width = "w-28") => (
    <Input aria-label={label} inputMode="decimal" className={clsx("num h-8 text-right", width)} defaultValue={String(value)} onChange={(e) => set(num(e.target.value))} />
  );
  const modeSelect = (mode: "amount" | "percent", set: (m: "amount" | "percent") => void) => (
    <Select aria-label="Jednotka" className="h-8 w-20" value={mode} onChange={(e) => set(e.target.value as "amount" | "percent")}>
      <option value="amount">Kč</option>
      <option value="percent">%</option>
    </Select>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
      <span className="w-48 font-medium text-slate-700">{ADJ_LABEL[a.kind]}</span>
      {a.kind === "savings" && <>{numInput(a.amount, (amount) => onChange({ ...a, amount }), "Částka")} <span className="text-slate-500">Kč / měsíc</span></>}
      {a.kind === "income" && <>{numInput(a.value, (value) => onChange({ ...a, value }), "Změna")} {modeSelect(a.mode, (mode) => onChange({ ...a, mode }))}</>}
      {a.kind === "category" && (
        <>
          {catSelect(a.categoryId, (categoryId) => onChange({ ...a, categoryId }))}
          {numInput(a.value, (value) => onChange({ ...a, value }), "Změna")}
          {modeSelect(a.mode, (mode) => onChange({ ...a, mode }))}
        </>
      )}
      {a.kind === "budget" && <>{catSelect(a.categoryId, (categoryId) => onChange({ ...a, categoryId }))} {numInput(a.amount, (amount) => onChange({ ...a, amount }), "Rozpočet")} <span className="text-slate-500">Kč / měsíc</span></>}
      {a.kind === "investment" && (
        <>
          {numInput(a.amount, (amount) => onChange({ ...a, amount }), "Částka")} <span className="text-slate-500">Kč / měsíc, výnos</span>
          {numInput(a.annualReturn, (annualReturn) => onChange({ ...a, annualReturn }), "Roční výnos", "w-16")} <span className="text-slate-500">% p. a.</span>
        </>
      )}
      <IconButton label="Odebrat" className="ml-auto" onClick={onRemove}>
        <X className="size-3.5" />
      </IconButton>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={clsx("flex justify-between", strong && "border-t border-slate-100 pt-1.5 font-medium")}>
      <span className="font-sans text-slate-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Metric({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: number }) {
  return (
    <div>
      <p className="font-sans text-xs text-slate-500">{label}</p>
      <p className={clsx("mt-0.5", strong && "text-base font-semibold", tone !== undefined && tone > 0 && "text-income-ink", tone !== undefined && tone < 0 && "text-expense-ink")}>{value}</p>
    </div>
  );
}
