-- Share trader purchases with a matching farmer only after explicit approval.
-- Also persist optional purchase-level credits and debits with mandatory reasons.

alter table public.coconut_trades
  drop column if exists balance_amount;

alter table public.coconut_trades
  add column if not exists additional_credit_amount numeric(14, 2) not null default 0,
  add column if not exists additional_credit_reason text,
  add column if not exists additional_debit_amount numeric(14, 2) not null default 0,
  add column if not exists additional_debit_reason text;

alter table public.coconut_trades
  add column balance_amount numeric(14, 2)
    generated always as (((((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100)) * rate_per_kg)
      - ((coconut_quantity / 1000) * husk_removal_rate_per_1000)
      - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)
      - advance_amount
      + additional_credit_amount
      - additional_debit_amount)) stored;

alter table public.coconut_trades
  drop constraint if exists coconut_trades_additional_credit_amount_check,
  drop constraint if exists coconut_trades_additional_debit_amount_check,
  drop constraint if exists coconut_trades_additional_credit_reason_check,
  drop constraint if exists coconut_trades_additional_debit_reason_check,
  drop constraint if exists coconut_trades_additional_credit_reason_required_check,
  drop constraint if exists coconut_trades_additional_debit_reason_required_check,
  drop constraint if exists coconut_trades_debit_not_greater_than_balance_check;

alter table public.coconut_trades
  add constraint coconut_trades_additional_credit_amount_check
    check (additional_credit_amount >= 0),
  add constraint coconut_trades_additional_debit_amount_check
    check (additional_debit_amount >= 0),
  add constraint coconut_trades_additional_credit_reason_check
    check (additional_credit_amount = 0 or length(btrim(coalesce(additional_credit_reason, ''))) >= 2),
  add constraint coconut_trades_additional_debit_reason_check
    check (additional_debit_amount = 0 or length(btrim(coalesce(additional_debit_reason, ''))) >= 2),
  add constraint coconut_trades_additional_credit_reason_required_check
    check (additional_credit_amount > 0 or length(btrim(coalesce(additional_credit_reason, ''))) = 0),
  add constraint coconut_trades_additional_debit_reason_required_check
    check (additional_debit_amount > 0 or length(btrim(coalesce(additional_debit_reason, ''))) = 0),
  add constraint coconut_trades_debit_not_greater_than_balance_check
    check (additional_debit_amount <= (((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100) * rate_per_kg)
      - ((coconut_quantity / 1000) * husk_removal_rate_per_1000)
      - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)
      - advance_amount
      + additional_credit_amount));

create table if not exists public.farmer_access_requests (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  trader_farmer_id bigint not null references public.trader_farmers (id) on delete cascade,
  farmer_user_id uuid not null references auth.users (id) on delete cascade,
  trader_name text not null,
  trader_business_name text,
  farmer_name text not null,
  farmer_phone text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (trader_farmer_id, farmer_user_id)
);

create index if not exists farmer_access_requests_farmer_status_idx
  on public.farmer_access_requests (farmer_user_id, status, requested_at desc);
create index if not exists farmer_access_requests_trader_idx
  on public.farmer_access_requests (trader_id, status, requested_at desc);

create or replace function public.farmer_has_approved_access(farmer_key bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.farmer_access_requests
    where trader_farmer_id = farmer_key
      and farmer_user_id = auth.uid()
      and status = 'approved'
  );
$$;

create or replace function public.create_farmer_access_request_for_trade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  farmer_record record;
  farmer_profile record;
begin
  select id, trader_id, name, phone
  into farmer_record
  from public.trader_farmers
  where id = new.farmer_id and trader_id = new.trader_id;

  if not found then
    return new;
  end if;

  select id, full_name, business_name
  into farmer_profile
  from public.profiles
  where account_type = 'farmer' and phone = farmer_record.phone
  order by created_at asc
  limit 1;

  if found then
    insert into public.farmer_access_requests (
      trader_id,
      trader_farmer_id,
      farmer_user_id,
      trader_name,
      trader_business_name,
      farmer_name,
      farmer_phone
    )
    values (
      new.trader_id,
      farmer_record.id,
      farmer_profile.id,
      coalesce((select full_name from public.profiles where id = new.trader_id), 'Trader'),
      (select business_name from public.profiles where id = new.trader_id),
      farmer_record.name,
      farmer_record.phone
    )
    on conflict (trader_farmer_id, farmer_user_id) do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.create_farmer_access_requests_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_type = 'farmer' and new.phone is not null then
    insert into public.farmer_access_requests (
      trader_id,
      trader_farmer_id,
      farmer_user_id,
      trader_name,
      trader_business_name,
      farmer_name,
      farmer_phone
    )
    select
      tf.trader_id,
      tf.id,
      new.id,
      coalesce(trader_profile.full_name, 'Trader'),
      trader_profile.business_name,
      tf.name,
      tf.phone
    from public.trader_farmers tf
    left join public.profiles trader_profile on trader_profile.id = tf.trader_id
    where tf.phone = new.phone
    on conflict (trader_farmer_id, farmer_user_id) do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.create_farmer_access_requests_for_trader_farmer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.farmer_access_requests (
    trader_id,
    trader_farmer_id,
    farmer_user_id,
    trader_name,
    trader_business_name,
    farmer_name,
    farmer_phone
  )
  select
    new.trader_id,
    new.id,
    farmer_profile.id,
    coalesce(trader_profile.full_name, 'Trader'),
    trader_profile.business_name,
    new.name,
    new.phone
  from public.profiles farmer_profile
  left join public.profiles trader_profile on trader_profile.id = new.trader_id
  where farmer_profile.account_type = 'farmer'
    and farmer_profile.phone = new.phone
  on conflict (trader_farmer_id, farmer_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists create_farmer_access_request_for_trade on public.coconut_trades;
create trigger create_farmer_access_request_for_trade
after insert or update of farmer_id, trader_id on public.coconut_trades
for each row execute function public.create_farmer_access_request_for_trade();

drop trigger if exists create_farmer_access_requests_for_profile on public.profiles;
create trigger create_farmer_access_requests_for_profile
after insert or update of account_type, phone on public.profiles
for each row execute function public.create_farmer_access_requests_for_profile();

drop trigger if exists create_farmer_access_requests_for_trader_farmer on public.trader_farmers;
create trigger create_farmer_access_requests_for_trader_farmer
after insert or update of trader_id, phone, name on public.trader_farmers
for each row execute function public.create_farmer_access_requests_for_trader_farmer();

create or replace function public.respond_to_farmer_access_request(request_key bigint, decision text)
returns public.farmer_access_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request_record public.farmer_access_requests;
begin
  if auth.uid() is null or decision not in ('approved', 'rejected') then
    raise exception 'Invalid access request decision.';
  end if;

  update public.farmer_access_requests
  set status = decision,
      responded_at = now()
  where id = request_key
    and farmer_user_id = auth.uid()
  returning * into request_record;

  if not found then
    raise exception 'Access request not found.';
  end if;

  return request_record;
end;
$$;

grant execute on function public.respond_to_farmer_access_request(bigint, text) to authenticated;

alter table public.farmer_access_requests enable row level security;

drop policy if exists "Participants can read farmer access requests" on public.farmer_access_requests;
create policy "Participants can read farmer access requests"
on public.farmer_access_requests for select
using (trader_id = auth.uid() or farmer_user_id = auth.uid());

drop policy if exists "Farmers can read approved shared farmers" on public.trader_farmers;
create policy "Farmers can read approved shared farmers"
on public.trader_farmers for select
using (public.farmer_has_approved_access(id));

drop policy if exists "Farmers can read approved shared locations" on public.farmer_locations;
create policy "Farmers can read approved shared locations"
on public.farmer_locations for select
using (public.farmer_has_approved_access(farmer_id));

drop policy if exists "Farmers can read approved shared purchases" on public.coconut_trades;
create policy "Farmers can read approved shared purchases"
on public.coconut_trades for select
using (
  exists (
    select 1
    from public.farmer_access_requests request
    where request.trader_id = coconut_trades.trader_id
      and request.trader_farmer_id = coconut_trades.farmer_id
      and request.farmer_user_id = auth.uid()
      and request.status = 'approved'
  )
);
