import type { CashEntry, Expense, ExpenseCategory, Purchase, PurchaseMode, Sale, SaleItem } from "./types";
import { cashKinds, expenseCategories } from "./types";
import { toNumber } from "./format";

// ---------------------------------------------------------------------------
// Purchase pricing (same formulas as Version 1, kept in one place)
// ---------------------------------------------------------------------------

export type PurchaseCalcInput = {
  purchase_mode: PurchaseMode;
  coconut_quantity: string;
  net_weight_kg: string;
  wastage_percent: string;
  rate_per_kg: string;
  rate_per_piece: string;
  husk_removal_rate_per_1000: string;
  tree_collection_rate_per_1000: string;
  husk_price_per_piece: string;
  deduct_dehusking: boolean;
  deduct_harvesting: boolean;
  advance_amount: string;
  additional_credit_amount: string;
  additional_debit_amount: string;
};

export function calculatePurchase(form: PurchaseCalcInput) {
  const purchaseMode = form.purchase_mode;
  const quantity = toNumber(form.coconut_quantity);
  const net = purchaseMode === "weight" ? Math.max(toNumber(form.net_weight_kg), 0) : 0;
  const wastagePercent = toNumber(form.wastage_percent);
  const wastage = net * wastagePercent / 100;
  const payable = Math.max(net - wastage, 0);
  const coconutTotal = purchaseMode === "quantity" ? quantity * toNumber(form.rate_per_piece) : payable * toNumber(form.rate_per_kg);
  const huskRemovalCost = form.deduct_dehusking ? quantity / 1000 * toNumber(form.husk_removal_rate_per_1000) : 0;
  const treeCollectionCost = form.deduct_harvesting ? quantity / 1000 * toNumber(form.tree_collection_rate_per_1000) : 0;
  const huskPriceIncome = purchaseMode === "weight" ? quantity * toNumber(form.husk_price_per_piece) : 0;
  const laborTotal = huskRemovalCost + treeCollectionCost;
  const total = Math.max(coconutTotal + huskPriceIncome - laborTotal, 0);
  const advance = toNumber(form.advance_amount);
  const additionalCredit = toNumber(form.additional_credit_amount);
  const additionalDebit = toNumber(form.additional_debit_amount);
  const averageWeightGrams = purchaseMode === "weight" && quantity > 0 ? net / quantity * 1000 : 0;
  const averagePricePerPiece = quantity > 0 ? total / quantity : 0;
  const balance = total - advance + additionalCredit - additionalDebit;
  return { purchaseMode, quantity, net, wastagePercent, wastage, payable, coconutTotal, huskRemovalCost, treeCollectionCost, huskPriceIncome, laborTotal, total, advance, additionalCredit, additionalDebit, balance, averageWeightGrams, averagePricePerPiece };
}

// ---------------------------------------------------------------------------
// Stock: every purchase is tracked in pieces; weight is pro-rated where known
// ---------------------------------------------------------------------------

export type StockInfo = {
  purchase: Purchase;
  soldPieces: number;
  remainingPieces: number;
  remainingKg: number;
  /** Cost of the coconut only (farmer payable minus the husk credit). */
  coconutCostPerPiece: number;
  /** Full farmer payable per piece, including husk credit. */
  costPerPiece: number;
  remainingValue: number;
};

export function buildStockMap(purchases: Purchase[], saleItems: SaleItem[]) {
  const soldByPurchase = new Map<number, number>();
  saleItems.forEach((item) => soldByPurchase.set(item.purchase_id, (soldByPurchase.get(item.purchase_id) ?? 0) + Number(item.quantity_pieces)));
  const stock = new Map<number, StockInfo>();
  purchases.forEach((purchase) => {
    const pieces = Number(purchase.coconut_quantity) || 0;
    const soldPieces = soldByPurchase.get(purchase.id) ?? 0;
    const remainingPieces = Math.max(pieces - soldPieces, 0);
    const fraction = pieces > 0 ? remainingPieces / pieces : 0;
    const remainingKg = purchase.purchase_mode === "weight" ? Number(purchase.payable_weight_kg) * fraction : 0;
    const coconutCost = Number(purchase.total_amount) - Number(purchase.husk_price_total);
    const coconutCostPerPiece = pieces > 0 ? coconutCost / pieces : 0;
    const costPerPiece = pieces > 0 ? Number(purchase.total_amount) / pieces : 0;
    stock.set(purchase.id, { purchase, soldPieces, remainingPieces, remainingKg, coconutCostPerPiece, costPerPiece, remainingValue: remainingPieces * coconutCostPerPiece });
  });
  return stock;
}

export function allocationCost(items: Array<{ purchase_id: number; quantity_pieces: number }>, stock: Map<number, StockInfo>) {
  return items.reduce((sum, item) => sum + Number(item.quantity_pieces) * (stock.get(item.purchase_id)?.coconutCostPerPiece ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Sale totals
// ---------------------------------------------------------------------------

export type SaleCalcInput = {
  unit: string;
  quantity: string;
  rate: string;
  gross_weight_kg: string;
  empty_weight_kg: string;
  transport_charge: string;
  deduction_amount: string;
  advance_amount: string;
};

export function calculateSale(form: SaleCalcInput, allocatedPieces: number, costBasis: number) {
  const gross = toNumber(form.gross_weight_kg);
  const empty = toNumber(form.empty_weight_kg);
  const derivedNet = gross > 0 ? Math.max(gross - empty, 0) : 0;
  const quantity = toNumber(form.quantity);
  const rate = toNumber(form.rate);
  const saleAmount = quantity * rate;
  const transport = toNumber(form.transport_charge);
  const deduction = toNumber(form.deduction_amount);
  const advance = toNumber(form.advance_amount);
  const total = saleAmount + transport - deduction;
  const balance = total - advance;
  const averageKgPerNut = form.unit === "kg" && allocatedPieces > 0 ? quantity / allocatedPieces : 0;
  const pricePerPiece = allocatedPieces > 0 ? saleAmount / allocatedPieces : 0;
  const margin = saleAmount - costBasis;
  return { gross, empty, derivedNet, quantity, rate, saleAmount, transport, deduction, advance, total, balance, averageKgPerNut, pricePerPiece, costBasis, margin };
}

// ---------------------------------------------------------------------------
// Payments and receivables
// ---------------------------------------------------------------------------

export function sumBy<T>(items: T[], pick: (item: T) => number) {
  return items.reduce((sum, item) => sum + (Number(pick(item)) || 0), 0);
}

export function paidToFarmer(purchaseId: number, cashEntries: CashEntry[]) {
  return sumBy(cashEntries.filter((entry) => entry.kind === "farmer_payment" && entry.purchase_id === purchaseId), (entry) => Number(entry.amount));
}

export function receivedFromBuyer(saleId: number, cashEntries: CashEntry[]) {
  return sumBy(cashEntries.filter((entry) => entry.kind === "buyer_receipt" && entry.sale_id === saleId), (entry) => Number(entry.amount));
}

/** Balance still owed to the farmer after the advance and any later settlements. */
export function purchaseOutstanding(purchase: Purchase, cashEntries: CashEntry[]) {
  return Number(purchase.balance_amount) - paidToFarmer(purchase.id, cashEntries);
}

/** Balance still receivable from the buyer after the advance and later receipts. */
export function saleOutstanding(sale: Sale, cashEntries: CashEntry[]) {
  return Number(sale.balance_amount) - receivedFromBuyer(sale.id, cashEntries);
}

export function statusForBalance(outstanding: number, paidSomething: boolean): "pending" | "partial" | "paid" {
  if (outstanding <= 0.005) return "paid";
  return paidSomething ? "partial" : "pending";
}

/** Payment status a purchase should have once the given cash entry is removed. */
export function purchaseStatusWithout(purchase: Purchase, cashEntries: CashEntry[], excludeEntryId?: number) {
  const entries = excludeEntryId ? cashEntries.filter((entry) => entry.id !== excludeEntryId) : cashEntries;
  const payments = paidToFarmer(purchase.id, entries);
  return statusForBalance(Number(purchase.balance_amount) - payments, Number(purchase.advance_amount) + payments > 0);
}

/** Payment status a sale should have once the given cash entry is removed. */
export function saleStatusWithout(sale: Sale, cashEntries: CashEntry[], excludeEntryId?: number) {
  const entries = excludeEntryId ? cashEntries.filter((entry) => entry.id !== excludeEntryId) : cashEntries;
  const receipts = receivedFromBuyer(sale.id, entries);
  return statusForBalance(Number(sale.balance_amount) - receipts, Number(sale.advance_amount) + receipts > 0);
}

// ---------------------------------------------------------------------------
// Period filters, profit and loss, cash position
// ---------------------------------------------------------------------------

export type DateRange = { from: string; to: string } | null;

export function inRange(date: string, range: DateRange) {
  if (!range) return true;
  return date >= range.from && date <= range.to;
}

export type FinancialSummary = {
  coconutRevenue: number;
  coconutCostOfSold: number;
  coconutMargin: number;
  huskRevenue: number;
  huskCreditPaid: number;
  huskExpenses: number;
  huskProfit: number;
  purchasesTotal: number;
  purchasesPieces: number;
  purchasesKg: number;
  soldPieces: number;
  soldKg: number;
  laborDeductedFromFarmers: number;
  expensesTotal: number;
  expensesByCategory: Array<{ category: ExpenseCategory; label: string; amount: number }>;
  operatingExpenses: number;
  netProfit: number;
  stockPieces: number;
  stockValue: number;
  stockKg: number;
  payableToFarmers: number;
  receivableFromBuyers: number;
};

export function summarizeFinancials(args: {
  purchases: Purchase[];
  sales: Sale[];
  saleItems: SaleItem[];
  expenses: Expense[];
  cashEntries: CashEntry[];
  range: DateRange;
}): FinancialSummary {
  const { purchases, sales, saleItems, expenses, cashEntries, range } = args;
  const stock = buildStockMap(purchases, saleItems);
  const periodPurchases = purchases.filter((purchase) => inRange(purchase.trade_date, range));
  const periodSales = sales.filter((sale) => inRange(sale.sale_date, range));
  const periodSaleIds = new Set(periodSales.map((sale) => sale.id));
  const periodItems = saleItems.filter((item) => periodSaleIds.has(item.sale_id));
  const periodExpenses = expenses.filter((expense) => inRange(expense.expense_date, range));

  const coconutSales = periodSales.filter((sale) => sale.sale_kind === "coconut");
  const huskSales = periodSales.filter((sale) => sale.sale_kind === "husk");
  const coconutRevenue = sumBy(coconutSales, (sale) => sale.total_amount);
  const coconutCostOfSold = allocationCost(periodItems, stock);
  const huskRevenue = sumBy(huskSales, (sale) => sale.total_amount);
  const huskCreditPaid = sumBy(periodPurchases, (purchase) => purchase.husk_price_total);
  const huskExpenses = sumBy(periodExpenses.filter((expense) => expense.scope === "husk"), (expense) => expense.amount);
  const operatingExpenses = sumBy(periodExpenses.filter((expense) => expense.scope !== "husk"), (expense) => expense.amount);
  const expensesByCategory = expenseCategories
    .map((category) => ({ category: category.value, label: category.label, amount: sumBy(periodExpenses.filter((expense) => expense.category === category.value), (expense) => expense.amount) }))
    .filter((entry) => entry.amount > 0);

  const soldPieces = sumBy(periodItems, (item) => item.quantity_pieces);
  const soldKg = sumBy(coconutSales.filter((sale) => sale.unit === "kg"), (sale) => sale.quantity);
  const stockValues = Array.from(stock.values());

  return {
    coconutRevenue,
    coconutCostOfSold,
    coconutMargin: coconutRevenue - coconutCostOfSold,
    huskRevenue,
    huskCreditPaid,
    huskExpenses,
    huskProfit: huskRevenue - huskCreditPaid - huskExpenses,
    purchasesTotal: sumBy(periodPurchases, (purchase) => purchase.total_amount),
    purchasesPieces: sumBy(periodPurchases, (purchase) => purchase.coconut_quantity),
    purchasesKg: sumBy(periodPurchases, (purchase) => purchase.payable_weight_kg),
    soldPieces,
    soldKg,
    laborDeductedFromFarmers: sumBy(periodPurchases, (purchase) => purchase.labor_cost_total),
    expensesTotal: operatingExpenses + huskExpenses,
    expensesByCategory,
    operatingExpenses,
    netProfit: coconutRevenue - coconutCostOfSold + huskRevenue - huskCreditPaid - huskExpenses - operatingExpenses,
    stockPieces: sumBy(stockValues, (info) => info.remainingPieces),
    stockValue: sumBy(stockValues, (info) => info.remainingValue),
    stockKg: sumBy(stockValues, (info) => info.remainingKg),
    payableToFarmers: sumBy(purchases, (purchase) => Math.max(purchaseOutstanding(purchase, cashEntries), 0)),
    receivableFromBuyers: sumBy(sales, (sale) => Math.max(saleOutstanding(sale, cashEntries), 0))
  };
}

export type CashPosition = {
  tracked: boolean;
  capitalIn: number;
  capitalOut: number;
  receipts: number;
  paymentsToFarmers: number;
  expensesPaid: number;
  otherIn: number;
  otherOut: number;
  cashInHand: number;
};

export function summarizeCash(args: { purchases: Purchase[]; sales: Sale[]; expenses: Expense[]; cashEntries: CashEntry[]; range: DateRange }): CashPosition {
  const { purchases, sales, expenses, cashEntries, range } = args;
  const entries = cashEntries.filter((entry) => inRange(entry.entry_date, range));
  const amountFor = (kinds: CashEntry["kind"][]) => sumBy(entries.filter((entry) => kinds.includes(entry.kind)), (entry) => entry.amount);
  const capitalIn = amountFor(["opening_balance", "capital_in"]);
  const capitalOut = amountFor(["capital_out"]);
  const receipts = amountFor(["buyer_receipt"]) + sumBy(sales.filter((sale) => inRange(sale.sale_date, range)), (sale) => sale.advance_amount);
  const paymentsToFarmers = amountFor(["farmer_payment"]) + sumBy(purchases.filter((purchase) => inRange(purchase.trade_date, range)), (purchase) => purchase.advance_amount);
  const expensesPaid = sumBy(expenses.filter((expense) => inRange(expense.expense_date, range)), (expense) => expense.amount);
  const otherIn = amountFor(["other_income"]);
  const otherOut = amountFor(["other_expense"]);
  return {
    tracked: cashEntries.some((entry) => entry.kind === "opening_balance" || entry.kind === "capital_in"),
    capitalIn,
    capitalOut,
    receipts,
    paymentsToFarmers,
    expensesPaid,
    otherIn,
    otherOut,
    cashInHand: capitalIn + receipts + otherIn - capitalOut - paymentsToFarmers - expensesPaid - otherOut
  };
}

export function cashDirection(kind: CashEntry["kind"]) {
  return cashKinds.find((item) => item.value === kind)?.direction ?? "out";
}
