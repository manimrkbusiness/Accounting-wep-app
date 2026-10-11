-- A harvesting entry can record which farmer's coconuts were harvested and from which
-- location, so a purchase built from it is pre-filled with that farmer.

alter table public.harvesting_entries
  add column if not exists farmer_id bigint references public.trader_farmers (id) on delete set null,
  add column if not exists location_id bigint references public.farmer_locations (id) on delete set null;

create index if not exists harvesting_entries_farmer_idx on public.harvesting_entries (farmer_id);

create or replace function public.validate_harvesting_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_trader_owns('harvesting_teams', new.team_id, new.trader_id);
  perform public.assert_trader_owns('coconut_trades', new.purchase_id, new.trader_id);

  if new.farmer_id is not null and not exists (
    select 1 from public.trader_farmers where id = new.farmer_id and trader_id = new.trader_id
  ) then
    raise exception 'Farmer does not belong to this trader.';
  end if;

  if new.location_id is not null and not exists (
    select 1 from public.farmer_locations where id = new.location_id and farmer_id = new.farmer_id
  ) then
    raise exception 'Location does not belong to this farmer.';
  end if;

  return new;
end;
$$;
