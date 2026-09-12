-- Real part-time fortnightly gross pay, entered directly from a payslip instead of estimated as a
-- percentage of the full-time `package` — that estimate had no clean way to represent an
-- hourly-rate part-time role. $31.14/hr at ~30hrs/week -> $1868.14 for a full part-time fortnight,
-- fixed until ft_start for the account this app currently serves.
alter table public.profiles add column if not exists pt_fortnightly_gross numeric not null default 2092.31;
update public.profiles set pt_fortnightly_gross = 1868.14;
alter table public.profiles drop column if exists pt_fraction;
