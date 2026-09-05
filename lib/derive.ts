// Cross-tab derived data — ported from the `D`, `PLAN_PATH`, `loggedByCat`, `catRows` memos
// in FinancialPlanTracker.jsx. Pure functions so the same math is reusable and testable
// independent of React / Supabase.

import { dayLabel, dateFromISO, isoFromDate, currentPeriod, financialYearStart, isFT, periodKeyOf, periodLabel, type Period } from "./period";
import { netFromPackage, hecsCompulsoryRepayment, incomeTaxAU, litoAU, FN_PER_YEAR, FN_FROM_MO } from "./tax";
import { OTHER_CATEGORY_KEY } from "./categories";
export { hecsCompulsoryRepayment } from "./tax";
import { BALANCE_FIELDS } from "./theme";
import type { Account } from "./theme";
import type {
  BudgetCategoryRow,
  Profile,
  Transaction,
  Reconciliation,
  Balances,
  Payslip,
  HoldingLot,
  RecurringFrequency,
  RecurringExpense,
  MiscIncome,
  Goal,
  Snapshot,
  AllocationOrder,
  SuperContribution,
  Transfer,
} from "./types";

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

  const ft = netFromPackage(pkg, sg);
  const pt = netFromPackage(pkg * pf, sg);

  // Fortnightly is the canonical unit here — a weekly figure converts to it exactly (× 2, since
  // a fortnight is always 2 weeks), while a monthly one only converts approximately (annualize
  // then divide by 26, since months don't divide evenly into fortnights). `expMo` (the Budget
  // tab's "Total / mo" row) is derived the other way around from that fortnightly total, so it
  // stays consistent regardless of which unit any given category was actually entered in.
  const catFN = (id: string, year: number) => {
    const c = categories.find((c) => c.key === id);
    if (!c) return 0;
    const raw = Number(year >= 2027 ? c.amount_2027 : c.amount_2026) || 0;
    return c.frequency === "weekly" ? raw * 2 : raw * FN_FROM_MO;
  };
  const expFN = (year: number) => categories.reduce((s, c) => s + catFN(c.key, year), 0);
  const expMo = (year: number) => expFN(year) / FN_FROM_MO;

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

export interface SalaryScenario {
  id: string;
  label: string;
  /** Multiplier on the FT/PT-adjusted package at period index `i` (0 = the current period). */
  multiplierAt: (i: number) => number;
}

/**
 * "Standard progression" compounds at roughly the early-career rate typical of AU graduate
 * accountants moving toward intermediate/senior level (SEEK/Hays-range salary guides put that
 * around $56k–$67k graduate to $75k–$95k by year 3–5), then settles to a rate closer to
 * general wage growth once that step-up has played out. A rough guide, not a guarantee.
 */
export const SALARY_SCENARIOS: SalaryScenario[] = [
  { id: "flat", label: "No raises", multiplierAt: () => 1 },
  {
    id: "standard",
    label: "Standard accountant progression",
    multiplierAt: (i) => {
      const years = (i * 14) / 365;
      const earlyYears = Math.min(years, 5);
      const laterYears = Math.max(0, years - 5);
      return Math.pow(1.09, earlyYears) * Math.pow(1.035, laterYears);
    },
  },
];

export interface NetWorthPoint {
  key: string;
  label: string;
  liquid: number; // emergency fund + house deposit (cash, no growth assumed)
  invested: number; // shares + super, compounding at the assumed rate
  netWorth: number; // liquid + invested - cc - hecs
}

/**
 * Projects net worth forward from today's real balances (not the plan baseline used by
 * `buildPlanPath`) under a given salary-growth `scenario`. Each period: the package grows per
 * the scenario, net pay is recomputed from that grown package (so tax/HECS withholding scale
 * with it too), surplus pays down the credit card, then tops up the emergency fund, then funds
 * `goals` in priority order, then whatever's left goes to the deposit — same priority order as
 * `buildFortnightSplit`'s fortnight-by-fortnight waterfall, so the two projections agree —
 * shares/super compound at `annualGrowthPct` (super also keeps its usual employer contribution),
 * and HECS reduces by the compulsory repayment on the grown income while indexing at
 * `hecsIndexationPct`. A rough guide, not advice.
 */
export function buildNetWorthProjection(
  profile: Profile,
  D: DerivedFinancials,
  balances: Balances,
  goals: Goal[],
  periods: Period[],
  todayISO: string,
  annualGrowthPct: number,
  extraPerFortnight: number,
  scenario: SalaryScenario,
  hecsIndexationPct: number,
  horizonPeriods = 20
): NetWorthPoint[] {
  const startIdx = currentPeriod(periods, todayISO).idx;
  const periodGrowth = Math.pow(1 + annualGrowthPct / 100, 14 / 365) - 1;
  const hecsPeriodIndexation = Math.pow(1 + hecsIndexationPct / 100, 14 / 365) - 1;
  const emergencyTarget = Number(profile.emergency_target) || 0;
  const superRate = Number(profile.super_rate) || 0;
  const basePackage = Number(profile.package) || 0;
  const ptFraction = Number(profile.pt_fraction) || 0;

  let emergency = Number(balances.emergency) || 0;
  let deposit = Number(balances.anzplus) || 0;
  let shares = Number(balances.shares) || 0;
  let superb = Number(balances.superb) || 0;
  let cc = Number(balances.cc) || 0;
  let hecs = Number(balances.hecs) || 0;
  const goalBalances = new Map<string, number>(goals.map((g) => [g.id, Number(g.current_amount) || 0]));
  const otherBalances = new Map<string, number>(EXTRA_BALANCE_DESTINATIONS.map((d) => [d.id as string, Number(balances[d.id]) || 0]));
  const allocationOrder = resolveAllocationOrder(profile.allocation_order, goals);

  return periods.slice(startIdx, startIdx + horizonPeriods).map((per, i) => {
    const grownPackage = (isFT(per.key, profile.ft_start) ? basePackage : basePackage * ptFraction) * scenario.multiplierAt(i);
    const { cash, net } = netFromPackage(grownPackage, superRate);
    const incomeFn = net / FN_PER_YEAR;
    const superFn = (grownPackage - cash) / FN_PER_YEAR;

    let surplus = Math.max(0, incomeFn - D.expFN(per.year)) + extraPerFortnight;
    const toCC = Math.max(0, Math.min(surplus, cc));
    surplus -= toCC;
    cc = Math.max(0, cc - toCC);

    const goalRemaining = new Map(goals.map((g) => [g.id, Math.max(0, Number(g.target_amount) - (goalBalances.get(g.id) ?? 0))]));
    const { toEmergency, toDeposit, goalAmounts, otherAmounts } = applyAllocationOrder(surplus, allocationOrder, Math.max(0, emergencyTarget - emergency), goalRemaining);
    emergency += toEmergency;
    goals.forEach((g) => goalBalances.set(g.id, (goalBalances.get(g.id) ?? 0) + (goalAmounts.get(g.id) ?? 0)));
    EXTRA_BALANCE_DESTINATIONS.forEach((d) => otherBalances.set(d.id as string, (otherBalances.get(d.id as string) ?? 0) + (otherAmounts.get(d.id as string) ?? 0)));
    deposit += toDeposit;
    shares *= 1 + periodGrowth;
    superb = superb * (1 + periodGrowth) + superFn;

    const hecsRepaymentFn = hecsCompulsoryRepayment(cash) / FN_PER_YEAR;
    hecs = Math.max(0, hecs * (1 + hecsPeriodIndexation) - hecsRepaymentFn);

    const goalsTotal = Array.from(goalBalances.values()).reduce((s, v) => s + v, 0);
    const otherTotal = Array.from(otherBalances.values()).reduce((s, v) => s + v, 0);
    return {
      key: per.key,
      label: dayLabel(per.start),
      liquid: Math.round(emergency + deposit + goalsTotal + otherTotal),
      invested: Math.round(shares + superb),
      netWorth: Math.round(emergency + deposit + goalsTotal + otherTotal + shares + superb - cc - hecs),
    };
  });
}

/** First period label where the projection's net worth reaches zero or above, or null if it never does. */
export function netWorthPositiveAt(points: NetWorthPoint[]): string | null {
  return points.find((p) => p.netWorth >= 0)?.label ?? null;
}

export interface BalanceHistoryPoint {
  key: string;
  label: string;
  deposit: number;
  emergency: number;
  creditCard: number;
  hecs: number;
}

/**
 * Every "Snapshot" taken on Accounts, reshaped for charting in period order — the only history
 * this app captures of the credit card and HECS balances (both otherwise only ever visible as a
 * single current number), alongside the deposit/emergency history the Overview chart already uses.
 */
export function buildBalanceHistory(snapshots: Snapshot[], periods: Period[]): BalanceHistoryPoint[] {
  return snapshots
    .slice()
    .sort((a, b) => a.period_key.localeCompare(b.period_key))
    .map((s) => {
      const per = periods.find((p) => p.key === s.period_key);
      return {
        key: s.period_key,
        label: per ? dayLabel(per.start) : s.period_key.slice(5),
        deposit: Number(s.deposit) || 0,
        emergency: Number(s.emergency) || 0,
        creditCard: Number(s.cc) || 0,
        hecs: Number(s.hecs) || 0,
      };
    });
}

export interface PeriodTotal {
  key: string;
  total: number;
}

/** Total logged spend per period, from `loggedByCategory`'s output. */
export function periodTotals(loggedByCat: Record<string, Record<string, number>>): PeriodTotal[] {
  return Object.entries(loggedByCat).map(([key, cats]) => ({
    key,
    total: Object.values(cats).reduce((s, v) => s + v, 0),
  }));
}

/** Average total spend per period, over periods that have at least one logged transaction. */
export function averageSpend(totals: PeriodTotal[]): number {
  if (totals.length === 0) return 0;
  return totals.reduce((s, t) => s + t.total, 0) / totals.length;
}

export interface ActualSpendPoint {
  key: string;
  label: string;
  total: number;
}

/** Actual logged spend per period (no plan comparison) for the trailing `windowSize` periods up to today. */
export function buildActualSpendTrend(
  periods: Period[],
  loggedByCat: Record<string, Record<string, number>>,
  todayISO: string,
  windowSize = 8
): ActualSpendPoint[] {
  const curIdx = currentPeriod(periods, todayISO).idx;
  const start = Math.max(0, curIdx - windowSize + 1);
  return periods.slice(start, curIdx + 1).map((p) => ({
    key: p.key,
    label: dayLabel(p.start),
    total: Object.values(loggedByCat[p.key] || {}).reduce((s, v) => s + v, 0),
  }));
}

/** Sums transaction amounts by period key, then by category key. */
export function loggedByCategory(transactions: Transaction[], anchor: string): Record<string, Record<string, number>> {
  const m: Record<string, Record<string, number>> = {};
  transactions.forEach((t) => {
    const k = periodKeyOf(t.date, anchor);
    if (!k) return;
    if (!m[k]) m[k] = {};
    // Round to the cent on every add — plain float summation drifts (e.g. 14.90+6+16.06
    // renders as "36.959999999999994" in a number input, which reads as a data-entry error).
    m[k][t.category_key] = Math.round(((m[k][t.category_key] || 0) + (Number(t.amount) || 0)) * 100) / 100;
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
  const rows = categories.map((c) => {
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

  // "Other" isn't a real budget row (no planned amount), but real money gets logged against
  // it on Expenses — without this it's invisible everywhere that sums these rows (Reconcile's
  // ledger, the variance report, Overview's plan-vs-actual chart). Only show it once there's
  // actually something logged, so untouched periods don't grow an empty extra line.
  //
  // Also catches spend logged against a category that's since been deleted on Budget — the
  // transaction itself is untouched, but without this it silently drops out of every report
  // that sums these rows (it's still real money spent, just no longer reachable via `categories`).
  const knownKeys = new Set(categories.map((c) => c.key));
  const orphanedLogged = Object.entries(loggedForPeriod || {})
    .filter(([key]) => key !== OTHER_CATEGORY_KEY && !knownKeys.has(key))
    .reduce((s, [, v]) => s + v, 0);
  const otherLogged = (loggedForPeriod?.[OTHER_CATEGORY_KEY] || 0) + orphanedLogged;
  const otherManual = overrides[OTHER_CATEGORY_KEY];
  const otherHasManual = otherManual !== undefined && otherManual !== "";
  if (otherLogged > 0 || otherHasManual) {
    const actual = otherHasManual ? Number(otherManual) : otherLogged;
    rows.push({ id: OTHER_CATEGORY_KEY, label: "Other", plan: 0, logged: otherLogged, hasManual: otherHasManual, actual, variance: -actual });
  }

  return rows;
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

export interface VarianceReportRow {
  id: string;
  label: string;
  plannedTotal: number;
  actualTotal: number;
  variance: number; // plannedTotal - actualTotal — positive means under budget (favorable)
}

export interface VarianceReport {
  rows: VarianceReportRow[];
  periodsIncluded: number;
  totalPlannedIncome: number;
  totalActualIncome: number;
  incomeVariance: number; // actual - planned — positive means earned more than planned
  totalPlannedExpenses: number;
  totalActualExpenses: number;
  totalExpenseVariance: number; // planned - actual — positive means spent less than planned
  totalPlannedSurplus: number;
  totalActualSurplus: number;
  surplusVariance: number; // actual - planned — positive means banked more than planned
}

/**
 * Aggregates plan-vs-actual across every fortnight that's had anything reconciled (a logged
 * expense, a manual override, or a confirmed income figure) — same row-level rules as
 * `reconcileCategoryRows`/`summarizeReconciliation`, just summed across periods instead of
 * shown one at a time.
 */
export function buildVarianceReport(
  profile: Profile,
  categories: BudgetCategoryRow[],
  D: DerivedFinancials,
  periods: Period[],
  loggedByCat: Record<string, Record<string, number>>,
  reconciliations: Record<string, Reconciliation>
): VarianceReport {
  const rowAcc = new Map<string, { label: string; plannedTotal: number; actualTotal: number }>();
  categories.forEach((c) => rowAcc.set(c.key, { label: c.label, plannedTotal: 0, actualTotal: 0 }));

  let periodsIncluded = 0;
  let totalPlannedIncome = 0;
  let totalActualIncome = 0;

  periods.forEach((per) => {
    const rec = reconciliations[per.key];
    const catRows = reconcileCategoryRows(categories, D, per.year, loggedByCat[per.key], rec?.actual_overrides ?? {});
    const anyActual = catRows.some((r) => r.actual !== null) || (rec?.actual_income ?? null) !== null;
    if (!anyActual) return;

    periodsIncluded++;
    const planInc = plannedIncomeFN(per, profile, D);
    totalPlannedIncome += planInc;
    totalActualIncome += rec?.actual_income ?? planInc;

    catRows.forEach((r) => {
      // Categories are pre-seeded above; "Other" isn't a real budget row, so it only appears
      // here once a period has actually logged something against it — add it on demand.
      const acc = rowAcc.get(r.id) ?? rowAcc.set(r.id, { label: r.label, plannedTotal: 0, actualTotal: 0 }).get(r.id)!;
      acc.plannedTotal += r.plan;
      acc.actualTotal += r.actual ?? 0;
    });
  });

  const rows: VarianceReportRow[] = Array.from(rowAcc.entries()).map(([id, v]) => ({
    id,
    label: v.label,
    plannedTotal: v.plannedTotal,
    actualTotal: v.actualTotal,
    variance: v.plannedTotal - v.actualTotal,
  }));

  const totalPlannedExpenses = rows.reduce((s, r) => s + r.plannedTotal, 0);
  const totalActualExpenses = rows.reduce((s, r) => s + r.actualTotal, 0);
  const totalPlannedSurplus = totalPlannedIncome - totalPlannedExpenses;
  const totalActualSurplus = totalActualIncome - totalActualExpenses;

  return {
    rows,
    periodsIncluded,
    totalPlannedIncome,
    totalActualIncome,
    incomeVariance: totalActualIncome - totalPlannedIncome,
    totalPlannedExpenses,
    totalActualExpenses,
    totalExpenseVariance: totalPlannedExpenses - totalActualExpenses,
    totalPlannedSurplus,
    totalActualSurplus,
    surplusVariance: totalActualSurplus - totalPlannedSurplus,
  };
}

export interface VarianceInsight {
  id: string;
  label: string;
  favorable: boolean; // true = under budget streak, false = over budget streak
  streakLength: number;
  message: string;
}

/**
 * Finds categories on a current run of consecutive over- or under-budget fortnights (at least
 * `minStreak` in a row, ending at the most recently reconciled period), so a pattern is
 * surfaced instead of buried in the summed variance-report totals. Only counts periods where
 * that category actually had real data (a logged expense or manual override) — a fortnight
 * with nothing touched isn't a data point either way.
 */
export function buildVarianceInsights(
  categories: BudgetCategoryRow[],
  D: DerivedFinancials,
  periods: Period[],
  loggedByCat: Record<string, Record<string, number>>,
  reconciliations: Record<string, Reconciliation>,
  minStreak = 3
): VarianceInsight[] {
  const history = new Map<string, boolean[]>(); // true = that period was over budget
  categories.forEach((c) => history.set(c.key, []));

  periods.forEach((per) => {
    const rec = reconciliations[per.key];
    const catRows = reconcileCategoryRows(categories, D, per.year, loggedByCat[per.key], rec?.actual_overrides ?? {});
    catRows.forEach((r) => {
      if (r.actual === null) return;
      history.get(r.id)?.push(r.actual > r.plan);
    });
  });

  const insights: VarianceInsight[] = [];
  history.forEach((flags, id) => {
    if (flags.length === 0) return;
    const last = flags[flags.length - 1];
    let streak = 1;
    for (let i = flags.length - 2; i >= 0 && flags[i] === last; i--) streak++;
    if (streak < minStreak) return;
    const label = categories.find((c) => c.key === id)?.label ?? id;
    insights.push({
      id,
      label,
      favorable: !last,
      streakLength: streak,
      message: last
        ? `${label} has run over budget ${streak} fortnights running.`
        : `${label} has come in under budget ${streak} fortnights running.`,
    });
  });

  return insights.sort((a, b) => b.streakLength - a.streakLength);
}

export interface AdaptiveCategoryRate {
  id: string;
  label: string;
  planRate: number;
  effectiveRate: number;
  adaptive: boolean; // true when effectiveRate differs from planRate (a streak was found)
  streakLength: number;
}

/**
 * Per-category $/fortnight to use in forward projections: the planned Budget-tab amount, unless
 * that category is on a current 3+ fortnight streak of consistently running over or under that
 * plan (the exact same streak `buildVarianceInsights` flags on Reconcile) — in which case use the
 * average actual spend from that streak instead, so projections react to real recent behavior
 * rather than a plan that's evidently stopped matching reality. Only applies to `year` (normally
 * the current year); other years fall back to the plan since there's no actual data for them yet.
 */
export function adaptiveCategoryRates(
  categories: BudgetCategoryRow[],
  D: DerivedFinancials,
  year: number,
  periods: Period[],
  loggedByCat: Record<string, Record<string, number>>,
  reconciliations: Record<string, Reconciliation>,
  minStreak = 3
): AdaptiveCategoryRate[] {
  const history = new Map<string, { actual: number; overBudget: boolean }[]>();
  categories.forEach((c) => history.set(c.key, []));

  periods.forEach((per) => {
    const rec = reconciliations[per.key];
    const catRows = reconcileCategoryRows(categories, D, per.year, loggedByCat[per.key], rec?.actual_overrides ?? {});
    catRows.forEach((r) => {
      if (r.actual === null) return;
      history.get(r.id)?.push({ actual: r.actual, overBudget: r.actual > r.plan });
    });
  });

  return categories.map((c) => {
    const planRate = D.catFN(c.key, year);
    const flags = history.get(c.key) ?? [];
    if (flags.length === 0) return { id: c.key, label: c.label, planRate, effectiveRate: planRate, adaptive: false, streakLength: 0 };
    const last = flags[flags.length - 1].overBudget;
    let streak = 1;
    for (let i = flags.length - 2; i >= 0 && flags[i].overBudget === last; i--) streak++;
    if (streak < minStreak) return { id: c.key, label: c.label, planRate, effectiveRate: planRate, adaptive: false, streakLength: streak };
    const streakSlice = flags.slice(flags.length - streak);
    const effectiveRate = streakSlice.reduce((s, f) => s + f.actual, 0) / streakSlice.length;
    return { id: c.key, label: c.label, planRate, effectiveRate, adaptive: true, streakLength: streak };
  });
}

/** Total per-fortnight expense rate across every category's adaptive (or planned) rate — see `adaptiveCategoryRates`. */
export function adaptiveExpenseTotal(rates: AdaptiveCategoryRate[]): number {
  return rates.reduce((s, r) => s + r.effectiveRate, 0);
}

/**
 * Wraps `D` so its `expFN` returns `adaptiveTotal` for `year` (leaving every other year and every
 * other field untouched) — lets `buildFortnightSplit`/`buildNetWorthProjection` react to real
 * recent spending without changing their signatures or the editable Budget-tab plan itself.
 */
export function withAdaptiveExpenses(D: DerivedFinancials, year: number, adaptiveTotal: number): DerivedFinancials {
  return { ...D, expFN: (y: number) => (y === year ? adaptiveTotal : D.expFN(y)) };
}

export interface NetPosition {
  assets: number;
  liabilities: number;
  net: number;
}

/** `goalsTotal` — sum of every custom goal's `current_amount` (see `Goal`); it's real money set
 * aside outside the tracked balance fields, so it counts as an asset here same as any other. */
export function netPosition(balances: Balances, goalsTotal = 0): NetPosition {
  const assets =
    balances.everyday + balances.anzplus + balances.emergency + balances.holiday + balances.shares + balances.superb + goalsTotal;
  const liabilities = balances.cc + balances.hecs;
  return { assets, liabilities, net: assets - liabilities };
}

/** Custom goals in the order they should be funded from fortnightly surplus — lower `priority` first, ties broken by creation order. */
export function sortGoalsByPriority(goals: Goal[]): Goal[] {
  return goals.slice().sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
}

/** "emergency" and "deposit" are the two built-in destinations; anything else is a goal id. */
export const EMERGENCY_ALLOCATION_ID = "emergency";
export const DEPOSIT_ALLOCATION_ID = "deposit";

/**
 * The order to use when the profile has no custom `allocation_order`: emergency fund, then every
 * goal in its own existing priority order, then the house deposit — exactly what `fortnightBreakdown`
 * / `buildFortnightSplit` / `buildNetWorthProjection` did before this was configurable, so nobody's
 * numbers change until they actually customize it.
 */
function defaultAllocationOrder(goals: Goal[]): AllocationOrder {
  return [[{ id: EMERGENCY_ALLOCATION_ID, weightPct: 100 }], ...sortGoalsByPriority(goals).map((g) => [{ id: g.id, weightPct: 100 }]), [{ id: DEPOSIT_ALLOCATION_ID, weightPct: 100 }]];
}

/**
 * Normalizes a stored (possibly customized) order against the *current* set of goals: any goal
 * not already somewhere in the order (new since it was last saved) is inserted as its own tier
 * right before wherever "deposit" sits (or at the end, if deposit isn't in there for some
 * reason) — so a newly-added goal starts getting funded instead of silently sitting at 0
 * priority forever. Stale ids for since-deleted goals are left in place but harmless: they
 * resolve to 0 capacity in `applyAllocationOrder` and are simply skipped.
 */
export function resolveAllocationOrder(stored: AllocationOrder | null | undefined, goals: Goal[]): AllocationOrder {
  if (!stored || stored.length === 0) return defaultAllocationOrder(goals);
  const seen = new Set(stored.flat().map((t) => t.id));
  const missing = goals.filter((g) => !seen.has(g.id));
  if (missing.length === 0) return stored;
  const depositIdx = stored.findIndex((tier) => tier.some((t) => t.id === DEPOSIT_ALLOCATION_ID));
  const insertAt = depositIdx === -1 ? stored.length : depositIdx;
  const newTiers = missing.map((g) => [{ id: g.id, weightPct: 100 }]);
  return [...stored.slice(0, insertAt), ...newTiers, ...stored.slice(insertAt)];
}

/**
 * Tracked balances (beyond Emergency fund and the house deposit) that can be added directly to
 * the pay-priority order as their own uncapped destination — e.g. "put 20% of surplus toward
 * Holiday". Deliberately excludes Shares and Super: those already grow via a separate investment
 * -return/employer-contribution model in the projections, and folding surplus allocation into
 * that too is a bigger design question than this list is meant to solve.
 */
export const EXTRA_BALANCE_DESTINATIONS: { id: keyof Omit<Balances, "user_id">; label: string }[] = BALANCE_FIELDS.filter(([key]) => key === "holiday").map(([id, label]) => ({ id, label }));

const EXTRA_BALANCE_IDS = new Set(EXTRA_BALANCE_DESTINATIONS.map((d) => d.id as string));

interface AllocationDestination {
  id: string;
  weight: number;
  /** Remaining room before this destination is "full" — Infinity for the deposit, which has no cap. */
  capacity: number;
}

/**
 * Splits `amount` across `items` proportionally by weight, redistributing any item's capped-out
 * leftover to the others in the same tier (repeatedly, since redistributing can itself cap out
 * another item) before reporting what's left over for the next tier. A single-item tier is just
 * "give it min(amount, capacity)" — the general case collapses to that correctly.
 */
export function allocateTier(amount: number, items: AllocationDestination[]): { allocations: Record<string, number>; leftover: number } {
  const pool = items.map((i) => ({ ...i, filled: 0 }));
  let remaining = Math.max(0, amount);
  for (let guard = 0; guard < pool.length + 1 && remaining > 1e-9; guard++) {
    const active = pool.filter((p) => p.capacity - p.filled > 1e-9 && p.weight > 0);
    if (active.length === 0) break;
    const totalWeight = active.reduce((s, p) => s + p.weight, 0);
    let anyCapped = false;
    for (const p of active) {
      const share = remaining * (p.weight / totalWeight);
      const room = p.capacity - p.filled;
      if (share >= room - 1e-9) {
        remaining -= room;
        p.filled += room;
        anyCapped = true;
      }
    }
    if (!anyCapped) {
      active.forEach((p) => (p.filled += remaining * (p.weight / totalWeight)));
      remaining = 0;
    }
  }
  const allocations = Object.fromEntries(pool.map((p) => [p.id, p.filled]));
  return { allocations, leftover: Math.max(0, remaining) };
}

export interface AllocationRunResult {
  toEmergency: number;
  toDeposit: number;
  /** Keyed by goal id — only goals that actually received something (or exist in the order) appear here. */
  goalAmounts: Map<string, number>;
  /** Keyed by balance key (e.g. "holiday") — see `EXTRA_BALANCE_DESTINATIONS`. */
  otherAmounts: Map<string, number>;
}

/**
 * Walks `order` tier by tier, splitting `surplus` across each tier's destinations (see
 * `allocateTier`) and carrying whatever's left to the next tier. Shared by `fortnightBreakdown`,
 * `buildFortnightSplit`, and `buildNetWorthProjection` so all three price a custom pay-priority
 * order identically — credit card paydown isn't part of this; it's a fixed first step each of
 * those three applies before calling this.
 */
export function applyAllocationOrder(surplus: number, order: AllocationOrder, emergencyRemaining: number, goalRemaining: Map<string, number>): AllocationRunResult {
  let toEmergency = 0;
  let toDeposit = 0;
  const goalAmounts = new Map<string, number>();
  const otherAmounts = new Map<string, number>();
  let remaining = Math.max(0, surplus);

  for (const tier of order) {
    if (remaining <= 1e-9) break;
    const items: AllocationDestination[] = tier.map((t) => ({
      id: t.id,
      weight: t.weightPct,
      capacity: t.id === DEPOSIT_ALLOCATION_ID || EXTRA_BALANCE_IDS.has(t.id) ? Infinity : t.id === EMERGENCY_ALLOCATION_ID ? Math.max(0, emergencyRemaining) : Math.max(0, goalRemaining.get(t.id) ?? 0),
    }));
    const { allocations, leftover } = allocateTier(remaining, items);
    for (const [id, amt] of Object.entries(allocations)) {
      if (amt <= 0) continue;
      if (id === EMERGENCY_ALLOCATION_ID) toEmergency += amt;
      else if (id === DEPOSIT_ALLOCATION_ID) toDeposit += amt;
      else if (EXTRA_BALANCE_IDS.has(id)) otherAmounts.set(id, (otherAmounts.get(id) ?? 0) + amt);
      else goalAmounts.set(id, (goalAmounts.get(id) ?? 0) + amt);
    }
    remaining = leftover;
  }
  // Safety net: if "deposit" was somehow missing from the order (shouldn't happen —
  // resolveAllocationOrder always includes it), don't let leftover surplus vanish.
  toDeposit += remaining;
  return { toEmergency, toDeposit, goalAmounts, otherAmounts };
}

/** Accounts stored as "amount owing" — moving money here pays the balance down, not up. */
export const LIABILITY_ACCOUNTS = new Set<keyof Omit<Balances, "user_id">>(["cc", "hecs"]);

/** Rounds a balance to the cent — plain float addition/subtraction drifts (e.g. 500.61 + 10
 * lands on 510.60999999999996), which then persists to the DB and renders as a garbled figure. */
export const roundCents = (n: number) => Math.round(n * 100) / 100;

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
    [from]: roundCents(balances[from] - amount),
    [to]: roundCents(balances[to] + toDelta),
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
  return { [key]: roundCents(balances[key] + delta) };
}

/** Balance patch for landing confirmed pay in the everyday account, or reversing it via `sign: -1`. */
export function applyIncomeToBalance(balances: Balances, amount: number, sign: 1 | -1 = 1): Partial<Omit<Balances, "user_id">> {
  return { everyday: roundCents(balances.everyday + sign * amount) };
}

/**
 * Balance patch for landing income (e.g. misc income) in a chosen account, or reversing it via
 * `sign: -1`. Landing it in a liability account (cc/hecs) pays that down instead of adding to
 * it — same convention `applyTransfer`'s "to" side uses.
 */
export function applyIncomeToAccount(
  balances: Balances,
  account: keyof Omit<Balances, "user_id">,
  amount: number,
  sign: 1 | -1 = 1
): Partial<Omit<Balances, "user_id">> {
  const delta = sign * amount * (LIABILITY_ACCOUNTS.has(account) ? -1 : 1);
  return { [account]: roundCents(balances[account] + delta) };
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
  isCurrent: boolean; // the in-progress fortnight — its "actual" is partial, not comparable as favourable/unfavourable yet
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
    return { key: p.key, label: dayLabel(p.start), planned, actual, isCurrent: p.idx === curIdx };
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

/** Sums misc income (tax refunds, gifts, side gigs, etc) whose date falls within the AU financial year starting fyStartISO. */
export function sumMiscIncomeYTD(miscIncome: MiscIncome[], fyStartISO: string): number {
  return miscIncome.filter((m) => m.date >= fyStartISO).reduce((s, m) => s + (Number(m.amount) || 0), 0);
}

/**
 * A fortnight's actual income for Reconcile: every confirmed payslip's net plus every misc
 * income entry landing in that period, added together rather than one overwriting the other —
 * the same rule multiple payslips already follow (e.g. a second casual job's pay).
 */
export function actualIncomeForPeriod(payslips: Payslip[], miscIncome: MiscIncome[], periodKey: string, anchor: string): number {
  const payslipTotal = payslips.filter((p) => p.period_key === periodKey && p.status === "confirmed").reduce((s, p) => s + (p.net || 0), 0);
  const miscTotal = miscIncome.filter((m) => periodKeyOf(m.date, anchor) === periodKey).reduce((s, m) => s + (Number(m.amount) || 0), 0);
  return payslipTotal + miscTotal;
}

/** First Home Super Saver Scheme eligibility caps (ATO, current since 1 July 2022). */
export const FHSS_ANNUAL_CAP = 15000;
export const FHSS_LIFETIME_CAP = 50000;
/** Default deemed-earnings rate shown across the Super/Savings/Overview tabs — approximates the ATO's shortfall interest charge rate, which changes quarterly. Editable per-tab; this is just the shared starting point. */
export const DEFAULT_FHSS_DEEMED_RATE = 7.4;

export interface FhssSummary {
  thisFYTotal: number; // raw logged total this FY, uncapped
  thisFYEligible: number; // capped at the annual cap
  lifetimeTotal: number; // raw logged total all-time, uncapped
  lifetimeEligible: number; // capped at the lifetime cap (applied per-FY, in date order)
  estimatedReleasable: number; // eligible contributions plus deemed earnings, before tax
  taxFreeAmount: number; // eligible non-concessional principal — released tax-free
  assessableAmount: number; // eligible concessional principal + ALL deemed earnings — taxed with a 30% offset
  estimatedTax: number; // estimated tax on the assessable amount, at marginal rate less the 30% offset
  estimatedNetReleasable: number; // what you'd actually receive after that tax
}

/**
 * Summarises voluntary (salary-sacrifice/personal) contributions against the FHSS caps and
 * estimates the releasable amount. Deemed earnings accrue on each eligible contribution from
 * the start of the month it was made, compounding daily at `deemedRatePct` (the ATO's actual
 * rate is the shortfall interest charge rate, which changes quarterly — set this to the
 * current rate for a closer estimate). This is an approximation for planning purposes, not
 * the authoritative ATO figure — get that from your myGov FHSS determination before relying
 * on it. Compulsory employer contributions are not FHSS-eligible and aren't included here.
 */
export function fhssSummary(
  contributions: { date: string; amount: number; taxDeductible: boolean }[],
  todayISO: string,
  deemedRatePct: number,
  baseTaxableIncome: number
): FhssSummary {
  const byFY = new Map<string, { date: string; amount: number; taxDeductible: boolean }[]>();
  contributions.forEach((c) => {
    const fy = financialYearStart(c.date);
    if (!byFY.has(fy)) byFY.set(fy, []);
    byFY.get(fy)!.push(c);
  });

  const today = dateFromISO(todayISO);
  const dayMs = 86400000;
  const dailyRate = Math.pow(1 + deemedRatePct / 100, 1 / 365) - 1;

  let lifetimeEligible = 0;
  let estimatedReleasable = 0;
  let taxFreePrincipal = 0;
  let concessionalPrincipal = 0;
  let totalEarnings = 0;

  Array.from(byFY.keys())
    .sort()
    .forEach((fy) => {
      let fyRunningTotal = 0;
      byFY
        .get(fy)!
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach((c) => {
          const remainingAnnual = Math.max(0, FHSS_ANNUAL_CAP - fyRunningTotal);
          const remainingLifetime = Math.max(0, FHSS_LIFETIME_CAP - lifetimeEligible);
          const eligiblePortion = Math.max(0, Math.min(c.amount, remainingAnnual, remainingLifetime));
          fyRunningTotal += c.amount;
          lifetimeEligible += eligiblePortion;
          if (c.taxDeductible) concessionalPrincipal += eligiblePortion;
          else taxFreePrincipal += eligiblePortion;
          if (eligiblePortion > 0) {
            const d = dateFromISO(c.date);
            const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
            const days = Math.max(0, Math.round((today.getTime() - monthStart.getTime()) / dayMs));
            const earnings = eligiblePortion * (Math.pow(1 + dailyRate, days) - 1);
            totalEarnings += earnings;
            estimatedReleasable += eligiblePortion + earnings;
          }
        });
    });

  const thisFY = financialYearStart(todayISO);
  const thisFYTotal = (byFY.get(thisFY) ?? []).reduce((s, c) => s + c.amount, 0);
  const lifetimeTotal = contributions.reduce((s, c) => s + c.amount, 0);

  // Concessional principal + all deemed earnings (from every eligible contribution, whichever
  // type) are assessable income on release, taxed at marginal rate with a 30% offset; the
  // non-concessional principal itself comes out tax-free.
  const assessableAmount = concessionalPrincipal + totalEarnings;
  const taxWithout = Math.max(0, incomeTaxAU(baseTaxableIncome) - litoAU(baseTaxableIncome));
  const taxWith = Math.max(0, incomeTaxAU(baseTaxableIncome + assessableAmount) - litoAU(baseTaxableIncome + assessableAmount));
  const grossTax = Math.max(0, taxWith - taxWithout);
  const estimatedTax = Math.max(0, grossTax - assessableAmount * 0.3);
  const estimatedNetReleasable = taxFreePrincipal + assessableAmount - estimatedTax;

  return {
    thisFYTotal,
    thisFYEligible: Math.min(thisFYTotal, FHSS_ANNUAL_CAP),
    lifetimeTotal,
    lifetimeEligible,
    estimatedReleasable,
    taxFreeAmount: taxFreePrincipal,
    assessableAmount,
    estimatedTax,
    estimatedNetReleasable,
  };
}

/** Advances an ISO date one step forward by a recurring-expense cadence. */
export function nextOccurrence(dateISO: string, frequency: RecurringFrequency): string {
  const d = dateFromISO(dateISO);
  const next = new Date(d);
  switch (frequency) {
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "fortnightly":
      next.setUTCDate(next.getUTCDate() + 14);
      break;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case "quarterly":
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case "yearly":
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
  }
  return isoFromDate(next);
}

/** Whole days between today and an ISO date — negative if the date is in the past (overdue). */
export function daysUntil(dateISO: string, todayISO: string): number {
  const dayMs = 86400000;
  return Math.round((dateFromISO(dateISO).getTime() - dateFromISO(todayISO).getTime()) / dayMs);
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** 0 (Sunday) – 6 (Saturday), matching `Date.getUTCDay()`. */
export function weekdayIndex(dateISO: string): number {
  return dateFromISO(dateISO).getUTCDay();
}

/** Every fortnight is exactly 14 days, so a period's end always falls on the same weekday — this
 * is that fixed weekday, used to translate a payday weekday choice into a day-offset and back. */
export function periodEndWeekday(periods: Period[]): number {
  return periods.length > 0 ? (weekdayIndex(periods[0].key) + 6) % 7 : 0;
}

/** The payday for a given fortnight, `offsetDays` after its last day. */
export function paydayForPeriod(period: Period, offsetDays: number): string {
  const d = new Date(period.end);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return isoFromDate(d);
}

/** Which weekday (0 Sun – 6 Sat) payday falls on, given the fortnight-end weekday + offset. */
export function paydayWeekday(periodEndWeekdayIdx: number, offsetDays: number): number {
  return (periodEndWeekdayIdx + offsetDays) % 7;
}

/** Inverse of `paydayWeekday` — the smallest non-negative offset (0-6) that lands on the chosen weekday. */
export function offsetForPaydayWeekday(periodEndWeekdayIdx: number, targetWeekday: number): number {
  return (targetWeekday - periodEndWeekdayIdx + 7) % 7;
}

/** The soonest payday that hasn't passed yet (today counts) — `days` is 0 on payday itself. */
export function nextPaydayInfo(periods: Period[], todayISO: string, paydayOffsetDays: number): { dateISO: string; days: number } | null {
  const today = dateFromISO(todayISO);
  for (const p of periods) {
    const payday = paydayForPeriod(p, paydayOffsetDays);
    if (dateFromISO(payday) >= today) return { dateISO: payday, days: daysUntil(payday, todayISO) };
  }
  return null;
}

/** The most recent fortnight whose payday has actually landed (today counts) — null if none have yet. */
export function lastPaidPeriod(periods: Period[], todayISO: string, paydayOffsetDays: number): Period | null {
  const today = dateFromISO(todayISO);
  const paid = periods.filter((p) => dateFromISO(paydayForPeriod(p, paydayOffsetDays)) <= today);
  return paid.length > 0 ? paid[paid.length - 1] : null;
}

/** The soonest-due active recurring bill, or null if there are none active. */
export function nextBillDue(recurringExpenses: RecurringExpense[], todayISO: string): { description: string; dateISO: string; days: number } | null {
  const active = recurringExpenses.filter((r) => r.active).sort((a, b) => a.next_due.localeCompare(b.next_due));
  if (active.length === 0) return null;
  const soonest = active[0];
  return { description: soonest.description, dateISO: soonest.next_due, days: daysUntil(soonest.next_due, todayISO) };
}

/** The most recently *paid* fortnight, if it still hasn't been marked reconciled — a nudge to
 * close it out. Gated on payday (not just period end) so it doesn't nag before that pay has
 * actually landed. Null once it's closed, or if no payday has landed yet. */
export function mostRecentUnreconciledPeriod(
  periods: Period[],
  reconciliations: Record<string, Reconciliation>,
  todayISO: string,
  paydayOffsetDays: number
): Period | null {
  const last = lastPaidPeriod(periods, todayISO, paydayOffsetDays);
  if (!last) return null;
  return reconciliations[last.key]?.closed_at ? null : last;
}

export interface IncomeProjectionPoint {
  key: string;
  label: string;
  isFT: boolean;
  gross: number; // per-fortnight cash salary (excl. super)
  tax: number; // per-fortnight PAYG + Medicare + HECS
  super: number; // per-fortnight employer contribution
  net: number; // per-fortnight take-home
}

/**
 * Projects gross/tax/super/net per fortnight forward from today under a salary-growth
 * `scenario` (the same ones used on Savings' net-worth projection) — recomputing tax/HECS
 * withholding and the FT/PT split at each period rather than just scaling last pay by a flat
 * rate. A rough guide, not advice.
 */
export function buildIncomeProjection(profile: Profile, periods: Period[], todayISO: string, scenario: SalaryScenario, horizonPeriods = 13): IncomeProjectionPoint[] {
  const startIdx = currentPeriod(periods, todayISO).idx;
  const superRate = Number(profile.super_rate) || 0;
  const basePackage = Number(profile.package) || 0;
  const ptFraction = Number(profile.pt_fraction) || 0;

  return periods.slice(startIdx, startIdx + horizonPeriods).map((per, i) => {
    const periodIsFT = isFT(per.key, profile.ft_start);
    const grownPackage = (periodIsFT ? basePackage : basePackage * ptFraction) * scenario.multiplierAt(i);
    const { cash, net } = netFromPackage(grownPackage, superRate);
    const grossFn = cash / FN_PER_YEAR;
    const netFn = net / FN_PER_YEAR;
    return {
      key: per.key,
      label: periodLabel(per),
      isFT: periodIsFT,
      gross: grossFn,
      tax: grossFn - netFn,
      super: (grownPackage - cash) / FN_PER_YEAR,
      net: netFn,
    };
  });
}

export interface FortnightSplitCategory {
  label: string;
  amount: number;
}

export interface GoalAllocation {
  id: string;
  label: string;
  amount: number; // contributed this period
  balance: number; // running balance after this period's contribution
}

export interface FortnightSplitPoint {
  key: string;
  label: string;
  isFT: boolean;
  netPay: number;
  categoriesTotal: number;
  sinkingTotal: number;
  toCreditCard: number;
  toEmergency: number;
  toGoalsTotal: number;
  goalAllocations: GoalAllocation[];
  toDeposit: number;
  emergencyBalance: number;
  depositBalance: number;
  creditCardBalance: number;
  /** Any extra balance-based destinations added to the pay-priority order (see `EXTRA_BALANCE_DESTINATIONS`) — empty unless you've added one. */
  otherAllocations: GoalAllocation[];
}

/** How many times a year a recurring expense of this frequency falls due. */
const RECURRING_OCCURRENCES_PER_YEAR: Record<RecurringFrequency, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

/**
 * Converts a recurring expense's amount+frequency to its per-fortnight equivalent set-aside
 * rate. Weekly/fortnightly/monthly bills recur predictably often enough that a flat
 * occurrences-per-year average is the right steady-state number. Quarterly/yearly ones are big,
 * infrequent lump sums instead — for those, dividing the amount by the fortnights actually left
 * until `nextDueISO` gives a real answer to "how much do I need to save each pay to have this
 * ready in time", which a flat annual average can badly understate right after adding a bill
 * that's due soon. It recalculates as the due date approaches, so it climbs if nothing's been
 * set aside yet — set the amount aside as it says and the rate stays flat instead.
 */
export function recurringPerFortnight(amount: number, frequency: RecurringFrequency, nextDueISO: string, todayISO: string): number {
  if (frequency === "yearly" || frequency === "quarterly") {
    const fortnightsUntilDue = Math.max(1, Math.ceil(daysUntil(nextDueISO, todayISO) / 14));
    return amount / fortnightsUntilDue;
  }
  return (amount * RECURRING_OCCURRENCES_PER_YEAR[frequency]) / FN_PER_YEAR;
}

export interface SinkingFundItem {
  label: string;
  amount: number;
  frequency: RecurringFrequency;
  nextDue: string;
  perFortnight: number;
}

/**
 * Active recurring expenses (rego, insurance, subscriptions, etc) sit outside the monthly
 * budget categories entirely — nothing in `D.expFN` accounts for them. This is what should be
 * set aside each pay so the lump sum is there when they're actually due, biggest first.
 */
export function sinkingFundBreakdown(recurringExpenses: RecurringExpense[], todayISO: string): SinkingFundItem[] {
  return recurringExpenses
    .filter((r) => r.active)
    .map((r) => ({ label: r.description, amount: r.amount, frequency: r.frequency, nextDue: r.next_due, perFortnight: recurringPerFortnight(r.amount, r.frequency, r.next_due, todayISO) }))
    .sort((a, b) => b.perFortnight - a.perFortnight);
}

/** Total per-fortnight set-aside across all active recurring expenses — see `sinkingFundBreakdown`. */
export function sinkingFundTotal(recurringExpenses: RecurringExpense[], todayISO: string): number {
  return sinkingFundBreakdown(recurringExpenses, todayISO).reduce((s, i) => s + i.perFortnight, 0);
}

export interface AllocationLineItem {
  id: string;
  label: string;
  amount: number;
}

export interface FortnightBreakdown {
  netPay: number;
  categoriesTotal: number;
  sinkingTotal: number;
  toCreditCard: number;
  toEmergency: number;
  toGoalsTotal: number;
  goalAllocations: GoalAllocation[];
  toDeposit: number;
  /** Emergency fund / goals / deposit, in the actual order the surplus was allocated (per the
   * user's configured pay-priority order) — what a UI should iterate to display "where this pay
   * goes" in the right sequence, rather than a hardcoded emergency-then-goals-then-deposit list. */
  orderedAllocations: AllocationLineItem[];
}

/**
 * Applies the same waterfall `buildFortnightSplit` walks forward period by period — remaining
 * budgeted spend, then the sinking-fund set-aside, then credit card paydown, then the emergency
 * fund, then `goals` in priority order, then whatever's left to the deposit — to a single one-off
 * amount (e.g. a just-confirmed payslip's net, or a fortnight's combined actual income) against
 * today's real balances, rather than to the planned income for a series of projected periods.
 * Used to show "where this pay goes" right after importing a payslip.
 *
 * `categoriesTotal` is caller-supplied rather than derived from `D`/`categories`/`year` here, so
 * it can reflect what's actually still unspent this fortnight (plan minus whatever's already
 * logged) rather than the full plan — important for anyone who pays for most expenses on the
 * credit card: money already spent that way is already sitting in the `cc` balance being paid
 * down below, so reserving the *full* planned amount on top of that double-counts it and
 * understates how much can actually go toward clearing the card.
 */
export function fortnightBreakdown(
  categoriesTotal: number,
  balances: Balances,
  recurringExpenses: RecurringExpense[],
  goals: Goal[],
  netPay: number,
  emergencyTarget: number,
  todayISO: string,
  allocationOrder?: AllocationOrder | null
): FortnightBreakdown {
  const sinkingTotal = sinkingFundTotal(recurringExpenses, todayISO);
  let surplus = Math.max(0, netPay - categoriesTotal - sinkingTotal);

  const cc = Number(balances.cc) || 0;
  const toCreditCard = Math.max(0, Math.min(surplus, cc));
  surplus -= toCreditCard;

  const emergency = Number(balances.emergency) || 0;
  const goalRemaining = new Map(goals.map((g) => [g.id, Math.max(0, Number(g.target_amount) - (Number(g.current_amount) || 0))]));
  const order = resolveAllocationOrder(allocationOrder, goals);
  const { toEmergency, toDeposit, goalAmounts, otherAmounts } = applyAllocationOrder(surplus, order, Math.max(0, emergencyTarget - emergency), goalRemaining);

  const goalAllocations: GoalAllocation[] = sortGoalsByPriority(goals).map((g) => {
    const amount = goalAmounts.get(g.id) ?? 0;
    const current = Number(g.current_amount) || 0;
    return { id: g.id, label: g.label, amount, balance: Math.round(current + amount) };
  });
  const toGoalsTotal = goalAllocations.reduce((s, g) => s + g.amount, 0);

  const goalLabelById = new Map(goals.map((g) => [g.id, g.label]));
  const extraLabelById = new Map(EXTRA_BALANCE_DESTINATIONS.map((d) => [d.id as string, d.label]));
  const orderedAllocations: AllocationLineItem[] = order.flat().map((t) => ({
    id: t.id,
    label: t.id === EMERGENCY_ALLOCATION_ID ? "Emergency fund" : t.id === DEPOSIT_ALLOCATION_ID ? "Deposit" : (extraLabelById.get(t.id) ?? goalLabelById.get(t.id) ?? "Goal"),
    amount: t.id === EMERGENCY_ALLOCATION_ID ? toEmergency : t.id === DEPOSIT_ALLOCATION_ID ? toDeposit : (otherAmounts.get(t.id) ?? goalAmounts.get(t.id) ?? 0),
  }));

  return { netPay, categoriesTotal, sinkingTotal, toCreditCard, toEmergency, toGoalsTotal, goalAllocations, toDeposit, orderedAllocations };
}

/**
 * Walks forward from today's real balances, one pay period at a time, showing exactly where
 * each fortnight's pay is planned to go: budgeted categories first, then a set-aside for
 * recurring non-fortnightly bills (rego, insurance — see `sinkingFundBreakdown`), then whatever
 * surplus remains pays down the credit card balance, tops up the emergency fund (until its
 * target), funds `goals` in priority order (until each one's target), and finally whatever's
 * left goes to the house deposit. Same waterfall `buildPlanPath`/`buildNetWorthProjection` use,
 * extended with the credit-card/sinking-fund/goals steps and surfaced per-period instead of
 * collapsed into a single running total.
 */
export function buildFortnightSplit(
  profile: Profile,
  D: DerivedFinancials,
  categories: BudgetCategoryRow[],
  balances: Balances,
  recurringExpenses: RecurringExpense[],
  goals: Goal[],
  periods: Period[],
  todayISO: string,
  horizonPeriods = 10
): FortnightSplitPoint[] {
  const startIdx = currentPeriod(periods, todayISO).idx;
  const emergencyTarget = Number(profile.emergency_target) || 0;
  const sinkingTotal = sinkingFundTotal(recurringExpenses, todayISO);
  let emergency = Number(balances.emergency) || 0;
  let deposit = Number(balances.anzplus) || 0;
  let cc = Number(balances.cc) || 0;
  const goalBalances = new Map<string, number>(goals.map((g) => [g.id, Number(g.current_amount) || 0]));
  const otherBalances = new Map<string, number>(EXTRA_BALANCE_DESTINATIONS.map((d) => [d.id as string, Number(balances[d.id]) || 0]));
  const orderedGoals = sortGoalsByPriority(goals);
  const allocationOrder = resolveAllocationOrder(profile.allocation_order, goals);

  return periods.slice(startIdx, startIdx + horizonPeriods).map((per) => {
    const netPay = plannedIncomeFN(per, profile, D);
    const categoriesTotal = D.expFN(per.year);
    let surplus = Math.max(0, netPay - categoriesTotal - sinkingTotal);
    const toCreditCard = Math.max(0, Math.min(surplus, cc));
    surplus -= toCreditCard;
    cc = Math.max(0, cc - toCreditCard);

    const goalRemaining = new Map(goals.map((g) => [g.id, Math.max(0, Number(g.target_amount) - (goalBalances.get(g.id) ?? 0))]));
    const { toEmergency, toDeposit, goalAmounts, otherAmounts } = applyAllocationOrder(surplus, allocationOrder, Math.max(0, emergencyTarget - emergency), goalRemaining);
    emergency += toEmergency;

    // Every goal appears here each period — even at $0 — so a consumer tracking a goal's running
    // balance across periods (e.g. Savings' ETA projection) always finds it, rather than falling
    // back to "not found" on a period where this particular goal happened to get nothing.
    const goalAllocations: GoalAllocation[] = orderedGoals.map((g) => {
      const amount = goalAmounts.get(g.id) ?? 0;
      const balance = (goalBalances.get(g.id) ?? 0) + amount;
      goalBalances.set(g.id, balance);
      return { id: g.id, label: g.label, amount, balance: Math.round(balance) };
    });
    const toGoalsTotal = goalAllocations.reduce((s, g) => s + g.amount, 0);

    const otherAllocations: GoalAllocation[] = EXTRA_BALANCE_DESTINATIONS.map((d) => {
      const amount = otherAmounts.get(d.id as string) ?? 0;
      const balance = (otherBalances.get(d.id as string) ?? 0) + amount;
      otherBalances.set(d.id as string, balance);
      return { id: d.id as string, label: d.label, amount, balance: Math.round(balance) };
    });

    deposit += toDeposit;
    return {
      key: per.key,
      label: periodLabel(per),
      isFT: isFT(per.key, profile.ft_start),
      netPay,
      categoriesTotal,
      sinkingTotal,
      toCreditCard,
      toEmergency,
      toGoalsTotal,
      goalAllocations,
      toDeposit,
      emergencyBalance: Math.round(emergency),
      depositBalance: Math.round(deposit),
      creditCardBalance: Math.round(cc),
      otherAllocations,
    };
  });
}

/**
 * Category breakdown of a fortnight's budgeted expenses for a given year — the composition of
 * `categoriesTotal` in `buildFortnightSplit`, which doesn't vary period to period within a year.
 */
export function fortnightCategoryBreakdown(categories: BudgetCategoryRow[], D: DerivedFinancials, year: number): FortnightSplitCategory[] {
  return categories
    .slice()
    .sort((a, b) => a.sort - b.sort)
    .map((c) => ({ label: c.label, amount: D.catFN(c.key, year) }));
}

/**
 * First point in a `buildFortnightSplit` projection at which the simulated credit-card balance
 * reaches zero, or null if the debt outlasts the whole projection (either it's simply too big
 * for the horizon, or nothing's actually left over each pay to put toward it once expenses and
 * set-asides come out — check `toCreditCard` across the projection to tell the two apart).
 */
export function creditCardPayoffPeriod(split: FortnightSplitPoint[]): FortnightSplitPoint | null {
  return split.find((p) => p.creditCardBalance <= 0) ?? null;
}

/** Fortnights until `current` reaches `target` at a constant `perPeriod` savings rate — 0 if already there, null if the rate can't get there. */
export function periodsToTarget(current: number, target: number, perPeriod: number): number | null {
  if (current >= target) return 0;
  if (perPeriod <= 0) return null;
  return Math.ceil((target - current) / perPeriod);
}

// ============ Reports (Balance Sheet / Income & Expenditure / Cash Flow) ============
// A lightweight, personal-finance take on the standard statements — not commercial-accounting
// rigorous (no accrual adjustments, no reconciliation to a running ledger), but grounded in the
// same real balance/transaction data every other tab uses.

export interface ReportLineItem {
  label: string;
  amount: number;
}

export interface BalanceSheet {
  asOfISO: string;
  assets: ReportLineItem[];
  totalAssets: number;
  liabilities: ReportLineItem[];
  totalLiabilities: number;
  netWorth: number;
}

/** Point-in-time statement from today's real balances — there's no historical balance-by-account
 * data to draw an as-of-a-past-date version from (only `snapshots`' partial deposit/emergency/cc/hecs series does that). */
export function buildBalanceSheet(balances: Balances, goals: Goal[], todayISO: string): BalanceSheet {
  const assets: ReportLineItem[] = BALANCE_FIELDS.filter(([key]) => !LIABILITY_ACCOUNTS.has(key)).map(([key, label]) => ({ label, amount: Number(balances[key]) || 0 }));
  const goalsTotal = goals.reduce((s, g) => s + (Number(g.current_amount) || 0), 0);
  if (goalsTotal > 0) assets.push({ label: "Savings goals", amount: goalsTotal });
  const liabilities: ReportLineItem[] = BALANCE_FIELDS.filter(([key]) => LIABILITY_ACCOUNTS.has(key)).map(([key, label]) => ({ label, amount: Number(balances[key]) || 0 }));
  const totalAssets = assets.reduce((s, i) => s + i.amount, 0);
  const totalLiabilities = liabilities.reduce((s, i) => s + i.amount, 0);
  return { asOfISO: todayISO, assets, totalAssets, liabilities, totalLiabilities, netWorth: totalAssets - totalLiabilities };
}

export interface IncomeExpenditureStatement {
  startISO: string;
  endISO: string;
  income: ReportLineItem[];
  totalIncome: number;
  expenses: ReportLineItem[];
  totalExpenses: number;
  net: number;
}

/**
 * Economic income vs spend for the period — every logged expense counts against its category
 * regardless of which account funded it (a credit-card purchase is still spend the moment it
 * happens), same convention Reconcile/Budget already use. Contrast with `buildCashFlowStatement`,
 * which only counts money that's actually left a real account.
 */
export function buildIncomeExpenditureStatement(
  payslips: Payslip[],
  miscIncome: MiscIncome[],
  transactions: Transaction[],
  categories: BudgetCategoryRow[],
  startISO: string,
  endISO: string
): IncomeExpenditureStatement {
  const inRange = (d: string | null) => !!d && d >= startISO && d <= endISO;

  const salaryTotal = payslips.filter((p) => p.status === "confirmed" && inRange(p.period_start ?? p.period_key)).reduce((s, p) => s + (Number(p.net) || 0), 0);
  const miscTotal = miscIncome.filter((m) => inRange(m.date)).reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const income: ReportLineItem[] = [];
  if (salaryTotal > 0) income.push({ label: "Salary (net)", amount: salaryTotal });
  if (miscTotal > 0) income.push({ label: "Other income", amount: miscTotal });
  const totalIncome = salaryTotal + miscTotal;

  const byCategory = new Map<string, number>();
  transactions.filter((t) => inRange(t.date)).forEach((t) => byCategory.set(t.category_key, (byCategory.get(t.category_key) ?? 0) + (Number(t.amount) || 0)));
  const expenses: ReportLineItem[] = categories
    .slice()
    .sort((a, b) => a.sort - b.sort)
    .filter((c) => (byCategory.get(c.key) ?? 0) > 0)
    .map((c) => ({ label: c.label, amount: byCategory.get(c.key) ?? 0 }));
  const knownKeys = new Set(categories.map((c) => c.key));
  const otherAmount = [...byCategory.entries()].filter(([k]) => !knownKeys.has(k)).reduce((s, [, v]) => s + v, 0);
  if (otherAmount > 0) expenses.push({ label: "Other", amount: otherAmount });
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  return { startISO, endISO, income, totalIncome, expenses, totalExpenses, net: totalIncome - totalExpenses };
}

export interface CashFlowSection {
  label: string;
  items: ReportLineItem[];
  total: number;
}

export interface CashFlowStatement {
  startISO: string;
  endISO: string;
  operating: CashFlowSection;
  investing: CashFlowSection;
  debtRepayment: CashFlowSection;
  netCashFlow: number;
}

/**
 * Actual cash movement for the period, unlike `buildIncomeExpenditureStatement`: a credit-card
 * purchase isn't counted here until the card is actually paid down (a transfer into "cc"), since
 * no real account loses money at the moment the purchase is logged — only once it's paid off.
 * Expenses/purchases funded from "Fun money" or "Cash" are excluded too, since this app doesn't
 * track a real balance for either (see `ACCOUNT_BALANCE_KEY`), so there's no account movement to report.
 */
export function buildCashFlowStatement(
  payslips: Payslip[],
  miscIncome: MiscIncome[],
  transactions: Transaction[],
  holdingLots: HoldingLot[],
  superContributions: SuperContribution[],
  transfers: Transfer[],
  startISO: string,
  endISO: string
): CashFlowStatement {
  const inRange = (d: string | null) => !!d && d >= startISO && d <= endISO;
  const fundsRealCashAccount = (accountKey: string | null) => {
    if (!accountKey) return false;
    const key = accountKey as keyof Omit<Balances, "user_id">;
    return !LIABILITY_ACCOUNTS.has(key);
  };

  const salaryTotal = payslips.filter((p) => p.status === "confirmed" && inRange(p.period_start ?? p.period_key)).reduce((s, p) => s + (Number(p.net) || 0), 0);
  const miscTotal = miscIncome.filter((m) => inRange(m.date)).reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const cashExpenseTotal = transactions
    .filter((t) => inRange(t.date) && fundsRealCashAccount(ACCOUNT_BALANCE_KEY[t.account as Account] ?? null))
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const operatingItems: ReportLineItem[] = [];
  if (salaryTotal > 0) operatingItems.push({ label: "Salary received", amount: salaryTotal });
  if (miscTotal > 0) operatingItems.push({ label: "Other income received", amount: miscTotal });
  if (cashExpenseTotal > 0) operatingItems.push({ label: "Living expenses paid from cash", amount: -cashExpenseTotal });
  const operatingTotal = operatingItems.reduce((s, i) => s + i.amount, 0);

  const sharesPurchased = holdingLots.filter((l) => inRange(l.date) && fundsRealCashAccount(l.account)).reduce((s, l) => s + l.shares * l.price, 0);
  const personalSuperTotal = superContributions
    .filter((c) => c.type === "personal" && inRange(c.date) && fundsRealCashAccount(c.account))
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const investingItems: ReportLineItem[] = [];
  if (sharesPurchased > 0) investingItems.push({ label: "Shares purchased", amount: -sharesPurchased });
  if (personalSuperTotal > 0) investingItems.push({ label: "Personal super contributions", amount: -personalSuperTotal });
  const investingTotal = investingItems.reduce((s, i) => s + i.amount, 0);

  const ccPaydown = transfers.filter((t) => t.to_account === "cc" && inRange(t.date)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const debtItems: ReportLineItem[] = [];
  if (ccPaydown > 0) debtItems.push({ label: "Credit card paid down", amount: -ccPaydown });
  const debtTotal = debtItems.reduce((s, i) => s + i.amount, 0);

  return {
    startISO,
    endISO,
    operating: { label: "Operating activities", items: operatingItems, total: operatingTotal },
    investing: { label: "Investing activities", items: investingItems, total: investingTotal },
    debtRepayment: { label: "Debt repayment", items: debtItems, total: debtTotal },
    netCashFlow: operatingTotal + investingTotal + debtTotal,
  };
}
