"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Boxes, IndianRupee, Recycle } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { sumBy } from "../lib/calc";
import { formatCurrency, formatDate, formatNumber, today, toNumber } from "../lib/format";
import type { WastageSale } from "../lib/types";
import { EmptyState, Metric } from "../components/ui";

type WastageForm = { sale_date: string; buyer_id: string; buyer_name: string; quantity_pieces: string; rate_per_piece: string; notes: string };
const blankForm = (): WastageForm => ({ sale_date: today(), buyer_id: "", buyer_name: "", quantity_pieces: "", rate_per_piece: "", notes: "" });

export default function WastagePage() {
  const ws = useWorkspace();
  const [form, setForm] = useState<WastageForm>(blankForm);

  // Only stock-stage wastage (nuts picked from a per-nut purchase but not loaded) is sellable.
  // Its cost is already absorbed into the surviving nuts, so any sale here is pure profit.
  const wastedPieces = useMemo(() => sumBy(ws.stockWastage.filter((row) => row.stock_entry_id != null), (row) => Number(row.quantity_pieces)), [ws.stockWastage]);
  const soldPieces = useMemo(() => sumBy(ws.wastageSales, (row) => Number(row.quantity_pieces)), [ws.wastageSales]);
  const available = Math.max(wastedPieces - soldPieces, 0);
  const incomeTotal = useMemo(() => sumBy(ws.wastageSales, (row) => Number(row.amount)), [ws.wastageSales]);

  const pieces = Math.max(Math.round(toNumber(form.quantity_pieces)), 0);
  const rate = Math.max(toNumber(form.rate_per_piece), 0);
  const amount = pieces * rate;

  const setField = <K extends keyof WastageForm>(key: K, value: WastageForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  async function saveSale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    if (pieces <= 0) { ws.fail("Enter how many wasted coconuts you sold."); return; }
    if (pieces > available) { ws.fail(`Only ${formatNumber(available, 0)} wasted coconuts are available to sell.`); return; }
    if (rate < 0) { ws.fail("Enter a valid rate per coconut."); return; }
    ws.setSaving(true);
    const { error } = await supabase.from("wastage_sales").insert({
      trader_id: ws.session.user.id,
      sale_date: form.sale_date,
      buyer_id: form.buyer_id ? Number(form.buyer_id) : null,
      buyer_name: form.buyer_id ? null : (form.buyer_name.trim() || null),
      quantity_pieces: pieces,
      rate_per_piece: rate,
      notes: form.notes.trim() || null
    });
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify(`${formatNumber(pieces, 0)} wasted coconuts sold for ${formatCurrency(amount)}. Added to your profit.`);
    setForm(blankForm());
    await ws.refresh();
  }

  async function deleteSale(sale: WastageSale) {
    if (!ws.session || !window.confirm("Delete this wasted-coconut sale?")) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("wastage_sales").delete().eq("id", sale.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify("Wasted-coconut sale deleted.");
    await ws.refresh();
  }

  const buyerLabel = (sale: WastageSale) => sale.buyer_id ? (ws.buyerById.get(sale.buyer_id)?.name ?? "Buyer") : (sale.buyer_name || "—");

  return (
    <div className="stack">
      {ws.error ? <p className="error-message" role="alert">{ws.error}</p> : null}

      <section className="metrics-grid wide">
        <Metric icon={Recycle} label="Wasted at stock" value={`${formatNumber(wastedPieces, 0)} pieces`} hint="Picked but not loaded" />
        <Metric icon={IndianRupee} label="Sold so far" value={`${formatNumber(soldPieces, 0)} pieces`} hint={`${formatCurrency(incomeTotal)} earned`} tone="positive" />
        <Metric icon={Boxes} label="Available to sell" value={`${formatNumber(available, 0)} pieces`} hint="Wasted coconuts left" />
      </section>

      <section className="workspace-grid">
        <form className="tool-panel" onSubmit={saveSale}>
          <div className="panel-heading"><div><span className="eyebrow">Sell wasted coconuts</span><h2>Record a wastage sale</h2></div></div>
          <p className="muted-text">Coconuts wasted while weighing (picked from stock but not loaded) still have some value. Sell them to anyone at a small rate — their cost is already absorbed into your other stock, so this money is pure profit.</p>
          {available <= 0 ? <p className="mode-note">No wasted coconuts are available to sell right now. They appear here when you load fewer coconuts than you picked on the <Link href="/dashboard/stock">Stock</Link> page.</p> : null}
          <div className="form-grid">
            <label>Sale date<input type="date" value={form.sale_date} onChange={(event) => setField("sale_date", event.target.value)} required /></label>
            <label>Sold to <span className="optional">Optional</span><select value={form.buyer_id} onChange={(event) => setField("buyer_id", event.target.value)}><option value="">Someone else (type name)</option>{ws.buyers.filter((buyer) => buyer.active).map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}</option>)}</select></label>
            {!form.buyer_id ? <label>Buyer name <span className="optional">Optional</span><input value={form.buyer_name} onChange={(event) => setField("buyer_name", event.target.value)} placeholder="Who bought the wasted coconuts" /></label> : null}
            <label>Wasted coconuts sold (pieces)<input type="number" min="1" step="1" max={available} value={form.quantity_pieces} onChange={(event) => setField("quantity_pieces", event.target.value)} required /><span className="field-hint">{formatNumber(available, 0)} available.</span></label>
            <label>Rate per coconut (INR)<input type="number" min="0" step="0.01" value={form.rate_per_piece} onChange={(event) => setField("rate_per_piece", event.target.value)} required /></label>
          </div>
          <label>Notes <span className="optional">Optional</span><textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="Any note about this sale" /></label>
          {ws.error ? <p className="error-message form-error" role="alert">{ws.error}</p> : null}
          <button className="primary-button" disabled={ws.saving || available <= 0} type="submit">{ws.saving ? "Saving..." : "Save wastage sale"}</button>
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
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Sold to</th><th>Pieces</th><th>Rate</th><th>Income</th><th>Notes</th><th>Actions</th></tr></thead><tbody>
          {ws.wastageSales.map((sale) => <tr key={sale.id}>
            <td>{formatDate(sale.sale_date)}</td>
            <td>{buyerLabel(sale)}</td>
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
