import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import { analyzeImport, applyImport, buildBackup, parseBackup } from "./backup";
import { CURRENT_FORMAT_VERSION } from "./format";
import { migrate } from "./migrations";
import { tx } from "@/test/fixtures";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const validBackup = (overrides: Record<string, unknown> = {}) => ({
  format: "finance-app",
  version: 1,
  exportedAt: "2026-09-01T10:00:00.000Z",
  settings: { baseCurrency: "CZK", locale: "cs-CZ" },
  categories: [{ id: "cat-x", name: "Kočka", type: "expense" }],
  accounts: [{ id: "acc-main", name: "Běžný účet", type: "checking", currency: "CZK" }],
  transactions: [tx({ id: "imp-1", type: "expense", amount: 500, date: "2026-08-01", categoryId: "cat-x" })],
  months: [{ month: "2026-08", status: "completed" }],
  ...overrides,
});

describe("parseBackup", () => {
  it("odmítne neplatný JSON", () => {
    expect(parseBackup("{nope")).toEqual({ ok: false, errors: ["Soubor není platný JSON."] });
  });

  it("odmítne cizí formát", () => {
    const r = parseBackup(JSON.stringify({ foo: 1 }));
    expect(r.ok).toBe(false);
  });

  it("odmítne novější verzi, než aplikace umí", () => {
    const r = parseBackup(JSON.stringify(validBackup({ version: CURRENT_FORMAT_VERSION + 1 })));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/Aktualizuj aplikaci/);
  });

  it("odmítne nevalidní transakci s cestou k chybě", () => {
    const bad = validBackup({ transactions: [{ id: "x", type: "expense", amount: -5, currency: "CZK", date: "2026-8-1", source: "manual", createdAt: "", updatedAt: "" }] });
    const r = parseBackup(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.startsWith("transactions.0.amount"))).toBe(true);
  });

  it("odmítne převod bez cílového účtu", () => {
    const bad = validBackup({ transactions: [tx({ type: "transfer", amount: 100, date: "2026-08-01" })] });
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
  });

  it("odmítne duplicitní ID", () => {
    const t = tx({ id: "dup", type: "expense", amount: 1, date: "2026-08-01" });
    expect(parseBackup(JSON.stringify(validBackup({ transactions: [t, t] }))).ok).toBe(false);
  });

  it("doplní chybějící nepovinné kolekce (záloha z Fáze 1 bez rozpočtů a scénářů)", () => {
    const r = parseBackup(JSON.stringify(validBackup()));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.backup.budgets).toEqual([]);
      expect(r.backup.scenarios).toEqual([]);
    }
  });

  it("přijme scénář a odmítne neznámý typ úpravy", () => {
    const scenario = { id: "s1", name: "Test", horizonMonths: 12, adjustments: [{ kind: "savings", amount: 3000 }], createdAt: "", updatedAt: "" };
    expect(parseBackup(JSON.stringify(validBackup({ scenarios: [scenario] }))).ok).toBe(true);
    const bad = { ...scenario, adjustments: [{ kind: "lottery", amount: 1 }] };
    expect(parseBackup(JSON.stringify(validBackup({ scenarios: [bad] }))).ok).toBe(false);
  });
});

describe("migrate", () => {
  it("aktuální verzi nechá beze změny", () => {
    const input = { version: CURRENT_FORMAT_VERSION, a: 1 };
    expect(migrate(input)).toEqual({ data: input, applied: [] });
  });
});

describe("export → import", () => {
  it("round-trip zachová data", async () => {
    await db.transactions.add(tx({ id: "local-1", type: "income", amount: 42000, date: "2026-08-10" }));
    const exported = await buildBackup();
    const r = parseBackup(JSON.stringify(exported));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await applyImport(r.backup, "replace");
    expect(await buildBackup()).toMatchObject({ transactions: exported.transactions, categories: exported.categories });
  });

  it("merge-keep-local ponechá lokální verzi, merge-prefer-import ji přepíše", async () => {
    await db.transactions.add(tx({ id: "imp-1", type: "expense", amount: 111, date: "2026-08-01" }));
    const r = parseBackup(JSON.stringify(validBackup()));
    if (!r.ok) throw new Error("invalid");

    const plan = await analyzeImport(r.backup);
    expect(plan.stats.transactions).toMatchObject({ incoming: 1, conflicts: 1, added: 0 });
    expect(plan.stats.categories.added).toBe(1);

    await applyImport(r.backup, "merge-keep-local");
    expect((await db.transactions.get("imp-1"))?.amount).toBe(111);
    expect(await db.categories.get("cat-x")).toBeDefined();

    await applyImport(r.backup, "merge-prefer-import");
    expect((await db.transactions.get("imp-1"))?.amount).toBe(500);
  });

  it("nezdvojí bankovní transakci se stejným externalId", async () => {
    await db.transactions.add(tx({ id: "local-bank", type: "expense", amount: 99, date: "2026-08-01", source: "bank", bankProvider: "fio", externalId: "E1" }));
    const incoming = tx({ id: "other-id", type: "expense", amount: 99, date: "2026-08-01", source: "bank", bankProvider: "fio", externalId: "E1" });
    const r = parseBackup(JSON.stringify(validBackup({ transactions: [incoming] })));
    if (!r.ok) throw new Error("invalid");
    expect((await analyzeImport(r.backup)).stats.transactions.bankDuplicates).toBe(1);
    await applyImport(r.backup, "merge-prefer-import");
    expect(await db.transactions.where({ bankProvider: "fio", externalId: "E1" }).count()).toBe(1);
  });

  it("replace nahradí všechna data", async () => {
    await db.transactions.add(tx({ id: "old", type: "expense", amount: 1, date: "2026-01-01" }));
    const r = parseBackup(JSON.stringify(validBackup()));
    if (!r.ok) throw new Error("invalid");
    await applyImport(r.backup, "replace");
    expect(await db.transactions.toCollection().primaryKeys()).toEqual(["imp-1"]);
    expect(await db.categories.count()).toBe(1);
  });
});
