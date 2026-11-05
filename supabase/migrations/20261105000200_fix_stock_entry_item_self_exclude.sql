-- Fix: editing a stock entry failed with "Only 0 pieces of PUR-xxxxxx are still waiting to be
-- weighed into stock." when that entry already weighed the whole (or most of the) purchase.
--
-- validate_stock_entry_item() summed how many pieces of the purchase are already stocked and
-- excluded the current row with `id is distinct from new.id`. But save_stock_entry re-saves items
-- with `insert ... on conflict (stock_entry_id, purchase_id) do update`. On that path the BEFORE
-- INSERT trigger fires for the proposed row with a *newly allocated* id (the identity default is
-- evaluated before the conflict is resolved), so `new.id` no longer matches the existing row and
-- the entry's own allocation was counted against itself — doubling it and rejecting the edit.
--
-- Exclude the current entry's own allocation by stock_entry_id instead (there is at most one row
-- per (stock_entry_id, purchase_id)), so the check counts only pieces weighed into *other* entries.

create or replace function public.validate_stock_entry_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_record record;
  entry_owner uuid;
  stocked numeric;
begin
  select id, trader_id, purchase_mode, coconut_quantity
  into purchase_record
  from public.coconut_trades
  where id = new.purchase_id;

  if not found or purchase_record.trader_id <> new.trader_id then
    raise exception 'Purchase does not belong to this trader.';
  end if;

  if purchase_record.purchase_mode <> 'quantity' then
    raise exception 'PUR-% is weight-based and is already sellable; only per-nut purchases are weighed into stock.',
      lpad(new.purchase_id::text, 6, '0');
  end if;

  select trader_id into entry_owner from public.stock_entries where id = new.stock_entry_id;
  if entry_owner is null or entry_owner <> new.trader_id then
    raise exception 'Stock entry does not belong to this trader.';
  end if;

  -- Pieces of this purchase already weighed into OTHER stock entries (exclude this entry's own row,
  -- which is the one being inserted/updated — matching by stock_entry_id survives the
  -- insert-on-conflict path where new.id is a fresh identity value).
  select coalesce(sum(quantity_pieces), 0)
  into stocked
  from public.stock_entry_items
  where purchase_id = new.purchase_id
    and stock_entry_id <> new.stock_entry_id;

  if stocked + new.quantity_pieces > purchase_record.coconut_quantity + 0.001 then
    raise exception 'Only % pieces of PUR-% are still waiting to be weighed into stock.',
      trim(to_char(purchase_record.coconut_quantity - stocked, 'FM999999999990.##')),
      lpad(new.purchase_id::text, 6, '0');
  end if;

  return new;
end;
$$;
