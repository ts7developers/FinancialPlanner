import { describe, expect, it } from "vitest";
import { netFromPackage, FN_PER_YEAR, MO_PER_YEAR } from "@/lib/tax";
import { monthlyTotal } from "@/lib/categories";
import { FN_FROM_MO } from "@/lib/tax";

// Baseline figures from build spec §3/§4 — must reproduce exactly (within rounding).
const PACKAGE = 68000;
const SG = 0.12;
const PT_FRAC = 0.8;
const HECS_THRESHOLD = 69528;

describe("tax engine — baseline figures (spec §3)", () => {
  it("full-time: cash salary $60,714.29/yr", () => {
    const { cash } = netFromPackage(PACKAGE, SG, HECS_THRESHOLD);
    expect(cash).toBeCloseTo(60714.29, 1);
  });

  it("full-time: net pay $50,587.00/yr, $4,215.58/mo, $1,945.65/fortnight", () => {
    const { net } = netFromPackage(PACKAGE, SG, HECS_THRESHOLD);
    expect(net).toBeCloseTo(50587.0, 1);
    expect(net / MO_PER_YEAR).toBeCloseTo(4215.58, 1);
    expect(net / FN_PER_YEAR).toBeCloseTo(1945.65, 1);
  });

  it("HECS threshold $69,528 => $0 compulsory repayments at FT income", () => {
    const { cash } = netFromPackage(PACKAGE, SG, HECS_THRESHOLD);
    expect(cash).toBeLessThan(HECS_THRESHOLD);
  });

  it("part-time (80%): net pay $1,635.08/fortnight", () => {
    const { net } = netFromPackage(PACKAGE * PT_FRAC, SG, HECS_THRESHOLD);
    expect(net / FN_PER_YEAR).toBeCloseTo(1635.08, 1);
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
