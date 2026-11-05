-- Same class of bug as the stock-entry fix, for sales: editing a sale that already committed most
-- of a purchase's pieces failed with "Only N pieces remain in PUR-xxxxxx." save_sale re-saves its
-- items with `insert ... on conflict (sale_id, purchase_id) do update`, and validate_sale_item
-- excluded the current sale_item by id (via purchase_committed_pieces(..., new.id, ...)). On the
-- on-conflict path the BEFORE INSERT trigger fires with a freshly allocated new.id, so the sale's
-- own existing item was counted against itself and the edit was rejected.
--
-- Compute committed pieces excluding this sale's own items by sale_id instead (there is at most one
-- row per (sale_id, purchase_id)). Wastage is not excluded here, matching the previous behaviour:
-- save_sale deletes this sale's stock_wastage before re-inserting its items, so it is already gone.

create or replace function public.validate_sale_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_record record;
  sale_owner uuid;
  committed numeric;
  stocked numeric;
begin
  select id, trader_id, purchase_mode, coconut_quantity
  into purchase_record
  from public.coconut_trades
  where id = new.purchase_id;

  if not found or purchase_record.trader_id <> new.trader_id then
    raise exception 'Purchase does not belong to this trader.';
  end if;

  select trader_id into sale_owner from public.sales where id = new.sale_id;
  if sale_owner is null or sale_owner <> new.trader_id then
    raise exception 'Sale does not belong to this trader.';
  end if;

  -- Pieces of this purchase committed to OTHER sales (exclude this sale's own items, which are being
  -- inserted/updated via on-conflict where new.id is a fresh identity) plus any stock wastage.
  committed := coalesce((select sum(quantity_pieces) from public.sale_items
                         where purchase_id = new.purchase_id and sale_id is distinct from new.sale_id), 0)
             + coalesce((select sum(quantity_pieces) from public.stock_wastage
                         where purchase_id = new.purchase_id), 0);

  if committed + new.quantity_pieces > purchase_record.coconut_quantity + 0.001 then
    raise exception 'Only % pieces remain in PUR-%.',
      trim(to_char(greatest(purchase_record.coconut_quantity - committed, 0), 'FM999999999990.##')),
      lpad(new.purchase_id::text, 6, '0');
  end if;

  if purchase_record.purchase_mode = 'quantity' then
    stocked := public.purchase_stocked_pieces(new.purchase_id);
    if committed + new.quantity_pieces > stocked + 0.001 then
      raise exception 'Only % pieces of PUR-% are in stock. Weigh more into stock before selling.',
        trim(to_char(greatest(stocked - committed, 0), 'FM999999999990.##')),
        lpad(new.purchase_id::text, 6, '0');
    end if;
  end if;

  return new;
end;
$$;
