-- A separate "husk loading worker" role, and a Rs.180 default husk loading rate.

-- Allow the husk_loader role alongside the existing coconut loader.
alter table public.employees drop constraint if exists employees_role_check;
alter table public.employees
  add constraint employees_role_check
    check (role in ('harvester', 'dehusker', 'loader', 'husk_loader', 'driver', 'supervisor', 'other'));

-- Husk loading default becomes Rs.180 per 1,000 pieces (editable per trader in Settings).
alter table public.trader_settings alter column husk_loading_rate_per_1000 set default 180;
update public.trader_settings set husk_loading_rate_per_1000 = 180 where husk_loading_rate_per_1000 = 0;
