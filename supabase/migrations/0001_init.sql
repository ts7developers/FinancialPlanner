-- Personal Finance Reconciliation App — initial schema (build spec §6).
-- All tables are scoped to auth.uid() with owner-only RLS.

create extension if not exists "pgcrypto";

-- ============ profiles ============
-- One row per user: plan/settings (spec §3-§5 defaults, editable on the Plan tab).
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  package numeric not null default 68000,
  super_rate numeric not null default 0.12,
  pt_fraction numeric not null default 0.8,
  hecs_threshold numeric not null default 69528,
  pay_anchor date not null default '2026-08-24',
  ft_start date not null default '2026-10-19',
  open_deposit numeric not null default 3000,
  emergency_target numeric not null default 5000,
  house_target numeric not null default 680000,
  deposit_pct numeric not null default 0.05,
  fhog numeric not null default 10000,
  buying_costs numeric not null default 3000,
  cc_opening numeric not null default 190.60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "profiles: owner select" on public.profiles for select using (auth.uid() = user_id);
create policy "profiles: owner insert" on public.profiles for insert with check (auth.uid() = user_id);
create policy "profiles: owner update" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "profiles: owner delete" on public.profiles for delete using (auth.uid() = user_id);

-- ============ budget_categories ============
-- Per-user, seeded from spec §4 on signup (see handle_new_user below).
create table if not exists public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  label text not null,
  amount_2026 numeric not null default 0,
  amount_2027 numeric not null default 0,
  sort int not null default 0,
  unique (user_id, key)
);

alter table public.budget_categories enable row level security;
create policy "budget_categories: owner all" on public.budget_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ transactions ============
-- Subledger: every expense as it's logged. Period key derived at query time from `date`.
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  description text,
  amount numeric not null,
  category_key text not null,
  account text not null,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, date);

alter table public.transactions enable row level security;
create policy "transactions: owner all" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ reconciliations ============
-- Period close: manual actual_income + per-category overrides for a fortnight.
create table if not exists public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_key date not null,
  actual_income numeric,
  actual_overrides jsonb not null default '{}'::jsonb,
  closed_at timestamptz,
  unique (user_id, period_key)
);

alter table public.reconciliations enable row level security;
create policy "reconciliations: owner all" on public.reconciliations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ snapshots ============
-- Balance snapshots feeding the "actual" dots on the deposit trajectory chart.
create table if not exists public.snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_key date not null,
  taken_at timestamptz not null default now(),
  deposit numeric not null default 0,
  emergency numeric not null default 0,
  unique (user_id, period_key)
);

alter table public.snapshots enable row level security;
create policy "snapshots: owner all" on public.snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ balances ============
-- Current balance per account, one row per user, updated in place (spec §5).
create table if not exists public.balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  everyday numeric not null default 0,
  anzplus numeric not null default 3000,
  emergency numeric not null default 0,
  holiday numeric not null default 0,
  shares numeric not null default 3546.50,
  superb numeric not null default 19790.73,
  cc numeric not null default 190.60,
  hecs numeric not null default 45182.77,
  updated_at timestamptz not null default now()
);

alter table public.balances enable row level security;
create policy "balances: owner all" on public.balances
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ payslips ============
-- Uploaded payslip + Claude-extracted figures (spec §7). Never auto-posted — `status`
-- moves uploaded -> parsed -> confirmed only once the user reviews the extraction.
create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_key date not null,
  file_path text,
  status text not null default 'uploaded' check (status in ('uploaded', 'parsed', 'confirmed')),
  gross numeric,
  paygw_tax numeric,
  super numeric,
  net numeric,
  help_hecs numeric,
  allowances jsonb not null default '[]'::jsonb,
  period_start date,
  period_end date,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists payslips_user_period_idx on public.payslips (user_id, period_key);

alter table public.payslips enable row level security;
create policy "payslips: owner all" on public.payslips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ new-user bootstrap ============
-- Seeds a default profile, balances row, and the spec §4 default budget categories
-- for every new auth user, so the app has sane defaults from first sign-in.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  insert into public.balances (user_id) values (new.id);

  insert into public.budget_categories (user_id, key, label, amount_2026, amount_2027, sort) values
    (new.id, 'board', 'Board', 0, 433.33, 0),
    (new.id, 'groceries', 'Groceries', 476.67, 476.67, 1),
    (new.id, 'fuel', 'Fuel', 238.33, 238.33, 2),
    (new.id, 'carins', 'Car insurance', 58.34, 58.34, 3),
    (new.id, 'rego', 'Car rego', 68.72, 68.72, 4),
    (new.id, 'gym', 'Gym', 82.12, 82.12, 5),
    (new.id, 'bball', 'Basketball', 58.54, 58.54, 6),
    (new.id, 'health', 'Private health', 0, 130, 7),
    (new.id, 'claude', 'Claude Pro', 34, 34, 8),
    (new.id, 'iracing', 'iRacing', 17.13, 17.13, 9),
    (new.id, 'fun', 'Fun money', 216.67, 216.67, 10);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ storage: private payslips bucket ============
-- Objects are keyed "<user_id>/<filename>"; RLS checks the first path segment against auth.uid().
insert into storage.buckets (id, name, public)
values ('payslips', 'payslips', false)
on conflict (id) do nothing;

create policy "payslips bucket: owner select"
  on storage.objects for select
  using (bucket_id = 'payslips' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "payslips bucket: owner insert"
  on storage.objects for insert
  with check (bucket_id = 'payslips' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "payslips bucket: owner delete"
  on storage.objects for delete
  using (bucket_id = 'payslips' and auth.uid()::text = (storage.foldername(name))[1]);
