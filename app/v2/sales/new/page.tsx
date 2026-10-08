"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../supabaseClient";
import { useWorkspace } from "../../lib/workspace";
import { allocationCost, calculateSale } from "../../lib/calc";
import { addDays, formatCurrency, formatDate, formatNumber, formatPurchaseId, formatSaleId, today, toNumber } from "../../lib/format";
import { type PaymentStatus, type ProcessingType, type Purchase, type Sale, type SaleColor, type SaleKind, type SaleUnit } from "../../lib/types";

type SaleForm = {
  id?: number;
  buyer_id: string;
  sale_date: string;
  coconut_color: SaleColor;
  processing_type: ProcessingType;
  unit: SaleUnit;
  quantity: string;
  rate: string;
  gross_weight_kg: string;
  empty_weight_kg: string;
  transport_charge: string;
  deduction_amount: string;
  deduction_reason: string;
  advance_amount: string;
  vehicle_id: string;
  vehicle_number: string;
  notes: string;
};

const blankForm = (): SaleForm => ({
  buyer_id: "",
  sale_date: today(),
  coconut_color: "green",
  processing_type: "mottai",
  unit: "kg",
  quantity: "",
  rate: "",
  gross_weight_kg: "",
  empty_weight_kg: "",
  transport_charge: "0",
  deduction_amount: "0",
  deduction_reason: "",
  advance_amount: "0",
  vehicle_id: "",
  vehicle_number: "",
  notes: ""
});

function formFromSale(sale: Sale): SaleForm {
  return {
    id: sale.id,
    buyer_id: String(sale.buyer_id),
    sale_date: sale.sale_date,
    coconut_color: sale.coconut_color,
    processing_type: sale.processing_type === "mixed" ? "mottai" : sale.processing_type,
    unit: sale.unit,
    quantity: String(sale.quantity),
    rate: String(sale.rate),
    gross_weight_kg: sale.gross_weight_kg != null ? String(sale.gross_weight_kg) : "",
    empty_weight_kg: sale.empty_weight_kg != null ? String(sale.empty_weight_kg) : "",
    transport_charge: String(sale.transport_charge),
    deduction_amount: String(sale.deduction_amount),
    deduction_reason: sale.deduction_reason ?? "",
    advance_amount: String(sale.advance_amount),
    vehicle_id: sale.vehicle_id ? String(sale.vehicle_id) : "",
    vehicle_number: sale.vehicle_number ?? "",
    notes: sale.notes ?? ""
  };
}

export default function NewSalePage() {
  const ws = useWorkspace();
  const router = useRouter();
  const [kind, setKind] = useState<SaleKind>("coconut");
  const [form, setForm] = useState<SaleForm>(blankForm);
  const [selection, setSelection] = useState<Map<number, string>>(new Map());
  const [loadedEdit, setLoadedEdit] = useState<number | null>(null);
  const [useGrossTare, setUseGrossTare] = useState(false);
  const [filters, setFilters] = useState({ from: addDays(today(), -60), to: today(), farmer: "", onlyStock: true });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = Number(params.get("edit"));
    if (editId && editId !== loadedEdit) {
      const sale = ws.saleById.get(editId);
      if (sale) {
        setKind(sale.sale_kind);
        setForm(formFromSale(sale));
        setUseGrossTare(sale.gross_weight_kg != null && Number(sale.gross_weight_kg) > 0);
        const items = ws.saleItems.filter((item) => item.sale_id === editId);
        setSelection(new Map(items.map((item) => [item.purchase_id, String(item.quantity_pieces)])));
        if (items.length) {
          const dates = items.map((item) => ws.purchaseById.get(item.purchase_id)?.trade_date).filter((value): value is string => Boolean(value)).sort();
          if (dates.length) setFilters((current) => ({ ...current, from: dates[0] < current.from ? dates[0] : current.from, onlyStock: false }));
        }
        setLoadedEdit(editId);
      }
    } else if (!editId && params.get("kind") === "husk" && !form.id) {
      setKind("husk");
    }
  }, [ws.saleById, ws.saleItems, ws.purchaseById, loadedEdit, form.id]);

  const ownAllocation = useMemo(() => {
    const map = new Map<number, number>();
    if (form.id) ws.saleItems.filter((item) => item.sale_id === form.id).forEach((item) => map.set(item.purchase_id, Number(item.quantity_pieces)));
    return map;
  }, [ws.saleItems, form.id]);

  const availableFor = (purchaseId: number) => (ws.stock.get(purchaseId)?.sellablePieces ?? 0) + (ownAllocation.get(purchaseId) ?? 0);

  const candidates = useMemo(() => ws.purchases.filter((purchase) => {
    if (selection.has(purchase.id)) return true;
    if (purchase.purchase_mode === "quantity" && (ws.stock.get(purchase.id)?.stockedPieces ?? 0) <= 0.5) return false;
    if (filters.farmer && String(purchase.farmer_id) !== filters.farmer) return false;
    if (filters.from && purchase.trade_date < filters.from) return false;
    if (filters.to && purchase.trade_date > filters.to) return false;
    if (filters.onlyStock && availableFor(purchase.id) <= 0.5) return false;
    return true;
  }), [ws.purchases, selection, filters, ws.stock, ownAllocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const allocations = useMemo(() => Array.from(selection.entries()).map(([purchase_id, pieces]) => ({ purchase_id, quantity_pieces: toNumber(pieces) })).filter((item) => item.quantity_pieces > 0), [selection]);
  const allocatedPieces = allocations.reduce((sum, item) => sum + item.quantity_pieces, 0);
  const allocatedKg = allocations.reduce((sum, item) => sum + item.quantity_pieces * (ws.stock.get(item.purchase_id)?.kgPerPiece ?? 0), 0);
  const costBasis = kind === "coconut" ? allocationCost(allocations, ws.stock) : 0;
  const calculation = useMemo(() => calculateSale(form, allocatedPieces, costBasis), [form, allocatedPieces, costBasis]);

  // Colour and condition come from the purchases in the load: the purchase itself for
  // weight-based coconut, the stock entry for per-nut coconut. Nothing to type.
  const loadMix = useMemo(() => {
    const included = allocations
      .map((item) => ({ purchase: ws.purchaseById.get(item.purchase_id), pieces: item.quantity_pieces }))
      .filter((entry): entry is { purchase: Purchase; pieces: number } => Boolean(entry.purchase));
    const colors = new Set(included.map((entry) => entry.purchase.coconut_color));
    const piecesOf = (type: ProcessingType) => included.filter((entry) => (ws.stock.get(entry.purchase.id)?.stockCondition ?? entry.purchase.processing_type) === type).reduce((sum, entry) => sum + entry.pieces, 0);
    const mottaiPieces = piecesOf("mottai");
    const kudumePieces = piecesOf("kudume");
    const condition: ProcessingType = kudumePieces > mottaiPieces ? "kudume" : "mottai";
    const color: SaleColor = included.length === 0 ? "green" : colors.size === 1 ? included[0].purchase.coconut_color : "mixed";
    return { included, mottaiPieces, kudumePieces, condition, color };
  }, [allocations, ws.purchaseById, ws.stock]);

  useEffect(() => {
    if (kind !== "coconut" || loadMix.included.length === 0) return;
    setForm((current) => current.coconut_color === loadMix.color && current.processing_type === loadMix.condition ? current : { ...current, coconut_color: loadMix.color, processing_type: loadMix.condition });
  }, [kind, loadMix]);

  useEffect(() => {
    if (!useGrossTare) return;
    const gross = toNumber(form.gross_weight_kg);
    if (gross > 0) setForm((current) => ({ ...current, quantity: String(Math.max(gross - toNumber(current.empty_weight_kg), 0)) }));
  }, [form.gross_weight_kg, form.empty_weight_kg, useGrossTare]);

  const buyers = ws.buyers.filter((buyer) => buyer.active && (kind === "husk" ? buyer.buys_husk : buyer.buys_coconut));

  function toggle(purchaseId: number, checked: boolean) {
    setSelection((current) => {
      const next = new Map(current);
      if (checked) next.set(purchaseId, String(Math.round(availableFor(purchaseId))));
      else next.delete(purchaseId);
      return next;
    });
  }

  function setPieces(purchaseId: number, value: string) {
    setSelection((current) => new Map(current).set(purchaseId, value));
  }

  const setField = <K extends keyof SaleForm>(key: K, value: SaleForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  async function saveSale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    if (!form.buyer_id) { ws.fail("Choose the buyer for this sale."); return; }
    if (kind === "coconut") {
      if (allocations.length === 0) { ws.fail("Tick at least one purchase to include in this load."); return; }
      for (const item of allocations) {
        const available = availableFor(item.purchase_id);
        if (item.quantity_pieces > available + 0.001) { ws.fail(`${formatPurchaseId(item.purchase_id)} only has ${formatNumber(available, 0)} pieces available.`); return; }
      }
    }
    if (calculation.quantity <= 0) { ws.fail(form.unit === "kg" ? "Enter the net weight sold in kilograms." : "Enter the quantity sold."); return; }
    if (!form.rate) { ws.fail("Enter the sale rate."); return; }
    if (calculation.deduction > 0 && form.deduction_reason.trim().length < 2) { ws.fail("Add a reason for the deduction."); return; }
    if (calculation.advance > calculation.total) { ws.fail("Advance received cannot be more than the sale total."); return; }
    const paymentStatus: PaymentStatus = calculation.balance <= 0 ? "paid" : calculation.advance > 0 ? "partial" : "pending";
    ws.setSaving(true);
    const { data, error } = await supabase.rpc("save_sale", {
      sale_input: {
        id: form.id ?? null,
        buyer_id: Number(form.buyer_id),
        sale_kind: kind,
        product: kind === "husk" ? "husk" : "coconut",
        sale_date: form.sale_date,
        coconut_color: kind === "husk" ? "mixed" : form.coconut_color,
        processing_type: kind === "husk" ? "mixed" : form.processing_type,
        unit: form.unit,
        quantity: calculation.quantity,
        rate: calculation.rate,
        coconut_quantity: kind === "coconut" ? allocatedPieces : 0,
        gross_weight_kg: useGrossTare && calculation.gross > 0 ? calculation.gross : null,
        empty_weight_kg: useGrossTare && calculation.gross > 0 ? calculation.empty : null,
        transport_charge: calculation.transport,
        deduction_amount: calculation.deduction,
        deduction_reason: calculation.deduction > 0 ? form.deduction_reason.trim() : null,
        advance_amount: calculation.advance,
        vehicle_id: form.vehicle_id ? Number(form.vehicle_id) : null,
        vehicle_number: form.vehicle_number.trim() || ws.vehicleById.get(Number(form.vehicle_id))?.vehicle_number || null,
        payment_status: paymentStatus,
        notes: form.notes.trim() || null
      },
      items_input: kind === "coconut" ? allocations : []
    });
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify(form.id ? `${formatSaleId(Number(data))} updated.` : `${formatSaleId(Number(data))} saved. Stock has been reduced for the included purchases.`);
    await ws.refresh();
    router.push("/v2/sales");
  }

  const unitLabel = form.unit === "kg" ? "kg" : form.unit === "piece" ? "pieces" : "loads";

  return (
    <div className="stack">
      {!form.id ? <div className="segmented sale-kind"><button className={kind === "coconut" ? "active" : ""} onClick={() => { setKind("coconut"); setForm((current) => ({ ...current, unit: "kg", buyer_id: "" })); }} type="button"><strong>Coconut load</strong><span>Sell coconut from purchases in stock</span></button><button className={kind === "husk" ? "active" : ""} onClick={() => { setKind("husk"); setForm((current) => ({ ...current, unit: "load", buyer_id: "" })); setSelection(new Map()); }} type="button"><strong>Husk sale</strong><span>Sell husk kept from your purchases</span></button></div> : null}

      {kind === "coconut" ? <section className="ledger-panel select-table">
        <div className="panel-heading"><div className="step-heading"><span className="step-number">1</span><div><span className="eyebrow">Build the load</span><h2>Select purchases going to the buyer</h2></div></div><div className="chip-row"><span className="chip good">{formatNumber(allocatedPieces, 0)} pieces selected</span>{allocatedPieces > 0 ? <span className="chip">{loadMix.mottaiPieces > 0 && loadMix.kudumePieces > 0 ? `Mottai ${formatNumber(loadMix.mottaiPieces, 0)} · Kudume ${formatNumber(loadMix.kudumePieces, 0)}` : loadMix.condition === "kudume" ? "Kudume" : "Mottai"}</span> : null}{allocatedKg > 0 ? <span className="chip">about {formatNumber(allocatedKg, 0)} kg from weighbridge purchases</span> : null}<span className="chip">Cost {formatCurrency(costBasis)}</span></div></div>
        <p className="muted-text">Tick each purchase that is being loaded. Reduce the pieces if only part of a purchase goes in this load; the rest stays in stock. Per-nut purchases appear here only after they are weighed on the <Link href="/v2/stock">Stock</Link> page.</p>
        <div className="filter-bar">
          <label>Purchased from<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
          <label>To<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
          <label>Farmer<select value={filters.farmer} onChange={(event) => setFilters((current) => ({ ...current, farmer: event.target.value }))}><option value="">All farmers</option>{ws.farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name}</option>)}</select></label>
          <label className="checkbox-field"><input type="checkbox" checked={filters.onlyStock} onChange={(event) => setFilters((current) => ({ ...current, onlyStock: event.target.checked }))} /><span><strong>Only purchases with stock</strong></span></label>
        </div>
        <div className="table-wrap"><table><thead><tr><th></th><th>Purchase</th><th>Date</th><th>Farmer</th><th>Coconut</th><th>Available</th><th>Pieces in this load</th><th>Cost / nut</th></tr></thead><tbody>
          {candidates.map((purchase) => {
            const available = availableFor(purchase.id);
            const selected = selection.has(purchase.id);
            const info = ws.stock.get(purchase.id);
            return <tr className={selected ? "selected" : available <= 0.5 ? "exhausted" : undefined} key={purchase.id}>
              <td><input type="checkbox" aria-label={`Include ${formatPurchaseId(purchase.id)}`} checked={selected} disabled={!selected && available <= 0.5} onChange={(event) => toggle(purchase.id, event.target.checked)} /></td>
              <td><strong>{formatPurchaseId(purchase.id)}</strong></td>
              <td>{formatDate(purchase.trade_date)}</td>
              <td>{ws.farmerById.get(purchase.farmer_id)?.name ?? "Farmer"}</td>
              <td><span className={`coconut-dot ${purchase.coconut_color}`}></span>{purchase.coconut_color}<span className="muted-text">{purchase.purchase_mode === "quantity" ? `${info?.stockCondition ?? "mottai"} · weighed into stock` : purchase.processing_type}</span></td>
              <td>{formatNumber(available, 0)} of {formatNumber(purchase.purchase_mode === "quantity" ? info?.stockedPieces ?? 0 : Number(purchase.coconut_quantity), 0)}{purchase.purchase_mode === "quantity" ? <span className="muted-text">in stock</span> : null}</td>
              <td>{selected ? <input type="number" min="1" max={Math.floor(available)} step="1" value={selection.get(purchase.id) ?? ""} onChange={(event) => setPieces(purchase.id, event.target.value)} /> : <span className="muted-text">-</span>}</td>
              <td>{formatCurrency(info?.coconutCostPerPiece ?? 0)}</td>
            </tr>;
          })}
        </tbody></table>{candidates.length === 0 ? <p className="empty-state">No purchases with stock match these filters. Widen the dates or record a purchase first.</p> : null}</div>
      </section> : null}

      <section className="workspace-grid">
        <form className="tool-panel" onSubmit={saveSale}>
          <div className="panel-heading"><div className="step-heading">{kind === "coconut" ? <span className="step-number">2</span> : null}<div><span className="eyebrow">{form.id ? formatSaleId(form.id) : kind === "coconut" ? "Sale entry" : "Husk sale"}</span><h2>{form.id ? "Edit sale" : kind === "coconut" ? "Buyer and weighbridge details" : "Husk sale details"}</h2></div></div>{form.id ? <button className="link-button" onClick={() => { setForm(blankForm()); setSelection(new Map()); setLoadedEdit(null); router.push("/v2/sales/new"); }} type="button">Cancel edit</button> : null}</div>
          <div className="form-grid">
            <label>Buyer<select value={form.buyer_id} onChange={(event) => { const value = event.target.value; if (value === "__add__") { router.push("/v2/buyers?returnTo=sale"); return; } setField("buyer_id", value); }} required><option value="__add__">+ Add buyer</option><option value="">Select a buyer</option>{buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}{buyer.business_name ? ` - ${buyer.business_name}` : ""}</option>)}</select>{buyers.length === 0 ? <span className="field-hint">No {kind} buyers yet. Add one from the Buyers page.</span> : null}</label>
            <label>Sale date<input type="date" value={form.sale_date} onChange={(event) => setField("sale_date", event.target.value)} required /></label>
            <label>Sold by<select value={form.unit} onChange={(event) => setField("unit", event.target.value as SaleUnit)}>{kind === "coconut" ? <><option value="kg">Weight (kg)</option><option value="piece">Pieces</option></> : <><option value="load">Load</option><option value="kg">Weight (kg)</option><option value="piece">Pieces</option></>}</select></label>
            <label>Rate (INR per {form.unit === "kg" ? "kg" : form.unit === "piece" ? "nut" : "load"})<input type="number" min="0" step="0.01" value={form.rate} onChange={(event) => setField("rate", event.target.value)} required /></label>
          </div>
          {form.unit === "kg" ? <fieldset className="deduction-options"><legend>Weighbridge weight</legend>
            <div className="form-grid">
              <label>Net weight (kg)<input type="number" min="0.001" step="0.001" value={form.quantity} onChange={(event) => setField("quantity", event.target.value)} readOnly={useGrossTare && calculation.gross > 0} required /><span className="field-hint">{useGrossTare ? "Calculated as gross minus empty weight." : "Enter the net weight from the slip, or switch to gross and empty weights."}</span></label>
              {useGrossTare ? <>
                <label>Gross weight (kg)<input type="number" min="0" step="0.001" value={form.gross_weight_kg} onChange={(event) => setField("gross_weight_kg", event.target.value)} placeholder="Loaded vehicle" /></label>
                <label>Empty / tare weight (kg)<input type="number" min="0" step="0.001" value={form.empty_weight_kg} onChange={(event) => setField("empty_weight_kg", event.target.value)} placeholder="Empty vehicle" /></label>
              </> : null}
            </div>
            <button className="link-button" onClick={() => setUseGrossTare((value) => !value)} type="button">{useGrossTare ? "Enter net weight directly instead" : "Calculate from gross and empty weight"}</button>
          </fieldset> : <label>Quantity ({unitLabel})<input type="number" min="0.01" step={form.unit === "piece" ? "1" : "0.01"} value={form.quantity} onChange={(event) => setField("quantity", event.target.value)} required />{kind === "coconut" && form.unit === "piece" && allocatedPieces > 0 && toNumber(form.quantity) !== allocatedPieces ? <button className="link-button" onClick={() => setField("quantity", String(allocatedPieces))} type="button">Use {formatNumber(allocatedPieces, 0)} allocated pieces</button> : null}</label>}
          <div className="form-grid">
            <label>Transport charged to buyer (INR)<input type="number" min="0" step="0.01" value={form.transport_charge} onChange={(event) => setField("transport_charge", event.target.value)} /><span className="field-hint">Added to the buyer bill when the buyer pays for delivery.</span></label>
            <label>Advance received (INR)<input type="number" min="0" step="0.01" value={form.advance_amount} onChange={(event) => setField("advance_amount", event.target.value)} /><span className="field-hint">Later receipts are recorded from Sales history.</span></label>
            <label>Deduction by buyer (INR) <span className="optional">Optional</span><input type="number" min="0" step="0.01" value={form.deduction_amount} onChange={(event) => setField("deduction_amount", event.target.value)} /></label>
            {calculation.deduction > 0 ? <label>Deduction reason<input value={form.deduction_reason} onChange={(event) => setField("deduction_reason", event.target.value)} placeholder="Quality, shortage, damage..." /></label> : null}
            <label>Vehicle <span className="optional">Optional</span><select value={form.vehicle_id} onChange={(event) => setField("vehicle_id", event.target.value)}><option value="">Not from your vehicles</option>{ws.vehicles.filter((vehicle) => vehicle.active).map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicle_number} ({vehicle.vehicle_type}, {vehicle.ownership})</option>)}</select></label>
            <label>Lorry number <span className="optional">Optional</span><input value={form.vehicle_number} onChange={(event) => setField("vehicle_number", event.target.value)} placeholder="TN 00 AB 0000" /></label>
          </div>
          <label>Notes <span className="optional">Optional</span><textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="Quality, market, delivery note" /></label>
          <button className="primary-button" disabled={ws.saving} type="submit">{ws.saving ? "Saving..." : form.id ? "Update sale" : "Save sale"}</button>
        </form>
        <aside className="side-stack">
          <section className="calculation-panel"><span className="eyebrow">Live calculation</span><h2>{kind === "coconut" ? "Load summary" : "Husk sale summary"}</h2><dl className="calculation-list">
            {kind === "coconut" ? <><div><dt>Pieces in load</dt><dd>{formatNumber(allocatedPieces, 0)} pieces</dd></div><div><dt>Coconut condition</dt><dd>{allocatedPieces > 0 ? (loadMix.mottaiPieces > 0 && loadMix.kudumePieces > 0 ? `${loadMix.condition === "kudume" ? "Kudume" : "Mottai"} (Mottai ${formatNumber(loadMix.mottaiPieces, 0)} · Kudume ${formatNumber(loadMix.kudumePieces, 0)})` : loadMix.condition === "kudume" ? "Kudume" : "Mottai") : "-"}</dd></div>{form.unit === "kg" ? <div><dt>Average weight per nut</dt><dd>{allocatedPieces > 0 && calculation.quantity > 0 ? `${formatNumber(calculation.averageKgPerNut * 1000, 1)} g / nut` : "-"}</dd></div> : null}<div><dt>Sale price per nut</dt><dd>{allocatedPieces > 0 ? `${formatCurrency(calculation.pricePerPiece)} / nut` : "-"}</dd></div></> : null}
            <div><dt>{form.unit === "kg" ? "Net weight" : "Quantity"}</dt><dd>{formatNumber(calculation.quantity)} {unitLabel}</dd></div>
            <div className="calculation-credit"><dt>Sale amount</dt><dd>{formatCurrency(calculation.saleAmount)}</dd></div>
            {calculation.transport > 0 ? <div className="calculation-credit"><dt>Transport charged</dt><dd>{formatCurrency(calculation.transport)}</dd></div> : null}
            {calculation.deduction > 0 ? <div className="calculation-deduction"><dt>Deduction</dt><dd>{formatCurrency(calculation.deduction)}</dd></div> : null}
            <div className="calculation-total"><dt>Buyer pays</dt><dd>{formatCurrency(calculation.total)}</dd></div>
            <div><dt>Advance received</dt><dd>{formatCurrency(calculation.advance)}</dd></div>
            <div className="calculation-total"><dt>Balance receivable</dt><dd>{formatCurrency(calculation.balance)}</dd></div>
            {kind === "coconut" ? <><div className="calculation-deduction"><dt>Cost of these coconuts</dt><dd>{formatCurrency(costBasis)}</dd></div><div className={calculation.margin >= 0 ? "calculation-credit" : "calculation-deduction"}><dt>Margin before expenses</dt><dd>{formatCurrency(calculation.margin)}</dd></div></> : null}
          </dl><p className="field-hint">{kind === "coconut" ? "Cost uses the farmer payable for the selected pieces, excluding husk credit. Loading, transport and other costs go under Expenses." : "Husk profit on the dashboard compares husk sales with husk credit paid to farmers and husk expenses."}</p></section>
          <section className="tool-panel"><span className="eyebrow">Workflow</span><h2>Before saving</h2><p className="muted-text">{kind === "coconut" ? "Tick the purchases in this lorry, enter the buyer, net weight and rate, then save. Each purchase keeps its own record and remaining stock." : "Choose the husk buyer, enter how much was sold and the rate, and record the loading wages under Expenses."}</p></section>
        </aside>
      </section>
    </div>
  );
}
