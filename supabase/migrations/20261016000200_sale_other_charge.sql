-- Other charges recovered from the buyer: amounts the trader paid on the buyer's behalf
-- (a weighbridge fee, another purchase, etc.) that the buyer reimburses. They are added to
-- what the buyer pays, alongside transport and after any deduction.

alter table public.sales
  add column if not exists other_charge_amount numeric(14, 2) not null default 0 check (other_charge_amount >= 0),
  add column if not exists other_charge_reason text;

-- Rebuild the buyer-total generated columns so they include the recovered charges.
alter table public.sales drop column if exists total_amount;
alter table public.sales add column total_amount numeric(14, 2)
  generated always as ((quantity * rate) + transport_charge + other_charge_amount - deduction_amount) stored;

alter table public.sales drop column if exists balance_amount;
alter table public.sales add column balance_amount numeric(14, 2)
  generated always as ((quantity * rate) + transport_charge + other_charge_amount - deduction_amount - advance_amount) stored;

-- save_sale now stores the recovered charges and their reason.
create or replace function public.save_sale(sale_input jsonb, items_input jsonb default '[]'::jsonb)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  sale_key bigint := nullif(sale_input->>'id', '')::bigint;
  item jsonb;
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
      other_charge_amount, other_charge_reason, advance_amount, vehicle_id, vehicle_number, payment_status, notes
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
      coalesce((sale_input->>'other_charge_amount')::numeric, 0),
      nullif(sale_input->>'other_charge_reason', ''),
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
      other_charge_amount = coalesce((sale_input->>'other_charge_amount')::numeric, 0),
      other_charge_reason = nullif(sale_input->>'other_charge_reason', ''),
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
    item_pieces := coalesce((item->>'quantity_pieces')::numeric, 0);
    item_wasted := coalesce((item->>'wastage_pieces')::numeric, 0);

    if item_pieces > 0 then
      insert into public.sale_items (trader_id, sale_id, purchase_id, quantity_pieces)
      values (auth.uid(), sale_key, (item->>'purchase_id')::bigint, item_pieces)
      on conflict (sale_id, purchase_id) do update set quantity_pieces = excluded.quantity_pieces;
    else
      delete from public.sale_items where sale_id = sale_key and purchase_id = (item->>'purchase_id')::bigint;
    end if;

    if item_wasted > 0 then
      insert into public.stock_wastage (trader_id, purchase_id, sale_id, wastage_date, quantity_pieces, reason)
      values (auth.uid(), (item->>'purchase_id')::bigint, sale_key, sale_day, item_wasted, 'Wasted while building SAL-' || lpad(sale_key::text, 6, '0'));
    end if;
  end loop;

  return sale_key;
end;
$$;

grant execute on function public.save_sale(jsonb, jsonb) to authenticated;
