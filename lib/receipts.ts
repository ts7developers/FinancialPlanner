// Tax-deduction category labels and financial-year summarizing for the Receipts tab — kept
// separate from derive.ts, same convention as csv.ts, since this is its own self-contained domain.

import { dateFromISO } from "./period";
import type { DeductionCategory, Receipt } from "./types";

export const DEDUCTION_CATEGORIES: DeductionCategory[] = [
  "work_related_travel",
  "work_related_clothing",
  "self_education",
  "tools_equipment",
  "home_office",
  "donations",
  "income_protection",
  "other",
];

export const DEDUCTION_CATEGORY_LABELS: Record<DeductionCategory, string> = {
  work_related_travel: "Work-related travel",
  work_related_clothing: "Uniforms & protective clothing",
  self_education: "Self-education & courses",
  tools_equipment: "Tools, equipment & technology",
  home_office: "Working from home",
  donations: "Gifts & donations",
  income_protection: "Income protection insurance",
  other: "Other work-related expenses",
};

/** Receipts dated within the financial year starting `fyStartISO` (inclusive) and ending exactly
 * one year later (exclusive) — same July-to-June window `financialYearStart` (lib/period.ts) anchors. */
export function receiptsForFinancialYear(receipts: Receipt[], fyStartISO: string): Receipt[] {
  const start = dateFromISO(fyStartISO);
  const end = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()));
  return receipts.filter((r) => {
    const d = dateFromISO(r.date);
    return d >= start && d < end;
  });
}

/** Sums `amount` per deduction category — only categories with at least one receipt are included. */
export function receiptTotalsByCategory(receipts: Receipt[]): { category: DeductionCategory; total: number; count: number }[] {
  const totals = new Map<DeductionCategory, { total: number; count: number }>();
  receipts.forEach((r) => {
    const entry = totals.get(r.deduction_category) ?? { total: 0, count: 0 };
    entry.total += Number(r.amount) || 0;
    entry.count += 1;
    totals.set(r.deduction_category, entry);
  });
  return DEDUCTION_CATEGORIES.filter((c) => totals.has(c)).map((c) => ({ category: c, ...totals.get(c)! }));
}
