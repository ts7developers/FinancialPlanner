-- Days after each fortnight's last day that pay actually lands (e.g. "paid the Tuesday after
-- the fortnight ends" = 2). Defaults to 2 to match the account this app currently serves —
-- adjust in Supabase directly if this is ever used for a different pay cycle.
alter table public.profiles add column if not exists payday_offset_days integer not null default 2;
