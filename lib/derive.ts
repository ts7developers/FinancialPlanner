// Cross-tab derived data — ported from the `D`, `PLAN_PATH`, `loggedByCat`, `catRows` memos
// in FinancialPlanTracker.jsx. Pure functions so the same math is reusable and testable
// independent of React / Supabase.

import { dayLabel, isFT, periodKeyOf, type Period } from "./period";
import { netFromPackage, FN_PER_YEAR, FN_FROM_MO } from "./tax";
import type { BudgetCategoryRow, Profile, Transaction, Reconciliation, Balances, Payslip } from "./types";

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
