export interface Profile {
  user_id: string;
  display_name: string | null;
  package: number;
  super_rate: number;
  /** Real gross pay for a full part-time fortnight (before `ft_start`), entered directly from a payslip rather than estimated as a fraction of `package`. */
  pt_fortnightly_gross: number;
  /** Legacy field — HECS repayment now uses the real ATO marginal schedule (lib/tax.ts) instead of a single editable threshold. Kept to avoid a migration; no longer read by any calculation. */
  hecs_threshold: number;
  pay_anchor: string; // ISO date — the start of the very first fortnight, not a payday
  /** Days after each fortnight's last day that pay actually lands (0 = paid on the fortnight's own last day). Since every fortnight is exactly 14 days, the fortnight-end weekday never changes, so this one number fixes which weekday you're always paid on. */
  payday_offset_days: number;
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
  /** Custom order for where fortnightly surplus goes (credit card paydown always comes first,
   * fixed, ahead of this). Null means "use the default": emergency fund, then each goal in its
   * own priority order, then the house deposit — see `resolveAllocationOrder`. */
  allocation_order: AllocationOrder | null;
}

/** One destination for surplus: "emergency", "deposit", a goal's id, or an extra tracked balance. */
export interface AllocationItem {
  id: string;
  /** Share of surplus this destination gets, relative to the others — they don't need to add up
   * to exactly 100, since shares split proportionally either way. */
  weightPct: number;
}

/** A flat, percentage-weighted split of fortnightly surplus across every destination at once.
 * Once a capped destination (a goal's target, the emergency fund's target) is full, its leftover
 * share redistributes to the rest automatically — see `allocateTier` in lib/derive.ts. */
export type AllocationOrder = AllocationItem[];

export type BudgetFrequency = "weekly" | "monthly";

export interface BudgetCategoryRow {
  id: string;
  user_id: string;
  key: string;
  label: string;
  amount_2026: number;
  amount_2027: number;
  sort: number;
  /** Whether amount_2026/amount_2027 are a weekly or monthly figure — defaults to "monthly" for every category created before this existed. */
  frequency: BudgetFrequency;
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
  /**
   * Emergency fund / goal balances as they stood right before this fortnight's first confirmed
   * income landed. "Where this pay goes" (PayslipPanel) uses this frozen snapshot instead of live
   * balances so the plan doesn't reshuffle itself as you actually carry out the transfers it
   * recommends. The `cc` field is stored for history but deliberately NOT used this way — the
   * card balance keeps growing from ongoing spending, so its payoff recommendation always reads
   * the live balance instead (see useFortnightBreakdown).
   */
  breakdown_baseline?: { cc: number; emergency: number; goals: { id: string; current_amount: number }[] } | null;
}

export interface Snapshot {
  id: string;
  user_id: string;
  period_key: string;
  taken_at: string;
  deposit: number;
  emergency: number;
  cc: number;
  hecs: number;
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
  /** Which balance funded this buy (a key of `Balances`, e.g. "everyday") — reversed here if the lot is deleted. */
  account: string;
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
  /** Which balance funded a "personal" contribution (a key of `Balances`) — null for salary_sacrifice, which is pre-tax and never touched a tracked balance. */
  account: string | null;
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

/** A custom savings goal beyond the built-in emergency fund and house deposit — e.g. "New car"
 * or "Trip to Japan". Tracked as its own virtual balance (`current_amount`, edited directly like
 * an account balance) with a `priority` controlling funding order in the fortnightly waterfall
 * (lower number = funded first, after the emergency fund and before the house deposit).
 *
 * Setting `due_date` switches funding from a percentage-of-surplus share (set on the Pay split
 * tab) to a fixed $/fortnight need — the shortfall to `target_amount` divided by the fortnights
 * left until then, recalculated fresh each time so it self-corrects regardless of how much has
 * actually been paid in so far. Due-date goals are funded right after the credit card, ahead of
 * every percentage-based destination (see `dueDateGoalNeed`/`fortnightBreakdown` in lib/derive.ts)
 * — good for a known, dated bill like rego or car insurance rather than an open-ended target. */
export interface Goal {
  id: string;
  user_id: string;
  label: string;
  target_amount: number;
  current_amount: number;
  priority: number;
  created_at: string;
  due_date?: string | null;
  /** Which real account this goal's money lives in (a built-in `ACCOUNTS` label from lib/theme.ts,
   * or a custom one from `CustomAccount`) — purely a reference for where to move money, doesn't
   * affect any balance or calculation. */
  account?: string | null;
}

/** A user-named account beyond the fixed `ACCOUNTS` list (lib/theme.ts) — e.g. a dedicated bank
 * sub-account for a specific goal. Just a label; it has no tracked balance of its own. */
export interface CustomAccount {
  id: string;
  user_id: string;
  label: string;
  created_at: string;
}

/** A one-off income entry that isn't a payslip (tax refund, gift, reimbursement, side gig, etc). */
export interface MiscIncome {
  id: string;
  user_id: string;
  date: string;
  description: string | null;
  amount: number;
  /** Which balance this landed in — a key of `Balances` (e.g. "everyday", "anzplus"). */
  account: string;
  created_at: string;
}

export type DeductionCategory =
  | "work_related_travel"
  | "work_related_clothing"
  | "self_education"
  | "tools_equipment"
  | "home_office"
  | "donations"
  | "income_protection"
  | "other";

/** A tax-deductible item and (usually) its receipt, for EOFY substantiation. Either standalone
 * (`transaction_id` null — never logged as a regular household expense, e.g. a work uniform) or
 * linked to an existing Expenses entry (tagging spend already logged there as also deductible). */
export interface Receipt {
  id: string;
  user_id: string;
  date: string;
  description: string;
  amount: number;
  deduction_category: DeductionCategory;
  file_path: string | null;
  transaction_id: string | null;
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
