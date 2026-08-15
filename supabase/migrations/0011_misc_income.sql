-- One-off income that isn't a payslip — a tax refund, a gift, reimbursement, side-gig payment,
-- etc. Logging one lands the amount in Everyday immediately (like a confirmed payslip) and adds
-- to that fortnight's actual income on Reconcile, so it isn't invisible to the plan-vs-actual view.
create table if not exists public.misc_income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  description text,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists misc_income_user_date_idx on public.misc_income (user_id, date);

alter table public.misc_income enable row level security;
create policy "misc_income: owner all" on public.misc_income
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
