-- Deleting a purchase or a sale must remove the labour/delivery expenses that were booked from it.
-- These links were ON DELETE SET NULL, so when the source row was deleted the expense's purchase_id
-- / sale_id was nulled *before* the AFTER-DELETE cleanup trigger ran — the trigger then found nothing
-- to delete and the expense was left orphaned, still counted on the Dashboard and in the team's
-- pending wages. Switch both links to ON DELETE CASCADE so the expense is removed with its source.
-- (Stock and harvesting labour already cascade; farmer payments in the cash book intentionally stay.)

alter table public.expenses drop constraint if exists expenses_purchase_id_fkey;
alter table public.expenses
  add constraint expenses_purchase_id_fkey foreign key (purchase_id)
  references public.coconut_trades (id) on delete cascade;

alter table public.expenses drop constraint if exists expenses_sale_id_fkey;
alter table public.expenses
  add constraint expenses_sale_id_fkey foreign key (sale_id)
  references public.sales (id) on delete cascade;

-- One-time cleanup of expenses already orphaned by earlier deletes: auto-booked labour/delivery
-- costs with no source link left. Only the app's own generated descriptions are matched, so
-- manually entered expenses are untouched.
delete from public.expenses
  where purchase_id is null and sale_id is null and stock_entry_id is null and harvesting_entry_id is null
    and (description like 'Dehusking on %' or description like 'Harvesting on %' or description like 'Husk delivery %');
