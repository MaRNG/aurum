import clsx from "clsx";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/** Vstupy jsou zapuštěné do panelu (jamka), fokus je grafitový prstenec. */
const control =
  "h-9 rounded-lg border border-slate-300/80 bg-slate-50 px-3 text-sm text-slate-900 shadow-well placeholder:text-slate-400 transition-colors " +
  "hover:border-slate-400/70 focus:border-slate-900 focus:bg-face focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:opacity-60";

export function Field({ label, error, children, className }: { label: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs font-medium text-expense-ink">{error}</span>}
    </label>
  );
}

/** Výchozí šířka je 100 %, pokud className neurčuje vlastní `w-*`. */
const width = (className?: string) => (className && /(^|\s)w-/.test(className) ? undefined : "w-full");

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(control, width(className), className)} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={clsx(control, width(className), "pr-8", className)}>
      {children}
    </select>
  );
}
