-- Husk comes from the pieces that were dehusked, so the husk / mattai credit is now
-- calculated on dehusking_pieces (falling back to coconut_quantity when it is null).
-- Rows without a dehusking count are unchanged.

alter table public.coconut_trades
  drop constraint if exists coconut_trades_advance_not_greater_than_total_check;

alter table public.coconut_trades
  drop column if exists husk_price_total,
  drop column if exists total_amount,
  drop column if exists balance_amount,
  drop column if exists average_price_per_piece;

alter table public.coconut_trades
  add column husk_price_total numeric(14, 2)
    generated always as (coalesce(dehusking_pieces, coconut_quantity) * husk_price_per_piece) stored,
  add column total_amount numeric(14, 2)
    generated always as (
      (case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else (net_weight_kg * (1 - wastage_percent / 100)) * rate_per_kg
      end)
      + (coalesce(dehusking_pieces, coconut_quantity) * husk_price_per_piece)
      - ((coalesce(dehusking_pieces, coconut_quantity) / 1000) * husk_removal_rate_per_1000)
      - ((coalesce(harvesting_pieces, coconut_quantity) / 1000) * tree_collection_rate_per_1000)
    ) stored,
  add column balance_amount numeric(14, 2)
    generated always as (
      (case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else (net_weight_kg * (1 - wastage_percent / 100)) * rate_per_kg
      end)
      + (coalesce(dehusking_pieces, coconut_quantity) * husk_price_per_piece)
      - ((coalesce(dehusking_pieces, coconut_quantity) / 1000) * husk_removal_rate_per_1000)
      - ((coalesce(harvesting_pieces, coconut_quantity) / 1000) * tree_collection_rate_per_1000)
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
          + (coalesce(dehusking_pieces, coconut_quantity) * husk_price_per_piece)
          - ((coalesce(dehusking_pieces, coconut_quantity) / 1000) * husk_removal_rate_per_1000)
          - ((coalesce(harvesting_pieces, coconut_quantity) / 1000) * tree_collection_rate_per_1000)
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
        + (coalesce(dehusking_pieces, coconut_quantity) * husk_price_per_piece)
        - ((coalesce(dehusking_pieces, coconut_quantity) / 1000) * husk_removal_rate_per_1000)
        - ((coalesce(harvesting_pieces, coconut_quantity) / 1000) * tree_collection_rate_per_1000)
    );
