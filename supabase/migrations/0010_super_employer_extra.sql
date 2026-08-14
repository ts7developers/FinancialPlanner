-- Employer super contributions this FY that aren't captured by an uploaded/confirmed payslip
-- (e.g. a casual job paid outside the main payslip flow) but are already reflected in the real
-- Super balance on Accounts. Added only to the "Employer super (FY YTD)" display figure on the
-- Super tab, never to the balance itself, so it doesn't get double-counted.
alter table public.profiles
  add column if not exists super_employer_extra numeric not null default 0;
