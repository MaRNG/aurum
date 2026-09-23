import type { Account, Category } from "./schema";

/** Výchozí kategorie – vkládají se pouze do prázdné databáze, uživatel je může libovolně měnit. */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat-housing", name: "Bydlení", type: "expense", icon: "home", color: "#4d6a8c" },
  { id: "cat-food", name: "Jídlo", type: "expense", icon: "utensils", color: "#9c6a4e" },
  { id: "cat-transport", name: "Doprava", type: "expense", icon: "car", color: "#3f7f86" },
  { id: "cat-fun", name: "Zábava", type: "expense", icon: "party-popper", color: "#8a6f9e" },
  { id: "cat-clothes", name: "Oblečení", type: "expense", icon: "shirt", color: "#b3868f" },
  { id: "cat-electronics", name: "Elektronika", type: "expense", icon: "laptop", color: "#6f7d4f" },
  { id: "cat-health", name: "Zdraví", type: "expense", icon: "heart-pulse", color: "#5b5f9e" },
  { id: "cat-other-expense", name: "Ostatní", type: "expense", icon: "circle-ellipsis", color: "#7a7770" },
  { id: "cat-salary", name: "Výplata", type: "income", icon: "briefcase", color: "#4d6a8c" },
  { id: "cat-side-job", name: "Brigáda", type: "income", icon: "hammer", color: "#9c6a4e" },
  { id: "cat-investments", name: "Investice", type: "income", icon: "trending-up", color: "#3f7f86" },
  { id: "cat-sale", name: "Prodej", type: "income", icon: "tag", color: "#8a6f9e" },
  { id: "cat-other-income", name: "Ostatní", type: "income", icon: "circle-ellipsis", color: "#b3868f" },
];

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: "acc-main", name: "Běžný účet", type: "checking", currency: "CZK" },
];

/**
 * Kategorická paleta – tlumené tóny, které se nepletou s příjmy (zelená), výdaji (červeno-oranžová) ani akční žlutou. Barvy se přiřazují
 * v pevném pořadí, nikdy necyklí – další kategorie v grafu se sloučí do „Další“.
 */
export const CATEGORY_PALETTE = [
  "#4d6a8c", "#9c6a4e", "#3f7f86", "#8a6f9e", "#b3868f", "#6f7d4f", "#5b5f9e", "#7a7770",
];

/** Sémantické barvy řad příjmy / výdaje / úspora. */
export const SERIES_COLORS = { income: "#4a8c3f", expense: "#d9482b", net: "#3a3934" } as const;

/**
 * Původní výchozí barvy kategorií (před redesignem) → nová tlumená paleta. Uložená data se nemění,
 * mapuje se jen při zobrazení; vlastní barvy uživatele zůstávají, jak jsou.
 */
const LEGACY_COLOR_MAP: Record<string, string> = {
  "#2a78d6": "#4d6a8c", "#eb6834": "#9c6a4e", "#1baf7a": "#3f7f86", "#eda100": "#8a6f9e",
  "#e87ba4": "#b3868f", "#008300": "#6f7d4f", "#4a3aa7": "#5b5f9e", "#e34948": "#7a7770",
};

export function displayColor(color: string | undefined): string | undefined {
  return color ? (LEGACY_COLOR_MAP[color.toLowerCase()] ?? color) : color;
}
