alter table public.trader_farmers
  drop constraint if exists trader_farmers_phone_check;

alter table public.trader_farmers
  add constraint trader_farmers_phone_check
  check (phone ~ '^\+91[6-9][0-9]{9}$');
