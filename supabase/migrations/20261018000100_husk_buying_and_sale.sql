-- Husk as a tracked product.
--
--   * Weight-based purchase: the trader can BUY the husk from the farmer (a farmer credit added
--     to what the farmer is paid). Toggle `buys_husk`, with an editable piece count and price and
--     a green/brown colour.
--   * Per-nut purchase: the whole nut was bought wholesale, so the husk kept at the stock stage is
--     NOT paid to the farmer (cost zero) — we only track how much husk there is and its colour.
--   * Husk sale: a sale (sale_kind = 'husk') now links to the purchases whose husk it sells, via
--     husk_sale_items, so each husk sale shows husk cost spent vs. what the buyer pays.

-- ---------------------------------------------------------------------------
-- 1. Settings: separate default husk prices for green and brown husk.
-- ---------------------------------------------------------------------------
alter table public.trader_settings
  add column if not exists husk_price_green_per_piece numeric(14, 4) not null default 0 check (husk_price_green_per_piece >= 0),
  add column if not exists husk_price_brown_per_piece numeric(14, 4) not null default 0 check (husk_price_brown_per_piece >= 0);

-- Seed both colours from the single price that existed before, so nothing changes for existing traders.
update public.trader_settings
set husk_price_green_per_piece = husk_price_per_piece
where husk_price_green_per_piece = 0 and husk_price_per_piece > 0;
update public.trader_settings
set husk_price_brown_per_piece = husk_price_per_piece
where husk_price_brown_per_piece = 0 and husk_price_per_piece > 0;

-- ---------------------------------------------------------------------------
-- 2. Purchases (coconut_trades): buying the husk from the farmer.
-- ---------------------------------------------------------------------------
-- buys_husk defaults TRUE so that, until the new purchase form ships, the existing form (which does
-- not set this column) keeps producing the husk credit exactly as before whenever a husk price is
-- entered. The new form always sets it explicitly, and clears it for per-nut purchases.
alter table public.coconut_trades
  add column if not exists buys_husk boolean not null default true,
  add column if not exists husk_color text check (husk_color in ('green', 'brown')),
  add column if not exists husk_pieces numeric(14, 2) check (husk_pieces is null or husk_pieces >= 0);

-- Per-nut purchases are bought whole at wholesale, so there is no separate husk credit for them.
update public.coconut_trades set buys_husk = false where purchase_mode = 'quantity';
-- Default husk colour follows the coconut colour (black coconut keeps brown husk).
update public.coconut_trades set husk_color = case when coconut_color = 'green' then 'green' else 'brown' end where husk_color is null;

-- Rebuild the generated money columns so the husk credit only applies when buys_husk is on and
-- uses the editable husk piece count. The husk term changes from
--   coalesce(dehusking_pieces, coconut_quantity) * husk_price_per_piece
-- to
--   case when buys_husk then coalesce(husk_pieces, dehusking_pieces, coconut_quantity) * husk_price_per_piece else 0 end
alter table public.coconut_trades
  drop constraint if exists coconut_trades_advance_not_greater_than_total_check;

alter table public.coconut_trades
  drop column if exists husk_price_total,
  drop column if exists total_amount,
  drop column if exists balance_amount,
  drop column if exists average_price_per_piece;

alter table public.coconut_trades
  add column husk_price_total numeric(14, 2)
    generated always as (
      case when buys_husk then coalesce(husk_pieces, dehusking_pieces, coconut_quantity) * husk_price_per_piece else 0 end
    ) stored,
  add column total_amount numeric(14, 2)
    generated always as (
      (case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else (net_weight_kg * (1 - wastage_percent / 100)) * rate_per_kg
      end)
      + (case when buys_husk then coalesce(husk_pieces, dehusking_pieces, coconut_quantity) * husk_price_per_piece else 0 end)
      - ((coalesce(dehusking_pieces, coconut_quantity) / 1000) * husk_removal_rate_per_1000)
      - ((coalesce(harvesting_pieces, coconut_quantity) / 1000) * tree_collection_rate_per_1000)
    ) stored,
  add column balance_amount numeric(14, 2)
    generated always as (
      (case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else (net_weight_kg * (1 - wastage_percent / 100)) * rate_per_kg
      end)
      + (case when buys_husk then coalesce(husk_pieces, dehusking_pieces, coconut_quantity) * husk_price_per_piece else 0 end)
      - ((coalesce(dehusking_pieces, coconut_quantity) / 1000) * husk_removal_rate_per_1000)
      - ((coalesce(harvesting_pieces, coconut_quantity) / 1000) * tree_collection_rate_per_1000)
      - advance_amount
      + additional_credit_amount
      - additional_debit_amount
    ) stored,
  add column average_price_per_piece numeric(14, 2)
    generated always as (
      case when coconut_quantity > 0
        then (
          (case when purchase_mode = 'quantity'
            then coconut_quantity * rate_per_piece
            else (net_weight_kg * (1 - wastage_percent / 100)) * rate_per_kg
          end)
          + (case when buys_husk then coalesce(husk_pieces, dehusking_pieces, coconut_quantity) * husk_price_per_piece else 0 end)
          - ((coalesce(dehusking_pieces, coconut_quantity) / 1000) * husk_removal_rate_per_1000)
          - ((coalesce(harvesting_pieces, coconut_quantity) / 1000) * tree_collection_rate_per_1000)
        ) / coconut_quantity
        else 0
      end
    ) stored;

alter table public.coconut_trades
  add constraint coconut_trades_advance_not_greater_than_total_check
    check (
      advance_amount <= (case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else (net_weight_kg * (1 - wastage_percent / 100)) * rate_per_kg
      end)
        + (case when buys_husk then coalesce(husk_pieces, dehusking_pieces, coconut_quantity) * husk_price_per_piece else 0 end)
        - ((coalesce(dehusking_pieces, coconut_quantity) / 1000) * husk_removal_rate_per_1000)
        - ((coalesce(harvesting_pieces, coconut_quantity) / 1000) * tree_collection_rate_per_1000)
    );

-- ---------------------------------------------------------------------------
-- 3. Stock entries: husk kept from per-nut coconut (not paid to the farmer).
-- ---------------------------------------------------------------------------
alter table public.stock_entries
  add column if not exists husk_color text check (husk_color in ('green', 'brown')),
  add column if not exists husk_pieces numeric(14, 2) check (husk_pieces is null or husk_pieces >= 0);

-- ---------------------------------------------------------------------------
-- 4. husk_sale_items: which purchases' husk goes into a husk sale.
-- ---------------------------------------------------------------------------
create table if not exists public.husk_sale_items (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  sale_id bigint not null references public.sales (id) on delete cascade,
  purchase_id bigint not null references public.coconut_trades (id) on delete restrict,
  quantity_pieces numeric(14, 2) not null check (quantity_pieces > 0),
  created_at timestamptz not null default now(),
  unique (sale_id, purchase_id)
);

create index if not exists husk_sale_items_purchase_idx on public.husk_sale_items (purchase_id);
create index if not exists husk_sale_items_trader_idx on public.husk_sale_items (trader_id, sale_id);

alter table public.husk_sale_items enable row level security;
drop policy if exists "Traders manage their husk sale items" on public.husk_sale_items;
create policy "Traders manage their husk sale items" on public.husk_sale_items for all
using (trader_id = auth.uid()) with check (trader_id = auth.uid());

-- How many husk pieces a purchase can supply: the dehusked count it was bought for (weight-based,
-- only when buying husk) or the pieces weighed into stock (per-nut). A coarse but safe upper bound;
-- the app caps each pick at the precise husk-in-hand.
create or replace function public.husk_capacity(p_purchase bigint)
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select case
    when t.purchase_mode = 'weight' and t.buys_husk
      then coalesce(t.husk_pieces, t.dehusking_pieces, t.coconut_quantity)
    when t.purchase_mode = 'quantity'
      then coalesce((select sum(si.quantity_pieces) from public.stock_entry_items si where si.purchase_id = t.id), 0)
    else 0
  end
  from public.coconut_trades t
  where t.id = p_purchase;
$$;

create or replace function public.validate_husk_sale_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sale_owner uuid;
  cap numeric;
  allocated numeric;
begin
  select trader_id into sale_owner from public.sales where id = new.sale_id;
  if sale_owner is null or sale_owner <> new.trader_id then
    raise exception 'Sale does not belong to this trader.';
  end if;

  cap := public.husk_capacity(new.purchase_id);
  select coalesce(sum(quantity_pieces), 0) into allocated
  from public.husk_sale_items
  where purchase_id = new.purchase_id
    and id is distinct from new.id;

  if allocated + new.quantity_pieces > cap + 0.001 then
    raise exception 'Only % husk pieces remain for PUR-%.',
      trim(to_char(cap - allocated, 'FM999999999990.##')),
      lpad(new.purchase_id::text, 6, '0');
  end if;

  return new;
end;
$$;

drop trigger if exists validate_husk_sale_item on public.husk_sale_items;
create trigger validate_husk_sale_item before insert or update on public.husk_sale_items
for each row execute function public.validate_husk_sale_item();

-- ---------------------------------------------------------------------------
-- 5. save_stock_entry: also persist the expected husk price, colour and piece count.
-- ---------------------------------------------------------------------------
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
    insert into public.stock_entries (trader_id, entry_date, processing_type, net_weight_kg, wastage_percent, coconut_quantity, dehusking_rate_per_1000, sale_rate_per_kg, husk_rate_per_piece, husk_color, husk_pieces, notes)
    values (
      auth.uid(),
      entry_day,
      coalesce(entry_input->>'processing_type', 'mottai'),
      (entry_input->>'net_weight_kg')::numeric,
      coalesce((entry_input->>'wastage_percent')::numeric, 0),
      loaded_pieces,
      dehusking_rate,
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

-- ---------------------------------------------------------------------------
-- 6. save_sale: also store the husk sale's picked purchases in husk_sale_items.
-- ---------------------------------------------------------------------------
drop function if exists public.save_sale(jsonb, jsonb);

create or replace function public.save_sale(sale_input jsonb, items_input jsonb default '[]'::jsonb, husk_items_input jsonb default '[]'::jsonb)
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

  -- Husk sale picks: keep husk_sale_items in step with the input.
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

  return sale_key;
end;
$$;

grant execute on function public.save_sale(jsonb, jsonb, jsonb) to authenticated;
