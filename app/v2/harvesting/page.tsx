"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IndianRupee, Link2Off, Trees, UsersRound } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { inRange, sumBy } from "../lib/calc";
import { formatCurrency, formatDate, formatNumber, formatPurchaseId, today, toNumber } from "../lib/format";
import type { HarvestingEntry, HarvestingTeam } from "../lib/types";
import { draftKey, useDraft } from "../lib/useDraft";
import { DraftNotice } from "../components/DraftNotice";
import { EmptyState, Metric, Panel, PeriodPicker, periodToRange, type PeriodPreset } from "../components/ui";

type EntryForm = { id?: number; harvest_date: string; team_id: string; coconut_quantity: string; rate_per_1000: string; purchase_id: string; notes: string };
type TeamForm = { id?: number; name: string; memberIds: number[] };

const blankEntry = (rate: string): EntryForm => ({ harvest_date: today(), team_id: "", coconut_quantity: "", rate_per_1000: rate, purchase_id: "", notes: "" });
const blankTeam = (): TeamForm => ({ name: "", memberIds: [] });

export default function HarvestingPage() {
  const ws = useWorkspace();
  const defaultRate = String(ws.settings?.tree_collection_rate_per_1000 ?? 1400);
  const draft = useDraft<EntryForm>(draftKey(ws.session?.user.id, "harvesting"), () => blankEntry(defaultRate));
  const form = draft.value;
  const setForm = draft.setValue;
  const [teamForm, setTeamForm] = useState<TeamForm>(blankTeam());
  const [period, setPeriod] = useState<{ preset: PeriodPreset; from: string; to: string }>({ preset: "month", from: "", to: today() });
  const range = periodToRange(period.preset, period.from, period.to);

  const membersByTeam = useMemo(() => {
    const map = new Map<number, number[]>();
    ws.harvestingTeamMembers.forEach((m) => map.set(m.team_id, [...(map.get(m.team_id) ?? []), m.employee_id]));
    return map;
  }, [ws.harvestingTeamMembers]);

  const linkedPurchaseIds = useMemo(() => new Set(ws.harvestingEntries.filter((e) => e.purchase_id && e.id !== form.id).map((e) => e.purchase_id)), [ws.harvestingEntries, form.id]);
  const unlinkedPurchases = useMemo(() => ws.purchases.filter((p) => !linkedPurchaseIds.has(p.id)), [ws.purchases, linkedPurchaseIds]);

  const quantity = Math.max(toNumber(form.coconut_quantity), 0);
  const rate = Math.max(toNumber(form.rate_per_1000), 0);
  const cost = quantity / 1000 * rate;
  const selectedTeam = form.team_id ? ws.harvestingTeamById.get(Number(form.team_id)) : null;
  const selectedTeamMembers = form.team_id ? (membersByTeam.get(Number(form.team_id)) ?? []) : [];

  const periodEntries = useMemo(() => ws.harvestingEntries.filter((e) => inRange(e.harvest_date, range)), [ws.harvestingEntries, range]);
  const totalPieces = sumBy(periodEntries, (e) => e.coconut_quantity);
  const totalPaid = sumBy(periodEntries, (e) => e.total_cost);
  const unlinkedCount = ws.harvestingEntries.filter((e) => !e.purchase_id).length;

  // ----- Team management -----
  function editTeam(team: HarvestingTeam) {
    setTeamForm({ id: team.id, name: team.name, memberIds: membersByTeam.get(team.id) ?? [] });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    if (teamForm.name.trim().length < 2) { ws.fail("Enter the team name."); return; }
    ws.setSaving(true);
    const traderId = ws.session.user.id;
    let teamId = teamForm.id ?? null;
    if (teamId) {
      const { error } = await supabase.from("harvesting_teams").update({ name: teamForm.name.trim() }).eq("id", teamId).eq("trader_id", traderId);
      if (error) { ws.setSaving(false); ws.fail(error.code === "23505" ? "A team with this name already exists." : error.message); return; }
    } else {
      const { data, error } = await supabase.from("harvesting_teams").insert({ trader_id: traderId, name: teamForm.name.trim() }).select("id").single();
      if (error || !data) { ws.setSaving(false); ws.fail(error?.code === "23505" ? "A team with this name already exists." : error?.message || "Unable to add team."); return; }
      teamId = (data as { id: number }).id;
    }
    const existing = new Set(membersByTeam.get(teamId) ?? []);
    const wanted = new Set(teamForm.memberIds);
    const toAdd = [...wanted].filter((id) => !existing.has(id));
    const toRemove = [...existing].filter((id) => !wanted.has(id));
    if (toAdd.length) {
      const { error } = await supabase.from("harvesting_team_members").insert(toAdd.map((employee_id) => ({ trader_id: traderId, team_id: teamId, employee_id })));
      if (error) { ws.setSaving(false); ws.fail(error.message); return; }
    }
    if (toRemove.length) {
      const { error } = await supabase.from("harvesting_team_members").delete().eq("team_id", teamId).in("employee_id", toRemove);
      if (error) { ws.setSaving(false); ws.fail(error.message); return; }
    }
    ws.setSaving(false);
    ws.notify(teamForm.id ? "Team updated." : "Harvesting team added.");
    setTeamForm(blankTeam());
    await ws.refresh();
  }

  async function toggleTeamActive(team: HarvestingTeam) {
    if (!ws.session) return;
    ws.setSaving(true);
    const { error } = await supabase.from("harvesting_teams").update({ active: !team.active }).eq("id", team.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify(team.active ? "Team marked inactive." : "Team reactivated.");
    await ws.refresh();
  }

  // ----- Entry management -----
  function editEntry(entry: HarvestingEntry) {
    ws.clearFeedback();
    draft.clear({ id: entry.id, harvest_date: entry.harvest_date, team_id: entry.team_id ? String(entry.team_id) : "", coconut_quantity: String(entry.coconut_quantity), rate_per_1000: String(entry.rate_per_1000), purchase_id: entry.purchase_id ? String(entry.purchase_id) : "", notes: entry.notes ?? "" });
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
      team_id: form.team_id ? Number(form.team_id) : null,
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
    ws.notify(form.id ? "Harvesting entry updated." : `Harvesting recorded.${cost > 0 ? ` ${formatCurrency(cost)} booked under Expenses to pay the team.` : ""}`);
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

  const activeTeams = ws.harvestingTeams.filter((t) => t.active || String(t.id) === form.team_id);

  return (
    <div className="stack">
      <DraftNotice show={draft.restored} what="harvesting entry" onDiscard={() => draft.clear(blankEntry(defaultRate))} />

      <section className="metrics-grid wide">
        <Metric icon={Trees} label="Harvested" value={`${formatNumber(totalPieces, 0)} pieces`} hint="This period" />
        <Metric icon={IndianRupee} label="Paid to teams" value={formatCurrency(totalPaid)} hint="Booked under Expenses" />
        <Metric icon={UsersRound} label="Active teams" value={formatNumber(ws.harvestingTeams.filter((t) => t.active).length, 0)} hint={`${ws.harvestingTeams.length} total`} />
        <Metric icon={Link2Off} label="Not linked to a purchase" value={formatNumber(unlinkedCount, 0)} hint="Harvests waiting to be matched to a purchase" />
      </section>

      <section className="workspace-grid">
        <form className="tool-panel" onSubmit={saveEntry}>
          <div className="panel-heading"><div><span className="eyebrow">{form.id ? "Edit harvest" : "New harvest"}</span><h2>{form.id ? "Update harvesting entry" : "Record coconuts harvested"}</h2></div>{form.id ? <button className="link-button" onClick={() => draft.clear(blankEntry(defaultRate))} type="button">Cancel edit</button> : null}</div>
          <p className="muted-text">Record what a team harvested today. The amount you pay the team is booked automatically under Expenses. Link it to the purchase of these coconuts here or later from Purchase history.</p>
          <div className="form-grid">
            <label>Harvest date<input type="date" value={form.harvest_date} onChange={(e) => setForm((c) => ({ ...c, harvest_date: e.target.value }))} required /></label>
            <label>Harvesting team<select value={form.team_id} onChange={(e) => setForm((c) => ({ ...c, team_id: e.target.value }))}><option value="">No team (just a record)</option>{activeTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>{ws.harvestingTeams.length === 0 ? <span className="field-hint">Add a team on the right first.</span> : null}</label>
            <label>Coconuts harvested (pieces)<input type="number" min="1" step="1" value={form.coconut_quantity} onChange={(e) => setForm((c) => ({ ...c, coconut_quantity: e.target.value }))} required /></label>
            <label>Pay rate per 1,000 pieces (INR)<input type="number" min="0" step="0.01" value={form.rate_per_1000} onChange={(e) => setForm((c) => ({ ...c, rate_per_1000: e.target.value }))} /><span className="field-hint">Pre-filled from the harvesting rate in Settings. This is what you pay the team.</span></label>
            <label>Link to purchase <span className="optional">Optional</span><select value={form.purchase_id} onChange={(e) => setForm((c) => ({ ...c, purchase_id: e.target.value }))}><option value="">Not linked yet</option>{unlinkedPurchases.slice(0, 100).map((p) => <option key={p.id} value={p.id}>{formatPurchaseId(p.id)} · {ws.farmerById.get(p.farmer_id)?.name ?? "Farmer"} · {formatDate(p.trade_date)} · {formatNumber(Number(p.coconut_quantity), 0)} pcs</option>)}</select><span className="field-hint">The purchase of these harvested coconuts. You can also link it later from Purchase history.</span></label>
          </div>
          <label>Notes <span className="optional">Optional</span><textarea value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} placeholder="Trees, area, quality note" /></label>
          <button className="primary-button" disabled={ws.saving} type="submit">{ws.saving ? "Saving..." : form.id ? "Update harvest" : "Save harvest"}</button>
        </form>
        <aside className="side-stack">
          <section className="calculation-panel"><span className="eyebrow">Live calculation</span><h2>Harvest summary</h2><dl className="calculation-list">
            <div><dt>Coconuts harvested</dt><dd>{formatNumber(quantity, 0)} pieces</dd></div>
            <div><dt>Team</dt><dd>{selectedTeam?.name ?? "No team"}</dd></div>
            <div><dt>Workers to pay</dt><dd>{selectedTeamMembers.length ? selectedTeamMembers.map((id) => ws.employeeById.get(id)?.name ?? "Worker").join(", ") : "-"}</dd></div>
            <div className="calculation-deduction"><dt>Pay to the harvesting team<small className="formula">{formatNumber(quantity, 0)} pieces ÷ 1,000 × {formatCurrency(rate)}</small></dt><dd>{formatCurrency(cost)}</dd></div>
          </dl><p className="field-hint">This amount is booked as a harvesting-labor expense. Whether the farmer or you ultimately bear it depends on the &quot;Deduct coconut harvesting&quot; option on the purchase.</p></section>
          <form className="tool-panel" onSubmit={saveTeam}>
            <div className="panel-heading"><div><span className="eyebrow">{teamForm.id ? "Edit team" : "Teams"}</span><h2>{teamForm.id ? "Update team" : "Add a harvesting team"}</h2></div>{teamForm.id ? <button className="link-button" onClick={() => setTeamForm(blankTeam())} type="button">Cancel</button> : null}</div>
            <label>Team name<input value={teamForm.name} onChange={(e) => setTeamForm((c) => ({ ...c, name: e.target.value }))} placeholder="e.g. Morning climbers" required /></label>
            <div className="field-heading"><label>Workers in this team</label><Link className="link-button" href="/v2/team">+ Add worker</Link></div>
            {ws.employees.filter((emp) => emp.active || teamForm.memberIds.includes(emp.id)).length ? <div className="checkbox-grid">{ws.employees.filter((emp) => emp.active || teamForm.memberIds.includes(emp.id)).map((emp) => <label className="checkbox-field" key={emp.id}><input type="checkbox" checked={teamForm.memberIds.includes(emp.id)} onChange={(e) => setTeamForm((c) => ({ ...c, memberIds: e.target.checked ? [...c.memberIds, emp.id] : c.memberIds.filter((id) => id !== emp.id) }))} /><span><strong>{emp.name}</strong><small>{emp.role}</small></span></label>)}</div> : <p className="field-hint">No workers yet. Add them on Team &amp; vehicles, then tick them here.</p>}
            <button className="primary-button" disabled={ws.saving} type="submit">{ws.saving ? "Saving..." : teamForm.id ? "Update team" : "Add team"}</button>
          </form>
          <Panel eyebrow="Your teams" title="Harvesting teams">
            <div className="card-list">
              {ws.harvestingTeams.map((team) => <article key={team.id}><div><strong>{team.name}{!team.active ? " (inactive)" : ""}</strong><span>{(membersByTeam.get(team.id) ?? []).map((id) => ws.employeeById.get(id)?.name ?? "Worker").join(", ") || "No workers added"}</span></div><div className="row-actions"><button className="secondary-button" onClick={() => editTeam(team)} type="button">Edit</button><button className="secondary-button" onClick={() => toggleTeamActive(team)} type="button">{team.active ? "Make inactive" : "Reactivate"}</button></div></article>)}
              {ws.harvestingTeams.length === 0 ? <EmptyState>No teams yet.</EmptyState> : null}
            </div>
          </Panel>
        </aside>
      </section>

      <section className="ledger-panel">
        <div className="panel-heading"><div><span className="eyebrow">History</span><h2>Harvesting entries</h2></div><PeriodPicker preset={period.preset} from={period.from} to={period.to} onChange={setPeriod} /></div>
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Team</th><th>Coconuts</th><th>Rate / 1,000</th><th>Paid to team</th><th>Linked purchase</th><th>Notes</th><th>Actions</th></tr></thead><tbody>
          {periodEntries.map((entry) => <tr key={entry.id}>
            <td>{formatDate(entry.harvest_date)}</td>
            <td>{entry.team_id ? ws.harvestingTeamById.get(entry.team_id)?.name ?? "Team" : <span className="muted-text">No team</span>}</td>
            <td>{formatNumber(Number(entry.coconut_quantity), 0)} pieces</td>
            <td>{formatCurrency(Number(entry.rate_per_1000))}</td>
            <td className="balance-cell">{formatCurrency(Number(entry.total_cost))}</td>
            <td>{entry.purchase_id ? <Link className="chip good" href={`/v2/purchases?focus=${entry.purchase_id}`}>{formatPurchaseId(entry.purchase_id)}</Link> : <span className="chip warn">Not linked</span>}</td>
            <td>{entry.notes || "-"}</td>
            <td><div className="row-actions"><button className="secondary-button" onClick={() => editEntry(entry)} type="button">Edit</button><button className="danger-button" disabled={ws.saving} onClick={() => deleteEntry(entry)} type="button">Delete</button></div></td>
          </tr>)}
        </tbody></table>{periodEntries.length === 0 ? <EmptyState>No harvesting recorded in this period.</EmptyState> : null}</div>
      </section>
    </div>
  );
}
