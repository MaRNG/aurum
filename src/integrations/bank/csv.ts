/** Společné pomůcky pro CSV výpisy českých bank. */

/**
 * Banky exportují v různých kódováních: KB ve windows-1250, ČS v UTF-16 s BOM.
 * Pořadí: BOM (UTF-16/UTF-8) → platné UTF-8 → windows-1250.
 */
export function decodeBankFile(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1250").decode(buf);
  }
}

/** Jeden řádek CSV se středníky; podporuje uvozovky a zdvojené `""`. */
export function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ";") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Bez diakritiky a malými písmeny – pro porovnávání názvů sloupců. */
export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export function parseCzDate(s: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : null;
}

/** „-1 250,50“ (i s nezlomitelnou mezerou) → -1250.5 */
export function parseCzNumber(s: string): number | null {
  const cleaned = s.replace(/[\s  ]/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const formatForeign = (n: number, currency: string) =>
  `${Math.abs(n).toLocaleString("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash → ID pro každý řádek. `fields` musí obsahovat jen hodnoty, které banka u zaúčtované
 * transakce nemění. Zcela shodné řádky (stejná káva dvakrát za den) odliší pořadí výskytu –
 * výsledek nezávisí na pořadí řádků v souboru, jen na tom, kolik shodných řádků výpis obsahuje.
 */
export async function hashRows(provider: string, rows: (string | number)[][]): Promise<string[]> {
  const seen = new Map<string, number>();
  const out: string[] = [];
  for (const fields of rows) {
    const base = [provider, ...fields].join("\u001f");
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    out.push(await sha256Hex(`${base}\u001f${occurrence}`));
  }
  return out;
}
