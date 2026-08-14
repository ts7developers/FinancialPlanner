-- Adds inputs for the borrowing-capacity estimate on the Overview tab: a partner's annual
-- income (0 = solo) and an assumed annual salary growth rate (0 = flat), both optional.
alter table public.profiles
  add column if not exists partner_income numeric not null default 0,
  add column if not exists income_growth_pct numeric not null default 0;
