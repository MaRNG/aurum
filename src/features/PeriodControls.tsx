import { Segmented } from "@/components/ui/Tabs";
import { Input } from "@/components/ui/Field";
import { PERIOD_OPTIONS, type usePeriod } from "./usePeriod";

export function PeriodControls({ period }: { period: ReturnType<typeof usePeriod> }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented label="Období" value={period.preset} options={PERIOD_OPTIONS} onChange={period.setPreset} />
      {period.preset === "custom" ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Input type="month" aria-label="Od" className="h-8 w-40" value={period.from} onChange={(e) => e.target.value && period.setRange(e.target.value, period.to)} />
          –
          <Input type="month" aria-label="Do" className="h-8 w-40" value={period.to} onChange={(e) => e.target.value && period.setRange(period.from, e.target.value)} />
        </div>
      ) : (
        <label className="inline-flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            className="size-3.5 accent-navy-900"
            checked={period.includeCurrent}
            onChange={(e) => period.setIncludeCurrent(e.target.checked)}
          />
          Včetně aktuálního (neúplného) měsíce
        </label>
      )}
    </div>
  );
}
