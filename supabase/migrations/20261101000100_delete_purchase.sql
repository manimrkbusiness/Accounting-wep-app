-- Let a trader delete a purchase even after it has flowed into stock, sales, husk sales or
-- wastage (the FKs to coconut_trades are RESTRICT and block a plain delete). This removes the
-- purchase and everything derived from it, scoped to the signed-in trader. Stock entries / sales
-- fed only by this purchase are removed whole; shared ones keep their other purchases' lines.
--
-- Order matters: sales and wastage are removed FIRST, so the protect_sold_stock guard (which
-- blocks removing stock while pieces are still sold or wasted) sees nothing outstanding when the
-- stock entries are removed.
create or replace function public.delete_purchase(p_purchase_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.coconut_trades where id = p_purchase_id and trader_id = uid) then
    raise exception 'Purchase not found' using errcode = 'no_data_found';
  end if;

  -- 1. Coconut sales fed only by this purchase: delete whole; otherwise drop just this purchase's lines.
  delete from public.sales s where s.trader_id = uid
    and exists (select 1 from public.sale_items i where i.sale_id = s.id and i.purchase_id = p_purchase_id)
    and not exists (select 1 from public.sale_items i where i.sale_id = s.id and i.purchase_id <> p_purchase_id);
  delete from public.sale_items where purchase_id = p_purchase_id and trader_id = uid;

  -- 2. Husk sales fed only by this purchase: delete whole; otherwise drop just this purchase's lines.
  delete from public.sales s where s.trader_id = uid
    and exists (select 1 from public.husk_sale_items i where i.sale_id = s.id and i.purchase_id = p_purchase_id)
    and not exists (select 1 from public.husk_sale_items i where i.sale_id = s.id and i.purchase_id <> p_purchase_id);
  delete from public.husk_sale_items where purchase_id = p_purchase_id and trader_id = uid;

  -- 3. Wastage (before the stock entries, so the guard sees 0 wasted).
  delete from public.stock_wastage where purchase_id = p_purchase_id and trader_id = uid;

  -- 4. Stock entries fed only by this purchase: delete whole (cascades items + dehusking expense);
  --    shared ones keep their other purchases' lines.
  delete from public.stock_entries se where se.trader_id = uid
    and exists (select 1 from public.stock_entry_items i where i.stock_entry_id = se.id and i.purchase_id = p_purchase_id)
    and not exists (select 1 from public.stock_entry_items i where i.stock_entry_id = se.id and i.purchase_id <> p_purchase_id);
  delete from public.stock_entry_items where purchase_id = p_purchase_id and trader_id = uid;

  -- 5. Finally the purchase (expenses/cash/harvesting unlink via SET NULL; the labor trigger clears its expenses).
  delete from public.coconut_trades where id = p_purchase_id and trader_id = uid;
end;
$$;

grant execute on function public.delete_purchase(bigint) to authenticated;
