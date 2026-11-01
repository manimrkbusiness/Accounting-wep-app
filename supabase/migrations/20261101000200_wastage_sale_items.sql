-- Wasted coconuts are sold from specific purchases (so the source farmer and a per-purchase
-- balance are tracked), picked with tick-boxes like Stock and Coconut sales. Each wastage sale
-- now has line items pointing at the purchase the wasted nuts came from.
create table if not exists public.wastage_sale_items (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  wastage_sale_id bigint not null references public.wastage_sales (id) on delete cascade,
  purchase_id bigint not null references public.coconut_trades (id) on delete cascade,
  quantity_pieces integer not null check (quantity_pieces > 0),
  created_at timestamptz not null default now()
);

create index if not exists wastage_sale_items_sale_idx on public.wastage_sale_items (trader_id, wastage_sale_id);
create index if not exists wastage_sale_items_purchase_idx on public.wastage_sale_items (trader_id, purchase_id);

alter table public.wastage_sale_items enable row level security;

drop policy if exists "Traders manage their wastage sale items" on public.wastage_sale_items;
create policy "Traders manage their wastage sale items" on public.wastage_sale_items for all
using (trader_id = auth.uid()) with check (trader_id = auth.uid());
