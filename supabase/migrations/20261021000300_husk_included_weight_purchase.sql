-- "Including husk" weight purchases: the coconut is bought with the husk still on. The husk is kept
-- at no extra cost — no separate dehusking charge, and nothing is added to the farmer payment — and
-- is tracked for the husk sale (stored as buys_husk = true with husk_price_per_piece = 0). This flag
-- only records which of the two weight-purchase modes was used, so the form restores it on edit.
alter table public.coconut_trades
  add column if not exists husk_included boolean not null default false;
