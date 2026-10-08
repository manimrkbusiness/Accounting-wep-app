"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CirclePlus } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { allocationCost, receivedFromBuyer, saleOutstanding, saleStatusWithout, statusForBalance } from "../lib/calc";
import { formatCurrency, formatDate, formatNumber, formatPurchaseId, formatSaleId, today, toNumber } from "../lib/format";
import { cashMethods, type CashEntry, type CashMethod, type Sale } from "../lib/types";
import { downloadSalePdf } from "../lib/pdf";
import { EmptyState, StatusBadge } from "../components/ui";

type ReceiptForm = { amount: string; date: string; method: CashMethod; description: string };

export default function SalesPage() {
  const ws = useWorkspace();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "coconut" | "husk">("all");
  const [buyerFilter, setBuyerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "due" | "paid">("all");
  const [receiptFor, setReceiptFor] = useState<number | null>(null);
  const [receiptForm, setReceiptForm] = useState<ReceiptForm>({ amount: "", date: today(), method: "cash", description: "" });

  const itemsBySale = useMemo(() => {
    const map = new Map<number, typeof ws.saleItems>();
    ws.saleItems.forEach((item) => map.set(item.sale_id, [...(map.get(item.sale_id) ?? []), item]));
    return map;
  }, [ws.saleItems]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ws.sales.filter((sale) => {
      if (kindFilter !== "all" && sale.sale_kind !== kindFilter) return false;
      if (buyerFilter && String(sale.buyer_id) !== buyerFilter) return false;
      const due = saleOutstanding(sale, ws.cashEntries);
      if (statusFilter === "due" && due <= 0.005) return false;
      if (statusFilter === "paid" && due > 0.005) return false;
      if (!query) return true;
      const buyer = ws.buyerById.get(sale.buyer_id);
      const linked = (itemsBySale.get(sale.id) ?? []).map((item) => formatPurchaseId(item.purchase_id)).join(" ");
      return `${formatSaleId(sale.id)} ${buyer?.name ?? ""} ${buyer?.business_name ?? ""} ${buyer?.phone ?? ""} ${sale.vehicle_number ?? ""} ${sale.coconut_color} ${linked}`.toLowerCase().includes(query);
    });
  }, [ws.sales, ws.cashEntries, ws.buyerById, itemsBySale, search, kindFilter, buyerFilter, statusFilter]);

  function openReceipt(sale: Sale) {
    ws.clearFeedback();
    setReceiptFor(sale.id);
    setReceiptForm({ amount: String(Math.max(saleOutstanding(sale, ws.cashEntries), 0).toFixed(2)), date: today(), method: "cash", description: "" });
  }

  async function saveReceipt(sale: Sale) {
    if (!ws.session) return;
    const amount = toNumber(receiptForm.amount);
    const outstanding = saleOutstanding(sale, ws.cashEntries);
    if (amount <= 0) { ws.fail("Enter the amount received from the buyer."); return; }
    if (amount > outstanding + 0.005) { ws.fail(`Only ${formatCurrency(outstanding)} is receivable on this sale.`); return; }
    ws.setSaving(true);
    const { error } = await supabase.from("cash_entries").insert({ trader_id: ws.session.user.id, entry_date: receiptForm.date, kind: "buyer_receipt", amount, method: receiptForm.method, buyer_id: sale.buyer_id, sale_id: sale.id, description: receiptForm.description.trim() || null });
    if (!error) await supabase.from("sales").update({ payment_status: statusForBalance(outstanding - amount, true) }).eq("id", sale.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    setReceiptFor(null);
    ws.notify("Buyer receipt recorded in the cash book.");
    await ws.refresh();
  }

  async function undoReceipt(sale: Sale, entry: CashEntry) {
    if (!ws.session) return;
    if (!window.confirm(`Undo the receipt of ${formatCurrency(Number(entry.amount))} recorded on ${formatDate(entry.entry_date)}? It will be removed from the cash book and the amount due will go back up.`)) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("cash_entries").delete().eq("id", entry.id).eq("trader_id", ws.session.user.id);
    if (!error) await supabase.from("sales").update({ payment_status: saleStatusWithout(sale, ws.cashEntries, entry.id) }).eq("id", sale.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify("Receipt undone. The cash book and balance due are restored.");
    await ws.refresh();
  }

  async function deleteSale(sale: Sale) {
    if (!ws.session) return;
    if (!window.confirm(`Delete ${formatSaleId(sale.id)}? The included purchases return to stock. Receipts recorded against it stay in the cash book.`)) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("sales").delete().eq("id", sale.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify("Sale deleted and stock restored.");
    await ws.refresh();
  }

  return (
    <section className="ledger-panel">
      <div className="panel-heading"><div><span className="eyebrow">Private ledger</span><h2>Sales history</h2></div><div className="page-actions"><Link className="primary-button" href="/v2/sales/new"><CirclePlus size={18} strokeWidth={2.2} aria-hidden="true" />New coconut sale</Link><Link className="secondary-button" href="/v2/sales/new?kind=husk">Husk sale</Link></div></div>
      <div className="filter-bar">
        <label className="search-field">Search sale ID, buyer, lorry or purchase ID<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="SAL-000001, buyer name, PUR-000003..." /></label>
        <label>Type<select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}><option value="all">Coconut and husk</option><option value="coconut">Coconut loads</option><option value="husk">Husk sales</option></select></label>
        <label>Buyer<select value={buyerFilter} onChange={(event) => setBuyerFilter(event.target.value)}><option value="">All buyers</option>{ws.buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}</option>)}</select></label>
        <label>Payment<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">All</option><option value="due">Balance due</option><option value="paid">Fully received</option></select></label>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Sale</th><th>Date</th><th>Buyer</th><th>Details</th><th>Quantity</th><th>Rate</th><th>Total</th><th>Farmer side</th><th>Received / due</th><th>From purchases</th><th>Actions</th></tr></thead><tbody>
        {rows.map((sale) => {
          const buyer = ws.buyerById.get(sale.buyer_id);
          const items = itemsBySale.get(sale.id) ?? [];
          const receipts = ws.cashEntries.filter((entry) => entry.kind === "buyer_receipt" && entry.sale_id === sale.id);
          const received = Number(sale.advance_amount) + receivedFromBuyer(sale.id, ws.cashEntries);
          const due = saleOutstanding(sale, ws.cashEntries);
          const status = statusForBalance(due, received > 0);
          const unit = sale.unit === "kg" ? "kg" : sale.unit === "piece" ? "pieces" : "loads";
          const farmerCost = items.reduce((sum, item) => sum + Number(item.quantity_pieces) * (ws.stock.get(item.purchase_id)?.costPerPiece ?? 0), 0);
          const margin = Number(sale.sale_amount) - allocationCost(items, ws.stock);
          return <tr key={sale.id}>
            <td><strong>{formatSaleId(sale.id)}</strong><span className="muted-text">{sale.sale_kind === "husk" ? "Husk" : "Coconut load"}{sale.vehicle_number ? ` · ${sale.vehicle_number}` : ""}</span></td>
            <td>{formatDate(sale.sale_date)}</td>
            <td><strong>{buyer?.name ?? "Unknown buyer"}</strong><span className="muted-text">{buyer?.business_name || buyer?.phone || ""}</span></td>
            <td>{sale.sale_kind === "husk" ? "Husk" : <><span className={`coconut-dot ${sale.coconut_color}`}></span>{sale.coconut_color}<span className="muted-text">{sale.processing_type}{Number(sale.coconut_quantity) > 0 ? ` · ${formatNumber(Number(sale.coconut_quantity), 0)} pieces` : ""}</span></>}</td>
            <td>{formatNumber(Number(sale.quantity))} {unit}{sale.gross_weight_kg != null && Number(sale.gross_weight_kg) > 0 ? <span className="muted-text">Gross {formatNumber(Number(sale.gross_weight_kg))} kg</span> : null}</td>
            <td>{formatCurrency(Number(sale.rate))} / {sale.unit === "kg" ? "kg" : sale.unit === "piece" ? "nut" : "load"}</td>
            <td className="amount-cell">{formatCurrency(Number(sale.total_amount))}{Number(sale.transport_charge) > 0 ? <span className="muted-text">incl. transport {formatCurrency(Number(sale.transport_charge))}</span> : null}{Number(sale.deduction_amount) > 0 ? <span className="balance-cell">-{formatCurrency(Number(sale.deduction_amount))}</span> : null}</td>
            <td>{sale.sale_kind === "coconut" && items.length ? <div className="cell-stack"><span className="muted-text">Paid to farmers</span><span className="balance-cell">{formatCurrency(farmerCost)}</span><span className="muted-text">Margin</span><span className={margin >= 0 ? "positive" : "balance-cell"}>{formatCurrency(margin)}</span></div> : <span className="muted-text">-</span>}</td>
            <td><StatusBadge status={status} /><span className="muted-text">Received {formatCurrency(received)}</span>{due > 0.005 ? <span className="positive">Due {formatCurrency(due)}</span> : null}{receipts.length ? <div className="payment-list">{receipts.map((entry) => <span className="muted-text" key={entry.id}>{formatDate(entry.entry_date)} · {formatCurrency(Number(entry.amount))}<button className="link-button undo-link" disabled={ws.saving} onClick={() => undoReceipt(sale, entry)} type="button">Undo</button></span>)}</div> : null}</td>
            <td>{items.length ? <div className="chip-row">{items.map((item) => <Link className="chip" href={`/v2/purchases?focus=${item.purchase_id}`} key={item.id}>{formatPurchaseId(item.purchase_id)} · {formatNumber(Number(item.quantity_pieces), 0)}</Link>)}</div> : <span className="muted-text">-</span>}</td>
            <td><div className="row-actions">
              <button className="secondary-button" onClick={() => downloadSalePdf(sale, buyer, items, ws.purchaseById, ws.farmerById, ws.traderName)} type="button">PDF</button>
              <button className="secondary-button" onClick={() => router.push(`/v2/sales/new?edit=${sale.id}`)} type="button">Edit</button>
              {due > 0.005 ? <button className="secondary-button" onClick={() => openReceipt(sale)} type="button">Receive</button> : null}
              <button className="danger-button" disabled={ws.saving} onClick={() => deleteSale(sale)} type="button">Delete</button>
            </div>
            {receiptFor === sale.id ? <div className="inline-form"><strong>Receipt from {buyer?.name ?? "buyer"}</strong><div className="form-grid">
              <label>Amount (INR)<input type="number" min="0" step="0.01" value={receiptForm.amount} onChange={(event) => setReceiptForm((form) => ({ ...form, amount: event.target.value }))} /></label>
              <label>Date<input type="date" value={receiptForm.date} onChange={(event) => setReceiptForm((form) => ({ ...form, date: event.target.value }))} /></label>
              <label>Method<select value={receiptForm.method} onChange={(event) => setReceiptForm((form) => ({ ...form, method: event.target.value as CashMethod }))}>{cashMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
              <label>Note <span className="optional">Optional</span><input value={receiptForm.description} onChange={(event) => setReceiptForm((form) => ({ ...form, description: event.target.value }))} placeholder="Part payment, final settlement..." /></label>
            </div><div className="row-actions"><button className="primary-button" disabled={ws.saving} onClick={() => saveReceipt(sale)} type="button">Save receipt</button><button className="link-button" onClick={() => setReceiptFor(null)} type="button">Cancel</button></div></div> : null}
            </td>
          </tr>;
        })}
      </tbody></table>{rows.length === 0 ? <EmptyState>No sales match this search. Create a load from purchases in stock.</EmptyState> : null}</div>
    </section>
  );
}
