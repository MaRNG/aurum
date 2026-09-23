import { mean } from "./aggregate";
import { addMonths, parseMonthKey } from "./months";
import { slope } from "./stats";

/**
 * Jednoduché, vysvětlitelné statistické predikce měsíčních částek.
 *
 * Postup:
 *  1. Každá metoda se „zpětně otestuje“: pro každý historický měsíc se odhadne jen z dat před ním
 *     a změří se chyba.
 *  2. Vybere se metoda s nejnižší průměrnou absolutní chybou (MAE).
 *  3. Rozsah = odhad ± 1,28 × směrodatná chyba metody (≈ 80% interval), rozšiřuje se s horizontem.
 *
 * Výsledek je odhad, ne jistota – UI ho vždy musí zobrazovat jako rozsah.
 */

export interface SeriesPoint {
  month: string;
  value: number;
}

export type MethodId = "ma3" | "wma6" | "trend" | "seasonal";

interface Method {
  id: MethodId;
  label: string;
  description: string;
  minHistory: number;
  /** odhad hodnoty pro `target` z historie (vzestupně, všechny měsíce < target) */
  predict(history: SeriesPoint[], target: string): number | null;
}

/** Minimální počet měsíců, pod kterým predikci vůbec nenabízíme. */
export const MIN_FORECAST_HISTORY = 3;
/** z-skóre pro ≈ 80% interval */
const Z80 = 1.28;
const MIN_BACKTEST = 3;

const monthsBetween = (a: string, b: string) => {
  const pa = parseMonthKey(a);
  const pb = parseMonthKey(b);
  return (pb.year - pa.year) * 12 + (pb.month - pa.month);
};

export const METHODS: Method[] = [
  {
    id: "ma3",
    label: "Klouzavý průměr (3 měs.)",
    description: "Průměr posledních 3 měsíců.",
    minHistory: 3,
    predict: (h) => mean(h.slice(-3).map((p) => p.value)),
  },
  {
    id: "wma6",
    label: "Vážený průměr (6 měs.)",
    description: "Posledních až 6 měsíců, novější mají vyšší váhu (1, 2, … 6).",
    minHistory: 4,
    predict: (h) => {
      const xs = h.slice(-6);
      const w = xs.map((_, i) => i + 1);
      return xs.reduce((s, p, i) => s + p.value * w[i]!, 0) / w.reduce((a, b) => a + b, 0);
    },
  },
  {
    id: "trend",
    label: "Lineární trend (12 měs.)",
    description: "Přímka proložená posledními až 12 měsíci, prodloužená do budoucna.",
    minHistory: 6,
    predict: (h, target) => {
      const xs = h.slice(-12);
      const ys = xs.map((p) => p.value);
      const k = slope(ys);
      const steps = xs.length - 1 + monthsBetween(xs[xs.length - 1]!.month, target);
      const intercept = mean(ys) - (k * (ys.length - 1)) / 2;
      return Math.max(0, intercept + k * steps);
    },
  },
  {
    id: "seasonal",
    label: "Sezónnost",
    description: "Průměr posledních 12 měsíců × sezónní index stejného měsíce v minulém roce.",
    minHistory: 24,
    predict: (h, target) => {
      const lastYear = h.find((p) => p.month === addMonths(target, -12));
      const yearBefore = h.filter((p) => p.month > addMonths(target, -24) && p.month <= addMonths(target, -12));
      if (!lastYear || yearBefore.length < 10) return null;
      const base = mean(yearBefore.map((p) => p.value));
      if (base <= 0) return null;
      return mean(h.slice(-12).map((p) => p.value)) * (lastYear.value / base);
    },
  },
];

export interface MethodEvaluation {
  id: MethodId;
  label: string;
  description: string;
  prediction: number | null;
  /** průměrná absolutní chyba zpětného testu */
  mae: number | null;
  /** směrodatná chyba (RMSE) zpětného testu */
  rmse: number | null;
  samples: number;
}

export type Forecast =
  | { status: "insufficient"; historyCount: number; required: number }
  | {
      status: "ok";
      target: string;
      /** o kolik měsíců za posledním známým měsícem */
      horizon: number;
      point: number;
      low: number;
      high: number;
      method: MethodEvaluation;
      methods: MethodEvaluation[];
      historyCount: number;
      /** true = metoda vybrána zpětným testem, false = výchozí (málo dat pro test) */
      backtested: boolean;
      sigma: number;
    };

function evaluate(method: Method, history: SeriesPoint[], target: string): MethodEvaluation {
  const errors: number[] = [];
  for (let i = method.minHistory; i < history.length; i++) {
    const p = method.predict(history.slice(0, i), history[i]!.month);
    if (p !== null) errors.push(p - history[i]!.value);
  }
  const prediction = history.length >= method.minHistory ? method.predict(history, target) : null;
  return {
    id: method.id,
    label: method.label,
    description: method.description,
    prediction,
    mae: errors.length ? mean(errors.map(Math.abs)) : null,
    rmse: errors.length ? Math.sqrt(mean(errors.map((e) => e * e))) : null,
    samples: errors.length,
  };
}

/** Zaokrouhlení podle řádu – žádná falešná přesnost. */
export function niceStep(value: number): number {
  const v = Math.abs(value);
  if (v >= 50_000) return 1000;
  if (v >= 5_000) return 500;
  if (v >= 1_000) return 100;
  return 50;
}

export function forecast(history: SeriesPoint[], target: string): Forecast {
  if (history.length < MIN_FORECAST_HISTORY) {
    return { status: "insufficient", historyCount: history.length, required: MIN_FORECAST_HISTORY };
  }
  const methods = METHODS.map((m) => evaluate(m, history, target));
  const usable = methods.filter((m) => m.prediction !== null);
  const tested = usable.filter((m) => m.samples >= MIN_BACKTEST && m.mae !== null);
  const backtested = tested.length > 0;
  const chosen = backtested
    ? tested.reduce((best, m) => (m.mae! < best.mae! ? m : best))
    : (usable.find((m) => m.id === "wma6") ?? usable[0]!);

  const point = Math.max(0, chosen.prediction!);
  const horizon = Math.max(1, monthsBetween(history[history.length - 1]!.month, target));
  // Bez zpětného testu: nejistota z rozptylu historie. Minimálně ±5 % odhadu.
  const baseSigma = chosen.rmse ?? stdOf(history.map((p) => p.value));
  const sigma = Math.max(baseSigma, point * 0.04) * Math.sqrt(horizon);
  const step = niceStep(point);
  const low = Math.max(0, Math.floor((point - Z80 * sigma) / step) * step);
  const high = Math.ceil((point + Z80 * sigma) / step) * step;

  return { status: "ok", target, horizon, point, low, high, method: chosen, methods, historyCount: history.length, backtested, sigma };
}

function stdOf(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/**
 * Úspora = příjmy − výdaje. Rozsah kombinuje nejistotu obou odhadů
 * (předpoklad nezávislosti: σ = √(σ₁² + σ₂²)).
 */
export function combineDifference(income: Forecast, expense: Forecast): { point: number; low: number; high: number } | null {
  if (income.status !== "ok" || expense.status !== "ok") return null;
  const point = income.point - expense.point;
  const sigma = Math.sqrt(income.sigma ** 2 + expense.sigma ** 2);
  const step = niceStep(Math.max(Math.abs(point), 5000));
  return {
    point,
    low: Math.floor((point - Z80 * sigma) / step) * step,
    high: Math.ceil((point + Z80 * sigma) / step) * step,
  };
}
