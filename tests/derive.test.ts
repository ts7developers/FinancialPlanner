import { describe, expect, it } from "vitest";
import { applyTransfer, buildSpendTrend, buildBorrowingCapacity, borrowingCapacityYearReached, deriveFinancials } from "@/lib/derive";
import { buildPeriods } from "@/lib/period";
import { DEFAULT_PROFILE_SETTINGS } from "@/lib/defaults";
import type { Balances, BudgetCategoryRow, Profile, Reconciliation } from "@/lib/types";

const balances: Balances = {
  user_id: "u1",
  everyday: 1000,
  anzplus: 3000,
  emergency: 500,
  holiday: 0,
  shares: 0,
  superb: 0,
  cc: 190.6,
  hecs: 45182.77,
};

describe("applyTransfer", () => {
  it("moves money between two asset accounts", () => {
    const patch = applyTransfer(balances, "everyday", "emergency", 200);
    expect(patch).toEqual({ everyday: 800, emergency: 700 });
  });

  it("paying a liability account (credit card) reduces what's owed, not increases it", () => {
    const patch = applyTransfer(balances, "everyday", "cc", 190.6);
    expect(patch.everyday).toBe(1000 - 190.6);
    expect(patch.cc).toBeCloseTo(0, 5);
  });

  it("paying toward HECS reduces the owing balance", () => {
    const patch = applyTransfer(balances, "everyday", "hecs", 100);
    expect(patch.hecs).toBeCloseTo(45082.77, 5);
  });
});

const profile: Profile = { user_id: "u1", display_name: null, ...DEFAULT_PROFILE_SETTINGS };
const categories: BudgetCategoryRow[] = [
  { id: "c1", user_id: "u1", key: "groceries", label: "Groceries", amount_2026: 500, amount_2027: 500, sort: 0 },
];

describe("buildSpendTrend", () => {
  const periods = buildPeriods(profile.pay_anchor);
  const D = deriveFinancials(profile, categories);

  it("marks a period with no logged transactions and no override as not-yet-reconciled (null)", () => {
    const [first] = buildSpendTrend(periods, categories, D, {}, {}, profile.pay_anchor, 1);
    expect(first.planned).toBeCloseTo(D.catFN("groceries", periods[0].year), 5);
    expect(first.actual).toBeNull();
  });

  it("sums logged transactions into actual once any exist for the period", () => {
    const key = periods[0].key;
    const loggedByCat = { [key]: { groceries: 120 } };
    const [first] = buildSpendTrend(periods, categories, D, loggedByCat, {}, profile.pay_anchor, 1);
    expect(first.actual).toBe(120);
  });

  it("a manual override counts as reconciled even with zero logged transactions", () => {
    const key = periods[0].key;
    const reconciliations: Record<string, Reconciliation> = { [key]: { period_key: key, actual_income: null, actual_overrides: { groceries: "80" } } };
    const [first] = buildSpendTrend(periods, categories, D, {}, reconciliations, profile.pay_anchor, 1);
    expect(first.actual).toBe(80);
  });

  it("windows to the trailing N periods ending at today", () => {
    const trend = buildSpendTrend(periods, categories, D, {}, {}, periods[5].key, 3);
    expect(trend.map((p) => p.key)).toEqual([periods[3].key, periods[4].key, periods[5].key]);
  });
});

describe("buildBorrowingCapacity", () => {
  const D = deriveFinancials(profile, categories);

  it("capacity is household cash income times the low/high multiples in year one", () => {
    const [first] = buildBorrowingCapacity(profile, D, 2026, 3);
    expect(first.capLow).toBeCloseTo(D.cashFT * 5.6, 2);
    expect(first.capHigh).toBeCloseTo(D.cashFT * 6.6, 2);
  });

  it("includes partner income and compounds the raise assumption year over year", () => {
    const withPartner: Profile = { ...profile, partner_income: 40000, income_growth_pct: 5 };
    const points = buildBorrowingCapacity(withPartner, D, 2026, 3);
    expect(points[0].income).toBeCloseTo(D.cashFT + 40000, 2);
    expect(points[1].income).toBeCloseTo(points[0].income * 1.05, 2);
    expect(points[2].income).toBeCloseTo(points[0].income * 1.05 * 1.05, 2);
  });

  it("loan needed stays flat across years (based on today's house target and deposit)", () => {
    const points = buildBorrowingCapacity(profile, D, 2026, 3);
    expect(points.every((p) => p.loanNeeded === points[0].loanNeeded)).toBe(true);
  });
});

describe("borrowingCapacityYearReached", () => {
  it("returns the first year capacity (low) covers the loan needed", () => {
    const points = [
      { year: 2026, income: 1, capLow: 100, capHigh: 150, loanNeeded: 500 },
      { year: 2027, income: 1, capLow: 400, capHigh: 450, loanNeeded: 500 },
      { year: 2028, income: 1, capLow: 600, capHigh: 650, loanNeeded: 500 },
    ];
    expect(borrowingCapacityYearReached(points)).toBe(2028);
  });

  it("returns null when capacity never reaches the loan needed", () => {
    const points = [{ year: 2026, income: 1, capLow: 100, capHigh: 150, loanNeeded: 500 }];
    expect(borrowingCapacityYearReached(points)).toBeNull();
  });
});
