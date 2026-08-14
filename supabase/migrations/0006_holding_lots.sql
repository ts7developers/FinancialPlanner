-- Buy history per ASX holding, for computing DCA (average cost) and unrealized P/L on the
-- Investments panel. Only buys are logged — this is a simple average-cost tracker, not a
-- CGT-parcel (FIFO) accounting tool, and isn't tax advice.
create table if not exists public.holding_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  shares numeric not null check (shares > 0),
  price numeric not null check (price > 0),
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists holding_lots_user_code_idx on public.holding_lots (user_id, code);

alter table public.holding_lots enable row level security;
create policy "holding_lots: owner all" on public.holding_lots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
