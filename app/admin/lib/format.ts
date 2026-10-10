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

export function pur(id: number) {
  return `PUR-${String(id).padStart(6, "0")}`;
}

export function sal(id: number) {
  return `SAL-${String(id).padStart(6, "0")}`;
}
