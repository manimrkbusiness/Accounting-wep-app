import "server-only";
import { service } from "./store";

// Scoped data layer for the MCP tools. EVERY function takes the authenticated trader id and filters
// (reads) or sets (writes) trader_id = that id. This is the isolation boundary: a token for one
// trader can never read or change another trader's rows. Tools must go through these functions only.

const DAY_MS = 86400000;

function statusForBalance(outstanding: number, paidSomething: boolean): "pending" | "partial" | "paid" {
  if (outstanding <= 0.005) return "paid";
  return paidSomething ? "partial" : "pending";
}

function normalizeIndianPhone(input: string): string | null {
  const digits = (input || "").replace(/\D/g, "");
  const ten = digits.slice(-10);
  if (ten.length !== 10 || !/^[6-9]\d{9}$/.test(ten)) return null;
  return `+91${ten}`;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function listFarmers(traderId: string, opts: { search?: string; limit?: number } = {}) {
  const db = service();
  const [{ data: farmers }, { data: locations }, { data: purchases }, { data: cash }] = await Promise.all([
    db.from("trader_farmers").select("id,name,phone,harvest_interval_days").eq("trader_id", traderId).order("name"),
    db.from("farmer_locations").select("farmer_id,location_name"),
    db.from("coconut_trades").select("id,farmer_id,balance_amount").eq("trader_id", traderId),
    db.from("cash_entries").select("purchase_id,amount,kind").eq("trader_id", traderId).eq("kind", "farmer_payment"),
  ]);
  const paidByPurchase = new Map<number, number>();
  (cash ?? []).forEach((c) => { if (c.purchase_id != null) paidByPurchase.set(c.purchase_id, (paidByPurchase.get(c.purchase_id) ?? 0) + Number(c.amount)); });
  const dueByFarmer = new Map<number, number>();
  (purchases ?? []).forEach((p) => {
    const due = Number(p.balance_amount) - (paidByPurchase.get(p.id) ?? 0);
    if (due > 0.005) dueByFarmer.set(p.farmer_id, (dueByFarmer.get(p.farmer_id) ?? 0) + due);
  });
  const search = (opts.search ?? "").trim().toLowerCase();
  let rows = (farmers ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    phone: f.phone,
    harvest_interval_days: f.harvest_interval_days,
    locations: (locations ?? []).filter((l) => l.farmer_id === f.id).map((l) => l.location_name),
    balance_due_to_farmer: Math.round((dueByFarmer.get(f.id) ?? 0) * 100) / 100,
  }));
  if (search) rows = rows.filter((r) => `${r.name} ${r.phone}`.toLowerCase().includes(search));
  return rows.slice(0, opts.limit ?? 100);
}

export async function listPurchases(traderId: string, opts: { farmerId?: number; from?: string; to?: string; limit?: number } = {}) {
  const db = service();
  let q = db.from("coconut_trades").select("id,farmer_id,trade_date,coconut_color,coconut_quantity,net_weight_kg,rate_per_kg,rate_per_piece,husk_price_total,labor_cost_total,total_amount,advance_amount,balance_amount,payment_status,husk_only").eq("trader_id", traderId).order("trade_date", { ascending: false }).order("id", { ascending: false });
  if (opts.farmerId) q = q.eq("farmer_id", opts.farmerId);
  if (opts.from) q = q.gte("trade_date", opts.from);
  if (opts.to) q = q.lte("trade_date", opts.to);
  const { data } = await q.limit(opts.limit ?? 50);
  const rows = data ?? [];
  const ids = rows.map((p) => p.id);
  const { data: pays } = await db.from("cash_entries").select("purchase_id,amount").eq("trader_id", traderId).eq("kind", "farmer_payment").in("purchase_id", ids.length ? ids : [-1]);
  const paidByPurchase = new Map<number, number>();
  (pays ?? []).forEach((c) => { if (c.purchase_id != null) paidByPurchase.set(c.purchase_id, (paidByPurchase.get(c.purchase_id) ?? 0) + Number(c.amount)); });
  const farmerNames = await farmerNameMap(traderId);
  const round = (n: number) => Math.round(n * 100) / 100;
  return rows.map((p) => {
    // total_amount is the net payable to the farmer: coconut value + husk credit − labour deductions.
    // outstanding_to_farmer nets the later cash payments off that balance (the true amount still owed).
    const paid = paidByPurchase.get(p.id) ?? 0;
    return {
      ...p,
      farmer_name: farmerNames.get(p.farmer_id) ?? "Farmer",
      purchase_id: `PUR-${String(p.id).padStart(6, "0")}`,
      paid_to_farmer: round(paid),
      outstanding_to_farmer: round(Math.max(Number(p.balance_amount) - paid, 0)),
    };
  });
}

export async function listSales(traderId: string, opts: { kind?: "coconut" | "husk"; from?: string; to?: string; limit?: number } = {}) {
  const db = service();
  let q = db.from("sales").select("id,buyer_id,sale_kind,sale_date,quantity,unit,rate,total_amount,advance_amount,balance_amount,payment_status,vehicle_number").eq("trader_id", traderId).order("sale_date", { ascending: false }).order("id", { ascending: false });
  if (opts.kind) q = q.eq("sale_kind", opts.kind);
  if (opts.from) q = q.gte("sale_date", opts.from);
  if (opts.to) q = q.lte("sale_date", opts.to);
  const { data } = await q.limit(opts.limit ?? 50);
  const { data: buyers } = await db.from("buyers").select("id,name").eq("trader_id", traderId);
  const names = new Map((buyers ?? []).map((b) => [b.id, b.name]));
  return (data ?? []).map((s) => ({ ...s, buyer_name: names.get(s.buyer_id) ?? "Buyer", sale_id: `SAL-${String(s.id).padStart(6, "0")}` }));
}

export async function listBuyers(traderId: string) {
  const { data } = await service().from("buyers").select("id,name,phone,buys_coconut,buys_husk,active").eq("trader_id", traderId).order("name");
  return data ?? [];
}

async function farmerNameMap(traderId: string) {
  const { data } = await service().from("trader_farmers").select("id,name").eq("trader_id", traderId);
  return new Map((data ?? []).map((f) => [f.id, f.name]));
}

export async function pendingPayments(traderId: string) {
  const db = service();
  const [{ data: sales }, { data: purchases }, { data: cash }, { data: expenses }, { data: buyers }, { data: farmers }] = await Promise.all([
    db.from("sales").select("id,buyer_id,sale_kind,balance_amount").eq("trader_id", traderId),
    db.from("coconut_trades").select("id,farmer_id,balance_amount").eq("trader_id", traderId),
    db.from("cash_entries").select("kind,amount,sale_id,purchase_id").eq("trader_id", traderId),
    db.from("expenses").select("category,amount,paid").eq("trader_id", traderId).eq("paid", false),
    db.from("buyers").select("id,name").eq("trader_id", traderId),
    db.from("trader_farmers").select("id,name").eq("trader_id", traderId),
  ]);
  const recvBySale = new Map<number, number>();
  const paidByPurchase = new Map<number, number>();
  (cash ?? []).forEach((c) => {
    if (c.kind === "buyer_receipt" && c.sale_id != null) recvBySale.set(c.sale_id, (recvBySale.get(c.sale_id) ?? 0) + Number(c.amount));
    if (c.kind === "farmer_payment" && c.purchase_id != null) paidByPurchase.set(c.purchase_id, (paidByPurchase.get(c.purchase_id) ?? 0) + Number(c.amount));
  });
  const buyerName = new Map((buyers ?? []).map((b) => [b.id, b.name]));
  const farmerName = new Map((farmers ?? []).map((f) => [f.id, f.name]));
  const receivables = { coconut: 0, husk: 0, by_buyer: new Map<number, number>() };
  (sales ?? []).forEach((s) => {
    const due = Number(s.balance_amount) - (recvBySale.get(s.id) ?? 0);
    if (due <= 0.005) return;
    if (s.sale_kind === "husk") receivables.husk += due; else receivables.coconut += due;
    receivables.by_buyer.set(s.buyer_id, (receivables.by_buyer.get(s.buyer_id) ?? 0) + due);
  });
  const farmerPay = new Map<number, number>();
  (purchases ?? []).forEach((p) => {
    const due = Number(p.balance_amount) - (paidByPurchase.get(p.id) ?? 0);
    if (due > 0.005) farmerPay.set(p.farmer_id, (farmerPay.get(p.farmer_id) ?? 0) + due);
  });
  const expenseByCat = new Map<string, number>();
  (expenses ?? []).forEach((e) => { if (Number(e.amount) > 0.005) expenseByCat.set(e.category, (expenseByCat.get(e.category) ?? 0) + Number(e.amount)); });
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    receivables: {
      from_coconut_buyers: round(receivables.coconut),
      from_husk_buyers: round(receivables.husk),
      by_buyer: Array.from(receivables.by_buyer.entries()).map(([id, due]) => ({ buyer: buyerName.get(id) ?? "Buyer", due: round(due) })).sort((a, b) => b.due - a.due),
    },
    payables: {
      to_farmers: Array.from(farmerPay.entries()).map(([id, due]) => ({ farmer: farmerName.get(id) ?? "Farmer", due: round(due) })).sort((a, b) => b.due - a.due),
      unpaid_costs_by_category: Array.from(expenseByCat.entries()).map(([category, amount]) => ({ category, amount: round(amount) })).sort((a, b) => b.amount - a.amount),
    },
  };
}

export async function harvestReminders(traderId: string, opts: { onlyDue?: boolean } = {}) {
  const db = service();
  const [{ data: farmers }, { data: entries }, { data: settings }] = await Promise.all([
    db.from("trader_farmers").select("id,name,phone,harvest_interval_days").eq("trader_id", traderId),
    db.from("harvesting_entries").select("farmer_id,harvest_date").eq("trader_id", traderId),
    db.from("trader_settings").select("harvest_reminder_days").eq("trader_id", traderId).maybeSingle(),
  ]);
  const defaultDays = Number(settings?.harvest_reminder_days) || 45;
  const lastByFarmer = new Map<number, string>();
  (entries ?? []).forEach((e) => { if (e.farmer_id == null) return; const prev = lastByFarmer.get(e.farmer_id); if (!prev || e.harvest_date > prev) lastByFarmer.set(e.farmer_id, e.harvest_date); });
  const today = new Date().toISOString().slice(0, 10);
  const todayMs = new Date(`${today}T00:00:00`).getTime();
  const rows = (farmers ?? []).map((f) => {
    const interval = f.harvest_interval_days && f.harvest_interval_days > 0 ? f.harvest_interval_days : defaultDays;
    const last = lastByFarmer.get(f.id) ?? null;
    if (!last) return { farmer: f.name, phone: f.phone, last_harvest: null as string | null, interval_days: interval, next_due: null as string | null, days_until_due: null as number | null };
    const due = new Date(`${last}T00:00:00`); due.setDate(due.getDate() + interval);
    const dueStr = due.toISOString().slice(0, 10);
    const daysUntil = Math.round((due.getTime() - todayMs) / DAY_MS);
    return { farmer: f.name, phone: f.phone, last_harvest: last, interval_days: interval, next_due: dueStr, days_until_due: daysUntil };
  }).sort((a, b) => (a.days_until_due ?? 1e9) - (b.days_until_due ?? 1e9));
  return opts.onlyDue ? rows.filter((r) => r.days_until_due != null && r.days_until_due <= 3) : rows;
}

export async function dashboardSummary(traderId: string) {
  const db = service();
  const [{ data: purchases }, { data: sales }, { data: cash }, { data: expenses }] = await Promise.all([
    db.from("coconut_trades").select("total_amount,balance_amount,id").eq("trader_id", traderId),
    db.from("sales").select("total_amount,balance_amount,id,sale_kind").eq("trader_id", traderId),
    db.from("cash_entries").select("kind,amount,sale_id,purchase_id").eq("trader_id", traderId),
    db.from("expenses").select("amount,paid").eq("trader_id", traderId),
  ]);
  const recvBySale = new Map<number, number>(); const paidByPurchase = new Map<number, number>();
  (cash ?? []).forEach((c) => {
    if (c.kind === "buyer_receipt" && c.sale_id != null) recvBySale.set(c.sale_id, (recvBySale.get(c.sale_id) ?? 0) + Number(c.amount));
    if (c.kind === "farmer_payment" && c.purchase_id != null) paidByPurchase.set(c.purchase_id, (paidByPurchase.get(c.purchase_id) ?? 0) + Number(c.amount));
  });
  const receivable = (sales ?? []).reduce((s, x) => s + Math.max(Number(x.balance_amount) - (recvBySale.get(x.id) ?? 0), 0), 0);
  const farmerPayable = (purchases ?? []).reduce((s, x) => s + Math.max(Number(x.balance_amount) - (paidByPurchase.get(x.id) ?? 0), 0), 0);
  const unpaidExpenses = (expenses ?? []).filter((e) => !e.paid).reduce((s, e) => s + Number(e.amount), 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    purchases_count: (purchases ?? []).length,
    sales_count: (sales ?? []).length,
    total_bought_from_farmers: round((purchases ?? []).reduce((s, x) => s + Number(x.total_amount), 0)),
    total_sold_to_buyers: round((sales ?? []).reduce((s, x) => s + Number(x.total_amount), 0)),
    receivable_from_buyers: round(receivable),
    payable_to_farmers: round(farmerPayable),
    unpaid_costs: round(unpaidExpenses),
  };
}

// ---------------------------------------------------------------------------
// Writes (each confirmed by the assistant before it runs)
// ---------------------------------------------------------------------------
export async function addFarmer(traderId: string, input: { name: string; phone: string; location: string }) {
  const name = input.name.trim();
  const phone = normalizeIndianPhone(input.phone);
  const location = input.location.trim();
  if (name.length < 2) throw new Error("Farmer name is required.");
  if (!phone) throw new Error("A valid 10-digit Indian mobile number is required.");
  if (!location) throw new Error("At least one farming location is required.");
  const db = service();
  const { data, error } = await db.from("trader_farmers").insert({ trader_id: traderId, name, phone, notes: null }).select("id,name,phone").single();
  if (error) throw new Error(error.code === "23505" ? "A farmer with this phone number already exists." : error.message);
  const { error: locErr } = await db.from("farmer_locations").insert({ farmer_id: data.id, location_name: location, city: null });
  if (locErr) throw new Error(locErr.message);
  return { id: data.id, name: data.name, phone: data.phone, location };
}

export async function recordFarmerPayment(traderId: string, input: { purchase_id: number; amount: number; method?: string; date?: string; note?: string }) {
  const db = service();
  const { data: purchase } = await db.from("coconut_trades").select("id,farmer_id,balance_amount").eq("trader_id", traderId).eq("id", input.purchase_id).maybeSingle();
  if (!purchase) throw new Error("That purchase was not found in your account.");
  const { data: paid } = await db.from("cash_entries").select("amount").eq("trader_id", traderId).eq("kind", "farmer_payment").eq("purchase_id", input.purchase_id);
  const alreadyPaid = (paid ?? []).reduce((s, c) => s + Number(c.amount), 0);
  const outstanding = Number(purchase.balance_amount) - alreadyPaid;
  const amount = Number(input.amount);
  if (!(amount > 0)) throw new Error("Enter an amount greater than zero.");
  if (amount > outstanding + 0.005) throw new Error(`Only ₹${outstanding.toFixed(2)} is outstanding on that purchase.`);
  const method = ["cash", "bank", "upi"].includes(input.method ?? "") ? (input.method as string) : "cash";
  const date = input.date || new Date().toISOString().slice(0, 10);
  const { error } = await db.from("cash_entries").insert({ trader_id: traderId, entry_date: date, kind: "farmer_payment", amount, method, farmer_id: purchase.farmer_id, buyer_id: null, purchase_id: purchase.id, sale_id: null, description: input.note?.trim() || "Paid via assistant" });
  if (error) throw new Error(error.message);
  await db.from("coconut_trades").update({ payment_status: statusForBalance(outstanding - amount, true) }).eq("id", purchase.id).eq("trader_id", traderId);
  return { purchase_id: `PUR-${String(purchase.id).padStart(6, "0")}`, amount, method, new_outstanding: Math.round((outstanding - amount) * 100) / 100 };
}

export async function recordBuyerReceipt(traderId: string, input: { sale_id: number; amount: number; method?: string; date?: string; note?: string }) {
  const db = service();
  const { data: sale } = await db.from("sales").select("id,buyer_id,balance_amount").eq("trader_id", traderId).eq("id", input.sale_id).maybeSingle();
  if (!sale) throw new Error("That sale was not found in your account.");
  const { data: recv } = await db.from("cash_entries").select("amount").eq("trader_id", traderId).eq("kind", "buyer_receipt").eq("sale_id", input.sale_id);
  const already = (recv ?? []).reduce((s, c) => s + Number(c.amount), 0);
  const outstanding = Number(sale.balance_amount) - already;
  const amount = Number(input.amount);
  if (!(amount > 0)) throw new Error("Enter an amount greater than zero.");
  if (amount > outstanding + 0.005) throw new Error(`Only ₹${outstanding.toFixed(2)} is receivable on that sale.`);
  const method = ["cash", "bank", "upi"].includes(input.method ?? "") ? (input.method as string) : "cash";
  const date = input.date || new Date().toISOString().slice(0, 10);
  const { error } = await db.from("cash_entries").insert({ trader_id: traderId, entry_date: date, kind: "buyer_receipt", amount, method, farmer_id: null, buyer_id: sale.buyer_id, purchase_id: null, sale_id: sale.id, description: input.note?.trim() || "Received via assistant" });
  if (error) throw new Error(error.message);
  await db.from("sales").update({ payment_status: statusForBalance(outstanding - amount, true) }).eq("id", sale.id).eq("trader_id", traderId);
  return { sale_id: `SAL-${String(sale.id).padStart(6, "0")}`, amount, method, new_outstanding: Math.round((outstanding - amount) * 100) / 100 };
}

export async function addExpense(traderId: string, input: { category: string; amount: number; scope?: string; date?: string; description?: string }) {
  const validCats = ["harvesting_labor", "dehusking_labor", "loading_labor", "transport", "diesel", "vehicle_maintenance", "food", "husk_handling", "other"];
  const category = validCats.includes(input.category) ? input.category : "other";
  const scope = ["coconut", "husk", "general"].includes(input.scope ?? "") ? (input.scope as string) : "general";
  const amount = Number(input.amount);
  if (!(amount > 0)) throw new Error("Enter an amount greater than zero.");
  const date = input.date || new Date().toISOString().slice(0, 10);
  const { data, error } = await service().from("expenses").insert({ trader_id: traderId, expense_date: date, category, scope, amount, employee_id: null, vehicle_id: null, purchase_id: null, sale_id: null, description: input.description?.trim() || null }).select("id").single();
  if (error) throw new Error(error.message);
  return { id: data.id, category, scope, amount, date };
}
