-- Lets the user move money between their own tracked accounts (e.g. payday: Everyday ->
-- pay off Credit card, top up Emergency fund / ANZ Plus deposit) as a single atomic action
-- that updates both balances and leaves an auditable record, matching the rest of the app's
-- ledger style (transactions, snapshots).

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  from_account text not null,
  to_account text not null,
  amount numeric not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists transfers_user_date_idx on public.transfers (user_id, date);

alter table public.transfers enable row level security;
create policy "transfers: owner all" on public.transfers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
