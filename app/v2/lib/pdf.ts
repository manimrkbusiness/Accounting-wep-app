import { jsPDF } from "jspdf";
import type { Buyer, Farmer, FarmerLocation, Purchase, Sale, SaleItem } from "./types";
import { formatDate, formatNumber, formatPurchaseId, formatSaleId, pdfMoney } from "./format";

type Tone = "normal" | "credit" | "debit" | "final";

function createWriter(doc: jsPDF) {
  const left = 18;
  let y = 20;
  const line = (label: string, value: string, tone: Tone = "normal") => {
    const color = tone === "credit" ? [18, 107, 82] : tone === "debit" ? [182, 66, 54] : tone === "final" ? [7, 91, 65] : [30, 42, 38];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(tone === "final" ? 13 : 10);
    doc.setTextColor(30, 42, 38);
    doc.text(label, left, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(value, 85, y);
    y += tone === "final" ? 11 : 8;
    doc.setFontSize(10);
    doc.setTextColor(30, 42, 38);
  };
  const rule = () => {
    y += 3;
    doc.line(left, y, 192, y);
    y += 10;
  };
  const header = (reference: string, traderName: string, subtitle: string) => {
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("COCONUT TRADE DESK", left, y);
    y += 10;
    doc.setFontSize(14);
    doc.text(reference, left, y);
    y += 8;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(18, 107, 82);
    doc.text(`Trader: ${traderName}`, left, y);
    y += 10;
    doc.setFontSize(10);
    doc.setTextColor(30, 42, 38);
    doc.text(subtitle, left, y);
    y += 10;
    doc.line(left, y, 192, y);
    y += 10;
  };
  const highlight = () => {
    doc.setFillColor(229, 242, 236);
    doc.roundedRect(left, y - 6, 174, 16, 2, 2, "F");
  };
  const footer = (text: string) => {
    doc.setFontSize(9);
    doc.setTextColor(100, 115, 109);
    doc.text(text, left, 282);
  };
  const bump = (amount: number) => { y += amount; };
  return { line, rule, header, highlight, footer, bump };
}

export function downloadPurchasePdf(trade: Purchase, farmer: Farmer | undefined, location: FarmerLocation | null, traderName: string) {
  const doc = new jsPDF();
  const w = createWriter(doc);
  w.header(formatPurchaseId(trade.id), traderName, "Purchase invoice");
  w.line("Date", formatDate(trade.trade_date));
  w.line("Farmer", farmer?.name ?? "Unknown farmer");
  w.line("Phone", farmer?.phone ?? "Unavailable");
  w.line("Location", location?.location_name ?? "Unavailable");
  w.line("Coconut", trade.purchase_mode === "quantity" ? trade.coconut_color : `${trade.coconut_color} / ${trade.processing_type === "mottai" ? "Mottai" : "Kudume"}`);
  w.line("Purchase method", trade.purchase_mode === "quantity" ? "Per nut" : "Weight / weighbridge");
  w.line("Quantity", `${formatNumber(Number(trade.coconut_quantity), 2)} pieces`);
  if (trade.purchase_mode === "weight") {
    w.line("Average weight per nut", `${formatNumber(Number(trade.average_weight_kg) * 1000, 1)} g per nut`);
  }
  w.line("Average price per nut", `INR ${formatNumber(Number(trade.average_price_per_piece), 2)} per nut`);
  if (trade.purchase_mode === "weight") {
    w.line("Net weight", `${formatNumber(Number(trade.net_weight_kg))} kg`);
    w.line("Wastage", `${formatNumber(Number(trade.wastage_weight_kg))} kg (${trade.wastage_percent}%)`);
    w.line("Payable weight", `${formatNumber(Number(trade.payable_weight_kg))} kg`);
  }
  w.line("Rate", trade.purchase_mode === "quantity" ? `INR ${formatNumber(Number(trade.rate_per_piece), 2)} / nut` : `INR ${formatNumber(Number(trade.rate_per_kg), 2)} / kg`);
  w.rule();
  w.line("Coconut purchase", pdfMoney(Number(trade.total_amount) - Number(trade.husk_price_total) + Number(trade.labor_cost_total)), "credit");
  const dehuskedPieces = trade.dehusking_pieces != null ? Number(trade.dehusking_pieces) : Number(trade.coconut_quantity);
  const harvestedPieces = trade.harvesting_pieces != null ? Number(trade.harvesting_pieces) : Number(trade.coconut_quantity);
  w.line(dehuskedPieces !== Number(trade.coconut_quantity) ? `Dehusking (${formatNumber(dehuskedPieces, 0)} pcs)` : "Dehusking", pdfMoney(Number(trade.husk_removal_cost)), "debit");
  w.line(harvestedPieces !== Number(trade.coconut_quantity) ? `Coconut harvesting (${formatNumber(harvestedPieces, 0)} pcs)` : "Coconut harvesting", pdfMoney(Number(trade.tree_collection_cost)), "debit");
  if (trade.purchase_mode === "weight" || Number(trade.husk_price_total) > 0) {
    w.line("Husk / Mattai credit", pdfMoney(Number(trade.husk_price_total)), "credit");
  }
  w.line("Net payable to farmer", pdfMoney(Number(trade.total_amount)), "credit");
  w.line("Advance paid", pdfMoney(Number(trade.advance_amount)), "credit");
  if (Number(trade.additional_credit_amount) > 0) {
    w.line("Additional credit", pdfMoney(Number(trade.additional_credit_amount)), "credit");
    w.line("Credit reason", trade.additional_credit_reason ?? "");
  }
  if (Number(trade.additional_debit_amount) > 0) {
    w.line("Additional debit", pdfMoney(Number(trade.additional_debit_amount)), "debit");
    w.line("Debit reason", trade.additional_debit_reason ?? "");
  }
  w.highlight();
  w.line("Balance to pay", pdfMoney(Number(trade.balance_amount)), "final");
  if (trade.notes) {
    w.bump(3);
    w.line("Notes", trade.notes);
  }
  w.footer("Generated from Coconut Trade Desk. Keep this invoice for your records.");
  doc.save(`purchase-${String(trade.id).padStart(6, "0")}.pdf`);
}

export function downloadSalePdf(sale: Sale, buyer: Buyer | undefined, items: SaleItem[], purchases: Map<number, Purchase>, farmers: Map<number, Farmer>, traderName: string) {
  const doc = new jsPDF();
  const w = createWriter(doc);
  const isHusk = sale.sale_kind === "husk";
  w.header(formatSaleId(sale.id), traderName, isHusk ? "Husk sale invoice" : "Coconut sale invoice");
  w.line("Date", formatDate(sale.sale_date));
  w.line("Buyer", buyer?.business_name ? `${buyer.name} (${buyer.business_name})` : buyer?.name ?? "Unknown buyer");
  w.line("Phone", buyer?.phone ?? "Unavailable");
  if (sale.vehicle_number) w.line("Vehicle", sale.vehicle_number);
  if (!isHusk) {
    w.line("Coconut", `${sale.coconut_color} / ${sale.processing_type}`);
    if (Number(sale.coconut_quantity) > 0) w.line("Pieces", `${formatNumber(Number(sale.coconut_quantity), 0)} pieces`);
  }
  if (sale.gross_weight_kg != null && Number(sale.gross_weight_kg) > 0) {
    w.line("Gross weight", `${formatNumber(Number(sale.gross_weight_kg))} kg`);
    w.line("Empty weight", `${formatNumber(Number(sale.empty_weight_kg ?? 0))} kg`);
  }
  const unitLabel = sale.unit === "kg" ? "kg" : sale.unit === "piece" ? "pieces" : "loads";
  w.line(sale.unit === "kg" ? "Net weight" : "Quantity", `${formatNumber(Number(sale.quantity))} ${unitLabel}`);
  w.line("Rate", `INR ${formatNumber(Number(sale.rate), 2)} / ${sale.unit === "kg" ? "kg" : sale.unit === "piece" ? "nut" : "load"}`);
  w.rule();
  w.line("Sale amount", pdfMoney(Number(sale.sale_amount)), "credit");
  if (Number(sale.transport_charge) > 0) w.line("Transport charged", pdfMoney(Number(sale.transport_charge)), "credit");
  if (Number(sale.deduction_amount) > 0) {
    w.line("Deduction", pdfMoney(Number(sale.deduction_amount)), "debit");
    w.line("Deduction reason", sale.deduction_reason ?? "");
  }
  w.line("Total", pdfMoney(Number(sale.total_amount)), "credit");
  w.line("Advance received", pdfMoney(Number(sale.advance_amount)), "credit");
  w.highlight();
  w.line("Balance receivable", pdfMoney(Number(sale.balance_amount)), "final");
  if (!isHusk && items.length) {
    w.bump(3);
    w.line("Included purchases", "");
    items.forEach((item) => {
      const purchase = purchases.get(item.purchase_id);
      const farmer = purchase ? farmers.get(purchase.farmer_id) : undefined;
      w.line(formatPurchaseId(item.purchase_id), `${formatNumber(Number(item.quantity_pieces), 0)} pieces${farmer ? ` - ${farmer.name}` : ""}${purchase ? ` (${formatDate(purchase.trade_date)})` : ""}`);
    });
  }
  if (sale.notes) {
    w.bump(3);
    w.line("Notes", sale.notes);
  }
  w.footer("Generated from Coconut Trade Desk. Keep this invoice for your records.");
  doc.save(`sale-${String(sale.id).padStart(6, "0")}.pdf`);
}
