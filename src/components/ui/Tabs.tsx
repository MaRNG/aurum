import clsx from "clsx";
import { NavLink } from "react-router";

/** Záložky podsekce jako odkazy – každá má vlastní URL. */
export function TabNav({ tabs }: { tabs: { to: string; label: string; end?: boolean }[] }) {
  return (
    <nav className="mb-6 flex gap-5 overflow-x-auto border-b border-slate-900/10">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            clsx(
              "-mb-px border-b-2 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              isActive ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900",
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Posuvný přepínač: zapuštěná drážka, zvolená poloha je vystouplá bílá klávesa. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-casing-deep/70 p-0.5 shadow-well">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-full px-3 py-1 text-xs font-semibold transition-[background-color,color,box-shadow] duration-150",
            value === o.value ? "bg-face text-slate-900 shadow-key" : "text-slate-600 hover:text-slate-900",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
