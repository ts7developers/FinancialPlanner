-- A "personal" (post-tax) super contribution is money that actually left one of your other
-- accounts — but nothing ever debited it, so logging one silently created money. Salary-sacrifice
-- contributions are pre-tax and never touched a tracked balance in the first place, so this stays
-- null for those. Nullable/no default since it only applies to the personal case.
alter table public.super_contributions add column if not exists account text;
