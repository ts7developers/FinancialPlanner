"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildPeriods, isoFromDate, periodKeyOf, type Period } from "@/lib/period";
import { slugifyCategoryKey, DEFAULT_CATEGORIES } from "@/lib/categories";
import { DEFAULT_PROFILE_SETTINGS } from "@/lib/defaults";
import {
  deriveFinancials,
  buildPlanPath,
  loggedByCategory,
  applyTransfer,
  applyExpenseToBalance,
  applyIncomeToBalance,
  applyIncomeToAccount,
  nextOccurrence,
  actualIncomeForPeriod,
  roundCents,
  type DerivedFinancials,
  type PlanPathPoint,
} from "@/lib/derive";
import type {
  Profile,
  BudgetCategoryRow,
  BudgetFrequency,
  Transaction,
  Reconciliation,
  Snapshot,
  Balances,
  Payslip,
  Transfer,
  Holding,
  HoldingLot,
  SuperContribution,
  RecurringExpense,
  RecurringFrequency,
  MiscIncome,
  Goal,
} from "@/lib/types";
import type { PayslipExtraction } from "@/lib/payslipSchema";

export interface NewTransaction {
  date: string;
  description: string;
  amount: number;
  category_key: string;
  account: string;
}

/** Which categories of data to wipe via `resetData` — the "start fresh" flow on Plan. Every flag defaults to unchecked; the caller ticks only what it wants cleared. */
export interface ResetDataSelections {
  transactions: boolean;
  payslips: boolean;
  miscIncome: boolean;
  reconciliations: boolean;
  snapshots: boolean;
  transfers: boolean;
  holdings: boolean;
  superContributions: boolean;
  balances: boolean;
  /** Zeroes each goal's current_amount but keeps the goal itself. Ignored if `goalsDelete` is also set. */
  goalsProgress: boolean;
  /** Deletes goals outright rather than just zeroing their progress. */
  goalsDelete: boolean;
  recurringExpenses: boolean;
  /** Restores the built-in categories to their baseline label/amounts (adding back any that were deleted) — doesn't touch custom categories you added. */
  budgetCategories: boolean;
  profileSettings: boolean;
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
  superContributions: SuperContribution[];
  recurringExpenses: RecurringExpense[];
  miscIncome: MiscIncome[];
  goals: Goal[];
  periods: Period[];
  D: DerivedFinancials;
  planPath: PlanPathPoint[];
  loggedByCat: Record<string, Record<string, number>>;

  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  updateCategory: (key: string, patch: Partial<Pick<BudgetCategoryRow, "label" | "amount_2026" | "amount_2027" | "frequency">>) => Promise<void>;
  /** Slugifies the label into a new unique key unless `explicitKey` is given (used to recreate a default category with its original key). */
  addCategory: (label: string, amount2026?: number, amount2027?: number, explicitKey?: string, frequency?: BudgetFrequency) => Promise<void>;
  deleteCategory: (key: string) => Promise<void>;
  addTransaction: (t: NewTransaction) => Promise<void>;
  /** Bulk-imports (e.g. from a bank statement CSV) in one insert + one combined balance update — see the implementation note on why this isn't just a loop of `addTransaction`. */
  addTransactionsBulk: (rows: NewTransaction[]) => Promise<void>;
  /** Removes the transaction from view immediately; the DB delete is deferred so `undoDeleteTransaction` can still cancel it.
   * If the deferred delete fails, the removal is rolled back (transaction and balance restored) and `onFailure` is called. */
  deleteTransaction: (id: string, onFailure?: () => void) => void;
  undoDeleteTransaction: (id: string) => void;
  setReconciliation: (
    periodKey: string,
    patch: Partial<Pick<Reconciliation, "actual_income" | "actual_overrides" | "closed_at" | "breakdown_baseline">>
  ) => Promise<void>;
  updateBalances: (patch: Partial<Omit<Balances, "user_id">>) => Promise<void>;
  takeSnapshot: () => Promise<void>;
  addPayslip: (payslip: Payslip) => void;
  updatePayslip: (id: string, patch: Partial<Payslip>) => void;
  /** Confirms with the (possibly user-edited) reviewed fields — persists them onto the payslip row and sums this fortnight's actual income across every confirmed payslip in it, so a second income source (e.g. a casual job) adds rather than overwrites. */
  confirmPayslip: (id: string, periodKey: string, fields: PayslipExtraction) => Promise<void>;
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
  addHoldingLot: (code: string, shares: number, price: number, date: string, account?: keyof Omit<Balances, "user_id">) => Promise<void>;
  deleteHoldingLot: (id: string) => Promise<void>;
  addSuperContribution: (
    date: string,
    amount: number,
    type: SuperContribution["type"],
    taxDeductible: boolean,
    affectsBalance: boolean,
    note?: string,
    account?: keyof Omit<Balances, "user_id">
  ) => Promise<void>;
  deleteSuperContribution: (id: string) => Promise<void>;
  addRecurringExpense: (
    description: string,
    amount: number,
    categoryKey: string,
    account: string,
    frequency: RecurringFrequency,
    nextDue: string
  ) => Promise<void>;
  /** Removes it from view immediately with a Supabase delete deferred behind an Undo window — see `undoDeleteRecurringExpense`. */
  deleteRecurringExpense: (id: string, onFailure?: () => void) => void;
  undoDeleteRecurringExpense: (id: string) => void;
  toggleRecurringExpense: (id: string) => Promise<void>;
  /** Posts today's occurrence as a real transaction (so it flows through the usual balance/reconciliation path) and rolls next_due forward one cadence. */
  logRecurringExpense: (id: string) => Promise<void>;
  /** One-off income (tax refund, gift, side gig, etc) — lands in Everyday immediately and adds to that fortnight's actual income on Reconcile. */
  addMiscIncome: (date: string, description: string, amount: number, account?: keyof Omit<Balances, "user_id">) => Promise<void>;
  deleteMiscIncome: (id: string) => Promise<void>;
  /** A custom savings goal beyond the emergency fund and house deposit — see the `Goal` type. */
  addGoal: (label: string, targetAmount: number, priority?: number) => Promise<void>;
  updateGoal: (id: string, patch: Partial<Pick<Goal, "label" | "target_amount" | "current_amount" | "priority">>) => Promise<void>;
  /** Removes it from view immediately with a Supabase delete deferred behind an Undo window — see `undoDeleteGoal`. */
  deleteGoal: (id: string, onFailure?: () => void) => void;
  undoDeleteGoal: (id: string) => void;
  /** Wipes exactly the ticked categories of data for a fresh start, then reloads the page so every
   * piece of local state (there's a lot of it) reflects the DB rather than being patched by hand. */
  resetData: (selections: ResetDataSelections) => Promise<void>;
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
  initialSuperContributions,
  initialRecurringExpenses,
  initialMiscIncome,
  initialGoals,
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
  initialSuperContributions: SuperContribution[];
  initialRecurringExpenses: RecurringExpense[];
  initialMiscIncome: MiscIncome[];
  initialGoals: Goal[];
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
  const [superContributions, setSuperContributions] = useState(initialSuperContributions);
  // Defensive fallback: a Turbopack Fast Refresh swap has been seen to briefly hand this prop
  // through as non-array during dev, crashing every `.filter`/`.reduce` caller — costs nothing
  // in production, where fetchAppData always supplies a real array.
  const [recurringExpenses, setRecurringExpenses] = useState(initialRecurringExpenses ?? []);
  const [miscIncome, setMiscIncome] = useState(initialMiscIncome);
  const [goals, setGoals] = useState(initialGoals);

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
    async (key: string, patch: Partial<Pick<BudgetCategoryRow, "label" | "amount_2026" | "amount_2027" | "frequency">>) => {
      setCategories((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
      const { error } = await supabase.from("budget_categories").update(patch).eq("user_id", profile.user_id).eq("key", key);
      if (error) throw error;
    },
    [supabase, profile.user_id]
  );

  const addCategory = useCallback(
    async (label: string, amount2026 = 0, amount2027 = 0, explicitKey?: string, frequency: BudgetFrequency = "monthly") => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const key = explicitKey ?? slugifyCategoryKey(trimmed, categories.map((c) => c.key));
      const sort = categories.length > 0 ? Math.max(...categories.map((c) => c.sort)) + 1 : 0;
      const { data, error } = await supabase
        .from("budget_categories")
        .insert({ user_id: profile.user_id, key, label: trimmed, amount_2026: amount2026, amount_2027: amount2027, sort, frequency })
        .select()
        .single();
      if (error) throw error;
      setCategories((cs) => [...cs, data as BudgetCategoryRow].sort((a, b) => a.sort - b.sort));
    },
    [supabase, profile.user_id, categories]
  );

  const deleteCategory = useCallback(
    async (key: string) => {
      setCategories((cs) => cs.filter((c) => c.key !== key));
      const { error } = await supabase.from("budget_categories").delete().eq("user_id", profile.user_id).eq("key", key);
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

  /** For CSV import: inserts every row in one request and applies ONE combined balance patch —
   * looping `addTransaction` here would silently drop all but the last row's balance effect,
   * since each call computes its patch from this render's `balances` closure rather than the
   * previous call's result. Folding onto a local copy first sidesteps that entirely. */
  const addTransactionsBulk = useCallback(
    async (rows: NewTransaction[]) => {
      if (rows.length === 0) return;
      const { data, error } = await supabase
        .from("transactions")
        .insert(rows.map((t) => ({ ...t, user_id: profile.user_id })))
        .select();
      if (error) throw error;
      setTransactions((ts) => [...(data as Transaction[]), ...ts]);

      let working = balances;
      const touched = new Set<keyof Omit<Balances, "user_id">>();
      for (const t of rows) {
        const patch = applyExpenseToBalance(working, t.account, Number(t.amount) || 0, 1);
        if (patch) {
          working = { ...working, ...patch };
          (Object.keys(patch) as (keyof Omit<Balances, "user_id">)[]).forEach((k) => touched.add(k));
        }
      }
      if (touched.size > 0) {
        const finalPatch = Object.fromEntries([...touched].map((k) => [k, working[k]])) as Partial<Omit<Balances, "user_id">>;
        await updateBalances(finalPatch);
      }
    },
    [supabase, profile.user_id, balances, updateBalances]
  );

  // Deferred-delete buffer for the Expenses ledger's "Undo" toast: the row disappears from
  // view (and its balance effect is reversed) immediately, but the actual DB delete waits
  // UNDO_WINDOW_MS in case it's undone.
  const UNDO_WINDOW_MS = 5000;
  const pendingDeletes = useRef<Record<string, { txn: Transaction; timer: ReturnType<typeof setTimeout> }>>({});

  const deleteTransaction = useCallback(
    (id: string, onFailure?: () => void) => {
      const txn = transactions.find((t) => t.id === id);
      if (!txn) return;
      setTransactions((ts) => ts.filter((t) => t.id !== id));
      const balancePatch = applyExpenseToBalance(balances, txn.account, Number(txn.amount) || 0, -1);
      if (balancePatch) updateBalances(balancePatch);
      const timer = setTimeout(async () => {
        delete pendingDeletes.current[id];
        const { error } = await supabase.from("transactions").delete().eq("id", id);
        if (error) {
          // The optimistic removal never actually persisted — put the transaction and its
          // balance effect back rather than leaving local state silently diverged from the DB.
          setTransactions((ts) => [txn, ...ts]);
          const revertPatch = applyExpenseToBalance(balances, txn.account, Number(txn.amount) || 0, 1);
          if (revertPatch) updateBalances(revertPatch);
          onFailure?.();
          return;
        }
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
    async (periodKey: string, patch: Partial<Pick<Reconciliation, "actual_income" | "actual_overrides" | "closed_at" | "breakdown_baseline">>) => {
      const existing = reconciliations[periodKey] || { period_key: periodKey, actual_income: null, actual_overrides: {}, closed_at: null, breakdown_baseline: null };
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
            closed_at: merged.closed_at ?? null,
            breakdown_baseline: merged.breakdown_baseline ?? null,
          },
          { onConflict: "user_id,period_key" }
        );
      if (error) {
        setReconciliations((rs) => ({ ...rs, [periodKey]: existing }));
        throw error;
      }
    },
    [supabase, profile.user_id, reconciliations]
  );

  const takeSnapshot = useCallback(async () => {
    const key = periodKeyOf(isoFromDate(new Date()), profile.pay_anchor) || isoFromDate(new Date());
    const { data, error } = await supabase
      .from("snapshots")
      .upsert(
        { user_id: profile.user_id, period_key: key, deposit: balances.anzplus, emergency: balances.emergency, cc: balances.cc, hecs: balances.hecs },
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
    async (id: string, periodKey: string, fields: PayslipExtraction) => {
      const existing = payslips.find((p) => p.id === id);
      const alreadyConfirmed = existing?.status === "confirmed";
      const previouslyPostedNet = alreadyConfirmed ? existing?.net ?? 0 : 0;
      const confirmedAt = new Date().toISOString();
      const patch = {
        status: "confirmed" as const,
        confirmed_at: confirmedAt,
        gross: fields.gross,
        paygw_tax: fields.paygw_tax,
        super: fields.super,
        net: fields.net,
        help_hecs: fields.help_hecs,
        allowances: fields.allowances,
      };
      const effectivePayslips = payslips.map((p) => (p.id === id ? { ...p, ...patch } : p));
      setPayslips(effectivePayslips);
      const { error } = await supabase.from("payslips").update(patch).eq("id", id);
      if (error) throw error;
      // Sums every confirmed payslip's net plus any misc income for this fortnight rather than
      // overwriting — supports a second income source landing in the same period (e.g. a casual
      // job, or a tax refund) alongside the main one.
      const periodTotal = actualIncomeForPeriod(effectivePayslips, miscIncome, periodKey, profile.pay_anchor);
      // Freeze the cc/emergency/goal balances the first time income lands for this fortnight, so
      // "Where this pay goes" (PayslipPanel) has a stable plan to show even after the user starts
      // acting on it — moving money per the recommendation would otherwise change those same live
      // balances and make the plan reshuffle itself mid-payday.
      const existingBaseline = reconciliations[periodKey]?.breakdown_baseline;
      const breakdownBaseline =
        existingBaseline ??
        (periodTotal > 0
          ? { cc: Number(balances.cc) || 0, emergency: Number(balances.emergency) || 0, goals: goals.map((g) => ({ id: g.id, current_amount: Number(g.current_amount) || 0 })) }
          : null);
      await setReconciliation(periodKey, { actual_income: periodTotal > 0 ? periodTotal : null, breakdown_baseline: breakdownBaseline });
      // Land just the delta in Everyday: the first confirmation posts the full net; re-confirming
      // an already-posted payslip (e.g. after correcting a misread figure) posts only the
      // difference from what was posted before, so a correction is reflected instead of ignored.
      const delta = fields.net - previouslyPostedNet;
      if (delta !== 0) await updateBalances(applyIncomeToBalance(balances, delta));
    },
    [supabase, setReconciliation, payslips, miscIncome, profile.pay_anchor, balances, updateBalances, reconciliations, goals]
  );

  const addMiscIncome = useCallback(
    async (date: string, description: string, amount: number, account: keyof Omit<Balances, "user_id"> = "everyday") => {
      if (!(amount > 0)) return;
      const { data, error } = await supabase
        .from("misc_income")
        .insert({ user_id: profile.user_id, date, description: description.trim() || null, amount, account })
        .select()
        .single();
      if (error) throw error;
      const effectiveMiscIncome = [data as MiscIncome, ...miscIncome];
      setMiscIncome(effectiveMiscIncome);
      await updateBalances(applyIncomeToAccount(balances, account, amount));
      const periodKey = periodKeyOf(date, profile.pay_anchor);
      if (periodKey) {
        const periodTotal = actualIncomeForPeriod(payslips, effectiveMiscIncome, periodKey, profile.pay_anchor);
        const existingBaseline = reconciliations[periodKey]?.breakdown_baseline;
        const breakdownBaseline =
          existingBaseline ??
          (periodTotal > 0
            ? { cc: Number(balances.cc) || 0, emergency: Number(balances.emergency) || 0, goals: goals.map((g) => ({ id: g.id, current_amount: Number(g.current_amount) || 0 })) }
            : null);
        await setReconciliation(periodKey, { actual_income: periodTotal > 0 ? periodTotal : null, breakdown_baseline: breakdownBaseline });
      }
    },
    [supabase, profile.user_id, profile.pay_anchor, balances, updateBalances, payslips, miscIncome, setReconciliation, reconciliations, goals]
  );

  const deleteMiscIncome = useCallback(
    async (id: string) => {
      const entry = miscIncome.find((m) => m.id === id);
      if (!entry) return;
      const effectiveMiscIncome = miscIncome.filter((m) => m.id !== id);
      setMiscIncome(effectiveMiscIncome);
      const { error } = await supabase.from("misc_income").delete().eq("id", id);
      if (error) throw error;
      await updateBalances(applyIncomeToAccount(balances, entry.account as keyof Omit<Balances, "user_id">, entry.amount, -1));
      const periodKey = periodKeyOf(entry.date, profile.pay_anchor);
      if (periodKey) {
        const periodTotal = actualIncomeForPeriod(payslips, effectiveMiscIncome, periodKey, profile.pay_anchor);
        // No income left for the fortnight — drop the frozen baseline so the next confirmed
        // income re-baselines against balances as they stand then, not a stale earlier snapshot.
        await setReconciliation(periodKey, {
          actual_income: periodTotal > 0 ? periodTotal : null,
          breakdown_baseline: periodTotal > 0 ? reconciliations[periodKey]?.breakdown_baseline : null,
        });
      }
    },
    [supabase, miscIncome, balances, updateBalances, payslips, profile.pay_anchor, setReconciliation, reconciliations]
  );

  const addGoal = useCallback(
    async (label: string, targetAmount: number, priority?: number) => {
      const trimmed = label.trim();
      if (!trimmed || !(targetAmount > 0)) return;
      const nextPriority = priority ?? (goals.length > 0 ? Math.max(...goals.map((g) => g.priority)) + 1 : 0);
      const { data, error } = await supabase
        .from("goals")
        .insert({ user_id: profile.user_id, label: trimmed, target_amount: targetAmount, priority: nextPriority })
        .select()
        .single();
      if (error) throw error;
      setGoals((gs) => [...gs, data as Goal].sort((a, b) => a.priority - b.priority));
    },
    [supabase, profile.user_id, goals]
  );

  const updateGoal = useCallback(
    async (id: string, patch: Partial<Pick<Goal, "label" | "target_amount" | "current_amount" | "priority">>) => {
      setGoals((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)).sort((a, b) => a.priority - b.priority));
      const { error } = await supabase.from("goals").update(patch).eq("id", id);
      if (error) throw error;
    },
    [supabase]
  );

  // Deferred-delete buffer so "Delete" can offer an Undo toast instead of a confirm dialog —
  // same shape as transactions' pendingDeletes above, just keyed to a different table/list.
  const pendingGoalDeletes = useRef<Record<string, { goal: Goal; timer: ReturnType<typeof setTimeout> }>>({});

  const deleteGoal = useCallback(
    (id: string, onFailure?: () => void) => {
      const goal = goals.find((g) => g.id === id);
      if (!goal) return;
      setGoals((gs) => gs.filter((g) => g.id !== id));
      const timer = setTimeout(async () => {
        delete pendingGoalDeletes.current[id];
        const { error } = await supabase.from("goals").delete().eq("id", id);
        if (error) {
          setGoals((gs) => [...gs, goal].sort((a, b) => a.priority - b.priority));
          onFailure?.();
        }
      }, UNDO_WINDOW_MS);
      pendingGoalDeletes.current[id] = { goal, timer };
    },
    [supabase, goals]
  );

  const undoDeleteGoal = useCallback((id: string) => {
    const pending = pendingGoalDeletes.current[id];
    if (!pending) return;
    clearTimeout(pending.timer);
    delete pendingGoalDeletes.current[id];
    setGoals((gs) => [...gs, pending.goal].sort((a, b) => a.priority - b.priority));
  }, []);

  const addTransfer = useCallback(
    async (from: keyof Omit<Balances, "user_id">, to: keyof Omit<Balances, "user_id">, amount: number, note?: string) => {
      if (from === to || !(amount > 0)) return;
      // Persist the transfer row first — if the caller retries after a failure, applying the
      // balance patch only once the row is safely saved avoids moving the money twice.
      const { data, error } = await supabase
        .from("transfers")
        .insert({ user_id: profile.user_id, from_account: from, to_account: to, amount, note: note || null })
        .select()
        .single();
      if (error) throw error;
      setTransfers((ts) => [data as Transfer, ...ts]);
      await updateBalances(applyTransfer(balances, from, to, amount));
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
      const codeLots = holding ? holdingLots.filter((l) => l.code === holding.code) : [];
      if (holding) setHoldingLots((ls) => ls.filter((l) => l.code !== holding.code));
      const { error } = await supabase.from("holdings").delete().eq("id", id);
      if (error) throw error;
      if (holding) {
        // Drop its buy history too — otherwise re-adding the same code later would resurrect
        // a stale average cost from lots the holding no longer has any connection to.
        const { error: lotsErr } = await supabase.from("holding_lots").delete().eq("user_id", profile.user_id).eq("code", holding.code);
        if (lotsErr) throw lotsErr;

        // Refund whatever funded each lot, and remove this holding's value from the shares
        // balance — best estimate is its last priced value, falling back to cost basis for a
        // holding that was never priced. Approximate until the next "Refresh prices".
        const totalCost = codeLots.reduce((s, l) => s + l.shares * l.price, 0);
        const estimatedValue = holding.last_price != null ? holding.last_price * holding.shares : totalCost;
        const refundByAccount = new Map<string, number>();
        codeLots.forEach((l) => refundByAccount.set(l.account, (refundByAccount.get(l.account) ?? 0) + l.shares * l.price));
        const patch: Partial<Omit<Balances, "user_id">> = { shares: roundCents((Number(balances.shares) || 0) - estimatedValue) };
        refundByAccount.forEach((refund, account) => {
          const key = account as keyof Omit<Balances, "user_id">;
          patch[key] = roundCents((Number(balances[key]) || 0) + refund);
        });
        await updateBalances(patch);
      }
    },
    [supabase, holdings, holdingLots, profile.user_id, balances, updateBalances]
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
      let price = q ? q.price! : h.last_price;
      if (price == null) {
        // Never priced (e.g. quote failed on a brand-new holding) — fall back to average cost
        // from its buy lots rather than silently contributing $0 to the total.
        const codeLots = holdingLots.filter((l) => l.code === h.code);
        const totalCost = codeLots.reduce((s, l) => s + l.shares * l.price, 0);
        const totalLotShares = codeLots.reduce((s, l) => s + l.shares, 0);
        price = totalLotShares > 0 ? totalCost / totalLotShares : 0;
      }
      return sum + price * h.shares;
    }, 0);
    await updateBalances({ shares: total });
  }, [holdings, holdingLots, supabase, profile.user_id, updateBalances]);

  // Logs a buy lot (for DCA/P&L), folds it into that code's current share count — creating the
  // holding if this is a new code — and debits the funding account for the cash actually spent
  // (crediting `shares` by the same amount, refined later by "Refresh prices" once real quotes
  // come in). Selling isn't tracked as lots (no FIFO/CGT parcel accounting here); use the
  // holding row's Shares field directly for that correction.
  const addHoldingLot = useCallback(
    async (code: string, shares: number, price: number, date: string, account: keyof Omit<Balances, "user_id"> = "everyday") => {
      const normalizedCode = code.trim().toUpperCase();
      if (!normalizedCode || !(shares > 0) || !(price > 0)) return;
      const { data, error } = await supabase
        .from("holding_lots")
        .insert({ user_id: profile.user_id, code: normalizedCode, shares, price, date, account })
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
      await updateBalances(applyTransfer(balances, account, "shares", shares * price));
    },
    [supabase, profile.user_id, holdings, balances, updateBalances]
  );

  // Reverses what addHoldingLot did: removes the lot, subtracts its shares back off that code's
  // holding, and refunds the account that funded it.
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
        await updateBalances(applyTransfer(balances, "shares", lot.account as keyof Omit<Balances, "user_id">, lot.shares * lot.price));
      }
    },
    [supabase, holdingLots, holdings, balances, updateBalances]
  );

  const addSuperContribution = useCallback(
    async (
      date: string,
      amount: number,
      type: SuperContribution["type"],
      taxDeductible: boolean,
      affectsBalance: boolean,
      note?: string,
      account?: keyof Omit<Balances, "user_id">
    ) => {
      if (!(amount > 0)) return;
      // Only meaningful for a "personal" contribution — salary sacrifice is pre-tax and never
      // touched a tracked balance, so there's nothing to debit.
      const fundingAccount = type === "personal" ? account : undefined;
      const { data, error } = await supabase
        .from("super_contributions")
        .insert({
          user_id: profile.user_id,
          date,
          amount,
          type,
          tax_deductible: taxDeductible,
          affects_balance: affectsBalance,
          account: fundingAccount ?? null,
          note: note || null,
        })
        .select()
        .single();
      if (error) throw error;
      setSuperContributions((cs) => [data as SuperContribution, ...cs]);
      if (affectsBalance) {
        const patch = fundingAccount ? applyTransfer(balances, fundingAccount, "superb", amount) : applyIncomeToAccount(balances, "superb", amount);
        await updateBalances(patch);
      }
    },
    [supabase, profile.user_id, balances, updateBalances]
  );

  const deleteSuperContribution = useCallback(
    async (id: string) => {
      const contribution = superContributions.find((c) => c.id === id);
      setSuperContributions((cs) => cs.filter((c) => c.id !== id));
      const { error } = await supabase.from("super_contributions").delete().eq("id", id);
      if (error) throw error;
      if (contribution?.affects_balance) {
        const fundingAccount = contribution.account as keyof Omit<Balances, "user_id"> | null;
        const patch = fundingAccount
          ? applyTransfer(balances, "superb", fundingAccount, contribution.amount)
          : applyIncomeToAccount(balances, "superb", contribution.amount, -1);
        await updateBalances(patch);
      }
    },
    [supabase, superContributions, balances, updateBalances]
  );

  const addRecurringExpense = useCallback(
    async (description: string, amount: number, categoryKey: string, account: string, frequency: RecurringFrequency, nextDue: string) => {
      if (!(amount > 0) || !description.trim()) return;
      const { data, error } = await supabase
        .from("recurring_expenses")
        .insert({
          user_id: profile.user_id,
          description: description.trim(),
          amount,
          category_key: categoryKey,
          account,
          frequency,
          next_due: nextDue,
        })
        .select()
        .single();
      if (error) throw error;
      setRecurringExpenses((rs) => [...rs, data as RecurringExpense].sort((a, b) => a.next_due.localeCompare(b.next_due)));
    },
    [supabase, profile.user_id]
  );

  const pendingRecurringDeletes = useRef<Record<string, { recurring: RecurringExpense; timer: ReturnType<typeof setTimeout> }>>({});

  const deleteRecurringExpense = useCallback(
    (id: string, onFailure?: () => void) => {
      const recurring = recurringExpenses.find((r) => r.id === id);
      if (!recurring) return;
      setRecurringExpenses((rs) => rs.filter((r) => r.id !== id));
      const timer = setTimeout(async () => {
        delete pendingRecurringDeletes.current[id];
        const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);
        if (error) {
          setRecurringExpenses((rs) => [...rs, recurring].sort((a, b) => a.next_due.localeCompare(b.next_due)));
          onFailure?.();
        }
      }, UNDO_WINDOW_MS);
      pendingRecurringDeletes.current[id] = { recurring, timer };
    },
    [supabase, recurringExpenses]
  );

  const undoDeleteRecurringExpense = useCallback((id: string) => {
    const pending = pendingRecurringDeletes.current[id];
    if (!pending) return;
    clearTimeout(pending.timer);
    delete pendingRecurringDeletes.current[id];
    setRecurringExpenses((rs) => [...rs, pending.recurring].sort((a, b) => a.next_due.localeCompare(b.next_due)));
  }, []);

  const toggleRecurringExpense = useCallback(
    async (id: string) => {
      const r = recurringExpenses.find((x) => x.id === id);
      if (!r) return;
      const active = !r.active;
      setRecurringExpenses((rs) => rs.map((x) => (x.id === id ? { ...x, active } : x)));
      const { error } = await supabase.from("recurring_expenses").update({ active }).eq("id", id);
      if (error) throw error;
    },
    [supabase, recurringExpenses]
  );

  const logRecurringExpense = useCallback(
    async (id: string) => {
      const r = recurringExpenses.find((x) => x.id === id);
      if (!r) return;
      await addTransaction({
        date: r.next_due,
        description: r.description,
        amount: r.amount,
        category_key: r.category_key,
        account: r.account,
      });
      const nextDue = nextOccurrence(r.next_due, r.frequency);
      setRecurringExpenses((rs) => rs.map((x) => (x.id === id ? { ...x, next_due: nextDue } : x)));
      const { error } = await supabase.from("recurring_expenses").update({ next_due: nextDue }).eq("id", id);
      if (error) throw error;
    },
    [supabase, recurringExpenses, addTransaction]
  );

  const resetData = useCallback(
    async (sel: ResetDataSelections) => {
      const uid = profile.user_id;
      const ops: PromiseLike<{ error: { message: string } | null }>[] = [];

      if (sel.transactions) ops.push(supabase.from("transactions").delete().eq("user_id", uid));
      if (sel.payslips) ops.push(supabase.from("payslips").delete().eq("user_id", uid));
      if (sel.miscIncome) ops.push(supabase.from("misc_income").delete().eq("user_id", uid));
      if (sel.reconciliations) ops.push(supabase.from("reconciliations").delete().eq("user_id", uid));
      if (sel.snapshots) ops.push(supabase.from("snapshots").delete().eq("user_id", uid));
      if (sel.transfers) ops.push(supabase.from("transfers").delete().eq("user_id", uid));
      if (sel.holdings) {
        ops.push(supabase.from("holding_lots").delete().eq("user_id", uid));
        ops.push(supabase.from("holdings").delete().eq("user_id", uid));
      }
      if (sel.superContributions) ops.push(supabase.from("super_contributions").delete().eq("user_id", uid));
      if (sel.recurringExpenses) ops.push(supabase.from("recurring_expenses").delete().eq("user_id", uid));
      if (sel.goalsDelete) {
        ops.push(supabase.from("goals").delete().eq("user_id", uid));
      } else if (sel.goalsProgress) {
        ops.push(supabase.from("goals").update({ current_amount: 0 }).eq("user_id", uid));
      }
      if (sel.balances) {
        ops.push(
          supabase
            .from("balances")
            .update({ everyday: 0, anzplus: 0, emergency: 0, holiday: 0, shares: 0, superb: 0, cc: 0, hecs: 0 })
            .eq("user_id", uid)
        );
      }
      if (sel.budgetCategories) {
        // Same semantics as Plan's "Restore baseline": brings each built-in category back to its
        // original label/amounts (recreating it if it was deleted); leaves custom categories alone.
        DEFAULT_CATEGORIES.forEach((d) => {
          ops.push(
            supabase
              .from("budget_categories")
              .upsert(
                { user_id: uid, key: d.id, label: d.label, amount_2026: d.amount2026, amount_2027: d.amount2027, sort: d.sort, frequency: d.frequency },
                { onConflict: "user_id,key" }
              )
          );
        });
      }
      if (sel.profileSettings) ops.push(supabase.from("profiles").update(DEFAULT_PROFILE_SETTINGS).eq("user_id", uid));

      const results = await Promise.all(ops);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);

      // This wipe can touch nearly every table at once — reloading is the only way to be sure
      // every array/object in this provider (there are ~15 of them) ends up matching the DB,
      // rather than trying to hand-patch each one and risk missing something.
      window.location.reload();
    },
    [supabase, profile.user_id]
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
    superContributions,
    recurringExpenses,
    miscIncome,
    goals,
    periods,
    D,
    planPath,
    loggedByCat,
    updateProfile,
    updateCategory,
    addCategory,
    deleteCategory,
    addTransaction,
    addTransactionsBulk,
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
    addSuperContribution,
    deleteSuperContribution,
    addRecurringExpense,
    deleteRecurringExpense,
    undoDeleteRecurringExpense,
    toggleRecurringExpense,
    logRecurringExpense,
    addMiscIncome,
    deleteMiscIncome,
    addGoal,
    updateGoal,
    deleteGoal,
    undoDeleteGoal,
    resetData,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
