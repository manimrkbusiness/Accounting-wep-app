-- New trader-first MVP schema. Legacy auth profiles remain available, while
-- the old bookkeeping tables are cleared because this workflow replaces them.

delete from public.audit_logs
where table_name in ('transactions', 'contacts', 'categories', 'stock_lots');

delete from public.stock_lots;
delete from public.transactions;
delete from public.contacts;
delete from public.categories where user_id is not null;

alter table public.profiles
  alter column account_type drop not null;

update public.profiles
set account_type = 'trader'
where account_type is not null
  and account_type not in ('farmer', 'trader');

alter table public.profiles
  drop constraint if exists profiles_account_type_check;

alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type is null or account_type in ('farmer', 'trader'));

create table if not exists public.trader_farmers (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  phone text not null check (phone ~ '^\\+91[6-9][0-9]{9}$'),
  name text not null check (length(trim(name)) >= 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trader_id, phone)
);

create table if not exists public.farmer_locations (
  id bigint generated always as identity primary key,
  farmer_id bigint not null references public.trader_farmers (id) on delete cascade,
  location_name text not null check (length(trim(location_name)) >= 2),
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farmer_id, location_name)
);

create table if not exists public.coconut_trades (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  farmer_id bigint not null references public.trader_farmers (id) on delete restrict,
  location_id bigint references public.farmer_locations (id) on delete set null,
  trade_date date not null default current_date,
  coconut_color text not null check (coconut_color in ('green', 'brown', 'black')),
  processing_type text not null check (processing_type in ('mottai', 'kudume')),
  gross_weight_kg numeric(14, 3) not null check (gross_weight_kg > 0),
  empty_weight_kg numeric(14, 3) not null default 0 check (empty_weight_kg >= 0),
  wastage_percent numeric(5, 2) not null default 0 check (wastage_percent between 0 and 100),
  rate_per_kg numeric(14, 2) not null check (rate_per_kg >= 0),
  advance_amount numeric(14, 2) not null default 0 check (advance_amount >= 0),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'partial', 'paid')),
  notes text,
  net_weight_kg numeric(14, 3) generated always as (gross_weight_kg - empty_weight_kg) stored,
  wastage_weight_kg numeric(14, 3) generated always as ((gross_weight_kg - empty_weight_kg) * wastage_percent / 100) stored,
  payable_weight_kg numeric(14, 3) generated always as ((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100)) stored,
  total_amount numeric(14, 2) generated always as (((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100)) * rate_per_kg) stored,
  balance_amount numeric(14, 2) generated always as ((((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100)) * rate_per_kg) - advance_amount) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (empty_weight_kg <= gross_weight_kg),
  check (advance_amount <= (((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100)) * rate_per_kg))
);

create index if not exists trader_farmers_trader_phone_idx
  on public.trader_farmers (trader_id, phone);
create index if not exists farmer_locations_farmer_idx
  on public.farmer_locations (farmer_id, location_name);
create index if not exists coconut_trades_trader_date_idx
  on public.coconut_trades (trader_id, trade_date desc, id desc);
create index if not exists coconut_trades_trader_farmer_idx
  on public.coconut_trades (trader_id, farmer_id, trade_date desc);

drop trigger if exists set_trader_farmers_updated_at on public.trader_farmers;
create trigger set_trader_farmers_updated_at
before update on public.trader_farmers
for each row execute function public.set_updated_at();

drop trigger if exists set_farmer_locations_updated_at on public.farmer_locations;
create trigger set_farmer_locations_updated_at
before update on public.farmer_locations
for each row execute function public.set_updated_at();

drop trigger if exists set_coconut_trades_updated_at on public.coconut_trades;
create trigger set_coconut_trades_updated_at
before update on public.coconut_trades
for each row execute function public.set_updated_at();

create or replace function public.user_owns_farmer(farmer_key bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trader_farmers
    where id = farmer_key and trader_id = auth.uid()
  );
$$;

create or replace function public.validate_coconut_trade_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.trader_farmers
    where id = new.farmer_id and trader_id = new.trader_id
  ) then
    raise exception 'Farmer does not belong to this trader.';
  end if;

  if new.location_id is not null and not exists (
    select 1 from public.farmer_locations
    where id = new.location_id and farmer_id = new.farmer_id
  ) then
    raise exception 'Location does not belong to this farmer.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_coconut_trade_links on public.coconut_trades;
create trigger validate_coconut_trade_links
before insert or update on public.coconut_trades
for each row execute function public.validate_coconut_trade_links();

alter table public.trader_farmers enable row level security;
alter table public.farmer_locations enable row level security;
alter table public.coconut_trades enable row level security;

drop policy if exists "Traders manage their farmers" on public.trader_farmers;
create policy "Traders manage their farmers"
on public.trader_farmers for all
using (trader_id = auth.uid())
with check (trader_id = auth.uid());

drop policy if exists "Traders manage their farmer locations" on public.farmer_locations;
create policy "Traders manage their farmer locations"
on public.farmer_locations for all
using (public.user_owns_farmer(farmer_id))
with check (public.user_owns_farmer(farmer_id));

drop policy if exists "Traders manage their coconut trades" on public.coconut_trades;
create policy "Traders manage their coconut trades"
on public.coconut_trades for all
using (trader_id = auth.uid())
with check (trader_id = auth.uid());
