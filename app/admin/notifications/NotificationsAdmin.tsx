"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendAnnouncement, setAnnouncementActive } from "../actions";

export type AdminAnnouncement = { id: number; title: string; body: string; active: boolean; created: string };

/** Compose-and-send form plus the list of everything already sent, with a show/hide toggle. */
export function NotificationsAdmin({ announcements }: { announcements: AdminAnnouncement[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setSent(false);
    const result = await sendAnnouncement({ title, body });
    setBusy(false);
    if (!result.ok) { setError(result.error ?? "Could not send."); return; }
    setTitle(""); setBody(""); setSent(true);
    router.refresh();
  }

  async function toggle(id: number, active: boolean) {
    await setAnnouncementActive(id, active);
    router.refresh();
  }

  return (
    <>
      <section className="admin-panel">
        <div className="admin-panel-head"><h2>Send a notification</h2></div>
        <form onSubmit={submit} className="admin-form">
          <label className="admin-field">
            <span>Title (the subheading traders see first)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. New: husk sale reports" required />
          </label>
          <label className="admin-field">
            <span>Message</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Write the full update. Traders tap “Read more” to see this." required />
          </label>
          {error ? <p className="admin-error" role="alert">{error}</p> : null}
          {sent ? <p className="admin-ok" role="status">Sent — every trader will see it in their bell.</p> : null}
          <div><button className="admin-primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Send to all traders"}</button></div>
        </form>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head"><h2>Sent notifications ({announcements.length})</h2></div>
        <div className="admin-table-wrap"><table><thead><tr><th>Title</th><th>Message</th><th>Sent</th><th>Status</th><th></th></tr></thead><tbody>
          {announcements.map((a) => (
            <tr key={a.id}>
              <td><strong>{a.title}</strong></td>
              <td><span className="admin-sub" style={{ whiteSpace: "pre-wrap" }}>{a.body}</span></td>
              <td>{a.created}</td>
              <td><span className={`admin-tag ${a.active ? "active" : "expired"}`}>{a.active ? "Visible" : "Hidden"}</span></td>
              <td><button className="admin-ghost" type="button" onClick={() => void toggle(a.id, !a.active)}>{a.active ? "Hide" : "Show"}</button></td>
            </tr>
          ))}
          {announcements.length === 0 ? <tr><td colSpan={5} className="admin-empty">Nothing sent yet.</td></tr> : null}
        </tbody></table></div>
      </section>
    </>
  );
}
