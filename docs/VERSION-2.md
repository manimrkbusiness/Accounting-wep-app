# Version 2 workspace

Version 2 lives under `/v2` and runs beside Version 1 (`/dashboard`). Both use the
same sign-in, the same farmers, and the same purchase records. Version 2 adds
buyers, sales, stock, expenses, workers, vehicles, a cash book, and a profit and
loss dashboard. When Version 2 is approved, Version 1 can be removed without any
data migration because nothing in Version 1 was changed or duplicated.

## How a trader uses it

1. **Buy** from farmers (`/v2/purchases/new`). Weight-based or per-nut, same as
   Version 1. Every purchase goes into **stock** in pieces.
2. **Build a load** (`/v2/sales/new`). Pick the purchase date range and farmer,
   tick the purchases going in the lorry, adjust pieces if only part of a
   purchase is loaded, then enter the buyer, net weight (or gross and tare),
   rate per kg, transport charged, advance received and lorry number. The margin
   for that load is shown before saving.
3. **Sell husk** (`/v2/sales/new?kind=husk`) to husk buyers by load, kg or pieces.
4. **Record expenses** (`/v2/expenses`): harvesting, dehusking and loading
   wages per worker, transport, diesel, vehicle maintenance, food and tea, and
   husk handling. Each expense counts towards coconut, husk or general.
5. **Settle money** from Purchase history (Pay) and Sales history (Receive), or
   from the cash book. Opening cash and capital are optional.
6. **Dashboard** (`/v2`) shows net profit, coconut margin, husk profit, expenses
   by type, stock in hand and its value, stock ageing, payable to farmers,
   receivable from buyers and cash in hand.

## Data model (Supabase)

Existing tables are unchanged: `profiles`, `trader_farmers`, `farmer_locations`,
`coconut_trades` (purchases), `trader_settings`, `farmer_access_requests`.

New tables (migration `20261007000100_v2_sales_expenses_cash.sql`), all scoped
to the signed-in trader by row level security:

| Table | Purpose |
| --- | --- |
| `buyers` | Coconut and husk buyers (name, phone, business, city, what they buy). |
| `employees` | Workers and their role; wages are expenses linked to them. |
| `vehicles` | Own or hired vehicles; sales and expenses can link to them. |
| `sales` | One row per load or husk sale: buyer, date, unit (kg, piece, load), quantity, rate, optional gross and empty weight, transport charge, deduction, advance. Totals are generated columns. |
| `sale_items` | Allocation of purchase pieces to a sale. One purchase can feed many sales; one sale can draw from many purchases. |
| `expenses` | Dated costs by category and scope with optional links to worker, vehicle, purchase and sale. |
| `cash_entries` | Opening cash, capital in and out, payments to farmers, receipts from buyers, other income and payments. |

Database rules:

- `validate_sale_item` blocks allocating more pieces than a purchase has left.
- `protect_allocated_purchase_quantity` blocks reducing a purchase below the
  pieces already sold from it.
- `save_sale(sale_input, items_input)` writes the sale and its allocations in
  one transaction (used by the sale form).
- Link triggers make sure buyers, vehicles, workers, purchases and sales
  referenced by a row belong to the same trader.

## Formulas

- **Stock remaining** = purchase pieces − pieces allocated to sales.
  Remaining kg (weight purchases) = payable kg × remaining ÷ pieces.
- **Husk credit on a purchase** = pieces × husk price per nut (weight-based purchases only).
- **Coconut cost per piece** = (farmer net payable − husk credit) ÷ pieces.
- **Cost of a load** = Σ pieces from each purchase × that purchase's coconut cost per piece.
- **Sale total** = quantity × rate + transport charged − deduction.
  Balance receivable = total − advance − receipts.
- **Coconut margin** = coconut sales − cost of coconut sold.
- **Husk profit** = husk sales − husk credit paid to farmers − husk expenses.
- **Net profit** = coconut margin + husk profit − operating expenses.
- **Payable to a farmer** = purchase balance − later farmer payments.
- **Cash in hand** = opening + capital in + receipts + sale advances + other income
  − capital out − farmer payments − purchase advances − expenses − other payments.

Labor deducted from a farmer on a purchase is shown as a memo figure. The wages
actually paid to workers are recorded under Expenses, so profit stays correct
whether or not a deduction was ticked on the purchase.

## Independent editing

Purchases and sales are separate rows. Editing a purchase never changes a sale;
editing a sale never changes a purchase. The only link is the allocation in
`sale_items`, and the database refuses changes that would sell more than was
bought.

## Code layout

```
app/v2/layout.tsx            auth gate + workspace provider + shell
app/v2/components/Shell.tsx  sidebar, top bar, mobile nav
app/v2/components/ui.tsx     panels, metrics, period picker
app/v2/lib/types.ts          row types and option lists (extend here for new products)
app/v2/lib/calc.ts           purchase, stock, sale, profit and cash formulas
app/v2/lib/pdf.ts            purchase and sale invoices
app/v2/lib/workspace.tsx     loads all trader data once, exposes refresh()
app/v2/page.tsx              dashboard
app/v2/purchases, sales, farmers, buyers, expenses, cash, team
```

## Extending later

- New coconut types or conditions: add to the option lists in `types.ts` and the
  check constraints on `sales` (purchases keep their own constraint).
- New products: `sales.product` already exists; add a product option list and
  product-specific purchase tables when needed.
- Husk stock in pieces: every purchase leaves its husk with the trader, so husk
  stock can be derived from purchases minus husk sales recorded in pieces.
