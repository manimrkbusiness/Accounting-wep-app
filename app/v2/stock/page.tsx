"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { formatCurrency, formatDate, formatNumber, formatPurchaseId, formatStockId, today, toNumber } from "../lib/format";
import { processingTypes, type ProcessingType, type StockEntry } from "../lib/types";
import { EmptyState, Panel } from "../components/ui";
import { defaultSettings } from "../components/CostSettingsPanel";

type StockForm = { id?: number; entry_date: string; processing_type: ProcessingType; net_weight_kg: string; wastage_percent: string; apply_dehusking: boolean; dehusking_rate_per_1000: string; sale_rate_per_kg: string; notes: string };

export default function StockPage() {
  const ws = useWorkspace();
  const router = useRouter();
  const settings = ws.settings ?? defaultSettings;
  const blankForm = (): StockForm => ({ entry_date: today(), processing_type: "mottai", net_weight_kg: "", wastage_percent: "0", apply_dehusking: Number(settings.husk_removal_rate_per_1000) > 0, dehusking_rate_per_1000: String(settings.husk_removal_rate_per_1000), sale_rate_per_kg: "", notes: "" });
  const [form, setForm] = useState<StockForm>(blankForm);
  const [selection, setSelection] = useState<Map<number, string>>(new Map());
  const [loadedEdit, setLoadedEdit] = useState<number | null>(null);
  const [farmerFilter, setFarmerFilter] = useState("");
  const kudumeDefault = String(settings.kudume_wastage_percent);

  const ownAllocation = useMemo(() => {
    const map = new Map<number, number>();
    if (form.id) ws.stockEntryItems.filter((item) => item.stock_entry_id === form.id).forEach((item) => map.set(item.purchase_id, Number(item.quantity_pieces)));
    return map;
  }, [ws.stockEntryItems, form.id]);

  const availableFor = (purchaseId: number) => (ws.stock.get(purchaseId)?.awaitingStockPieces ?? 0) + (ownAllocation.get(purchaseId) ?? 0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = Number(params.get("edit"));
    const preselect = Number(params.get("purchase"));
    if (editId && editId !== loadedEdit) {
      const entry = ws.stockEntries.find((item) => item.id === editId);
      if (entry) {
        const storedRate = Number(entry.dehusking_rate_per_1000 ?? 0);
        setForm({ id: entry.id, entry_date: entry.entry_date, processing_type: entry.processing_type, net_weight_kg: String(entry.net_weight_kg), wastage_percent: String(entry.wastage_percent), apply_dehusking: storedRate > 0, dehusking_rate_per_1000: String(storedRate > 0 ? storedRate : settings.husk_removal_rate_per_1000), sale_rate_per_kg: Number(entry.sale_rate_per_kg ?? 0) > 0 ? String(entry.sale_rate_per_kg) : "", notes: entry.notes ?? "" });
        setSelection(new Map(ws.stockEntryItems.filter((item) => item.stock_entry_id === editId).map((item) => [item.purchase_id, String(item.quantity_pieces)])));
        setLoadedEdit(editId);
      }
    } else if (preselect && !form.id && !selection.has(preselect)) {
      const info = ws.stock.get(preselect);
      if (info && info.awaitingStockPieces > 0.5) setSelection((current) => new Map(current).set(preselect, String(Math.round(info.awaitingStockPieces))));
    }
  }, [ws.stockEntries, ws.stockEntryItems, ws.stock, loadedEdit, form.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const candidates = useMemo(() => ws.purchases.filter((purchase) => {
    if (purchase.purchase_mode !== "quantity") return false;
    if (selection.has(purchase.id)) return true;
    if (farmerFilter && String(purchase.farmer_id) !== farmerFilter) return false;
    return availableFor(purchase.id) > 0.5;
  }), [ws.purchases, selection, farmerFilter, ws.stock, ownAllocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const allocations = useMemo(() => Array.from(selection.entries()).map(([purchase_id, pieces]) => ({ purchase_id, quantity_pieces: toNumber(pieces) })).filter((item) => item.quantity_pieces > 0), [selection]);
  const pieces = allocations.reduce((sum, item) => sum + item.quantity_pieces, 0);
  const farmerPaid = allocations.reduce((sum, item) => sum + item.quantity_pieces * (ws.stock.get(item.purchase_id)?.costPerPiece ?? 0), 0);
  const net = Math.max(toNumber(form.net_weight_kg), 0);
  const wastagePercent = form.processing_type === "kudume" ? toNumber(form.wastage_percent) : 0;
  const wastage = net * wastagePercent / 100;
  const payable = Math.max(net - wastage, 0);
  const gramsPerNut = pieces > 0 ? net / pieces * 1000 : 0;
  const dehuskingRate = form.apply_dehusking ? Math.max(toNumber(form.dehusking_rate_per_1000), 0) : 0;
  const dehuskingCost = pieces / 1000 * dehuskingRate;
  const totalCost = farmerPaid + dehuskingCost;
  const saleRate = Math.max(toNumber(form.sale_rate_per_kg), 0);
  const expectedValue = payable * saleRate;
  const expectedMargin = expectedValue - totalCost;

  function toggle(purchaseId: number, checked: boolean) {
    setSelection((current) => {
      const next = new Map(current);
      if (checked) next.set(purchaseId, String(Math.round(availableFor(purchaseId))));
      else next.delete(purchaseId);
      return next;
    });
  }

  function chooseCondition(type: ProcessingType) {
    setForm((current) => ({ ...current, processing_type: type, wastage_percent: type === "kudume" ? (current.wastage_percent === "0" ? kudumeDefault : current.wastage_percent) : "0" }));
  }

  function resetForm() {
    setForm(blankForm());
    setSelection(new Map());
    setLoadedEdit(null);
  }

  async function saveEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    if (allocations.length === 0) { ws.fail("Tick at least one per-nut purchase to weigh into stock."); return; }
    for (const item of allocations) {
      const available = availableFor(item.purchase_id);
      if (item.quantity_pieces > available + 0.001) { ws.fail(`${formatPurchaseId(item.purchase_id)} only has ${formatNumber(available, 0)} pieces waiting to be weighed.`); return; }
    }
    if (net <= 0) { ws.fail("Enter the net weight from the weighbridge."); return; }
    if (wastagePercent < 0 || wastagePercent > 100) { ws.fail("Wastage must be between 0 and 100 percent."); return; }
    ws.setSaving(true);
    const { data, error } = await supabase.rpc("save_stock_entry", {
      entry_input: { id: form.id ?? null, entry_date: form.entry_date, processing_type: form.processing_type, net_weight_kg: net, wastage_percent: wastagePercent, dehusking_rate_per_1000: dehuskingRate, sale_rate_per_kg: saleRate, notes: form.notes.trim() || null },
      items_input: allocations
    });
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify(form.id ? `${formatStockId(Number(data))} updated.` : `${formatNumber(pieces, 0)} pieces weighed into stock as ${formatStockId(Number(data))}. They can now be added to a sale.${dehuskingCost > 0 ? ` Dehusking of ${formatCurrency(dehuskingCost)} was booked under Expenses.` : ""}`);
    resetForm();
    await ws.refresh();
    router.push("/v2/stock");
  }

  async function removeEntry(entry: StockEntry, mode: "undo" | "delete") {
    if (!ws.session) return;
    const pieces = formatNumber(Number(entry.coconut_quantity), 0);
    const question = mode === "undo"
      ? `Undo ${formatStockId(entry.id)}? Its ${pieces} pieces go back to the purchase and wait to be weighed again, and the dehusking expense booked for it is removed.`
      : `Delete ${formatStockId(entry.id)} (${pieces} pieces)? The pieces go back to waiting for weighing and its dehusking expense is removed.`;
    if (!window.confirm(question)) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("stock_entries").delete().eq("id", entry.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify(mode === "undo" ? `${formatStockId(entry.id)} undone. ${pieces} pieces are back in the purchase, waiting to be weighed.` : "Stock entry deleted.");
    if (form.id === entry.id) resetForm();
    await ws.refresh();
  }

  function editEntry(entry: StockEntry) {
    ws.clearFeedback();
    setLoadedEdit(null);
    router.push(`/v2/stock?edit=${entry.id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const perNutPurchases = ws.purchases.filter((purchase) => purchase.purchase_mode === "quantity");
  const awaitingTotal = perNutPurchases.reduce((sum, purchase) => sum + (ws.stock.get(purchase.id)?.awaitingStockPieces ?? 0), 0);
  const itemsByEntry = useMemo(() => {
    const map = new Map<number, typeof ws.stockEntryItems>();
    ws.stockEntryItems.forEach((item) => map.set(item.stock_entry_id, [...(map.get(item.stock_entry_id) ?? []), item]));
    return map;
  }, [ws.stockEntryItems]);
  const farmerPaidFor = (entryId: number) => (itemsByEntry.get(entryId) ?? []).reduce((sum, item) => sum + Number(item.quantity_pieces) * (ws.stock.get(item.purchase_id)?.costPerPiece ?? 0), 0);

  return (
    <div className="stack">
      <section className="ledger-panel select-table">
        <div className="panel-heading"><div className="step-heading"><span className="step-number">1</span><div><span className="eyebrow">{form.id ? `Editing ${formatStockId(form.id)}` : "Waiting to be weighed"}</span><h2>Select per-nut purchases</h2></div></div><div className="chip-row"><span className={awaitingTotal > 0 ? "chip warn" : "chip good"}>{formatNumber(awaitingTotal, 0)} pieces waiting</span><span className="chip good">{formatNumber(pieces, 0)} pieces selected</span><span className="chip">Paid to farmers {formatCurrency(farmerPaid)}</span></div></div>
        <p className="muted-text">Per-nut purchases are bought by count, so they are dehusked and weighed here before going into a sale. Weight-based purchases skip this step and can be sold straight away.</p>
        <div className="filter-bar">
          <label>Farmer<select value={farmerFilter} onChange={(event) => setFarmerFilter(event.target.value)}><option value="">All farmers</option>{ws.farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name}</option>)}</select></label>
        </div>
        <div className="table-wrap"><table><thead><tr><th></th><th>Purchase</th><th>Date</th><th>Farmer</th><th>Coconut</th><th>Waiting</th><th>Pieces to weigh</th><th>Paid to farmer / nut</th><th>Paid for these pieces</th></tr></thead><tbody>
          {candidates.map((purchase) => {
            const available = availableFor(purchase.id);
            const selected = selection.has(purchase.id);
            const info = ws.stock.get(purchase.id);
            const selectedPieces = selected ? toNumber(selection.get(purchase.id)) : 0;
            return <tr className={selected ? "selected" : undefined} key={purchase.id}>
              <td><input type="checkbox" aria-label={`Weigh ${formatPurchaseId(purchase.id)}`} checked={selected} disabled={!selected && available <= 0.5} onChange={(event) => toggle(purchase.id, event.target.checked)} /></td>
              <td><strong>{formatPurchaseId(purchase.id)}</strong></td>
              <td>{formatDate(purchase.trade_date)}</td>
              <td>{ws.farmerById.get(purchase.farmer_id)?.name ?? "Farmer"}</td>
              <td><span className={`coconut-dot ${purchase.coconut_color}`}></span>{purchase.coconut_color}<span className="muted-text">Per nut · {Number(purchase.husk_removal_rate_per_1000) > 0 ? "dehusking deducted from farmer" : "dehusking not deducted"}</span></td>
              <td>{formatNumber(available, 0)} of {formatNumber(Number(purchase.coconut_quantity), 0)}</td>
              <td>{selected ? <input type="number" min="1" max={Math.floor(available)} step="1" value={selection.get(purchase.id) ?? ""} onChange={(event) => setSelection((current) => new Map(current).set(purchase.id, event.target.value))} /> : <span className="muted-text">-</span>}</td>
              <td>{formatCurrency(info?.costPerPiece ?? 0)}</td>
              <td className="balance-cell">{selected ? formatCurrency(selectedPieces * (info?.costPerPiece ?? 0)) : "-"}</td>
            </tr>;
          })}
        </tbody></table>{candidates.length === 0 ? <EmptyState>No per-nut purchases are waiting to be weighed. Everything bought per nut is already in stock.</EmptyState> : null}</div>
      </section>

      <section className="workspace-grid">
        <form className="tool-panel" onSubmit={saveEntry}>
          <div className="panel-heading"><div className="step-heading"><span className="step-number">2</span><div><span className="eyebrow">Stock entry</span><h2>{form.id ? "Edit weighbridge details" : "Weighbridge details"}</h2></div></div>{form.id ? <button className="link-button" onClick={() => { resetForm(); router.push("/v2/stock"); }} type="button">Cancel edit</button> : null}</div>
          <div className="form-grid">
            <label>Weighed on<input type="date" value={form.entry_date} onChange={(event) => setForm((current) => ({ ...current, entry_date: event.target.value }))} required /></label>
            <label>Net weight (kg)<input type="number" min="0.001" step="0.001" value={form.net_weight_kg} onChange={(event) => setForm((current) => ({ ...current, net_weight_kg: event.target.value }))} placeholder="Weighbridge net weight" required /><span className="field-hint">Net weight of the selected pieces after dehusking.</span></label>
          </div>
          <fieldset><legend>Coconut condition</legend><div className="segmented">{processingTypes.map((item) => <button className={form.processing_type === item.value ? "active" : ""} key={item.value} onClick={() => chooseCondition(item.value)} type="button"><strong>{item.label}</strong><span>{item.description}</span></button>)}</div></fieldset>
          {form.processing_type === "kudume" ? <label>Kudume wastage (%)<input type="number" min="0" max="100" step="0.01" value={form.wastage_percent} onChange={(event) => setForm((current) => ({ ...current, wastage_percent: event.target.value }))} /><span className="field-hint">Deducted from the net weight to get the sellable weight. Default comes from your purchase cost settings.</span></label> : null}
          <fieldset className="deduction-options"><legend>Dehusking cost</legend>
            <label className="checkbox-field"><input type="checkbox" checked={form.apply_dehusking} onChange={(event) => setForm((current) => ({ ...current, apply_dehusking: event.target.checked, dehusking_rate_per_1000: event.target.checked ? String(settings.husk_removal_rate_per_1000) : current.dehusking_rate_per_1000 }))} /><span><strong>Add dehusking cost for these pieces</strong><small>Calculated at {formatCurrency(form.apply_dehusking ? toNumber(form.dehusking_rate_per_1000) : Number(settings.husk_removal_rate_per_1000))} per 1,000 pieces from Purchase cost settings and booked automatically under Expenses, so do not add it there again. Untick when the farmer bore the dehusking.</small></span></label>
          </fieldset>
          <label>Expected sale price per kg (INR) <span className="optional">Optional</span><input type="number" min="0" step="0.01" value={form.sale_rate_per_kg} onChange={(event) => setForm((current) => ({ ...current, sale_rate_per_kg: event.target.value }))} placeholder="Rate you expect from the buyer" /><span className="field-hint">Becomes the default Rate when this stock goes into New sale. The margin there takes off the farmer cost and the dehusking booked here.</span></label>
          <label>Notes <span className="optional">Optional</span><textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Weighbridge slip number, lorry, quality note" /></label>
          <button className="primary-button" disabled={ws.saving} type="submit">{ws.saving ? "Saving..." : form.id ? "Update stock entry" : "Add to stock"}</button>
        </form>
        <aside className="side-stack">
          <section className="calculation-panel"><span className="eyebrow">Live calculation</span><h2>Stock summary</h2><dl className="calculation-list">
            <div><dt>Pieces weighed</dt><dd>{formatNumber(pieces, 0)} pieces</dd></div>
            <div><dt>Net weight</dt><dd>{formatNumber(net)} kg</dd></div>
            <div><dt>Average weight per nut</dt><dd>{pieces > 0 && net > 0 ? `${formatNumber(gramsPerNut, 1)} g / nut` : "-"}</dd></div>
            {form.processing_type === "kudume" ? <div className="calculation-deduction"><dt>Kudume wastage</dt><dd>{formatNumber(wastage)} kg ({formatNumber(wastagePercent, 2)}%)</dd></div> : null}
            <div className="calculation-total"><dt>Sellable weight</dt><dd>{formatNumber(payable)} kg</dd></div>
            <div className="calculation-deduction"><dt>Paid to farmers for these pieces</dt><dd>{formatCurrency(farmerPaid)}</dd></div>
            <div className="calculation-deduction"><dt>Dehusking cost</dt><dd>{formatCurrency(dehuskingCost)}</dd></div>
            <div className="calculation-total"><dt>Total cost of this stock</dt><dd>{formatCurrency(totalCost)}</dd></div>
            <div><dt>Cost per nut</dt><dd>{pieces > 0 ? `${formatCurrency(totalCost / pieces)} / nut` : "-"}</dd></div>
            <div><dt>Cost per kg</dt><dd>{payable > 0 ? `${formatCurrency(totalCost / payable)} / kg` : "-"}</dd></div>
            {saleRate > 0 ? <><div className="calculation-credit"><dt>Expected sale value</dt><dd>{formatCurrency(expectedValue)}</dd></div><div className={expectedMargin >= 0 ? "calculation-credit" : "calculation-deduction"}><dt>Expected margin at {formatCurrency(saleRate)} / kg</dt><dd>{formatCurrency(expectedMargin)}</dd></div></> : null}
          </dl><p className="field-hint">Paid to farmers is taken from the purchase entries, after any deductions made there. Dehusking is what you pay at stock time. Together they are the cost of this stock before transport and other expenses.</p></section>
          <section className="tool-panel"><span className="eyebrow">Workflow</span><h2>Per-nut to lorry</h2><p className="muted-text">Buy per nut, dehusk, weigh the coconuts here, then build the lorry load in Sales. Husk you keep from these purchases is sold under Husk sale.</p><Link className="secondary-button" href="/v2/sales/new">Go to New sale</Link></section>
        </aside>
      </section>

      <section className="ledger-panel">
        <div className="panel-heading"><div><span className="eyebrow">History</span><h2>Stock entries</h2></div></div>
        <div className="table-wrap"><table><thead><tr><th>Entry</th><th>Weighed on</th><th>Condition</th><th>Pieces</th><th>Net weight</th><th>Sellable weight</th><th>Avg weight per nut</th><th>Paid to farmers</th><th>Dehusking</th><th>Total cost</th><th>Sale price</th><th>From purchases</th><th>Actions</th></tr></thead><tbody>
          {ws.stockEntries.map((entry) => {
            const items = itemsByEntry.get(entry.id) ?? [];
            const entryPieces = Number(entry.coconut_quantity) || 0;
            const paid = farmerPaidFor(entry.id);
            const dehusking = Number(entry.dehusking_cost ?? 0);
            return <tr key={entry.id}>
              <td><strong>{formatStockId(entry.id)}</strong>{entry.notes ? <span className="muted-text">{entry.notes}</span> : null}</td>
              <td>{formatDate(entry.entry_date)}</td>
              <td>{entry.processing_type === "kudume" ? "Kudume" : "Mottai"}{Number(entry.wastage_percent) > 0 ? <span className="muted-text">{entry.wastage_percent}% wastage</span> : null}</td>
              <td>{formatNumber(entryPieces, 0)}</td>
              <td>{formatNumber(Number(entry.net_weight_kg))} kg</td>
              <td>{formatNumber(Number(entry.payable_weight_kg))} kg</td>
              <td>{entryPieces > 0 ? `${formatNumber(Number(entry.net_weight_kg) / entryPieces * 1000, 1)} g` : "-"}</td>
              <td className="balance-cell">{formatCurrency(paid)}</td>
              <td className="balance-cell">{formatCurrency(dehusking)}{dehusking > 0 ? <span className="muted-text">{formatCurrency(Number(entry.dehusking_rate_per_1000))} / 1,000</span> : null}</td>
              <td className="amount-cell">{formatCurrency(paid + dehusking)}{Number(entry.payable_weight_kg) > 0 ? <span className="muted-text">{formatCurrency((paid + dehusking) / Number(entry.payable_weight_kg))} / kg</span> : null}</td>
              <td>{Number(entry.sale_rate_per_kg) > 0 ? `${formatCurrency(Number(entry.sale_rate_per_kg))} / kg` : <span className="muted-text">-</span>}</td>
              <td><div className="chip-row">{items.map((item) => <Link className="chip" href={`/v2/purchases?focus=${item.purchase_id}`} key={item.id}>{formatPurchaseId(item.purchase_id)} · {formatNumber(Number(item.quantity_pieces), 0)}</Link>)}</div></td>
              <td><div className="row-actions"><button className="secondary-button" onClick={() => editEntry(entry)} type="button">Edit</button><button className="secondary-button" disabled={ws.saving} onClick={() => removeEntry(entry, "undo")} type="button">Undo</button><button className="danger-button" disabled={ws.saving} onClick={() => removeEntry(entry, "delete")} type="button">Delete</button></div></td>
            </tr>;
          })}
        </tbody></table>{ws.stockEntries.length === 0 ? <EmptyState>No stock entries yet.</EmptyState> : null}</div>
      </section>

      <Panel eyebrow="Stock position" title="Per-nut purchases">
        <div className="table-wrap"><table><thead><tr><th>Purchase</th><th>Farmer</th><th>Bought</th><th>In stock</th><th>Waiting</th><th>Sold</th><th>Sellable now</th></tr></thead><tbody>
          {perNutPurchases.map((purchase) => {
            const info = ws.stock.get(purchase.id);
            if (!info) return null;
            return <tr key={purchase.id}><td><Link href={`/v2/purchases?focus=${purchase.id}`}>{formatPurchaseId(purchase.id)}</Link><span className="muted-text">{formatDate(purchase.trade_date)}</span></td><td>{ws.farmerById.get(purchase.farmer_id)?.name ?? "Farmer"}</td><td>{formatNumber(Number(purchase.coconut_quantity), 0)}</td><td>{formatNumber(info.stockedPieces, 0)}{info.kgPerPiece > 0 ? <span className="muted-text">{formatNumber(info.kgPerPiece * 1000, 1)} g / nut</span> : null}</td><td>{info.awaitingStockPieces > 0.5 ? <span className="chip warn">{formatNumber(info.awaitingStockPieces, 0)}</span> : <span className="muted-text">0</span>}</td><td>{formatNumber(info.soldPieces, 0)}</td><td>{info.sellablePieces > 0.5 ? <span className="chip good">{formatNumber(info.sellablePieces, 0)}</span> : <span className="muted-text">0</span>}</td></tr>;
          })}
        </tbody></table>{perNutPurchases.length === 0 ? <EmptyState>No per-nut purchases recorded yet.</EmptyState> : null}</div>
      </Panel>
    </div>
  );
}
