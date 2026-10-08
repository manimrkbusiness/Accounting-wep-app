-- Per-nut (quantity-based) purchases are weighed into stock before they can be sold.
-- A stock entry records the weighbridge net weight and condition for pieces taken from
-- one or more per-nut purchases. Weight-based purchases are sellable straight away.

create table if not exists public.stock_entries (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null default current_date,
  processing_type text not null default 'mottai' check (processing_type in ('mottai', 'kudume')),
  net_weight_kg numeric(14, 3) not null check (net_weight_kg > 0),
  wastage_percent numeric(5, 2) not null default 0 check (wastage_percent between 0 and 100),
  coconut_quantity numeric(14, 2) not null default 0 check (coconut_quantity >= 0),
  notes text,
  wastage_weight_kg numeric(14, 3) generated always as (net_weight_kg * wastage_percent / 100) stored,
  payable_weight_kg numeric(14, 3) generated always as (net_weight_kg * (1 - wastage_percent / 100)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_entries_trader_date_idx on public.stock_entries (trader_id, entry_date desc, id desc);

create table if not exists public.stock_entry_items (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  stock_entry_id bigint not null references public.stock_entries (id) on delete cascade,
  purchase_id bigint not null references public.coconut_trades (id) on delete restrict,
  quantity_pieces numeric(14, 2) not null check (quantity_pieces > 0),
  created_at timestamptz not null default now(),
  unique (stock_entry_id, purchase_id)
);

create index if not exists stock_entry_items_purchase_idx on public.stock_entry_items (purchase_id);
create index if not exists stock_entry_items_trader_idx on public.stock_entry_items (trader_id, stock_entry_id);

drop trigger if exists set_stock_entries_updated_at on public.stock_entries;
create trigger set_stock_entries_updated_at before update on public.stock_entries
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Only per-nut purchases go into stock, and never more pieces than were bought
-- ---------------------------------------------------------------------------

create or replace function public.validate_stock_entry_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_record record;
  entry_owner uuid;
  stocked numeric;
begin
  select id, trader_id, purchase_mode, coconut_quantity
  into purchase_record
  from public.coconut_trades
  where id = new.purchase_id;

  if not found or purchase_record.trader_id <> new.trader_id then
    raise exception 'Purchase does not belong to this trader.';
  end if;

  if purchase_record.purchase_mode <> 'quantity' then
    raise exception 'PUR-% is weight-based and is already sellable; only per-nut purchases are weighed into stock.',
      lpad(new.purchase_id::text, 6, '0');
  end if;

  select trader_id into entry_owner from public.stock_entries where id = new.stock_entry_id;
  if entry_owner is null or entry_owner <> new.trader_id then
    raise exception 'Stock entry does not belong to this trader.';
  end if;

  select coalesce(sum(quantity_pieces), 0)
  into stocked
  from public.stock_entry_items
  where purchase_id = new.purchase_id
    and id is distinct from new.id;

  if stocked + new.quantity_pieces > purchase_record.coconut_quantity + 0.001 then
    raise exception 'Only % pieces of PUR-% are still waiting to be weighed into stock.',
      trim(to_char(purchase_record.coconut_quantity - stocked, 'FM999999999990.##')),
      lpad(new.purchase_id::text, 6, '0');
  end if;

  return new;
end;
$$;

drop trigger if exists validate_stock_entry_item on public.stock_entry_items;
create trigger validate_stock_entry_item before insert or update on public.stock_entry_items
for each row execute function public.validate_stock_entry_item();

-- Stock that is already sold cannot be removed from a stock entry.
create or replace function public.protect_sold_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sold numeric;
  stocked_after numeric;
begin
  select coalesce(sum(quantity_pieces), 0) into sold
  from public.sale_items where purchase_id = old.purchase_id;

  select coalesce(sum(quantity_pieces), 0) into stocked_after
  from public.stock_entry_items where purchase_id = old.purchase_id and id <> old.id;

  if tg_op = 'UPDATE' and new.purchase_id = old.purchase_id then
    stocked_after := stocked_after + new.quantity_pieces;
  end if;

  if sold > stocked_after + 0.001 then
    raise exception '% pieces of PUR-% are already sold; keep at least that many in stock.',
      trim(to_char(sold, 'FM999999999990.##')),
      lpad(old.purchase_id::text, 6, '0');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_sold_stock on public.stock_entry_items;
create trigger protect_sold_stock before update or delete on public.stock_entry_items
for each row execute function public.protect_sold_stock();

-- ---------------------------------------------------------------------------
-- Sales: per-nut purchases can only be sold from what is in stock
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
  allocated numeric;
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

  select coalesce(sum(quantity_pieces), 0)
  into allocated
  from public.sale_items
  where purchase_id = new.purchase_id
    and id is distinct from new.id;

  if allocated + new.quantity_pieces > purchase_record.coconut_quantity + 0.001 then
    raise exception 'Only % pieces remain in PUR-%.',
      trim(to_char(purchase_record.coconut_quantity - allocated, 'FM999999999990.##')),
      lpad(new.purchase_id::text, 6, '0');
  end if;

  if purchase_record.purchase_mode = 'quantity' then
    select coalesce(sum(quantity_pieces), 0) into stocked
    from public.stock_entry_items where purchase_id = new.purchase_id;
    if allocated + new.quantity_pieces > stocked + 0.001 then
      raise exception 'Only % pieces of PUR-% are in stock. Weigh more into stock before selling.',
        trim(to_char(greatest(stocked - allocated, 0), 'FM999999999990.##')),
        lpad(new.purchase_id::text, 6, '0');
    end if;
  end if;

  return new;
end;
$$;

-- A purchase cannot shrink below what is stocked or sold, and a stocked per-nut
-- purchase cannot be switched to weight-based.
create or replace function public.protect_allocated_purchase_quantity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated numeric;
  stocked numeric;
begin
  select coalesce(sum(quantity_pieces), 0) into allocated from public.sale_items where purchase_id = new.id;
  select coalesce(sum(quantity_pieces), 0) into stocked from public.stock_entry_items where purchase_id = new.id;

  if new.coconut_quantity < old.coconut_quantity and new.coconut_quantity + 0.001 < greatest(allocated, stocked) then
    raise exception 'This purchase already has % pieces in stock or sales. Reduce those first.',
      trim(to_char(greatest(allocated, stocked), 'FM999999999990.##'));
  end if;

  if old.purchase_mode = 'quantity' and new.purchase_mode <> 'quantity' and stocked > 0 then
    raise exception 'Remove this purchase from its stock entries before changing the purchase method.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_allocated_purchase_quantity on public.coconut_trades;
create trigger protect_allocated_purchase_quantity before update of coconut_quantity, purchase_mode on public.coconut_trades
for each row execute function public.protect_allocated_purchase_quantity();

-- ---------------------------------------------------------------------------
-- Atomic stock entry save
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
  total_pieces numeric;
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
    insert into public.stock_entries (trader_id, entry_date, processing_type, net_weight_kg, wastage_percent, coconut_quantity, notes)
    values (
      auth.uid(),
      coalesce((entry_input->>'entry_date')::date, current_date),
      coalesce(entry_input->>'processing_type', 'mottai'),
      (entry_input->>'net_weight_kg')::numeric,
      coalesce((entry_input->>'wastage_percent')::numeric, 0),
      total_pieces,
      nullif(entry_input->>'notes', '')
    )
    returning id into entry_key;
  else
    update public.stock_entries set
      entry_date = coalesce((entry_input->>'entry_date')::date, entry_date),
      processing_type = coalesce(entry_input->>'processing_type', processing_type),
      net_weight_kg = (entry_input->>'net_weight_kg')::numeric,
      wastage_percent = coalesce((entry_input->>'wastage_percent')::numeric, 0),
      coconut_quantity = total_pieces,
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

  return entry_key;
end;
$$;

grant execute on function public.save_stock_entry(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.stock_entries enable row level security;
alter table public.stock_entry_items enable row level security;

drop policy if exists "Traders manage their stock entries" on public.stock_entries;
create policy "Traders manage their stock entries" on public.stock_entries for all
using (trader_id = auth.uid()) with check (trader_id = auth.uid());

drop policy if exists "Traders manage their stock entry items" on public.stock_entry_items;
create policy "Traders manage their stock entry items" on public.stock_entry_items for all
using (trader_id = auth.uid()) with check (trader_id = auth.uid());
