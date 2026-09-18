-- A legacy database can contain more than one farmer profile for the same phone.
-- Keep the approval gate, but notify every matching farmer account instead of only
-- the first match when a trader records a purchase.

drop trigger if exists validate_profile_phone_identity on public.profiles;
create trigger validate_profile_phone_identity
before insert or update on public.profiles
for each row execute function public.validate_profile_phone_identity();

create or replace function public.create_farmer_access_request_for_trade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  farmer_record record;
begin
  select id, trader_id, name, phone
  into farmer_record
  from public.trader_farmers
  where id = new.farmer_id
    and trader_id = new.trader_id;

  if not found then
    return new;
  end if;

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
    farmer_record.id,
    farmer_profile.id,
    coalesce(trader_profile.full_name, 'Trader'),
    trader_profile.business_name,
    farmer_record.name,
    farmer_record.phone
  from public.profiles as farmer_profile
  left join public.profiles as trader_profile
    on trader_profile.id = new.trader_id
  where farmer_profile.account_type = 'farmer'
    and farmer_profile.phone = farmer_record.phone
  on conflict (trader_farmer_id, farmer_user_id) do nothing;

  return new;
end;
$$;

-- Backfill any requests missed by the previous first-match implementation.
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
  farmer_record.trader_id,
  farmer_record.id,
  farmer_profile.id,
  coalesce(trader_profile.full_name, 'Trader'),
  trader_profile.business_name,
  farmer_record.name,
  farmer_record.phone
from public.trader_farmers as farmer_record
join public.profiles as farmer_profile
  on farmer_profile.account_type = 'farmer'
 and farmer_profile.phone = farmer_record.phone
left join public.profiles as trader_profile
  on trader_profile.id = farmer_record.trader_id
on conflict (trader_farmer_id, farmer_user_id) do nothing;
