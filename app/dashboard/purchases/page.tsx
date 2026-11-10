"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CirclePlus } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { paidToFarmer, purchaseOutstanding, purchaseStatusWithout, statusForBalance } from "../lib/calc";
import { formatCurrency, formatDate, formatNumber, formatPurchaseId, today, toNumber } from "../lib/format";
import { cashMethods, type CashEntry, type CashMethod, type Farmer, type FarmerLocation, type Purchase } from "../lib/types";
import { downloadPurchasePdf } from "../lib/pdf";
import { farmerReceiptText, shareReceiptWhatsApp } from "../lib/receipt";
import { EmptyState, StatusBadge } from "../components/ui";
import { ResumeBanner } from "../components/ResumeBanner";
import { RowMenu } from "../components/RowMenu";

type PaymentForm = { amount: string; date: string; method: CashMethod; description: string };

export default function PurchasesPage() {
  const ws = useWorkspace();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [farmerFilter, setFarmerFilter] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "in-stock" | "sold-out">("all");
  const [paymentFor, setPaymentFor] = useState<number | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({ amount: "", date: today(), method: "cash", description: "" });
  const [focusId, setFocusId] = useState<number | null>(null);

  const harvestByPurchase = useMemo(() => {
    const map = new Map<number, typeof ws.harvestingEntries>();
    ws.harvestingEntries.forEach((entry) => { if (entry.purchase_id) map.set(entry.purchase_id, [...(map.get(entry.purchase_id) ?? []), entry]); });
    return map;
  }, [ws.harvestingEntries]);

  // Realized husk profit/loss per purchase, once the husk is sold: pieces sold × (sale price − the
  // husk's real cost). Byproduct husk costs nothing, so it is pure profit.
  const huskPnlByPurchase = useMemo(() => {
    const huskSaleRate = new Map<number, number>();
    ws.sales.forEach((sale) => { if (sale.sale_kind === "husk") huskSaleRate.set(sale.id, Number(sale.rate)); });
    const map = new Map<number, { pieces: number; pnl: number }>();
    ws.huskSaleItems.forEach((item) => {
      const rate = huskSaleRate.get(item.sale_id);
      if (rate == null) return;
      const basis = ws.husk.get(item.purchase_id)?.huskBasisPerPiece ?? 0;
      const pieces = Number(item.quantity_pieces);
      const current = map.get(item.purchase_id) ?? { pieces: 0, pnl: 0 };
      map.set(item.purchase_id, { pieces: current.pieces + pieces, pnl: current.pnl + pieces * (rate - basis) });
    });
    return map;
  }, [ws.huskSaleItems, ws.sales, ws.husk]);

  // Realized coconut profit/loss per purchase, once its coconut is sold in a load. For each coconut
  // sale, the sale value is split across the purchases in it (by weight for kg-sales, else by pieces),
  // and each purchase's cost (farmer payable per piece + stock dehusking + the dehusking/harvesting
  // wages you pay the teams, allocated per piece) is subtracted.
  const coconutPnlByPurchase = useMemo(() => {
    const laborTotal = new Map<number, number>();
    const harvestToPurchase = new Map<number, number>();
    ws.harvestingEntries.forEach((entry) => { if (entry.purchase_id != null) harvestToPurchase.set(entry.id, entry.purchase_id); });
    ws.expenses.forEach((expense) => {
      if (expense.category !== "dehusking_labor" && expense.category !== "harvesting_labor") return;
      const purchaseId = expense.purchase_id ?? (expense.harvesting_entry_id != null ? harvestToPurchase.get(expense.harvesting_entry_id) : undefined);
      if (purchaseId == null) return;
      laborTotal.set(purchaseId, (laborTotal.get(purchaseId) ?? 0) + Number(expense.amount));
    });
    const laborPerPiece = (purchaseId: number) => { const pcs = Number(ws.purchaseById.get(purchaseId)?.coconut_quantity) || 0; return pcs > 0 ? (laborTotal.get(purchaseId) ?? 0) / pcs : 0; };
    const map = new Map<number, { pieces: number; pnl: number }>();
    ws.sales.filter((sale) => sale.sale_kind === "coconut").forEach((sale) => {
      const items = ws.saleItems.filter((item) => item.sale_id === sale.id);
      if (!items.length) return;
      const allocWeight = (purchaseId: number, pieces: number) => { const info = ws.stock.get(purchaseId); return sale.unit === "kg" && info ? pieces * info.kgPerPiece : pieces; };
      const totalAlloc = items.reduce((sum, item) => sum + allocWeight(item.purchase_id, Number(item.quantity_pieces)), 0);
      items.forEach((item) => {
        const info = ws.stock.get(item.purchase_id);
        const pieces = Number(item.quantity_pieces);
        const revenue = totalAlloc > 0 ? (allocWeight(item.purchase_id, pieces) / totalAlloc) * Number(sale.total_amount) : 0;
        const cost = pieces * ((info?.coconutCostPerPiece ?? 0) + (info?.dehuskingCostPerPiece ?? 0) + laborPerPiece(item.purchase_id));
        const current = map.get(item.purchase_id) ?? { pieces: 0, pnl: 0 };
        map.set(item.purchase_id, { pieces: current.pieces + pieces, pnl: current.pnl + (revenue - cost) });
      });
    });
    return map;
  }, [ws.sales, ws.saleItems, ws.stock, ws.expenses, ws.harvestingEntries, ws.purchaseById]);

  useEffect(() => {
    const focus = Number(new URLSearchParams(window.location.search).get("focus"));
    if (focus) setFocusId(focus);
  }, []);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ws.purchases.filter((purchase) => {
      if (purchase.husk_only) return false; // husk-only purchases live on the Husk purchase page
      if (farmerFilter && String(purchase.farmer_id) !== farmerFilter) return false;
      const info = ws.stock.get(purchase.id);
      if (stockFilter === "in-stock" && !(info && info.remainingPieces > 0.5)) return false;
      if (stockFilter === "sold-out" && info && info.remainingPieces > 0.5) return false;
      if (!query) return true;
      const farmer = ws.farmerById.get(purchase.farmer_id);
      const location = purchase.location_id ? ws.locationById.get(purchase.location_id) : null;
      return `${formatPurchaseId(purchase.id)} ${farmer?.name ?? ""} ${farmer?.phone ?? ""} ${location?.location_name ?? ""} ${purchase.coconut_color}`.toLowerCase().includes(query);
    });
  }, [ws.purchases, ws.stock, ws.farmerById, ws.locationById, search, farmerFilter, stockFilter]);

  function openPayment(purchase: Purchase) {
    ws.clearFeedback();
    setPaymentFor(purchase.id);
    setPaymentForm({ amount: String(Math.max(purchaseOutstanding(purchase, ws.cashEntries), 0).toFixed(2)), date: today(), method: "cash", description: "" });
  }

  async function savePayment(purchase: Purchase) {
    if (!ws.session) return;
    const amount = toNumber(paymentForm.amount);
    const outstanding = purchaseOutstanding(purchase, ws.cashEntries);
    if (amount <= 0) { ws.fail("Enter the amount paid to the farmer."); return; }
    if (amount > outstanding + 0.005) { ws.fail(`Only ${formatCurrency(outstanding)} is outstanding on this purchase.`); return; }
    ws.setSaving(true);
    const { error } = await supabase.from("cash_entries").insert({
      trader_id: ws.session.user.id,
      entry_date: paymentForm.date,
      kind: "farmer_payment",
      amount,
      method: paymentForm.method,
      farmer_id: purchase.farmer_id,
      purchase_id: purchase.id,
      description: paymentForm.description.trim() || null
    });
    if (!error) {
      const nextStatus = statusForBalance(outstanding - amount, true);
      await supabase.from("coconut_trades").update({ payment_status: nextStatus }).eq("id", purchase.id).eq("trader_id", ws.session.user.id);
    }
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    setPaymentFor(null);
    ws.notify("Farmer payment recorded in the cash book.");
    await ws.refresh();
  }

  async function undoPayment(purchase: Purchase, entry: CashEntry) {
    if (!ws.session) return;
    if (!window.confirm(`Reverse the payment of ${formatCurrency(Number(entry.amount))} recorded on ${formatDate(entry.entry_date)}? It is removed from the cash book and the Transactions list, and the amount due goes back up.`)) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("cash_entries").delete().eq("id", entry.id).eq("trader_id", ws.session.user.id);
    if (!error) await supabase.from("coconut_trades").update({ payment_status: purchaseStatusWithout(purchase, ws.cashEntries, entry.id) }).eq("id", purchase.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify("Payment reversed. The cash book, Transactions and balance due are restored.");
    await ws.refresh();
  }

  /** Reverse the most recent cash-book payment on this purchase (undo a mistaken "Pay" click). */
  function reversePayment(purchase: Purchase, payments: CashEntry[]) {
    const latest = [...payments].sort((a, b) => (a.entry_date < b.entry_date ? 1 : a.entry_date > b.entry_date ? -1 : b.id - a.id))[0];
    if (latest) void undoPayment(purchase, latest);
  }

  async function deletePurchase(purchase: Purchase) {
    if (!ws.session) return;
    const info = ws.stock.get(purchase.id);
    const hasDerived = Boolean(info && (info.soldPieces > 0 || info.stockedPieces > 0 || info.wastedPieces > 0));
    const warn = hasDerived ? " Its stock entries, any sales, husk sales and wastage made from it are removed too." : "";
    if (!window.confirm(`Delete ${formatPurchaseId(purchase.id)}?${warn} Payments recorded against it stay in the cash book.`)) return;
    ws.clearFeedback();
    ws.setSaving(true);
    // Use the RPC so a purchase can be removed even after it has gone into stock, sales or wastage.
    const { error } = await supabase.rpc("delete_purchase", { p_purchase_id: purchase.id });
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify("Purchase deleted.");
    await ws.refresh();
  }

  /** Share a farmer-only receipt (what the trader owes) over WhatsApp — no trader margin. */
  function shareReceipt(purchase: Purchase, farmer: Farmer | undefined, location: FarmerLocation | null) {
    const coconutAmount = Number(purchase.total_amount) - Number(purchase.husk_price_total) + Number(purchase.labor_cost_total);
    const methodLabel = purchase.purchase_mode === "quantity" ? "Per nut" : `Weight${purchase.husk_included ? " + husk" : ""}`;
    const text = farmerReceiptText({
      traderName: ws.traderName, farmerName: farmer?.name ?? "Farmer", farmerPhone: farmer?.phone,
      date: purchase.trade_date, location: location?.location_name ?? null,
      color: purchase.coconut_color, methodLabel, quantityPieces: Number(purchase.coconut_quantity),
      netWeightKg: purchase.purchase_mode === "weight" ? Number(purchase.net_weight_kg) : undefined,
      payableWeightKg: purchase.purchase_mode === "weight" ? Number(purchase.payable_weight_kg) : undefined,
      coconutAmount, dehuskingCost: Number(purchase.husk_removal_cost), harvestingCost: Number(purchase.tree_collection_cost),
      huskCredit: Number(purchase.husk_price_total), additionalCredit: Number(purchase.additional_credit_amount),
      additionalDebit: Number(purchase.additional_debit_amount), netPayable: Number(purchase.total_amount),
      advance: Number(purchase.advance_amount), balance: Number(purchase.balance_amount), notes: purchase.notes
    });
    shareReceiptWhatsApp(text, farmer?.phone);
  }

  return (
    <div className="stack">
    <ResumeBanner form="purchase" newPath="/dashboard/purchases/new" what="purchase" />
    {ws.error ? <p className="error-message" role="alert">{ws.error}</p> : null}
    <section className="ledger-panel">
      <div className="panel-heading"><div><span className="eyebrow">Private ledger</span><h2>Purchase history</h2></div><Link className="primary-button" href="/dashboard/purchases/new"><CirclePlus size={18} strokeWidth={2.2} aria-hidden="true" />New purchase</Link></div>
      <div className="filter-bar">
        <label className="search-field">Search purchase ID, farmer, phone or location<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="PUR-000001 or +91..." /></label>
        <label>Farmer<select value={farmerFilter} onChange={(event) => setFarmerFilter(event.target.value)}><option value="">All farmers</option>{ws.farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name}</option>)}</select></label>
        <label>Stock<select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as typeof stockFilter)}><option value="all">All purchases</option><option value="in-stock">Still in stock</option><option value="sold-out">Fully sold</option></select></label>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Purchase</th><th>Date</th><th>Farmer</th><th>Coconut</th><th>Pieces</th><th>Stock</th><th>Weight</th><th>Net payable</th><th>Paid / due</th><th>Harvesting</th><th>Realized P&amp;L</th><th>Actions</th></tr></thead><tbody>
        {rows.map((purchase) => {
          const farmer = ws.farmerById.get(purchase.farmer_id);
          const location = purchase.location_id ? ws.locationById.get(purchase.location_id) ?? null : null;
          const info = ws.stock.get(purchase.id);
          const payments = ws.cashEntries.filter((entry) => entry.kind === "farmer_payment" && entry.purchase_id === purchase.id);
          const paid = Number(purchase.advance_amount) + paidToFarmer(purchase.id, ws.cashEntries);
          const due = purchaseOutstanding(purchase, ws.cashEntries);
          const status = statusForBalance(due, paid > 0);
          const huskPnl = huskPnlByPurchase.get(purchase.id);
          const coconutPnl = coconutPnlByPurchase.get(purchase.id);
          const soldPnl = (coconutPnl?.pnl ?? 0) + (huskPnl?.pnl ?? 0);
          const anythingSold = (coconutPnl?.pieces ?? 0) > 0 || (huskPnl?.pieces ?? 0) > 0;
          return <tr className={focusId === purchase.id ? "selected" : undefined} key={purchase.id}>
            <td><strong>{formatPurchaseId(purchase.id)}</strong><span className="muted-text">{location?.location_name ?? "-"}</span></td>
            <td>{formatDate(purchase.trade_date)}</td>
            <td><strong>{farmer?.name ?? "Unknown farmer"}</strong><span className="muted-text">{farmer?.phone}</span></td>
            <td><span className={`coconut-dot ${purchase.coconut_color}`}></span>{purchase.coconut_color}<span className="muted-text">{purchase.purchase_mode === "quantity" ? "Per nut" : `${purchase.processing_type === "mottai" ? "Mottai" : "Kudume"}${purchase.husk_included ? " · with husk" : ""}`}</span></td>
            <td>{formatNumber(Number(purchase.coconut_quantity), 0)}<span className="muted-text">{formatCurrency(Number(purchase.average_price_per_piece))} / nut</span></td>
            <td>{info && info.remainingPieces > 0.5 ? <span className="chip good">{formatNumber(info.remainingPieces, 0)} left</span> : <span className="chip">Sold out</span>}{info && info.awaitingStockPieces > 0.5 ? <Link className="chip warn" href={`/dashboard/stock?purchase=${purchase.id}`}>{formatNumber(info.awaitingStockPieces, 0)} to weigh</Link> : null}{info && info.soldPieces > 0 ? <span className="muted-text">{formatNumber(info.soldPieces, 0)} sold</span> : null}{info && info.wastedPieces > 0 ? <span className="muted-text">{formatNumber(info.wastedPieces, 0)} wasted</span> : null}</td>
            <td>{purchase.purchase_mode === "quantity" ? "Per nut" : `${formatNumber(Number(purchase.payable_weight_kg))} kg`}{purchase.purchase_mode === "weight" ? <span className="muted-text">Net {formatNumber(Number(purchase.net_weight_kg))} kg</span> : null}</td>
            <td className="amount-cell">{formatCurrency(Number(purchase.total_amount))}</td>
            <td><StatusBadge status={status} /><span className="muted-text">Paid {formatCurrency(paid)}</span>{due > 0.005 ? <span className="balance-cell">Due {formatCurrency(due)}</span> : null}{payments.length ? <div className="payment-list">{payments.map((entry) => <span className="muted-text" key={entry.id}>{formatDate(entry.entry_date)} · {formatCurrency(Number(entry.amount))}</span>)}</div> : null}</td>
            <td>{(harvestByPurchase.get(purchase.id) ?? []).length ? (harvestByPurchase.get(purchase.id) ?? []).map((entry) => <div className="muted-text" key={entry.id}>{entry.head_employee_id ? ws.employeeById.get(entry.head_employee_id)?.name ?? "Worker" : entry.team_id ? ws.harvestingTeamById.get(entry.team_id)?.name ?? "Team" : "Harvest"} · {formatNumber(Number(entry.coconut_quantity), 0)} pcs · {formatCurrency(Number(entry.total_cost))}</div>) : <span className="muted-text">-</span>}</td>
            <td>{anythingSold ? <><span className={soldPnl >= -0.005 ? "chip good" : "chip warn"}>{soldPnl >= -0.005 ? `+${formatCurrency(soldPnl)}` : `−${formatCurrency(Math.abs(soldPnl))}`}</span>{coconutPnl && coconutPnl.pieces > 0 ? <span className="muted-text">coconut {coconutPnl.pnl >= -0.005 ? "+" : "−"}{formatCurrency(Math.abs(coconutPnl.pnl))} · {formatNumber(coconutPnl.pieces, 0)} sold</span> : null}{huskPnl && huskPnl.pieces > 0 ? <span className="muted-text">husk {huskPnl.pnl >= -0.005 ? "+" : "−"}{formatCurrency(Math.abs(huskPnl.pnl))} · {formatNumber(huskPnl.pieces, 0)} sold</span> : null}</> : <span className="muted-text">Not sold yet</span>}</td>
            <td><RowMenu>
              {(close) => <>
                <button role="menuitem" type="button" onClick={() => { close(); downloadPurchasePdf(purchase, farmer, location, ws.traderName, { paid, due, status, payments: payments.map((entry) => ({ date: entry.entry_date, amount: Number(entry.amount) })) }); }}>Download PDF</button>
                <button role="menuitem" type="button" onClick={() => { close(); shareReceipt(purchase, farmer, location); }}>Share receipt</button>
                <button role="menuitem" type="button" onClick={() => { close(); router.push(`/dashboard/purchases/new?edit=${purchase.id}`); }}>Edit</button>
                {due > 0.005 ? <button role="menuitem" type="button" onClick={() => { close(); openPayment(purchase); }}>Record payment</button> : null}
                {payments.length ? <button role="menuitem" type="button" disabled={ws.saving} onClick={() => { close(); reversePayment(purchase, payments); }}>Reverse payment</button> : null}
                <div className="menu-sep" />
                <button role="menuitem" type="button" className="danger" disabled={ws.saving} onClick={() => { close(); deletePurchase(purchase); }}>Delete</button>
              </>}
            </RowMenu>
            {paymentFor === purchase.id ? <div className="inline-form"><strong>Payment to {farmer?.name ?? "farmer"}</strong><div className="form-grid">
              <label>Amount (INR)<input type="number" min="0" step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm((form) => ({ ...form, amount: event.target.value }))} /></label>
              <label>Date<input type="date" value={paymentForm.date} onChange={(event) => setPaymentForm((form) => ({ ...form, date: event.target.value }))} /></label>
              <label>Method<select value={paymentForm.method} onChange={(event) => setPaymentForm((form) => ({ ...form, method: event.target.value as CashMethod }))}>{cashMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
              <label>Note <span className="optional">Optional</span><input value={paymentForm.description} onChange={(event) => setPaymentForm((form) => ({ ...form, description: event.target.value }))} placeholder="Final settlement, part payment..." /></label>
            </div><div className="row-actions"><button className="primary-button" disabled={ws.saving} onClick={() => savePayment(purchase)} type="button">Save payment</button><button className="link-button" onClick={() => setPaymentFor(null)} type="button">Cancel</button></div></div> : null}
            </td>
          </tr>;
        })}
      </tbody></table>{rows.length === 0 ? <EmptyState>No purchases match this search.</EmptyState> : null}</div>
    </section>
    </div>
  );
}
