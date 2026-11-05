-- Fix a regression introduced by 20261105000100: that migration rebuilt save_stock_entry from an
-- older copy and dropped the stock-stage wastage handling (and the sale-rate / husk fields). As a
-- result, editing a stock entry no longer reconciled stock_wastage (so the purchase kept showing
-- the old "N wasted / N left" and the Wastage page kept the stale pieces), coconut_quantity was
-- stored as the pieces TAKEN instead of the pieces LOADED, and new entries lost their sale rate and
-- husk details.
--
-- This restores the full correct behaviour from 20261018000100 (loaded_pieces, stock_wastage
-- rebuild on every save, sale-rate + husk fields) while keeping the dehusking-pieces / dehusking-team
-- additions from 20261105000100 (the cost and the booked expense are on the dehusked piece count and
-- attributed to the chosen dehusking team).

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
  husk_rate numeric := coalesce((entry_input->>'husk_rate_per_piece')::numeric, 0);
  husk_colour text := nullif(entry_input->>'husk_color', '');
  husk_count numeric := nullif(entry_input->>'husk_pieces', '')::numeric;
  deh_pieces numeric := nullif(entry_input->>'dehusking_pieces', '')::numeric;
  deh_team bigint := nullif(entry_input->>'dehusking_team_id', '')::bigint;
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
    insert into public.stock_entries (trader_id, entry_date, processing_type, net_weight_kg, wastage_percent, coconut_quantity, dehusking_rate_per_1000, dehusking_pieces, dehusking_team_id, sale_rate_per_kg, husk_rate_per_piece, husk_color, husk_pieces, notes)
    values (
      auth.uid(),
      entry_day,
      coalesce(entry_input->>'processing_type', 'mottai'),
      (entry_input->>'net_weight_kg')::numeric,
      coalesce((entry_input->>'wastage_percent')::numeric, 0),
      loaded_pieces,
      dehusking_rate,
      deh_pieces,
      deh_team,
      sale_rate,
      husk_rate,
      husk_colour,
      husk_count,
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
      dehusking_pieces = deh_pieces,
      dehusking_team_id = deh_team,
      sale_rate_per_kg = sale_rate,
      husk_rate_per_piece = husk_rate,
      husk_color = husk_colour,
      husk_pieces = husk_count,
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

  -- Rebuild this entry's stock-stage wastage from the input (so edits reconcile it everywhere).
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

  -- Book the dehusking cost on the dehusked piece count (default the loaded pieces) and attribute
  -- it to the chosen dehusking team so it shows in that team's payment history.
  dehusking_total := round(coalesce(deh_pieces, loaded_pieces) / 1000 * dehusking_rate, 2);
  if dehusking_total > 0 then
    if exists (select 1 from public.expenses where stock_entry_id = entry_key) then
      update public.expenses
      set expense_date = entry_day,
          amount = dehusking_total,
          category = 'dehusking_labor',
          scope = 'coconut',
          employee_id = deh_team,
          description = 'Dehusking for stock entry STK-' || lpad(entry_key::text, 6, '0')
      where stock_entry_id = entry_key and trader_id = auth.uid();
    else
      insert into public.expenses (trader_id, expense_date, category, scope, amount, employee_id, stock_entry_id, description)
      values (auth.uid(), entry_day, 'dehusking_labor', 'coconut', dehusking_total, deh_team, entry_key, 'Dehusking for stock entry STK-' || lpad(entry_key::text, 6, '0'));
    end if;
  else
    delete from public.expenses where stock_entry_id = entry_key and trader_id = auth.uid();
  end if;

  return entry_key;
end;
$$;

grant execute on function public.save_stock_entry(jsonb, jsonb) to authenticated;
