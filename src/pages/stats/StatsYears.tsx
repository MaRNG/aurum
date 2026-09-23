import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/PageHeader";
import { useAllTransactions, useCategories, useSettings } from "@/db/hooks";
import { MONTH_NAMES } from "@/domain/months";
import { compareYears, type Change } from "@/domain/stats";
import { formatMoney, formatPercent } from "@/lib/format";

export function StatsYears() {
  const [params, setParams] = useSearchParams();
  const all = useAllTransactions();
  const categories = useCategories();
  const { baseCurrency: currency } = useSettings();

  const now = new Date();
  const thisYear = now.getFullYear();
  const years = useMemo(() => {
    const ys = new Set((all ?? []).map((t) => Number(t.date.slice(0, 4))));
    ys.add(thisYear);
    return [...ys].sort((a, b) => b - a);
  }, [all, thisYear]);

  const yearB = Number(params.get("b")) || years[0]!;
  const yearA = Number(params.get("a")) || years.find((y) => y < yearB) || yearB - 1;
  // Neúplný rok: výchozí je férové srovnání stejného období (leden–aktuální měsíc)
  const incomplete = yearB === thisYear || yearA === thisYear;
  const samePeriod = params.get("same") !== "0" && incomplete;
  const upToMonth = samePeriod ? now.getMonth() + 1 : 12;

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  const cmp = useMemo(() => (all ? compareYears(all, categories, yearA, yearB, upToMonth) : null), [all, categories, yearA, yearB, upToMonth]);
  const hasData = cmp && (cmp.income.a || cmp.income.b || cmp.expense.a || cmp.expense.b);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select aria-label="Rok A" className="h-8 w-28" value={yearA} onChange={(e) => set("a", e.target.value)}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
        <span className="text-sm text-slate-500">vs.</span>
        <Select aria-label="Rok B" className="h-8 w-28" value={yearB} onChange={(e) => set("b", e.target.value)}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
        {incomplete && (
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" className="size-3.5 accent-navy-900" checked={samePeriod} onChange={(e) => set("same", e.target.checked ? "1" : "0")} />
            Jen stejné období (leden–{MONTH_NAMES[now.getMonth()]!.toLowerCase()})
          </label>
        )}
      </div>

      {cmp && hasData ? (
        <>
          {(cmp.monthsWithDataA < upToMonth || cmp.monthsWithDataB < upToMonth) && (
            <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <span>
                Neúplná data: {yearA} má záznamy za {cmp.monthsWithDataA} a {yearB} za {cmp.monthsWithDataB} z {upToMonth} porovnávaných
                měsíců. Procentní změny proto mohou být zavádějící.
              </span>
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ChangeTile label="Příjmy" c={cmp.income} good="up" currency={currency} />
            <ChangeTile label="Výdaje" c={cmp.expense} good="down" currency={currency} />
            <ChangeTile label="Úspory" c={cmp.net} good="up" currency={currency} />
          </div>

          <Card className="mt-4 overflow-hidden">
            <CardHeader
              title={`${yearA} vs. ${yearB}`}
              subtitle={upToMonth < 12 ? `Porovnáno období leden–${MONTH_NAMES[upToMonth - 1]!.toLowerCase()} obou let` : "Celé roky"}
            />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                    <th className="px-5 py-2.5 text-left font-medium">Položka</th>
                    <th className="px-5 py-2.5 text-right font-medium">{yearA}</th>
                    <th className="px-5 py-2.5 text-right font-medium">{yearB}</th>
                    <th className="px-5 py-2.5 text-right font-medium">Změna</th>
                    <th className="px-5 py-2.5 text-right font-medium">Změna %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <Row label="Příjmy" c={cmp.income} good="up" currency={currency} strong />
                  <Row label="Výdaje" c={cmp.expense} good="down" currency={currency} strong />
                  <Row label="Úspory" c={cmp.net} good="up" currency={currency} strong />
                  <tr>
                    <td colSpan={5} className="bg-slate-50/60 px-5 py-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                      Výdaje podle kategorií
                    </td>
                  </tr>
                  {cmp.categories.map((c) => (
                    <Row
                      key={c.categoryId ?? "none"}
                      label={
                        <span className="inline-flex items-center gap-2">
                          <span className="size-2.5 rounded-sm" style={{ background: c.color }} />
                          {c.name}
                        </span>
                      }
                      c={c}
                      good="down"
                      currency={currency}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        all && (
          <Card>
            <EmptyState title={`Pro roky ${yearA} a ${yearB} nejsou žádná data`} />
          </Card>
        )
      )}
    </>
  );
}

function tone(c: Change, good: "up" | "down") {
  if (c.diff === 0) return "text-slate-500";
  return (c.diff > 0) === (good === "up") ? "text-income-ink" : "text-expense-ink";
}

function ChangeTile({ label, c, good, currency }: { label: string; c: Change; good: "up" | "down"; currency: string }) {
  return (
    <div className="rounded-xl bg-face p-5 ring-1 ring-slate-900/8">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={clsx("num mt-2 text-2xl font-semibold tracking-tight", tone(c, good))}>
        {c.pct === null ? "—" : formatPercent(c.pct, { signed: true })}
      </p>
      <p className="num mt-1 text-xs text-slate-500">
        {formatMoney(c.a, currency)} → {formatMoney(c.b, currency)} ({formatMoney(c.diff, currency, { signed: true })})
      </p>
    </div>
  );
}

function Row({ label, c, good, currency, strong }: { label: ReactNode; c: Change; good: "up" | "down"; currency: string; strong?: boolean }) {
  return (
    <tr className={strong ? "font-medium" : undefined}>
      <td className="px-5 py-2.5">{label}</td>
      <td className="num px-5 py-2.5 text-right">{formatMoney(c.a, currency)}</td>
      <td className="num px-5 py-2.5 text-right">{formatMoney(c.b, currency)}</td>
      <td className={clsx("num px-5 py-2.5 text-right", tone(c, good))}>{formatMoney(c.diff, currency, { signed: true })}</td>
      <td className={clsx("num px-5 py-2.5 text-right", tone(c, good))}>{c.pct === null ? "nové" : formatPercent(c.pct, { signed: true })}</td>
    </tr>
  );
}
