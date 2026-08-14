export interface Profile {
  user_id: string;
  display_name: string | null;
  package: number;
  super_rate: number;
  pt_fraction: number;
  /** Legacy field — HECS repayment now uses the real ATO marginal schedule (lib/tax.ts) instead of a single editable threshold. Kept to avoid a migration; no longer read by any calculation. */
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
  partner_income: number;
  income_growth_pct: number;
  /** Employer super this FY not captured by a payslip (e.g. a casual job) — already in the real balance, added only to the YTD display figure. */
  super_employer_extra: number;
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

export interface Transfer {
  id: string;
  user_id: string;
  date: string; // ISO date
  from_account: keyof Omit<Balances, "user_id">;
  to_account: keyof Omit<Balances, "user_id">;
  amount: number;
  note: string | null;
  created_at: string;
}

export interface Holding {
  id: string;
  user_id: string;
  code: string;
  shares: number;
  last_price: number | null;
  last_change_pct: number | null;
  priced_at: string | null;
  created_at: string;
}

export interface HoldingLot {
  id: string;
  user_id: string;
  code: string;
  shares: number;
  price: number;
  date: string;
  created_at: string;
}

export interface SuperContribution {
  id: string;
  user_id: string;
  date: string;
  amount: number;
  type: "salary_sacrifice" | "personal";
  /** Concessional (claimed as a tax deduction, or always true for salary sacrifice) vs non-concessional. */
  tax_deductible: boolean;
  /** Whether this contribution was folded into the "superb" balance when logged (false for historical backfills already reflected in the current balance). */
  affects_balance: boolean;
  note: string | null;
  created_at: string;
}

export type RecurringFrequency = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";

export interface RecurringExpense {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  category_key: string;
  account: string;
  frequency: RecurringFrequency;
  next_due: string; // ISO date
  active: boolean;
  created_at: string;
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
