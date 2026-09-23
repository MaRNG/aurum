import { db } from "@/db/db";
import { nowIso } from "@/lib/id";
import { accountSchema, transactionSchema, type Account, type Transaction } from "@/domain/schema";
import { addMonths, currentMonthKey, monthBounds, todayIso } from "@/domain/months";

/**
 * Testovací účet s vymyšlenými daty za poslední rok – na vyzkoušení aplikace.
 *
 * Vše patří pod účet `acc-demo` a transakce mají ID `demo-…`, takže jde celé smazat
 * bez dopadu na skutečná data. Generátor je deterministický (stejné datum = stejná data).
 *
 * Každý měsíc: výplata 30 000 Kč, ~40 výdajů (nájem, energie, předplatné, nákupy, doprava,
 * restaurace…) a několik plateb od a pro kamarády.
 */

export const DEMO_ACCOUNT_ID = "acc-demo";
const DEMO_PREFIX = "demo-";

const EMPLOYER = "Nordwind Software s.r.o.";
const FRIENDS = ["Petr Dvořák", "Klára Horáková", "Tomáš Beneš", "Eliška Marková", "Jakub Říha"];
const FRIEND_REASONS = ["Za pizzu", "Lístky na koncert", "Půlka benzínu", "Dárek pro Martina", "Chata – ubytování", "Vrácení půjčky", "Bowling", "Nákup na grilovačku"];

type Option = readonly [description: string, min: number, max: number];

/** Proměnlivé výdaje: [kategorie, počet za měsíc, možnosti]. Dohromady s fixními ~40 výdajů. */
const VARIABLE: [categoryId: string, perMonth: number, options: Option[]][] = [
  ["cat-food", 14, [["Albert", 150, 650], ["Lidl", 200, 850], ["Billa", 120, 500], ["Rohlik.cz", 500, 1200], ["Pekárna Kabát", 60, 180]]],
  ["cat-food", 7, [["Bistro Na Rohu", 160, 320], ["Kavárna Místo", 70, 160], ["Wolt", 220, 420], ["Lokál", 250, 520]]],
  ["cat-transport", 4, [["Shell", 700, 1300], ["PID Lítačka", 40, 120], ["Bolt", 150, 380], ["ČD – jízdenka", 120, 390]]],
  ["cat-fun", 3, [["Kino Aero", 180, 360], ["Steam", 120, 900], ["Knihkupectví Luxor", 250, 600], ["Vstupenky GoOut", 350, 900]]],
  ["cat-health", 1, [["Lékárna Dr.Max", 120, 650]]],
  ["cat-clothes", 1, [["Zalando", 500, 1600], ["Decathlon", 300, 1200], ["H&M", 350, 1200]]],
  ["cat-other-expense", 3, [["Drogerie DM", 150, 520], ["IKEA", 200, 900], ["Pošta", 60, 150], ["Kadeřnictví", 350, 600]]],
];

/** Fixní měsíční platby: [den, kategorie, popis, částka]. */
const FIXED: [day: number, categoryId: string, description: string, amount: number][] = [
  [1, "cat-housing", "Nájem – Bytové družstvo", 10500],
  [5, "cat-housing", "ČEZ – záloha na energie", 1800],
  [8, "cat-housing", "O2 – internet", 450],
  [12, "cat-other-expense", "Vodafone – tarif", 399],
  [15, "cat-fun", "Netflix", 259],
  [18, "cat-fun", "Spotify", 199],
  [20, "cat-health", "Posilovna Form Factory", 890],
];

/** Mulberry32 – malý deterministický generátor. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDemoData(today = todayIso()): { account: Account; transactions: Transaction[] } {
  const rand = rng(20260923);
  const int = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const now = nowIso();

  const firstMonth = addMonths(currentMonthKey(new Date(`${today}T12:00:00`)), -12);
  const account = accountSchema.parse({
    id: DEMO_ACCOUNT_ID,
    name: "Testovací účet",
    type: "checking",
    currency: "CZK",
    initialBalance: 42000,
    initialBalanceDate: monthBounds(firstMonth).from,
  });

  const transactions: Transaction[] = [];
  let n = 0;
  const add = (t: Pick<Transaction, "type" | "amount" | "date" | "categoryId" | "description">) => {
    if (t.date > today) return; // aktuální měsíc jen do dneška
    transactions.push(
      transactionSchema.parse({ ...t, id: `${DEMO_PREFIX}${++n}`, currency: "CZK", accountId: DEMO_ACCOUNT_ID, source: "manual", createdAt: now, updatedAt: now }),
    );
  };

  for (let i = 0; i <= 12; i++) {
    const month = addMonths(firstMonth, i);
    const lastDay = Number(monthBounds(month).to.slice(8));
    const day = (d: number) => `${month}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;

    add({ type: "income", amount: 30000, date: day(10), categoryId: "cat-salary", description: `${EMPLOYER} – mzda` });
    for (const [d, categoryId, description, amount] of FIXED) add({ type: "expense", amount, date: day(d), categoryId, description });
    for (const [categoryId, perMonth, options] of VARIABLE) {
      for (let k = 0; k < perMonth; k++) {
        const [description, min, max] = pick(options);
        // halíře jen u nákupů v obchodech, jinak celé koruny
        const raw = min + rand() * (max - min);
        const amount = categoryId === "cat-food" && max > 500 ? Math.round(raw * 10) / 10 : Math.round(raw);
        add({ type: "expense", amount, date: day(int(1, lastDay)), categoryId, description });
      }
    }

    // Kamarádi: 1–3 příchozí a 1–2 odchozí platby měsíčně
    for (let k = int(1, 3); k > 0; k--) {
      add({ type: "income", amount: int(3, 30) * 50, date: day(int(1, lastDay)), categoryId: "cat-other-income", description: `${pick(FRIENDS)} · ${pick(FRIEND_REASONS)}` });
    }
    for (let k = int(1, 2); k > 0; k--) {
      add({ type: "expense", amount: int(3, 24) * 50, date: day(int(1, lastDay)), categoryId: "cat-other-expense", description: `${pick(FRIENDS)} · ${pick(FRIEND_REASONS)}` });
    }
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date));
  return { account, transactions };
}

export async function hasDemoData(): Promise<boolean> {
  return (await db.accounts.get(DEMO_ACCOUNT_ID)) !== undefined;
}

/** Vytvoří testovací účet a jeho transakce (případná stará testovací data nahradí). */
export async function createDemoData(today = todayIso()): Promise<number> {
  const { account, transactions } = generateDemoData(today);
  await db.transaction("rw", [db.accounts, db.transactions], async () => {
    await removeDemoRows();
    await db.accounts.add(account);
    await db.transactions.bulkAdd(transactions);
  });
  return transactions.length;
}

/** Smaže testovací účet a všechny jeho transakce. Skutečná data zůstanou beze změny. */
export async function removeDemoData(): Promise<void> {
  await db.transaction("rw", [db.accounts, db.transactions], removeDemoRows);
}

async function removeDemoRows() {
  // i transakce, které uživatel mezitím přesunul na jiný účet, poznáme podle ID
  await db.transactions.where("id").startsWith(DEMO_PREFIX).delete();
  await db.transactions.where("accountId").equals(DEMO_ACCOUNT_ID).delete();
  await db.transactions.where("destinationAccountId").equals(DEMO_ACCOUNT_ID).delete();
  await db.accounts.delete(DEMO_ACCOUNT_ID);
}
