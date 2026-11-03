import { formatCurrency, formatDate, formatNumber } from "./format";

export type FarmerReceipt = {
  traderName?: string | null;
  farmerName: string;
  farmerPhone?: string | null;
  date: string;
  location?: string | null;
  color: string;
  methodLabel: string;
  quantityPieces: number;
  netWeightKg?: number;
  payableWeightKg?: number;
  coconutAmount: number;
  dehuskingCost: number;
  harvestingCost: number;
  huskCredit: number;
  additionalCredit?: number;
  additionalDebit?: number;
  netPayable: number;
  advance: number;
  balance: number;
  notes?: string | null;
};

/**
 * A plain-text receipt for the farmer only — what the trader owes them for this purchase.
 * Deliberately excludes any trader margin / expected-sale / profit figures.
 */
export function farmerReceiptText(r: FarmerReceipt): string {
  const lines: string[] = [];
  lines.push("*BizzTrack — Purchase receipt*");
  if (r.traderName) lines.push(r.traderName);
  lines.push("");
  lines.push(`Farmer: ${r.farmerName}`);
  if (r.farmerPhone) lines.push(`Phone: ${r.farmerPhone}`);
  lines.push(`Date: ${formatDate(r.date)}`);
  if (r.location) lines.push(`Location: ${r.location}`);
  lines.push("");
  lines.push(`Coconut: ${r.color} · ${r.methodLabel}`);
  lines.push(`Quantity: ${formatNumber(r.quantityPieces, 0)} pieces`);
  if (r.netWeightKg && r.netWeightKg > 0) {
    lines.push(`Weight: ${formatNumber(r.netWeightKg)} kg${r.payableWeightKg && r.payableWeightKg !== r.netWeightKg ? ` (payable ${formatNumber(r.payableWeightKg)} kg)` : ""}`);
  }
  lines.push("");
  lines.push(`Coconut amount: ${formatCurrency(r.coconutAmount)}`);
  if (r.huskCredit > 0) lines.push(`+ Husk: ${formatCurrency(r.huskCredit)}`);
  if (r.dehuskingCost > 0) lines.push(`- Dehusking: ${formatCurrency(r.dehuskingCost)}`);
  if (r.harvestingCost > 0) lines.push(`- Coconut harvesting: ${formatCurrency(r.harvestingCost)}`);
  if (r.additionalCredit && r.additionalCredit > 0) lines.push(`+ Extra credit: ${formatCurrency(r.additionalCredit)}`);
  if (r.additionalDebit && r.additionalDebit > 0) lines.push(`- Extra deduction: ${formatCurrency(r.additionalDebit)}`);
  lines.push(`*Net payable to you: ${formatCurrency(r.netPayable)}*`);
  if (r.advance > 0) lines.push(`Advance paid: ${formatCurrency(r.advance)}`);
  lines.push(`*Balance to pay: ${formatCurrency(r.balance)}*`);
  if (r.notes) { lines.push(""); lines.push(`Note: ${r.notes}`); }
  return lines.join("\n");
}

/** Open WhatsApp with the receipt pre-filled, addressed to the farmer when a phone is known. */
export function shareReceiptWhatsApp(text: string, phone?: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const url = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}
