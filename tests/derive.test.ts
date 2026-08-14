import { describe, expect, it } from "vitest";
import {
  applyTransfer,
  applyExpenseToBalance,
  applyIncomeToBalance,
  buildSpendTrend,
  buildBorrowingCapacity,
  borrowingCapacityYearReached,
  computeHoldingPL,
  deriveFinancials,
} from "@/lib/derive";
import { buildPeriods } from "@/lib/period";
import { DEFAULT_PROFILE_SETTINGS } from "@/lib/defaults";
import type { Balances, BudgetCategoryRow, HoldingLot, Profile, Reconciliation } from "@/lib/types";

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

const lot = (code: string, shares: number, price: number): HoldingLot => ({
  id: `${code}-${shares}-${price}`,
  user_id: "u1",
  code,
  shares,
  price,
  date: "2026-01-01",
  created_at: "2026-01-01T00:00:00Z",
});

describe("computeHoldingPL", () => {
  it("blends multiple buys into a weighted average cost", () => {
    const lots = [lot("AGL", 60, 8.0), lot("AGL", 40, 9.0)];
    const pl = computeHoldingPL(lots, "AGL", 100, 10);
    expect(pl.avgCost).toBeCloseTo(8.4, 5);
    expect(pl.costBasis).toBeCloseTo(840, 5);
    expect(pl.marketValue).toBe(1000);
    expect(pl.unrealizedPL).toBeCloseTo(160, 5);
    expect(pl.unrealizedPLPct).toBeCloseTo(19.047619, 4);
  });

  it("returns nulls when there are no logged lots for the code", () => {
    const pl = computeHoldingPL([lot("ANZ", 10, 30)], "AGL", 60, 8.84);
    expect(pl.avgCost).toBeNull();
    expect(pl.unrealizedPL).toBeNull();
    expect(pl.unrealizedPLPct).toBeNull();
    expect(pl.costBasis).toBe(0);
  });

  it("marketValue is null without a current price, even with known cost basis", () => {
    const pl = computeHoldingPL([lot("AGL", 60, 8.0)], "AGL", 60, null);
    expect(pl.avgCost).toBe(8);
    expect(pl.marketValue).toBeNull();
    expect(pl.unrealizedPL).toBeNull();
  });
});

describe("applyExpenseToBalance", () => {
  it("spending from an asset account (Everyday) reduces that balance", () => {
    const patch = applyExpenseToBalance(balances, "Everyday", 50);
    expect(patch).toEqual({ everyday: 950 });
  });

  it("spending on the credit card increases what's owed", () => {
    const patch = applyExpenseToBalance(balances, "Credit card", 25);
    expect(patch?.cc).toBeCloseTo(215.6, 5);
  });

  it("reverses cleanly with sign -1 (delete/undo)", () => {
    const spent = applyExpenseToBalance(balances, "Credit card", 25, 1)!;
    const after = { ...balances, ...spent };
    const reversed = applyExpenseToBalance(after, "Credit card", 25, -1);
    expect(reversed?.cc).toBeCloseTo(balances.cc, 5);
  });

  it("accounts with no tracked balance (Fun money, Cash) return null", () => {
    expect(applyExpenseToBalance(balances, "Fun money", 20)).toBeNull();
    expect(applyExpenseToBalance(balances, "Cash", 20)).toBeNull();
  });
});

describe("applyIncomeToBalance", () => {
  it("adds confirmed pay to the everyday balance", () => {
    expect(applyIncomeToBalance(balances, 1000)).toEqual({ everyday: 2000 });
  });

  it("reverses with sign -1", () => {
    expect(applyIncomeToBalance(balances, 1000, -1)).toEqual({ everyday: 0 });
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
