import { describe, expect, it } from "vitest";
import { receiptsForFinancialYear, receiptTotalsByCategory } from "@/lib/receipts";
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
