import { describe, expect, it } from "vitest";
import {
  applyTransfer,
  applyExpenseToBalance,
  applyIncomeToBalance,
  buildSpendTrend,
  buildBorrowingCapacity,
  borrowingCapacityYearReached,
  buildNetWorthProjection,
  netWorthPositiveAt,
  hecsCompulsoryRepayment,
  SALARY_SCENARIOS,
  computeHoldingPL,
  deriveFinancials,
  plannedIncomeFN,
  periodTotals,
  averageSpend,
  buildActualSpendTrend,
  loggedByCategory,
  fhssSummary,
  FHSS_ANNUAL_CAP,
  FHSS_LIFETIME_CAP,
  nextOccurrence,
  daysUntil,
  buildFortnightSplit,
  fortnightCategoryBreakdown,
  sinkingFundBreakdown,
  creditCardPayoffPeriod,
  periodsToTarget,
  buildIncomeProjection,
  buildVarianceReport,
  buildVarianceInsights,
  sumMiscIncomeYTD,
  actualIncomeForPeriod,
  reconcileCategoryRows,
} from "@/lib/derive";
import { buildPeriods, isFT } from "@/lib/period";
import { netFromPackage, FN_PER_YEAR } from "@/lib/tax";
import { DEFAULT_PROFILE_SETTINGS } from "@/lib/defaults";
import type { Balances, BudgetCategoryRow, HoldingLot, MiscIncome, Payslip, Profile, Reconciliation } from "@/lib/types";

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

const profile: Profile = { user_id: "u1", display_name: null, super_employer_extra: 0, ...DEFAULT_PROFILE_SETTINGS };
const categories: BudgetCategoryRow[] = [
  { id: "c1", user_id: "u1", key: "groceries", label: "Groceries", amount_2026: 500, amount_2027: 500, sort: 0 },
];

describe("periodTotals / averageSpend", () => {
  it("sums each period's categories and averages across periods with any spend", () => {
    const loggedByCat = {
      "2026-08-24": { groceries: 100, fuel: 50 },
      "2026-09-07": { groceries: 200 },
    };
    const totals = periodTotals(loggedByCat);
    expect(totals).toEqual(
      expect.arrayContaining([
        { key: "2026-08-24", total: 150 },
        { key: "2026-09-07", total: 200 },
      ])
    );
    expect(averageSpend(totals)).toBeCloseTo(175, 5);
  });

  it("averageSpend of no periods is 0, not NaN", () => {
    expect(averageSpend([])).toBe(0);
  });
});

describe("buildActualSpendTrend", () => {
  it("sums logged transactions into a per-period total with no plan comparison", () => {
    const periods = buildPeriods(profile.pay_anchor);
    const transactions = [
      { id: "1", user_id: "u1", date: periods[0].key, description: null, amount: 40, category_key: "groceries", account: "Everyday", created_at: "" },
      { id: "2", user_id: "u1", date: periods[0].key, description: null, amount: 10, category_key: "fuel", account: "Everyday", created_at: "" },
    ];
    const loggedByCat = loggedByCategory(transactions, profile.pay_anchor);
    const [first] = buildActualSpendTrend(periods, loggedByCat, profile.pay_anchor, 1);
    expect(first.total).toBe(50);
  });

  it("windows to the trailing N periods ending at today, like buildSpendTrend", () => {
    const periods = buildPeriods(profile.pay_anchor);
    const trend = buildActualSpendTrend(periods, {}, periods[5].key, 3);
    expect(trend.map((p) => p.key)).toEqual([periods[3].key, periods[4].key, periods[5].key]);
  });
});

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

  it("flags only the last (in-progress) period as current", () => {
    const trend = buildSpendTrend(periods, categories, D, {}, {}, periods[5].key, 3);
    expect(trend.map((p) => p.isCurrent)).toEqual([false, false, true]);
  });

  it("includes spend logged to the unbudgeted 'Other' catch-all in the actual total", () => {
    const key = periods[0].key;
    const loggedByCat = { [key]: { groceries: 120, other: 60 } };
    const [first] = buildSpendTrend(periods, categories, D, loggedByCat, {}, profile.pay_anchor, 1);
    expect(first.actual).toBe(180);
  });
});

describe("reconcileCategoryRows", () => {
  const D = deriveFinancials(profile, categories);

  it("omits 'Other' when nothing has been logged against it", () => {
    const rows = reconcileCategoryRows(categories, D, 2026, { groceries: 100 }, {});
    expect(rows.find((r) => r.id === "other")).toBeUndefined();
  });

  it("adds an 'Other' row with $0 planned once something is logged against it", () => {
    const rows = reconcileCategoryRows(categories, D, 2026, { groceries: 100, other: 45 }, {});
    const other = rows.find((r) => r.id === "other");
    expect(other).toBeDefined();
    expect(other!.plan).toBe(0);
    expect(other!.actual).toBe(45);
    expect(other!.variance).toBe(-45);
  });

  it("surfaces a manual override on 'Other' even with nothing logged", () => {
    const rows = reconcileCategoryRows(categories, D, 2026, undefined, { other: "30" });
    const other = rows.find((r) => r.id === "other");
    expect(other?.actual).toBe(30);
  });

  it("rolls spend logged against a since-deleted category into 'Other' instead of dropping it", () => {
    // "gym" isn't in `categories` (deleted on Budget after this fortnight's spend was logged) —
    // the money was real and should still show up somewhere, not vanish from the report.
    const rows = reconcileCategoryRows(categories, D, 2026, { groceries: 100, gym: 38 }, {});
    expect(rows.find((r) => r.id === "gym")).toBeUndefined();
    const other = rows.find((r) => r.id === "other");
    expect(other?.actual).toBe(38);
  });

  it("combines orphaned spend with genuine 'Other' spend in the same fortnight", () => {
    const rows = reconcileCategoryRows(categories, D, 2026, { gym: 38, other: 12 }, {});
    const other = rows.find((r) => r.id === "other");
    expect(other?.actual).toBe(50);
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

describe("hecsCompulsoryRepayment", () => {
  it("nothing below the minimum threshold", () => {
    expect(hecsCompulsoryRepayment(60000)).toBe(0);
  });

  it("15% marginal in the first bracket", () => {
    expect(hecsCompulsoryRepayment(100000)).toBeCloseTo((100000 - 69528) * 0.15, 5);
  });

  it("9,028.35 plus 17% marginal in the second bracket", () => {
    expect(hecsCompulsoryRepayment(150000)).toBeCloseTo(9028.35 + (150000 - 129717) * 0.17, 5);
  });

  it("flips to a flat 10% of total income at the top threshold", () => {
    expect(hecsCompulsoryRepayment(200000)).toBeCloseTo(20000, 5);
  });
});

describe("SALARY_SCENARIOS", () => {
  it("'flat' never grows the package", () => {
    const flat = SALARY_SCENARIOS.find((s) => s.id === "flat")!;
    expect(flat.multiplierAt(0)).toBe(1);
    expect(flat.multiplierAt(100)).toBe(1);
  });

  it("'standard' compounds faster in the first 5 years than after", () => {
    const standard = SALARY_SCENARIOS.find((s) => s.id === "standard")!;
    const atYear1 = standard.multiplierAt(26); // ~1 year of fortnights
    const atYear5 = standard.multiplierAt(130); // ~5 years
    const atYear6 = standard.multiplierAt(156); // ~6 years
    expect(atYear1).toBeGreaterThan(1);
    expect(atYear5).toBeGreaterThan(atYear1);
    // The year-5-to-6 step should be smaller than any early year's step (growth rate slows).
    const earlyStep = atYear1 / standard.multiplierAt(0);
    const laterStep = atYear6 / atYear5;
    expect(laterStep).toBeLessThan(earlyStep);
  });
});

describe("buildNetWorthProjection", () => {
  const periods = buildPeriods(profile.pay_anchor);
  const D = deriveFinancials(profile, categories);
  const flatScenario = SALARY_SCENARIOS[0];
  const startBalances: Balances = { ...balances, emergency: 0, anzplus: 0, shares: 1000, superb: 1000, cc: 0, hecs: 0 };

  it("starts from today's real balances, not the plan baseline", () => {
    const [first] = buildNetWorthProjection(profile, D, startBalances, periods, profile.pay_anchor, 0, 0, flatScenario, 0, 1);
    // Zero growth, zero extra: liquid should just be the period's surplus (income - expenses).
    const income = plannedIncomeFN(periods[0], profile, D);
    const surplus = Math.max(0, income - D.expFN(periods[0].year));
    expect(first.liquid).toBeCloseTo(surplus, 0);
  });

  it("compounds shares/super at the given annual growth rate and adds the fortnightly super contribution", () => {
    const zeroExpenseCategories: BudgetCategoryRow[] = [{ id: "c1", user_id: "u1", key: "groceries", label: "Groceries", amount_2026: 0, amount_2027: 0, sort: 0 }];
    const D0 = deriveFinancials(profile, zeroExpenseCategories);
    const flatBalances: Balances = { ...startBalances, shares: 1000, superb: 0 };
    const [first] = buildNetWorthProjection(profile, D0, flatBalances, periods, profile.pay_anchor, 10, 0, flatScenario, 0, 1);
    const periodGrowth = Math.pow(1.1, 14 / 365) - 1;
    const pkg = isFT(periods[0].key, profile.ft_start) ? profile.package : profile.package * profile.pt_fraction;
    const { cash } = netFromPackage(pkg, profile.super_rate);
    const expectedSuperFn = (pkg - cash) / FN_PER_YEAR;
    expect(first.invested).toBeCloseTo(Math.round(1000 * (1 + periodGrowth) + expectedSuperFn), -1);
  });

  it("extra fortnightly savings flows straight into liquid balance", () => {
    const zeroIncomeProfile: Profile = { ...profile, package: 0 };
    const D0 = deriveFinancials(zeroIncomeProfile, categories);
    const [first] = buildNetWorthProjection(zeroIncomeProfile, D0, startBalances, periods, profile.pay_anchor, 0, 100, flatScenario, 0, 1);
    expect(first.liquid).toBe(100);
  });

  it("pays the credit card down from surplus before topping up the emergency fund or deposit", () => {
    const withDebt: Balances = { ...startBalances, cc: 200 };
    const [first] = buildNetWorthProjection(profile, D, withDebt, periods, profile.pay_anchor, 0, 0, flatScenario, 0, 1);
    const income = plannedIncomeFN(periods[0], profile, D);
    const surplus = Math.max(0, income - D.expFN(periods[0].year));
    const toCC = Math.min(surplus, 200);
    // netWorth subtracts whatever credit card is left after this period's paydown, not the flat opening balance.
    expect(first.netWorth).toBeCloseTo(first.liquid + first.invested - (200 - toCC), -1);
  });

  it("stops paying down the credit card once it's cleared, same as buildFortnightSplit", () => {
    const smallDebt: Balances = { ...startBalances, cc: 1 };
    const points = buildNetWorthProjection(profile, D, smallDebt, periods, profile.pay_anchor, 0, 0, flatScenario, 0, 3);
    // A $1 debt is trivially cleared in period 0 — every later period's netWorth should stop subtracting it.
    points.slice(1).forEach((p) => {
      expect(p.netWorth).toBeCloseTo(p.liquid + p.invested, -1);
    });
  });

  it("reduces HECS via the compulsory repayment on income, and grows it via indexation", () => {
    const withHecs: Balances = { ...startBalances, hecs: 40000 };
    const noIndexation = buildNetWorthProjection(profile, D, withHecs, periods, profile.pay_anchor, 0, 0, flatScenario, 0, 5);
    const withIndexation = buildNetWorthProjection(profile, D, withHecs, periods, profile.pay_anchor, 0, 0, flatScenario, 10, 5);
    // Same income/repayment either way, but indexation grows the balance, so net worth ends up lower.
    expect(withIndexation[4].netWorth).toBeLessThan(noIndexation[4].netWorth);
  });

  it("a higher-paying salary scenario produces a higher (or equal) net worth over time", () => {
    const standardScenario = SALARY_SCENARIOS.find((s) => s.id === "standard")!;
    const flatPoints = buildNetWorthProjection(profile, D, startBalances, periods, profile.pay_anchor, 5, 0, flatScenario, 3, 26);
    const standardPoints = buildNetWorthProjection(profile, D, startBalances, periods, profile.pay_anchor, 5, 0, standardScenario, 3, 26);
    expect(standardPoints[25].netWorth).toBeGreaterThan(flatPoints[25].netWorth);
  });
});

describe("netWorthPositiveAt", () => {
  it("returns the label of the first period with non-negative net worth", () => {
    const points = [
      { key: "a", label: "A", liquid: 0, invested: 0, netWorth: -500 },
      { key: "b", label: "B", liquid: 0, invested: 0, netWorth: -10 },
      { key: "c", label: "C", liquid: 0, invested: 0, netWorth: 200 },
    ];
    expect(netWorthPositiveAt(points)).toBe("C");
  });

  it("returns null when net worth never turns positive", () => {
    const points = [{ key: "a", label: "A", liquid: 0, invested: 0, netWorth: -50 }];
    expect(netWorthPositiveAt(points)).toBeNull();
  });
});

describe("fhssSummary", () => {
  it("sums this-FY contributions and caps eligibility at the annual cap", () => {
    const contributions = [
      { date: "2026-08-01", amount: 10000, taxDeductible: true },
      { date: "2026-09-01", amount: 8000, taxDeductible: true },
    ];
    const s = fhssSummary(contributions, "2026-09-15", 0, 60000);
    expect(s.thisFYTotal).toBe(18000);
    expect(s.thisFYEligible).toBe(FHSS_ANNUAL_CAP);
  });

  it("caps lifetime eligibility at the lifetime cap across financial years", () => {
    const contributions = [
      { date: "2024-08-01", amount: 15000, taxDeductible: true },
      { date: "2025-08-01", amount: 15000, taxDeductible: true },
      { date: "2026-08-01", amount: 15000, taxDeductible: true },
      { date: "2027-08-01", amount: 15000, taxDeductible: true },
    ];
    const s = fhssSummary(contributions, "2027-09-01", 0, 60000);
    expect(s.lifetimeTotal).toBe(60000);
    expect(s.lifetimeEligible).toBe(FHSS_LIFETIME_CAP);
  });

  it("with a zero deemed rate, the releasable estimate equals the eligible principal", () => {
    const contributions = [{ date: "2026-01-01", amount: 5000, taxDeductible: true }];
    const s = fhssSummary(contributions, "2026-08-14", 0, 60000);
    expect(s.estimatedReleasable).toBeCloseTo(5000, 5);
  });

  it("a positive deemed rate grows the releasable estimate above the principal", () => {
    const contributions = [{ date: "2025-08-01", amount: 5000, taxDeductible: true }];
    const s = fhssSummary(contributions, "2026-08-14", 7.4, 60000);
    expect(s.estimatedReleasable).toBeGreaterThan(5000);
  });

  it("excludes the ineligible excess from earning deemed interest", () => {
    const contributions = [{ date: "2026-08-01", amount: 20000, taxDeductible: true }];
    const s = fhssSummary(contributions, "2026-08-14", 10, 60000);
    // Only $15,000 is eligible; the estimate should track that principal, not the full $20,000.
    expect(s.estimatedReleasable).toBeLessThan(20000);
    expect(s.estimatedReleasable).toBeGreaterThanOrEqual(FHSS_ANNUAL_CAP);
  });

  it("a non-concessional (non-deductible) contribution releases its principal tax-free", () => {
    const contributions = [{ date: "2026-01-01", amount: 5000, taxDeductible: false }];
    const s = fhssSummary(contributions, "2026-08-14", 0, 60000);
    expect(s.taxFreeAmount).toBeCloseTo(5000, 5);
    expect(s.assessableAmount).toBeCloseTo(0, 5);
    expect(s.estimatedTax).toBeCloseTo(0, 5);
    expect(s.estimatedNetReleasable).toBeCloseTo(5000, 5);
  });

  it("a concessional (deductible) contribution's principal and earnings are assessable and taxed with the 30% offset", () => {
    const contributions = [{ date: "2026-01-01", amount: 5000, taxDeductible: true }];
    const s = fhssSummary(contributions, "2026-08-14", 5, 60000);
    expect(s.taxFreeAmount).toBe(0);
    expect(s.assessableAmount).toBeGreaterThan(5000); // principal + deemed earnings
    expect(s.estimatedTax).toBeGreaterThanOrEqual(0);
    expect(s.estimatedNetReleasable).toBeLessThan(s.estimatedReleasable);
  });

  it("splitting one nominal contribution into deductible + non-deductible portions nets out higher than treating it all as deductible, once marginal rate exceeds the 30% offset", () => {
    // At exactly the 30% bracket, concessional tax nets to zero either way — use a higher
    // income (37% bracket) where the offset no longer fully cancels the tax, so the split
    // (less of it taxed) comes out ahead.
    const baseIncome = 150000;
    const allDeductible = fhssSummary([{ date: "2026-06-15", amount: 8000, taxDeductible: true }], "2026-08-14", 0, baseIncome);
    const split = fhssSummary(
      [
        { date: "2026-06-15", amount: 7000, taxDeductible: true },
        { date: "2026-06-15", amount: 1000, taxDeductible: false },
      ],
      "2026-08-14",
      0,
      baseIncome
    );
    expect(split.estimatedNetReleasable).toBeGreaterThan(allDeductible.estimatedNetReleasable);
  });
});

describe("nextOccurrence", () => {
  it("advances weekly by 7 days", () => {
    expect(nextOccurrence("2026-08-14", "weekly")).toBe("2026-08-21");
  });

  it("advances fortnightly by 14 days", () => {
    expect(nextOccurrence("2026-08-14", "fortnightly")).toBe("2026-08-28");
  });

  it("advances monthly, rolling over year-end correctly", () => {
    expect(nextOccurrence("2026-08-14", "monthly")).toBe("2026-09-14");
    expect(nextOccurrence("2026-12-14", "monthly")).toBe("2027-01-14");
  });

  it("advances quarterly by 3 months", () => {
    expect(nextOccurrence("2026-08-14", "quarterly")).toBe("2026-11-14");
  });

  it("advances yearly by 1 year", () => {
    expect(nextOccurrence("2026-08-14", "yearly")).toBe("2027-08-14");
  });
});

describe("daysUntil", () => {
  it("is 0 for today", () => {
    expect(daysUntil("2026-08-14", "2026-08-14")).toBe(0);
  });

  it("is positive for a future date", () => {
    expect(daysUntil("2026-08-20", "2026-08-14")).toBe(6);
  });

  it("is negative for a past date (overdue)", () => {
    expect(daysUntil("2026-08-01", "2026-08-14")).toBe(-13);
  });
});

describe("buildFortnightSplit", () => {
  const periods = buildPeriods(profile.pay_anchor);
  const D = deriveFinancials(profile, categories);

  it("pays down the credit card before the emergency fund, starting from real balances", () => {
    const split = buildFortnightSplit(profile, D, categories, balances, [], periods, profile.pay_anchor, 3);
    expect(split).toHaveLength(3);
    const first = split[0];
    expect(first.categoriesTotal).toBeCloseTo(D.expFN(periods[0].year), 5);
    const surplus = first.netPay - first.categoriesTotal;
    const toCC = Math.min(surplus, balances.cc);
    expect(first.toCreditCard).toBeCloseTo(toCC, 5);
    const afterCC = surplus - toCC;
    expect(first.toEmergency).toBeCloseTo(Math.min(afterCC, (profile.emergency_target || 0) - balances.emergency), 5);
  });

  it("stops topping up the emergency fund once it's already at its target", () => {
    const fullEmergency = { ...balances, emergency: profile.emergency_target, cc: 0 };
    const split = buildFortnightSplit(profile, D, categories, fullEmergency, [], periods, profile.pay_anchor, 1);
    expect(split[0].toEmergency).toBe(0);
    expect(split[0].toDeposit).toBeCloseTo(split[0].netPay - split[0].categoriesTotal, 5);
  });

  it("accumulates the running deposit balance period over period", () => {
    const split = buildFortnightSplit(profile, D, categories, balances, [], periods, profile.pay_anchor, 2);
    expect(split[1].depositBalance).toBe(Math.round(balances.anzplus + split[0].toDeposit + split[1].toDeposit));
  });

  it("deducts the sinking-fund set-aside for active recurring expenses before computing surplus", () => {
    const recurring = [
      { id: "1", user_id: "u", description: "Car rego", amount: 780, category_key: "other", account: "ANZ Plus", frequency: "yearly" as const, next_due: "2027-01-01", active: true, created_at: "" },
    ];
    const noCCFullEmergency = { ...balances, cc: 0, emergency: profile.emergency_target };
    const withSinking = buildFortnightSplit(profile, D, categories, noCCFullEmergency, recurring, periods, profile.pay_anchor, 1);
    const without = buildFortnightSplit(profile, D, categories, noCCFullEmergency, [], periods, profile.pay_anchor, 1);
    expect(withSinking[0].sinkingTotal).toBeCloseTo(780 / 26, 5);
    expect(withSinking[0].toDeposit).toBeCloseTo(without[0].toDeposit - 780 / 26, 5);
  });
});

describe("creditCardPayoffPeriod", () => {
  const periods = buildPeriods(profile.pay_anchor);
  const D = deriveFinancials(profile, categories);

  it("finds the first period whose simulated credit-card balance reaches zero", () => {
    const smallDebt = { ...balances, cc: 50, emergency: profile.emergency_target };
    const split = buildFortnightSplit(profile, D, categories, smallDebt, [], periods, profile.pay_anchor, 3);
    const payoff = creditCardPayoffPeriod(split);
    expect(payoff).not.toBeNull();
    expect(payoff!.key).toBe(split[0].key);
  });

  it("returns null when the debt outlasts the whole projection", () => {
    const hugeDebt = { ...balances, cc: 1_000_000 };
    const split = buildFortnightSplit(profile, D, categories, hugeDebt, [], periods, profile.pay_anchor, 3);
    expect(creditCardPayoffPeriod(split)).toBeNull();
  });
});

describe("sinkingFundBreakdown", () => {
  it("converts each active recurring expense to a per-fortnight equivalent, biggest first", () => {
    const recurring = [
      { id: "1", user_id: "u", description: "Rego", amount: 780, category_key: "other", account: "ANZ Plus", frequency: "yearly" as const, next_due: "2027-01-01", active: true, created_at: "" },
      { id: "2", user_id: "u", description: "Netflix", amount: 20, category_key: "other", account: "Everyday", frequency: "monthly" as const, next_due: "2026-09-01", active: true, created_at: "" },
      { id: "3", user_id: "u", description: "Paused thing", amount: 500, category_key: "other", account: "Everyday", frequency: "yearly" as const, next_due: "2027-01-01", active: false, created_at: "" },
    ];
    const rows = sinkingFundBreakdown(recurring);
    expect(rows).toHaveLength(2);
    expect(rows[0].label).toBe("Rego");
    expect(rows[0].perFortnight).toBeCloseTo(780 / 26, 5);
    expect(rows[1].label).toBe("Netflix");
    expect(rows[1].perFortnight).toBeCloseTo((20 * 12) / 26, 5);
  });
});

describe("fortnightCategoryBreakdown", () => {
  it("returns each category's fortnightly amount for the given year", () => {
    const D = deriveFinancials(profile, categories);
    const rows = fortnightCategoryBreakdown(categories, D, 2026);
    expect(rows).toEqual([{ label: "Groceries", amount: D.catFN("groceries", 2026) }]);
  });
});

describe("periodsToTarget", () => {
  it("is 0 when already at or above target", () => {
    expect(periodsToTarget(1000, 1000, 100)).toBe(0);
    expect(periodsToTarget(1200, 1000, 100)).toBe(0);
  });

  it("is null when the rate can't make progress toward an unmet target", () => {
    expect(periodsToTarget(0, 1000, 0)).toBeNull();
    expect(periodsToTarget(0, 1000, -50)).toBeNull();
  });

  it("rounds up the number of fortnights needed at a constant rate", () => {
    expect(periodsToTarget(0, 1000, 300)).toBe(4);
  });
});

describe("buildIncomeProjection", () => {
  const periods = buildPeriods(profile.pay_anchor);
  const flat = SALARY_SCENARIOS.find((s) => s.id === "flat")!;
  const standard = SALARY_SCENARIOS.find((s) => s.id === "standard")!;

  it("matches netFromPackage for the flat scenario's first (part-time) period", () => {
    const projection = buildIncomeProjection(profile, periods, profile.pay_anchor, flat, 3);
    const { cash, net } = netFromPackage(profile.package * profile.pt_fraction, profile.super_rate);
    expect(projection[0].gross).toBeCloseTo(cash / FN_PER_YEAR, 5);
    expect(projection[0].net).toBeCloseTo(net / FN_PER_YEAR, 5);
    expect(projection[0].tax).toBeCloseTo(projection[0].gross - projection[0].net, 5);
    expect(projection[0].isFT).toBe(false);
  });

  it("switches to full-time pay from ft_start", () => {
    const projection = buildIncomeProjection(profile, periods, profile.pay_anchor, flat, 10);
    const ftPoint = projection.find((p) => p.isFT);
    expect(ftPoint).toBeDefined();
    const { net } = netFromPackage(profile.package, profile.super_rate);
    expect(ftPoint!.net).toBeCloseTo(net / FN_PER_YEAR, 5);
  });

  it("grows pay period over period under the standard scenario", () => {
    const projection = buildIncomeProjection(profile, periods, profile.pay_anchor, standard, 30);
    expect(projection[29].gross).toBeGreaterThan(projection[0].gross);
  });
});

describe("buildVarianceReport", () => {
  const periods = buildPeriods(profile.pay_anchor);
  const D = deriveFinancials(profile, categories);

  it("includes no periods when nothing has been reconciled", () => {
    const report = buildVarianceReport(profile, categories, D, periods, {}, {});
    expect(report.periodsIncluded).toBe(0);
    expect(report.totalPlannedExpenses).toBe(0);
    expect(report.totalActualExpenses).toBe(0);
  });

  it("counts a period with only logged expenses, falling back to planned income", () => {
    const key = periods[0].key;
    const loggedByCat = { [key]: { groceries: 100 } };
    const report = buildVarianceReport(profile, categories, D, periods, loggedByCat, {});
    expect(report.periodsIncluded).toBe(1);
    const groceriesRow = report.rows.find((r) => r.id === "groceries")!;
    expect(groceriesRow.plannedTotal).toBeCloseTo(D.catFN("groceries", periods[0].year), 5);
    expect(groceriesRow.actualTotal).toBe(100);
    expect(report.totalActualIncome).toBe(report.totalPlannedIncome);
    expect(report.incomeVariance).toBe(0);
  });

  it("uses the confirmed actual income when present", () => {
    const key = periods[0].key;
    const planInc = plannedIncomeFN(periods[0], profile, D);
    const reconciliations: Record<string, Reconciliation> = {
      [key]: { period_key: key, actual_income: planInc + 200, actual_overrides: {} },
    };
    const report = buildVarianceReport(profile, categories, D, periods, {}, reconciliations);
    expect(report.periodsIncluded).toBe(1);
    expect(report.incomeVariance).toBeCloseTo(200, 5);
  });

  it("sums across multiple reconciled periods", () => {
    const [p0, p1] = periods;
    const loggedByCat = { [p0.key]: { groceries: 100 }, [p1.key]: { groceries: 150 } };
    const report = buildVarianceReport(profile, categories, D, periods, loggedByCat, {});
    expect(report.periodsIncluded).toBe(2);
    const groceriesRow = report.rows.find((r) => r.id === "groceries")!;
    expect(groceriesRow.actualTotal).toBe(250);
  });

  it("includes spend logged to 'Other' in the totals instead of dropping it silently", () => {
    const key = periods[0].key;
    const loggedByCat = { [key]: { groceries: 100, other: 60 } };
    const report = buildVarianceReport(profile, categories, D, periods, loggedByCat, {});
    const otherRow = report.rows.find((r) => r.id === "other")!;
    expect(otherRow).toBeDefined();
    expect(otherRow.actualTotal).toBe(60);
    expect(report.totalActualExpenses).toBe(160);
  });
});

describe("buildVarianceInsights", () => {
  const periods = buildPeriods(profile.pay_anchor);
  const D = deriveFinancials(profile, categories);
  const plan = D.catFN("groceries", periods[0].year);

  it("finds no insight below the minimum streak", () => {
    const loggedByCat = { [periods[0].key]: { groceries: plan + 100 }, [periods[1].key]: { groceries: plan + 100 } };
    const insights = buildVarianceInsights(categories, D, periods, loggedByCat, {});
    expect(insights).toHaveLength(0);
  });

  it("flags an over-budget streak of at least minStreak fortnights", () => {
    const loggedByCat = {
      [periods[0].key]: { groceries: plan + 100 },
      [periods[1].key]: { groceries: plan + 100 },
      [periods[2].key]: { groceries: plan + 100 },
    };
    const insights = buildVarianceInsights(categories, D, periods, loggedByCat, {});
    expect(insights).toHaveLength(1);
    expect(insights[0].favorable).toBe(false);
    expect(insights[0].streakLength).toBe(3);
  });

  it("flags an under-budget streak as favorable", () => {
    const loggedByCat = {
      [periods[0].key]: { groceries: plan - 100 },
      [periods[1].key]: { groceries: plan - 100 },
      [periods[2].key]: { groceries: plan - 100 },
    };
    const insights = buildVarianceInsights(categories, D, periods, loggedByCat, {});
    expect(insights[0].favorable).toBe(true);
  });

  it("only counts the streak ending at the most recent reconciled period", () => {
    const loggedByCat = {
      [periods[0].key]: { groceries: plan + 100 },
      [periods[1].key]: { groceries: plan - 100 },
      [periods[2].key]: { groceries: plan + 100 },
    };
    const insights = buildVarianceInsights(categories, D, periods, loggedByCat, {}, 2);
    expect(insights).toHaveLength(0);
  });

  it("respects a custom minStreak", () => {
    const loggedByCat = { [periods[0].key]: { groceries: plan + 100 }, [periods[1].key]: { groceries: plan + 100 } };
    const insights = buildVarianceInsights(categories, D, periods, loggedByCat, {}, 2);
    expect(insights).toHaveLength(1);
    expect(insights[0].streakLength).toBe(2);
  });
});

function makePayslip(overrides: Partial<Payslip>): Payslip {
  return {
    id: "p1",
    user_id: "u1",
    period_key: "2026-08-24",
    file_path: null,
    status: "confirmed",
    gross: null,
    paygw_tax: null,
    super: null,
    net: null,
    help_hecs: null,
    allowances: [],
    period_start: null,
    period_end: null,
    created_at: "2026-08-24T00:00:00Z",
    confirmed_at: "2026-08-24T00:00:00Z",
    ...overrides,
  };
}

function makeMiscIncome(overrides: Partial<MiscIncome>): MiscIncome {
  return { id: "m1", user_id: "u1", date: "2026-08-24", description: null, amount: 0, created_at: "2026-08-24T00:00:00Z", ...overrides };
}

describe("sumMiscIncomeYTD", () => {
  it("sums entries within the financial year, excluding earlier ones", () => {
    const entries = [makeMiscIncome({ date: "2026-08-01", amount: 100 }), makeMiscIncome({ id: "m2", date: "2025-06-01", amount: 500 })];
    expect(sumMiscIncomeYTD(entries, "2026-07-01")).toBe(100);
  });
});

describe("actualIncomeForPeriod", () => {
  const anchor = "2026-08-24";

  it("sums confirmed payslips for the period, ignoring unconfirmed ones", () => {
    const payslips = [
      makePayslip({ id: "p1", period_key: "2026-08-24", status: "confirmed", net: 1000 }),
      makePayslip({ id: "p2", period_key: "2026-08-24", status: "parsed", net: 500 }),
      makePayslip({ id: "p3", period_key: "2026-09-07", status: "confirmed", net: 300 }),
    ];
    expect(actualIncomeForPeriod(payslips, [], "2026-08-24", anchor)).toBe(1000);
  });

  it("adds misc income landing in the same period", () => {
    const payslips = [makePayslip({ period_key: "2026-08-24", status: "confirmed", net: 1000 })];
    const misc = [makeMiscIncome({ date: "2026-08-30", amount: 200 }), makeMiscIncome({ id: "m2", date: "2026-09-10", amount: 999 })];
    expect(actualIncomeForPeriod(payslips, misc, "2026-08-24", anchor)).toBe(1200);
  });

  it("is 0 for a period with nothing confirmed or logged", () => {
    expect(actualIncomeForPeriod([], [], "2026-08-24", anchor)).toBe(0);
  });
});
