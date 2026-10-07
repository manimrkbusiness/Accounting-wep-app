export const today = () => new Date().toISOString().slice(0, 10);

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
}

export function formatNumber(value: number, digits = 3) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(value || 0);
}

export function formatDate(value: string) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatPurchaseId(id: number) {
  return `PUR-${String(id).padStart(6, "0")}`;
}

export function formatSaleId(id: number) {
  return `SAL-${String(id).padStart(6, "0")}`;
}

export function pdfMoney(value: number) {
  return formatCurrency(value).replace("₹", "INR ");
}

export function getIndianPhoneValue(value: string) {
  const digits = value.replace(/\D/g, "");
  return (digits.length > 10 && digits.startsWith("91") ? digits.slice(2) : digits).slice(0, 10);
}

export function getStoredIndianPhone(value: string) {
  const digits = getIndianPhoneValue(value);
  return digits ? `+91${digits}` : null;
}

export function isValidIndianPhone(value: string) {
  return /^[6-9]\d{9}$/.test(getIndianPhoneValue(value));
}

export function daysBetween(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  return Math.max(0, Math.round((end - start) / 86400000));
}

export function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function startOfMonth(value: string) {
  return `${value.slice(0, 7)}-01`;
}

export function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
