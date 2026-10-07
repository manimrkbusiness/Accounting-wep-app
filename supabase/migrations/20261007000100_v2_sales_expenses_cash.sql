-- Version 2 workspace: buyers, sales linked to purchases, expenses, team, vehicles, cash ledger.
-- Purchases (coconut_trades) stay untouched so Version 1 keeps working side by side.

-- ---------------------------------------------------------------------------
-- Masters
-- ---------------------------------------------------------------------------

create table if not exists public.buyers (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  phone text check (phone is null or phone ~ '^\+91[6-9][0-9]{9}$'),
  business_name text,
  city text,
  buys_coconut boolean not null default true,
  buys_husk boolean not null default false,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists buyers_trader_name_idx on public.buyers (trader_id, name);

create table if not exists public.employees (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  phone text check (phone is null or phone ~ '^\+91[6-9][0-9]{9}$'),
  role text not null default 'other' check (role in ('harvester', 'dehusker', 'loader', 'driver', 'supervisor', 'other')),
  daily_wage numeric(14, 2) not null default 0 check (daily_wage >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employees_trader_name_idx on public.employees (trader_id, name);

create table if not exists public.vehicles (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  vehicle_number text not null check (length(trim(vehicle_number)) >= 3),
  vehicle_type text not null default 'lorry' check (vehicle_type in ('lorry', 'tempo', 'tractor', 'pickup', 'other')),
  ownership text not null default 'own' check (ownership in ('own', 'hired')),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trader_id, vehicle_number)
);

-- ---------------------------------------------------------------------------
-- Sales (coconut loads and husk sales) and purchase allocations
-- ---------------------------------------------------------------------------

create table if not exists public.sales (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  buyer_id bigint not null references public.buyers (id) on delete restrict,
  sale_kind text not null default 'coconut' check (sale_kind in ('coconut', 'husk')),
  product text not null default 'coconut',
  sale_date date not null default current_date,
  coconut_color text not null default 'green' check (coconut_color in ('green', 'brown', 'black', 'mixed')),
  processing_type text not null default 'mottai' check (processing_type in ('mottai', 'kudume', 'mixed')),
  unit text not null default 'kg' check (unit in ('kg', 'piece', 'load')),
  quantity numeric(14, 3) not null check (quantity > 0),
  rate numeric(14, 2) not null check (rate >= 0),
  coconut_quantity numeric(14, 2) not null default 0 check (coconut_quantity >= 0),
  gross_weight_kg numeric(14, 3) check (gross_weight_kg is null or gross_weight_kg >= 0),
  empty_weight_kg numeric(14, 3) check (empty_weight_kg is null or empty_weight_kg >= 0),
  transport_charge numeric(14, 2) not null default 0 check (transport_charge >= 0),
  deduction_amount numeric(14, 2) not null default 0 check (deduction_amount >= 0),
  deduction_reason text,
  advance_amount numeric(14, 2) not null default 0 check (advance_amount >= 0),
  vehicle_id bigint references public.vehicles (id) on delete set null,
  vehicle_number text,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'partial', 'paid')),
  notes text,
  sale_amount numeric(14, 2) generated always as (quantity * rate) stored,
  total_amount numeric(14, 2) generated always as ((quantity * rate) + transport_charge - deduction_amount) stored,
  balance_amount numeric(14, 2) generated always as ((quantity * rate) + transport_charge - deduction_amount - advance_amount) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_deduction_reason_check
    check (deduction_amount = 0 or length(btrim(coalesce(deduction_reason, ''))) >= 2),
  constraint sales_advance_not_greater_than_total_check
    check (advance_amount <= (quantity * rate) + transport_charge - deduction_amount)
);

create index if not exists sales_trader_date_idx on public.sales (trader_id, sale_date desc, id desc);
create index if not exists sales_trader_buyer_idx on public.sales (trader_id, buyer_id, sale_date desc);

create table if not exists public.sale_items (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  sale_id bigint not null references public.sales (id) on delete cascade,
  purchase_id bigint not null references public.coconut_trades (id) on delete restrict,
  quantity_pieces numeric(14, 2) not null check (quantity_pieces > 0),
  created_at timestamptz not null default now(),
  unique (sale_id, purchase_id)
);

create index if not exists sale_items_purchase_idx on public.sale_items (purchase_id);
create index if not exists sale_items_trader_idx on public.sale_items (trader_id, sale_id);

-- ---------------------------------------------------------------------------
-- Expenses and cash ledger
-- ---------------------------------------------------------------------------

create table if not exists public.expenses (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  expense_date date not null default current_date,
  category text not null check (category in (
    'harvesting_labor', 'dehusking_labor', 'loading_labor', 'transport', 'diesel',
    'vehicle_maintenance', 'food', 'husk_handling', 'other'
  )),
  scope text not null default 'coconut' check (scope in ('coconut', 'husk', 'general')),
  amount numeric(14, 2) not null check (amount > 0),
  employee_id bigint references public.employees (id) on delete set null,
  vehicle_id bigint references public.vehicles (id) on delete set null,
  purchase_id bigint references public.coconut_trades (id) on delete set null,
  sale_id bigint references public.sales (id) on delete set null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_trader_date_idx on public.expenses (trader_id, expense_date desc, id desc);

create table if not exists public.cash_entries (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null default current_date,
  kind text not null check (kind in (
    'opening_balance', 'capital_in', 'capital_out', 'farmer_payment', 'buyer_receipt', 'other_income', 'other_expense'
  )),
  amount numeric(14, 2) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash', 'bank', 'upi')),
  farmer_id bigint references public.trader_farmers (id) on delete set null,
  buyer_id bigint references public.buyers (id) on delete set null,
  purchase_id bigint references public.coconut_trades (id) on delete set null,
  sale_id bigint references public.sales (id) on delete set null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cash_entries_trader_date_idx on public.cash_entries (trader_id, entry_date desc, id desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

drop trigger if exists set_buyers_updated_at on public.buyers;
create trigger set_buyers_updated_at before update on public.buyers
for each row execute function public.set_updated_at();

drop trigger if exists set_employees_updated_at on public.employees;
create trigger set_employees_updated_at before update on public.employees
for each row execute function public.set_updated_at();

drop trigger if exists set_vehicles_updated_at on public.vehicles;
create trigger set_vehicles_updated_at before update on public.vehicles
for each row execute function public.set_updated_at();

drop trigger if exists set_sales_updated_at on public.sales;
create trigger set_sales_updated_at before update on public.sales
for each row execute function public.set_updated_at();

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at before update on public.expenses
for each row execute function public.set_updated_at();

drop trigger if exists set_cash_entries_updated_at on public.cash_entries;
create trigger set_cash_entries_updated_at before update on public.cash_entries
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ownership validation (foreign keys ignore RLS, so links are checked here)
-- ---------------------------------------------------------------------------

create or replace function public.assert_trader_owns(table_name text, row_key bigint, owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owned boolean;
begin
  if row_key is null then
    return;
  end if;
  execute format('select exists (select 1 from public.%I where id = $1 and trader_id = $2)', table_name)
  into owned
  using row_key, owner;
  if not owned then
    raise exception 'Linked % record does not belong to this trader.', table_name;
  end if;
end;
$$;

create or replace function public.validate_sale_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_trader_owns('buyers', new.buyer_id, new.trader_id);
  perform public.assert_trader_owns('vehicles', new.vehicle_id, new.trader_id);
  return new;
end;
$$;

drop trigger if exists validate_sale_links on public.sales;
create trigger validate_sale_links before insert or update on public.sales
for each row execute function public.validate_sale_links();

create or replace function public.validate_expense_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_trader_owns('employees', new.employee_id, new.trader_id);
  perform public.assert_trader_owns('vehicles', new.vehicle_id, new.trader_id);
  perform public.assert_trader_owns('coconut_trades', new.purchase_id, new.trader_id);
  perform public.assert_trader_owns('sales', new.sale_id, new.trader_id);
  return new;
end;
$$;

drop trigger if exists validate_expense_links on public.expenses;
create trigger validate_expense_links before insert or update on public.expenses
for each row execute function public.validate_expense_links();

create or replace function public.validate_cash_entry_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_trader_owns('trader_farmers', new.farmer_id, new.trader_id);
  perform public.assert_trader_owns('buyers', new.buyer_id, new.trader_id);
  perform public.assert_trader_owns('coconut_trades', new.purchase_id, new.trader_id);
  perform public.assert_trader_owns('sales', new.sale_id, new.trader_id);
  return new;
end;
$$;

drop trigger if exists validate_cash_entry_links on public.cash_entries;
create trigger validate_cash_entry_links before insert or update on public.cash_entries
for each row execute function public.validate_cash_entry_links();

-- ---------------------------------------------------------------------------
-- Stock validation: a purchase can never be allocated beyond its piece count
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
begin
  select id, trader_id, coconut_quantity
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

  return new;
end;
$$;

drop trigger if exists validate_sale_item on public.sale_items;
create trigger validate_sale_item before insert or update on public.sale_items
for each row execute function public.validate_sale_item();

create or replace function public.protect_allocated_purchase_quantity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated numeric;
begin
  if new.coconut_quantity < old.coconut_quantity then
    select coalesce(sum(quantity_pieces), 0) into allocated
    from public.sale_items
    where purchase_id = new.id;
    if new.coconut_quantity + 0.001 < allocated then
      raise exception 'This purchase already has % pieces allocated to sales. Reduce those sales first.',
        trim(to_char(allocated, 'FM999999999990.##'));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_allocated_purchase_quantity on public.coconut_trades;
create trigger protect_allocated_purchase_quantity before update of coconut_quantity on public.coconut_trades
for each row execute function public.protect_allocated_purchase_quantity();

-- ---------------------------------------------------------------------------
-- Atomic sale save: the sale row and its purchase allocations in one call
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
      coalesce((sale_input->>'sale_date')::date, current_date),
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
      sale_date = coalesce((sale_input->>'sale_date')::date, sale_date),
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
      );
  end if;

  for item in select * from jsonb_array_elements(coalesce(items_input, '[]'::jsonb)) loop
    insert into public.sale_items (trader_id, sale_id, purchase_id, quantity_pieces)
    values (auth.uid(), sale_key, (item->>'purchase_id')::bigint, (item->>'quantity_pieces')::numeric)
    on conflict (sale_id, purchase_id) do update set quantity_pieces = excluded.quantity_pieces;
  end loop;

  return sale_key;
end;
$$;

grant execute on function public.save_sale(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.buyers enable row level security;
alter table public.employees enable row level security;
alter table public.vehicles enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.expenses enable row level security;
alter table public.cash_entries enable row level security;

drop policy if exists "Traders manage their buyers" on public.buyers;
create policy "Traders manage their buyers" on public.buyers for all
using (trader_id = auth.uid()) with check (trader_id = auth.uid());

drop policy if exists "Traders manage their employees" on public.employees;
create policy "Traders manage their employees" on public.employees for all
using (trader_id = auth.uid()) with check (trader_id = auth.uid());

drop policy if exists "Traders manage their vehicles" on public.vehicles;
create policy "Traders manage their vehicles" on public.vehicles for all
using (trader_id = auth.uid()) with check (trader_id = auth.uid());

drop policy if exists "Traders manage their sales" on public.sales;
create policy "Traders manage their sales" on public.sales for all
using (trader_id = auth.uid()) with check (trader_id = auth.uid());

drop policy if exists "Traders manage their sale items" on public.sale_items;
create policy "Traders manage their sale items" on public.sale_items for all
using (trader_id = auth.uid()) with check (trader_id = auth.uid());

drop policy if exists "Traders manage their expenses" on public.expenses;
create policy "Traders manage their expenses" on public.expenses for all
using (trader_id = auth.uid()) with check (trader_id = auth.uid());

drop policy if exists "Traders manage their cash entries" on public.cash_entries;
create policy "Traders manage their cash entries" on public.cash_entries for all
using (trader_id = auth.uid()) with check (trader_id = auth.uid());
