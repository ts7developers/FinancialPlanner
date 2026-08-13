// AU tax engine (2025–26 rules) — ported verbatim from FinancialPlanTracker.jsx (spec §3).

export const FN_PER_YEAR = 26;
export const MO_PER_YEAR = 12;
export const FN_FROM_MO = MO_PER_YEAR / FN_PER_YEAR; // monthly -> fortnightly multiplier

export function incomeTaxAU(taxableIncome: number): number {
  const T = taxableIncome;
  return (
    0.16 * Math.max(0, Math.min(T, 45000) - 18200) +
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

export interface NetIncomeResult {
  cash: number;
  net: number;
}

/** package is inclusive of super. Returns cash salary and net income after tax, LITO, Medicare, HECS. */
export function netFromPackage(pkg: number, superRate: number, hecsThreshold: number): NetIncomeResult {
  const cash = pkg / (1 + superRate);
  const tax =
    Math.max(0, incomeTaxAU(cash) - litoAU(cash)) + 0.02 * cash + 0.15 * Math.max(0, cash - hecsThreshold);
  return { cash, net: cash - tax };
}
