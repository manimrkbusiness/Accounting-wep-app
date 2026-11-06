"use client";

import { useEffect, useRef, useState } from "react";
import { EllipsisVertical } from "lucide-react";

/**
 * A 3-dots (kebab) actions menu for a table row. The dropdown is positioned `fixed` from the
 * trigger button so it is never clipped by the table's horizontal scroll container. A transparent
 * full-screen backdrop closes it on an outside click; scrolling or resizing also closes it.
 * `children` is a render function that receives `close` so each item can dismiss the menu.
 */
export function RowMenu({ label = "Actions", children }: { label?: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const close = () => setOpen(false);

  function toggle() {
    if (open) { setOpen(false); return; }
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 200;
      setPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);

  return (
    <div className="action-menu">
      <button ref={btnRef} className="action-trigger" type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={toggle}>
        <EllipsisVertical size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {open ? <>
        <button className="menu-backdrop" type="button" aria-hidden="true" tabIndex={-1} onClick={close} />
        <div className="action-dropdown" role="menu" style={pos ? { top: `${pos.top}px`, left: `${pos.left}px` } : undefined}>{children(close)}</div>
      </> : null}
    </div>
  );
}
