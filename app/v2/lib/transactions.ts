import type { Buyer, CashEntry, Employee, Expense, Farmer, Purchase, Sale } from "./types";
import { cashKinds, cashMethods, expenseCategories } from "./types";
import { formatPurchaseId, formatSaleId } from "./format";
import { inRange, type DateRange } from "./calc";

export type TransactionKind = "purchase_advance" | "farmer_payment" | "sale_advance" | "buyer_receipt" | "expense" | CashEntry["kind"];

export type Transaction = {
  key: string;
  date: string;
  direction: "in" | "out";
  kind: TransactionKind;
  label: string;
  amount: number;
  counterparty: string;
  reference: string | null;
  href: string | null;
  method: string | null;
  description: string | null;
  order: number;
};

export const transactionKinds: Array<{ value: TransactionKind; label: string; direction: "in" | "out" }> = [
  { value: "sale_advance", label: "Advance from buyer", direction: "in" },
  { value: "buyer_receipt", label: "Receipt from buyer", direction: "in" },
  { value: "opening_balance", label: "Opening cash", direction: "in" },
  { value: "capital_in", label: "Capital added", direction: "in" },
  { value: "other_income", label: "Other income", direction: "in" },
  { value: "purchase_advance", label: "Advance to farmer", direction: "out" },
  { value: "farmer_payment", label: "Payment to farmer", direction: "out" },
  { value: "expense", label: "Expense", direction: "out" },
  { value: "capital_out", label: "Capital withdrawn", direction: "out" },
  { value: "other_expense", label: "Other payment", direction: "out" }
];

export function buildTransactions(args: {
  purchases: Purchase[];
  sales: Sale[];
  expenses: Expense[];
  cashEntries: CashEntry[];
  farmerById: Map<number, Farmer>;
  buyerById: Map<number, Buyer>;
  employeeById: Map<number, Employee>;
}): Transaction[] {
  const { purchases, sales, expenses, cashEntries, farmerById, buyerById, employeeById } = args;
  const rows: Transaction[] = [];
  const methodLabel = (value: string) => cashMethods.find((item) => item.value === value)?.label ?? value;

  purchases.forEach((purchase) => {
    if (Number(purchase.advance_amount) > 0) {
      rows.push({
        key: `purchase-advance-${purchase.id}`,
        date: purchase.trade_date,
        direction: "out",
        kind: "purchase_advance",
        label: "Advance to farmer",
        amount: Number(purchase.advance_amount),
        counterparty: farmerById.get(purchase.farmer_id)?.name ?? "Farmer",
        reference: formatPurchaseId(purchase.id),
        href: `/v2/purchases?focus=${purchase.id}`,
        method: null,
        description: "Paid when the purchase was recorded",
        order: purchase.id
      });
    }
  });

  sales.forEach((sale) => {
    if (Number(sale.advance_amount) > 0) {
      rows.push({
        key: `sale-advance-${sale.id}`,
        date: sale.sale_date,
        direction: "in",
        kind: "sale_advance",
        label: "Advance from buyer",
        amount: Number(sale.advance_amount),
        counterparty: buyerById.get(sale.buyer_id)?.name ?? "Buyer",
        reference: formatSaleId(sale.id),
        href: "/v2/sales",
        method: null,
        description: "Received when the sale was recorded",
        order: sale.id
      });
    }
  });

  expenses.forEach((expense) => {
    const category = expenseCategories.find((item) => item.value === expense.category);
    rows.push({
      key: `expense-${expense.id}`,
      date: expense.expense_date,
      direction: "out",
      kind: "expense",
      label: `Expense · ${category?.label ?? expense.category}`,
      amount: Number(expense.amount),
      counterparty: expense.employee_id ? employeeById.get(expense.employee_id)?.name ?? "Worker" : category?.label ?? "Expense",
      reference: expense.purchase_id ? formatPurchaseId(expense.purchase_id) : expense.sale_id ? formatSaleId(expense.sale_id) : null,
      href: "/v2/expenses",
      method: null,
      description: expense.description,
      order: expense.id
    });
  });

  cashEntries.forEach((entry) => {
    const kind = cashKinds.find((item) => item.value === entry.kind);
    const counterparty = entry.farmer_id ? farmerById.get(entry.farmer_id)?.name ?? "Farmer" : entry.buyer_id ? buyerById.get(entry.buyer_id)?.name ?? "Buyer" : kind?.label ?? "Cash book";
    rows.push({
      key: `cash-${entry.id}`,
      date: entry.entry_date,
      direction: kind?.direction ?? "out",
      kind: entry.kind,
      label: kind?.label ?? entry.kind,
      amount: Number(entry.amount),
      counterparty,
      reference: entry.purchase_id ? formatPurchaseId(entry.purchase_id) : entry.sale_id ? formatSaleId(entry.sale_id) : null,
      href: entry.purchase_id ? `/v2/purchases?focus=${entry.purchase_id}` : entry.sale_id ? "/v2/sales" : "/v2/cash",
      method: methodLabel(entry.method),
      description: entry.description,
      order: entry.id
    });
  });

  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order);
}

export type FlowBucket = { key: string; label: string; moneyIn: number; moneyOut: number };

function startOfWeek(date: string) {
  const value = new Date(`${date}T00:00:00`);
  const day = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - day);
  return value.toISOString().slice(0, 10);
}

/** Groups transactions by day, week or month depending on how long the period is. */
export function bucketTransactions(transactions: Transaction[], range: DateRange): FlowBucket[] {
  if (transactions.length === 0) return [];
  const dates = transactions.map((row) => row.date).sort();
  const from = range?.from ?? dates[0];
  const to = range?.to ?? dates[dates.length - 1];
  const spanDays = Math.max(1, Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000) + 1);
  const mode: "day" | "week" | "month" = spanDays <= 31 ? "day" : spanDays <= 182 ? "week" : "month";
  const keyFor = (date: string) => mode === "day" ? date : mode === "week" ? startOfWeek(date) : date.slice(0, 7);
  const labelFor = (key: string) => {
    if (mode === "month") return new Date(`${key}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    const date = new Date(`${key}T00:00:00`);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };
  const buckets = new Map<string, FlowBucket>();
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    const key = keyFor(cursor.toISOString().slice(0, 10));
    if (!buckets.has(key)) buckets.set(key, { key, label: labelFor(key), moneyIn: 0, moneyOut: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  transactions.forEach((row) => {
    if (!inRange(row.date, range)) return;
    const key = keyFor(row.date);
    const bucket = buckets.get(key) ?? { key, label: labelFor(key), moneyIn: 0, moneyOut: 0 };
    if (row.direction === "in") bucket.moneyIn += row.amount; else bucket.moneyOut += row.amount;
    buckets.set(key, bucket);
  });
  return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
}
