import clsx from "clsx";
import type { ReactNode } from "react";

/** Matný panel přístroje – od těla ho odděluje jen spára, žádný stín. */
export function Card({ className, children, flush = false }: { className?: string; children: ReactNode; flush?: boolean }) {
  // flush = modul uvnitř společné desky (spáry dělá deska, ne karta)
  return <section className={clsx("bg-face", !flush && "rounded-xl ring-1 ring-slate-900/8", className)}>{children}</section>;
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 pt-4.5">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 text-xs">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("p-5", className)}>{children}</div>;
}
