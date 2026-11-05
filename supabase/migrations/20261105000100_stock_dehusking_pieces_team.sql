-- Stock-stage dehusking can now record the exact number of coconuts dehusked and the dehusking
-- team that did it. Per-nut coconut is dehusked by the trader before weighing; until now the stock
-- entry booked the dehusking cost on the whole loaded/taken quantity and attributed it to nobody.
-- The trader now enters how many pieces were dehusked, and the cost (and the expense booked for it)
-- is computed on that count and attributed to the chosen dehusking team, so the wage shows in that
-- team's payment history — mirroring how purchase-stage dehusking already works.

alter table public.stock_entries
  add column if not exists dehusking_pieces numeric(14, 2) check (dehusking_pieces is null or dehusking_pieces >= 0),
  add column if not exists dehusking_team_id bigint references public.employees (id) on delete set null;

create index if not exists stock_entries_dehusking_team_idx on public.stock_entries (dehusking_team_id);

-- Recompute dehusking_cost on the dehusked piece count (falling back to the loaded quantity for
-- older rows that predate this column).
alter table public.stock_entries drop column if exists dehusking_cost;
alter table public.stock_entries
  add column dehusking_cost numeric(14, 2)
    generated always as ((coalesce(dehusking_pieces, coconut_quantity) / 1000) * dehusking_rate_per_1000) stored;

create or replace function public.save_stock_entry(entry_input jsonb, items_input jsonb default '[]'::jsonb)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  entry_key bigint := nullif(entry_input->>'id', '')::bigint;
  item jsonb;
  total_pieces numeric;
  dehusking_rate numeric := coalesce((entry_input->>'dehusking_rate_per_1000')::numeric, 0);
  deh_pieces numeric := nullif(entry_input->>'dehusking_pieces', '')::numeric;
  deh_team bigint := nullif(entry_input->>'dehusking_team_id', '')::bigint;
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
    insert into public.stock_entries (trader_id, entry_date, processing_type, net_weight_kg, wastage_percent, coconut_quantity, dehusking_rate_per_1000, dehusking_pieces, dehusking_team_id, notes)
    values (
      auth.uid(),
      entry_day,
      coalesce(entry_input->>'processing_type', 'mottai'),
      (entry_input->>'net_weight_kg')::numeric,
      coalesce((entry_input->>'wastage_percent')::numeric, 0),
      total_pieces,
      dehusking_rate,
      deh_pieces,
      deh_team,
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
      dehusking_pieces = deh_pieces,
      dehusking_team_id = deh_team,
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
    insert into public.stock_entry_items (trader_id, stock_entry_id, purchase_id, quantity_pieces)
    values (auth.uid(), entry_key, (item->>'purchase_id')::bigint, (item->>'quantity_pieces')::numeric)
    on conflict (stock_entry_id, purchase_id) do update set quantity_pieces = excluded.quantity_pieces;
  end loop;

  -- Book the dehusking cost as an expense that follows this stock entry, on the dehusked piece
  -- count and attributed to the chosen dehusking team so it shows in that team's payment history.
  dehusking_total := round(coalesce(deh_pieces, total_pieces) / 1000 * dehusking_rate, 2);
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
