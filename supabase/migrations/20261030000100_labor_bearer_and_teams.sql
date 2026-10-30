-- Dehusking and coconut harvesting on a weight purchase can now be borne by the FARMER
-- (deducted from their amount, as before) or by the TRADER (not deducted; the trader pays a
-- chosen team, booked as an expense that shows in that team's history with Paid/Pending).
--
-- Farmer-borne uses the existing husk_removal_rate_per_1000 / tree_collection_rate_per_1000
-- (fed into the generated farmer total). Trader-borne uses the trader_*_rate columns + a team,
-- which are NOT referenced by any generated column, so farmer totals are unaffected.
alter table public.coconut_trades
  add column if not exists trader_harvesting_rate_per_1000 numeric(14, 2) not null default 0,
  add column if not exists dehusking_team_id bigint references public.employees (id) on delete set null,
  add column if not exists harvesting_team_id bigint references public.employees (id) on delete set null;

-- Sync trader-borne dehusking and harvesting wages to the chosen team as expenses.
create or replace function public.sync_purchase_trader_labor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  deh_pieces numeric; har_pieces numeric; deh_cost numeric(14, 2); har_cost numeric(14, 2);
begin
  if tg_op = 'DELETE' then
    delete from public.expenses
      where purchase_id = old.id and trader_id = old.trader_id
        and category in ('dehusking_labor', 'harvesting_labor')
        and stock_entry_id is null and harvesting_entry_id is null;
    return old;
  end if;

  -- Dehusking the trader pays
  if new.purchase_mode = 'weight' and coalesce(new.trader_dehusking_rate_per_1000, 0) > 0
     and new.dehusking_team_id is not null and coalesce(new.coconut_quantity, 0) > 0 then
    deh_pieces := coalesce(new.dehusking_pieces, new.coconut_quantity);
    deh_cost := (deh_pieces / 1000.0) * new.trader_dehusking_rate_per_1000;
    if exists (select 1 from public.expenses where purchase_id = new.id and trader_id = new.trader_id
               and category = 'dehusking_labor' and stock_entry_id is null and harvesting_entry_id is null) then
      update public.expenses set expense_date = new.trade_date, amount = deh_cost, scope = 'coconut',
             employee_id = new.dehusking_team_id, description = 'Dehusking on purchase (you pay)'
        where purchase_id = new.id and trader_id = new.trader_id
          and category = 'dehusking_labor' and stock_entry_id is null and harvesting_entry_id is null;
    else
      insert into public.expenses (trader_id, expense_date, category, scope, amount, employee_id, purchase_id, description)
      values (new.trader_id, new.trade_date, 'dehusking_labor', 'coconut', deh_cost, new.dehusking_team_id, new.id, 'Dehusking on purchase (you pay)');
    end if;
  else
    delete from public.expenses where purchase_id = new.id and trader_id = new.trader_id
      and category = 'dehusking_labor' and stock_entry_id is null and harvesting_entry_id is null;
  end if;

  -- Harvesting the trader pays
  if new.purchase_mode = 'weight' and coalesce(new.trader_harvesting_rate_per_1000, 0) > 0
     and new.harvesting_team_id is not null and coalesce(new.coconut_quantity, 0) > 0 then
    har_pieces := coalesce(new.harvesting_pieces, new.coconut_quantity);
    har_cost := (har_pieces / 1000.0) * new.trader_harvesting_rate_per_1000;
    if exists (select 1 from public.expenses where purchase_id = new.id and trader_id = new.trader_id
               and category = 'harvesting_labor' and stock_entry_id is null and harvesting_entry_id is null) then
      update public.expenses set expense_date = new.trade_date, amount = har_cost, scope = 'coconut',
             employee_id = new.harvesting_team_id, description = 'Harvesting on purchase (you pay)'
        where purchase_id = new.id and trader_id = new.trader_id
          and category = 'harvesting_labor' and stock_entry_id is null and harvesting_entry_id is null;
    else
      insert into public.expenses (trader_id, expense_date, category, scope, amount, employee_id, purchase_id, description)
      values (new.trader_id, new.trade_date, 'harvesting_labor', 'coconut', har_cost, new.harvesting_team_id, new.id, 'Harvesting on purchase (you pay)');
    end if;
  else
    delete from public.expenses where purchase_id = new.id and trader_id = new.trader_id
      and category = 'harvesting_labor' and stock_entry_id is null and harvesting_entry_id is null;
  end if;

  return new;
end;
$$;

-- Replaces the earlier weight+husk-only dehusking trigger.
drop trigger if exists sync_husk_included_dehusking on public.coconut_trades;
drop trigger if exists sync_purchase_trader_labor on public.coconut_trades;
create trigger sync_purchase_trader_labor after insert or update or delete on public.coconut_trades
for each row execute function public.sync_purchase_trader_labor();
