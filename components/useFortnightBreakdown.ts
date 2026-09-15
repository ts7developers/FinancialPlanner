"use client";

import { isoFromDate } from "@/lib/period";
import { actualIncomeForPeriod, fortnightBreakdown, plannedIncomeFN, reconcileCategoryRows, type FortnightBreakdown } from "@/lib/derive";
import { useAppData } from "@/components/AppDataProvider";

export interface FortnightBreakdownResult {
  breakdown: FortnightBreakdown | null;
  /** True when there's no confirmed income for this period yet, so `breakdown` (when present) is
   * a preview built from planned (not actual) pay — the numbers will move once a payslip's confirmed. */
  isPlanned: boolean;
  /** Every confirmed payslip's net + misc income actually logged for this period so far (0 if none yet). */
  confirmedTotal: number;
}

/**
 * Where a fortnight's pay actually goes right now, against today's real balances — the same
 * waterfall `PayslipPanel` shows as "Where this pay goes" right after a payslip's confirmed.
 * Pass `fallbackToPlanned: true` to get a preview built from planned (not yet actual) income
 * instead of `null` when nothing's been confirmed for the period yet — used by the Pay split tab
 * so it always has something to show, rather than PayslipPanel's own confirmed-only view.
 */
export function useFortnightBreakdown(periodKey: string, opts: { fallbackToPlanned?: boolean } = {}): FortnightBreakdownResult {
  const { fallbackToPlanned = false } = opts;
  const { profile, payslips, categories, balances, recurringExpenses, goals, miscIncome, periods, D, loggedByCat, reconciliations } = useAppData();

  const periodTotal = actualIncomeForPeriod(payslips, miscIncome, periodKey, profile.pay_anchor);
  const per = periods.find((p) => p.key === periodKey);
  const rec = reconciliations[periodKey];
  // Only what's still unspent against the plan — money already spent (often via credit card,
  // which is already reflected in the `cc` balance paid down below) shouldn't be reserved twice.
  const remainingCategoriesTotal = per
    ? reconcileCategoryRows(categories, D, per.year, loggedByCat[periodKey], rec?.actual_overrides ?? {}).reduce((s, r) => s + Math.max(0, r.plan - (r.actual ?? 0)), 0)
    : 0;
  // Use the emergency/goal balances frozen when this fortnight's first income was confirmed (see
  // AppDataProvider's confirmPayslip/addMiscIncome) rather than today's live balances, so the plan
  // doesn't reshuffle itself once the user starts actually moving money per its recommendation.
  // The credit card balance is deliberately NOT frozen the same way: unlike emergency/goals
  // (which only move when the user acts on this recommendation), the card balance keeps growing
  // from ongoing spending throughout the fortnight — freezing it would recommend paying off an
  // increasingly stale, too-small amount instead of what's actually owed right now.
  const baseline = rec?.breakdown_baseline;
  const breakdownBalances = baseline ? { ...balances, emergency: baseline.emergency } : balances;
  const breakdownGoals = baseline
    ? goals.map((g) => {
        const snap = baseline.goals.find((x) => x.id === g.id);
        return snap ? { ...g, current_amount: snap.current_amount } : g;
      })
    : goals;

  const isPlanned = periodTotal <= 0;
  const netPay = isPlanned ? (fallbackToPlanned && per ? plannedIncomeFN(per, profile, D) : 0) : periodTotal;

  const breakdown =
    per && netPay > 0
      ? fortnightBreakdown(
          remainingCategoriesTotal,
          breakdownBalances,
          recurringExpenses,
          breakdownGoals,
          netPay,
          Number(profile.emergency_target) || 0,
          isoFromDate(new Date()),
          profile.allocation_order
        )
      : null;

  return { breakdown, isPlanned, confirmedTotal: periodTotal };
}
