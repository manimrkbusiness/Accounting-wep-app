export type Role = "farmer" | "trader";
export type CoconutColor = "green" | "brown" | "black";
export type SaleColor = CoconutColor | "mixed";
export type ProcessingType = "mottai" | "kudume";
export type SaleProcessing = ProcessingType | "mixed";
export type PurchaseMode = "weight" | "quantity";
export type PaymentStatus = "pending" | "partial" | "paid";
export type SaleKind = "coconut" | "husk";
export type SaleUnit = "kg" | "piece" | "load";
export type EmployeeRole = "harvester" | "dehusker" | "loader" | "driver" | "supervisor" | "other";
export type VehicleType = "lorry" | "tempo" | "tractor" | "pickup" | "other";
export type Ownership = "own" | "hired";
export type ExpenseCategory =
  | "harvesting_labor"
  | "dehusking_labor"
  | "loading_labor"
  | "transport"
  | "diesel"
  | "vehicle_maintenance"
  | "food"
  | "husk_handling"
  | "other";
export type ExpenseScope = "coconut" | "husk" | "general";
export type CashKind =
  | "opening_balance"
  | "capital_in"
  | "capital_out"
  | "farmer_payment"
  | "buyer_receipt"
  | "other_income"
  | "other_expense";
export type CashMethod = "cash" | "bank" | "upi";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  account_type: Role | null;
  business_name: string | null;
};

export type Farmer = {
  id: number;
  phone: string;
  name: string;
  notes: string | null;
  created_at: string;
};

export type FarmerLocation = {
  id: number;
  farmer_id: number;
  location_name: string;
  city: string | null;
};

export type Purchase = {
  id: number;
  trader_id: string;
  farmer_id: number;
  location_id: number | null;
  trade_date: string;
  coconut_color: CoconutColor;
  purchase_mode: PurchaseMode;
  processing_type: ProcessingType;
  net_weight_kg: number;
  wastage_percent: number;
  rate_per_kg: number;
  rate_per_piece: number;
  coconut_quantity: number;
  /** Pieces the dehusking team handled; null means same as coconut_quantity. */
  dehusking_pieces: number | null;
  /** Pieces the harvesting team handled; null means same as coconut_quantity. */
  harvesting_pieces: number | null;
  husk_removal_rate_per_1000: number;
  tree_collection_rate_per_1000: number;
  husk_removal_cost: number;
  tree_collection_cost: number;
  labor_cost_total: number;
  husk_price_per_piece: number;
  husk_price_total: number;
  average_weight_kg: number;
  average_price_per_piece: number;
  additional_credit_amount: number;
  additional_credit_reason: string | null;
  additional_debit_amount: number;
  additional_debit_reason: string | null;
  advance_amount: number;
  payment_status: PaymentStatus;
  notes: string | null;
  wastage_weight_kg: number;
  payable_weight_kg: number;
  total_amount: number;
  balance_amount: number;
  created_at: string;
};

export type TraderSettings = {
  trader_id: string;
  purchase_mode: PurchaseMode;
  husk_removal_rate_per_1000: number;
  tree_collection_rate_per_1000: number;
  husk_price_per_piece: number;
  kudume_wastage_percent: number;
};

export type Buyer = {
  id: number;
  trader_id: string;
  name: string;
  phone: string | null;
  business_name: string | null;
  city: string | null;
  buys_coconut: boolean;
  buys_husk: boolean;
  notes: string | null;
  active: boolean;
  created_at: string;
};

export type Employee = {
  id: number;
  trader_id: string;
  name: string;
  phone: string | null;
  role: EmployeeRole;
  daily_wage: number;
  active: boolean;
  notes: string | null;
};

export type Vehicle = {
  id: number;
  trader_id: string;
  vehicle_number: string;
  vehicle_type: VehicleType;
  ownership: Ownership;
  active: boolean;
  notes: string | null;
};

export type Sale = {
  id: number;
  trader_id: string;
  buyer_id: number;
  sale_kind: SaleKind;
  product: string;
  sale_date: string;
  coconut_color: SaleColor;
  processing_type: SaleProcessing;
  unit: SaleUnit;
  quantity: number;
  rate: number;
  coconut_quantity: number;
  gross_weight_kg: number | null;
  empty_weight_kg: number | null;
  transport_charge: number;
  deduction_amount: number;
  deduction_reason: string | null;
  advance_amount: number;
  vehicle_id: number | null;
  vehicle_number: string | null;
  payment_status: PaymentStatus;
  notes: string | null;
  sale_amount: number;
  total_amount: number;
  balance_amount: number;
  created_at: string;
};

export type SaleItem = {
  id: number;
  trader_id: string;
  sale_id: number;
  purchase_id: number;
  quantity_pieces: number;
};

export type StockEntry = {
  id: number;
  trader_id: string;
  entry_date: string;
  processing_type: ProcessingType;
  net_weight_kg: number;
  wastage_percent: number;
  coconut_quantity: number;
  dehusking_rate_per_1000: number;
  dehusking_cost: number;
  sale_rate_per_kg: number;
  husk_rate_per_piece: number;
  notes: string | null;
  wastage_weight_kg: number;
  payable_weight_kg: number;
  created_at: string;
};

export type StockEntryItem = {
  id: number;
  trader_id: string;
  stock_entry_id: number;
  purchase_id: number;
  quantity_pieces: number;
};

export type StockWastage = {
  id: number;
  trader_id: string;
  purchase_id: number;
  sale_id: number | null;
  wastage_date: string;
  quantity_pieces: number;
  reason: string | null;
};

export type Expense = {
  id: number;
  trader_id: string;
  expense_date: string;
  category: ExpenseCategory;
  scope: ExpenseScope;
  amount: number;
  employee_id: number | null;
  vehicle_id: number | null;
  purchase_id: number | null;
  sale_id: number | null;
  stock_entry_id: number | null;
  harvesting_entry_id: number | null;
  description: string | null;
  created_at: string;
};

export type HarvestingTeam = {
  id: number;
  trader_id: string;
  name: string;
  active: boolean;
  notes: string | null;
  created_at: string;
};

export type HarvestingTeamMember = {
  id: number;
  trader_id: string;
  team_id: number;
  employee_id: number;
};

export type HarvestingEntry = {
  id: number;
  trader_id: string;
  harvest_date: string;
  team_id: number | null;
  coconut_quantity: number;
  rate_per_1000: number;
  purchase_id: number | null;
  notes: string | null;
  total_cost: number;
  created_at: string;
};

export type CashEntry = {
  id: number;
  trader_id: string;
  entry_date: string;
  kind: CashKind;
  amount: number;
  method: CashMethod;
  farmer_id: number | null;
  buyer_id: number | null;
  purchase_id: number | null;
  sale_id: number | null;
  description: string | null;
  created_at: string;
};

export const coconutColors: Array<{ value: CoconutColor; label: string }> = [
  { value: "green", label: "Green coconut" },
  { value: "brown", label: "Brown coconut" },
  { value: "black", label: "Black coconut" }
];

export const saleColors: Array<{ value: SaleColor; label: string }> = [...coconutColors, { value: "mixed", label: "Mixed colours" }];

export const processingTypes: Array<{ value: ProcessingType; label: string; description: string }> = [
  { value: "mottai", label: "Mottai coconut", description: "Fully shaved coconut" },
  { value: "kudume", label: "Kudume coconut", description: "A small layer of husk remains" }
];

export const saleProcessingTypes: Array<{ value: SaleProcessing; label: string }> = [
  { value: "mottai", label: "Mottai" },
  { value: "kudume", label: "Kudume" },
  { value: "mixed", label: "Mixed" }
];

export const employeeRoles: Array<{ value: EmployeeRole; label: string }> = [
  { value: "harvester", label: "Coconut harvester" },
  { value: "dehusker", label: "Dehusking worker" },
  { value: "loader", label: "Loading worker" },
  { value: "driver", label: "Driver" },
  { value: "supervisor", label: "Supervisor" },
  { value: "other", label: "Other" }
];

export const vehicleTypes: Array<{ value: VehicleType; label: string }> = [
  { value: "lorry", label: "Lorry" },
  { value: "tempo", label: "Tempo" },
  { value: "tractor", label: "Tractor" },
  { value: "pickup", label: "Pickup" },
  { value: "other", label: "Other" }
];

export const expenseCategories: Array<{ value: ExpenseCategory; label: string; defaultScope: ExpenseScope; hint: string }> = [
  { value: "harvesting_labor", label: "Harvesting labor", defaultScope: "coconut", hint: "Wages for climbing and harvesting." },
  { value: "dehusking_labor", label: "Dehusking labor", defaultScope: "coconut", hint: "Wages for removing husk." },
  { value: "loading_labor", label: "Loading labor", defaultScope: "coconut", hint: "Wages for loading coconut or husk into vehicles." },
  { value: "transport", label: "Transport / freight", defaultScope: "coconut", hint: "Hired vehicle or freight charges." },
  { value: "diesel", label: "Diesel / fuel", defaultScope: "general", hint: "Fuel for own vehicles." },
  { value: "vehicle_maintenance", label: "Vehicle maintenance", defaultScope: "general", hint: "Repairs, tyres, service." },
  { value: "food", label: "Food, tea and snacks", defaultScope: "general", hint: "Breakfast, tea and snacks for workers." },
  { value: "husk_handling", label: "Husk handling", defaultScope: "husk", hint: "Any cost spent only on husk." },
  { value: "other", label: "Other expense", defaultScope: "general", hint: "Anything else." }
];

export const expenseScopes: Array<{ value: ExpenseScope; label: string }> = [
  { value: "coconut", label: "Coconut business" },
  { value: "husk", label: "Husk business" },
  { value: "general", label: "General / shared" }
];

export const cashKinds: Array<{ value: CashKind; label: string; direction: "in" | "out"; hint: string }> = [
  { value: "opening_balance", label: "Opening cash", direction: "in", hint: "Cash you had in hand when you started tracking." },
  { value: "capital_in", label: "Capital added", direction: "in", hint: "Money you put into the business." },
  { value: "capital_out", label: "Capital withdrawn", direction: "out", hint: "Money you took out for personal use." },
  { value: "farmer_payment", label: "Payment to farmer", direction: "out", hint: "Settlement paid against a purchase." },
  { value: "buyer_receipt", label: "Receipt from buyer", direction: "in", hint: "Money received against a sale." },
  { value: "other_income", label: "Other income", direction: "in", hint: "Any other money received." },
  { value: "other_expense", label: "Other payment", direction: "out", hint: "Any other money paid that is not an expense record." }
];

export const cashMethods: Array<{ value: CashMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank transfer" },
  { value: "upi", label: "UPI" }
];
