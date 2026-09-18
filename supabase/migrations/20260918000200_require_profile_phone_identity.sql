-- Phone numbers are the central identity used to match traders with farmer accounts.
-- Existing metadata is used to repair older profiles before enforcing new writes.

update public.profiles as profile
set phone = case
  when user_record.raw_user_meta_data ->> 'phone' ~ '^\+91[6-9][0-9]{9}$'
    then user_record.raw_user_meta_data ->> 'phone'
  when user_record.raw_user_meta_data ->> 'phone' ~ '^[6-9][0-9]{9}$'
    then '+91' || (user_record.raw_user_meta_data ->> 'phone')
  else profile.phone
end
from auth.users as user_record
where profile.id = user_record.id
  and (profile.phone is null or profile.phone !~ '^\+91[6-9][0-9]{9}$');

create index if not exists profiles_phone_lookup_idx
on public.profiles (phone)
where phone is not null;

create or replace function public.validate_profile_phone_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.phone is null or new.phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'A valid Indian mobile number is required for every account.';
  end if;

  if exists (
    select 1
    from public.profiles as existing_profile
    where existing_profile.phone = new.phone
      and existing_profile.id <> new.id
  ) then
    raise exception 'This mobile number is already linked to another account.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_profile_phone_identity on public.profiles;
create trigger validate_profile_phone_identity
before insert or update of phone on public.profiles
for each row execute function public.validate_profile_phone_identity();

do $$
begin
  if not exists (select 1 from public.profiles where phone is null) then
    alter table public.profiles alter column phone set not null;
  end if;
end;
$$;

-- Create missing approval requests for matches that existed before the sharing trigger.
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
