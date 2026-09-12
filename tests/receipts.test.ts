import { describe, expect, it } from "vitest";
import { receiptsForFinancialYear, receiptTotalsByCategory, suggestDeductionCategory } from "@/lib/receipts";
import type { Receipt } from "@/lib/types";

function makeReceipt(over: Partial<Receipt>): Receipt {
  return {
    id: "r1",
    user_id: "u1",
    date: "2026-08-01",
    description: "Test",
    amount: 100,
    deduction_category: "other",
    file_path: null,
    transaction_id: null,
    created_at: "",
    ...over,
  };
}

describe("receiptsForFinancialYear", () => {
  it("includes a receipt dated on the FY start and excludes one dated exactly a year later", () => {
    const receipts = [makeReceipt({ id: "a", date: "2026-07-01" }), makeReceipt({ id: "b", date: "2027-07-01" })];
    const result = receiptsForFinancialYear(receipts, "2026-07-01");
    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  it("excludes a receipt from the previous financial year", () => {
    const receipts = [makeReceipt({ id: "a", date: "2026-06-30" })];
    expect(receiptsForFinancialYear(receipts, "2026-07-01")).toEqual([]);
  });
});

describe("receiptTotalsByCategory", () => {
  it("sums amounts and counts per category, only including categories actually used", () => {
    const receipts = [
      makeReceipt({ id: "a", deduction_category: "work_related_travel", amount: 50 }),
      makeReceipt({ id: "b", deduction_category: "work_related_travel", amount: 30 }),
      makeReceipt({ id: "c", deduction_category: "donations", amount: 20 }),
    ];
    expect(receiptTotalsByCategory(receipts)).toEqual([
      { category: "work_related_travel", total: 80, count: 2 },
      { category: "donations", total: 20, count: 1 },
    ]);
  });

  it("is empty for no receipts", () => {
    expect(receiptTotalsByCategory([])).toEqual([]);
  });
});

describe("suggestDeductionCategory", () => {
  it("matches a uniform/workwear purchase to clothing", () => {
    expect(suggestDeductionCategory("Steel Cap Boots - Total Tools")).toBe("work_related_clothing");
  });

  it("matches an online course to self-education", () => {
    expect(suggestDeductionCategory("Udemy Course Purchase")).toBe("self_education");
  });

  it("matches a toll road charge to travel", () => {
    expect(suggestDeductionCategory("Linkt Toll Payment")).toBe("work_related_travel");
  });

  it("matches a charity name to donations", () => {
    expect(suggestDeductionCategory("Salvation Army Donation")).toBe("donations");
  });

  it("is case-insensitive", () => {
    expect(suggestDeductionCategory("BUNNINGS WAREHOUSE")).toBe("tools_equipment");
  });

  it("returns null for an ordinary grocery purchase", () => {
    expect(suggestDeductionCategory("Woolworths")).toBeNull();
  });

  it("returns null for empty or missing descriptions", () => {
    expect(suggestDeductionCategory("")).toBeNull();
    expect(suggestDeductionCategory(null)).toBeNull();
    expect(suggestDeductionCategory(undefined)).toBeNull();
  });
});
