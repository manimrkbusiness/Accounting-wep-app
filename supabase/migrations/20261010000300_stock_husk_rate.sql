-- Expected husk price per nut on a stock entry. The trader keeps the husk from
-- dehusked coconut and sells it, so the stock summary can show its expected value.

alter table public.stock_entries
  add column if not exists husk_rate_per_piece numeric(14, 4) not null default 0 check (husk_rate_per_piece >= 0);

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
  husk_rate numeric := coalesce((entry_input->>'husk_rate_per_piece')::numeric, 0);
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
    insert into public.stock_entries (trader_id, entry_date, processing_type, net_weight_kg, wastage_percent, coconut_quantity, dehusking_rate_per_1000, sale_rate_per_kg, husk_rate_per_piece, notes)
    values (
      auth.uid(),
      entry_day,
      coalesce(entry_input->>'processing_type', 'mottai'),
      (entry_input->>'net_weight_kg')::numeric,
      coalesce((entry_input->>'wastage_percent')::numeric, 0),
      total_pieces,
      dehusking_rate,
      sale_rate,
      husk_rate,
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
      husk_rate_per_piece = husk_rate,
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
