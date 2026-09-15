-- Custom accounts (see 0025_accounts.sql) now carry their own real balance, so they can be a
-- genuine transfer destination and appear alongside the built-in accounts on Accounts, not just
-- a label attached to a goal.
alter table public.accounts add column if not exists balance numeric not null default 0;
