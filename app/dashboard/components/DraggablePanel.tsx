"use client";

import { useEffect, useRef, useState } from "react";

type Size = { w: number; h: number };

/**
 * A floating, draggable panel (desktop) that falls back to a normal inline card on narrow
 * screens. Position, size, minimized and open/closed state are remembered per `storageKey`
 * on the device. The panel can be dragged by its header and resized from its bottom-right
 * corner; the header buttons minimize (collapse to just the title) or maximize it.
 */
export function DraggablePanel({ title, storageKey, children }: { title: string; storageKey: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [open, setOpen] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const drag = useRef<{ ox: number; oy: number } | null>(null);
  const resize = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try { const raw = window.localStorage.getItem(`floatpos:${storageKey}`); if (raw) setPos(JSON.parse(raw)); } catch { /* ignore */ }
    try { const raw = window.localStorage.getItem(`floatsize:${storageKey}`); if (raw) setSize(JSON.parse(raw)); } catch { /* ignore */ }
    try { if (window.localStorage.getItem(`floatclosed:${storageKey}`) === "1") setOpen(false); } catch { /* ignore */ }
    try { if (window.localStorage.getItem(`floatmin:${storageKey}`) === "1") setMinimized(true); } catch { /* ignore */ }
  }, [storageKey]);

  function isFloating() {
    return !!panelRef.current && getComputedStyle(panelRef.current).position === "fixed";
  }

  // ---- drag (move) ----
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
    if (!panelRef.current || !isFloating()) return;
    const rect = panelRef.current.getBoundingClientRect();
    drag.current = { ox: event.clientX - rect.left, oy: event.clientY - rect.top };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // ---- resize ----
  function onResizeMove(event: PointerEvent) {
    if (!resize.current) return;
    const w = Math.max(260, Math.min(resize.current.sw + (event.clientX - resize.current.sx), window.innerWidth - 24));
    const h = Math.max(160, Math.min(resize.current.sh + (event.clientY - resize.current.sy), window.innerHeight - 24));
    setSize({ w, h });
  }
  function onResizeUp() {
    resize.current = null;
    window.removeEventListener("pointermove", onResizeMove);
    window.removeEventListener("pointerup", onResizeUp);
    setSize((current) => { if (current) { try { window.localStorage.setItem(`floatsize:${storageKey}`, JSON.stringify(current)); } catch { /* ignore */ } } return current; });
  }
  function onResizePointerDown(event: React.PointerEvent) {
    if (!panelRef.current || !isFloating()) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = panelRef.current.getBoundingClientRect();
    resize.current = { sx: event.clientX, sy: event.clientY, sw: rect.width, sh: rect.height };
    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", onResizeUp);
  }

  function maximize() {
    const w = Math.min(760, window.innerWidth - 24);
    const h = window.innerHeight - 24;
    const next = { w, h };
    setSize(next);
    setMinimized(false);
    try { window.localStorage.setItem(`floatsize:${storageKey}`, JSON.stringify(next)); window.localStorage.removeItem(`floatmin:${storageKey}`); } catch { /* ignore */ }
  }
  function resetSize() {
    setSize(null);
    try { window.localStorage.removeItem(`floatsize:${storageKey}`); } catch { /* ignore */ }
  }
  function toggleMinimize() {
    setMinimized((m) => { const next = !m; try { window.localStorage.setItem(`floatmin:${storageKey}`, next ? "1" : "0"); } catch { /* ignore */ } return next; });
  }

  function hide() { setOpen(false); try { window.localStorage.setItem(`floatclosed:${storageKey}`, "1"); } catch { /* ignore */ } }
  function show() { setOpen(true); try { window.localStorage.removeItem(`floatclosed:${storageKey}`); } catch { /* ignore */ } }

  if (!open) return <button className="floating-reopen" type="button" onClick={show}>Show {title}</button>;

  const style: React.CSSProperties = {};
  if (pos) { style.left = `${pos.x}px`; style.top = `${pos.y}px`; style.right = "auto"; }
  if (size && !minimized) { style.width = `${size.w}px`; style.height = `${size.h}px`; style.maxHeight = "none"; }
  else if (size) { style.width = `${size.w}px`; }

  return (
    <aside className="floating-panel" ref={panelRef} data-minimized={minimized ? "1" : undefined} style={Object.keys(style).length ? style : undefined}>
      <div className="floating-head" onPointerDown={onHeadPointerDown}>
        <span className="floating-title">⠿ {title}</span>
        <span className="floating-actions" onPointerDown={(event) => event.stopPropagation()}>
          <button className="floating-btn" type="button" onClick={toggleMinimize} aria-label={minimized ? "Expand" : "Minimize"} title={minimized ? "Expand" : "Minimize"}>{minimized ? "▢" : "–"}</button>
          <button className="floating-btn" type="button" onClick={size && !minimized ? resetSize : maximize} aria-label="Maximize" title={size && !minimized ? "Reset size" : "Maximize"}>{size && !minimized ? "❐" : "⤢"}</button>
          <button className="floating-btn floating-close" type="button" onClick={hide} aria-label="Hide">×</button>
        </span>
      </div>
      {!minimized ? <div className="floating-body">{children}</div> : null}
      {!minimized ? <span className="floating-resize" onPointerDown={onResizePointerDown} aria-hidden="true" /> : null}
    </aside>
  );
}
