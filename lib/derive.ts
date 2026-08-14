// Cross-tab derived data — ported from the `D`, `PLAN_PATH`, `loggedByCat`, `catRows` memos
// in FinancialPlanTracker.jsx. Pure functions so the same math is reusable and testable
// independent of React / Supabase.

import { dayLabel, currentPeriod, isFT, periodKeyOf, type Period } from "./period";
import { netFromPackage, FN_PER_YEAR, FN_FROM_MO } from "./tax";
import type { Account } from "./theme";
import type { BudgetCategoryRow, Profile, Transaction, Reconciliation, Balances, Payslip, HoldingLot } from "./types";

export interface DerivedFinancials {
  netFTfn: number;
  netPTfn: number;
  netFTmo: number;
  cashFT: number;
  superFTfn: number;
  dep5: number;
  netCash: number;
  catFN: (id: string, year: number) => number;
  expMo: (year: number) => number;
  expFN: (year: number) => number;
}

export function deriveFinancials(profile: Profile, categories: BudgetCategoryRow[]): DerivedFinancials {
  const pkg = Number(profile.package) || 0;
  const sg = Number(profile.super_rate) || 0;
  const pf = Number(profile.pt_fraction) || 0;
  const ht = Number(profile.hecs_threshold) || 0;

  const ft = netFromPackage(pkg, sg, ht);
  const pt = netFromPackage(pkg * pf, sg, ht);

  const catMo = (id: string, year: number) => {
    const c = categories.find((c) => c.key === id);
    if (!c) return 0;
    return Number(year >= 2027 ? c.amount_2027 : c.amount_2026) || 0;
  };
  const catFN = (id: string, year: number) => catMo(id, year) * FN_FROM_MO;
  const expMo = (year: number) => categories.reduce((s, c) => s + catMo(c.key, year), 0);
  const expFN = (year: number) => expMo(year) * FN_FROM_MO;

  const dep5 = (Number(profile.house_target) || 0) * (Number(profile.deposit_pct) || 0);
  const netCash = dep5 + (Number(profile.buying_costs) || 0) - (Number(profile.fhog) || 0);

  return {
    netFTfn: ft.net / FN_PER_YEAR,
    netPTfn: pt.net / FN_PER_YEAR,
    netFTmo: ft.net / 12,
    cashFT: ft.cash,
    superFTfn: (pkg - ft.cash) / FN_PER_YEAR,
    dep5,
    netCash,
    catFN,
    expMo,
    expFN,
  };
}

export function plannedIncomeFN(period: Period, profile: Profile, D: DerivedFinancials): number {
  return isFT(period.key, profile.ft_start) ? D.netFTfn : D.netPTfn;
}

export interface PlanPathPoint {
  key: string;
  label: string;
  planDeposit: number;
}

export function buildPlanPath(profile: Profile, D: DerivedFinancials, periods: Period[]): PlanPathPoint[] {
  let emerg = 0;
  let dep = Number(profile.open_deposit) || 0;
  return periods.map((per, i) => {
    const income = plannedIncomeFN(per, profile, D);
    const avail0 = income - D.expFN(per.year) - (i === 0 ? Number(profile.cc_opening) || 0 : 0);
    const avail = Math.max(0, avail0);
    const toE = Math.max(0, Math.min(avail, (Number(profile.emergency_target) || 0) - emerg));
    emerg += toE;
    dep += avail - toE;
    return { key: per.key, label: dayLabel(per.start), planDeposit: Math.round(dep) };
  });
}

export interface NetWorthPoint {
  key: string;
  label: string;
  liquid: number; // emergency fund + house deposit (cash, no growth assumed)
  invested: number; // shares + super, compounding at the assumed rate
  netWorth: number; // liquid + invested - cc - hecs
}

/**
 * Projects net worth forward from today's real balances (not the plan baseline used by
 * `buildPlanPath`) — surplus each fortnight tops up the emergency fund then the deposit,
 * shares/super compound at `annualGrowthPct`, super also gets its usual employer
 * contribution. Credit card and HECS are held flat: a real repayment/indexation schedule for
 * either is out of scope here, so this stays a rough, informational estimate — not advice.
 */
export function buildNetWorthProjection(
  profile: Profile,
  D: DerivedFinancials,
  balances: Balances,
  periods: Period[],
  todayISO: string,
  annualGrowthPct: number,
  extraPerFortnight: number,
  horizonPeriods = 20
): NetWorthPoint[] {
  const startIdx = currentPeriod(periods, todayISO).idx;
  const periodGrowth = Math.pow(1 + annualGrowthPct / 100, 14 / 365) - 1;
  const emergencyTarget = Number(profile.emergency_target) || 0;

  let emergency = Number(balances.emergency) || 0;
  let deposit = Number(balances.anzplus) || 0;
  let shares = Number(balances.shares) || 0;
  let superb = Number(balances.superb) || 0;
  const cc = Number(balances.cc) || 0;
  const hecs = Number(balances.hecs) || 0;

  return periods.slice(startIdx, startIdx + horizonPeriods).map((per) => {
    const income = plannedIncomeFN(per, profile, D);
    const surplus = Math.max(0, income - D.expFN(per.year)) + extraPerFortnight;
    const toEmergency = Math.max(0, Math.min(surplus, emergencyTarget - emergency));
    emergency += toEmergency;
    deposit += surplus - toEmergency;
    shares *= 1 + periodGrowth;
    superb = superb * (1 + periodGrowth) + D.superFTfn;

    return {
      key: per.key,
      label: dayLabel(per.start),
      liquid: Math.round(emergency + deposit),
      invested: Math.round(shares + superb),
      netWorth: Math.round(emergency + deposit + shares + superb - cc - hecs),
    };
  });
}

/** First period label where the projection's net worth reaches zero or above, or null if it never does. */
export function netWorthPositiveAt(points: NetWorthPoint[]): string | null {
  return points.find((p) => p.netWorth >= 0)?.label ?? null;
}

/** Sums transaction amounts by period key, then by category key. */
export function loggedByCategory(transactions: Transaction[], anchor: string): Record<string, Record<string, number>> {
  const m: Record<string, Record<string, number>> = {};
  transactions.forEach((t) => {
    const k = periodKeyOf(t.date, anchor);
    if (!k) return;
    if (!m[k]) m[k] = {};
    m[k][t.category_key] = (m[k][t.category_key] || 0) + (Number(t.amount) || 0);
  });
  return m;
}

export interface CategoryReconRow {
  id: string;
  label: string;
  plan: number;
  logged: number;
  hasManual: boolean;
  actual: number | null;
  variance: number | null;
}

export function reconcileCategoryRows(
  categories: BudgetCategoryRow[],
  D: DerivedFinancials,
  year: number,
  loggedForPeriod: Record<string, number> | undefined,
  overrides: Record<string, string>
): CategoryReconRow[] {
  return categories.map((c) => {
    const plan = D.catFN(c.key, year);
    const logged = loggedForPeriod?.[c.key] || 0;
    const manual = overrides[c.key];
    const hasManual = manual !== undefined && manual !== "";
    const actual = hasManual ? Number(manual) : logged > 0 ? logged : null;
    return {
      id: c.key,
      label: c.label,
      plan,
      logged,
      hasManual,
      actual,
      variance: actual === null ? null : plan - actual,
    };
  });
}

export interface ReconcileSummary {
  planInc: number;
  actInc: number | null;
  totPlanExp: number;
  totActExp: number;
  anyActual: boolean;
  expVar: number;
  planSurplus: number;
  actSurplus: number;
  surplusVar: number;
}

export function summarizeReconciliation(
  planInc: number,
  reconciliation: Reconciliation | undefined,
  catRows: CategoryReconRow[]
): ReconcileSummary {
  const actInc = reconciliation?.actual_income ?? null;
  const totPlanExp = catRows.reduce((s, r) => s + r.plan, 0);
  const totActExp = catRows.reduce((s, r) => s + (r.actual ?? 0), 0);
  const anyActual = catRows.some((r) => r.actual !== null) || actInc !== null;
  const expVar = totPlanExp - totActExp;
  const planSurplus = planInc - totPlanExp;
  const actSurplus = (actInc ?? planInc) - totActExp;
  const surplusVar = actSurplus - planSurplus;
  return { planInc, actInc, totPlanExp, totActExp, anyActual, expVar, planSurplus, actSurplus, surplusVar };
}

export interface NetPosition {
  assets: number;
  liabilities: number;
  net: number;
}

export function netPosition(balances: Balances): NetPosition {
  const assets =
    balances.everyday + balances.anzplus + balances.emergency + balances.holiday + balances.shares + balances.superb;
  const liabilities = balances.cc + balances.hecs;
  return { assets, liabilities, net: assets - liabilities };
}

/** Accounts stored as "amount owing" — moving money here pays the balance down, not up. */
export const LIABILITY_ACCOUNTS = new Set<keyof Omit<Balances, "user_id">>(["cc", "hecs"]);

/**
 * The balance patch for moving `amount` from one tracked account to another — e.g. payday:
 * Everyday -> pay off Credit card, top up Emergency fund / ANZ Plus deposit. Funding a
 * liability account (cc/hecs) reduces what's owed rather than adding to it.
 */
export function applyTransfer(
  balances: Balances,
  from: keyof Omit<Balances, "user_id">,
  to: keyof Omit<Balances, "user_id">,
  amount: number
): Partial<Omit<Balances, "user_id">> {
  const toDelta = LIABILITY_ACCOUNTS.has(to) ? -amount : amount;
  return {
    [from]: balances[from] - amount,
    [to]: balances[to] + toDelta,
  };
}

/** Which tracked balance (if any) a transaction's account label maps to. "Fun money" and
 * "Cash" have no ledger balance in `Balances`, so expenses logged against them don't move one. */
export const ACCOUNT_BALANCE_KEY: Partial<Record<Account, keyof Omit<Balances, "user_id">>> = {
  Everyday: "everyday",
  "ANZ Plus": "anzplus",
  "Credit card": "cc",
  Holiday: "holiday",
};

/**
 * Balance patch for logging an expense against a tracked account, or reversing one on
 * delete/undo via `sign: -1`. Spending from an asset account reduces it; spending on the
 * credit card increases what's owed. Returns null when the account isn't tracked.
 */
export function applyExpenseToBalance(
  balances: Balances,
  account: string,
  amount: number,
  sign: 1 | -1 = 1
): Partial<Omit<Balances, "user_id">> | null {
  const key = ACCOUNT_BALANCE_KEY[account as Account];
  if (!key) return null;
  const delta = sign * amount * (LIABILITY_ACCOUNTS.has(key) ? 1 : -1);
  return { [key]: balances[key] + delta };
}

/** Balance patch for landing confirmed pay in the everyday account, or reversing it via `sign: -1`. */
export function applyIncomeToBalance(balances: Balances, amount: number, sign: 1 | -1 = 1): Partial<Omit<Balances, "user_id">> {
  return { everyday: balances.everyday + sign * amount };
}

export interface HoldingPL {
  avgCost: number | null;
  costBasis: number;
  marketValue: number | null;
  unrealizedPL: number | null;
  unrealizedPLPct: number | null;
}

/**
 * Average-cost (DCA) basis and unrealized P/L for one holding, from its logged buy lots.
 * Only buys are tracked — this blends to a simple average cost, not a CGT-parcel (FIFO)
 * method, and applies that average to whatever `shares` currently holds. Not tax advice.
 */
export function computeHoldingPL(lots: HoldingLot[], code: string, shares: number, currentPrice: number | null): HoldingPL {
  const codeLots = lots.filter((l) => l.code === code);
  const totalLotShares = codeLots.reduce((s, l) => s + l.shares, 0);
  const totalCost = codeLots.reduce((s, l) => s + l.shares * l.price, 0);
  const avgCost = totalLotShares > 0 ? totalCost / totalLotShares : null;
  const costBasis = avgCost != null ? avgCost * shares : 0;
  const marketValue = currentPrice != null ? currentPrice * shares : null;
  const unrealizedPL = avgCost != null && marketValue != null ? marketValue - costBasis : null;
  const unrealizedPLPct = avgCost != null && avgCost > 0 && currentPrice != null ? (currentPrice / avgCost - 1) * 100 : null;
  return { avgCost, costBasis, marketValue, unrealizedPL, unrealizedPLPct };
}

export interface PieSlice {
  name: string;
  value: number;
}

export function buildPieData(categories: BudgetCategoryRow[], D: DerivedFinancials, year: number): PieSlice[] {
  return categories.map((c) => ({ name: c.label, value: D.catFN(c.key, year) })).filter((d) => d.value > 0);
}

export interface YtdTotals {
  gross: number;
  paygwTax: number;
  super: number;
  net: number;
}

export interface SpendTrendPoint {
  key: string;
  label: string;
  planned: number;
  actual: number | null; // null when the period has no logged transactions or manual overrides yet
}

/** Plan-vs-actual total expenses for the trailing `windowSize` periods up to today, for spotting drift over time. */
export function buildSpendTrend(
  periods: Period[],
  categories: BudgetCategoryRow[],
  D: DerivedFinancials,
  loggedByCat: Record<string, Record<string, number>>,
  reconciliations: Record<string, Reconciliation>,
  todayISO: string,
  windowSize = 8
): SpendTrendPoint[] {
  const curIdx = currentPeriod(periods, todayISO).idx;
  const start = Math.max(0, curIdx - windowSize + 1);
  return periods.slice(start, curIdx + 1).map((p) => {
    const rows = reconcileCategoryRows(categories, D, p.year, loggedByCat[p.key], reconciliations[p.key]?.actual_overrides ?? {});
    const planned = rows.reduce((s, r) => s + r.plan, 0);
    const anyActual = rows.some((r) => r.actual !== null);
    const actual = anyActual ? rows.reduce((s, r) => s + (r.actual ?? 0), 0) : null;
    return { key: p.key, label: dayLabel(p.start), planned, actual };
  });
}

export interface BorrowingCapacityPoint {
  year: number;
  income: number;
  capLow: number;
  capHigh: number;
  loanNeeded: number;
}

/** Rough serviceability multiples (of household cash income) used for the baseline figures in the spec. */
export const BORROW_MULT_LOW = 5.6;
export const BORROW_MULT_HIGH = 6.6;

/**
 * A rule-of-thumb borrowing-capacity projection — not lender pre-approval. Household income
 * is this person's cash salary (FT) plus any partner income, compounding at `income_growth_pct`
 * per year; capacity is that income times a low/high multiple, compared against the loan still
 * needed to hit the house target after the 5% deposit.
 */
export function buildBorrowingCapacity(
  profile: Profile,
  D: DerivedFinancials,
  startYear: number,
  horizonYears = 8
): BorrowingCapacityPoint[] {
  const income0 = D.cashFT + (Number(profile.partner_income) || 0);
  const growth = 1 + (Number(profile.income_growth_pct) || 0) / 100;
  const loanNeeded = Math.max(0, (Number(profile.house_target) || 0) - D.dep5);
  return Array.from({ length: horizonYears }, (_, i) => {
    const income = income0 * Math.pow(growth, i);
    return { year: startYear + i, income, capLow: income * BORROW_MULT_LOW, capHigh: income * BORROW_MULT_HIGH, loanNeeded };
  });
}

/** First year the low-end capacity estimate covers the loan needed, or null if it never does within the projection. */
export function borrowingCapacityYearReached(points: BorrowingCapacityPoint[]): number | null {
  const hit = points.find((p) => p.capLow >= p.loanNeeded);
  return hit ? hit.year : null;
}

/** Sums confirmed payslips whose period_start falls within the AU financial year starting fyStartISO. */
export function sumYTD(payslips: Payslip[], fyStartISO: string): YtdTotals {
  return payslips
    .filter((p) => p.status === "confirmed" && p.period_start && p.period_start >= fyStartISO)
    .reduce(
      (acc, p) => ({
        gross: acc.gross + (p.gross || 0),
        paygwTax: acc.paygwTax + (p.paygw_tax || 0),
        super: acc.super + (p.super || 0),
        net: acc.net + (p.net || 0),
      }),
      { gross: 0, paygwTax: 0, super: 0, net: 0 }
    );
}
