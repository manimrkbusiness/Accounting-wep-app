"use client";

import { useEffect } from "react";

/**
 * Stops the mouse wheel from changing a focused number box. The wheel scrolls the
 * page as normal; the typed value stays exactly as entered.
 */
export function NumberInputGuard() {
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.type === "number" && (event.target === active || active.contains(event.target as Node))) {
        active.blur();
      }
    };
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);
  return null;
}
