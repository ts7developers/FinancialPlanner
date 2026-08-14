// Default expense categories + monthly budgets — ported from prototype DEFAULT_PLAN.cats / CAT_META (spec §4).
// Seeds the `budget_categories` table on first run; also the client-side fallback/reference.

export interface CategoryMeta {
  id: string;
  label: string;
  amount2026: number;
  amount2027: number;
  sort: number;
}

export const DEFAULT_CATEGORIES: CategoryMeta[] = [
  { id: "board", label: "Board", amount2026: 0, amount2027: 433.33, sort: 0 },
  { id: "groceries", label: "Groceries", amount2026: 476.67, amount2027: 476.67, sort: 1 },
  { id: "fuel", label: "Fuel", amount2026: 238.33, amount2027: 238.33, sort: 2 },
  { id: "carins", label: "Car insurance", amount2026: 58.34, amount2027: 58.34, sort: 3 },
  { id: "rego", label: "Car rego", amount2026: 68.72, amount2027: 68.72, sort: 4 },
  { id: "gym", label: "Gym", amount2026: 82.12, amount2027: 82.12, sort: 5 },
  { id: "bball", label: "Basketball", amount2026: 58.54, amount2027: 58.54, sort: 6 },
  { id: "health", label: "Private health", amount2026: 0, amount2027: 130, sort: 7 },
  { id: "claude", label: "Claude Pro", amount2026: 34, amount2027: 34, sort: 8 },
  { id: "iracing", label: "iRacing", amount2026: 17.13, amount2027: 17.13, sort: 9 },
  { id: "fun", label: "Fun money", amount2026: 216.67, amount2027: 216.67, sort: 10 },
];

export const TXN_CATEGORIES = [...DEFAULT_CATEGORIES, { id: "other", label: "Other", amount2026: 0, amount2027: 0, sort: 11 }];

/** Synthetic catch-all — always available for logging an expense, never a real budgeted row (can't be edited/deleted on Budget). */
export const OTHER_CATEGORY_KEY = "other";

/** Turns a category label into a stable, URL/DB-safe key, avoiding collisions with existing keys or the reserved "other" catch-all. */
export function slugifyCategoryKey(label: string, existingKeys: Iterable<string>): string {
  const taken = new Set(existingKeys);
  taken.add(OTHER_CATEGORY_KEY);
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "category";
  let key = base;
  let n = 1;
  while (taken.has(key)) key = `${base}_${++n}`;
  return key;
}

export function categoryMonthly(id: string, year: number, categories: CategoryMeta[] = DEFAULT_CATEGORIES): number {
  const c = categories.find((c) => c.id === id);
  if (!c) return 0;
  return year >= 2027 ? c.amount2027 : c.amount2026;
}

export function monthlyTotal(year: number, categories: CategoryMeta[] = DEFAULT_CATEGORIES): number {
  return categories.reduce((sum, c) => sum + (year >= 2027 ? c.amount2027 : c.amount2026), 0);
}
