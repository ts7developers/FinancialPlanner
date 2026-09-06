-- Web push subscriptions (one browser/device registration each) and a log of reminders already
-- sent, so the daily cron job never pushes the same "payday tomorrow" or "bill due" notification
-- twice even if it runs more than once for the same day.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions: owner all" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.sent_reminders (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- e.g. "payday:2026-09-08", "bill:<recurring_expense_id>:2026-09-10", "reconcile:2026-08-24"
  reminder_key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, reminder_key)
);

alter table public.sent_reminders enable row level security;
create policy "sent_reminders: owner all" on public.sent_reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
