-- Harvesting is recorded against a single person — the team head — chosen from the
-- trader's workers, instead of a multi-member team. head_employee_id holds that worker.

alter table public.harvesting_entries
  add column if not exists head_employee_id bigint references public.employees (id) on delete set null;

create index if not exists harvesting_entries_head_idx on public.harvesting_entries (head_employee_id);

create or replace function public.validate_harvesting_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_trader_owns('harvesting_teams', new.team_id, new.trader_id);
  perform public.assert_trader_owns('employees', new.head_employee_id, new.trader_id);
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

create or replace function public.sync_harvesting_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  label text;
begin
  select name into label from public.employees where id = new.head_employee_id;
  if label is null then
    select name into label from public.harvesting_teams where id = new.team_id;
  end if;
  if new.total_cost > 0 then
    if exists (select 1 from public.expenses where harvesting_entry_id = new.id) then
      update public.expenses
      set expense_date = new.harvest_date,
          amount = new.total_cost,
          category = 'harvesting_labor',
          scope = 'coconut',
          employee_id = new.head_employee_id,
          purchase_id = new.purchase_id,
          description = 'Harvesting' || coalesce(' by ' || label, '') || ' on ' || to_char(new.harvest_date, 'DD Mon YYYY')
      where harvesting_entry_id = new.id and trader_id = new.trader_id;
    else
      insert into public.expenses (trader_id, expense_date, category, scope, amount, employee_id, purchase_id, harvesting_entry_id, description)
      values (new.trader_id, new.harvest_date, 'harvesting_labor', 'coconut', new.total_cost, new.head_employee_id, new.purchase_id, new.id,
        'Harvesting' || coalesce(' by ' || label, '') || ' on ' || to_char(new.harvest_date, 'DD Mon YYYY'));
    end if;
  else
    delete from public.expenses where harvesting_entry_id = new.id and trader_id = new.trader_id;
  end if;
  return new;
end;
$$;
