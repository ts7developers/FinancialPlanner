-- Tax-deductible items and their receipt photos/PDFs, for EOFY substantiation. Either standalone
-- (transaction_id null — something never logged as a regular household expense, e.g. a work
-- uniform) or linked to an existing transaction (tagging spend you already logged on Expenses as
-- also being deductible), so both entry points share one list and one financial-year total.
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  description text not null,
  amount numeric not null check (amount > 0),
  deduction_category text not null default 'other',
  file_path text,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists receipts_user_date_idx on public.receipts (user_id, date);

alter table public.receipts enable row level security;
create policy "receipts: owner all" on public.receipts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ storage: private receipts bucket ============
-- Objects are keyed "<user_id>/<filename>"; RLS checks the first path segment against auth.uid() —
-- same convention as the payslips bucket (see 0001_init.sql).
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts bucket: owner select"
  on storage.objects for select
  using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "receipts bucket: owner insert"
  on storage.objects for insert
  with check (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "receipts bucket: owner delete"
  on storage.objects for delete
  using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);
