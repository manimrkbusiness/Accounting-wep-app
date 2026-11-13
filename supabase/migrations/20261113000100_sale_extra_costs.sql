-- "Your costs on this sale": a flexible list of expenses the trader pays on a coconut or husk sale
-- (transport, loading, driver/diesel, other, or any custom category). Each line is booked as an
-- expense tied to the sale (so it cascades on delete and shows in the team's wages when a loading
-- team is set) and is subtracted from that sale's margin. They are rebuilt on every save and marked
-- with a "Sale cost:" description so they can be cleared and re-created without touching the
-- auto-booked husk-delivery expenses.

create or replace function public.save_sale(sale_input jsonb, items_input jsonb default '[]'::jsonb, husk_items_input jsonb default '[]'::jsonb, sale_costs_input jsonb default '[]'::jsonb)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  sale_key bigint := nullif(sale_input->>'id', '')::bigint;
  item jsonb;
  cost jsonb;
  item_pieces numeric;
  item_wasted numeric;
  sale_day date := coalesce((sale_input->>'sale_date')::date, current_date);
  is_husk boolean := coalesce(sale_input->>'sale_kind', 'coconut') = 'husk';
  delivers boolean := coalesce((sale_input->>'delivery_by_trader')::boolean, false);
  loading_rate numeric := coalesce((sale_input->>'husk_loading_rate_per_1000')::numeric, 0);
  loading_emp bigint := nullif(sale_input->>'husk_loading_employee_id', '')::bigint;
  fuel_cost numeric := coalesce((sale_input->>'husk_fuel_cost')::numeric, 0);
  other_cost numeric := coalesce((sale_input->>'husk_other_expense')::numeric, 0);
  sale_qty numeric := coalesce((sale_input->>'quantity')::numeric, 0);
  loading_cost numeric;
  cost_scope text := case when coalesce(sale_input->>'sale_kind', 'coconut') = 'husk' then 'husk' else 'coconut' end;
  cost_amount numeric;
  cost_emp bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in to save a sale.';
  end if;

  if sale_key is null then
    insert into public.sales (
      trader_id, buyer_id, sale_kind, product, sale_date, coconut_color, processing_type, unit, quantity, rate,
      coconut_quantity, gross_weight_kg, empty_weight_kg, transport_charge, deduction_amount, deduction_reason,
      other_charge_amount, other_charge_reason, advance_amount, vehicle_id, vehicle_number, payment_status, notes,
      delivery_by_trader, husk_loading_rate_per_1000, husk_loading_employee_id, husk_fuel_cost, husk_other_expense
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
      nullif(sale_input->>'notes', ''),
      delivers, loading_rate, loading_emp, fuel_cost, other_cost
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
      notes = nullif(sale_input->>'notes', ''),
      delivery_by_trader = delivers,
      husk_loading_rate_per_1000 = loading_rate,
      husk_loading_employee_id = loading_emp,
      husk_fuel_cost = fuel_cost,
      husk_other_expense = other_cost
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

  delete from public.husk_sale_items
  where sale_id = sale_key
    and purchase_id not in (
      select (entry->>'purchase_id')::bigint
      from jsonb_array_elements(coalesce(husk_items_input, '[]'::jsonb)) as entry
      where coalesce((entry->>'quantity_pieces')::numeric, 0) > 0
    );

  for item in select * from jsonb_array_elements(coalesce(husk_items_input, '[]'::jsonb)) loop
    item_pieces := coalesce((item->>'quantity_pieces')::numeric, 0);
    if item_pieces > 0 then
      insert into public.husk_sale_items (trader_id, sale_id, purchase_id, quantity_pieces)
      values (auth.uid(), sale_key, (item->>'purchase_id')::bigint, item_pieces)
      on conflict (sale_id, purchase_id) do update set quantity_pieces = excluded.quantity_pieces;
    else
      delete from public.husk_sale_items where sale_id = sale_key and purchase_id = (item->>'purchase_id')::bigint;
    end if;
  end loop;

  -- Husk delivery expenses (loading / fuel / other), rebuilt each save and only when the trader delivers.
  delete from public.expenses where sale_id = sale_key and trader_id = auth.uid() and description like 'Husk delivery%';
  if is_husk and delivers then
    loading_cost := round(sale_qty / 1000 * loading_rate, 2);
    if loading_cost > 0 then
      insert into public.expenses (trader_id, expense_date, category, scope, amount, employee_id, sale_id, description)
      values (auth.uid(), sale_day, 'loading_labor', 'husk', loading_cost, loading_emp, sale_key, 'Husk delivery loading for SAL-' || lpad(sale_key::text, 6, '0'));
    end if;
    if fuel_cost > 0 then
      insert into public.expenses (trader_id, expense_date, category, scope, amount, sale_id, description)
      values (auth.uid(), sale_day, 'diesel', 'husk', fuel_cost, sale_key, 'Husk delivery fuel for SAL-' || lpad(sale_key::text, 6, '0'));
    end if;
    if other_cost > 0 then
      insert into public.expenses (trader_id, expense_date, category, scope, amount, sale_id, description)
      values (auth.uid(), sale_day, 'other', 'husk', other_cost, sale_key, 'Husk delivery other for SAL-' || lpad(sale_key::text, 6, '0'));
    end if;
  end if;

  -- "Your costs on this sale": the trader's own cost lines (transport/loading/driver/other/custom).
  delete from public.expenses where sale_id = sale_key and trader_id = auth.uid() and description like 'Sale cost:%';
  for cost in select * from jsonb_array_elements(coalesce(sale_costs_input, '[]'::jsonb)) loop
    cost_amount := coalesce((cost->>'amount')::numeric, 0);
    cost_emp := nullif(cost->>'employee_id', '')::bigint;
    if cost_amount > 0 then
      insert into public.expenses (trader_id, expense_date, category, scope, amount, employee_id, sale_id, description)
      values (auth.uid(), sale_day, case when cost_emp is not null then 'loading_labor' else 'other' end, cost_scope, round(cost_amount, 2), cost_emp, sale_key,
        'Sale cost: ' || coalesce(nullif(trim(cost->>'label'), ''), 'Expense'));
    end if;
  end loop;

  return sale_key;
end;
$$;

grant execute on function public.save_sale(jsonb, jsonb, jsonb, jsonb) to authenticated;
