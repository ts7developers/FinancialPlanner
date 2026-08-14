"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildPeriods, isoFromDate, periodKeyOf, type Period } from "@/lib/period";
import {
  deriveFinancials,
  buildPlanPath,
  loggedByCategory,
  applyTransfer,
  applyExpenseToBalance,
  applyIncomeToBalance,
  type DerivedFinancials,
  type PlanPathPoint,
} from "@/lib/derive";
import type { Profile, BudgetCategoryRow, Transaction, Reconciliation, Snapshot, Balances, Payslip, Transfer, Holding, HoldingLot } from "@/lib/types";

interface NewTransaction {
  date: string;
  description: string;
  amount: number;
  category_key: string;
  account: string;
}

interface AppDataContextValue {
  profile: Profile;
  categories: BudgetCategoryRow[];
  transactions: Transaction[];
  reconciliations: Record<string, Reconciliation>;
  snapshots: Snapshot[];
  balances: Balances;
  payslips: Payslip[];
  transfers: Transfer[];
  holdings: Holding[];
  holdingLots: HoldingLot[];
  periods: Period[];
  D: DerivedFinancials;
  planPath: PlanPathPoint[];
  loggedByCat: Record<string, Record<string, number>>;

  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  updateCategory: (key: string, patch: Partial<Pick<BudgetCategoryRow, "amount_2026" | "amount_2027">>) => Promise<void>;
  addTransaction: (t: NewTransaction) => Promise<void>;
  /** Removes the transaction from view immediately; the DB delete is deferred so `undoDeleteTransaction` can still cancel it. */
  deleteTransaction: (id: string) => void;
  undoDeleteTransaction: (id: string) => void;
  setReconciliation: (
    periodKey: string,
    patch: Partial<Pick<Reconciliation, "actual_income" | "actual_overrides">>
  ) => Promise<void>;
  updateBalances: (patch: Partial<Omit<Balances, "user_id">>) => Promise<void>;
  takeSnapshot: () => Promise<void>;
  addPayslip: (payslip: Payslip) => void;
  updatePayslip: (id: string, patch: Partial<Payslip>) => void;
  confirmPayslip: (id: string, periodKey: string, net: number) => Promise<void>;
  addTransfer: (
    from: keyof Omit<Balances, "user_id">,
    to: keyof Omit<Balances, "user_id">,
    amount: number,
    note?: string
  ) => Promise<void>;
  addOrUpdateHolding: (code: string, shares: number) => Promise<void>;
  deleteHolding: (id: string) => Promise<void>;
  /** Fetches delayed prices for every held code and revalues the "shares" balance to match. */
  refreshHoldingPrices: () => Promise<void>;
  addHoldingLot: (code: string, shares: number, price: number, date: string) => Promise<void>;
  deleteHoldingLot: (id: string) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}

export function AppDataProvider({
  initialProfile,
  initialCategories,
  initialTransactions,
  initialReconciliations,
  initialSnapshots,
  initialBalances,
  initialPayslips,
  initialTransfers,
  initialHoldings,
  initialHoldingLots,
  children,
}: {
  initialProfile: Profile;
  initialCategories: BudgetCategoryRow[];
  initialTransactions: Transaction[];
  initialReconciliations: Reconciliation[];
  initialSnapshots: Snapshot[];
  initialBalances: Balances;
  initialPayslips: Payslip[];
  initialTransfers: Transfer[];
  initialHoldings: Holding[];
  initialHoldingLots: HoldingLot[];
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState(initialProfile);
  const [categories, setCategories] = useState(initialCategories);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [reconciliations, setReconciliations] = useState<Record<string, Reconciliation>>(() =>
    Object.fromEntries(initialReconciliations.map((r) => [r.period_key, r]))
  );
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [balances, setBalances] = useState(initialBalances);
  const [payslips, setPayslips] = useState(initialPayslips);
  const [transfers, setTransfers] = useState(initialTransfers);
  const [holdings, setHoldings] = useState(initialHoldings);
  const [holdingLots, setHoldingLots] = useState(initialHoldingLots);

  const periods = useMemo(() => buildPeriods(profile.pay_anchor), [profile.pay_anchor]);
  const D = useMemo(() => deriveFinancials(profile, categories), [profile, categories]);
  const planPath = useMemo(() => buildPlanPath(profile, D, periods), [profile, D, periods]);
  const loggedByCat = useMemo(() => loggedByCategory(transactions, profile.pay_anchor), [transactions, profile.pay_anchor]);

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      setProfile((p) => ({ ...p, ...patch }));
      const { error } = await supabase.from("profiles").update(patch).eq("user_id", profile.user_id);
      if (error) throw error;
    },
    [supabase, profile.user_id]
  );

  const updateCategory = useCallback(
    async (key: string, patch: Partial<Pick<BudgetCategoryRow, "amount_2026" | "amount_2027">>) => {
      setCategories((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
      const { error } = await supabase.from("budget_categories").update(patch).eq("user_id", profile.user_id).eq("key", key);
      if (error) throw error;
    },
    [supabase, profile.user_id]
  );

  const updateBalances = useCallback(
    async (patch: Partial<Omit<Balances, "user_id">>) => {
      setBalances((b) => ({ ...b, ...patch }));
      const { error } = await supabase.from("balances").update(patch).eq("user_id", profile.user_id);
      if (error) throw error;
    },
    [supabase, profile.user_id]
  );

  const addTransaction = useCallback(
    async (t: NewTransaction) => {
      const { data, error } = await supabase
        .from("transactions")
        .insert({ ...t, user_id: profile.user_id })
        .select()
        .single();
      if (error) throw error;
      setTransactions((ts) => [data as Transaction, ...ts]);
      // Everyday/ANZ Plus/Holiday spend reduces that balance; credit card spend increases what's owed.
      const balancePatch = applyExpenseToBalance(balances, t.account, t.amount, 1);
      if (balancePatch) await updateBalances(balancePatch);
    },
    [supabase, profile.user_id, balances, updateBalances]
  );

  // Deferred-delete buffer for the Expenses ledger's "Undo" toast: the row disappears from
  // view (and its balance effect is reversed) immediately, but the actual DB delete waits
  // UNDO_WINDOW_MS in case it's undone.
  const UNDO_WINDOW_MS = 5000;
  const pendingDeletes = useRef<Record<string, { txn: Transaction; timer: ReturnType<typeof setTimeout> }>>({});

  const deleteTransaction = useCallback(
    (id: string) => {
      const txn = transactions.find((t) => t.id === id);
      if (!txn) return;
      setTransactions((ts) => ts.filter((t) => t.id !== id));
      const balancePatch = applyExpenseToBalance(balances, txn.account, Number(txn.amount) || 0, -1);
      if (balancePatch) updateBalances(balancePatch);
      const timer = setTimeout(async () => {
        delete pendingDeletes.current[id];
        const { error } = await supabase.from("transactions").delete().eq("id", id);
        if (error) throw error;
      }, UNDO_WINDOW_MS);
      pendingDeletes.current[id] = { txn, timer };
    },
    [supabase, transactions, balances, updateBalances]
  );

  const undoDeleteTransaction = useCallback(
    (id: string) => {
      const pending = pendingDeletes.current[id];
      if (!pending) return;
      clearTimeout(pending.timer);
      delete pendingDeletes.current[id];
      setTransactions((ts) => [pending.txn, ...ts]);
      const balancePatch = applyExpenseToBalance(balances, pending.txn.account, Number(pending.txn.amount) || 0, 1);
      if (balancePatch) updateBalances(balancePatch);
    },
    [balances, updateBalances]
  );

  const setReconciliation = useCallback(
    async (periodKey: string, patch: Partial<Pick<Reconciliation, "actual_income" | "actual_overrides">>) => {
      const existing = reconciliations[periodKey] || { period_key: periodKey, actual_income: null, actual_overrides: {} };
      const merged: Reconciliation = { ...existing, ...patch };
      setReconciliations((rs) => ({ ...rs, [periodKey]: merged }));
      const { error } = await supabase
        .from("reconciliations")
        .upsert(
          {
            user_id: profile.user_id,
            period_key: periodKey,
            actual_income: merged.actual_income,
            actual_overrides: merged.actual_overrides,
          },
          { onConflict: "user_id,period_key" }
        );
      if (error) throw error;
    },
    [supabase, profile.user_id, reconciliations]
  );

  const takeSnapshot = useCallback(async () => {
    const key = periodKeyOf(isoFromDate(new Date()), profile.pay_anchor) || isoFromDate(new Date());
    const { data, error } = await supabase
      .from("snapshots")
      .upsert(
        { user_id: profile.user_id, period_key: key, deposit: balances.anzplus, emergency: balances.emergency },
        { onConflict: "user_id,period_key" }
      )
      .select()
      .single();
    if (error) throw error;
    setSnapshots((ss) => [...ss.filter((s) => s.period_key !== key), data as Snapshot].sort((a, b) => a.period_key.localeCompare(b.period_key)));
  }, [supabase, profile.user_id, profile.pay_anchor, balances]);

  const addPayslip = useCallback((payslip: Payslip) => {
    setPayslips((ps) => [...ps.filter((p) => p.id !== payslip.id), payslip]);
  }, []);

  const updatePayslip = useCallback((id: string, patch: Partial<Payslip>) => {
    setPayslips((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const confirmPayslip = useCallback(
    async (id: string, periodKey: string, net: number) => {
      const alreadyConfirmed = payslips.find((p) => p.id === id)?.status === "confirmed";
      const confirmedAt = new Date().toISOString();
      setPayslips((ps) => ps.map((p) => (p.id === id ? { ...p, status: "confirmed", confirmed_at: confirmedAt } : p)));
      const { error } = await supabase.from("payslips").update({ status: "confirmed", confirmed_at: confirmedAt }).eq("id", id);
      if (error) throw error;
      await setReconciliation(periodKey, { actual_income: net });
      // Only the first confirmation lands the pay in Everyday — re-confirming an already-posted
      // payslip (e.g. after correcting a figure) must not double-count it.
      if (!alreadyConfirmed) await updateBalances(applyIncomeToBalance(balances, net));
    },
    [supabase, setReconciliation, payslips, balances, updateBalances]
  );

  const addTransfer = useCallback(
    async (from: keyof Omit<Balances, "user_id">, to: keyof Omit<Balances, "user_id">, amount: number, note?: string) => {
      if (from === to || !(amount > 0)) return;
      const patch = applyTransfer(balances, from, to, amount);
      await updateBalances(patch);
      const { data, error } = await supabase
        .from("transfers")
        .insert({ user_id: profile.user_id, from_account: from, to_account: to, amount, note: note || null })
        .select()
        .single();
      if (error) throw error;
      setTransfers((ts) => [data as Transfer, ...ts]);
    },
    [supabase, profile.user_id, balances, updateBalances]
  );

  const addOrUpdateHolding = useCallback(
    async (code: string, shares: number) => {
      const normalizedCode = code.trim().toUpperCase();
      if (!normalizedCode || !(shares >= 0)) return;
      const { data, error } = await supabase
        .from("holdings")
        .upsert({ user_id: profile.user_id, code: normalizedCode, shares }, { onConflict: "user_id,code" })
        .select()
        .single();
      if (error) throw error;
      setHoldings((hs) => [...hs.filter((h) => h.code !== normalizedCode), data as Holding].sort((a, b) => a.code.localeCompare(b.code)));
    },
    [supabase, profile.user_id]
  );

  const deleteHolding = useCallback(
    async (id: string) => {
      const holding = holdings.find((h) => h.id === id);
      setHoldings((hs) => hs.filter((h) => h.id !== id));
      if (holding) setHoldingLots((ls) => ls.filter((l) => l.code !== holding.code));
      const { error } = await supabase.from("holdings").delete().eq("id", id);
      if (error) throw error;
      if (holding) {
        // Drop its buy history too — otherwise re-adding the same code later would resurrect
        // a stale average cost from lots the holding no longer has any connection to.
        const { error: lotsErr } = await supabase.from("holding_lots").delete().eq("user_id", profile.user_id).eq("code", holding.code);
        if (lotsErr) throw lotsErr;
      }
    },
    [supabase, holdings, profile.user_id]
  );

  const refreshHoldingPrices = useCallback(async () => {
    if (holdings.length === 0) return;
    const res = await fetch("/api/investments/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes: holdings.map((h) => h.code) }),
    });
    if (!res.ok) throw new Error("Could not refresh prices");
    const { results } = (await res.json()) as { results: { code: string; price: number | null; changePct: number | null }[] };
    const priced = results.filter((r) => r.price != null);
    if (priced.length === 0) throw new Error("No prices came back");
    const pricedAt = new Date().toISOString();

    setHoldings((hs) =>
      hs.map((h) => {
        const q = priced.find((r) => r.code === h.code);
        return q ? { ...h, last_price: q.price, last_change_pct: q.changePct, priced_at: pricedAt } : h;
      })
    );
    await Promise.all(
      priced.map((q) =>
        supabase
          .from("holdings")
          .update({ last_price: q.price, last_change_pct: q.changePct, priced_at: pricedAt })
          .eq("user_id", profile.user_id)
          .eq("code", q.code)
      )
    );

    const total = holdings.reduce((sum, h) => {
      const q = priced.find((r) => r.code === h.code);
      const price = q ? q.price! : h.last_price;
      return sum + (price != null ? price * h.shares : 0);
    }, 0);
    await updateBalances({ shares: total });
  }, [holdings, supabase, profile.user_id, updateBalances]);

  // Logs a buy lot (for DCA/P&L) and folds it straight into that code's current share count —
  // creating the holding if this is a new code. Selling isn't tracked as lots (no FIFO/CGT
  // parcel accounting here); use the holding row's Shares field directly for that correction.
  const addHoldingLot = useCallback(
    async (code: string, shares: number, price: number, date: string) => {
      const normalizedCode = code.trim().toUpperCase();
      if (!normalizedCode || !(shares > 0) || !(price > 0)) return;
      const { data, error } = await supabase
        .from("holding_lots")
        .insert({ user_id: profile.user_id, code: normalizedCode, shares, price, date })
        .select()
        .single();
      if (error) throw error;
      setHoldingLots((ls) => [data as HoldingLot, ...ls]);

      const existing = holdings.find((h) => h.code === normalizedCode);
      const newShareTotal = (existing?.shares ?? 0) + shares;
      const { data: holdingRow, error: holdingErr } = await supabase
        .from("holdings")
        .upsert({ user_id: profile.user_id, code: normalizedCode, shares: newShareTotal }, { onConflict: "user_id,code" })
        .select()
        .single();
      if (holdingErr) throw holdingErr;
      setHoldings((hs) => [...hs.filter((h) => h.code !== normalizedCode), holdingRow as Holding].sort((a, b) => a.code.localeCompare(b.code)));
    },
    [supabase, profile.user_id, holdings]
  );

  // Reverses what addHoldingLot did: removes the lot and subtracts its shares back off that
  // code's holding, so deleting a mistaken buy entry doesn't leave the share count inflated.
  const deleteHoldingLot = useCallback(
    async (id: string) => {
      const lot = holdingLots.find((l) => l.id === id);
      setHoldingLots((ls) => ls.filter((l) => l.id !== id));
      const { error } = await supabase.from("holding_lots").delete().eq("id", id);
      if (error) throw error;

      const holding = lot && holdings.find((h) => h.code === lot.code);
      if (lot && holding) {
        const newShareTotal = Math.max(0, holding.shares - lot.shares);
        setHoldings((hs) => hs.map((h) => (h.id === holding.id ? { ...h, shares: newShareTotal } : h)));
        const { error: shareErr } = await supabase.from("holdings").update({ shares: newShareTotal }).eq("id", holding.id);
        if (shareErr) throw shareErr;
      }
    },
    [supabase, holdingLots, holdings]
  );

  const value: AppDataContextValue = {
    profile,
    categories,
    transactions,
    reconciliations,
    snapshots,
    balances,
    payslips,
    transfers,
    holdings,
    holdingLots,
    periods,
    D,
    planPath,
    loggedByCat,
    updateProfile,
    updateCategory,
    addTransaction,
    deleteTransaction,
    undoDeleteTransaction,
    setReconciliation,
    updateBalances,
    takeSnapshot,
    addPayslip,
    updatePayslip,
    confirmPayslip,
    addTransfer,
    addOrUpdateHolding,
    deleteHolding,
    refreshHoldingPrices,
    addHoldingLot,
    deleteHoldingLot,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
