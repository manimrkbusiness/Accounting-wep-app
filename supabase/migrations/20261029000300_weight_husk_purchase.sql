-- Third purchase method: "Weight + husk". The farmer is paid the full weighbridge
-- amount (no dehusking/harvesting deductions, no separate husk credit); the trader
-- dehusks and bears that cost, and keeps the husk to resell.
--
-- The husk reuses the existing buys_husk path at husk_price_per_piece = 0 (zero farmer
-- credit, husk in hand at no cost). The dehusking is the trader's own cost, booked as a
-- dehusking_labor expense from the rate below so it is not deducted from the farmer and
-- is not referenced by any generated column (farmer totals are unaffected).
alter table public.coconut_trades
  add column if not exists trader_dehusking_rate_per_1000 numeric(14, 2) not null default 0;

-- Keep a dehusking expense in sync for weight+husk purchases (insert/update/remove).
create or replace function public.sync_husk_included_dehusking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cost numeric(14, 2);
begin
  if tg_op = 'DELETE' then
    delete from public.expenses
      where purchase_id = old.id and trader_id = old.trader_id
        and category = 'dehusking_labor' and stock_entry_id is null and harvesting_entry_id is null;
    return old;
  end if;

  if new.husk_included and new.purchase_mode = 'weight'
     and coalesce(new.coconut_quantity, 0) > 0 and coalesce(new.trader_dehusking_rate_per_1000, 0) > 0 then
    cost := (new.coconut_quantity / 1000.0) * new.trader_dehusking_rate_per_1000;
    if exists (
      select 1 from public.expenses
      where purchase_id = new.id and trader_id = new.trader_id
        and category = 'dehusking_labor' and stock_entry_id is null and harvesting_entry_id is null
    ) then
      update public.expenses
        set expense_date = new.trade_date, amount = cost, scope = 'coconut',
            description = 'Dehusking on weight + husk purchase'
      where purchase_id = new.id and trader_id = new.trader_id
        and category = 'dehusking_labor' and stock_entry_id is null and harvesting_entry_id is null;
    else
      insert into public.expenses (trader_id, expense_date, category, scope, amount, purchase_id, description)
      values (new.trader_id, new.trade_date, 'dehusking_labor', 'coconut', cost, new.id, 'Dehusking on weight + husk purchase');
    end if;
  else
    delete from public.expenses
      where purchase_id = new.id and trader_id = new.trader_id
        and category = 'dehusking_labor' and stock_entry_id is null and harvesting_entry_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_husk_included_dehusking on public.coconut_trades;
create trigger sync_husk_included_dehusking after insert or update or delete on public.coconut_trades
for each row execute function public.sync_husk_included_dehusking();
