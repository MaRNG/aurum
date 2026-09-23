import { CURRENT_FORMAT_VERSION } from "./format";

/**
 * Migrace starších formátů zálohy. Klíč = verze, ZE které se migruje.
 * Každá migrace dostane surový (už obálkou ověřený) objekt a vrátí objekt o verzi vyšší.
 * Migrace musí být čisté funkce a nesmí spoléhat na aktuální Zod schémata –
 * pracují se starým tvarem dat.
 *
 * Příklad budoucí migrace:
 *   1: (d) => ({ ...d, version: 2, transactions: d.transactions.map((t) => ({ ...t, tags: [] })) }),
 */
type RawBackup = Record<string, unknown> & { version: number };
const migrations: Record<number, (data: RawBackup) => RawBackup> = {};

export interface MigrationResult {
  data: RawBackup;
  applied: string[];
}

export function migrate(input: RawBackup): MigrationResult {
  if (input.version > CURRENT_FORMAT_VERSION) {
    throw new Error(
      `Záloha má verzi ${input.version}, ale aplikace podporuje nejvýše verzi ${CURRENT_FORMAT_VERSION}. Aktualizuj aplikaci.`,
    );
  }
  let data = input;
  const applied: string[] = [];
  while (data.version < CURRENT_FORMAT_VERSION) {
    const step = migrations[data.version];
    if (!step) throw new Error(`Chybí migrace z verze ${data.version}.`);
    const from = data.version;
    data = step(data);
    if (data.version !== from + 1) throw new Error(`Migrace z verze ${from} nevrátila verzi ${from + 1}.`);
    applied.push(`v${from} → v${data.version}`);
  }
  return { data, applied };
}
