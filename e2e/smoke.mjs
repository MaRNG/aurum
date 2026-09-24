/**
 * Smoke test v reálném prohlížeči proti produkčnímu buildu (`npm run build && npm run preview`).
 * Naseeduje ukázková data, projde všechny stránky, ověří offline režim a uloží screenshoty do e2e/out/.
 *
 *   CHROME_PATH=/usr/bin/google-chrome BASE_URL=http://localhost:4173 node e2e/smoke.mjs
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:4173";
const out = new URL("./out/", import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) failures++;
};
const text = () => page.evaluate(() => document.body.innerText);

async function shot(path, name) {
  await page.goto(base + path, { waitUntil: "networkidle0" });
  await wait(300);
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewport({ width: 1440, height: Math.max(1000, h) });
  await wait(600);
  await page.screenshot({ path: `${out}${name}.png` });
  await page.setViewport({ width: 1440, height: 1000 });
}

await page.goto(base, { waitUntil: "networkidle0" });

// --- seed: 15 měsíců historie, 3 účty se zůstatky, převody, rozpočty ---
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open("finance-app");
    r.onsuccess = () => res(r.result);
    r.onerror = rej;
  });
  const tx = db.transaction(["transactions", "accounts", "budgets"], "readwrite");
  const s = tx.objectStore("transactions");
  const acc = tx.objectStore("accounts");
  acc.put({ id: "acc-main", name: "Běžný účet", type: "checking", currency: "CZK", initialBalance: 18000, initialBalanceDate: "2025-06-01" });
  acc.put({ id: "acc-sav", name: "Spořicí účet", type: "savings", currency: "CZK", initialBalance: 60000, initialBalanceDate: "2025-06-01" });
  acc.put({ id: "acc-card", name: "Kreditka", type: "credit", currency: "CZK", initialBalance: 0, initialBalanceDate: "2025-06-01" });
  const b = tx.objectStore("budgets");
  b.put({ id: "b1", categoryId: "cat-fun", amount: 2500, currency: "CZK" });
  b.put({ id: "b2", categoryId: "cat-food", amount: 7000, currency: "CZK" });
  let n = 0;
  const now = new Date().toISOString();
  const add = (type, amount, date, categoryId, description, extra = {}) =>
    s.put({ id: "seed-" + n++, type, amount, currency: "CZK", date, categoryId, accountId: "acc-main", description, source: "manual", createdAt: now, updatedAt: now, ...extra });
  const months = ["2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-07", "2026-08", "2026-09"];
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (const [i, m] of months.entries()) {
    const last = m === "2026-09" ? 22 : 28;
    const day = () => String(1 + Math.floor(rnd() * last)).padStart(2, "0");
    add("income", 42000 + (i > 8 ? 2000 : 0), m + "-10", "cat-salary", "Výplata");
    add("expense", 15000, m + "-02", "cat-housing", "Nájem");
    add("expense", 699, m + "-05", "cat-other-expense", "Telefon");
    add("expense", m >= "2026-08" ? 289 : 259, m + "-12", "cat-fun", "Netflix");
    for (let k = 0; k < 8; k++) add("expense", Math.round(450 + rnd() * 700 + i * 25), m + "-" + day(), "cat-food", ["Albert", "Lidl", "Billa", "Restaurace"][k % 4]);
    for (let k = 0; k < 3; k++) add("expense", Math.round(250 + rnd() * 700), m + "-" + day(), "cat-transport", "Benzín", k === 0 ? { accountId: "acc-card" } : {});
    add("transfer", 5000, m + "-11", undefined, "Spoření", { destinationAccountId: "acc-sav" });
    if (m !== "2026-09") add("transfer", 700, m + "-25", undefined, "Splátka karty", { destinationAccountId: "acc-card" });
  }
  await new Promise((r) => (tx.oncomplete = r));
});
await page.reload({ waitUntil: "networkidle0" });

// --- obrazovky ---
const pages = [
  ["/", "dashboard", "Finanční rezerva"],
  ["/ucty", "accounts", "Jak se počítá rezerva"],
  ["/ucty/acc-main", "account-detail", "Pohyby na účtu"],
  ["/cashflow", "cashflow", "Pohyby po účtech"],
  ["/predikce", "forecast", "Skutečnost a odhad"],
  ["/predikce/scenare", "scenarios", "Rozdíl za rok"],
  ["/statistiky", "stats", "Vývoj financí"],
  ["/analyza", "budgets", "Zábava"],
  ["/insights", "insights", "Jak to bylo spočítáno"],
  ["/data", "data", "Scénáře"],
];
for (const [path, name, expected] of pages) {
  await shot(path, name);
  check(`${path} obsahuje „${expected}“`, (await text()).includes(expected));
}

// scénář ze specifikace: +3 000 Kč měsíčně → +36 000 Kč za rok
await page.goto(base + "/predikce/scenare", { waitUntil: "networkidle0" });
check("scénář: rozdíl za rok +36 000 Kč", (await text()).replace(/\s/g, " ").includes("+36 000 Kč"));

// --- offline: service worker musí obsloužit aplikaci bez sítě ---
await page.goto(base + "/", { waitUntil: "networkidle0" });
const swReady = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return !!reg.active;
});
check("service worker je aktivní", swReady);
await wait(500);
await page.setOfflineMode(true);
await wait(300);
// Pozn.: po navigaci v emulovaném offline režimu Chrome hlásí navigator.onLine = true,
// proto se hláška kontroluje hned po odpojení.
check("offline: zobrazí se hláška o offline režimu", (await text()).includes("Jsi offline"));
await page.goto(base + "/transakce", { waitUntil: "domcontentloaded" });
await wait(1500);
check("offline: stránka Transakce se načte", (await text()).includes("Nová transakce"));
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Nová transakce")).click());
await wait(300);
await page.type("dialog input[inputmode=decimal]", "123");
await page.type("dialog input[placeholder^='Např']", "Offline nákup");
await page.evaluate(() => [...document.querySelectorAll("dialog button")].find((b) => b.textContent.includes("Přidat transakci")).click());
await wait(500);
check("offline: transakce se uloží", (await text()).includes("Offline nákup"));
await page.evaluate(() =>
  [...document.querySelectorAll("tr")].find((r) => r.textContent.includes("Offline nákup")).querySelector("button[aria-label=Duplikovat]").click(),
);
await wait(300);
check("duplikace: dialog je předvyplněný", (await page.$eval("dialog input[placeholder^='Např']", (i) => i.value)) === "Offline nákup");
await page.type("dialog input[placeholder^='Např']", " – kopie");
await page.evaluate(() => [...document.querySelectorAll("dialog button")].find((b) => b.textContent.includes("Vytvořit kopii")).click());
await wait(500);
check("duplikace: kopie se uloží a originál zůstane", (await text()).includes("Offline nákup – kopie") && (await text()).split("Offline nákup").length === 3);
await page.goto(base + "/statistiky/kategorie", { waitUntil: "domcontentloaded" });
await wait(1500);
check("offline: statistiky (líně načtená stránka) fungují", (await text()).includes("Vývoj kategorií v čase"));
await page.screenshot({ path: `${out}offline.png` });
await page.setOfflineMode(false);

// --- mobil ---
await page.setViewport({ width: 390, height: 844 });
for (const p of ["/", "/ucty", "/cashflow", "/predikce", "/predikce/scenare"]) {
  await page.goto(base + p, { waitUntil: "networkidle0" });
  await wait(300);
  check(`mobil ${p}: bez horizontálního scrollu`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
}
await page.goto(base + "/predikce/scenare", { waitUntil: "networkidle0" });
await page.screenshot({ path: `${out}mobile-scenarios.png`, fullPage: true });

check(`žádné chyby v konzoli${errors.length ? `: ${errors.join(" | ")}` : ""}`, errors.length === 0);
await browser.close();
console.log(failures ? `\n${failures} kontrol selhalo` : "\nVše v pořádku");
process.exit(failures ? 1 : 0);
