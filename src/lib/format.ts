const LOCALE = "cs-CZ";

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number, currency = "CZK", opts: { signed?: boolean } = {}): string {
  const key = `${currency}|${opts.signed ? 1 : 0}`;
  let fmt = moneyFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
      signDisplay: opts.signed ? "exceptZero" : "auto",
    });
    moneyFormatters.set(key, fmt);
  }
  return fmt.format(amount);
}

const compactFmt = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });
export const formatCompact = (n: number): string => compactFmt.format(n);

export function formatPercent(ratio: number, opts: { signed?: boolean; digits?: number } = {}): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: opts.digits ?? 1,
    maximumFractionDigits: opts.digits ?? 1,
    signDisplay: opts.signed ? "exceptZero" : "auto",
  }).format(ratio);
}

const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "numeric", year: "numeric" });
export const formatDate = (iso: string): string => dateFmt.format(new Date(`${iso}T00:00:00`));

const plainFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

/** Rozsah „26 000–30 000 Kč“. */
export function formatRange(low: number, high: number, currency = "CZK"): string {
  if (low === high) return formatMoney(low, currency);
  return `${plainFmt.format(low)}–${formatMoney(high, currency)}`;
}

/** „1 měsíc“, „3 měsíce“, „13 měsíců“, „4,7 měsíce“. */
export function formatMonths(n: number): string {
  const r = Math.round(n * 10) / 10;
  const text = r.toLocaleString(LOCALE, { maximumFractionDigits: 1 });
  if (!Number.isInteger(r)) return `${text} měsíce`;
  if (r === 1) return `${text} měsíc`;
  if (r >= 2 && r <= 4) return `${text} měsíce`;
  return `${text} měsíců`;
}
