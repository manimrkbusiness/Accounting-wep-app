"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { toNumber } from "../lib/format";
import type { PurchaseMode, TraderSettings } from "../lib/types";

export const defaultSettings: TraderSettings = { trader_id: "", purchase_mode: "weight", husk_removal_rate_per_1000: 1100, tree_collection_rate_per_1000: 1450, husk_price_per_piece: 0, kudume_wastage_percent: 3 };

type SettingsForm = { purchaseMode: PurchaseMode; huskRemoval: string; treeCollection: string; huskPrice: string; kudumeWastage: string };

const formFrom = (settings: TraderSettings): SettingsForm => ({
  purchaseMode: settings.purchase_mode,
  huskRemoval: String(settings.husk_removal_rate_per_1000),
  treeCollection: String(settings.tree_collection_rate_per_1000),
  huskPrice: String(settings.husk_price_per_piece),
  kudumeWastage: String(settings.kudume_wastage_percent)
});

/** The protected trader defaults, shown beside purchase and stock forms. */
export function CostSettingsPanel({ onSaved, description }: { onSaved?: (settings: TraderSettings) => void; description?: string }) {
  const ws = useWorkspace();
  const settings = ws.settings ?? defaultSettings;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SettingsForm>(() => formFrom(settings));

  useEffect(() => {
    if (ws.settings) setForm(formFrom(ws.settings));
  }, [ws.settings]);

  async function save() {
    if (!ws.session) return;
    const huskRemoval = toNumber(form.huskRemoval);
    const treeCollection = toNumber(form.treeCollection);
    const huskPrice = toNumber(form.huskPrice);
    const kudumeWastage = toNumber(form.kudumeWastage);
    if ([huskRemoval, treeCollection, huskPrice, kudumeWastage].some((value) => value < 0) || kudumeWastage > 100) { ws.fail("Enter valid non-negative rates and a wastage percentage from 0 to 100."); return; }
    ws.setSaving(true);
    const { data, error } = await supabase.from("trader_settings").upsert({ trader_id: ws.session.user.id, purchase_mode: form.purchaseMode, husk_removal_rate_per_1000: huskRemoval, tree_collection_rate_per_1000: treeCollection, husk_price_per_piece: huskPrice, kudume_wastage_percent: kudumeWastage }).select("*").single();
    ws.setSaving(false);
    if (error || !data) { ws.fail(error?.message || "Unable to save purchase settings."); return; }
    setEditing(false);
    ws.notify("Purchase cost settings saved for future records.");
    onSaved?.(data as TraderSettings);
    await ws.refresh();
  }

  return (
    <section className="tool-panel settings-panel">
      <div className="panel-heading"><div><span className="eyebrow">Protected defaults</span><h2>Purchase cost settings</h2></div>{editing ? <button className="link-button" onClick={() => { setEditing(false); setForm(formFrom(settings)); }} type="button">Cancel</button> : <button className="secondary-button" onClick={() => setEditing(true)} type="button">Edit</button>}</div>
      <p className="muted-text">{description ?? "These defaults are used for new purchases and stock entries and saved with each record."}</p>
      <div className="settings-grid">
        <label>Default purchase method<select value={form.purchaseMode} disabled={!editing} onChange={(event) => setForm((current) => ({ ...current, purchaseMode: event.target.value as PurchaseMode }))}><option value="weight">Weight-based / weighbridge</option><option value="quantity">Quantity-based / per nut</option></select></label>
        <label>Dehusking deduction / 1,000<input type="number" min="0" step="0.01" value={form.huskRemoval} disabled={!editing} onChange={(event) => setForm((current) => ({ ...current, huskRemoval: event.target.value }))} /></label>
        <label>Coconut harvesting deduction / 1,000<input type="number" min="0" step="0.01" value={form.treeCollection} disabled={!editing} onChange={(event) => setForm((current) => ({ ...current, treeCollection: event.target.value }))} /></label>
        <label>Husk / Mattai price per nut (weight-based)<input type="number" min="0" step="0.01" value={form.huskPrice} disabled={!editing} onChange={(event) => setForm((current) => ({ ...current, huskPrice: event.target.value }))} /></label>
        <label>Kudume wastage % (weight-based)<input type="number" min="0" max="100" step="0.01" value={form.kudumeWastage} disabled={!editing} onChange={(event) => setForm((current) => ({ ...current, kudumeWastage: event.target.value }))} /></label>
      </div>
      {editing ? <button className="primary-button" disabled={ws.saving} onClick={save} type="button">Save settings</button> : null}
    </section>
  );
}
