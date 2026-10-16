-- Stock-stage wastage: when the coconuts actually loaded/weighed are fewer than the
-- pieces taken from the purchase, the leftover is wasted at the Stock stage (a loss; the
-- farmer was already paid per nut). We reuse the existing stock_wastage table so the
-- existing stock/sale guards keep working: the pieces taken stay as the stock entry's
-- quantity, and the wasted pieces reduce what can be sold, exactly like sale-stage wastage.
-- A stock_entry_id ties each wastage row to its entry so editing/deleting the entry cleans up.

alter table public.stock_wastage
  add column if not exists stock_entry_id bigint references public.stock_entries (id) on delete cascade;

create index if not exists stock_wastage_entry_idx on public.stock_wastage (stock_entry_id);

-- save_stock_entry now also records the wasted pieces (quantity taken minus loaded) per
-- purchase, and rebuilds them on edit. Dehusking is charged on the loaded pieces only.
create or replace function public.save_stock_entry(entry_input jsonb, items_input jsonb default '[]'::jsonb)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  entry_key bigint := nullif(entry_input->>'id', '')::bigint;
  item jsonb;
  item_purchase bigint;
  item_pieces numeric;
  item_wasted numeric;
  total_pieces numeric;
  total_wasted numeric;
  loaded_pieces numeric;
  dehusking_rate numeric := coalesce((entry_input->>'dehusking_rate_per_1000')::numeric, 0);
  sale_rate numeric := coalesce((entry_input->>'sale_rate_per_kg')::numeric, 0);
  dehusking_total numeric;
  entry_day date := coalesce((entry_input->>'entry_date')::date, current_date);
begin
  if auth.uid() is null then
    raise exception 'Sign in to save a stock entry.';
  end if;

  select coalesce(sum((entry->>'quantity_pieces')::numeric), 0),
         coalesce(sum((entry->>'wastage_pieces')::numeric), 0)
  into total_pieces, total_wasted
  from jsonb_array_elements(coalesce(items_input, '[]'::jsonb)) as entry;

  if total_pieces <= 0 then
    raise exception 'Tick at least one per-nut purchase to weigh into stock.';
  end if;
  if total_wasted >= total_pieces then
    raise exception 'The coconuts loaded must be more than zero.';
  end if;

  loaded_pieces := total_pieces - total_wasted;

  if entry_key is null then
    insert into public.stock_entries (trader_id, entry_date, processing_type, net_weight_kg, wastage_percent, coconut_quantity, dehusking_rate_per_1000, sale_rate_per_kg, notes)
    values (
      auth.uid(),
      entry_day,
      coalesce(entry_input->>'processing_type', 'mottai'),
      (entry_input->>'net_weight_kg')::numeric,
      coalesce((entry_input->>'wastage_percent')::numeric, 0),
      loaded_pieces,
      dehusking_rate,
      sale_rate,
      nullif(entry_input->>'notes', '')
    )
    returning id into entry_key;
  else
    update public.stock_entries set
      entry_date = entry_day,
      processing_type = coalesce(entry_input->>'processing_type', processing_type),
      net_weight_kg = (entry_input->>'net_weight_kg')::numeric,
      wastage_percent = coalesce((entry_input->>'wastage_percent')::numeric, 0),
      coconut_quantity = loaded_pieces,
      dehusking_rate_per_1000 = dehusking_rate,
      sale_rate_per_kg = sale_rate,
      notes = nullif(entry_input->>'notes', '')
    where id = entry_key and trader_id = auth.uid();

    if not found then
      raise exception 'Stock entry not found.';
    end if;

    delete from public.stock_entry_items
    where stock_entry_id = entry_key
      and purchase_id not in (
        select (entry->>'purchase_id')::bigint
        from jsonb_array_elements(coalesce(items_input, '[]'::jsonb)) as entry
      );
  end if;

  -- Rebuild this entry's stock-stage wastage from the input.
  delete from public.stock_wastage where stock_entry_id = entry_key and trader_id = auth.uid();

  for item in select * from jsonb_array_elements(coalesce(items_input, '[]'::jsonb)) loop
    item_purchase := (item->>'purchase_id')::bigint;
    item_pieces := (item->>'quantity_pieces')::numeric;
    item_wasted := coalesce((item->>'wastage_pieces')::numeric, 0);

    update public.stock_entry_items set quantity_pieces = item_pieces
    where stock_entry_id = entry_key and purchase_id = item_purchase;
    if not found then
      insert into public.stock_entry_items (trader_id, stock_entry_id, purchase_id, quantity_pieces)
      values (auth.uid(), entry_key, item_purchase, item_pieces);
    end if;

    if item_wasted > 0 then
      insert into public.stock_wastage (trader_id, purchase_id, sale_id, stock_entry_id, wastage_date, quantity_pieces, reason)
      values (auth.uid(), item_purchase, null, entry_key, entry_day, item_wasted, 'Wasted while weighing STK-' || lpad(entry_key::text, 6, '0'));
    end if;
  end loop;

  dehusking_total := round(loaded_pieces / 1000 * dehusking_rate, 2);
  if dehusking_total > 0 then
    if exists (select 1 from public.expenses where stock_entry_id = entry_key) then
      update public.expenses
      set expense_date = entry_day,
          amount = dehusking_total,
          category = 'dehusking_labor',
          scope = 'coconut',
          description = 'Dehusking for stock entry STK-' || lpad(entry_key::text, 6, '0')
      where stock_entry_id = entry_key and trader_id = auth.uid();
    else
      insert into public.expenses (trader_id, expense_date, category, scope, amount, stock_entry_id, description)
      values (auth.uid(), entry_day, 'dehusking_labor', 'coconut', dehusking_total, entry_key, 'Dehusking for stock entry STK-' || lpad(entry_key::text, 6, '0'));
    end if;
  else
    delete from public.expenses where stock_entry_id = entry_key and trader_id = auth.uid();
  end if;

  return entry_key;
end;
$$;

grant execute on function public.save_stock_entry(jsonb, jsonb) to authenticated;
