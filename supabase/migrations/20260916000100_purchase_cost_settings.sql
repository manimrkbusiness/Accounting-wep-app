-- Persist trader defaults and snapshot farmer-paid labor rates on every purchase.

create table if not exists public.trader_settings (
  trader_id uuid primary key references auth.users (id) on delete cascade,
  husk_removal_rate_per_1000 numeric(14, 2) not null default 1100 check (husk_removal_rate_per_1000 >= 0),
  tree_collection_rate_per_1000 numeric(14, 2) not null default 1450 check (tree_collection_rate_per_1000 >= 0),
  kudume_wastage_percent numeric(5, 2) not null default 3 check (kudume_wastage_percent between 0 and 100),
  updated_at timestamptz not null default now()
);

alter table public.coconut_trades
  add column if not exists coconut_quantity numeric(14, 2) not null default 0 check (coconut_quantity >= 0),
  add column if not exists husk_removal_rate_per_1000 numeric(14, 2) not null default 1100 check (husk_removal_rate_per_1000 >= 0),
  add column if not exists tree_collection_rate_per_1000 numeric(14, 2) not null default 1450 check (tree_collection_rate_per_1000 >= 0);

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.coconut_trades'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%advance_amount <=%'
  loop
    execute format('alter table public.coconut_trades drop constraint %I', constraint_record.conname);
  end loop;
end $$;

alter table public.coconut_trades
  drop column if exists total_amount,
  drop column if exists balance_amount;

alter table public.coconut_trades
  add column if not exists husk_removal_cost numeric(14, 2)
    generated always as ((coconut_quantity / 1000) * husk_removal_rate_per_1000) stored,
  add column if not exists tree_collection_cost numeric(14, 2)
    generated always as ((coconut_quantity / 1000) * tree_collection_rate_per_1000) stored,
  add column if not exists labor_cost_total numeric(14, 2)
    generated always as (((coconut_quantity / 1000) * husk_removal_rate_per_1000) + ((coconut_quantity / 1000) * tree_collection_rate_per_1000)) stored,
  add column total_amount numeric(14, 2)
    generated always as ((((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100)) * rate_per_kg) + ((coconut_quantity / 1000) * husk_removal_rate_per_1000) + ((coconut_quantity / 1000) * tree_collection_rate_per_1000)) stored,
  add column balance_amount numeric(14, 2)
    generated always as (((((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100)) * rate_per_kg) + ((coconut_quantity / 1000) * husk_removal_rate_per_1000) + ((coconut_quantity / 1000) * tree_collection_rate_per_1000)) - advance_amount) stored;

alter table public.coconut_trades
  add constraint coconut_trades_advance_not_greater_than_total_check
  check (advance_amount <= ((((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100)) * rate_per_kg) + ((coconut_quantity / 1000) * husk_removal_rate_per_1000) + ((coconut_quantity / 1000) * tree_collection_rate_per_1000)));

drop trigger if exists set_trader_settings_updated_at on public.trader_settings;
create trigger set_trader_settings_updated_at
before update on public.trader_settings
for each row execute function public.set_updated_at();

insert into public.trader_settings (trader_id)
select id from public.profiles where account_type = 'trader'
on conflict (trader_id) do nothing;

alter table public.trader_settings enable row level security;

drop policy if exists "Traders manage their settings" on public.trader_settings;
create policy "Traders manage their settings"
on public.trader_settings for all
using (trader_id = auth.uid())
with check (trader_id = auth.uid());

create index if not exists coconut_trades_trader_quantity_idx
  on public.coconut_trades (trader_id, coconut_quantity);
