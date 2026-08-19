"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildPeriods, isoFromDate, periodKeyOf, type Period } from "@/lib/period";
import { slugifyCategoryKey } from "@/lib/categories";
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
  type DerivedFinancials,
  type PlanPathPoint,
} from "@/lib/derive";
import type {
  Profile,
  BudgetCategoryRow,
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
  superContributions: SuperContribution[];
  recurringExpenses: RecurringExpense[];
  miscIncome: MiscIncome[];
  goals: Goal[];
  periods: Period[];
  D: DerivedFinancials;
  planPath: PlanPathPoint[];
  loggedByCat: Record<string, Record<string, number>>;

  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  updateCategory: (key: string, patch: Partial<Pick<BudgetCategoryRow, "label" | "amount_2026" | "amount_2027">>) => Promise<void>;
  /** Slugifies the label into a new unique key unless `explicitKey` is given (used to recreate a default category with its original key). */
  addCategory: (label: string, amount2026?: number, amount2027?: number, explicitKey?: string) => Promise<void>;
  deleteCategory: (key: string) => Promise<void>;
  addTransaction: (t: NewTransaction) => Promise<void>;
  /** Removes the transaction from view immediately; the DB delete is deferred so `undoDeleteTransaction` can still cancel it. */
  deleteTransaction: (id: string) => void;
  undoDeleteTransaction: (id: string) => void;
  setReconciliation: (
    periodKey: string,
    patch: Partial<Pick<Reconciliation, "actual_income" | "actual_overrides" | "closed_at">>
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
  addHoldingLot: (code: string, shares: number, price: number, date: string) => Promise<void>;
  deleteHoldingLot: (id: string) => Promise<void>;
  addSuperContribution: (
    date: string,
    amount: number,
    type: SuperContribution["type"],
    taxDeductible: boolean,
    affectsBalance: boolean,
    note?: string
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
  deleteRecurringExpense: (id: string) => Promise<void>;
  toggleRecurringExpense: (id: string) => Promise<void>;
  /** Posts today's occurrence as a real transaction (so it flows through the usual balance/reconciliation path) and rolls next_due forward one cadence. */
  logRecurringExpense: (id: string) => Promise<void>;
  /** One-off income (tax refund, gift, side gig, etc) — lands in Everyday immediately and adds to that fortnight's actual income on Reconcile. */
  addMiscIncome: (date: string, description: string, amount: number, account?: keyof Omit<Balances, "user_id">) => Promise<void>;
  deleteMiscIncome: (id: string) => Promise<void>;
  /** A custom savings goal beyond the emergency fund and house deposit — see the `Goal` type. */
  addGoal: (label: string, targetAmount: number, priority?: number) => Promise<void>;
  updateGoal: (id: string, patch: Partial<Pick<Goal, "label" | "target_amount" | "current_amount" | "priority">>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
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
  const [recurringExpenses, setRecurringExpenses] = useState(initialRecurringExpenses);
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
    async (key: string, patch: Partial<Pick<BudgetCategoryRow, "label" | "amount_2026" | "amount_2027">>) => {
      setCategories((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
      const { error } = await supabase.from("budget_categories").update(patch).eq("user_id", profile.user_id).eq("key", key);
      if (error) throw error;
    },
    [supabase, profile.user_id]
  );

  const addCategory = useCallback(
    async (label: string, amount2026 = 0, amount2027 = 0, explicitKey?: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const key = explicitKey ?? slugifyCategoryKey(trimmed, categories.map((c) => c.key));
      const sort = categories.length > 0 ? Math.max(...categories.map((c) => c.sort)) + 1 : 0;
      const { data, error } = await supabase
        .from("budget_categories")
        .insert({ user_id: profile.user_id, key, label: trimmed, amount_2026: amount2026, amount_2027: amount2027, sort })
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
    async (periodKey: string, patch: Partial<Pick<Reconciliation, "actual_income" | "actual_overrides" | "closed_at">>) => {
      const existing = reconciliations[periodKey] || { period_key: periodKey, actual_income: null, actual_overrides: {}, closed_at: null };
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
      const alreadyConfirmed = payslips.find((p) => p.id === id)?.status === "confirmed";
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
      await setReconciliation(periodKey, { actual_income: periodTotal > 0 ? periodTotal : null });
      // Only the first confirmation lands the pay in Everyday — re-confirming an already-posted
      // payslip (e.g. after correcting a figure) must not double-count it.
      if (!alreadyConfirmed) await updateBalances(applyIncomeToBalance(balances, fields.net));
    },
    [supabase, setReconciliation, payslips, miscIncome, profile.pay_anchor, balances, updateBalances]
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
        await setReconciliation(periodKey, { actual_income: periodTotal > 0 ? periodTotal : null });
      }
    },
    [supabase, profile.user_id, profile.pay_anchor, balances, updateBalances, payslips, miscIncome, setReconciliation]
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
        await setReconciliation(periodKey, { actual_income: periodTotal > 0 ? periodTotal : null });
      }
    },
    [supabase, miscIncome, balances, updateBalances, payslips, profile.pay_anchor, setReconciliation]
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

  const deleteGoal = useCallback(
    async (id: string) => {
      setGoals((gs) => gs.filter((g) => g.id !== id));
      const { error } = await supabase.from("goals").delete().eq("id", id);
      if (error) throw error;
    },
    [supabase]
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

  const addSuperContribution = useCallback(
    async (date: string, amount: number, type: SuperContribution["type"], taxDeductible: boolean, affectsBalance: boolean, note?: string) => {
      if (!(amount > 0)) return;
      const { data, error } = await supabase
        .from("super_contributions")
        .insert({ user_id: profile.user_id, date, amount, type, tax_deductible: taxDeductible, affects_balance: affectsBalance, note: note || null })
        .select()
        .single();
      if (error) throw error;
      setSuperContributions((cs) => [data as SuperContribution, ...cs]);
      if (affectsBalance) await updateBalances({ superb: balances.superb + amount });
    },
    [supabase, profile.user_id, balances, updateBalances]
  );

  const deleteSuperContribution = useCallback(
    async (id: string) => {
      const contribution = superContributions.find((c) => c.id === id);
      setSuperContributions((cs) => cs.filter((c) => c.id !== id));
      if (contribution?.affects_balance) await updateBalances({ superb: balances.superb - contribution.amount });
      const { error } = await supabase.from("super_contributions").delete().eq("id", id);
      if (error) throw error;
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

  const deleteRecurringExpense = useCallback(
    async (id: string) => {
      setRecurringExpenses((rs) => rs.filter((r) => r.id !== id));
      const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    [supabase]
  );

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
    toggleRecurringExpense,
    logRecurringExpense,
    addMiscIncome,
    deleteMiscIncome,
    addGoal,
    updateGoal,
    deleteGoal,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
