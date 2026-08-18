import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Profile, BudgetCategoryRow, Transaction, Reconciliation, Snapshot, Balances, Payslip, Transfer, Holding, HoldingLot, SuperContribution, RecurringExpense, MiscIncome, Goal } from "@/lib/types";

export interface AppData {
  profile: Profile;
  categories: BudgetCategoryRow[];
  transactions: Transaction[];
  reconciliations: Reconciliation[];
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
}

/** Loads everything the authed app shell needs for a user in one round trip. */
export async function fetchAppData(userId: string): Promise<AppData> {
  const supabase = await createClient();

  const [
    profileRes,
    categoriesRes,
    transactionsRes,
    reconciliationsRes,
    snapshotsRes,
    balancesRes,
    payslipsRes,
    transfersRes,
    holdingsRes,
    holdingLotsRes,
    superContributionsRes,
    recurringExpensesRes,
    miscIncomeRes,
    goalsRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).single(),
    supabase.from("budget_categories").select("*").eq("user_id", userId).order("sort"),
    supabase.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }),
    supabase.from("reconciliations").select("*").eq("user_id", userId),
    supabase.from("snapshots").select("*").eq("user_id", userId).order("period_key"),
    supabase.from("balances").select("*").eq("user_id", userId).single(),
    supabase.from("payslips").select("*").eq("user_id", userId).order("period_key"),
    supabase.from("transfers").select("*").eq("user_id", userId).order("date", { ascending: false }),
    supabase.from("holdings").select("*").eq("user_id", userId).order("code"),
    supabase.from("holding_lots").select("*").eq("user_id", userId).order("date", { ascending: false }),
    supabase.from("super_contributions").select("*").eq("user_id", userId).order("date", { ascending: false }),
    supabase.from("recurring_expenses").select("*").eq("user_id", userId).order("next_due"),
    supabase.from("misc_income").select("*").eq("user_id", userId).order("date", { ascending: false }),
    supabase.from("goals").select("*").eq("user_id", userId).order("priority"),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (balancesRes.error) throw balancesRes.error;

  return {
    profile: profileRes.data as Profile,
    categories: (categoriesRes.data ?? []) as BudgetCategoryRow[],
    transactions: (transactionsRes.data ?? []) as Transaction[],
    reconciliations: (reconciliationsRes.data ?? []) as Reconciliation[],
    snapshots: (snapshotsRes.data ?? []) as Snapshot[],
    balances: balancesRes.data as Balances,
    payslips: (payslipsRes.data ?? []) as Payslip[],
    transfers: (transfersRes.data ?? []) as Transfer[],
    holdings: (holdingsRes.data ?? []) as Holding[],
    holdingLots: (holdingLotsRes.data ?? []) as HoldingLot[],
    superContributions: (superContributionsRes.data ?? []) as SuperContribution[],
    recurringExpenses: (recurringExpensesRes.data ?? []) as RecurringExpense[],
    miscIncome: (miscIncomeRes.data ?? []) as MiscIncome[],
    goals: (goalsRes.data ?? []) as Goal[],
  };
}
