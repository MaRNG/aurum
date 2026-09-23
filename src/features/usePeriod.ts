import { useSearchParams } from "react-router";
import { addMonths, currentMonthKey, monthRange } from "@/domain/months";

export type PeriodPreset = "3" | "6" | "12" | "24" | "custom";

export const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "3", label: "3 měs." },
  { value: "6", label: "6 měs." },
  { value: "12", label: "12 měs." },
  { value: "24", label: "24 měs." },
  { value: "custom", label: "Vlastní" },
];

const isMonth = (s: string | null): s is string => !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

/**
 * Období statistik uložené v URL (?p=12&cur=1&from=2025-01&to=2025-12).
 * Výchozí konec = poslední uzavřený měsíc, protože neúplný měsíc zkresluje průměry.
 */
export function usePeriod() {
  const [params, setParams] = useSearchParams();
  const preset = (params.get("p") as PeriodPreset | null) ?? "12";
  const includeCurrent = params.get("cur") === "1";
  const today = currentMonthKey();
  const defaultEnd = includeCurrent ? today : addMonths(today, -1);

  let from: string;
  let to: string;
  if (preset === "custom") {
    to = isMonth(params.get("to")) ? params.get("to")! : defaultEnd;
    from = isMonth(params.get("from")) ? params.get("from")! : addMonths(to, -11);
    if (from > to) [from, to] = [to, from];
  } else {
    to = defaultEnd;
    from = addMonths(to, -(Number(preset) - 1));
  }
  const count = Math.min(120, (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5)) - Number(from.slice(5)) + 1);
  const months = monthRange(to, count);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  return {
    preset,
    includeCurrent,
    from: months[0]!,
    to,
    months,
    setPreset: (p: PeriodPreset) => update(p === "custom" ? { p, from: months[0]!, to } : { p, from: null, to: null }),
    setRange: (f: string, t: string) => update({ p: "custom", from: f, to: t }),
    setIncludeCurrent: (v: boolean) => update({ cur: v ? "1" : null }),
  };
}
