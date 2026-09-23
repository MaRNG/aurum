import { useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import type { Forecast } from "@/domain/forecast";
import { monthLabelLower } from "@/domain/months";
import { formatMoney } from "@/lib/format";

/** Rozbalitelné vysvětlení predikce: použitá metoda, zpětný test všech metod, počet měsíců. */
export function ForecastExplain({ f, currency }: { f: Forecast; currency: string }) {
  const [open, setOpen] = useState(false);
  if (f.status !== "ok") return null;
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-500 hover:text-slate-800">
        Jak to bylo spočítáno <ChevronDown className={clsx("size-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p>
            Metoda: <b className="font-medium text-slate-800">{f.method.label}</b> – {f.method.description}{" "}
            {f.backtested
              ? "Vybrána, protože měla při zpětném testu na tvých datech nejmenší průměrnou chybu."
              : "Pro zpětný test je zatím málo dat, použita výchozí metoda."}
          </p>
          <table className="num mt-2 w-full">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="py-0.5 font-medium">Metoda</th>
                <th className="py-0.5 text-right font-medium">Odhad</th>
                <th className="py-0.5 text-right font-medium">Prům. chyba</th>
                <th className="py-0.5 text-right font-medium">Testů</th>
              </tr>
            </thead>
            <tbody>
              {f.methods.map((m) => (
                <tr key={m.id} className={m.id === f.method.id ? "font-medium text-slate-900" : undefined}>
                  <td className="py-0.5 font-sans">{m.label}</td>
                  <td className="py-0.5 text-right">{m.prediction === null ? "málo dat" : formatMoney(m.prediction, currency)}</td>
                  <td className="py-0.5 text-right">{m.mae === null ? "—" : formatMoney(m.mae, currency)}</td>
                  <td className="py-0.5 text-right">{m.samples}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-slate-500">
            Rozsah ≈ 80% interval: odhad ± 1,28 × směrodatná chyba metody
            {f.horizon > 1 && `, rozšířeno pro ${f.horizon} měsíce dopředu (× √${f.horizon})`}. Počítáno z {f.historyCount} uzavřených měsíců s daty
            pro {monthLabelLower(f.target)}.
          </p>
        </div>
      )}
    </div>
  );
}
