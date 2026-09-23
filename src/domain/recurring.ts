import type { RecurringFrequency, RecurringPayment, Transaction } from "./schema";
import { median } from "./stats";

export const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  weekly: "týdně",
  monthly: "měsíčně",
  quarterly: "čtvrtletně",
  yearly: "ročně",
};

const PER_MONTH: Record<RecurringFrequency, number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };

export const monthlyEquivalent = (amount: number, f: RecurringFrequency): number => amount * PER_MONTH[f];
export const yearlyEquivalent = (amount: number, f: RecurringFrequency): number => amount * PER_MONTH[f] * 12;

/** Normalizace popisu pro párování/seskupení: malá písmena, bez čísel, diakritiky a interpunkce. */
export function normalizeDescription(s: string): string {
  return s
    .toLocaleLowerCase("cs")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[0-9]+/g, " ")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------ Párování s transakcemi ------------------------------ */

export interface PriceChange {
  from: number;
  to: number;
  date: string;
}

export interface RecurringMatch {
  transactions: Transaction[];
  lastPaid: Transaction | null;
  priceChange: PriceChange | null;
}

export function matchRecurring(rec: RecurringPayment, txs: Transaction[]): RecurringMatch {
  const needle = normalizeDescription(rec.match || rec.name);
  const matched = needle
    ? txs
        .filter((t) => t.type === "expense" && t.description && normalizeDescription(t.description).includes(needle))
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const last = matched[matched.length - 1] ?? null;
  let priceChange: PriceChange | null = null;
  // poslední změna částky mezi dvěma po sobě jdoucími platbami
  for (let i = matched.length - 1; i > 0; i--) {
    const cur = matched[i]!;
    const prev = matched[i - 1]!;
    if (Math.abs(cur.amount - prev.amount) >= 0.5) {
      priceChange = { from: prev.amount, to: cur.amount, date: cur.date };
      break;
    }
  }
  return { transactions: matched, lastPaid: last, priceChange };
}

/* --------------------------------- Detekce --------------------------------- */

const BANDS: { f: RecurringFrequency; min: number; max: number }[] = [
  { f: "weekly", min: 5, max: 9 },
  { f: "monthly", min: 25, max: 36 },
  { f: "quarterly", min: 80, max: 100 },
  { f: "yearly", min: 345, max: 385 },
];

export interface DetectedRecurring {
  key: string;
  name: string;
  amount: number;
  frequency: RecurringFrequency;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  medianInterval: number;
  categoryId?: string;
  accountId?: string;
  /** relativní rozptyl částek (MAD / medián) – nízké = stabilní cena */
  amountSpread: number;
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

function mostCommon<T>(xs: (T | undefined)[]): T | undefined {
  const counts = new Map<T, number>();
  for (const x of xs) if (x !== undefined) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/**
 * Hledá výdaje se stejným popisem, které se opakují v pravidelném intervalu a s podobnou částkou.
 * Kritéria (vysvětlitelná v UI):
 *  - alespoň 3 výskyty,
 *  - ≥ 75 % intervalů mezi platbami spadá do pásma frekvence,
 *  - částky se od mediánu liší v průměru max. o 15 %.
 */
export function detectRecurring(txs: Transaction[], existing: RecurringPayment[]): DetectedRecurring[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.type !== "expense" || !t.description) continue;
    const key = normalizeDescription(t.description);
    if (key.length < 2) continue;
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }

  const known = existing.map((r) => normalizeDescription(r.match || r.name)).filter(Boolean);
  const out: DetectedRecurring[] = [];

  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    if (known.some((k) => key.includes(k))) continue;
    list.sort((a, b) => a.date.localeCompare(b.date));
    const intervals = list.slice(1).map((t, i) => dayDiff(list[i]!.date, t.date));
    const med = median(intervals);
    const band = BANDS.find((b) => med >= b.min && med <= b.max);
    if (!band) continue;
    const inBand = intervals.filter((d) => d >= band.min && d <= band.max).length;
    if (inBand / intervals.length < 0.75) continue;

    const amounts = list.map((t) => t.amount);
    const medAmount = median(amounts);
    const spread = median(amounts.map((a) => Math.abs(a - medAmount))) / medAmount;
    if (spread > 0.15) continue;

    const last = list[list.length - 1]!;
    out.push({
      key,
      name: last.description!,
      amount: last.amount,
      frequency: band.f,
      occurrences: list.length,
      firstDate: list[0]!.date,
      lastDate: last.date,
      medianInterval: med,
      categoryId: mostCommon(list.map((t) => t.categoryId)),
      accountId: mostCommon(list.map((t) => t.accountId)),
      amountSpread: spread,
    });
  }
  return out.sort((a, b) => monthlyEquivalent(b.amount, b.frequency) - monthlyEquivalent(a.amount, a.frequency));
}
