alter table public.profiles
add column if not exists email text;

update public.profiles
set email = auth.users.email
from auth.users
where public.profiles.id = auth.users.id
  and public.profiles.email is null;

update public.profiles
set phone = '+91' || phone
where phone ~ '^[6-9][0-9]{9}$';

alter table public.profiles
drop constraint if exists profiles_phone_india_format;

alter table public.profiles
add constraint profiles_phone_india_format
check (phone is null or phone ~ '^\+91[6-9][0-9]{9}$');

create unique index if not exists profiles_email_unique_idx
on public.profiles (lower(email))
where email is not null;

create index if not exists profiles_phone_idx
on public.profiles (phone)
where phone is not null;
