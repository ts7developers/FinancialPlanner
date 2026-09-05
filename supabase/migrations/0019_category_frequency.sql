-- Lets each budget category be entered as a weekly OR monthly figure instead of always monthly.
alter table public.budget_categories add column if not exists frequency text not null default 'monthly';
alter table public.budget_categories add constraint budget_categories_frequency_check check (frequency in ('weekly', 'monthly'));
