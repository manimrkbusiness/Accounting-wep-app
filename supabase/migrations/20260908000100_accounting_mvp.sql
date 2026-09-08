create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text,
  account_type text not null check (
    account_type in (
      'farmer',
      'merchant',
      'business_owner',
      'trader',
      'service_provider',
      'other'
    )
  ),
  business_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  phone text,
  contact_type text not null default 'customer' check (
    contact_type in ('customer', 'vendor', 'farmer', 'merchant', 'business', 'other')
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  transaction_type text not null check (transaction_type in ('credit', 'debit')),
  name text not null,
  industry text not null default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, transaction_type, name)
);

create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id bigint references public.contacts (id) on delete set null,
  category_id bigint references public.categories (id) on delete set null,
  transaction_type text not null check (transaction_type in ('credit', 'debit')),
  amount numeric(14, 2) not null check (amount > 0),
  transaction_date date not null default current_date,
  description text not null,
  reference_number text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('create', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists contacts_user_id_name_idx on public.contacts (user_id, name);
create index if not exists categories_user_type_idx on public.categories (user_id, transaction_type);
create index if not exists transactions_user_date_idx on public.transactions (user_id, transaction_date desc);
create index if not exists transactions_user_type_idx on public.transactions (user_id, transaction_type);
create index if not exists transactions_user_contact_idx on public.transactions (user_id, contact_id);
create index if not exists transactions_user_category_idx on public.transactions (user_id, category_id);
create index if not exists audit_logs_user_created_idx on public.audit_logs (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_contacts_updated_at on public.contacts;
create trigger set_contacts_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

drop trigger if exists set_transactions_updated_at on public.transactions;
create trigger set_transactions_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  action_name text;
begin
  if tg_op = 'INSERT' then
    current_user_id := new.user_id;
    action_name := 'create';
  elsif tg_op = 'UPDATE' then
    current_user_id := new.user_id;
    action_name := case
      when old.deleted_at is null and new.deleted_at is not null then 'delete'
      else 'update'
    end;
  else
    current_user_id := old.user_id;
    action_name := 'delete';
  end if;

  insert into public.audit_logs (
    user_id,
    table_name,
    record_id,
    action,
    old_data,
    new_data
  )
  values (
    current_user_id,
    tg_table_name,
    coalesce(new.id, old.id)::text,
    action_name,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists audit_contacts_changes on public.contacts;
create trigger audit_contacts_changes
after insert or update or delete on public.contacts
for each row execute function public.write_audit_log();

drop trigger if exists audit_transactions_changes on public.transactions;
create trigger audit_transactions_changes
after insert or update or delete on public.transactions
for each row execute function public.write_audit_log();

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "Users can read their profile" on public.profiles;
create policy "Users can read their profile"
on public.profiles for select
using (id = auth.uid());

drop policy if exists "Users can create their profile" on public.profiles;
create policy "Users can create their profile"
on public.profiles for insert
with check (id = auth.uid());

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Users manage their contacts" on public.contacts;
create policy "Users manage their contacts"
on public.contacts for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users read global and own categories" on public.categories;
create policy "Users read global and own categories"
on public.categories for select
using (user_id is null or user_id = auth.uid());

drop policy if exists "Users create own categories" on public.categories;
create policy "Users create own categories"
on public.categories for insert
with check (user_id = auth.uid());

drop policy if exists "Users update own categories" on public.categories;
create policy "Users update own categories"
on public.categories for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users delete own categories" on public.categories;
create policy "Users delete own categories"
on public.categories for delete
using (user_id = auth.uid());

drop policy if exists "Users manage their transactions" on public.transactions;
create policy "Users manage their transactions"
on public.transactions for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users read their audit logs" on public.audit_logs;
create policy "Users read their audit logs"
on public.audit_logs for select
using (user_id = auth.uid());

insert into public.categories (user_id, transaction_type, name, industry)
values
  (null, 'credit', 'Crop sale income', 'farmer'),
  (null, 'credit', 'Milk or livestock sale', 'farmer'),
  (null, 'credit', 'Customer payment received', 'merchant'),
  (null, 'credit', 'Wholesale sales', 'merchant'),
  (null, 'credit', 'Service income', 'business'),
  (null, 'credit', 'Other income', 'general'),
  (null, 'debit', 'Seeds and planting material', 'farmer'),
  (null, 'debit', 'Fertilizer and pesticides', 'farmer'),
  (null, 'debit', 'Labor wages', 'farmer'),
  (null, 'debit', 'Transport and delivery', 'merchant'),
  (null, 'debit', 'Stock purchase', 'merchant'),
  (null, 'debit', 'Rent and utilities', 'business'),
  (null, 'debit', 'Repairs and maintenance', 'general'),
  (null, 'debit', 'Other expense', 'general')
on conflict do nothing;
