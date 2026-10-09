-- Wasted pieces: coconut found rotten or damaged and removed from stock, normally
-- while a load is being built. Wasted pieces reduce stock and are never sold.

create table if not exists public.stock_wastage (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  purchase_id bigint not null references public.coconut_trades (id) on delete restrict,
  sale_id bigint references public.sales (id) on delete cascade,
  wastage_date date not null default current_date,
  quantity_pieces numeric(14, 2) not null check (quantity_pieces > 0),
  reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists stock_wastage_sale_purchase_idx on public.stock_wastage (sale_id, purchase_id) where sale_id is not null;
create index if not exists stock_wastage_purchase_idx on public.stock_wastage (purchase_id);
create index if not exists stock_wastage_trader_idx on public.stock_wastage (trader_id, wastage_date desc);

-- Pieces of a purchase that are already sold or wasted, optionally ignoring one row of each.
create or replace function public.purchase_committed_pieces(purchase_key bigint, skip_sale_item bigint default null, skip_wastage bigint default null)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select sum(quantity_pieces) from public.sale_items where purchase_id = purchase_key and id is distinct from skip_sale_item), 0)
       + coalesce((select sum(quantity_pieces) from public.stock_wastage where purchase_id = purchase_key and id is distinct from skip_wastage), 0);
$$;

create or replace function public.purchase_stocked_pieces(purchase_key bigint)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(quantity_pieces), 0) from public.stock_entry_items where purchase_id = purchase_key;
$$;

-- ---------------------------------------------------------------------------
-- Wastage validation
-- ---------------------------------------------------------------------------

create or replace function public.validate_stock_wastage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_record record;
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

  perform public.assert_trader_owns('sales', new.sale_id, new.trader_id);

  committed := public.purchase_committed_pieces(new.purchase_id, null, new.id);
  if committed + new.quantity_pieces > purchase_record.coconut_quantity + 0.001 then
    raise exception 'Only % pieces of PUR-% remain to be marked as wasted.',
      trim(to_char(greatest(purchase_record.coconut_quantity - committed, 0), 'FM999999999990.##')),
      lpad(new.purchase_id::text, 6, '0');
  end if;

  if purchase_record.purchase_mode = 'quantity' then
    stocked := public.purchase_stocked_pieces(new.purchase_id);
    if committed + new.quantity_pieces > stocked + 0.001 then
      raise exception 'Only % pieces of PUR-% are in stock.',
        trim(to_char(greatest(stocked - committed, 0), 'FM999999999990.##')),
        lpad(new.purchase_id::text, 6, '0');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_stock_wastage on public.stock_wastage;
create trigger validate_stock_wastage before insert or update on public.stock_wastage
for each row execute function public.validate_stock_wastage();

-- ---------------------------------------------------------------------------
-- Existing guards now count wasted pieces as well as sold pieces
-- ---------------------------------------------------------------------------

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

  committed := public.purchase_committed_pieces(new.purchase_id, new.id, null);

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

create or replace function public.protect_allocated_purchase_quantity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  committed numeric;
  stocked numeric;
begin
  committed := public.purchase_committed_pieces(new.id);
  stocked := public.purchase_stocked_pieces(new.id);

  if new.coconut_quantity < old.coconut_quantity and new.coconut_quantity + 0.001 < greatest(committed, stocked) then
    raise exception 'This purchase already has % pieces in stock, sales or wastage. Reduce those first.',
      trim(to_char(greatest(committed, stocked), 'FM999999999990.##'));
  end if;

  if old.purchase_mode = 'quantity' and new.purchase_mode <> 'quantity' and stocked > 0 then
    raise exception 'Remove this purchase from its stock entries before changing the purchase method.';
  end if;

  return new;
end;
$$;

create or replace function public.protect_sold_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  committed numeric;
  stocked_after numeric;
begin
  committed := public.purchase_committed_pieces(old.purchase_id);

  select coalesce(sum(quantity_pieces), 0) into stocked_after
  from public.stock_entry_items where purchase_id = old.purchase_id and id <> old.id;

  if tg_op = 'UPDATE' and new.purchase_id = old.purchase_id then
    stocked_after := stocked_after + new.quantity_pieces;
  end if;

  if committed > stocked_after + 0.001 then
    raise exception '% pieces of PUR-% are already sold or wasted; keep at least that many in stock.',
      trim(to_char(committed, 'FM999999999990.##')),
      lpad(old.purchase_id::text, 6, '0');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sale save now records wasted pieces per purchase alongside the allocation
-- ---------------------------------------------------------------------------

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

  -- Wastage for this sale is rebuilt from the input so stock checks see the new picture.
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

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.stock_wastage enable row level security;

drop policy if exists "Traders manage their stock wastage" on public.stock_wastage;
create policy "Traders manage their stock wastage" on public.stock_wastage for all
using (trader_id = auth.uid()) with check (trader_id = auth.uid());
