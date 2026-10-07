"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../supabaseClient";
import { useWorkspace } from "../../lib/workspace";
import { calculatePurchase } from "../../lib/calc";
import { formatCurrency, formatNumber, formatPurchaseId, today, toNumber } from "../../lib/format";
import { coconutColors, processingTypes, type CoconutColor, type PaymentStatus, type Purchase, type PurchaseMode, type TraderSettings } from "../../lib/types";

type PurchaseForm = {
  id?: number;
  farmer_id: string;
  location_id: string;
  trade_date: string;
  coconut_color: CoconutColor;
  purchase_mode: PurchaseMode;
  processing_type: "mottai" | "kudume";
  coconut_quantity: string;
  net_weight_kg: string;
  wastage_percent: string;
  rate_per_kg: string;
  rate_per_piece: string;
  husk_removal_rate_per_1000: string;
  tree_collection_rate_per_1000: string;
  husk_price_per_1000: string;
  deduct_dehusking: boolean;
  deduct_harvesting: boolean;
  advance_amount: string;
  additional_credit_amount: string;
  additional_credit_reason: string;
  additional_debit_amount: string;
  additional_debit_reason: string;
  notes: string;
};

const defaultSettings: TraderSettings = { trader_id: "", purchase_mode: "weight", husk_removal_rate_per_1000: 1100, tree_collection_rate_per_1000: 1450, husk_price_per_1000: 0, kudume_wastage_percent: 3 };

function blankForm(settings: TraderSettings): PurchaseForm {
  return {
    farmer_id: "",
    location_id: "",
    trade_date: today(),
    coconut_color: "green",
    purchase_mode: settings.purchase_mode,
    processing_type: "mottai",
    coconut_quantity: "",
    net_weight_kg: "",
    wastage_percent: "0",
    rate_per_kg: "",
    rate_per_piece: "",
    husk_removal_rate_per_1000: String(settings.husk_removal_rate_per_1000),
    tree_collection_rate_per_1000: String(settings.tree_collection_rate_per_1000),
    husk_price_per_1000: String(settings.husk_price_per_1000),
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

function formFromPurchase(purchase: Purchase): PurchaseForm {
  return {
    id: purchase.id,
    farmer_id: String(purchase.farmer_id),
    location_id: purchase.location_id ? String(purchase.location_id) : "",
    trade_date: purchase.trade_date,
    coconut_color: purchase.coconut_color,
    purchase_mode: purchase.purchase_mode,
    processing_type: purchase.processing_type,
    coconut_quantity: String(purchase.coconut_quantity),
    net_weight_kg: String(purchase.net_weight_kg),
    wastage_percent: String(purchase.wastage_percent),
    rate_per_kg: String(purchase.rate_per_kg),
    rate_per_piece: String(purchase.rate_per_piece ?? 0),
    husk_removal_rate_per_1000: String(purchase.husk_removal_rate_per_1000),
    tree_collection_rate_per_1000: String(purchase.tree_collection_rate_per_1000),
    husk_price_per_1000: String(purchase.husk_price_per_1000 ?? 0),
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
  const [form, setForm] = useState<PurchaseForm>(() => blankForm(settings));
  const [loadedEdit, setLoadedEdit] = useState<number | null>(null);
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ purchaseMode: settings.purchase_mode, huskRemoval: String(settings.husk_removal_rate_per_1000), treeCollection: String(settings.tree_collection_rate_per_1000), huskPrice: String(settings.husk_price_per_1000), kudumeWastage: String(settings.kudume_wastage_percent) });
  const [showCredit, setShowCredit] = useState(false);
  const [showDebit, setShowDebit] = useState(false);

  useEffect(() => {
    const editId = Number(new URLSearchParams(window.location.search).get("edit"));
    if (editId && editId !== loadedEdit) {
      const purchase = ws.purchaseById.get(editId);
      if (purchase) {
        setForm(formFromPurchase(purchase));
        setShowCredit(Number(purchase.additional_credit_amount) > 0);
        setShowDebit(Number(purchase.additional_debit_amount) > 0);
        setLoadedEdit(editId);
      }
    } else if (!editId && !form.id && ws.settings) {
      setForm((current) => current.coconut_quantity || current.farmer_id ? current : blankForm(ws.settings ?? defaultSettings));
    }
  }, [ws.purchaseById, ws.settings, loadedEdit, form.id]);

  useEffect(() => {
    if (ws.settings) setSettingsForm({ purchaseMode: ws.settings.purchase_mode, huskRemoval: String(ws.settings.husk_removal_rate_per_1000), treeCollection: String(ws.settings.tree_collection_rate_per_1000), huskPrice: String(ws.settings.husk_price_per_1000), kudumeWastage: String(ws.settings.kudume_wastage_percent) });
  }, [ws.settings]);

  const calculation = useMemo(() => calculatePurchase(form), [form]);
  const farmerLocations = useMemo(() => ws.locations.filter((location) => location.farmer_id === Number(form.farmer_id)), [ws.locations, form.farmer_id]);
  const allocated = form.id ? ws.stock.get(form.id)?.soldPieces ?? 0 : 0;

  async function saveSettings() {
    if (!ws.session) return;
    const huskRemoval = toNumber(settingsForm.huskRemoval);
    const treeCollection = toNumber(settingsForm.treeCollection);
    const huskPrice = toNumber(settingsForm.huskPrice);
    const kudumeWastage = toNumber(settingsForm.kudumeWastage);
    if ([huskRemoval, treeCollection, huskPrice, kudumeWastage].some((value) => value < 0) || kudumeWastage > 100) { ws.fail("Enter valid non-negative rates and a wastage percentage from 0 to 100."); return; }
    ws.setSaving(true);
    const { error } = await supabase.from("trader_settings").upsert({ trader_id: ws.session.user.id, purchase_mode: settingsForm.purchaseMode, husk_removal_rate_per_1000: huskRemoval, tree_collection_rate_per_1000: treeCollection, husk_price_per_1000: huskPrice, kudume_wastage_percent: kudumeWastage });
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    setEditingSettings(false);
    if (!form.id) setForm((current) => ({ ...current, purchase_mode: settingsForm.purchaseMode, wastage_percent: current.processing_type === "kudume" ? String(kudumeWastage) : "0", husk_removal_rate_per_1000: String(huskRemoval), tree_collection_rate_per_1000: String(treeCollection), husk_price_per_1000: String(huskPrice), deduct_dehusking: huskRemoval > 0, deduct_harvesting: treeCollection > 0 }));
    ws.notify("Purchase settings saved for future records.");
    await ws.refresh();
  }

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
      net_weight_kg: calculation.purchaseMode === "weight" ? calculation.net : 0,
      wastage_percent: calculation.purchaseMode === "weight" && form.processing_type === "kudume" ? calculation.wastagePercent : 0,
      rate_per_kg: calculation.purchaseMode === "weight" ? toNumber(form.rate_per_kg) : 0,
      rate_per_piece: calculation.purchaseMode === "quantity" ? toNumber(form.rate_per_piece) : 0,
      husk_removal_rate_per_1000: form.deduct_dehusking ? toNumber(form.husk_removal_rate_per_1000) : 0,
      tree_collection_rate_per_1000: form.deduct_harvesting ? toNumber(form.tree_collection_rate_per_1000) : 0,
      husk_price_per_1000: calculation.purchaseMode === "weight" ? toNumber(form.husk_price_per_1000) : 0,
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
    ws.notify(form.id ? "Purchase updated." : "Purchase recorded. It is now in stock and ready to be added to a sale.");
    await ws.refresh();
    router.push("/v2/purchases");
  }

  const setField = <K extends keyof PurchaseForm>(key: K, value: PurchaseForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <section className="workspace-grid">
      <form className="tool-panel purchase-form" onSubmit={savePurchase}>
        <div className="panel-heading"><div><span className="eyebrow">{form.id ? formatPurchaseId(form.id) : "New record"}</span><h2>{form.id ? "Edit purchase" : "Record coconut purchase"}</h2></div>{form.id ? <button className="link-button" onClick={() => { setForm(blankForm(settings)); setLoadedEdit(null); router.push("/v2/purchases/new"); }} type="button">Cancel edit</button> : null}</div>
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
          <label>Coconut quantity (pieces)<input type="number" min="1" step="1" value={form.coconut_quantity} onChange={(event) => setField("coconut_quantity", event.target.value)} required /><span className="field-hint">{form.purchase_mode === "weight" ? "Labor and Mattai credit are calculated per 1,000 pieces." : "Labor deductions are calculated per 1,000 pieces."}</span></label>
          {form.purchase_mode === "weight" ? <label>Net weight (kg)<input type="number" min="0.001" step="0.001" value={form.net_weight_kg} onChange={(event) => setField("net_weight_kg", event.target.value)} placeholder="Weighbridge net weight" required /><span className="field-hint">Wastage and payable weight are calculated from the net weight.</span></label> : null}
          {form.purchase_mode === "weight" ? <label>Rate per kg (INR)<input type="number" min="0" step="0.01" value={form.rate_per_kg} onChange={(event) => setField("rate_per_kg", event.target.value)} required /></label> : <label>Price per coconut (INR)<input type="number" min="0" step="0.01" value={form.rate_per_piece} onChange={(event) => setField("rate_per_piece", event.target.value)} required /><span className="field-hint">The purchase total is pieces multiplied by this price.</span></label>}
          {form.purchase_mode === "weight" ? <label>Husk / Mattai price per 1,000 (INR)<input type="number" min="0" step="0.01" value={form.husk_price_per_1000} onChange={(event) => setField("husk_price_per_1000", event.target.value)} /><span className="field-hint">Credit added to the farmer for husk.</span></label> : null}
          <label>Advance paid (INR)<input type="number" min="0" step="0.01" value={form.advance_amount} onChange={(event) => setField("advance_amount", event.target.value)} /><span className="field-hint">Later settlements are recorded from Purchase history.</span></label>
        </div>
        <fieldset className="deduction-options"><legend>Farmer deductions</legend><div className="checkbox-grid"><label className="checkbox-field"><input type="checkbox" checked={form.deduct_dehusking} onChange={(event) => setField("deduct_dehusking", event.target.checked)} /><span><strong>Deduct dehusking</strong><small>Trader pays this labor and subtracts it from the farmer amount.</small></span></label><label className="checkbox-field"><input type="checkbox" checked={form.deduct_harvesting} onChange={(event) => setField("deduct_harvesting", event.target.checked)} /><span><strong>Deduct coconut harvesting</strong><small>Trader pays this labor and subtracts it from the farmer amount.</small></span></label></div><span className="field-hint">Leave a deduction unchecked when the trader bears that cost. Record the wages you actually pay under Expenses.</span></fieldset>
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
          <div className="calculation-deduction"><dt>Dehusking</dt><dd>{formatCurrency(calculation.huskRemovalCost)}</dd></div>
          <div className="calculation-deduction"><dt>Coconut harvesting</dt><dd>{formatCurrency(calculation.treeCollectionCost)}</dd></div>
          {calculation.purchaseMode === "weight" ? <div className="calculation-credit"><dt>Husk / Mattai credit</dt><dd>{formatCurrency(calculation.huskPriceIncome)}</dd></div> : null}
          <div className="calculation-total"><dt>Net payable to farmer</dt><dd>{formatCurrency(calculation.total)}</dd></div>
          <div><dt>Advance</dt><dd>{formatCurrency(calculation.advance)}</dd></div>
          {calculation.additionalCredit > 0 ? <div className="calculation-credit"><dt>Additional credit</dt><dd>{formatCurrency(calculation.additionalCredit)}</dd></div> : null}
          {calculation.additionalDebit > 0 ? <div className="calculation-deduction"><dt>Additional debit</dt><dd>{formatCurrency(calculation.additionalDebit)}</dd></div> : null}
          <div className="calculation-total"><dt>Balance to pay</dt><dd>{formatCurrency(calculation.balance)}</dd></div>
        </dl><p className="field-hint">Green credits increase the farmer amount; red deductions reduce it. Husk / Mattai credit and Kudume wastage apply to weight-based purchases only.</p></section>
        <section className="tool-panel settings-panel"><div className="panel-heading"><div><span className="eyebrow">Protected defaults</span><h2>Purchase cost settings</h2></div>{editingSettings ? <button className="link-button" onClick={() => setEditingSettings(false)} type="button">Cancel</button> : <button className="secondary-button" onClick={() => setEditingSettings(true)} type="button">Edit</button>}</div><p className="muted-text">These defaults are used for new purchases and saved with each invoice.</p><div className="settings-grid">
          <label>Default purchase method<select value={settingsForm.purchaseMode} disabled={!editingSettings} onChange={(event) => setSettingsForm((current) => ({ ...current, purchaseMode: event.target.value as PurchaseMode }))}><option value="weight">Weight-based / weighbridge</option><option value="quantity">Quantity-based / per nut</option></select></label>
          <label>Dehusking deduction / 1,000<input type="number" min="0" step="0.01" value={settingsForm.huskRemoval} disabled={!editingSettings} onChange={(event) => setSettingsForm((current) => ({ ...current, huskRemoval: event.target.value }))} /></label>
          <label>Coconut harvesting deduction / 1,000<input type="number" min="0" step="0.01" value={settingsForm.treeCollection} disabled={!editingSettings} onChange={(event) => setSettingsForm((current) => ({ ...current, treeCollection: event.target.value }))} /></label>
          <label>Husk / Mattai price / 1,000 (weight-based)<input type="number" min="0" step="0.01" value={settingsForm.huskPrice} disabled={!editingSettings} onChange={(event) => setSettingsForm((current) => ({ ...current, huskPrice: event.target.value }))} /></label>
          <label>Kudume wastage % (weight-based)<input type="number" min="0" max="100" step="0.01" value={settingsForm.kudumeWastage} disabled={!editingSettings} onChange={(event) => setSettingsForm((current) => ({ ...current, kudumeWastage: event.target.value }))} /></label>
        </div>{editingSettings ? <button className="primary-button" disabled={ws.saving} onClick={saveSettings} type="button">Save settings</button> : null}</section>
      </aside>
    </section>
  );
}
