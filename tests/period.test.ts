import { describe, expect, it } from "vitest";
import { buildPeriods, dateFromISO, isFT, periodKeyOf } from "@/lib/period";

// Baseline figures from build spec §2.
const ANCHOR = "2026-08-24";
const FT_START = "2026-10-19";

describe("period engine — baseline figures (spec §2)", () => {
  it("anchor and FT-start are both Mondays", () => {
    expect(dateFromISO(ANCHOR).getUTCDay()).toBe(1);
    expect(dateFromISO(FT_START).getUTCDay()).toBe(1);
  });

  it("first period starts on the anchor date", () => {
    const periods = buildPeriods(ANCHOR);
    expect(periods[0].key).toBe(ANCHOR);
    expect(periods[0].idx).toBe(0);
  });

  it("periods are 14-day windows stepping from the anchor", () => {
    const periods = buildPeriods(ANCHOR);
    expect(periods[1].key).toBe("2026-09-07");
    expect(periods[2].key).toBe("2026-09-21");
  });

  it("FT start lands exactly on a period boundary (period index 4) — no split fortnight", () => {
    const periods = buildPeriods(ANCHOR);
    expect(periods[4].key).toBe(FT_START);
  });

  it("generates roughly 88 periods through 2029-12-31", () => {
    const periods = buildPeriods(ANCHOR);
    expect(periods.length).toBeGreaterThanOrEqual(85);
    expect(periods.length).toBeLessThanOrEqual(90);
    expect(periods[periods.length - 1].start.getTime()).toBeLessThanOrEqual(
      dateFromISO("2029-12-31").getTime()
    );
  });

  it("isFT is false before FT start and true from FT start onward", () => {
    const periods = buildPeriods(ANCHOR);
    expect(isFT(periods[3].key, FT_START)).toBe(false);
    expect(isFT(periods[4].key, FT_START)).toBe(true);
    expect(isFT(periods[5].key, FT_START)).toBe(true);
  });

  it("periodKeyOf maps a date to its containing period's start", () => {
    expect(periodKeyOf(ANCHOR, ANCHOR)).toBe(ANCHOR); // first day of period 0
    expect(periodKeyOf("2026-09-06", ANCHOR)).toBe(ANCHOR); // last day of period 0
    expect(periodKeyOf("2026-09-07", ANCHOR)).toBe("2026-09-07"); // first day of period 1
  });

  it("periodKeyOf returns null for dates before the anchor", () => {
    expect(periodKeyOf("2026-08-23", ANCHOR)).toBeNull();
  });
});
