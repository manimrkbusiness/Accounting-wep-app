"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { supabase } from "../../../supabaseClient";
import { useWorkspace } from "../../lib/workspace";
import { draftKey, queryNumber, useDraft } from "../../lib/useDraft";
import { DraftNotice } from "../../components/DraftNotice";
import { calculatePurchase } from "../../lib/calc";
import { formatCurrency, formatNumber, formatPurchaseId, today, toNumber } from "../../lib/format";
import { coconutColors, processingTypes, type CoconutColor, type PaymentStatus, type Purchase, type PurchaseMode, type TraderSettings } from "../../lib/types";
import { defaultSettings } from "../../components/CostSettingsPanel";

type PurchaseForm = {
  id?: number;
  farmer_id: string;
  location_id: string;
  trade_date: string;
  coconut_color: CoconutColor;
  purchase_mode: PurchaseMode;
  processing_type: "mottai" | "kudume";
  coconut_quantity: string;
  dehusking_pieces: string;
  harvesting_pieces: string;
  net_weight_kg: string;
  wastage_percent: string;
  rate_per_kg: string;
  rate_per_piece: string;
  husk_removal_rate_per_1000: string;
  tree_collection_rate_per_1000: string;
  husk_price_per_piece: string;
  deduct_dehusking: boolean;
  deduct_harvesting: boolean;
  advance_amount: string;
  additional_credit_amount: string;
  additional_credit_reason: string;
  additional_debit_amount: string;
  additional_debit_reason: string;
  notes: string;
};

function blankForm(settings: TraderSettings): PurchaseForm {
  return {
    farmer_id: "",
    location_id: "",
    trade_date: today(),
    coconut_color: "green",
    purchase_mode: settings.purchase_mode,
    processing_type: "mottai",
    coconut_quantity: "",
    dehusking_pieces: "",
    harvesting_pieces: "",
    net_weight_kg: "",
    wastage_percent: "0",
    rate_per_kg: "",
    rate_per_piece: "",
    husk_removal_rate_per_1000: String(settings.husk_removal_rate_per_1000),
    tree_collection_rate_per_1000: String(settings.tree_collection_rate_per_1000),
    husk_price_per_piece: String(settings.husk_price_per_piece),
    deduct_dehusking: Number(settings.husk_removal_rate_per_1000) > 0,
    deduct_harvesting: Number(settings.tree_collection_rate_per_1000) > 0,
    advance_amount: "0",
    additional_credit_amount: "0",
    additional_credit_reason: "",
    additional_debit_amount: "0",
    additional_debit_reason: "",
    notes: ""
  };
}

function formFromPurchase(purchase: Purchase, settings: TraderSettings): PurchaseForm {
  // A deduction that was unchecked is stored as a 0 rate. Load the current default
  // instead, so ticking the box on edit applies a real deduction.
  const dehuskingRate = Number(purchase.husk_removal_rate_per_1000) > 0 ? purchase.husk_removal_rate_per_1000 : settings.husk_removal_rate_per_1000;
  const harvestingRate = Number(purchase.tree_collection_rate_per_1000) > 0 ? purchase.tree_collection_rate_per_1000 : settings.tree_collection_rate_per_1000;
  return {
    id: purchase.id,
    farmer_id: String(purchase.farmer_id),
    location_id: purchase.location_id ? String(purchase.location_id) : "",
    trade_date: purchase.trade_date,
    coconut_color: purchase.coconut_color,
    purchase_mode: purchase.purchase_mode,
    processing_type: purchase.processing_type,
    coconut_quantity: String(purchase.coconut_quantity),
    dehusking_pieces: purchase.dehusking_pieces != null ? String(purchase.dehusking_pieces) : "",
    harvesting_pieces: purchase.harvesting_pieces != null ? String(purchase.harvesting_pieces) : "",
    net_weight_kg: String(purchase.net_weight_kg),
    wastage_percent: String(purchase.wastage_percent),
    rate_per_kg: String(purchase.rate_per_kg),
    rate_per_piece: String(purchase.rate_per_piece ?? 0),
    husk_removal_rate_per_1000: String(dehuskingRate),
    tree_collection_rate_per_1000: String(harvestingRate),
    husk_price_per_piece: String(purchase.husk_price_per_piece ?? 0),
    deduct_dehusking: Number(purchase.husk_removal_rate_per_1000) > 0,
    deduct_harvesting: Number(purchase.tree_collection_rate_per_1000) > 0,
    advance_amount: String(purchase.advance_amount),
    additional_credit_amount: String(purchase.additional_credit_amount ?? 0),
    additional_credit_reason: purchase.additional_credit_reason ?? "",
    additional_debit_amount: String(purchase.additional_debit_amount ?? 0),
    additional_debit_reason: purchase.additional_debit_reason ?? "",
    notes: purchase.notes ?? ""
  };
}

export default function NewPurchasePage() {
  const ws = useWorkspace();
  const router = useRouter();
  const settings = ws.settings ?? defaultSettings;
  // The form is kept as a draft until saved, so moving to another page does not lose it.
  const [draftScope, setDraftScope] = useState(() => draftKey(ws.session?.user.id, "purchase", queryNumber("edit")));
  const draft = useDraft<PurchaseForm>(draftScope, () => blankForm(settings));
  const form = draft.value;
  const setForm = draft.setValue;
  const [loadedEdit, setLoadedEdit] = useState<number | null>(null);
  const [showCredit, setShowCredit] = useState(() => toNumber(draft.value.additional_credit_amount) > 0);
  const [showDebit, setShowDebit] = useState(() => toNumber(draft.value.additional_debit_amount) > 0);
  const [rateEditor, setRateEditor] = useState<"dehusking" | "harvesting" | null>(null);
  const [rateDraft, setRateDraft] = useState("");
  const farmerParamApplied = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = Number(params.get("edit"));
    const farmerParam = Number(params.get("farmer"));
    if (editId && editId !== loadedEdit) {
      const purchase = ws.purchaseById.get(editId);
      if (purchase) {
        if (!draft.wasRestored) {
          setForm(formFromPurchase(purchase, ws.settings ?? defaultSettings));
          setShowCredit(Number(purchase.additional_credit_amount) > 0);
          setShowDebit(Number(purchase.additional_debit_amount) > 0);
        }
        setLoadedEdit(editId);
      }
    } else if (!editId && !form.id && ws.settings && !draft.wasRestored) {
      setForm((current) => current.coconut_quantity || current.farmer_id ? current : blankForm(ws.settings ?? defaultSettings));
    }
    // Coming back from "+ Add farmer": select the farmer that was just added.
    if (farmerParam && !farmerParamApplied.current && ws.farmerById.has(farmerParam)) {
      farmerParamApplied.current = true;
      setForm((current) => current.farmer_id === String(farmerParam) ? current : { ...current, farmer_id: String(farmerParam), location_id: "" });
    }
  }, [ws.purchaseById, ws.farmerById, ws.settings, loadedEdit, form.id, draft.wasRestored, setForm]);

  function discardDraft() {
    draft.clear(blankForm(settings));
    setShowCredit(false);
    setShowDebit(false);
    setLoadedEdit(null);
  }

  const calculation = useMemo(() => calculatePurchase(form), [form]);
  const farmerLocations = useMemo(() => ws.locations.filter((location) => location.farmer_id === Number(form.farmer_id)), [ws.locations, form.farmer_id]);
  const allocated = form.id ? ws.stock.get(form.id)?.soldPieces ?? 0 : 0;

  async function savePurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    if (!form.farmer_id || !form.location_id) { ws.fail("Choose a farmer and farming location."); return; }
    if (calculation.quantity <= 0) { ws.fail("Enter the coconut quantity in pieces so labor costs can be calculated."); return; }
    if (form.id && calculation.quantity + 0.001 < allocated) { ws.fail(`${formatNumber(allocated, 0)} pieces of this purchase are already in sales. Reduce those sales first.`); return; }
    if (calculation.purchaseMode === "weight") {
      if (calculation.net <= 0) { ws.fail("Enter the net weight in kilograms from the weighbridge."); return; }
      if (!form.rate_per_kg || toNumber(form.rate_per_kg) < 0) { ws.fail("Enter the purchase rate per kilogram."); return; }
    } else if (!form.rate_per_piece || toNumber(form.rate_per_piece) < 0) { ws.fail("Enter the purchase rate per coconut."); return; }
    if (calculation.advance > calculation.total) { ws.fail("Advance cannot be greater than the calculated purchase amount."); return; }
    const creditReason = form.additional_credit_reason.trim();
    const debitReason = form.additional_debit_reason.trim();
    if (calculation.additionalCredit > 0 && !creditReason) { ws.fail("Add a reason for the additional credit."); return; }
    if (calculation.additionalDebit > 0 && !debitReason) { ws.fail("Add a reason for the additional debit."); return; }
    if (calculation.additionalDebit > calculation.total - calculation.advance + calculation.additionalCredit) { ws.fail("Additional debit cannot be greater than the amount still payable."); return; }
    const paymentStatus: PaymentStatus = calculation.balance <= 0 ? "paid" : calculation.advance > 0 ? "partial" : "pending";
    ws.setSaving(true);
    const payload = {
      trader_id: ws.session.user.id,
      farmer_id: Number(form.farmer_id),
      location_id: Number(form.location_id),
      trade_date: form.trade_date,
      coconut_color: form.coconut_color,
      purchase_mode: calculation.purchaseMode,
      processing_type: calculation.purchaseMode === "quantity" ? "mottai" : form.processing_type,
      coconut_quantity: calculation.quantity,
      dehusking_pieces: form.deduct_dehusking && form.dehusking_pieces.trim() ? calculation.dehuskingPieces : null,
      harvesting_pieces: form.deduct_harvesting && form.harvesting_pieces.trim() ? calculation.harvestingPieces : null,
      net_weight_kg: calculation.purchaseMode === "weight" ? calculation.net : 0,
      wastage_percent: calculation.purchaseMode === "weight" && form.processing_type === "kudume" ? calculation.wastagePercent : 0,
      rate_per_kg: calculation.purchaseMode === "weight" ? toNumber(form.rate_per_kg) : 0,
      rate_per_piece: calculation.purchaseMode === "quantity" ? toNumber(form.rate_per_piece) : 0,
      husk_removal_rate_per_1000: form.deduct_dehusking ? toNumber(form.husk_removal_rate_per_1000) : 0,
      tree_collection_rate_per_1000: form.deduct_harvesting ? toNumber(form.tree_collection_rate_per_1000) : 0,
      husk_price_per_piece: calculation.purchaseMode === "weight" ? toNumber(form.husk_price_per_piece) : 0,
      advance_amount: calculation.advance,
      additional_credit_amount: calculation.additionalCredit,
      additional_credit_reason: calculation.additionalCredit > 0 ? creditReason : null,
      additional_debit_amount: calculation.additionalDebit,
      additional_debit_reason: calculation.additionalDebit > 0 ? debitReason : null,
      payment_status: paymentStatus,
      notes: form.notes.trim() || null
    };
    const result = form.id
      ? await supabase.from("coconut_trades").update(payload).eq("id", form.id).eq("trader_id", ws.session.user.id)
      : await supabase.from("coconut_trades").insert(payload);
    ws.setSaving(false);
    if (result.error) { ws.fail(result.error.message); return; }
    draft.clear(blankForm(settings));
    ws.notify(form.id ? "Purchase updated." : "Purchase recorded. It is now in stock and ready to be added to a sale.");
    await ws.refresh();
    router.push("/v2/purchases");
  }

  const setField = <K extends keyof PurchaseForm>(key: K, value: PurchaseForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  function openRateEditor(kind: "dehusking" | "harvesting") {
    setRateDraft(kind === "dehusking" ? form.husk_removal_rate_per_1000 : form.tree_collection_rate_per_1000);
    setRateEditor(kind);
  }

  /** Applies the rate to this purchase only. The default in Settings is not touched. */
  function saveRate(kind: "dehusking" | "harvesting") {
    const value = toNumber(rateDraft);
    if (value < 0) { ws.fail("Enter a rate of 0 or more."); return; }
    if (kind === "dehusking") setForm((current) => ({ ...current, husk_removal_rate_per_1000: String(value), deduct_dehusking: value > 0 }));
    else setForm((current) => ({ ...current, tree_collection_rate_per_1000: String(value), deduct_harvesting: value > 0 }));
    setRateEditor(null);
    ws.notify(`${kind === "dehusking" ? "Dehusking" : "Coconut harvesting"} rate changed for this purchase only. Your default in Settings is unchanged.`);
  }

  const deductionCard = (kind: "dehusking" | "harvesting") => {
    const checked = kind === "dehusking" ? form.deduct_dehusking : form.deduct_harvesting;
    const rate = toNumber(kind === "dehusking" ? form.husk_removal_rate_per_1000 : form.tree_collection_rate_per_1000);
    const label = kind === "dehusking" ? "Deduct dehusking" : "Deduct coconut harvesting";
    const piecesField = kind === "dehusking" ? "dehusking_pieces" : "harvesting_pieces";
    const laborPieces = kind === "dehusking" ? calculation.dehuskingPieces : calculation.harvestingPieces;
    const cost = kind === "dehusking" ? calculation.huskRemovalCost : calculation.treeCollectionCost;
    return (
      <div className="deduction-card" key={kind}>
        <label className="checkbox-field"><input type="checkbox" checked={checked} onChange={(event) => setField(kind === "dehusking" ? "deduct_dehusking" : "deduct_harvesting", event.target.checked)} /><span><strong>{label}</strong><small>Trader pays this labor and subtracts it from the farmer amount.</small></span></label>
        {checked ? <label>{kind === "dehusking" ? "Pieces dehusked" : "Pieces harvested by the team"} <span className="optional">Blank = all {formatNumber(calculation.quantity, 0)} pieces</span><input type="number" min="0" step="1" value={form[piecesField]} onChange={(event) => setField(piecesField, event.target.value)} placeholder={calculation.quantity > 0 ? formatNumber(calculation.quantity, 0) : "Same as coconut quantity"} /><span className="field-hint">{kind === "dehusking" ? "Pieces the dehusking team handled, including any dropped coconuts the farmer added. The husk credit and your husk in hand follow this count." : "Only the pieces the harvesting team took from the trees. Naturally dropped coconuts are not counted here."}</span></label> : null}
        <div className="rate-line"><span>{formatCurrency(rate)} per 1,000 pieces{checked && laborPieces > 0 ? ` · ${formatNumber(laborPieces, 0)} pieces · ${formatCurrency(cost)} deducted` : ""}</span>{rateEditor === kind ? null : <button className="secondary-button rate-edit-button" onClick={() => openRateEditor(kind)} type="button"><Pencil size={14} strokeWidth={2.2} aria-hidden="true" />Edit rate</button>}</div>
        {rateEditor === kind ? <div className="inline-form"><label>{label} rate per 1,000 pieces (INR)<input type="number" min="0" step="0.01" value={rateDraft} onChange={(event) => setRateDraft(event.target.value)} autoFocus /></label><div className="row-actions"><button className="primary-button" disabled={ws.saving} onClick={() => saveRate(kind)} type="button">Save rate</button><button className="link-button" onClick={() => setRateEditor(null)} type="button">Cancel</button></div><span className="field-hint">Applies to this purchase only, for example a special rate for this farmer. The default in Settings stays as it is.</span></div> : null}
      </div>
    );
  };

  return (
    <>
    <DraftNotice show={draft.restored} what="purchase" onDiscard={discardDraft} />
    <section className="workspace-grid">
      <form className="tool-panel purchase-form" onSubmit={savePurchase}>
        <div className="panel-heading"><div><span className="eyebrow">{form.id ? formatPurchaseId(form.id) : "New record"}</span><h2>{form.id ? "Edit purchase" : "Record coconut purchase"}</h2></div>{form.id ? <button className="link-button" onClick={() => { discardDraft(); setDraftScope(draftKey(ws.session?.user.id, "purchase", null)); router.push("/v2/purchases/new"); }} type="button">Cancel edit</button> : null}</div>
        {form.id && allocated > 0 ? <p className="mode-note">{formatNumber(allocated, 0)} pieces of this purchase are already allocated to sales. Those sales are not changed when you edit this record.</p> : null}
        <div className="form-grid">
          <label>Farmer<select value={form.farmer_id} onChange={(event) => { const value = event.target.value; if (value === "__add__") { router.push("/v2/farmers?returnTo=purchase"); return; } setForm((current) => ({ ...current, farmer_id: value, location_id: "" })); }} required><option value="__add__">+ Add farmer</option><option value="">Select a farmer</option>{ws.farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name} - {farmer.phone}</option>)}</select></label>
          <label>Farming location<select value={form.location_id} onChange={(event) => setField("location_id", event.target.value)} required><option value="">Select location</option>{farmerLocations.map((location) => <option key={location.id} value={location.id}>{location.location_name}{location.city ? `, ${location.city}` : ""}</option>)}</select></label>
          <label>Purchase date<input type="date" value={form.trade_date} onChange={(event) => setField("trade_date", event.target.value)} required /></label>
          <label>Coconut colour<select value={form.coconut_color} onChange={(event) => setField("coconut_color", event.target.value as CoconutColor)}>{coconutColors.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Purchase method<select value={form.purchase_mode} onChange={(event) => { const value = event.target.value as PurchaseMode; setForm((current) => ({ ...current, purchase_mode: value, processing_type: value === "quantity" ? "mottai" : current.processing_type, wastage_percent: value === "quantity" ? "0" : current.processing_type === "kudume" ? String(settings.kudume_wastage_percent) : "0" })); }}><option value="weight">Weight-based / weighbridge</option><option value="quantity">Quantity-based / per nut</option></select><span className="field-hint">{form.purchase_mode === "quantity" ? "Pay by individual coconut using a per-nut price. The husk stays with you to sell." : "Pay by payable kilograms after weighbridge deductions. Husk credit is paid to the farmer."}</span></label>
        </div>
        {form.purchase_mode === "weight" ? <fieldset><legend>Coconut preparation</legend><div className="segmented">{processingTypes.map((item) => <button className={form.processing_type === item.value ? "active" : ""} key={item.value} onClick={() => setForm((current) => ({ ...current, processing_type: item.value, wastage_percent: item.value === "kudume" ? (current.wastage_percent === "0" ? String(settings.kudume_wastage_percent) : current.wastage_percent) : "0" }))} type="button"><strong>{item.label}</strong><span>{item.description}</span></button>)}</div></fieldset> : <p className="mode-note">Quantity-based purchases use individual coconut pieces and do not use Mottai, Kudume wastage, Husk / Mattai credit, or weighbridge fields.</p>}
        <div className="form-grid">
          <label>Coconut quantity (pieces)<input type="number" min="1" step="1" value={form.coconut_quantity} onChange={(event) => setField("coconut_quantity", event.target.value)} required /><span className="field-hint">{form.purchase_mode === "weight" ? "Labor is deducted per 1,000 pieces; husk credit is added per nut." : "Labor deductions are calculated per 1,000 pieces."}</span></label>
          {form.purchase_mode === "weight" ? <label>Net weight (kg)<input type="number" min="0.001" step="0.001" value={form.net_weight_kg} onChange={(event) => setField("net_weight_kg", event.target.value)} placeholder="Weighbridge net weight" required /><span className="field-hint">Wastage and payable weight are calculated from the net weight.</span></label> : null}
          {form.purchase_mode === "weight" ? <label>Rate per kg (INR)<input type="number" min="0" step="0.01" value={form.rate_per_kg} onChange={(event) => setField("rate_per_kg", event.target.value)} required /></label> : <label>Price per coconut (INR)<input type="number" min="0" step="0.01" value={form.rate_per_piece} onChange={(event) => setField("rate_per_piece", event.target.value)} required /><span className="field-hint">The purchase total is pieces multiplied by this price.</span></label>}
          <label>Advance paid (INR)<input type="number" min="0" step="0.01" value={form.advance_amount} onChange={(event) => setField("advance_amount", event.target.value)} /><span className="field-hint">Later settlements are recorded from Purchase history.</span></label>
        </div>
        <fieldset className="deduction-options"><legend>Farmer deductions</legend><div className="checkbox-grid">{deductionCard("dehusking")}{deductionCard("harvesting")}</div><span className="field-hint">Leave a deduction unchecked when the trader bears that cost. Each deduction is worked out on its own piece count; the main coconut quantity above is what goes into stock and the lorry. Rates come from Settings; Edit rate changes them for this purchase only.</span></fieldset>
        <div className="adjustment-actions"><button className="adjustment-toggle credit" onClick={() => { setShowCredit(true); setField("additional_credit_amount", form.additional_credit_amount === "0" ? "" : form.additional_credit_amount); }} type="button">+ Add credit to farmer</button><button className="adjustment-toggle debit" onClick={() => { setShowDebit(true); setField("additional_debit_amount", form.additional_debit_amount === "0" ? "" : form.additional_debit_amount); }} type="button">- Add debit to farmer</button></div>
        {showCredit || toNumber(form.additional_credit_amount) > 0 ? <div className="adjustment-fields credit-fields"><label>Credit amount (INR)<input type="number" min="0" step="0.01" value={form.additional_credit_amount} onChange={(event) => setField("additional_credit_amount", event.target.value)} /></label><label>Why is this being credited?<input value={form.additional_credit_reason} onChange={(event) => setField("additional_credit_reason", event.target.value)} placeholder="Reason for additional payment" /></label></div> : null}
        {showDebit || toNumber(form.additional_debit_amount) > 0 ? <div className="adjustment-fields debit-fields"><label>Debit amount (INR)<input type="number" min="0" step="0.01" value={form.additional_debit_amount} onChange={(event) => setField("additional_debit_amount", event.target.value)} /></label><label>Why is this being deducted?<input value={form.additional_debit_reason} onChange={(event) => setField("additional_debit_reason", event.target.value)} placeholder="Reason for deduction" /></label></div> : null}
        <label>Notes <span className="optional">Optional</span><textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="Any quality, transport, or payment note" /></label>
        <button className="primary-button" disabled={ws.saving || ws.farmers.length === 0} type="submit">{ws.saving ? "Saving..." : form.id ? "Update purchase" : "Save purchase"}</button>
      </form>
      <aside className="side-stack">
        <section className="calculation-panel"><span className="eyebrow">Live calculation</span><h2>{calculation.purchaseMode === "quantity" ? "Per-nut summary" : "Weighbridge summary"}</h2><dl className="calculation-list">
          {calculation.purchaseMode === "weight" ? <><div><dt>Net weight</dt><dd>{formatNumber(calculation.net)} kg</dd></div><div><dt>Wastage</dt><dd>{formatNumber(calculation.wastage)} kg</dd></div><div><dt>Payable weight</dt><dd>{formatNumber(calculation.payable)} kg</dd></div></> : null}
          <div><dt>Coconut quantity</dt><dd>{formatNumber(calculation.quantity, 0)} pieces</dd></div>
          <div><dt>Average weight per nut</dt><dd>{calculation.purchaseMode === "weight" ? `${formatNumber(calculation.averageWeightGrams, 1)} g / nut` : "Not used"}</dd></div>
          <div><dt>Average price per nut</dt><dd>{formatCurrency(calculation.averagePricePerPiece)} / nut</dd></div>
          <div className="calculation-credit"><dt>Coconut purchase</dt><dd>{formatCurrency(calculation.coconutTotal)}</dd></div>
          <div className="calculation-deduction"><dt>Dehusking{form.deduct_dehusking && calculation.dehuskingPieces !== calculation.quantity ? ` (${formatNumber(calculation.dehuskingPieces, 0)} pieces)` : ""}</dt><dd>{formatCurrency(calculation.huskRemovalCost)}</dd></div>
          <div className="calculation-deduction"><dt>Coconut harvesting{form.deduct_harvesting && calculation.harvestingPieces !== calculation.quantity ? ` (${formatNumber(calculation.harvestingPieces, 0)} pieces)` : ""}</dt><dd>{formatCurrency(calculation.treeCollectionCost)}</dd></div>
          {calculation.purchaseMode === "weight" ? <div className="calculation-credit"><dt>Husk / Mattai credit{calculation.dehuskingPieces !== calculation.quantity ? ` (${formatNumber(calculation.dehuskingPieces, 0)} pieces)` : ""}</dt><dd>{formatCurrency(calculation.huskPriceIncome)}</dd></div> : null}
          <div className="calculation-total"><dt>Net payable to farmer</dt><dd>{formatCurrency(calculation.total)}</dd></div>
          <div><dt>Advance</dt><dd>{formatCurrency(calculation.advance)}</dd></div>
          {calculation.additionalCredit > 0 ? <div className="calculation-credit"><dt>Additional credit</dt><dd>{formatCurrency(calculation.additionalCredit)}</dd></div> : null}
          {calculation.additionalDebit > 0 ? <div className="calculation-deduction"><dt>Additional debit</dt><dd>{formatCurrency(calculation.additionalDebit)}</dd></div> : null}
          <div className="calculation-total"><dt>Balance to pay</dt><dd>{formatCurrency(calculation.balance)}</dd></div>
        </dl><p className="field-hint">{calculation.purchaseMode === "weight" ? `Husk / Mattai credit is ${formatCurrency(toNumber(form.husk_price_per_piece))} per nut (from Settings) on the ${formatNumber(calculation.dehuskingPieces, 0)} dehusked pieces. ` : ""}Green credits increase the farmer amount; red deductions reduce it.</p></section>
      </aside>
    </section>
    </>
  );
}
