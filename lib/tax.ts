// AU tax engine (2026-27 rules). The second bracket dropped from 16% to 15% under the
// legislated cost-of-living tax cuts effective 1 July 2026, and HECS-HELP repayment uses the
// marginal system in effect since 1 July 2025 (see hecsCompulsoryRepayment) rather than a
// flat rate above a single threshold.

export const FN_PER_YEAR = 26;
export const MO_PER_YEAR = 12;
export const FN_FROM_MO = MO_PER_YEAR / FN_PER_YEAR; // monthly -> fortnightly multiplier

export function incomeTaxAU(taxableIncome: number): number {
  const T = taxableIncome;
  return (
    0.15 * Math.max(0, Math.min(T, 45000) - 18200) +
    0.3 * Math.max(0, Math.min(T, 135000) - 45000) +
    0.37 * Math.max(0, Math.min(T, 190000) - 135000) +
    0.45 * Math.max(0, T - 190000)
  );
}

export function litoAU(taxableIncome: number): number {
  const T = taxableIncome;
  const raw =
    T <= 37500 ? 700 : T <= 45000 ? 700 - (T - 37500) * 0.05 : T < 66667 ? 325 - (T - 45000) * 0.015 : 0;
  return Math.max(0, raw);
}

/**
 * HECS-HELP compulsory repayment on annual repayment income, under the marginal system that
 * took effect 1 July 2025 (ATO 2026-27 thresholds: $69,528 / $129,717 / $186,050, indexed
 * annually — this snapshot won't track future indexation of the brackets themselves). Above
 * the top threshold the rate flips from marginal to a flat 10% of total repayment income.
 */
export function hecsCompulsoryRepayment(repaymentIncome: number): number {
  const T = repaymentIncome;
  if (T < 69528) return 0;
  if (T <= 129717) return (T - 69528) * 0.15;
  if (T <= 186050) return 9028.35 + (T - 129717) * 0.17;
  return T * 0.1;
}

export interface NetIncomeResult {
  cash: number;
  net: number;
}

/** package is inclusive of super. Returns cash salary and net income after tax, LITO, Medicare, HECS. */
export function netFromPackage(pkg: number, superRate: number): NetIncomeResult {
  const cash = pkg / (1 + superRate);
  const tax = Math.max(0, incomeTaxAU(cash) - litoAU(cash)) + 0.02 * cash + hecsCompulsoryRepayment(cash);
  return { cash, net: cash - tax };
}
