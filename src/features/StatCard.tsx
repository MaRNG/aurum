import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Barva kontrolky identifikující řadu (příjmy/výdaje/úspora). */
  accent?: string;
}) {
  return (
    <div className="bg-face p-5">
      <p className="flex items-center gap-2 text-xs font-medium text-slate-600">
        {accent && <span className="lamp" style={{ background: accent }} />}
        {label}
      </p>
      <p className="num mt-2.5 text-[1.625rem] leading-none font-semibold tracking-[-0.02em] text-slate-900">{value}</p>
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
