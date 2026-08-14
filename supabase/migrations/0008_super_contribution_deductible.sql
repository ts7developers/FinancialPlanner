-- Whether a super contribution was claimed as a personal tax deduction (concessional) or not
-- (non-concessional) — this changes how it's taxed on FHSS release: concessional principal
-- and all deemed earnings are assessable income (with a 30% tax offset); non-concessional
-- principal is released tax-free. Salary-sacrifice contributions are always concessional.
alter table public.super_contributions
  add column if not exists tax_deductible boolean not null default true;

-- Whether logging this contribution should also top up the "superb" balance on Accounts.
-- Default true for contributions made from now on; a historical backfill (e.g. a contribution
-- made last FY that's already reflected in today's real balance) should be logged with this
-- set to false, or it would double-count.
alter table public.super_contributions
  add column if not exists affects_balance boolean not null default true;
