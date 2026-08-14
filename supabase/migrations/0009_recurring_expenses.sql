-- Recurring expenses (rent, subscriptions, insurance, etc.) that repeat on a fixed cadence.
-- Logging one is a deliberate action from the Expenses tab, not an automatic background job —
-- the app surfaces which ones are due and the user taps "Log it", which posts a normal
-- transaction (so it flows through the usual balance/reconciliation machinery) and rolls
-- next_due forward by one cadence.
create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount numeric not null check (amount > 0),
  category_key text not null default 'other',
  account text not null default 'Everyday',
  frequency text not null default 'monthly' check (frequency in ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
  next_due date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists recurring_expenses_user_idx on public.recurring_expenses (user_id, next_due);

alter table public.recurring_expenses enable row level security;
create policy "recurring_expenses: owner all" on public.recurring_expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
