import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Profile, BudgetCategoryRow, Transaction, Reconciliation, Snapshot, Balances } from "@/lib/types";

export interface AppData {
  profile: Profile;
  categories: BudgetCategoryRow[];
  transactions: Transaction[];
  reconciliations: Reconciliation[];
  snapshots: Snapshot[];
  balances: Balances;
}

/** Loads everything the authed app shell needs for a user in one round trip. */
export async function fetchAppData(userId: string): Promise<AppData> {
  const supabase = await createClient();

  const [profileRes, categoriesRes, transactionsRes, reconciliationsRes, snapshotsRes, balancesRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).single(),
    supabase.from("budget_categories").select("*").eq("user_id", userId).order("sort"),
    supabase.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }),
    supabase.from("reconciliations").select("*").eq("user_id", userId),
    supabase.from("snapshots").select("*").eq("user_id", userId).order("period_key"),
    supabase.from("balances").select("*").eq("user_id", userId).single(),
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
  };
}
