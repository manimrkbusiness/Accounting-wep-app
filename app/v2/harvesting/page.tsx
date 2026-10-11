"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { inRange } from "../lib/calc";
import { formatCurrency, formatDate, formatNumber, formatPurchaseId, today, toNumber } from "../lib/format";
import type { HarvestingEntry } from "../lib/types";
import { draftKey, useDraft } from "../lib/useDraft";
import { DraftNotice } from "../components/DraftNotice";
import { EmptyState, PeriodPicker, periodToRange, type PeriodPreset } from "../components/ui";

type EntryForm = { id?: number; harvest_date: string; farmer_id: string; location_id: string; head_employee_id: string; coconut_quantity: string; rate_per_1000: string; purchase_id: string; notes: string };

const blankEntry = (rate: string): EntryForm => ({ harvest_date: today(), farmer_id: "", location_id: "", head_employee_id: "", coconut_quantity: "", rate_per_1000: rate, purchase_id: "", notes: "" });

export default function HarvestingPage() {
  const ws = useWorkspace();
  const defaultRate = String(ws.settings?.tree_collection_rate_per_1000 ?? 1400);
  const draft = useDraft<EntryForm>(draftKey(ws.session?.user.id, "harvesting"), () => blankEntry(defaultRate));
  const form = draft.value;
  const setForm = draft.setValue;
  const [period, setPeriod] = useState<{ preset: PeriodPreset; from: string; to: string }>({ preset: "month", from: "", to: today() });
  const range = periodToRange(period.preset, period.from, period.to);

  const unlinkedPurchases = useMemo(() => {
    const linked = new Set(ws.harvestingEntries.filter((e) => e.purchase_id && e.id !== form.id).map((e) => e.purchase_id));
    return ws.purchases.filter((p) => !linked.has(p.id));
  }, [ws.purchases, ws.harvestingEntries, form.id]);

  const quantity = Math.max(toNumber(form.coconut_quantity), 0);
  const rate = Math.max(toNumber(form.rate_per_1000), 0);
  const cost = quantity / 1000 * rate;
  const head = form.head_employee_id ? ws.employeeById.get(Number(form.head_employee_id)) : null;
  const entryFarmerLocations = useMemo(() => ws.locations.filter((location) => location.farmer_id === Number(form.farmer_id)), [ws.locations, form.farmer_id]);
  const periodEntries = useMemo(() => ws.harvestingEntries.filter((e) => inRange(e.harvest_date, range)), [ws.harvestingEntries, range]);
  // History shows only harvests already tied to a purchase; pending ones sit in their own box.
  const linkedEntries = useMemo(() => periodEntries.filter((e) => e.purchase_id), [periodEntries]);
  const unlinkedEntries = useMemo(() => ws.harvestingEntries.filter((e) => !e.purchase_id).slice().sort((a, b) => (a.harvest_date < b.harvest_date ? 1 : -1)), [ws.harvestingEntries]);
  const unlinkedCost = unlinkedEntries.reduce((sum, e) => sum + Number(e.total_cost), 0);
  // Only the harvesting team leads a harvest; dehuskers and loaders are their own teams.
  const workers = ws.employees.filter((emp) => (emp.active && emp.role === "harvester") || String(emp.id) === form.head_employee_id);

  function headName(entry: HarvestingEntry) {
    if (entry.head_employee_id) return ws.employeeById.get(entry.head_employee_id)?.name ?? "Worker";
    if (entry.team_id) return ws.harvestingTeamById.get(entry.team_id)?.name ?? "Team";
    return null;
  }

  function editEntry(entry: HarvestingEntry) {
    ws.clearFeedback();
    draft.clear({ id: entry.id, harvest_date: entry.harvest_date, farmer_id: entry.farmer_id ? String(entry.farmer_id) : "", location_id: entry.location_id ? String(entry.location_id) : "", head_employee_id: entry.head_employee_id ? String(entry.head_employee_id) : "", coconut_quantity: String(entry.coconut_quantity), rate_per_1000: String(entry.rate_per_1000), purchase_id: entry.purchase_id ? String(entry.purchase_id) : "", notes: entry.notes ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    if (quantity <= 0) { ws.fail("Enter how many coconuts were harvested."); return; }
    if (rate < 0) { ws.fail("Enter a valid harvesting rate."); return; }
    ws.setSaving(true);
    const payload = {
      trader_id: ws.session.user.id,
      harvest_date: form.harvest_date,
      farmer_id: form.farmer_id ? Number(form.farmer_id) : null,
      location_id: form.location_id ? Number(form.location_id) : null,
      head_employee_id: form.head_employee_id ? Number(form.head_employee_id) : null,
      coconut_quantity: quantity,
      rate_per_1000: rate,
      purchase_id: form.purchase_id ? Number(form.purchase_id) : null,
      notes: form.notes.trim() || null
    };
    const result = form.id
      ? await supabase.from("harvesting_entries").update(payload).eq("id", form.id).eq("trader_id", ws.session.user.id)
      : await supabase.from("harvesting_entries").insert(payload);
    ws.setSaving(false);
    if (result.error) { ws.fail(result.error.message); return; }
    ws.notify(form.id ? "Harvesting entry updated." : `Harvesting recorded.${cost > 0 ? ` ${formatCurrency(cost)} booked under Expenses to pay ${head?.name ?? "the worker"}.` : ""}`);
    draft.clear(blankEntry(defaultRate));
    await ws.refresh();
  }

  async function deleteEntry(entry: HarvestingEntry) {
    if (!ws.session || !window.confirm("Delete this harvesting entry? The labor expense booked for it is removed.")) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("harvesting_entries").delete().eq("id", entry.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify("Harvesting entry deleted.");
    if (form.id === entry.id) draft.clear(blankEntry(defaultRate));
    await ws.refresh();
  }

  async function linkEntry(entry: HarvestingEntry, purchaseId: string) {
    if (!ws.session || !purchaseId) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("harvesting_entries").update({ purchase_id: Number(purchaseId) }).eq("id", entry.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify(`Harvest linked to ${formatPurchaseId(Number(purchaseId))}. It has moved into history.`);
    await ws.refresh();
  }

  return (
    <div className="stack">
      <DraftNotice show={draft.restored} what="harvesting entry" onDiscard={() => draft.clear(blankEntry(defaultRate))} />

      <section className="workspace-grid">
        <form className="tool-panel" onSubmit={saveEntry}>
          <div className="panel-heading"><div><span className="eyebrow">{form.id ? "Edit harvest" : "New harvest"}</span><h2>{form.id ? "Update harvesting entry" : "Record coconuts harvested"}</h2></div>{form.id ? <button className="link-button" onClick={() => draft.clear(blankEntry(defaultRate))} type="button">Cancel edit</button> : null}</div>
          <p className="muted-text">Record what was harvested today and who led it. The amount you pay the team head is booked automatically under Expenses. Link it to the purchase of these coconuts here or later from Purchase history.</p>
          <div className="form-grid">
            <label>Harvest date<input type="date" value={form.harvest_date} onChange={(e) => setForm((c) => ({ ...c, harvest_date: e.target.value }))} required /></label>
            <label>Harvesting team head<select value={form.head_employee_id} onChange={(e) => setForm((c) => ({ ...c, head_employee_id: e.target.value }))}><option value="">No team (just a record)</option>{workers.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}</select>{workers.length === 0 ? <span className="field-hint">No harvesting team yet. Add a worker with the <strong>Harvester</strong> role on <Link href="/v2/team">Team &amp; vehicles</Link> first.</span> : <span className="field-hint">Only your harvesting team is shown here — dehuskers and loaders are their own teams. Add more on <Link href="/v2/team">Team &amp; vehicles</Link>.</span>}</label>
            <label>Farmer <span className="optional">Optional</span><select value={form.farmer_id} onChange={(e) => setForm((c) => ({ ...c, farmer_id: e.target.value, location_id: "" }))}><option value="">No farmer selected</option>{ws.farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name} - {farmer.phone}</option>)}</select><span className="field-hint">Whose coconuts were harvested. A purchase built from this harvest is pre-filled with this farmer.</span></label>
            <label>Farming location <span className="optional">Optional</span><select value={form.location_id} onChange={(e) => setForm((c) => ({ ...c, location_id: e.target.value }))} disabled={!form.farmer_id}><option value="">{form.farmer_id ? "Select location" : "Choose a farmer first"}</option>{entryFarmerLocations.map((location) => <option key={location.id} value={location.id}>{location.location_name}{location.city ? `, ${location.city}` : ""}</option>)}</select></label>
            <label>Coconuts harvested (pieces)<input type="number" min="1" step="1" value={form.coconut_quantity} onChange={(e) => setForm((c) => ({ ...c, coconut_quantity: e.target.value }))} required /></label>
            <label>Pay rate per 1,000 pieces (INR)<input type="number" min="0" step="0.01" value={form.rate_per_1000} onChange={(e) => setForm((c) => ({ ...c, rate_per_1000: e.target.value }))} /><span className="field-hint">Pre-filled from the harvesting rate in Settings. This is what you pay.</span></label>
            <label>Link to purchase <span className="optional">Optional</span><select value={form.purchase_id} onChange={(e) => setForm((c) => ({ ...c, purchase_id: e.target.value }))}><option value="">Not linked yet</option>{unlinkedPurchases.slice(0, 100).map((p) => <option key={p.id} value={p.id}>{formatPurchaseId(p.id)} · {ws.farmerById.get(p.farmer_id)?.name ?? "Farmer"} · {formatDate(p.trade_date)} · {formatNumber(Number(p.coconut_quantity), 0)} pcs</option>)}</select><span className="field-hint">The purchase of these harvested coconuts. You can also link it later from Purchase history.</span></label>
          </div>
          <label>Notes <span className="optional">Optional</span><textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} placeholder="Trees, area, quality note" /></label>
          <button className="primary-button" disabled={ws.saving} type="submit">{ws.saving ? "Saving..." : form.id ? "Update harvest" : "Save harvest"}</button>
        </form>
        <aside className="side-stack">
          <section className="calculation-panel"><span className="eyebrow">Live calculation</span><h2>Harvest summary</h2><dl className="calculation-list">
            <div><dt>Coconuts harvested</dt><dd>{formatNumber(quantity, 0)} pieces</dd></div>
            <div><dt>Team head</dt><dd>{head?.name ?? "No worker"}</dd></div>
            <div className="calculation-deduction"><dt>Pay for this harvest<small className="formula">{formatNumber(quantity, 0)} pieces ÷ 1,000 × {formatCurrency(rate)}</small></dt><dd>{formatCurrency(cost)}</dd></div>
          </dl><p className="field-hint">This amount is booked as a harvesting-labor expense to the team head. Whether the farmer or you ultimately bear it depends on the &quot;Deduct coconut harvesting&quot; option on the purchase.</p></section>
          <section className="tool-panel"><span className="eyebrow">Harvesting team</span><h2>Who can lead a harvest</h2><p className="muted-text">Only workers with the Harvester role appear here. Add or edit them on Team &amp; vehicles.</p><div className="card-list">{ws.employees.filter((emp) => emp.active && emp.role === "harvester").slice(0, 12).map((emp) => <article key={emp.id}><div><strong>{emp.name}</strong><span>Harvester{emp.phone ? ` · ${emp.phone}` : ""}</span></div></article>)}{ws.employees.filter((emp) => emp.active && emp.role === "harvester").length === 0 ? <EmptyState>No harvesting team yet. Add a worker with the Harvester role.</EmptyState> : null}</div><Link className="secondary-button" href="/v2/team">Manage team</Link></section>
        </aside>
      </section>

      <section className="ledger-panel">
        <div className="panel-heading"><div><span className="eyebrow">Not linked / not used</span><h2>Harvests waiting for a purchase</h2></div>{unlinkedEntries.length ? <span className="chip warn">{unlinkedEntries.length} pending · {formatCurrency(unlinkedCost)}</span> : null}</div>
        <p className="muted-text">Harvests you have recorded but not yet tied to a purchase. Link one to the purchase of these coconuts, or build that purchase from it on the New purchase page. Once linked, it moves into the history below.</p>
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Farmer</th><th>Team head</th><th>Coconuts</th><th>Rate / 1,000</th><th>Paid</th><th>Link to purchase</th><th>Notes</th><th>Actions</th></tr></thead><tbody>
          {unlinkedEntries.map((entry) => <tr key={entry.id}>
            <td>{formatDate(entry.harvest_date)}</td>
            <td>{entry.farmer_id ? ws.farmerById.get(entry.farmer_id)?.name ?? "Farmer" : <span className="muted-text">-</span>}</td>
            <td>{headName(entry) ?? <span className="muted-text">-</span>}</td>
            <td>{formatNumber(Number(entry.coconut_quantity), 0)} pieces</td>
            <td>{formatCurrency(Number(entry.rate_per_1000))}</td>
            <td className="balance-cell">{formatCurrency(Number(entry.total_cost))}</td>
            <td>{unlinkedPurchases.length ? <select value="" disabled={ws.saving} onChange={(e) => linkEntry(entry, e.target.value)}><option value="">Link to…</option>{unlinkedPurchases.slice(0, 100).map((p) => <option key={p.id} value={p.id}>{formatPurchaseId(p.id)} · {ws.farmerById.get(p.farmer_id)?.name ?? "Farmer"} · {formatDate(p.trade_date)} · {formatNumber(Number(p.coconut_quantity), 0)} pcs</option>)}</select> : <span className="muted-text">No free purchase</span>}</td>
            <td>{entry.notes || "-"}</td>
            <td><div className="row-actions"><button className="secondary-button" onClick={() => editEntry(entry)} type="button">Edit</button><button className="danger-button" disabled={ws.saving} onClick={() => deleteEntry(entry)} type="button">Delete</button></div></td>
          </tr>)}
        </tbody></table>{unlinkedEntries.length === 0 ? <EmptyState>Every recorded harvest is linked to a purchase.</EmptyState> : null}</div>
      </section>

      <section className="ledger-panel">
        <div className="panel-heading"><div><span className="eyebrow">History</span><h2>Harvests linked to a purchase</h2></div><PeriodPicker preset={period.preset} from={period.from} to={period.to} onChange={setPeriod} /></div>
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Farmer</th><th>Team head</th><th>Coconuts</th><th>Rate / 1,000</th><th>Paid</th><th>Linked purchase</th><th>Notes</th><th>Actions</th></tr></thead><tbody>
          {linkedEntries.map((entry) => <tr key={entry.id}>
            <td>{formatDate(entry.harvest_date)}</td>
            <td>{entry.farmer_id ? ws.farmerById.get(entry.farmer_id)?.name ?? "Farmer" : <span className="muted-text">-</span>}</td>
            <td>{headName(entry) ?? <span className="muted-text">-</span>}</td>
            <td>{formatNumber(Number(entry.coconut_quantity), 0)} pieces</td>
            <td>{formatCurrency(Number(entry.rate_per_1000))}</td>
            <td className="balance-cell">{formatCurrency(Number(entry.total_cost))}</td>
            <td><Link className="chip good" href={`/v2/purchases?focus=${entry.purchase_id}`}>{formatPurchaseId(Number(entry.purchase_id))}</Link></td>
            <td>{entry.notes || "-"}</td>
            <td><div className="row-actions"><button className="secondary-button" onClick={() => editEntry(entry)} type="button">Edit</button><button className="danger-button" disabled={ws.saving} onClick={() => deleteEntry(entry)} type="button">Delete</button></div></td>
          </tr>)}
        </tbody></table>{linkedEntries.length === 0 ? <EmptyState>No linked harvests in this period.</EmptyState> : null}</div>
      </section>
    </div>
  );
}
