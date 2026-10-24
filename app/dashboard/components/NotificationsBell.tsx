"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { formatDate } from "../lib/format";

type Announcement = { id: number; title: string; body: string; created_at: string };

const PREVIEW = 90;

/** Header bell: shows admin announcements, an unread badge, and a Read-more expand that marks read. */
export function NotificationsBell() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      setUserId(uid);
      const { data: anns } = await supabase
        .from("announcements")
        .select("id, title, body, created_at")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(50);
      setItems((anns ?? []) as Announcement[]);
      if (uid) {
        const { data: reads } = await supabase.from("announcement_reads").select("announcement_id").eq("user_id", uid);
        setReadIds(new Set(((reads ?? []) as { announcement_id: number }[]).map((r) => r.announcement_id)));
      }
    } catch {
      // Notifications are non-critical: never let a load failure break the header.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    const onEsc = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  const unread = items.reduce((count, item) => (readIds.has(item.id) ? count : count + 1), 0);

  async function markRead(id: number) {
    if (readIds.has(id) || !userId) return;
    setReadIds((prev) => new Set(prev).add(id)); // optimistic
    try {
      await supabase.from("announcement_reads").upsert({ announcement_id: id, user_id: userId }, { onConflict: "announcement_id,user_id", ignoreDuplicates: true });
    } catch {
      // Keep the optimistic read state even if the write is retried next load.
    }
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => (prev === id ? null : id));
    void markRead(id);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, border: "1px solid var(--line-strong)", background: "var(--surface)", color: "var(--ink)", cursor: "pointer" }}
      >
        <Bell size={18} strokeWidth={2.2} aria-hidden="true" />
        {unread > 0 ? (
          <span style={{ position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 9, background: "var(--danger)", color: "#fff", fontSize: "0.68rem", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: "min(360px, calc(100vw - 32px))", maxHeight: "70vh", overflowY: "auto", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "var(--shadow)", zIndex: 50 }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", fontWeight: 700, color: "var(--ink)" }}>Notifications</div>
          {items.length === 0 ? (
            <p style={{ padding: "18px 14px", margin: 0, color: "var(--muted)", fontSize: "0.9rem" }}>No notifications yet.</p>
          ) : (
            items.map((item) => {
              const isRead = readIds.has(item.id);
              const isOpen = expanded === item.id;
              const long = item.body.length > PREVIEW;
              return (
                <div key={item.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", background: isRead ? "transparent" : "var(--green-soft)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    {!isRead ? <span aria-hidden="true" style={{ flexShrink: 0, width: 8, height: 8, marginTop: 5, borderRadius: 4, background: "var(--green)" }} /> : null}
                    <strong style={{ flex: 1, color: "var(--ink)", fontSize: "0.92rem" }}>{item.title}</strong>
                    <time style={{ flexShrink: 0, color: "var(--muted)", fontSize: "0.72rem" }}>{formatDate(item.created_at)}</time>
                  </div>
                  <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: "0.85rem", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                    {isOpen || !long ? item.body : `${item.body.slice(0, PREVIEW).trimEnd()}…`}
                  </p>
                  {long ? (
                    <button type="button" onClick={() => toggleExpand(item.id)} style={{ marginTop: 6, padding: 0, border: 0, background: "none", color: "var(--green)", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}>
                      {isOpen ? "Show less" : "Read more"}
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
