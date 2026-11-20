-- Harvest reminders: a default harvest cycle (days) per trader, plus an optional per-farmer override.
-- The "due date" for a farmer's next harvest is their last recorded harvest + the effective interval
-- (farmer override, else the trader default). Nothing is scheduled server-side; the app surfaces who
-- is due so the trader can send a WhatsApp reminder.

alter table public.trader_settings
  add column if not exists harvest_reminder_days integer not null default 45;

alter table public.trader_farmers
  add column if not exists harvest_interval_days integer;

alter table public.trader_settings
  drop constraint if exists trader_settings_harvest_days_chk;
alter table public.trader_settings
  add constraint trader_settings_harvest_days_chk check (harvest_reminder_days between 1 and 365);

alter table public.trader_farmers
  drop constraint if exists trader_farmers_harvest_interval_chk;
alter table public.trader_farmers
  add constraint trader_farmers_harvest_interval_chk check (harvest_interval_days is null or harvest_interval_days between 1 and 365);
