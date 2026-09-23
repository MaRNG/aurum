import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, currentMonthKey, monthLabel } from "@/domain/months";

export const roundKey =
  "inline-flex size-9 items-center justify-center rounded-full bg-face text-slate-700 shadow-key ring-1 ring-slate-300/70 transition-[background-color,box-shadow] " +
  "hover:bg-slate-50 hover:text-slate-900 active:translate-y-px active:shadow-key-pressed focus-visible:outline-2 focus-visible:outline-slate-900";

/** Dvě kulaté klávesy a mezi nimi okénko s měsícem. */
export function MonthPicker({ value, onChange }: { value: string; onChange: (month: string) => void }) {
  const isCurrent = value === currentMonthKey();
  return (
    <div className="inline-flex items-center gap-1.5">
      <button type="button" aria-label="Předchozí měsíc" title="Předchozí měsíc" className={roundKey} onClick={() => onChange(addMonths(value, -1))}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="num inline-flex h-9 min-w-34 items-center justify-center rounded-lg bg-display px-3 text-sm font-semibold text-display-ink">
        {monthLabel(value)}
      </span>
      <button type="button" aria-label="Další měsíc" title="Další měsíc" className={roundKey} onClick={() => onChange(addMonths(value, 1))}>
        <ChevronRight className="size-4" />
      </button>
      {!isCurrent && (
        <button
          type="button"
          onClick={() => onChange(currentMonthKey())}
          className="ml-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-slate-700 underline decoration-slate-300 underline-offset-3 hover:text-slate-900 hover:decoration-slate-900"
        >
          Dnes
        </button>
      )}
    </div>
  );
}
