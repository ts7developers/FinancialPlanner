export interface Profile {
  user_id: string;
  display_name: string | null;
  package: number;
  super_rate: number;
  pt_fraction: number;
  hecs_threshold: number;
  pay_anchor: string; // ISO date
  ft_start: string; // ISO date
  open_deposit: number;
  emergency_target: number;
  house_target: number;
  deposit_pct: number;
  fhog: number;
  buying_costs: number;
  cc_opening: number;
  tax_paid_opening: number;
}

export interface BudgetCategoryRow {
  id: string;
  user_id: string;
  key: string;
  label: string;
  amount_2026: number;
  amount_2027: number;
  sort: number;
}

export interface Transaction {
  id: string;
  user_id: string;
  date: string; // ISO date
  description: string | null;
  amount: number;
  category_key: string;
  account: string;
  created_at: string;
}

export interface Reconciliation {
  id?: string;
  user_id?: string;
  period_key: string; // ISO date
  actual_income: number | null;
  actual_overrides: Record<string, string>; // raw input strings, e.g. "150" or "" — mirrors <input> value
  closed_at?: string | null;
}

export interface Snapshot {
  id: string;
  user_id: string;
  period_key: string;
  taken_at: string;
  deposit: number;
  emergency: number;
}

export interface Balances {
  user_id: string;
  everyday: number;
  anzplus: number;
  emergency: number;
  holiday: number;
  shares: number;
  superb: number;
  cc: number;
  hecs: number;
}

export type PayslipStatus = "uploaded" | "parsed" | "confirmed";

export interface Payslip {
  id: string;
  user_id: string;
  period_key: string;
  file_path: string | null;
  status: PayslipStatus;
  gross: number | null;
  paygw_tax: number | null;
  super: number | null;
  net: number | null;
  help_hecs: number | null;
  allowances: { label: string; amount: number }[];
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  confirmed_at: string | null;
}
