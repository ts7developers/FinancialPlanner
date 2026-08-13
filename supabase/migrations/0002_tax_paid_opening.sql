-- Adds an editable opening balance for tax already paid this financial year (e.g. from a
-- previous job, or payslips predating this app) so the Overview "Tax paid (FY YTD)" figure
-- isn't limited to only what's been uploaded/confirmed as a payslip in-app.

alter table public.profiles
  add column if not exists tax_paid_opening numeric not null default 0;
