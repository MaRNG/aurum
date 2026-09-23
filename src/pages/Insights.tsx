import { useMemo, useState } from "react";
import { Lightbulb } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { useBudgets, useCategories, useRecurring, useSettings, useTransactionsBetween } from "@/db/hooks";
import { computeInsights, INSIGHT_KIND_LABEL, type Insight, type InsightKind } from "@/domain/insights";
import { addMonths, currentMonthKey, monthBounds, todayIso } from "@/domain/months";
import { InsightItem } from "@/features/InsightItem";

const ORDER: InsightKind[] = ["budget", "spending", "category", "anomaly", "trend", "savings", "income", "recurring"];

export function Insights() {
  const [month, setMonth] = useState(currentMonthKey());
  const { baseCurrency: currency } = useSettings();
  const categories = useCategories();
  const budgets = useBudgets();
  const recurring = useRecurring();
  const txs = useTransactionsBetween(monthBounds(addMonths(month, -13)).from, monthBounds(month).to);

  const groups = useMemo(() => {
    if (!txs) return null;
    const all = computeInsights({ month, today: todayIso(), txs, categories, currency, budgets, recurring, scope: "full" });
    const byKind = new Map<InsightKind, Insight[]>();
    for (const i of all) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);
    return ORDER.filter((k) => byKind.has(k)).map((k) => ({ kind: k, items: byKind.get(k)! }));
  }, [txs, month, categories, currency, budgets, recurring]);

  return (
    <>
      <PageHeader
        title="Insights"
        subtitle="Automaticky vypočtené poznatky z tvých dat. Popisují, co se v datech děje – nejde o finanční rady."
        actions={<MonthPicker value={month} onChange={setMonth} />}
      />
      {groups && groups.length === 0 && (
        <Card>
          <EmptyState icon={<Lightbulb className="size-5" />} title="Zatím tu nic není">
            Většina poznatků potřebuje alespoň 3 měsíce historie. Nic neobvyklého zatím nevidím.
          </EmptyState>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups?.map((g) => (
          <Card key={g.kind}>
            <CardHeader title={INSIGHT_KIND_LABEL[g.kind]} />
            <ul className="divide-y divide-slate-100 p-5">
              {g.items.map((i) => (
                <InsightItem key={i.id} insight={i} />
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
