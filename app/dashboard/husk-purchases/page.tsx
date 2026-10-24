"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { draftKey, queryNumber, useDraft } from "../lib/useDraft";
import { DraftNotice } from "../components/DraftNotice";
import { formatCurrency, formatDate, formatNumber, formatPurchaseId, today, toNumber } from "../lib/format";
import { huskColors, type HuskColor, type PaymentStatus, type Purchase } from "../lib/types";
import { EmptyState } from "../components/ui";
import { defaultSettings } from "../components/CostSettingsPanel";

type HuskPurchaseForm = {
  id?: number;
  farmer_id: string;
  location_id: string;
  trade_date: string;
  husk_color: HuskColor;
  husk_pieces: string;
  husk_price_per_piece: string;
  advance_amount: string;
  notes: string;
};

export default function HuskPurchasesPage() {
  const ws = useWorkspace();
  const router = useRouter();
  const settings = ws.settings ?? defaultSettings;
  const huskDefaultPrice = (color: HuskColor) => color === "green" ? Number(settings.husk_price_green_per_piece) : Number(settings.husk_price_brown_per_piece);

  const blankForm = (): HuskPurchaseForm => ({
    farmer_id: "",
    location_id: "",
    trade_date: today(),
    husk_color: "green",
    husk_pieces: "",
    husk_price_per_piece: huskDefaultPrice("green") > 0 ? String(huskDefaultPrice("green")) : "",
    advance_amount: "0",
    notes: ""
  });

  const [draftScope, setDraftScope] = useState(() => draftKey(ws.session?.user.id, "husk-purchase", queryNumber("edit")));
  const draft = useDraft<HuskPurchaseForm>(draftScope, blankForm);
  const form = draft.value;
  const setForm = draft.setValue;
  const setField = <K extends keyof HuskPurchaseForm>(key: K, value: HuskPurchaseForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const farmerParamApplied = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(params.get("returnTo"));
    const farmerParam = Number(params.get("farmer"));
    if (farmerParam && !farmerParamApplied.current && ws.farmerById.has(farmerParam)) {
      farmerParamApplied.current = true;
      setForm((current) => current.farmer_id === String(farmerParam) ? current : { ...current, farmer_id: String(farmerParam), location_id: "" });
    }
  }, [ws.farmerById, setForm]);

  const farmerLocations = useMemo(() => ws.locations.filter((location) => location.farmer_id === Number(form.farmer_id)), [ws.locations, form.farmer_id]);
  const huskPieces = Math.max(Math.round(toNumber(form.husk_pieces)), 0);
  const price = Math.max(toNumber(form.husk_price_per_piece), 0);
  const total = huskPieces * price;
  const advance = Math.max(toNumber(form.advance_amount), 0);
  const balance = total - advance;

  const huskPurchases = useMemo(() => ws.purchases.filter((purchase) => purchase.husk_only), [ws.purchases]);

  function resetForm() {
    draft.clear(blankForm());
    setDraftScope(draftKey(ws.session?.user.id, "husk-purchase", null));
  }

  function editPurchase(purchase: Purchase) {
    ws.clearFeedback();
    draft.clear({
      id: purchase.id,
      farmer_id: String(purchase.farmer_id),
      location_id: purchase.location_id ? String(purchase.location_id) : "",
      trade_date: purchase.trade_date,
      husk_color: purchase.husk_color ?? "green",
      husk_pieces: purchase.husk_pieces != null ? String(purchase.husk_pieces) : "",
      husk_price_per_piece: String(purchase.husk_price_per_piece ?? 0),
      advance_amount: String(purchase.advance_amount ?? 0),
      notes: purchase.notes ?? ""
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    if (!form.farmer_id) { ws.fail("Choose the farmer you bought the husk from."); return; }
    if (huskPieces <= 0) { ws.fail("Enter how many husk pieces you bought."); return; }
    if (price <= 0) { ws.fail("Enter the husk price per piece."); return; }
    if (advance > total) { ws.fail("Advance paid cannot be more than the husk total."); return; }
    const paymentStatus: PaymentStatus = balance <= 0 ? "paid" : advance > 0 ? "partial" : "pending";
    const payload = {
      trader_id: ws.session.user.id,
      farmer_id: Number(form.farmer_id),
      location_id: form.location_id ? Number(form.location_id) : null,
      trade_date: form.trade_date,
      coconut_color: form.husk_color,
      purchase_mode: "weight",
      processing_type: "mottai",
      coconut_quantity: 0,
      net_weight_kg: 0,
      wastage_percent: 0,
      rate_per_kg: 0,
      rate_per_piece: 0,
      dehusking_pieces: null,
      harvesting_pieces: null,
      husk_removal_rate_per_1000: 0,
      tree_collection_rate_per_1000: 0,
      husk_price_per_piece: price,
      buys_husk: true,
      husk_color: form.husk_color,
      husk_pieces: huskPieces,
      husk_only: true,
      additional_credit_amount: 0,
      additional_debit_amount: 0,
      advance_amount: advance,
      payment_status: paymentStatus,
      notes: form.notes.trim() || null
    };
    ws.setSaving(true);
    let savedId = form.id ?? null;
    let saveError: string | null = null;
    if (form.id) {
      const { error } = await supabase.from("coconut_trades").update(payload).eq("id", form.id).eq("trader_id", ws.session.user.id);
      saveError = error?.message ?? null;
    } else {
      const { data, error } = await supabase.from("coconut_trades").insert(payload).select("id").single();
      saveError = error?.message ?? null;
      savedId = (data as { id: number } | null)?.id ?? null;
    }
    ws.setSaving(false);
    if (saveError) { ws.fail(saveError); return; }
    ws.notify(form.id ? "Husk purchase updated." : `Husk purchase recorded. ${formatNumber(huskPieces, 0)} ${form.husk_color} husk pieces are ready for a husk sale.`);
    resetForm();
    await ws.refresh();
    if (returnTo === "husk-sale") router.push("/dashboard/husk-sales");
  }

  async function deletePurchase(purchase: Purchase) {
    const sold = ws.husk.get(purchase.id)?.huskSoldPieces ?? 0;
    if (sold > 0) { ws.fail(`${formatPurchaseId(purchase.id)} already has husk in a sale. Remove it from the husk sale first.`); return; }
    if (!window.confirm(`Delete husk purchase ${formatPurchaseId(purchase.id)}?`)) return;
    if (!ws.session) return;
    ws.setSaving(true);
    const { error } = await supabase.from("coconut_trades").delete().eq("id", purchase.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify(`Husk purchase ${formatPurchaseId(purchase.id)} deleted.`);
    await ws.refresh();
  }

  return (
    <>
    <DraftNotice show={draft.restored} what="husk purchase" onDiscard={resetForm} />
    <section className="workspace-grid">
      <form className="tool-panel" onSubmit={save}>
        <div className="panel-heading"><div><span className="eyebrow">{form.id ? formatPurchaseId(form.id) : "New record"}</span><h2>{form.id ? "Edit husk purchase" : "Record husk purchase"}</h2></div><div className="row-actions">{form.id || form.farmer_id || form.husk_pieces ? <button className="secondary-button" onClick={resetForm} type="button">{form.id ? "Cancel edit" : "Clear"}</button> : null}</div></div>
        <p className="muted-text">Husk bought straight from a farmer, without any coconut. It goes into your husk stock and can be sold on the Husk sale page.</p>
        <div className="form-grid">
          <label>Farmer<select value={form.farmer_id} onChange={(event) => { const value = event.target.value; if (value === "__add__") { router.push("/dashboard/farmers?returnTo=husk-purchase"); return; } setForm((current) => value === current.farmer_id ? current : ({ ...current, farmer_id: value, location_id: "" })); }} required><option value="__add__">+ Add farmer</option><option value="">Select a farmer</option>{ws.farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name} - {farmer.phone}</option>)}</select></label>
          <label>Farming location <span className="optional">Optional</span><select value={form.location_id} onChange={(event) => setField("location_id", event.target.value)}><option value="">No location</option>{farmerLocations.map((location) => <option key={location.id} value={location.id}>{location.location_name}{location.city ? `, ${location.city}` : ""}</option>)}</select></label>
          <label>Purchase date<input type="date" value={form.trade_date} onChange={(event) => setField("trade_date", event.target.value)} required /></label>
          <label>Husk colour<select value={form.husk_color} onChange={(event) => { const color = event.target.value as HuskColor; setForm((current) => ({ ...current, husk_color: color, husk_price_per_piece: huskDefaultPrice(color) > 0 ? String(huskDefaultPrice(color)) : current.husk_price_per_piece })); }}>{huskColors.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Husk pieces<input type="number" min="1" step="1" value={form.husk_pieces} onChange={(event) => setField("husk_pieces", event.target.value)} placeholder="How many husk pieces" required /></label>
          <label>Price per piece (INR)<input type="number" min="0" step="0.01" value={form.husk_price_per_piece} onChange={(event) => setField("husk_price_per_piece", event.target.value)} required /><span className="field-hint">Default from Settings by colour. This is paid to the farmer.</span></label>
          <label>Advance paid (INR)<input type="number" min="0" step="0.01" value={form.advance_amount} onChange={(event) => setField("advance_amount", event.target.value)} /></label>
        </div>
        <label>Notes <span className="optional">Optional</span><textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="Quality, transport or payment note" /></label>
        {ws.error ? <p className="error-message form-error" role="alert">{ws.error}</p> : null}
        <button className="primary-button" disabled={ws.saving || ws.farmers.length === 0} type="submit">{ws.saving ? "Saving..." : form.id ? "Update husk purchase" : "Save husk purchase"}</button>
      </form>
      <aside className="side-stack">
        <section className="calculation-panel"><span className="eyebrow">Live calculation</span><h2>Husk purchase summary</h2><dl className="calculation-list">
          <div><dt>Husk pieces</dt><dd>{formatNumber(huskPieces, 0)} pieces</dd></div>
          <div className="calculation-total"><dt>Paid to farmer<small className="formula">{formatNumber(huskPieces, 0)} pieces × {formatCurrency(price)}</small></dt><dd>{formatCurrency(total)}</dd></div>
          <div><dt>Advance</dt><dd>{formatCurrency(advance)}</dd></div>
          <div className="calculation-total"><dt>Balance to pay<small className="formula">{formatCurrency(total)} − {formatCurrency(advance)}</small></dt><dd>{formatCurrency(balance)}</dd></div>
        </dl><p className="field-hint">This husk is added to your husk stock as {form.husk_color} husk and can be picked on the Husk sale page.</p></section>
      </aside>
    </section>
    <section className="ledger-panel">
      <div className="panel-heading"><div><span className="eyebrow">History</span><h2>Husk purchases</h2></div></div>
      {huskPurchases.length === 0 ? <EmptyState>No husk purchases yet. Record husk bought directly from a farmer above.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>Purchase</th><th>Date</th><th>Farmer</th><th>Husk</th><th>Pieces</th><th>Price</th><th>Total</th><th>In hand</th><th>Actions</th></tr></thead><tbody>
        {huskPurchases.map((purchase) => {
          const info = ws.husk.get(purchase.id);
          return <tr key={purchase.id}>
            <td><strong>{formatPurchaseId(purchase.id)}</strong></td>
            <td>{formatDate(purchase.trade_date)}</td>
            <td>{ws.farmerById.get(purchase.farmer_id)?.name ?? "Farmer"}</td>
            <td><span className={`coconut-dot ${purchase.husk_color ?? "brown"}`}></span>{purchase.husk_color ?? "-"} husk</td>
            <td>{formatNumber(Number(purchase.husk_pieces ?? 0), 0)}</td>
            <td>{formatCurrency(Number(purchase.husk_price_per_piece))}</td>
            <td className="amount-cell">{formatCurrency(Number(purchase.total_amount))}</td>
            <td>{formatNumber(info?.huskInHand ?? 0, 0)}{info && info.huskSoldPieces > 0 ? <span className="muted-text">{formatNumber(info.huskSoldPieces, 0)} sold</span> : null}</td>
            <td><div className="row-actions">
              <button className="secondary-button" onClick={() => editPurchase(purchase)} type="button">Edit</button>
              <button className="danger-button" disabled={ws.saving} onClick={() => deletePurchase(purchase)} type="button">Delete</button>
            </div></td>
          </tr>;
        })}
      </tbody></table></div>}
    </section>
    </>
  );
}
