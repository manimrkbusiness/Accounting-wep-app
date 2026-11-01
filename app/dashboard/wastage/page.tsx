"use client";

import { useMemo, useState } from "react";
import { Boxes, IndianRupee, Recycle } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { sumBy } from "../lib/calc";
import { formatCurrency, formatDate, formatNumber, formatPurchaseId, today, toNumber } from "../lib/format";
import type { WastageSale } from "../lib/types";
import { EmptyState, Metric } from "../components/ui";

type WastageForm = { sale_date: string; buyer_id: string; buyer_name: string; rate_per_piece: string; notes: string };
const blankForm = (): WastageForm => ({ sale_date: today(), buyer_id: "", buyer_name: "", rate_per_piece: "", notes: "" });

export default function WastagePage() {
  const ws = useWorkspace();
  const [form, setForm] = useState<WastageForm>(blankForm);
  const [selection, setSelection] = useState<Map<number, string>>(new Map());
  const [farmerFilter, setFarmerFilter] = useState("");

  // Wasted pieces per purchase (stock-stage only) and how many of them have already been sold.
  const wastedByPurchase = useMemo(() => {
    const map = new Map<number, number>();
    ws.stockWastage.filter((row) => row.stock_entry_id != null).forEach((row) => map.set(row.purchase_id, (map.get(row.purchase_id) ?? 0) + Number(row.quantity_pieces)));
    return map;
  }, [ws.stockWastage]);
  const soldByPurchase = useMemo(() => {
    const map = new Map<number, number>();
    ws.wastageSaleItems.forEach((item) => map.set(item.purchase_id, (map.get(item.purchase_id) ?? 0) + Number(item.quantity_pieces)));
    return map;
  }, [ws.wastageSaleItems]);
  const availableFor = (purchaseId: number) => Math.max((wastedByPurchase.get(purchaseId) ?? 0) - (soldByPurchase.get(purchaseId) ?? 0), 0);

  const totalWasted = useMemo(() => sumBy(Array.from(wastedByPurchase.values()), (v) => v), [wastedByPurchase]);
  const totalSold = useMemo(() => sumBy(ws.wastageSaleItems, (item) => Number(item.quantity_pieces)), [ws.wastageSaleItems]);
  const available = Math.max(totalWasted - totalSold, 0);
  const incomeTotal = useMemo(() => sumBy(ws.wastageSales, (row) => Number(row.amount)), [ws.wastageSales]);

  // Purchases that still have wasted coconuts to sell (plus any already ticked), newest first.
  const candidates = useMemo(() => ws.purchases.filter((purchase) => {
    if (selection.has(purchase.id)) return true;
    if (farmerFilter && String(purchase.farmer_id) !== farmerFilter) return false;
    return availableFor(purchase.id) > 0;
  }), [ws.purchases, selection, farmerFilter, wastedByPurchase, soldByPurchase]); // eslint-disable-line react-hooks/exhaustive-deps

  const allocations = useMemo(() => Array.from(selection.entries()).map(([purchase_id, pieces]) => ({ purchase_id, quantity_pieces: Math.max(Math.round(toNumber(pieces)), 0) })).filter((item) => item.quantity_pieces > 0), [selection]);
  const pieces = allocations.reduce((sum, item) => sum + item.quantity_pieces, 0);
  const rate = Math.max(toNumber(form.rate_per_piece), 0);
  const amount = pieces * rate;

  const setField = <K extends keyof WastageForm>(key: K, value: WastageForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  function toggle(purchaseId: number, checked: boolean) {
    setSelection((current) => {
      const next = new Map(current);
      if (checked) next.set(purchaseId, String(Math.round(availableFor(purchaseId))));
      else next.delete(purchaseId);
      return next;
    });
  }

  async function saveSale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    if (allocations.length === 0) { ws.fail("Tick at least one purchase and enter how many wasted coconuts you sold."); return; }
    for (const item of allocations) {
      if (item.quantity_pieces > availableFor(item.purchase_id)) { ws.fail(`${formatPurchaseId(item.purchase_id)} only has ${formatNumber(availableFor(item.purchase_id), 0)} wasted coconuts available.`); return; }
    }
    if (rate < 0) { ws.fail("Enter a valid rate per coconut."); return; }
    ws.setSaving(true);
    const { data, error } = await supabase.from("wastage_sales").insert({
      trader_id: ws.session.user.id,
      sale_date: form.sale_date,
      buyer_id: form.buyer_id ? Number(form.buyer_id) : null,
      buyer_name: form.buyer_id ? null : (form.buyer_name.trim() || null),
      quantity_pieces: pieces,
      rate_per_piece: rate,
      notes: form.notes.trim() || null
    }).select("id").single();
    if (error) { ws.setSaving(false); ws.fail(error.message); return; }
    const saleId = (data as { id: number } | null)?.id;
    if (saleId) {
      const { error: itemsError } = await supabase.from("wastage_sale_items").insert(allocations.map((item) => ({ trader_id: ws.session!.user.id, wastage_sale_id: saleId, purchase_id: item.purchase_id, quantity_pieces: item.quantity_pieces })));
      if (itemsError) {
        // Roll back the header so the balance stays correct.
        await supabase.from("wastage_sales").delete().eq("id", saleId).eq("trader_id", ws.session.user.id);
        ws.setSaving(false); ws.fail(itemsError.message); return;
      }
    }
    ws.setSaving(false);
    ws.notify(`${formatNumber(pieces, 0)} wasted coconuts sold for ${formatCurrency(amount)}. Added to your profit.`);
    setForm(blankForm());
    setSelection(new Map());
    await ws.refresh();
  }

  async function deleteSale(sale: WastageSale) {
    if (!ws.session || !window.confirm("Delete this wasted-coconut sale? Those pieces go back to available.")) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("wastage_sales").delete().eq("id", sale.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify("Wasted-coconut sale deleted.");
    await ws.refresh();
  }

  const buyerLabel = (sale: WastageSale) => sale.buyer_id ? (ws.buyerById.get(sale.buyer_id)?.name ?? "Buyer") : (sale.buyer_name || "—");
  const sourcesFor = (saleId: number) => {
    const byFarmer = new Map<string, number>();
    ws.wastageSaleItems.filter((item) => item.wastage_sale_id === saleId).forEach((item) => {
      const name = ws.farmerById.get(ws.purchaseById.get(item.purchase_id)?.farmer_id ?? -1)?.name ?? formatPurchaseId(item.purchase_id);
      byFarmer.set(name, (byFarmer.get(name) ?? 0) + Number(item.quantity_pieces));
    });
    return Array.from(byFarmer.entries()).map(([name, qty]) => `${name} (${formatNumber(qty, 0)})`).join(", ");
  };

  return (
    <div className="stack">
      {ws.error ? <p className="error-message" role="alert">{ws.error}</p> : null}

      <section className="metrics-grid wide">
        <Metric icon={Recycle} label="Wasted at stock" value={`${formatNumber(totalWasted, 0)} pieces`} hint="Picked but not loaded" />
        <Metric icon={IndianRupee} label="Sold so far" value={`${formatNumber(totalSold, 0)} pieces`} hint={`${formatCurrency(incomeTotal)} earned`} tone="positive" />
        <Metric icon={Boxes} label="Available to sell" value={`${formatNumber(available, 0)} pieces`} hint="Wasted coconuts left" />
      </section>

      <section className="ledger-panel select-table">
        <div className="panel-heading"><div><span className="eyebrow">Pick what to sell</span><h2>Wasted coconuts by purchase</h2></div><div className="chip-row"><span className="chip good">{formatNumber(pieces, 0)} selected</span></div></div>
        <p className="muted-text">These are coconuts picked from a purchase but not loaded at the Stock stage. Tick a purchase and enter how many of its wasted coconuts you are selling. Their cost is already absorbed into your other stock, so this money is pure profit.</p>
        <div className="filter-bar">
          <label>Farmer<select value={farmerFilter} onChange={(event) => setFarmerFilter(event.target.value)}><option value="">All farmers</option>{ws.farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name}</option>)}</select></label>
        </div>
        <div className="table-wrap"><table><thead><tr><th></th><th>Purchase</th><th>Date</th><th>Farmer</th><th>Wasted</th><th>Available</th><th>Pieces to sell</th></tr></thead><tbody>
          {candidates.map((purchase) => {
            const avail = availableFor(purchase.id);
            const selected = selection.has(purchase.id);
            return <tr className={selected ? "selected" : undefined} key={purchase.id}>
              <td><input type="checkbox" aria-label={`Sell wastage from ${formatPurchaseId(purchase.id)}`} checked={selected} disabled={!selected && avail <= 0} onChange={(event) => toggle(purchase.id, event.target.checked)} /></td>
              <td><strong>{formatPurchaseId(purchase.id)}</strong></td>
              <td>{formatDate(purchase.trade_date)}</td>
              <td>{ws.farmerById.get(purchase.farmer_id)?.name ?? "Farmer"}</td>
              <td>{formatNumber(wastedByPurchase.get(purchase.id) ?? 0, 0)}</td>
              <td>{formatNumber(avail, 0)}</td>
              <td>{selected ? <input type="number" min="1" max={Math.floor(avail)} step="1" value={selection.get(purchase.id) ?? ""} onChange={(event) => { const raw = event.target.value; const clamped = raw === "" ? "" : String(Math.max(0, Math.min(Math.floor(toNumber(raw)), Math.floor(avail)))); setSelection((current) => new Map(current).set(purchase.id, clamped)); }} /> : <span className="muted-text">-</span>}</td>
            </tr>;
          })}
        </tbody></table>{candidates.length === 0 ? <EmptyState>No wasted coconuts available to sell. They appear here when you load fewer coconuts than you picked on the Stock page.</EmptyState> : null}</div>
      </section>

      <section className="workspace-grid">
        <form className="tool-panel" onSubmit={saveSale}>
          <div className="panel-heading"><div><span className="eyebrow">Sell wasted coconuts</span><h2>Record a wastage sale</h2></div></div>
          <div className="form-grid">
            <label>Sale date<input type="date" value={form.sale_date} onChange={(event) => setField("sale_date", event.target.value)} required /></label>
            <label>Sold to <span className="optional">Optional</span><select value={form.buyer_id} onChange={(event) => setField("buyer_id", event.target.value)}><option value="">Someone else (type name)</option>{ws.buyers.filter((buyer) => buyer.active).map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}</option>)}</select></label>
            {!form.buyer_id ? <label>Buyer name <span className="optional">Optional</span><input value={form.buyer_name} onChange={(event) => setField("buyer_name", event.target.value)} placeholder="Who bought the wasted coconuts" /></label> : null}
            <label>Rate per coconut (INR)<input type="number" min="0" step="0.01" value={form.rate_per_piece} onChange={(event) => setField("rate_per_piece", event.target.value)} required /></label>
          </div>
          <label>Notes <span className="optional">Optional</span><textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="Any note about this sale" /></label>
          {ws.error ? <p className="error-message form-error" role="alert">{ws.error}</p> : null}
          <button className="primary-button" disabled={ws.saving || pieces <= 0} type="submit">{ws.saving ? "Saving..." : `Sell ${formatNumber(pieces, 0)} wasted coconuts`}</button>
        </form>
        <aside className="side-stack">
          <section className="calculation-panel"><span className="eyebrow">Live calculation</span><h2>Wastage sale</h2><dl className="calculation-list">
            <div><dt>Wasted coconuts sold</dt><dd>{formatNumber(pieces, 0)} pieces</dd></div>
            <div><dt>Rate per coconut</dt><dd>{formatCurrency(rate)}</dd></div>
            <div className="calculation-credit calculation-total"><dt>Income<small className="formula">{formatNumber(pieces, 0)} × {formatCurrency(rate)}</small></dt><dd>{formatCurrency(amount)}</dd></div>
          </dl><p className="field-hint">This whole amount is added to your dashboard net profit — the wasted nuts cost you nothing extra beyond what is already in your stock cost.</p></section>
        </aside>
      </section>

      <section className="ledger-panel">
        <div className="panel-heading"><div><span className="eyebrow">History</span><h2>Wasted-coconut sales</h2></div>{ws.wastageSales.length ? <span className="chip good">{formatCurrency(incomeTotal)} total</span> : null}</div>
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Sold to</th><th>From (farmer)</th><th>Pieces</th><th>Rate</th><th>Income</th><th>Notes</th><th>Actions</th></tr></thead><tbody>
          {ws.wastageSales.map((sale) => <tr key={sale.id}>
            <td>{formatDate(sale.sale_date)}</td>
            <td>{buyerLabel(sale)}</td>
            <td>{sourcesFor(sale.id) || <span className="muted-text">-</span>}</td>
            <td>{formatNumber(Number(sale.quantity_pieces), 0)}</td>
            <td>{formatCurrency(Number(sale.rate_per_piece))}</td>
            <td className="amount-cell">{formatCurrency(Number(sale.amount))}</td>
            <td>{sale.notes || "-"}</td>
            <td><button className="danger-button" disabled={ws.saving} onClick={() => deleteSale(sale)} type="button">Delete</button></td>
          </tr>)}
        </tbody></table>{ws.wastageSales.length === 0 ? <EmptyState>No wasted coconuts sold yet.</EmptyState> : null}</div>
      </section>
    </div>
  );
}
