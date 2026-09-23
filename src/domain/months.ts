/** Práce s měsíci ve formátu YYYY-MM. Vše v lokálním čase, bez časových zón. */

export const MONTH_NAMES = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
];

/** Jednoznačné zkratky – „Čer“ by nerozlišilo červen a červenec. */
const MONTH_SHORT = ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"];

/** Tvary pro „za srpen“, „v srpnu“ apod. */
const MONTH_NAMES_GENITIVE = [
  "leden", "únor", "březen", "duben", "květen", "červen",
  "červenec", "srpen", "září", "říjen", "listopad", "prosinec",
];

const pad = (n: number) => String(n).padStart(2, "0");

export const toMonthKey = (year: number, month1: number): string => `${year}-${pad(month1)}`;

export const monthOfDate = (isoDate: string): string => isoDate.slice(0, 7);

export function currentMonthKey(now = new Date()): string {
  return toMonthKey(now.getFullYear(), now.getMonth() + 1);
}

export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y!, month: m! };
}

export function addMonths(key: string, delta: number): string {
  const { year, month } = parseMonthKey(key);
  const idx = year * 12 + (month - 1) + delta;
  return toMonthKey(Math.floor(idx / 12), (idx % 12) + 1);
}

/** Posledních `count` měsíců končících `end` (včetně), vzestupně. */
export function monthRange(end: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(end, i - count + 1));
}

export function monthBounds(key: string): { from: string; to: string } {
  const { year, month } = parseMonthKey(key);
  const last = new Date(year, month, 0).getDate();
  return { from: `${key}-01`, to: `${key}-${pad(last)}` };
}

export function monthLabel(key: string, opts: { withYear?: boolean; short?: boolean } = {}): string {
  const { year, month } = parseMonthKey(key);
  let name = MONTH_NAMES[month - 1]!;
  if (opts.short) name = MONTH_SHORT[month - 1]!;
  return opts.withYear === false ? name : `${name} ${year}`;
}

export function monthLabelLower(key: string): string {
  const { year, month } = parseMonthKey(key);
  return `${MONTH_NAMES_GENITIVE[month - 1]} ${year}`;
}
