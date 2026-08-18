-- Custom savings goals beyond the built-in emergency fund and house deposit — e.g. "New car",
-- "Trip to Japan". Tracked as their own virtual balance (current_amount) that the user updates
-- directly, same pattern as the balances table, plus a priority so buildFortnightSplit and
-- buildNetWorthProjection know which order to fund them in once there's fortnightly surplus
-- left over (after expenses, recurring set-asides, credit card paydown, and the emergency fund).
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  target_amount numeric not null check (target_amount > 0),
  current_amount numeric not null default 0 check (current_amount >= 0),
  priority integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists goals_user_priority_idx on public.goals (user_id, priority);

alter table public.goals enable row level security;
create policy "goals: owner all" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
