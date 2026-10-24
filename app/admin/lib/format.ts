export function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value) || 0);
}

export function num(value: number | string | null | undefined, digits = 0) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(Number(value) || 0);
}

export function dateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function dateOnly(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export type SubRow = { trader_id: string; status: string; trial_ends_at: string | null; current_period_end: string | null };

export type SubTone = "trial" | "active" | "expired" | "none";

/** A short label and tone for a subscription row (or missing row). */
export function subState(sub: SubRow | undefined): { label: string; tone: SubTone } {
  if (!sub) return { label: "No subscription", tone: "none" };
  const now = Date.now();
  if (sub.status === "trialing") {
    const ends = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
    if (ends > now) {
      const days = Math.max(0, Math.ceil((ends - now) / 86400000));
      return { label: `Trial · ${days}d left`, tone: "trial" };
    }
    return { label: "Trial ended", tone: "expired" };
  }
  if (sub.status === "active") return { label: "Active", tone: "active" };
  if (sub.status === "past_due") return { label: "Past due", tone: "expired" };
  if (sub.status === "cancelled") return { label: "Cancelled", tone: "expired" };
  if (sub.status === "halted") return { label: "Halted", tone: "expired" };
  return { label: sub.status, tone: "none" };
}

export function pur(id: number) {
  return `PUR-${String(id).padStart(6, "0")}`;
}

export function sal(id: number) {
  return `SAL-${String(id).padStart(6, "0")}`;
}
