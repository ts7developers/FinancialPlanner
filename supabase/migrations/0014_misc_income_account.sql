-- Misc income always landed in Everyday regardless of where the money actually went. Track which
-- balance it should land in (same set as Accounts' transfer picker), defaulting existing rows to
-- "everyday" since that's where they were all actually applied before this column existed.
alter table public.misc_income add column if not exists account text not null default 'everyday';
