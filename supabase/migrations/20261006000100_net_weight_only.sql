-- Weight-based purchases now record the weighbridge net weight directly.
-- Empty and gross weights are no longer captured; net_weight_kg becomes a stored input.
-- Husk / Mattai credit and Kudume wastage remain weight-based concepts only; the
-- app sends 0 for quantity-based purchases.

alter table public.coconut_trades
  drop column if exists net_weight_kg,
  drop column if exists wastage_weight_kg,
  drop column if exists payable_weight_kg,
  drop column if exists total_amount,
  drop column if exists balance_amount,
  drop column if exists average_weight_kg,
  drop column if exists average_price_per_piece;

alter table public.coconut_trades
  drop constraint if exists coconut_trades_purchase_mode_fields_check,
  drop constraint if exists coconut_trades_labor_not_greater_than_purchase_check,
  drop constraint if exists coconut_trades_advance_not_greater_than_total_check,
  drop constraint if exists coconut_trades_debit_not_greater_than_balance_check,
  drop constraint if exists coconut_trades_empty_weight_kg_check,
  drop constraint if exists coconut_trades_net_weight_kg_check;

alter table public.coconut_trades
  add column net_weight_kg numeric(14, 3) not null default 0;

update public.coconut_trades
set net_weight_kg = greatest(gross_weight_kg - empty_weight_kg, 0);

alter table public.coconut_trades
  drop column gross_weight_kg,
  drop column empty_weight_kg;

alter table public.coconut_trades
  add column wastage_weight_kg numeric(14, 3)
    generated always as (net_weight_kg * wastage_percent / 100) stored,
  add column payable_weight_kg numeric(14, 3)
    generated always as (net_weight_kg * (1 - wastage_percent / 100)) stored,
  add column total_amount numeric(14, 2)
    generated always as (
      (case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else (net_weight_kg * (1 - wastage_percent / 100)) * rate_per_kg
      end)
      + ((coconut_quantity / 1000) * husk_price_per_1000)
      - ((coconut_quantity / 1000) * husk_removal_rate_per_1000)
      - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)
    ) stored,
  add column balance_amount numeric(14, 2)
    generated always as (
      (case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else (net_weight_kg * (1 - wastage_percent / 100)) * rate_per_kg
      end)
      + ((coconut_quantity / 1000) * husk_price_per_1000)
      - ((coconut_quantity / 1000) * husk_removal_rate_per_1000)
      - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)
      - advance_amount
      + additional_credit_amount
      - additional_debit_amount
    ) stored,
  add column average_weight_kg numeric(14, 6)
    generated always as (
      case when purchase_mode = 'weight' and coconut_quantity > 0
        then net_weight_kg / coconut_quantity
        else 0
      end
    ) stored,
  add column average_price_per_piece numeric(14, 2)
    generated always as (
      case when coconut_quantity > 0
        then (
          (case when purchase_mode = 'quantity'
            then coconut_quantity * rate_per_piece
            else (net_weight_kg * (1 - wastage_percent / 100)) * rate_per_kg
          end)
          + ((coconut_quantity / 1000) * husk_price_per_1000)
          - ((coconut_quantity / 1000) * husk_removal_rate_per_1000)
          - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)
        ) / coconut_quantity
        else 0
      end
    ) stored;

alter table public.coconut_trades
  add constraint coconut_trades_net_weight_kg_check
    check (net_weight_kg >= 0),
  add constraint coconut_trades_purchase_mode_fields_check
    check (
      (purchase_mode = 'weight' and net_weight_kg > 0)
      or (purchase_mode = 'quantity' and net_weight_kg = 0)
    ),
  add constraint coconut_trades_labor_not_greater_than_purchase_check
    check (
      ((coconut_quantity / 1000) * husk_removal_rate_per_1000)
      + ((coconut_quantity / 1000) * tree_collection_rate_per_1000)
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
        + ((coconut_quantity / 1000) * husk_price_per_1000)
        - ((coconut_quantity / 1000) * husk_removal_rate_per_1000)
        - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)
    );
