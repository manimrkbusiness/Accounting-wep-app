import { ADMIN_CONFIGURED, adminBase, isAuthed, serviceClient } from "../lib/service";
import { AdminGate } from "../AdminGate";
import { AdminShell } from "../AdminShell";
import { dateTime } from "../lib/format";
import { NotificationsAdmin, type AdminAnnouncement } from "./NotificationsAdmin";

export const dynamic = "force-dynamic";

type Row = { id: number; title: string; body: string; active: boolean; created_at: string };

export default async function AdminNotifications() {
  const base = await adminBase();
  if (!(ADMIN_CONFIGURED && (await isAuthed()))) return <AdminGate configured={ADMIN_CONFIGURED} base={base} />;

  const { data } = await serviceClient()
    .from("announcements")
    .select("id, title, body, active, created_at")
    .order("created_at", { ascending: false });

  const announcements: AdminAnnouncement[] = ((data ?? []) as Row[]).map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    active: a.active,
    created: dateTime(a.created_at)
  }));

  return (
    <AdminShell base={base}>
      <header className="admin-top">
        <div><span className="admin-eyebrow">Messaging</span><h1>Notifications</h1><p>Send product updates and announcements. Every trader sees them in the bell on their dashboard.</p></div>
      </header>
      <NotificationsAdmin announcements={announcements} />
    </AdminShell>
  );
}
