-- Selling wasted coconuts: the per-nut coconuts picked from stock but not loaded
-- (stock-stage wastage) can be sold to someone at a small rate. Their cost is already
-- absorbed into the surviving nuts, so this income is pure profit on the dashboard.
create table if not exists public.wastage_sales (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  sale_date date not null default current_date,
  buyer_id bigint references public.buyers (id) on delete set null,
  buyer_name text,
  quantity_pieces integer not null check (quantity_pieces > 0),
  rate_per_piece numeric(12, 2) not null default 0 check (rate_per_piece >= 0),
  amount numeric(14, 2) generated always as (quantity_pieces * rate_per_piece) stored,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wastage_sales_trader_date_idx on public.wastage_sales (trader_id, sale_date desc, id desc);

alter table public.wastage_sales enable row level security;

drop policy if exists "Traders manage their wastage sales" on public.wastage_sales;
create policy "Traders manage their wastage sales" on public.wastage_sales for all
using (trader_id = auth.uid()) with check (trader_id = auth.uid());

drop trigger if exists set_wastage_sales_updated_at on public.wastage_sales;
create trigger set_wastage_sales_updated_at before update on public.wastage_sales
for each row execute function public.set_updated_at();
