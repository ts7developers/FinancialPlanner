// Baseline plan settings — spec §3/§5, mirrors the DB column defaults in
// supabase/migrations/0001_init.sql. Used by the Plan tab's "Restore baseline" action.

export const DEFAULT_PROFILE_SETTINGS = {
  package: 68000,
  super_rate: 0.12,
  pt_fraction: 0.8,
  hecs_threshold: 69528,
  pay_anchor: "2026-08-24",
  ft_start: "2026-10-19",
  open_deposit: 3000,
  emergency_target: 5000,
  house_target: 680000,
  deposit_pct: 0.05,
  fhog: 10000,
  buying_costs: 3000,
  cc_opening: 190.6,
};
