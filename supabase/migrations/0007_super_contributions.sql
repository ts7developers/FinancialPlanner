-- Voluntary super contributions (salary sacrifice / personal) for the Super tab's First Home
-- Super Saver (FHSS) tracker. Compulsory employer SG contributions aren't logged here — they
-- aren't FHSS-eligible and are already reflected in the payslip-derived YTD super figure.
create table if not exists public.super_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  amount numeric not null check (amount > 0),
  type text not null default 'salary_sacrifice' check (type in ('salary_sacrifice', 'personal')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists super_contributions_user_date_idx on public.super_contributions (user_id, date);

alter table public.super_contributions enable row level security;
create policy "super_contributions: owner all" on public.super_contributions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
