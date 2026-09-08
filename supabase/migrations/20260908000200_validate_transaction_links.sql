create or replace function public.validate_transaction_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.contact_id is not null and not exists (
    select 1
    from public.contacts
    where id = new.contact_id
      and user_id = new.user_id
  ) then
    raise exception 'Contact does not belong to this ledger.';
  end if;

  if new.category_id is not null and not exists (
    select 1
    from public.categories
    where id = new.category_id
      and transaction_type = new.transaction_type
      and (user_id is null or user_id = new.user_id)
  ) then
    raise exception 'Category is not available for this transaction type.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_transactions_links on public.transactions;
create trigger validate_transactions_links
before insert or update on public.transactions
for each row execute function public.validate_transaction_links();
