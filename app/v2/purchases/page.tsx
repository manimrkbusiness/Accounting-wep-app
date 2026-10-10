"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CirclePlus } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { paidToFarmer, purchaseOutstanding, purchaseStatusWithout, statusForBalance } from "../lib/calc";
import { formatCurrency, formatDate, formatNumber, formatPurchaseId, today, toNumber } from "../lib/format";
import { cashMethods, type CashEntry, type CashMethod, type Purchase } from "../lib/types";
import { downloadPurchasePdf } from "../lib/pdf";
import { EmptyState, StatusBadge } from "../components/ui";
import { ResumeBanner } from "../components/ResumeBanner";

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
  const [harvestFor, setHarvestFor] = useState<number | null>(null);
  const [harvestPick, setHarvestPick] = useState("");

  const harvestByPurchase = useMemo(() => {
    const map = new Map<number, typeof ws.harvestingEntries>();
    ws.harvestingEntries.forEach((entry) => { if (entry.purchase_id) map.set(entry.purchase_id, [...(map.get(entry.purchase_id) ?? []), entry]); });
    return map;
  }, [ws.harvestingEntries]);
  const unlinkedHarvests = useMemo(() => ws.harvestingEntries.filter((entry) => !entry.purchase_id), [ws.harvestingEntries]);

  useEffect(() => {
    const focus = Number(new URLSearchParams(window.location.search).get("focus"));
    if (focus) setFocusId(focus);
  }, []);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ws.purchases.filter((purchase) => {
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
    if (!window.confirm(`Undo the payment of ${formatCurrency(Number(entry.amount))} recorded on ${formatDate(entry.entry_date)}? It will be removed from the cash book and the amount due will go back up.`)) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("cash_entries").delete().eq("id", entry.id).eq("trader_id", ws.session.user.id);
    if (!error) await supabase.from("coconut_trades").update({ payment_status: purchaseStatusWithout(purchase, ws.cashEntries, entry.id) }).eq("id", purchase.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify("Payment undone. The cash book and balance due are restored.");
    await ws.refresh();
  }

  async function linkHarvest(purchaseId: number) {
    if (!ws.session || !harvestPick) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("harvesting_entries").update({ purchase_id: purchaseId }).eq("id", Number(harvestPick)).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    setHarvestFor(null); setHarvestPick("");
    ws.notify("Harvesting linked to this purchase. Its labor cost now shows against this purchase.");
    await ws.refresh();
  }

  async function unlinkHarvest(entryId: number) {
    if (!ws.session) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("harvesting_entries").update({ purchase_id: null }).eq("id", entryId).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify("Harvesting unlinked from this purchase.");
    await ws.refresh();
  }

  async function deletePurchase(purchase: Purchase) {
    if (!ws.session) return;
    const info = ws.stock.get(purchase.id);
    if (info && info.soldPieces > 0) { ws.fail("This purchase is part of a sale. Remove it from the sale before deleting."); return; }
    if (!window.confirm(`Delete ${formatPurchaseId(purchase.id)}? Payments recorded against it stay in the cash book.`)) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("coconut_trades").delete().eq("id", purchase.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify("Purchase deleted.");
    await ws.refresh();
  }

  return (
    <div className="stack">
    <ResumeBanner form="purchase" newPath="/v2/purchases/new" what="purchase" />
    <section className="ledger-panel">
      <div className="panel-heading"><div><span className="eyebrow">Private ledger</span><h2>Purchase history</h2></div><Link className="primary-button" href="/v2/purchases/new"><CirclePlus size={18} strokeWidth={2.2} aria-hidden="true" />New purchase</Link></div>
      <div className="filter-bar">
        <label className="search-field">Search purchase ID, farmer, phone or location<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="PUR-000001 or +91..." /></label>
        <label>Farmer<select value={farmerFilter} onChange={(event) => setFarmerFilter(event.target.value)}><option value="">All farmers</option>{ws.farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name}</option>)}</select></label>
        <label>Stock<select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as typeof stockFilter)}><option value="all">All purchases</option><option value="in-stock">Still in stock</option><option value="sold-out">Fully sold</option></select></label>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Purchase</th><th>Date</th><th>Farmer</th><th>Coconut</th><th>Pieces</th><th>Stock</th><th>Weight</th><th>Net payable</th><th>Paid / due</th><th>Harvesting</th><th>Actions</th></tr></thead><tbody>
        {rows.map((purchase) => {
          const farmer = ws.farmerById.get(purchase.farmer_id);
          const location = purchase.location_id ? ws.locationById.get(purchase.location_id) ?? null : null;
          const info = ws.stock.get(purchase.id);
          const payments = ws.cashEntries.filter((entry) => entry.kind === "farmer_payment" && entry.purchase_id === purchase.id);
          const paid = Number(purchase.advance_amount) + paidToFarmer(purchase.id, ws.cashEntries);
          const due = purchaseOutstanding(purchase, ws.cashEntries);
          const status = statusForBalance(due, paid > 0);
          return <tr className={focusId === purchase.id ? "selected" : undefined} key={purchase.id}>
            <td><strong>{formatPurchaseId(purchase.id)}</strong><span className="muted-text">{location?.location_name ?? "-"}</span></td>
            <td>{formatDate(purchase.trade_date)}</td>
            <td><strong>{farmer?.name ?? "Unknown farmer"}</strong><span className="muted-text">{farmer?.phone}</span></td>
            <td><span className={`coconut-dot ${purchase.coconut_color}`}></span>{purchase.coconut_color}<span className="muted-text">{purchase.purchase_mode === "quantity" ? "Per nut" : purchase.processing_type === "mottai" ? "Mottai" : "Kudume"}</span></td>
            <td>{formatNumber(Number(purchase.coconut_quantity), 0)}<span className="muted-text">{formatCurrency(Number(purchase.average_price_per_piece))} / nut</span></td>
            <td>{info && info.remainingPieces > 0.5 ? <span className="chip good">{formatNumber(info.remainingPieces, 0)} left</span> : <span className="chip">Sold out</span>}{info && info.awaitingStockPieces > 0.5 ? <Link className="chip warn" href={`/v2/stock?purchase=${purchase.id}`}>{formatNumber(info.awaitingStockPieces, 0)} to weigh</Link> : null}{info && info.soldPieces > 0 ? <span className="muted-text">{formatNumber(info.soldPieces, 0)} sold</span> : null}{info && info.wastedPieces > 0 ? <span className="muted-text">{formatNumber(info.wastedPieces, 0)} wasted</span> : null}</td>
            <td>{purchase.purchase_mode === "quantity" ? "Per nut" : `${formatNumber(Number(purchase.payable_weight_kg))} kg`}{purchase.purchase_mode === "weight" ? <span className="muted-text">Net {formatNumber(Number(purchase.net_weight_kg))} kg</span> : null}</td>
            <td className="amount-cell">{formatCurrency(Number(purchase.total_amount))}</td>
            <td><StatusBadge status={status} /><span className="muted-text">Paid {formatCurrency(paid)}</span>{due > 0.005 ? <span className="balance-cell">Due {formatCurrency(due)}</span> : null}{payments.length ? <div className="payment-list">{payments.map((entry) => <span className="muted-text" key={entry.id}>{formatDate(entry.entry_date)} · {formatCurrency(Number(entry.amount))}<button className="link-button undo-link" disabled={ws.saving} onClick={() => undoPayment(purchase, entry)} type="button">Undo</button></span>)}</div> : null}</td>
            <td>{(harvestByPurchase.get(purchase.id) ?? []).map((entry) => <div className="muted-text" key={entry.id}>{entry.team_id ? ws.harvestingTeamById.get(entry.team_id)?.name ?? "Team" : "Harvest"} · {formatNumber(Number(entry.coconut_quantity), 0)} pcs · {formatCurrency(Number(entry.total_cost))}<button className="link-button undo-link" disabled={ws.saving} onClick={() => unlinkHarvest(entry.id)} type="button">Unlink</button></div>)}
              <button className="link-button" onClick={() => { setHarvestFor(harvestFor === purchase.id ? null : purchase.id); setHarvestPick(""); }} type="button">{harvestFor === purchase.id ? "Close" : "Link harvesting"}</button>
              {harvestFor === purchase.id ? <div className="inline-form"><label>Harvesting entry<select value={harvestPick} onChange={(event) => setHarvestPick(event.target.value)}><option value="">Select an unlinked harvest</option>{unlinkedHarvests.map((entry) => <option key={entry.id} value={entry.id}>{formatDate(entry.harvest_date)} · {entry.team_id ? ws.harvestingTeamById.get(entry.team_id)?.name ?? "Team" : "No team"} · {formatNumber(Number(entry.coconut_quantity), 0)} pcs</option>)}</select></label>{unlinkedHarvests.length === 0 ? <span className="field-hint">No unlinked harvests. Record one on <Link href="/v2/harvesting">Coconut Harvesting</Link>.</span> : null}<div className="row-actions"><button className="primary-button" disabled={ws.saving || !harvestPick} onClick={() => linkHarvest(purchase.id)} type="button">Link</button><button className="link-button" onClick={() => setHarvestFor(null)} type="button">Cancel</button></div></div> : null}</td>
            <td><div className="row-actions">
              <button className="secondary-button" onClick={() => downloadPurchasePdf(purchase, farmer, location, ws.traderName)} type="button">PDF</button>
              <button className="secondary-button" onClick={() => router.push(`/v2/purchases/new?edit=${purchase.id}`)} type="button">Edit</button>
              {due > 0.005 ? <button className="secondary-button" onClick={() => openPayment(purchase)} type="button">Pay</button> : null}
              <button className="danger-button" disabled={ws.saving} onClick={() => deletePurchase(purchase)} type="button">Delete</button>
            </div>
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
