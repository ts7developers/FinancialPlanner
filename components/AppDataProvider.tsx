"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildPeriods, isoFromDate, periodKeyOf, type Period } from "@/lib/period";
import { deriveFinancials, buildPlanPath, loggedByCategory, type DerivedFinancials, type PlanPathPoint } from "@/lib/derive";
import type { Profile, BudgetCategoryRow, Transaction, Reconciliation, Snapshot, Balances } from "@/lib/types";

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
  periods: Period[];
  D: DerivedFinancials;
  planPath: PlanPathPoint[];
  loggedByCat: Record<string, Record<string, number>>;

  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  updateCategory: (key: string, patch: Partial<Pick<BudgetCategoryRow, "amount_2026" | "amount_2027">>) => Promise<void>;
  addTransaction: (t: NewTransaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  setReconciliation: (
    periodKey: string,
    patch: Partial<Pick<Reconciliation, "actual_income" | "actual_overrides">>
  ) => Promise<void>;
  updateBalances: (patch: Partial<Omit<Balances, "user_id">>) => Promise<void>;
  takeSnapshot: () => Promise<void>;
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
  children,
}: {
  initialProfile: Profile;
  initialCategories: BudgetCategoryRow[];
  initialTransactions: Transaction[];
  initialReconciliations: Reconciliation[];
  initialSnapshots: Snapshot[];
  initialBalances: Balances;
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

  const addTransaction = useCallback(
    async (t: NewTransaction) => {
      const { data, error } = await supabase
        .from("transactions")
        .insert({ ...t, user_id: profile.user_id })
        .select()
        .single();
      if (error) throw error;
      setTransactions((ts) => [data as Transaction, ...ts]);
    },
    [supabase, profile.user_id]
  );

  const deleteTransaction = useCallback(
    async (id: string) => {
      setTransactions((ts) => ts.filter((t) => t.id !== id));
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    [supabase]
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

  const updateBalances = useCallback(
    async (patch: Partial<Omit<Balances, "user_id">>) => {
      setBalances((b) => ({ ...b, ...patch }));
      const { error } = await supabase.from("balances").update(patch).eq("user_id", profile.user_id);
      if (error) throw error;
    },
    [supabase, profile.user_id]
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

  const value: AppDataContextValue = {
    profile,
    categories,
    transactions,
    reconciliations,
    snapshots,
    balances,
    periods,
    D,
    planPath,
    loggedByCat,
    updateProfile,
    updateCategory,
    addTransaction,
    deleteTransaction,
    setReconciliation,
    updateBalances,
    takeSnapshot,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
