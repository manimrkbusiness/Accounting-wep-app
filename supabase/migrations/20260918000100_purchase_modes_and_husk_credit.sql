-- Support both weighbridge purchases and direct per-nut purchases.
-- Husk / Mattai is a farmer credit; dehusking and harvesting are optional deductions.

alter table public.trader_settings
  add column if not exists purchase_mode text not null default 'weight',
  add column if not exists husk_price_per_1000 numeric(14, 2) not null default 0;

alter table public.trader_settings
  drop constraint if exists trader_settings_purchase_mode_check,
  drop constraint if exists trader_settings_husk_price_per_1000_check;

alter table public.trader_settings
  add constraint trader_settings_purchase_mode_check
    check (purchase_mode in ('weight', 'quantity')),
  add constraint trader_settings_husk_price_per_1000_check
    check (husk_price_per_1000 >= 0);

alter table public.coconut_trades
  add column if not exists purchase_mode text not null default 'weight',
  add column if not exists rate_per_piece numeric(14, 2) not null default 0,
  add column if not exists husk_price_per_1000 numeric(14, 2) not null default 0;

alter table public.coconut_trades
  drop column if exists net_weight_kg,
  drop column if exists wastage_weight_kg,
  drop column if exists payable_weight_kg,
  drop column if exists total_amount,
  drop column if exists balance_amount,
  drop column if exists average_weight_kg,
  drop column if exists average_price_per_piece,
  drop column if exists husk_price_total;

do $$
declare
  constraint_record record;
  definition text;
begin
  for constraint_record in
    select conname, pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'public.coconut_trades'::regclass
      and contype = 'c'
  loop
    definition := constraint_record.definition;
    if definition ilike '%gross_weight_kg >%'
      or definition ilike '%empty_weight_kg <= gross_weight_kg%' then
      execute format('alter table public.coconut_trades drop constraint %I', constraint_record.conname);
    end if;
  end loop;
end $$;

alter table public.coconut_trades
  drop constraint if exists coconut_trades_labor_not_greater_than_purchase_check,
  drop constraint if exists coconut_trades_advance_not_greater_than_total_check,
  drop constraint if exists coconut_trades_advance_not_greater_than_net_payment_check,
  drop constraint if exists coconut_trades_debit_not_greater_than_balance_check;

alter table public.coconut_trades
  add column net_weight_kg numeric(14, 3)
    generated always as (gross_weight_kg - empty_weight_kg) stored,
  add column wastage_weight_kg numeric(14, 3)
    generated always as ((gross_weight_kg - empty_weight_kg) * wastage_percent / 100) stored,
  add column payable_weight_kg numeric(14, 3)
    generated always as ((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100)) stored,
  add column husk_price_total numeric(14, 2)
    generated always as ((coconut_quantity / 1000) * husk_price_per_1000) stored,
  add column total_amount numeric(14, 2)
    generated always as (
      (case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else ((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100)) * rate_per_kg
      end)
      + ((coconut_quantity / 1000) * husk_price_per_1000)
      - ((coconut_quantity / 1000) * husk_removal_rate_per_1000)
      - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)
    ) stored,
  add column balance_amount numeric(14, 2)
    generated always as (
      (case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else ((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100)) * rate_per_kg
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
        then (gross_weight_kg - empty_weight_kg) / coconut_quantity
        else 0
      end
    ) stored,
  add column average_price_per_piece numeric(14, 2)
    generated always as (
      case when coconut_quantity > 0
        then (
          (case when purchase_mode = 'quantity'
            then coconut_quantity * rate_per_piece
            else ((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100)) * rate_per_kg
          end)
          + ((coconut_quantity / 1000) * husk_price_per_1000)
          - ((coconut_quantity / 1000) * husk_removal_rate_per_1000)
          - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)
        ) / coconut_quantity
        else 0
      end
    ) stored;

alter table public.coconut_trades
  drop constraint if exists coconut_trades_purchase_mode_check,
  drop constraint if exists coconut_trades_purchase_mode_fields_check,
  drop constraint if exists coconut_trades_quantity_required_check,
  drop constraint if exists coconut_trades_rate_per_piece_check,
  drop constraint if exists coconut_trades_husk_price_per_1000_check,
  drop constraint if exists coconut_trades_labor_not_greater_than_purchase_check,
  drop constraint if exists coconut_trades_advance_not_greater_than_total_check;

alter table public.coconut_trades
  add constraint coconut_trades_purchase_mode_check
    check (purchase_mode in ('weight', 'quantity')),
  add constraint coconut_trades_purchase_mode_fields_check
    check (
      (purchase_mode = 'weight' and gross_weight_kg > 0 and empty_weight_kg <= gross_weight_kg)
      or (purchase_mode = 'quantity' and gross_weight_kg = 0 and empty_weight_kg = 0)
    ),
  add constraint coconut_trades_quantity_required_check
    check (purchase_mode = 'weight' or coconut_quantity > 0),
  add constraint coconut_trades_rate_per_piece_check
    check (rate_per_piece >= 0),
  add constraint coconut_trades_husk_price_per_1000_check
    check (husk_price_per_1000 >= 0),
  add constraint coconut_trades_labor_not_greater_than_purchase_check
    check (
      ((coconut_quantity / 1000) * husk_removal_rate_per_1000)
      + ((coconut_quantity / 1000) * tree_collection_rate_per_1000)
      <= case when purchase_mode = 'quantity'
        then coconut_quantity * rate_per_piece
        else ((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100) * rate_per_kg)
      end
    ),
  add constraint coconut_trades_advance_not_greater_than_total_check
    check (
      advance_amount <= case when purchase_mode = 'quantity'
        then (coconut_quantity * rate_per_piece)
          + ((coconut_quantity / 1000) * husk_price_per_1000)
          - ((coconut_quantity / 1000) * husk_removal_rate_per_1000)
          - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)
        else (((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100)) * rate_per_kg)
          + ((coconut_quantity / 1000) * husk_price_per_1000)
          - ((coconut_quantity / 1000) * husk_removal_rate_per_1000)
          - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)
      end
    );
