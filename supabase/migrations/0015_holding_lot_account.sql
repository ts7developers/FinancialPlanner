-- Logging a share buy never debited the account the cash actually came from — money seemingly
-- appeared in the shares balance for free. Track which account funded each lot so a buy can
-- debit it (and reverse correctly against the same account if the lot is deleted).
alter table public.holding_lots add column if not exists account text not null default 'everyday';
