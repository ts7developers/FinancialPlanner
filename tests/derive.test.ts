import { describe, expect, it } from "vitest";
import { applyTransfer } from "@/lib/derive";
import type { Balances } from "@/lib/types";

const balances: Balances = {
  user_id: "u1",
  everyday: 1000,
  anzplus: 3000,
  emergency: 500,
  holiday: 0,
  shares: 0,
  superb: 0,
  cc: 190.6,
  hecs: 45182.77,
};

describe("applyTransfer", () => {
  it("moves money between two asset accounts", () => {
    const patch = applyTransfer(balances, "everyday", "emergency", 200);
    expect(patch).toEqual({ everyday: 800, emergency: 700 });
  });

  it("paying a liability account (credit card) reduces what's owed, not increases it", () => {
    const patch = applyTransfer(balances, "everyday", "cc", 190.6);
    expect(patch.everyday).toBe(1000 - 190.6);
    expect(patch.cc).toBeCloseTo(0, 5);
  });

  it("paying toward HECS reduces the owing balance", () => {
    const patch = applyTransfer(balances, "everyday", "hecs", 100);
    expect(patch.hecs).toBeCloseTo(45082.77, 5);
  });
});
