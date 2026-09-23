import { useState } from "react";
import clsx from "clsx";
import { AlertTriangle, ChevronDown, Info, TrendingDown, TrendingUp } from "lucide-react";
import type { Insight } from "@/domain/insights";

const TONE = {
  positive: { icon: TrendingDown, cls: "text-income-ink ring-income/35" },
  negative: { icon: TrendingUp, cls: "text-expense-ink ring-expense/35" },
  warning: { icon: AlertTriangle, cls: "text-amber-700 ring-amber-500/40" },
  neutral: { icon: Info, cls: "text-slate-600 ring-slate-400/50" },
} as const;

/** Insight s rozbalitelným vysvětlením, ze kterých čísel vznikl. */
export function InsightItem({ insight }: { insight: Insight }) {
  const [open, setOpen] = useState(false);
  const { icon: Icon, cls } = TONE[insight.tone];
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex gap-3">
        <span className={clsx("mt-px flex size-7 shrink-0 items-center justify-center rounded-full bg-face ring-1", cls)}>
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-800">{insight.text}</p>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-slate-600 underline decoration-slate-300 underline-offset-3 hover:text-slate-900 hover:decoration-slate-900"
          >
            Jak to bylo spočítáno
            <ChevronDown className={clsx("size-3 transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <div className="mt-2.5 rounded-lg bg-slate-50 p-3 text-xs shadow-well ring-1 ring-slate-900/5">
              <dl className="space-y-1">
                {insight.basis.map((row) => (
                  <div key={row.label} className="flex justify-between gap-4">
                    <dt className="text-slate-500">{row.label}</dt>
                    <dd className="num font-medium text-slate-800">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 border-t border-slate-200 pt-2 text-slate-500">{insight.method}</p>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
