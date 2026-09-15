-- Custom, user-named accounts (e.g. a dedicated ANZ Plus sub-account for "Rego savings") beyond
-- the fixed set in lib/theme.ts's ACCOUNTS — just a label, no tracked balance of its own, so a
-- goal can record which real account its money physically lives in.
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);

alter table public.accounts enable row level security;
create policy "accounts: owner all" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Which account (a built-in ACCOUNTS label or a custom one from the table above) a goal's money
-- lives in — free text, same non-normalized pattern as transactions.account / recurring_expenses.account.
alter table public.goals add column if not exists account text;
