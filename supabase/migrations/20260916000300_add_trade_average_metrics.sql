-- Store the derived per-coconut metrics for history, invoices, and audits.

alter table public.coconut_trades
  add column if not exists average_weight_kg numeric(14, 6)
    generated always as (
      case when coconut_quantity > 0
        then (gross_weight_kg - empty_weight_kg) / coconut_quantity
        else 0
      end
    ) stored,
  add column if not exists average_price_per_piece numeric(14, 2)
    generated always as (
      case when coconut_quantity > 0
        then (((gross_weight_kg - empty_weight_kg) * (1 - wastage_percent / 100) * rate_per_kg) - ((coconut_quantity / 1000) * husk_removal_rate_per_1000) - ((coconut_quantity / 1000) * tree_collection_rate_per_1000)) / coconut_quantity
        else 0
      end
    ) stored;
