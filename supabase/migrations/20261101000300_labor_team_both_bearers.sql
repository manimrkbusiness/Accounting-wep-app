-- A dehusking / harvesting team can now be recorded whoever bears the cost. Book the wage to the
-- chosen team as an expense whenever a team is assigned and the labor applies, using the farmer
-- rate (husk_removal / tree_collection) or the trader rate — whichever is set. For farmer-borne
-- labor this records the team's payment while the farmer deduction (a generated column) still
-- reduces the farmer amount, so the two net out; for trader-borne it is the trader's own cost.
create or replace function public.sync_purchase_trader_labor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  deh_pieces numeric; har_pieces numeric; deh_rate numeric; har_rate numeric; deh_cost numeric(14, 2); har_cost numeric(14, 2);
begin
  if tg_op = 'DELETE' then
    delete from public.expenses
      where purchase_id = old.id and trader_id = old.trader_id
        and category in ('dehusking_labor', 'harvesting_labor')
        and stock_entry_id is null and harvesting_entry_id is null;
    return old;
  end if;

  deh_rate := coalesce(new.husk_removal_rate_per_1000, 0) + coalesce(new.trader_dehusking_rate_per_1000, 0);
  har_rate := coalesce(new.tree_collection_rate_per_1000, 0) + coalesce(new.trader_harvesting_rate_per_1000, 0);

  -- Dehusking wage to the chosen team
  if new.purchase_mode = 'weight' and new.dehusking_team_id is not null and deh_rate > 0 and coalesce(new.coconut_quantity, 0) > 0 then
    deh_pieces := coalesce(new.dehusking_pieces, new.coconut_quantity);
    deh_cost := (deh_pieces / 1000.0) * deh_rate;
    if exists (select 1 from public.expenses where purchase_id = new.id and trader_id = new.trader_id
               and category = 'dehusking_labor' and stock_entry_id is null and harvesting_entry_id is null) then
      update public.expenses set expense_date = new.trade_date, amount = deh_cost, scope = 'coconut',
             employee_id = new.dehusking_team_id, description = 'Dehusking on purchase'
        where purchase_id = new.id and trader_id = new.trader_id
          and category = 'dehusking_labor' and stock_entry_id is null and harvesting_entry_id is null;
    else
      insert into public.expenses (trader_id, expense_date, category, scope, amount, employee_id, purchase_id, description)
      values (new.trader_id, new.trade_date, 'dehusking_labor', 'coconut', deh_cost, new.dehusking_team_id, new.id, 'Dehusking on purchase');
    end if;
  else
    delete from public.expenses where purchase_id = new.id and trader_id = new.trader_id
      and category = 'dehusking_labor' and stock_entry_id is null and harvesting_entry_id is null;
  end if;

  -- Harvesting wage to the chosen team (only when the purchase is not built from a linked harvest,
  -- which books its own harvesting expense; in that case harvesting_team_id is left null by the form).
  if new.purchase_mode = 'weight' and new.harvesting_team_id is not null and har_rate > 0 and coalesce(new.coconut_quantity, 0) > 0 then
    har_pieces := coalesce(new.harvesting_pieces, new.coconut_quantity);
    har_cost := (har_pieces / 1000.0) * har_rate;
    if exists (select 1 from public.expenses where purchase_id = new.id and trader_id = new.trader_id
               and category = 'harvesting_labor' and stock_entry_id is null and harvesting_entry_id is null) then
      update public.expenses set expense_date = new.trade_date, amount = har_cost, scope = 'coconut',
             employee_id = new.harvesting_team_id, description = 'Harvesting on purchase'
        where purchase_id = new.id and trader_id = new.trader_id
          and category = 'harvesting_labor' and stock_entry_id is null and harvesting_entry_id is null;
    else
      insert into public.expenses (trader_id, expense_date, category, scope, amount, employee_id, purchase_id, description)
      values (new.trader_id, new.trade_date, 'harvesting_labor', 'coconut', har_cost, new.harvesting_team_id, new.id, 'Harvesting on purchase');
    end if;
  else
    delete from public.expenses where purchase_id = new.id and trader_id = new.trader_id
      and category = 'harvesting_labor' and stock_entry_id is null and harvesting_entry_id is null;
  end if;

  return new;
end;
$$;
