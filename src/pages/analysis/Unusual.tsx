import { useMemo, useState } from "react";
import { ChevronDown, SearchCheck } from "lucide-react";
import clsx from "clsx";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Tabs";
import { useCategories, useSettings, useTransactionsBetween } from "@/db/hooks";
import { CATEGORY_RULE, findUnusualCategoryMonths, findUnusualTransactions, TX_RULE, type UnusualCategoryMonth } from "@/domain/anomalies";
import { addMonths, currentMonthKey, monthBounds, monthLabel, monthRange } from "@/domain/months";
import { formatDate, formatMoney } from "@/lib/format";

const RANGES = [
  { value: "3", label: "3 měs." },
  { value: "6", label: "6 měs." },
  { value: "12", label: "12 měs." },
] as const;

const times = (n: number) => `${n.toFixed(1).replace(".", ",")}×`;

export function Unusual() {
  const [range, setRange] = useState<"3" | "6" | "12">("6");
  const today = currentMonthKey();
  const months = useMemo(() => monthRange(today, Number(range)), [today, range]);
  // + historie potřebná pro srovnání nejstaršího měsíce
  const fetchFrom = addMonths(months[0]!, -Math.max(TX_RULE.lookbackMonths, CATEGORY_RULE.lookbackMonths));
  const txs = useTransactionsBetween(monthBounds(fetchFrom).from, monthBounds(today).to);
  const categories = useCategories();
  const { baseCurrency: currency } = useSettings();

  const unusualTx = useMemo(() => (txs ? findUnusualTransactions(txs, categories, months) : []), [txs, categories, months]);
  const unusualCat = useMemo(() => (txs ? findUnusualCategoryMonths(txs, categories, months) : []), [txs, categories, months]);

  return (
    <>
      <div className="mb-4">
        <Segmented label="Období" value={range} options={[...RANGES]} onChange={setRange} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Neobvykle vysoké transakce"
          subtitle={`Aspoň ${TX_RULE.minRatio}× nad obvyklou částkou v kategorii, robustní z-skóre ≥ ${TX_RULE.minZ}, min. ${formatMoney(TX_RULE.minAmount, currency)}. Srovnání s předchozími ${TX_RULE.lookbackMonths} měsíci.`}
        />
        {unusualTx.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                  <th className="px-5 py-2.5 text-left font-medium">Datum</th>
                  <th className="px-5 py-2.5 text-left font-medium">Popis</th>
                  <th className="px-5 py-2.5 text-left font-medium">Kategorie</th>
                  <th className="px-5 py-2.5 text-right font-medium">Částka</th>
                  <th className="px-5 py-2.5 text-right font-medium">Obvykle (medián)</th>
                  <th className="px-5 py-2.5 text-right font-medium">Násobek</th>
                  <th className="px-5 py-2.5 text-left font-medium">Srovnáno s</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unusualTx.map((u) => (
                  <tr key={u.tx.id}>
                    <td className="num px-5 py-2.5 text-slate-500">{formatDate(u.tx.date)}</td>
                    <td className="px-5 py-2.5">{u.tx.description || "—"}</td>
                    <td className="px-5 py-2.5 text-slate-600">{u.categoryName}</td>
                    <td className="num px-5 py-2.5 text-right font-medium">{formatMoney(u.tx.amount, u.tx.currency)}</td>
                    <td className="num px-5 py-2.5 text-right text-slate-600">{formatMoney(u.median, u.tx.currency)}</td>
                    <td className="num px-5 py-2.5 text-right text-expense-ink">{times(u.ratio)}</td>
                    <td className="px-5 py-2.5 text-xs text-slate-500">
                      {u.samples} {u.comparedTo === "category" ? "transakcemi v kategorii" : "výdaji celkem (málo dat v kategorii)"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<SearchCheck className="size-5" />} title="Žádné neobvyklé transakce" />
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Neobvyklé měsíce v kategoriích"
          subtitle={`Součet kategorie aspoň ${times(CATEGORY_RULE.minRatio)} průměru předchozích ${CATEGORY_RULE.lookbackMonths} měsíců a o ${formatMoney(CATEGORY_RULE.minDiff, currency)} víc. Potřeba aspoň ${CATEGORY_RULE.minHistoryMonths} měsíce historie.`}
        />
        <div className="p-5">
          {unusualCat.length ? (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {unusualCat.map((u) => (
                <CategoryMonthRow key={`${u.month}-${u.categoryId}`} u={u} currency={currency} inProgress={u.month === today} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">V tomto období žádná kategorie výrazně nevybočuje.</p>
          )}
        </div>
      </Card>
    </>
  );
}

function CategoryMonthRow({ u, currency, inProgress }: { u: UnusualCategoryMonth; currency: string; inProgress: boolean }) {
  const [open, setOpen] = useState(false);
  const max = Math.max(u.total, ...u.history.map((h) => h.total));
  return (
    <li className="px-4 py-3">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-3 text-left">
        <span className="size-2.5 rounded-sm" style={{ background: u.color }} />
        <span className="flex-1 text-sm">
          <b className="font-medium">{u.categoryName}</b> · {monthLabel(u.month)}
          {inProgress && " (zatím)"}: {formatMoney(u.total, currency)}, přibližně <b className="font-medium">{times(u.ratio)}</b> průměru
        </span>
        <ChevronDown className={clsx("size-4 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-3 space-y-1.5 pl-5 text-xs">
          {[...u.history, { month: u.month, total: u.total }].map((h) => (
            <div key={h.month} className="flex items-center gap-3">
              <span className="w-28 text-slate-500">{monthLabel(h.month)}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${(h.total / max) * 100}%`, background: h.month === u.month ? u.color : "#dddbd5" }} />
              </div>
              <span className="num w-24 text-right">{formatMoney(h.total, currency)}</span>
            </div>
          ))}
          <p className="pt-1 text-slate-500">Průměr srovnávacího období: {formatMoney(u.average, currency)}</p>
        </div>
      )}
    </li>
  );
}
