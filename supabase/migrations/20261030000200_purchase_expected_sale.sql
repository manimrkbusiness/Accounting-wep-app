-- Expected sale on a weight purchase: the rate/buyer the trader expects to sell the coconut
-- and the husk for, so the purchase page can show a complete projected-profit summary for the
-- whole transaction (farmer payment + your costs vs expected coconut + husk sales).
-- These are planning estimates only; they are not referenced by any generated column.
alter table public.coconut_trades
  add column if not exists expected_sale_rate_per_kg numeric(14, 2) not null default 0,
  add column if not exists expected_buyer_id bigint references public.buyers (id) on delete set null,
  add column if not exists expected_husk_price_per_piece numeric(14, 2) not null default 0,
  add column if not exists expected_husk_buyer_id bigint references public.buyers (id) on delete set null;
