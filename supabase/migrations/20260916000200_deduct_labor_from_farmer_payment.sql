-- Labor is paid by the trader and deducted from the farmer's amount.

alter table public.coconut_trades
  drop column if exists total_amount,
  drop column if exists balance_amount;

alter table public.coconut_trades
  add column total_amount numeric(14, 2)
    generated always as ((((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100)) * rate_per_kg) - ((coconut_quantity / 1000) * husk_removal_rate_per_1000) - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)) stored,
  add column balance_amount numeric(14, 2)
    generated always as (((((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100)) * rate_per_kg) - ((coconut_quantity / 1000) * husk_removal_rate_per_1000) - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)) - advance_amount) stored;

alter table public.coconut_trades
  add constraint coconut_trades_labor_not_greater_than_purchase_check
  check (((coconut_quantity / 1000) * husk_removal_rate_per_1000) + ((coconut_quantity / 1000) * tree_collection_rate_per_1000) <= ((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100) * rate_per_kg));

alter table public.coconut_trades
  add constraint coconut_trades_advance_not_greater_than_net_payment_check
  check (advance_amount <= ((((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100)) * rate_per_kg) - ((coconut_quantity / 1000) * husk_removal_rate_per_1000) - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)));
