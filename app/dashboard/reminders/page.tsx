"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { defaultSettings } from "../components/CostSettingsPanel";
import { dueLabel, dueReminders, harvestReminderText, harvestReminders, type HarvestReminder } from "../lib/reminders";
import { shareReceiptWhatsApp } from "../lib/receipt";
import { formatDate, today } from "../lib/format";
import { EmptyState, Panel } from "../components/ui";

export default function RemindersPage() {
  const ws = useWorkspace();
  const settings = ws.settings ?? defaultSettings;
  const reminders = useMemo(() => harvestReminders(ws.farmers, ws.harvestingEntries, settings, today()), [ws.farmers, ws.harvestingEntries, settings]);
  const dueCount = useMemo(() => dueReminders(reminders).length, [reminders]);

  const [defaultDays, setDefaultDays] = useState(String(settings.harvest_reminder_days ?? 45));
  const [edits, setEdits] = useState<Record<number, string>>({});

  async function saveDefault() {
    if (!ws.session) return;
    const days = parseInt(defaultDays, 10);
    if (!(days >= 1 && days <= 365)) { ws.fail("Enter a harvest cycle between 1 and 365 days."); return; }
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("trader_settings").upsert({
      trader_id: ws.session.user.id,
      purchase_mode: settings.purchase_mode,
      husk_removal_rate_per_1000: settings.husk_removal_rate_per_1000,
      tree_collection_rate_per_1000: settings.tree_collection_rate_per_1000,
      husk_price_per_piece: settings.husk_price_per_piece,
      husk_price_green_per_piece: settings.husk_price_green_per_piece,
      husk_price_brown_per_piece: settings.husk_price_brown_per_piece,
      husk_loading_rate_per_1000: settings.husk_loading_rate_per_1000,
      kudume_wastage_percent: settings.kudume_wastage_percent,
      harvest_reminder_days: days
    });
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify(`Default harvest cycle set to ${days} days.`);
    await ws.refresh();
  }

  async function saveInterval(farmerId: number) {
    if (!ws.session || edits[farmerId] === undefined) return;
    const raw = edits[farmerId].trim();
    const parsed = parseInt(raw, 10);
    const interval = raw !== "" && Number.isFinite(parsed) && parsed >= 1 && parsed <= 365 ? parsed : null; // blank -> use default
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("trader_farmers").update({ harvest_interval_days: interval }).eq("id", farmerId).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    setEdits((current) => { const next = { ...current }; delete next[farmerId]; return next; });
    ws.notify(interval ? `Harvest cycle set to ${interval} days.` : "Harvest cycle reset to the default.");
    await ws.refresh();
  }

  function sendReminder(reminder: HarvestReminder) {
    ws.clearFeedback();
    shareReceiptWhatsApp(harvestReminderText(reminder, ws.traderName), reminder.farmer.phone);
  }

  const statusChip = (reminder: HarvestReminder) => {
    if (reminder.status === "overdue" || reminder.status === "due") return <span className="chip warn">{dueLabel(reminder)}</span>;
    if (reminder.status === "soon") return <span className="chip">{dueLabel(reminder)}</span>;
    if (reminder.status === "none") return <span className="muted-text">No harvest yet</span>;
    return <span className="muted-text">{dueLabel(reminder)}</span>;
  };

  return (
    <div className="stack">
      <section className="welcome-band">
        <div><span className="eyebrow">Harvest reminders</span><h2>Nudge every farmer when their coconuts are ready again.</h2><p>Each farmer&apos;s next harvest is their last harvest plus their cycle. Those due within 3 days show first — tap Send reminder to message the farmer on WhatsApp.</p></div>
        <div className="page-actions"><Link className="secondary-button" href="/dashboard/farmers">Back to farmers</Link></div>
      </section>

      {ws.error ? <p className="error-message" role="alert">{ws.error}</p> : null}

      <Panel eyebrow="Reminder settings" title="Default harvest cycle">
        <div className="filter-bar">
          <label>Harvest every (days)<input type="number" min="1" max="365" value={defaultDays} onChange={(event) => setDefaultDays(event.target.value)} /></label>
          <button className="primary-button" disabled={ws.saving} onClick={saveDefault} type="button">Save default</button>
        </div>
        <p className="field-hint">This is the cycle used for every farmer unless you set a different one for them in the table below (some farmers prefer 40, 50, 60 or 70 days). {dueCount > 0 ? <strong>{dueCount} farmer{dueCount > 1 ? "s are" : " is"} due for harvest now.</strong> : "No farmer is due in the next 3 days."}</p>
      </Panel>

      <Panel eyebrow="Harvest schedule" title="Farmers by next harvest">
        {reminders.length ? <div className="table-wrap"><table><thead><tr><th>Farmer</th><th>Last harvest</th><th>Cycle (days)</th><th>Next due</th><th>Status</th><th>Reminder</th></tr></thead><tbody>
          {reminders.map((reminder) => {
            const farmer = reminder.farmer;
            const dirty = edits[farmer.id] !== undefined;
            const needsNudge = reminder.status === "overdue" || reminder.status === "due" || reminder.status === "soon";
            return <tr key={farmer.id} className={needsNudge ? "selected" : undefined}>
              <td><strong>{farmer.name}</strong><span className="muted-text">{farmer.phone}</span></td>
              <td>{reminder.lastHarvest ? <>{formatDate(reminder.lastHarvest)}<span className="muted-text">{reminder.daysSince} days ago</span></> : <span className="muted-text">Not harvested yet</span>}</td>
              <td><div className="row-actions"><input type="number" min="1" max="365" style={{ width: 84 }} value={edits[farmer.id] ?? (farmer.harvest_interval_days != null ? String(farmer.harvest_interval_days) : "")} placeholder={`${settings.harvest_reminder_days} (default)`} onChange={(event) => setEdits((current) => ({ ...current, [farmer.id]: event.target.value }))} aria-label={`Harvest cycle for ${farmer.name}`} />{dirty ? <button className="link-button" disabled={ws.saving} onClick={() => saveInterval(farmer.id)} type="button">Save</button> : null}</div></td>
              <td>{reminder.dueDate ? formatDate(reminder.dueDate) : <span className="muted-text">-</span>}</td>
              <td>{statusChip(reminder)}</td>
              <td><button className="primary-button" disabled={ws.saving} onClick={() => sendReminder(reminder)} type="button">Send reminder</button></td>
            </tr>;
          })}
        </tbody></table></div> : <EmptyState>No farmers yet. Add farmers and record a harvest to start getting reminders.</EmptyState>}
        <p className="field-hint">Send reminder opens WhatsApp to the farmer&apos;s number with your last-harvest date and a request to schedule the next one. Record the harvest on the <Link href="/dashboard/harvesting">Coconut Harvesting</Link> page and the reminder resets automatically.</p>
      </Panel>
    </div>
  );
}
