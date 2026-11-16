"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, HandCoins } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { purchaseOutstanding, saleOutstanding, statusForBalance } from "../lib/calc";
import { formatCurrency, formatDate, formatPurchaseId, formatSaleId, today, toNumber } from "../lib/format";
import { cashMethods, expenseCategories, type CashMethod, type Expense, type Purchase, type Sale } from "../lib/types";
import { EmptyState, Panel } from "../components/ui";

type PayTarget = { type: "buyer"; sale: Sale } | { type: "farmer"; purchase: Purchase };

// Labor wage categories (shown together under "Laborers & teams"); the rest are listed on their own.
const LABOR_CATEGORIES = new Set(["harvesting_labor", "dehusking_labor", "loading_labor"]);

export default function PendingPaymentsPage() {
  const ws = useWorkspace();
  const [tab, setTab] = useState<"receivables" | "payables">("receivables");
  const [open, setOpen] = useState<string | null>(null);
  const [pay, setPay] = useState<PayTarget | null>(null);
  const [payForm, setPayForm] = useState<{ amount: string; method: CashMethod; date: string }>({ amount: "", method: "cash", date: today() });

  const toggle = (key: string) => { setOpen((current) => (current === key ? null : key)); setPay(null); };

  // Receivables: unpaid sale balances (coconut + husk), grouped by buyer.
  const receivables = useMemo(() => {
    const byBuyer = new Map<number, { total: number; sales: Array<{ sale: Sale; due: number }> }>();
    ws.sales.forEach((sale) => {
      const due = saleOutstanding(sale, ws.cashEntries);
      if (due <= 0.005) return;
      const group = byBuyer.get(sale.buyer_id) ?? { total: 0, sales: [] };
      group.total += due;
      group.sales.push({ sale, due });
      byBuyer.set(sale.buyer_id, group);
    });
    return Array.from(byBuyer.entries()).map(([buyerId, group]) => ({ buyerId, total: group.total, sales: group.sales.sort((a, b) => b.due - a.due) })).sort((a, b) => b.total - a.total);
  }, [ws.sales, ws.cashEntries]);
  const receivableTotal = receivables.reduce((sum, group) => sum + group.total, 0);

  // Payables to farmers: unpaid purchase balances, grouped by farmer.
  const farmerPayables = useMemo(() => {
    const byFarmer = new Map<number, { total: number; purchases: Array<{ purchase: Purchase; due: number }> }>();
    ws.purchases.forEach((purchase) => {
      const due = purchaseOutstanding(purchase, ws.cashEntries);
      if (due <= 0.005) return;
      const group = byFarmer.get(purchase.farmer_id) ?? { total: 0, purchases: [] };
      group.total += due;
      group.purchases.push({ purchase, due });
      byFarmer.set(purchase.farmer_id, group);
    });
    return Array.from(byFarmer.entries()).map(([farmerId, group]) => ({ farmerId, total: group.total, purchases: group.purchases.sort((a, b) => b.due - a.due) })).sort((a, b) => b.total - a.total);
  }, [ws.purchases, ws.cashEntries]);
  const farmerTotal = farmerPayables.reduce((sum, group) => sum + group.total, 0);

  // Payables for costs (laborers, diesel, transport, vehicles…): unpaid expenses grouped by category.
  const expensePayables = useMemo(() => {
    const byCat = new Map<string, Expense[]>();
    ws.expenses.forEach((expense) => {
      if (expense.paid || Number(expense.amount) <= 0.005) return;
      const list = byCat.get(expense.category) ?? [];
      list.push(expense);
      byCat.set(expense.category, list);
    });
    return Array.from(byCat.entries())
      .map(([category, items]) => ({
        category,
        label: expenseCategories.find((entry) => entry.value === category)?.label ?? category,
        isLabor: LABOR_CATEGORIES.has(category),
        total: items.reduce((sum, item) => sum + Number(item.amount), 0),
        items: items.sort((a, b) => Number(b.amount) - Number(a.amount))
      }))
      .sort((a, b) => b.total - a.total);
  }, [ws.expenses]);
  const laborGroups = expensePayables.filter((group) => group.isLabor);
  const otherGroups = expensePayables.filter((group) => !group.isLabor);
  const expenseTotal = expensePayables.reduce((sum, group) => sum + group.total, 0);
  const payableTotal = farmerTotal + expenseTotal;

  function startPay(target: PayTarget, due: number) {
    setPay(target);
    setPayForm({ amount: String(Math.round(due * 100) / 100), method: "cash", date: today() });
  }

  async function payFarmer(purchase: Purchase) {
    if (!ws.session) return;
    const amount = toNumber(payForm.amount);
    const due = purchaseOutstanding(purchase, ws.cashEntries);
    if (amount <= 0) { ws.fail("Enter the amount paid to the farmer."); return; }
    if (amount > due + 0.005) { ws.fail(`Only ${formatCurrency(due)} is outstanding on ${formatPurchaseId(purchase.id)}.`); return; }
    ws.clearFeedback();
    ws.setSaving(true);
    const traderId = ws.session.user.id;
    const { error } = await supabase.from("cash_entries").insert({ trader_id: traderId, entry_date: payForm.date, kind: "farmer_payment", amount, method: payForm.method, farmer_id: purchase.farmer_id, buyer_id: null, purchase_id: purchase.id, sale_id: null, description: `Paid from Pending payments (${formatPurchaseId(purchase.id)})` });
    if (!error) await supabase.from("coconut_trades").update({ payment_status: statusForBalance(due - amount, true) }).eq("id", purchase.id).eq("trader_id", traderId);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    setPay(null);
    ws.notify(`Paid ${formatCurrency(amount)} to ${ws.farmerById.get(purchase.farmer_id)?.name ?? "the farmer"}.`);
    await ws.refresh();
  }

  async function receiveBuyer(sale: Sale) {
    if (!ws.session) return;
    const amount = toNumber(payForm.amount);
    const due = saleOutstanding(sale, ws.cashEntries);
    if (amount <= 0) { ws.fail("Enter the amount received from the buyer."); return; }
    if (amount > due + 0.005) { ws.fail(`Only ${formatCurrency(due)} is receivable on ${formatSaleId(sale.id)}.`); return; }
    ws.clearFeedback();
    ws.setSaving(true);
    const traderId = ws.session.user.id;
    const { error } = await supabase.from("cash_entries").insert({ trader_id: traderId, entry_date: payForm.date, kind: "buyer_receipt", amount, method: payForm.method, farmer_id: null, buyer_id: sale.buyer_id, purchase_id: null, sale_id: sale.id, description: `Received from Pending payments (${formatSaleId(sale.id)})` });
    if (!error) await supabase.from("sales").update({ payment_status: statusForBalance(due - amount, true) }).eq("id", sale.id).eq("trader_id", traderId);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    setPay(null);
    ws.notify(`Received ${formatCurrency(amount)} from ${ws.buyerById.get(sale.buyer_id)?.name ?? "the buyer"}.`);
    await ws.refresh();
  }

  async function markPaid(ids: number[], label: string) {
    if (!ws.session || ids.length === 0) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("expenses").update({ paid: true, paid_at: new Date().toISOString() }).in("id", ids).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify(ids.length > 1 ? `Marked ${ids.length} ${label} wages paid.` : `Marked paid.`);
    await ws.refresh();
  }

  const expenseWho = (expense: Expense) => {
    if (expense.employee_id) return ws.employeeById.get(expense.employee_id)?.name ?? "Team";
    if (expense.vehicle_id) return ws.vehicleById.get(expense.vehicle_id)?.vehicle_number ?? "Vehicle";
    return expense.description ?? "—";
  };
  const expenseLink = (expense: Expense) => expense.purchase_id ? formatPurchaseId(expense.purchase_id) : expense.sale_id ? formatSaleId(expense.sale_id) : "";

  // A compact inline "record a payment" form, shared by buyer receipts and farmer payments.
  const payFormRow = (onSave: () => void) => (
    <div className="inline-form pending-pay">
      <div className="form-grid">
        <label>Amount (INR)<input type="number" min="0" step="0.01" value={payForm.amount} onChange={(event) => setPayForm((current) => ({ ...current, amount: event.target.value }))} autoFocus /></label>
        <label>Date<input type="date" value={payForm.date} onChange={(event) => setPayForm((current) => ({ ...current, date: event.target.value }))} /></label>
        <label>Method<select value={payForm.method} onChange={(event) => setPayForm((current) => ({ ...current, method: event.target.value as CashMethod }))}>{cashMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
      </div>
      <div className="row-actions"><button className="primary-button" disabled={ws.saving} onClick={onSave} type="button">Save</button><button className="link-button" onClick={() => setPay(null)} type="button">Cancel</button></div>
    </div>
  );

  return (
    <div className="stack">
      <section className="welcome-band">
        <div><span className="eyebrow">Pending payments</span><h2>Everything you still need to collect, and everything you still owe.</h2><p>Receivables are money coming in from buyers. Payables are money going out to farmers, teams and for fuel and other costs.</p></div>
      </section>

      {ws.error ? <p className="error-message" role="alert">{ws.error}</p> : null}

      <div className="segmented sale-kind">
        <button className={tab === "receivables" ? "active" : ""} onClick={() => { setTab("receivables"); setOpen(null); setPay(null); }} type="button"><strong><ArrowDownLeft size={16} strokeWidth={2.2} aria-hidden="true" /> Receivables — {formatCurrency(receivableTotal)}</strong><span>Money to receive from coconut and husk buyers</span></button>
        <button className={tab === "payables" ? "active" : ""} onClick={() => { setTab("payables"); setOpen(null); setPay(null); }} type="button"><strong><ArrowUpRight size={16} strokeWidth={2.2} aria-hidden="true" /> Payables — {formatCurrency(payableTotal)}</strong><span>Money to pay farmers, teams and for fuel &amp; costs</span></button>
      </div>

      {tab === "receivables" ? (
        <Panel eyebrow="Pending receivables" title={`From buyers${receivableTotal > 0 ? ` — ${formatCurrency(receivableTotal)}` : ""}`}>
          {receivables.length ? <div className="pending-groups">{receivables.map((group) => {
            const key = `buyer:${group.buyerId}`;
            return <div className="pending-group" key={key}>
              <button className="pending-group-head" onClick={() => toggle(key)} type="button"><span className="pending-caret" aria-hidden="true">{open === key ? "▾" : "▸"}</span><span className="pending-name"><strong>{ws.buyerById.get(group.buyerId)?.name ?? "Buyer"}</strong><span className="muted-text">{group.sales.length} sale{group.sales.length > 1 ? "s" : ""}</span></span><strong className="positive">{formatCurrency(group.total)}</strong></button>
              {open === key ? <div className="pending-rows">{group.sales.map(({ sale, due }) => <div className="pending-row" key={sale.id}>
                <div className="pending-row-main"><Link href="/dashboard/sales" className="chip">{formatSaleId(sale.id)}</Link><span className="muted-text">{sale.sale_kind === "husk" ? "Husk" : "Coconut"} · {formatDate(sale.sale_date)}</span></div>
                <span className="positive">{formatCurrency(due)}</span>
                {pay?.type === "buyer" && pay.sale.id === sale.id ? null : <button className="primary-button" onClick={() => startPay({ type: "buyer", sale }, due)} type="button">Receive</button>}
                {pay?.type === "buyer" && pay.sale.id === sale.id ? payFormRow(() => receiveBuyer(sale)) : null}
              </div>)}</div> : null}
            </div>;
          })}</div> : <EmptyState>No money pending from buyers. Every sale is fully received.</EmptyState>}
          <p className="field-hint">Receiving a payment here records it in the Cash book and clears the sale, exactly like &ldquo;Receive payment&rdquo; on the sales page.</p>
        </Panel>
      ) : (
        <div className="stack">
          <Panel eyebrow="Pending payables" title={`To farmers${farmerTotal > 0 ? ` — ${formatCurrency(farmerTotal)}` : ""}`} action={<Link className="metric-icon" href="/dashboard/purchases" aria-label="Farmer purchases"><HandCoins size={18} strokeWidth={2.2} aria-hidden="true" /></Link>}>
            {farmerPayables.length ? <div className="pending-groups">{farmerPayables.map((group) => {
              const key = `farmer:${group.farmerId}`;
              return <div className="pending-group" key={key}>
                <button className="pending-group-head" onClick={() => toggle(key)} type="button"><span className="pending-caret" aria-hidden="true">{open === key ? "▾" : "▸"}</span><span className="pending-name"><strong>{ws.farmerById.get(group.farmerId)?.name ?? "Farmer"}</strong><span className="muted-text">{group.purchases.length} purchase{group.purchases.length > 1 ? "s" : ""}</span></span><strong className="balance-cell">{formatCurrency(group.total)}</strong></button>
                {open === key ? <div className="pending-rows">{group.purchases.map(({ purchase, due }) => <div className="pending-row" key={purchase.id}>
                  <div className="pending-row-main"><Link href="/dashboard/purchases" className="chip">{formatPurchaseId(purchase.id)}</Link><span className="muted-text">{formatDate(purchase.trade_date)}</span></div>
                  <span className="balance-cell">{formatCurrency(due)}</span>
                  {pay?.type === "farmer" && pay.purchase.id === purchase.id ? null : <button className="primary-button" onClick={() => startPay({ type: "farmer", purchase }, due)} type="button">Pay</button>}
                  {pay?.type === "farmer" && pay.purchase.id === purchase.id ? payFormRow(() => payFarmer(purchase)) : null}
                </div>)}</div> : null}
              </div>;
            })}</div> : <EmptyState>No money pending to farmers.</EmptyState>}
          </Panel>

          <Panel eyebrow="Pending payables" title={`Laborers & teams${laborGroups.reduce((sum, group) => sum + group.total, 0) > 0 ? ` — ${formatCurrency(laborGroups.reduce((sum, group) => sum + group.total, 0))}` : ""}`}>
            {laborGroups.length ? <div className="pending-groups">{laborGroups.map((group) => renderExpenseGroup(group))}</div> : <EmptyState>No labor wages pending. Harvesting, dehusking and loading wages appear here until paid.</EmptyState>}
            <p className="field-hint">Each category lists the unpaid wages per team. Marking one paid is the same as &ldquo;Mark paid&rdquo; on the team and harvesting pages.</p>
          </Panel>

          <Panel eyebrow="Pending payables" title={`Fuel & other costs${otherGroups.reduce((sum, group) => sum + group.total, 0) > 0 ? ` — ${formatCurrency(otherGroups.reduce((sum, group) => sum + group.total, 0))}` : ""}`}>
            {otherGroups.length ? <div className="pending-groups">{otherGroups.map((group) => renderExpenseGroup(group))}</div> : <EmptyState>No fuel, transport or other costs pending. Add a fuel line on a sale and it appears here until paid.</EmptyState>}
          </Panel>
        </div>
      )}
    </div>
  );

  function renderExpenseGroup(group: { category: string; label: string; total: number; items: Expense[] }) {
    const key = `cat:${group.category}`;
    return <div className="pending-group" key={key}>
      <button className="pending-group-head" onClick={() => toggle(key)} type="button"><span className="pending-caret" aria-hidden="true">{open === key ? "▾" : "▸"}</span><span className="pending-name"><strong>{group.label}</strong><span className="muted-text">{group.items.length} unpaid</span></span><strong className="balance-cell">{formatCurrency(group.total)}</strong></button>
      {open === key ? <div className="pending-rows">
        <div className="pending-row pending-row-actions"><button className="secondary-button" disabled={ws.saving} onClick={() => markPaid(group.items.map((item) => item.id), group.label)} type="button">Mark all paid ({formatCurrency(group.total)})</button></div>
        {group.items.map((expense) => <div className="pending-row" key={expense.id}>
          <div className="pending-row-main"><strong>{expenseWho(expense)}</strong><span className="muted-text">{formatDate(expense.expense_date)}{expenseLink(expense) ? ` · ${expenseLink(expense)}` : ""}</span></div>
          <span className="balance-cell">{formatCurrency(Number(expense.amount))}</span>
          <button className="primary-button" disabled={ws.saving} onClick={() => markPaid([expense.id], group.label)} type="button">Mark paid</button>
        </div>)}
      </div> : null}
    </div>;
  }
}
