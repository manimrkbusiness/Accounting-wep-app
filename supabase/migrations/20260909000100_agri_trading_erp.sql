alter table public.profiles
drop constraint if exists profiles_account_type_check;

alter table public.profiles
add constraint profiles_account_type_check
check (
  account_type in (
    'farmer',
    'trader',
    'wholesaler',
    'retailer',
    'agent_broker',
    'exporter',
    'importer',
    'merchant',
    'business_owner',
    'service_provider',
    'other'
  )
);

alter table public.transactions
add column if not exists workflow_type text not null default 'income',
add column if not exists product_type text,
add column if not exists quantity numeric(14, 2),
add column if not exists unit text not null default 'pieces',
add column if not exists rate numeric(14, 2),
add column if not exists logistics_cost numeric(14, 2) not null default 0,
add column if not exists advance_amount numeric(14, 2) not null default 0,
add column if not exists payment_status text not null default 'unpaid',
add column if not exists payment_method text not null default 'credit_account',
add column if not exists stock_status text,
add column if not exists warehouse_name text,
add column if not exists quality_status text;

alter table public.transactions
drop constraint if exists transactions_workflow_type_check;

alter table public.transactions
add constraint transactions_workflow_type_check
check (workflow_type in ('purchase', 'sale', 'expense', 'income', 'advance'));

alter table public.transactions
drop constraint if exists transactions_product_type_check;

alter table public.transactions
add constraint transactions_product_type_check
check (
  product_type is null
  or product_type in ('green_coconut', 'brown_coconut', 'black_coconut', 'copra', 'other')
);

alter table public.transactions
drop constraint if exists transactions_quantity_check;

alter table public.transactions
add constraint transactions_quantity_check
check (quantity is null or quantity > 0);

alter table public.transactions
drop constraint if exists transactions_rate_check;

alter table public.transactions
add constraint transactions_rate_check
check (rate is null or rate >= 0);

alter table public.transactions
drop constraint if exists transactions_costs_check;

alter table public.transactions
add constraint transactions_costs_check
check (logistics_cost >= 0 and advance_amount >= 0);

alter table public.transactions
drop constraint if exists transactions_payment_status_check;

alter table public.transactions
add constraint transactions_payment_status_check
check (payment_status in ('paid', 'partial', 'unpaid'));

alter table public.transactions
drop constraint if exists transactions_payment_method_check;

alter table public.transactions
add constraint transactions_payment_method_check
check (payment_method in ('cash', 'bank', 'upi', 'credit_account', 'other'));

alter table public.transactions
drop constraint if exists transactions_stock_status_check;

alter table public.transactions
add constraint transactions_stock_status_check
check (stock_status is null or stock_status in ('warehouse', 'direct_sale', 'sold'));

alter table public.transactions
drop constraint if exists transactions_quality_status_check;

alter table public.transactions
add constraint transactions_quality_status_check
check (quality_status is null or quality_status in ('fresh', 'good', 'aging', 'damaged'));

create table if not exists public.stock_lots (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_transaction_id bigint references public.transactions (id) on delete set null,
  product_type text not null check (
    product_type in ('green_coconut', 'brown_coconut', 'black_coconut', 'copra', 'other')
  ),
  quantity numeric(14, 2) not null check (quantity > 0),
  remaining_quantity numeric(14, 2) not null check (remaining_quantity >= 0),
  unit text not null default 'pieces',
  purchase_rate numeric(14, 2) check (purchase_rate is null or purchase_rate >= 0),
  warehouse_name text,
  quality_status text not null default 'fresh' check (quality_status in ('fresh', 'good', 'aging', 'damaged')),
  status text not null default 'in_stock' check (status in ('in_stock', 'sold_out', 'direct_sale')),
  received_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactions
add column if not exists stock_lot_id bigint references public.stock_lots (id) on delete set null;

create index if not exists transactions_user_workflow_idx on public.transactions (user_id, workflow_type);
create index if not exists transactions_user_product_idx on public.transactions (user_id, product_type);
create index if not exists transactions_user_payment_method_idx on public.transactions (user_id, payment_method);
create index if not exists stock_lots_user_status_idx on public.stock_lots (user_id, status);
create index if not exists stock_lots_user_product_idx on public.stock_lots (user_id, product_type);
create index if not exists stock_lots_user_received_idx on public.stock_lots (user_id, received_date desc);

drop trigger if exists set_stock_lots_updated_at on public.stock_lots;
create trigger set_stock_lots_updated_at
before update on public.stock_lots
for each row execute function public.set_updated_at();

alter table public.stock_lots enable row level security;

drop policy if exists "Users manage their stock lots" on public.stock_lots;
create policy "Users manage their stock lots"
on public.stock_lots for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.validate_transaction_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.contact_id is not null and not exists (
    select 1
    from public.contacts
    where id = new.contact_id
      and user_id = new.user_id
  ) then
    raise exception 'Contact does not belong to this ledger.';
  end if;

  if new.category_id is not null and not exists (
    select 1
    from public.categories
    where id = new.category_id
      and transaction_type = new.transaction_type
      and (user_id is null or user_id = new.user_id)
  ) then
    raise exception 'Category is not available for this transaction type.';
  end if;

  if new.stock_lot_id is not null and not exists (
    select 1
    from public.stock_lots
    where id = new.stock_lot_id
      and user_id = new.user_id
  ) then
    raise exception 'Stock lot does not belong to this ledger.';
  end if;

  return new;
end;
$$;

create or replace function public.apply_inventory_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_remaining numeric(14, 2);
begin
  if tg_op = 'INSERT'
    and new.workflow_type = 'purchase'
    and new.stock_status = 'warehouse'
    and new.product_type is not null
    and new.quantity is not null
    and new.deleted_at is null then
    insert into public.stock_lots (
      user_id,
      source_transaction_id,
      product_type,
      quantity,
      remaining_quantity,
      unit,
      purchase_rate,
      warehouse_name,
      quality_status,
      received_date,
      notes
    )
    values (
      new.user_id,
      new.id,
      new.product_type,
      new.quantity,
      new.quantity,
      new.unit,
      new.rate,
      new.warehouse_name,
      coalesce(new.quality_status, 'fresh'),
      new.transaction_date,
      new.notes
    );
  end if;

  if tg_op = 'UPDATE'
    and old.workflow_type = 'sale'
    and old.stock_lot_id is not null
    and old.quantity is not null
    and old.deleted_at is null then
    update public.stock_lots
    set remaining_quantity = remaining_quantity + old.quantity,
        status = 'in_stock'
    where id = old.stock_lot_id
      and user_id = old.user_id;
  end if;

  if new.workflow_type = 'sale'
    and new.stock_lot_id is not null
    and new.quantity is not null
    and new.deleted_at is null then
    select remaining_quantity - new.quantity
    into next_remaining
    from public.stock_lots
    where id = new.stock_lot_id
      and user_id = new.user_id
    for update;

    if next_remaining is null then
      raise exception 'Stock lot is not available.';
    end if;

    if next_remaining < 0 then
      raise exception 'Not enough stock remaining in this lot.';
    end if;

    update public.stock_lots
    set remaining_quantity = next_remaining,
        status = case when next_remaining = 0 then 'sold_out' else 'in_stock' end
    where id = new.stock_lot_id
      and user_id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_transactions_inventory on public.transactions;
create trigger apply_transactions_inventory
after insert or update on public.transactions
for each row execute function public.apply_inventory_transaction();

drop trigger if exists audit_stock_lots_changes on public.stock_lots;
create trigger audit_stock_lots_changes
after insert or update or delete on public.stock_lots
for each row execute function public.write_audit_log();

insert into public.categories (user_id, transaction_type, name, industry)
select null, seed.transaction_type, seed.name, seed.industry
from (
  values
    ('debit', 'Farmer purchase', 'trader'),
    ('debit', 'Loading charges', 'trader'),
    ('debit', 'Transport cost', 'trader'),
    ('debit', 'Peeling charges', 'trader'),
    ('debit', 'Warehouse rent', 'trader'),
    ('credit', 'Coconut sale', 'trader'),
    ('credit', 'Advance received', 'trader')
) as seed(transaction_type, name, industry)
where not exists (
  select 1
  from public.categories
  where user_id is null
    and transaction_type = seed.transaction_type
    and name = seed.name
);
