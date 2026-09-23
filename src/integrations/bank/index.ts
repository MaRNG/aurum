import { decodeBankFile } from "./csv";
import { buildCsImport, isCsCsv } from "./csCsv";
import { buildKbImport, isKbCsv, parseKbCsv } from "./kbCsv";
import { BankParseError, type BankImport } from "./types";

export type { BankImport, BankTransactionDraft } from "./types";
export { BankParseError } from "./types";

/** Podporované CSV výpisy – pro text v UI. */
export const SUPPORTED_BANKS = ["Komerční banka (KB+)", "Česká spořitelna (George)"];

/** Rozpozná banku podle obsahu souboru (ne podle názvu) a výpis zpracuje. */
export async function parseBankStatement(bytes: ArrayBuffer | Uint8Array): Promise<BankImport> {
  const text = decodeBankFile(bytes);
  if (isKbCsv(text)) return buildKbImport(parseKbCsv(text));
  if (isCsCsv(text)) return buildCsImport(text);
  throw new BankParseError(`Formát souboru nepoznávám. Podporované výpisy: ${SUPPORTED_BANKS.join(", ")}.`);
}
