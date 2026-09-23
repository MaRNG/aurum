import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

/** Klávesy přístroje: žlutá = hlavní akce, bílá = běžná, bez rámu = sekundární, červená = nevratná. */
const variants: Record<Variant, string> = {
  primary: "bg-key text-key-ink shadow-key hover:bg-key-hover active:shadow-key-pressed",
  secondary: "bg-face text-slate-800 shadow-key ring-1 ring-slate-300/70 hover:bg-slate-50 active:shadow-key-pressed",
  ghost: "text-slate-600 hover:bg-slate-900/5 hover:text-slate-900",
  danger: "bg-expense text-white shadow-key hover:bg-expense-ink active:shadow-key-pressed",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition-[background-color,box-shadow,transform] duration-150 active:translate-y-px",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:pointer-events-none disabled:opacity-45",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4.5 text-sm",
        variants[variant],
        className,
      )}
    />
  );
}

/** Kulatá klávesa s ikonou. */
export function IconButton({ label, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={clsx(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-900/6 hover:text-slate-900",
        "focus-visible:outline-2 focus-visible:outline-slate-900 disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    />
  );
}
