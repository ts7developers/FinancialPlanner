import { describe, expect, it } from "vitest";
import { netFromPackage, hecsCompulsoryRepayment, FN_PER_YEAR, MO_PER_YEAR } from "@/lib/tax";
import { monthlyTotal } from "@/lib/categories";
import { FN_FROM_MO } from "@/lib/tax";

// Baseline figures under the current (2026-27) rules: 15% second bracket (cut from 16% on
// 1 July 2026) and the real HECS-HELP marginal repayment schedule — these intentionally
// differ from the original build spec's figures, which used the prior 16% bracket and a flat
// 15%-above-threshold HECS approximation.
const PACKAGE = 68000;
const SG = 0.12;
const PT_FRAC = 0.8;
const HECS_THRESHOLD = 69528;

describe("tax engine — baseline figures (2026-27 rules)", () => {
  it("full-time: cash salary $60,714.29/yr", () => {
    const { cash } = netFromPackage(PACKAGE, SG);
    expect(cash).toBeCloseTo(60714.29, 1);
  });

  it("full-time: net pay $50,855.00/yr, $4,237.92/mo, $1,955.96/fortnight", () => {
    const { net } = netFromPackage(PACKAGE, SG);
    expect(net).toBeCloseTo(50855.0, 1);
    expect(net / MO_PER_YEAR).toBeCloseTo(4237.92, 1);
    expect(net / FN_PER_YEAR).toBeCloseTo(1955.96, 1);
  });

  it("HECS threshold $69,528 => $0 compulsory repayments at FT income", () => {
    const { cash } = netFromPackage(PACKAGE, SG);
    expect(cash).toBeLessThan(HECS_THRESHOLD);
    expect(hecsCompulsoryRepayment(cash)).toBe(0);
  });

  it("part-time (80%): net pay $1,645.38/fortnight", () => {
    const { net } = netFromPackage(PACKAGE * PT_FRAC, SG);
    expect(net / FN_PER_YEAR).toBeCloseTo(1645.38, 1);
  });
});

describe("expense categories — baseline figures (spec §4)", () => {
  it("2026 monthly total ≈ $1,250.51 ($577.16/fortnight)", () => {
    const mo = monthlyTotal(2026);
    expect(mo).toBeCloseTo(1250.51, 0);
    expect(mo * FN_FROM_MO).toBeCloseTo(577.16, 0);
  });

  it("2027+ monthly total = $1,813.85 ($837.16/fortnight)", () => {
    const mo = monthlyTotal(2027);
    expect(mo).toBeCloseTo(1813.85, 1);
    expect(mo * FN_FROM_MO).toBeCloseTo(837.16, 1);
  });
});
