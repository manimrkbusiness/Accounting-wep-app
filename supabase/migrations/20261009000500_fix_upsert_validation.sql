-- Allocation rows were written with INSERT ... ON CONFLICT DO UPDATE. The insert-side
-- trigger runs before the conflict is detected, so an existing allocation was counted
-- twice when a sale or stock entry was edited near the stock limit. Both saves now
-- update the existing row first and insert only when there is none.

create or replace function public.save_sale(sale_input jsonb, items_input jsonb default '[]'::jsonb)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  sale_key bigint := nullif(sale_input->>'id', '')::bigint;
  item jsonb;
  item_purchase bigint;
  item_pieces numeric;
  item_wasted numeric;
  sale_day date := coalesce((sale_input->>'sale_date')::date, current_date);
begin
  if auth.uid() is null then
    raise exception 'Sign in to save a sale.';
  end if;

  if sale_key is null then
    insert into public.sales (
      trader_id, buyer_id, sale_kind, product, sale_date, coconut_color, processing_type, unit, quantity, rate,
      coconut_quantity, gross_weight_kg, empty_weight_kg, transport_charge, deduction_amount, deduction_reason,
      advance_amount, vehicle_id, vehicle_number, payment_status, notes
    )
    values (
      auth.uid(),
      (sale_input->>'buyer_id')::bigint,
      coalesce(sale_input->>'sale_kind', 'coconut'),
      coalesce(sale_input->>'product', 'coconut'),
      sale_day,
      coalesce(sale_input->>'coconut_color', 'green'),
      coalesce(sale_input->>'processing_type', 'mottai'),
      coalesce(sale_input->>'unit', 'kg'),
      (sale_input->>'quantity')::numeric,
      (sale_input->>'rate')::numeric,
      coalesce((sale_input->>'coconut_quantity')::numeric, 0),
      nullif(sale_input->>'gross_weight_kg', '')::numeric,
      nullif(sale_input->>'empty_weight_kg', '')::numeric,
      coalesce((sale_input->>'transport_charge')::numeric, 0),
      coalesce((sale_input->>'deduction_amount')::numeric, 0),
      nullif(sale_input->>'deduction_reason', ''),
      coalesce((sale_input->>'advance_amount')::numeric, 0),
      nullif(sale_input->>'vehicle_id', '')::bigint,
      nullif(sale_input->>'vehicle_number', ''),
      coalesce(sale_input->>'payment_status', 'pending'),
      nullif(sale_input->>'notes', '')
    )
    returning id into sale_key;
  else
    update public.sales set
      buyer_id = (sale_input->>'buyer_id')::bigint,
      sale_kind = coalesce(sale_input->>'sale_kind', sale_kind),
      product = coalesce(sale_input->>'product', product),
      sale_date = sale_day,
      coconut_color = coalesce(sale_input->>'coconut_color', coconut_color),
      processing_type = coalesce(sale_input->>'processing_type', processing_type),
      unit = coalesce(sale_input->>'unit', unit),
      quantity = (sale_input->>'quantity')::numeric,
      rate = (sale_input->>'rate')::numeric,
      coconut_quantity = coalesce((sale_input->>'coconut_quantity')::numeric, 0),
      gross_weight_kg = nullif(sale_input->>'gross_weight_kg', '')::numeric,
      empty_weight_kg = nullif(sale_input->>'empty_weight_kg', '')::numeric,
      transport_charge = coalesce((sale_input->>'transport_charge')::numeric, 0),
      deduction_amount = coalesce((sale_input->>'deduction_amount')::numeric, 0),
      deduction_reason = nullif(sale_input->>'deduction_reason', ''),
      advance_amount = coalesce((sale_input->>'advance_amount')::numeric, 0),
      vehicle_id = nullif(sale_input->>'vehicle_id', '')::bigint,
      vehicle_number = nullif(sale_input->>'vehicle_number', ''),
      payment_status = coalesce(sale_input->>'payment_status', payment_status),
      notes = nullif(sale_input->>'notes', '')
    where id = sale_key and trader_id = auth.uid();

    if not found then
      raise exception 'Sale not found.';
    end if;

    delete from public.sale_items
    where sale_id = sale_key
      and purchase_id not in (
        select (entry->>'purchase_id')::bigint
        from jsonb_array_elements(coalesce(items_input, '[]'::jsonb)) as entry
        where coalesce((entry->>'quantity_pieces')::numeric, 0) > 0
      );
  end if;

  delete from public.stock_wastage where sale_id = sale_key and trader_id = auth.uid();

  for item in select * from jsonb_array_elements(coalesce(items_input, '[]'::jsonb)) loop
    item_purchase := (item->>'purchase_id')::bigint;
    item_pieces := coalesce((item->>'quantity_pieces')::numeric, 0);
    item_wasted := coalesce((item->>'wastage_pieces')::numeric, 0);

    if item_pieces > 0 then
      update public.sale_items set quantity_pieces = item_pieces
      where sale_id = sale_key and purchase_id = item_purchase;
      if not found then
        insert into public.sale_items (trader_id, sale_id, purchase_id, quantity_pieces)
        values (auth.uid(), sale_key, item_purchase, item_pieces);
      end if;
    else
      delete from public.sale_items where sale_id = sale_key and purchase_id = item_purchase;
    end if;

    if item_wasted > 0 then
      insert into public.stock_wastage (trader_id, purchase_id, sale_id, wastage_date, quantity_pieces, reason)
      values (auth.uid(), item_purchase, sale_key, sale_day, item_wasted, 'Wasted while building SAL-' || lpad(sale_key::text, 6, '0'));
    end if;
  end loop;

  return sale_key;
end;
$$;

grant execute on function public.save_sale(jsonb, jsonb) to authenticated;

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
  total_pieces numeric;
  dehusking_rate numeric := coalesce((entry_input->>'dehusking_rate_per_1000')::numeric, 0);
  sale_rate numeric := coalesce((entry_input->>'sale_rate_per_kg')::numeric, 0);
  dehusking_total numeric;
  entry_day date := coalesce((entry_input->>'entry_date')::date, current_date);
begin
  if auth.uid() is null then
    raise exception 'Sign in to save a stock entry.';
  end if;

  select coalesce(sum((entry->>'quantity_pieces')::numeric), 0)
  into total_pieces
  from jsonb_array_elements(coalesce(items_input, '[]'::jsonb)) as entry;

  if total_pieces <= 0 then
    raise exception 'Tick at least one per-nut purchase to weigh into stock.';
  end if;

  if entry_key is null then
    insert into public.stock_entries (trader_id, entry_date, processing_type, net_weight_kg, wastage_percent, coconut_quantity, dehusking_rate_per_1000, sale_rate_per_kg, notes)
    values (
      auth.uid(),
      entry_day,
      coalesce(entry_input->>'processing_type', 'mottai'),
      (entry_input->>'net_weight_kg')::numeric,
      coalesce((entry_input->>'wastage_percent')::numeric, 0),
      total_pieces,
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
      coconut_quantity = total_pieces,
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

  for item in select * from jsonb_array_elements(coalesce(items_input, '[]'::jsonb)) loop
    item_purchase := (item->>'purchase_id')::bigint;
    item_pieces := (item->>'quantity_pieces')::numeric;
    update public.stock_entry_items set quantity_pieces = item_pieces
    where stock_entry_id = entry_key and purchase_id = item_purchase;
    if not found then
      insert into public.stock_entry_items (trader_id, stock_entry_id, purchase_id, quantity_pieces)
      values (auth.uid(), entry_key, item_purchase, item_pieces);
    end if;
  end loop;

  dehusking_total := round(total_pieces / 1000 * dehusking_rate, 2);
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
