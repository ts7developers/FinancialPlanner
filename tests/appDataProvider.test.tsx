// @vitest-environment happy-dom
//
// Integration tests for AppDataProvider's stateful mutation logic — the part of the app with no
// other coverage, since tests/derive.test.ts only exercises the pure functions those mutators
// call. In particular this regression-tests the stale-balances-closure bug: two balance-touching
// mutations firing before a re-render used to silently drop one's effect, because each computed
// its patch from the same stale `balances` snapshot rather than the other's result.

import { describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { useEffect } from "react";
import { AppDataProvider, useAppData } from "@/components/AppDataProvider";
import { DEFAULT_PROFILE_SETTINGS } from "@/lib/defaults";
import type { Profile, Balances, BudgetCategoryRow } from "@/lib/types";

// Minimal in-memory stand-in for the Supabase query builder — just enough of the chainable API
// (from/insert/update/upsert/delete/select/eq/order/single, awaitable at any point in the chain)
// for AppDataProvider's actual call patterns. Not a general Supabase mock.
function createFakeSupabase() {
  let idCounter = 0;

  function from(table: string) {
    let mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    let payload: unknown = null;

    const builder = {
      insert(rows: unknown) {
        mode = "insert";
        payload = rows;
        return builder;
      },
      update(patch: unknown) {
        mode = "update";
        payload = patch;
        return builder;
      },
      upsert(rows: unknown) {
        mode = "upsert";
        payload = rows;
        return builder;
      },
      delete() {
        mode = "delete";
        return builder;
      },
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      order() {
        return builder;
      },
      single() {
        return builder;
      },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        if (mode === "insert" || mode === "upsert") {
          const rows = Array.isArray(payload) ? payload : [payload];
          const withIds = rows.map((r) => ({ id: `${table}-${++idCounter}`, ...(r as object) }));
          resolve({ data: Array.isArray(payload) ? withIds : withIds[0], error: null });
          return;
        }
        resolve({ data: null, error: null });
      },
    };
    return builder;
  }

  return { from };
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => createFakeSupabase(),
}));

const profile: Profile = { user_id: "u1", display_name: null, super_employer_extra: 0, ...DEFAULT_PROFILE_SETTINGS };

const balances: Balances = {
  user_id: "u1",
  everyday: 1000,
  anzplus: 3000,
  emergency: 500,
  holiday: 0,
  shares: 0,
  superb: 0,
  cc: 200,
  hecs: 0,
};

const categories: BudgetCategoryRow[] = [{ id: "c1", user_id: "u1", key: "groceries", label: "Groceries", amount_2026: 400, amount_2027: 400, sort: 0, frequency: "monthly" }];

type Ctx = ReturnType<typeof useAppData>;

function Harness({ onReady }: { onReady: (ctx: Ctx) => void }) {
  const ctx = useAppData();
  useEffect(() => {
    onReady(ctx);
  });
  return null;
}

/** Renders a real AppDataProvider (against the fake Supabase client) and hands back a getter for its always-current context value. */
function renderAppData() {
  let ctx!: Ctx;
  render(
    <AppDataProvider
      initialProfile={profile}
      initialCategories={categories}
      initialTransactions={[]}
      initialReconciliations={[]}
      initialSnapshots={[]}
      initialBalances={balances}
      initialPayslips={[]}
      initialTransfers={[]}
      initialHoldings={[]}
      initialHoldingLots={[]}
      initialSuperContributions={[]}
      initialRecurringExpenses={[]}
      initialMiscIncome={[]}
      initialGoals={[]}
    >
      <Harness onReady={(c) => (ctx = c)} />
    </AppDataProvider>
  );
  return () => ctx;
}

describe("AppDataProvider — balance mutation correctness", () => {
  it("addTransaction reduces the funding account and adds the row", async () => {
    const getCtx = renderAppData();
    await act(async () => {
      await getCtx().addTransaction({ date: "2026-08-24", description: "Milk", amount: 50, category_key: "groceries", account: "Everyday" });
    });
    expect(getCtx().balances.everyday).toBe(950);
    expect(getCtx().transactions).toHaveLength(1);
  });

  it("spending on the credit card increases what's owed", async () => {
    const getCtx = renderAppData();
    await act(async () => {
      await getCtx().addTransaction({ date: "2026-08-24", description: "Groceries", amount: 30, category_key: "groceries", account: "Credit card" });
    });
    expect(getCtx().balances.cc).toBe(230);
  });

  it("two balance-touching mutations fired together both land — the stale-closure regression", async () => {
    const getCtx = renderAppData();
    // Both start from the same initial render's closure — exactly the scenario that used to drop
    // one of these two, since each computed its patch from the same starting `balances` snapshot.
    await act(async () => {
      await Promise.all([
        getCtx().addTransaction({ date: "2026-08-24", description: "Fuel", amount: 40, category_key: "groceries", account: "Everyday" }),
        getCtx().addTransfer("anzplus", "emergency", 100),
      ]);
    });
    // Everyday: 1000 - 40 = 960. Emergency: 500 + 100 = 600. ANZ Plus: 3000 - 100 = 2900.
    // If the bug were still present, whichever call's patch resolved second would have overwritten
    // the other's effect on any balance field it also touched — everyday and anzplus/emergency
    // don't overlap here, but the *shared* balances object underneath does, so a regression would
    // show up as one of these three being wrong rather than reflecting both operations.
    expect(getCtx().balances.everyday).toBe(960);
    expect(getCtx().balances.anzplus).toBe(2900);
    expect(getCtx().balances.emergency).toBe(600);
  });

  it("three same-field mutations fired together all accumulate onto the shared balance", async () => {
    const getCtx = renderAppData();
    // All three touch `everyday` — the sharpest version of the regression, since a lost update
    // here can't hide behind touching different fields like the test above.
    await act(async () => {
      await Promise.all([
        getCtx().addTransaction({ date: "2026-08-24", description: "A", amount: 10, category_key: "groceries", account: "Everyday" }),
        getCtx().addTransaction({ date: "2026-08-24", description: "B", amount: 20, category_key: "groceries", account: "Everyday" }),
        getCtx().addTransaction({ date: "2026-08-24", description: "C", amount: 30, category_key: "groceries", account: "Everyday" }),
      ]);
    });
    expect(getCtx().balances.everyday).toBe(1000 - 10 - 20 - 30);
    expect(getCtx().transactions).toHaveLength(3);
  });

  it("addTransfer moves money between two accounts, paying down a liability on the 'to' side", async () => {
    const getCtx = renderAppData();
    await act(async () => {
      await getCtx().addTransfer("everyday", "cc", 200);
    });
    expect(getCtx().balances.everyday).toBe(800);
    expect(getCtx().balances.cc).toBe(0);
  });

  it("deleteTransaction reverses the balance effect immediately", async () => {
    const getCtx = renderAppData();
    await act(async () => {
      await getCtx().addTransaction({ date: "2026-08-24", description: "Milk", amount: 50, category_key: "groceries", account: "Everyday" });
    });
    const id = getCtx().transactions[0].id;
    act(() => {
      getCtx().deleteTransaction(id);
    });
    expect(getCtx().balances.everyday).toBe(1000);
    expect(getCtx().transactions).toHaveLength(0);
  });
});
