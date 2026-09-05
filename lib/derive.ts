// Cross-tab derived data — ported from the `D`, `PLAN_PATH`, `loggedByCat`, `catRows` memos
// in FinancialPlanTracker.jsx. Pure functions so the same math is reusable and testable
// independent of React / Supabase.

import { dayLabel, dateFromISO, isoFromDate, currentPeriod, financialYearStart, isFT, periodKeyOf, periodLabel, type Period } from "./period";
import { netFromPackage, hecsCompulsoryRepayment, incomeTaxAU, litoAU, FN_PER_YEAR, FN_FROM_MO } from "./tax";
import { OTHER_CATEGORY_KEY } from "./categories";
export { hecsCompulsoryRepayment } from "./tax";
import type { Account } from "./theme";
import type { BudgetCategoryRow, Profile, Transaction, Reconciliation, Balances, Payslip, HoldingLot, RecurringFrequency, RecurringExpense, MiscIncome, Goal, Snapshot } from "./types";

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
  const orderedGoals = sortGoalsByPriority(goals);

  return periods.slice(startIdx, startIdx + horizonPeriods).map((per, i) => {
    const grownPackage = (isFT(per.key, profile.ft_start) ? basePackage : basePackage * ptFraction) * scenario.multiplierAt(i);
    const { cash, net } = netFromPackage(grownPackage, superRate);
    const incomeFn = net / FN_PER_YEAR;
    const superFn = (grownPackage - cash) / FN_PER_YEAR;

    let surplus = Math.max(0, incomeFn - D.expFN(per.year)) + extraPerFortnight;
    const toCC = Math.max(0, Math.min(surplus, cc));
    surplus -= toCC;
    cc = Math.max(0, cc - toCC);
    const toEmergency = Math.max(0, Math.min(surplus, emergencyTarget - emergency));
    surplus -= toEmergency;
    emergency += toEmergency;
    orderedGoals.forEach((g) => {
      const current = goalBalances.get(g.id) ?? 0;
      const remaining = Math.max(0, Number(g.target_amount) - current);
      const amount = Math.max(0, Math.min(surplus, remaining));
      surplus -= amount;
      goalBalances.set(g.id, current + amount);
    });
    deposit += surplus;
    shares *= 1 + periodGrowth;
    superb = superb * (1 + periodGrowth) + superFn;

    const hecsRepaymentFn = hecsCompulsoryRepayment(cash) / FN_PER_YEAR;
    hecs = Math.max(0, hecs * (1 + hecsPeriodIndexation) - hecsRepaymentFn);

    const goalsTotal = Array.from(goalBalances.values()).reduce((s, v) => s + v, 0);
    return {
      key: per.key,
      label: dayLabel(per.start),
      liquid: Math.round(emergency + deposit + goalsTotal),
      invested: Math.round(shares + superb),
      netWorth: Math.round(emergency + deposit + goalsTotal + shares + superb - cc - hecs),
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

export interface FortnightBreakdown {
  netPay: number;
  categoriesTotal: number;
  sinkingTotal: number;
  toCreditCard: number;
  toEmergency: number;
  toGoalsTotal: number;
  goalAllocations: GoalAllocation[];
  toDeposit: number;
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
  todayISO: string
): FortnightBreakdown {
  const sinkingTotal = sinkingFundTotal(recurringExpenses, todayISO);
  let surplus = Math.max(0, netPay - categoriesTotal - sinkingTotal);

  const cc = Number(balances.cc) || 0;
  const toCreditCard = Math.max(0, Math.min(surplus, cc));
  surplus -= toCreditCard;

  const emergency = Number(balances.emergency) || 0;
  const toEmergency = Math.max(0, Math.min(surplus, emergencyTarget - emergency));
  surplus -= toEmergency;

  const goalAllocations: GoalAllocation[] = [];
  let toGoalsTotal = 0;
  sortGoalsByPriority(goals).forEach((g) => {
    const current = Number(g.current_amount) || 0;
    const remaining = Math.max(0, Number(g.target_amount) - current);
    const amount = Math.max(0, Math.min(surplus, remaining));
    surplus -= amount;
    toGoalsTotal += amount;
    goalAllocations.push({ id: g.id, label: g.label, amount, balance: Math.round(current + amount) });
  });

  return { netPay, categoriesTotal, sinkingTotal, toCreditCard, toEmergency, toGoalsTotal, goalAllocations, toDeposit: surplus };
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
  const orderedGoals = sortGoalsByPriority(goals);

  return periods.slice(startIdx, startIdx + horizonPeriods).map((per) => {
    const netPay = plannedIncomeFN(per, profile, D);
    const categoriesTotal = D.expFN(per.year);
    let surplus = Math.max(0, netPay - categoriesTotal - sinkingTotal);
    const toCreditCard = Math.max(0, Math.min(surplus, cc));
    surplus -= toCreditCard;
    cc = Math.max(0, cc - toCreditCard);
    const toEmergency = Math.max(0, Math.min(surplus, emergencyTarget - emergency));
    surplus -= toEmergency;
    emergency += toEmergency;

    const goalAllocations: GoalAllocation[] = [];
    let toGoalsTotal = 0;
    orderedGoals.forEach((g) => {
      const current = goalBalances.get(g.id) ?? 0;
      const remaining = Math.max(0, Number(g.target_amount) - current);
      const amount = Math.max(0, Math.min(surplus, remaining));
      surplus -= amount;
      toGoalsTotal += amount;
      const balance = current + amount;
      goalBalances.set(g.id, balance);
      goalAllocations.push({ id: g.id, label: g.label, amount, balance: Math.round(balance) });
    });

    const toDeposit = surplus;
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
