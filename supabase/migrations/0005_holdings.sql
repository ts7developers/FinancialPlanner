-- Individual share holdings for the Investments panel on Accounts — replaces manually typing
-- a single lump "Shares" balance with per-holding quantities that a price refresh (via
-- /api/investments/quote) revalues automatically. Last-fetched price is cached on the row so
-- the tracker still shows a value before the next refresh.
create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  shares numeric not null default 0,
  last_price numeric,
  last_change_pct numeric,
  priced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, code)
);

alter table public.holdings enable row level security;
create policy "holdings: owner all" on public.holdings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
