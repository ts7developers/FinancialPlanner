-- Snapshots only ever captured the deposit and emergency fund balances, so "how much have I paid
-- off the credit card over time" or a HECS trend wasn't answerable from the UI. Extending the same
-- table (rather than a new one) keeps every balance captured at the same moment, one row per snapshot.
alter table public.snapshots add column if not exists cc numeric not null default 0;
alter table public.snapshots add column if not exists hecs numeric not null default 0;
