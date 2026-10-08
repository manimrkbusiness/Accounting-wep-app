-- Husk / Mattai credit is priced per coconut, not per 1,000 pieces.
-- Values that were entered per 1,000 (100 or more) are divided by 1,000 so stored totals stay
-- the same. Small values (under 100) were already meant per nut and are kept as they are.

-- Trader defaults -----------------------------------------------------------

alter table public.trader_settings
  drop constraint if exists trader_settings_husk_price_per_1000_check;

alter table public.trader_settings
  rename column husk_price_per_1000 to husk_price_per_piece;

alter table public.trader_settings
  alter column husk_price_per_piece type numeric(14, 4);

update public.trader_settings
set husk_price_per_piece = case when husk_price_per_piece >= 100 then round(husk_price_per_piece / 1000, 4) else husk_price_per_piece end;

alter table public.trader_settings
  add constraint trader_settings_husk_price_per_piece_check
    check (husk_price_per_piece >= 0);

-- Purchases -----------------------------------------------------------------

alter table public.coconut_trades
  drop constraint if exists coconut_trades_husk_price_per_1000_check,
  drop constraint if exists coconut_trades_advance_not_greater_than_total_check;

alter table public.coconut_trades
  drop column if exists husk_price_total,
  drop column if exists total_amount,
  drop column if exists balance_amount,
  drop column if exists average_price_per_piece;

alter table public.coconut_trades
  rename column husk_price_per_1000 to husk_price_per_piece;

alter table public.coconut_trades
  alter column husk_price_per_piece type numeric(14, 4);

update public.coconut_trades
set husk_price_per_piece = case when husk_price_per_piece >= 100 then round(husk_price_per_piece / 1000, 4) else husk_price_per_piece end;

alter table public.coconut_trades
  add constraint coconut_trades_husk_price_per_piece_check
    check (husk_price_per_piece >= 0);

alter table public.coconut_trades
  add column husk_price_total numeric(14, 2)
    generated always as (coconut_quantity * husk_price_per_piece) stored,
  add column total_amount numeric(14, 2)
    generated always as (
      (case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else (net_weight_kg * (1 - wastage_percent / 100)) * rate_per_kg
      end)
      + (coconut_quantity * husk_price_per_piece)
      - ((coconut_quantity / 1000) * husk_removal_rate_per_1000)
      - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)
    ) stored,
  add column balance_amount numeric(14, 2)
    generated always as (
      (case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else (net_weight_kg * (1 - wastage_percent / 100)) * rate_per_kg
      end)
      + (coconut_quantity * husk_price_per_piece)
      - ((coconut_quantity / 1000) * husk_removal_rate_per_1000)
      - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)
      - advance_amount
      + additional_credit_amount
      - additional_debit_amount
    ) stored,
  add column average_price_per_piece numeric(14, 2)
    generated always as (
      case when coconut_quantity > 0
        then (
          (case when purchase_mode = 'quantity'
            then coconut_quantity * rate_per_piece
            else (net_weight_kg * (1 - wastage_percent / 100)) * rate_per_kg
          end)
          + (coconut_quantity * husk_price_per_piece)
          - ((coconut_quantity / 1000) * husk_removal_rate_per_1000)
          - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)
        ) / coconut_quantity
        else 0
      end
    ) stored;

alter table public.coconut_trades
  add constraint coconut_trades_advance_not_greater_than_total_check
    check (
      advance_amount <= (case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else (net_weight_kg * (1 - wastage_percent / 100)) * rate_per_kg
      end)
        + (coconut_quantity * husk_price_per_piece)
        - ((coconut_quantity / 1000) * husk_removal_rate_per_1000)
        - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)
    );
