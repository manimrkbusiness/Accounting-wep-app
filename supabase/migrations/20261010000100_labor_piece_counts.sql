-- Labor on a purchase can cover a different piece count from the pieces bought.
-- Naturally dropped coconuts need dehusking but no harvesting, for example.
-- dehusking_pieces / harvesting_pieces hold the pieces each labor team handled;
-- null means "same as coconut_quantity", which keeps Version 1 and old rows unchanged.

alter table public.coconut_trades
  drop constraint if exists coconut_trades_labor_not_greater_than_purchase_check,
  drop constraint if exists coconut_trades_advance_not_greater_than_total_check;

alter table public.coconut_trades
  drop column if exists husk_removal_cost,
  drop column if exists tree_collection_cost,
  drop column if exists labor_cost_total,
  drop column if exists total_amount,
  drop column if exists balance_amount,
  drop column if exists average_price_per_piece;

alter table public.coconut_trades
  add column if not exists dehusking_pieces numeric(14, 2) check (dehusking_pieces is null or dehusking_pieces >= 0),
  add column if not exists harvesting_pieces numeric(14, 2) check (harvesting_pieces is null or harvesting_pieces >= 0);

alter table public.coconut_trades
  add column husk_removal_cost numeric(14, 2)
    generated always as ((coalesce(dehusking_pieces, coconut_quantity) / 1000) * husk_removal_rate_per_1000) stored,
  add column tree_collection_cost numeric(14, 2)
    generated always as ((coalesce(harvesting_pieces, coconut_quantity) / 1000) * tree_collection_rate_per_1000) stored,
  add column labor_cost_total numeric(14, 2)
    generated always as (
      ((coalesce(dehusking_pieces, coconut_quantity) / 1000) * husk_removal_rate_per_1000)
      + ((coalesce(harvesting_pieces, coconut_quantity) / 1000) * tree_collection_rate_per_1000)
    ) stored,
  add column total_amount numeric(14, 2)
    generated always as (
      (case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else (net_weight_kg * (1 - wastage_percent / 100)) * rate_per_kg
      end)
      + (coconut_quantity * husk_price_per_piece)
      - ((coalesce(dehusking_pieces, coconut_quantity) / 1000) * husk_removal_rate_per_1000)
      - ((coalesce(harvesting_pieces, coconut_quantity) / 1000) * tree_collection_rate_per_1000)
    ) stored,
  add column balance_amount numeric(14, 2)
    generated always as (
      (case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else (net_weight_kg * (1 - wastage_percent / 100)) * rate_per_kg
      end)
      + (coconut_quantity * husk_price_per_piece)
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
          + (coconut_quantity * husk_price_per_piece)
          - ((coalesce(dehusking_pieces, coconut_quantity) / 1000) * husk_removal_rate_per_1000)
          - ((coalesce(harvesting_pieces, coconut_quantity) / 1000) * tree_collection_rate_per_1000)
        ) / coconut_quantity
        else 0
      end
    ) stored;

alter table public.coconut_trades
  add constraint coconut_trades_labor_not_greater_than_purchase_check
    check (
      ((coalesce(dehusking_pieces, coconut_quantity) / 1000) * husk_removal_rate_per_1000)
      + ((coalesce(harvesting_pieces, coconut_quantity) / 1000) * tree_collection_rate_per_1000)
      <= case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else (net_weight_kg * (1 - wastage_percent / 100) * rate_per_kg)
      end
    ),
  add constraint coconut_trades_advance_not_greater_than_total_check
    check (
      advance_amount <= (case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else (net_weight_kg * (1 - wastage_percent / 100)) * rate_per_kg
      end)
        + (coconut_quantity * husk_price_per_piece)
        - ((coalesce(dehusking_pieces, coconut_quantity) / 1000) * husk_removal_rate_per_1000)
        - ((coalesce(harvesting_pieces, coconut_quantity) / 1000) * tree_collection_rate_per_1000)
    );
