"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A floating, draggable panel (desktop) that falls back to a normal inline card on narrow
 * screens. Position and open/closed state are remembered per `storageKey` on the device.
 */
export function DraggablePanel({ title, storageKey, children }: { title: string; storageKey: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(true);
  const drag = useRef<{ ox: number; oy: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try { const raw = window.localStorage.getItem(`floatpos:${storageKey}`); if (raw) setPos(JSON.parse(raw)); } catch { /* ignore */ }
    try { if (window.localStorage.getItem(`floatclosed:${storageKey}`) === "1") setOpen(false); } catch { /* ignore */ }
  }, [storageKey]);

  function onMove(event: PointerEvent) {
    if (!drag.current || !panelRef.current) return;
    const width = panelRef.current.offsetWidth;
    const x = Math.max(8, Math.min(event.clientX - drag.current.ox, window.innerWidth - width - 8));
    const y = Math.max(8, Math.min(event.clientY - drag.current.oy, window.innerHeight - 48));
    setPos({ x, y });
  }
  function onUp() {
    drag.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    setPos((current) => { if (current) { try { window.localStorage.setItem(`floatpos:${storageKey}`, JSON.stringify(current)); } catch { /* ignore */ } } return current; });
  }
  function onHeadPointerDown(event: React.PointerEvent) {
    // Only start a drag when the floating layout is active (desktop).
    if (!panelRef.current || getComputedStyle(panelRef.current).position !== "fixed") return;
    const rect = panelRef.current.getBoundingClientRect();
    drag.current = { ox: event.clientX - rect.left, oy: event.clientY - rect.top };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function hide() { setOpen(false); try { window.localStorage.setItem(`floatclosed:${storageKey}`, "1"); } catch { /* ignore */ } }
  function show() { setOpen(true); try { window.localStorage.removeItem(`floatclosed:${storageKey}`); } catch { /* ignore */ } }

  if (!open) return <button className="floating-reopen" type="button" onClick={show}>Show {title}</button>;

  return (
    <aside className="floating-panel" ref={panelRef} style={pos ? { left: `${pos.x}px`, top: `${pos.y}px`, right: "auto" } : undefined}>
      <div className="floating-head" onPointerDown={onHeadPointerDown}>
        <span>⠿ {title}</span>
        <button className="floating-close" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={hide} aria-label="Hide">×</button>
      </div>
      <div className="floating-body">{children}</div>
    </aside>
  );
}
