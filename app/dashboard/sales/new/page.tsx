"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../supabaseClient";
import { useWorkspace } from "../../lib/workspace";
import { discardDrafts, draftKey, queryNumber, useDraft } from "../../lib/useDraft";
import { DraftNotice } from "../../components/DraftNotice";
import { DraggablePanel } from "../../components/DraggablePanel";
import { allocationCost, calculateSale, huskAllocationCost } from "../../lib/calc";
import { addDays, formatCurrency, formatDate, formatNumber, formatPurchaseId, formatSaleId, today, toNumber } from "../../lib/format";
import { type EmployeeRole, type PaymentStatus, type ProcessingType, type Purchase, type Sale, type SaleColor, type SaleKind, type SaleUnit } from "../../lib/types";
import { defaultSettings } from "../../components/CostSettingsPanel";

type SaleForm = {
  id?: number;
  buyer_id: string;
  sale_date: string;
  coconut_color: SaleColor;
  processing_type: ProcessingType;
  unit: SaleUnit;
  quantity: string;
  rate: string;
  gross_weight_kg: string;
  empty_weight_kg: string;
  transport_charge: string;
  deduction_amount: string;
  deduction_reason: string;
  other_charge_amount: string;
  other_charge_reason: string;
  advance_amount: string;
  vehicle_id: string;
  vehicle_number: string;
  // Husk sale delivery (only used when kind is husk and the trader delivers).
  delivery_by_trader: boolean;
  husk_loading_rate_per_1000: string;
  husk_loading_employee_id: string;
  husk_fuel_cost: string;
  husk_other_expense: string;
  notes: string;
};

const blankForm = (): SaleForm => ({
  buyer_id: "",
  sale_date: today(),
  coconut_color: "green",
  processing_type: "mottai",
  unit: "kg",
  quantity: "",
  rate: "",
  gross_weight_kg: "",
  empty_weight_kg: "",
  transport_charge: "0",
  deduction_amount: "0",
  deduction_reason: "",
  other_charge_amount: "0",
  other_charge_reason: "",
  advance_amount: "0",
  vehicle_id: "",
  vehicle_number: "",
  delivery_by_trader: false,
  husk_loading_rate_per_1000: "",
  husk_loading_employee_id: "",
  husk_fuel_cost: "0",
  husk_other_expense: "0",
  notes: ""
});

type SaleMeta = { kind: SaleKind; useGrossTare: boolean; weightEdited: boolean; rateEdited: boolean };
const blankMeta = (): SaleMeta => ({ kind: "coconut", useGrossTare: false, weightEdited: false, rateEdited: false });

// A cost on this sale, in a fixed set of categories. "You pay" costs come off the margin and are
// booked under Expenses; "Buyer pays" costs are added to the buyer's bill (and net out of the
// margin), mirroring the farmer-pays / you-pay choice on dehusking and harvesting. A loading or
// unloading cost can carry a loading team so the wage also shows in that team's payments.
type CostCategory = "transportation" | "driver" | "loading" | "unloading" | "other";
type CostWho = "you" | "buyer";
// `rate` is the per-1,000-piece rate for loading/unloading; those amounts are computed from the
// load's pieces × rate. Other categories use `amount` directly.
type CostLine = { category: CostCategory; label: string; who: CostWho; amount: string; rate: string; employee_id: string };
const COST_MARKER = "Sale cost: ";
const BUYER_SUFFIX = " (buyer paid)";
const costCategories: Array<{ value: CostCategory; label: string }> = [
  { value: "transportation", label: "Transportation" },
  { value: "driver", label: "Driver charges" },
  { value: "loading", label: "Loading charges" },
  { value: "unloading", label: "Unloading charges" },
  { value: "other", label: "Others" }
];
const costNeedsTeam = (category: CostCategory) => category === "loading" || category === "unloading";
const costLineLabel = (line: CostLine) => line.category === "other" ? (line.label.trim() || "Other expense") : (costCategories.find((entry) => entry.value === line.category)?.label ?? "Expense");
// Label stored on the booked expense. Loading/unloading carry their rate as "@<rate>" so an edit can
// restore it; a buyer-paid line is tagged so the margin and dashboard can tell them apart.
const costStoredLabel = (line: CostLine) => costLineLabel(line) + (costNeedsTeam(line.category) && toNumber(line.rate) > 0 ? ` @${toNumber(line.rate)}` : "") + (line.who === "buyer" ? BUYER_SUFFIX : "");
// Rebuild a cost line from the booked expense description ("Sale cost: <label>[ @rate][ (buyer paid)]").
function costLineFromDescription(description: string, amount: number, employeeId: number | null): CostLine {
  let body = description.slice(COST_MARKER.length);
  const who: CostWho = body.endsWith(BUYER_SUFFIX) ? "buyer" : "you";
  if (who === "buyer") body = body.slice(0, -BUYER_SUFFIX.length);
  const rateMatch = body.match(/ @(\d+(?:\.\d+)?)$/);
  const rate = rateMatch ? rateMatch[1] : "";
  const core = rateMatch ? body.slice(0, body.length - rateMatch[0].length) : body;
  const match = costCategories.find((entry) => entry.label === core && entry.value !== "other");
  const category: CostCategory = match ? match.value : "other";
  return { category, label: category === "other" ? core : "", who, amount: String(amount), rate, employee_id: employeeId ? String(employeeId) : "" };
}

function formFromSale(sale: Sale): SaleForm {
  return {
    id: sale.id,
    buyer_id: String(sale.buyer_id),
    sale_date: sale.sale_date,
    coconut_color: sale.coconut_color,
    processing_type: sale.processing_type === "mixed" ? "mottai" : sale.processing_type,
    unit: sale.unit,
    quantity: String(sale.quantity),
    rate: String(sale.rate),
    gross_weight_kg: sale.gross_weight_kg != null ? String(sale.gross_weight_kg) : "",
    empty_weight_kg: sale.empty_weight_kg != null ? String(sale.empty_weight_kg) : "",
    transport_charge: String(sale.transport_charge),
    deduction_amount: String(sale.deduction_amount),
    deduction_reason: sale.deduction_reason ?? "",
    other_charge_amount: String(sale.other_charge_amount ?? 0),
    other_charge_reason: sale.other_charge_reason ?? "",
    advance_amount: String(sale.advance_amount),
    vehicle_id: sale.vehicle_id ? String(sale.vehicle_id) : "",
    vehicle_number: sale.vehicle_number ?? "",
    delivery_by_trader: sale.delivery_by_trader ?? false,
    husk_loading_rate_per_1000: Number(sale.husk_loading_rate_per_1000 ?? 0) > 0 ? String(sale.husk_loading_rate_per_1000) : "",
    husk_loading_employee_id: sale.husk_loading_employee_id ? String(sale.husk_loading_employee_id) : "",
    husk_fuel_cost: String(sale.husk_fuel_cost ?? 0),
    husk_other_expense: String(sale.husk_other_expense ?? 0),
    notes: sale.notes ?? ""
  };
}

export function SaleEntry({ forcedKind }: { forcedKind?: SaleKind }) {
  const ws = useWorkspace();
  const router = useRouter();
  // A husk-only route keeps its own draft and history, separate from coconut sales.
  const settings = ws.settings ?? defaultSettings;
  const draftForm = forcedKind === "husk" ? "husk-sale" : "sale";
  const newHref = forcedKind === "husk" ? "/dashboard/husk-sales/new" : "/dashboard/sales/new";
  const historyHref = forcedKind === "husk" ? "/dashboard/husk-sales" : "/dashboard/sales";
  // Husk is always sold by the piece, so its blank form starts on "piece". Without this the reset
  // form (unit "kg") is immediately changed to "piece" by an effect, which re-creates the draft and
  // leaves a phantom "sale in progress" after saving.
  const blankSaleForm = (): SaleForm => forcedKind === "husk" ? { ...blankForm(), unit: "piece" } : blankForm();
  // Everything typed here is kept as a draft until the sale is saved or discarded.
  const [draftScope, setDraftScope] = useState(() => draftKey(ws.session?.user.id, draftForm, queryNumber("edit")));
  const formDraft = useDraft<SaleForm>(`${draftScope}:form`, blankSaleForm);
  const selectionDraft = useDraft<Map<number, { pieces: string; wasted: string }>, Array<[number, { pieces: string; wasted: string }]>>(`${draftScope}:selection`, () => new Map(), { serialize: (map) => Array.from(map.entries()), deserialize: (entries) => new Map(entries) });
  const metaDraft = useDraft<SaleMeta>(`${draftScope}:meta`, blankMeta);
  const costsDraft = useDraft<CostLine[]>(`${draftScope}:costs`, () => []);
  const form = formDraft.value;
  const setForm = formDraft.setValue;
  const selection = selectionDraft.value;
  const setSelection = selectionDraft.setValue;
  const costLines = costsDraft.value;
  const setCostLines = costsDraft.setValue;
  const { useGrossTare, weightEdited, rateEdited } = metaDraft.value;
  const kind: SaleKind = forcedKind ?? metaDraft.value.kind;
  const setMeta = metaDraft.setValue;
  const setKind = (value: SaleKind) => setMeta((current) => ({ ...current, kind: value }));
  const setUseGrossTare = (next: boolean | ((value: boolean) => boolean)) => setMeta((current) => ({ ...current, useGrossTare: typeof next === "function" ? next(current.useGrossTare) : next }));
  const setWeightEdited = (next: boolean) => setMeta((current) => ({ ...current, weightEdited: next }));
  const setRateEdited = (next: boolean) => setMeta((current) => ({ ...current, rateEdited: next }));
  const draftWasRestored = formDraft.wasRestored || selectionDraft.wasRestored;
  const [loadedEdit, setLoadedEdit] = useState<number | null>(null);
  const buyerParamApplied = useRef(false);
  const [addingLoader, setAddingLoader] = useState(false);
  const [loaderName, setLoaderName] = useState("");
  // When adding a loading team from a cost line: the index of that line (null = from husk delivery).
  const [costLoaderFor, setCostLoaderFor] = useState<number | null>(null);
  const [filters, setFilters] = useState({ from: addDays(today(), -60), to: today(), farmer: "", onlyStock: true });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = Number(params.get("edit"));
    if (editId && editId !== loadedEdit) {
      const sale = ws.saleById.get(editId);
      if (sale) {
        if (!draftWasRestored) {
          setMeta({ kind: sale.sale_kind, useGrossTare: sale.gross_weight_kg != null && Number(sale.gross_weight_kg) > 0, weightEdited: true, rateEdited: true });
          setForm(formFromSale(sale));
          const existingCosts = ws.expenses.filter((expense) => expense.sale_id === editId && typeof expense.description === "string" && expense.description.startsWith(COST_MARKER));
          setCostLines(existingCosts.map((expense) => costLineFromDescription(expense.description as string, Number(expense.amount), expense.employee_id)));
        }
        if (sale.sale_kind === "husk") {
          const huskItems = ws.huskSaleItems.filter((row) => row.sale_id === editId);
          if (!draftWasRestored) setSelection(new Map(huskItems.map((row) => [row.purchase_id, { pieces: String(row.quantity_pieces), wasted: "" }])));
          const dates = huskItems.map((row) => ws.purchaseById.get(row.purchase_id)?.trade_date).filter((value): value is string => Boolean(value)).sort();
          if (dates.length) setFilters((current) => ({ ...current, from: dates[0] < current.from ? dates[0] : current.from, onlyStock: false }));
        } else {
          const items = ws.saleItems.filter((item) => item.sale_id === editId);
          const wastage = ws.stockWastage.filter((row) => row.sale_id === editId);
          const purchaseIds = Array.from(new Set([...items.map((item) => item.purchase_id), ...wastage.map((row) => row.purchase_id)]));
          if (!draftWasRestored) setSelection(new Map(purchaseIds.map((purchaseId) => [purchaseId, { pieces: String(items.find((item) => item.purchase_id === purchaseId)?.quantity_pieces ?? 0), wasted: String(wastage.find((row) => row.purchase_id === purchaseId)?.quantity_pieces ?? "") }])));
          if (items.length) {
            const dates = items.map((item) => ws.purchaseById.get(item.purchase_id)?.trade_date).filter((value): value is string => Boolean(value)).sort();
            if (dates.length) setFilters((current) => ({ ...current, from: dates[0] < current.from ? dates[0] : current.from, onlyStock: false }));
          }
        }
        setLoadedEdit(editId);
      }
    } else if (!editId && params.get("kind") === "husk" && !form.id && !draftWasRestored) {
      setMeta((current) => ({ ...current, kind: "husk" }));
    }
    // Coming back from "+ Add buyer": select the buyer that was just added.
    const buyerParam = Number(params.get("buyer"));
    if (buyerParam && !buyerParamApplied.current && ws.buyerById.has(buyerParam)) {
      buyerParamApplied.current = true;
      setForm((current) => current.buyer_id === String(buyerParam) ? current : { ...current, buyer_id: String(buyerParam) });
    }
  }, [ws.saleById, ws.saleItems, ws.huskSaleItems, ws.stockWastage, ws.purchaseById, ws.buyerById, ws.expenses, loadedEdit, form.id, draftWasRestored, setForm, setSelection, setMeta, setCostLines]);

  function discardDraft() {
    formDraft.clear(blankSaleForm());
    selectionDraft.clear(new Map());
    metaDraft.clear(blankMeta());
    costsDraft.clear([]);
    setLoadedEdit(null);
  }
  // Always-available way to clear a new sale from the top of the form.
  function discardSale() {
    if (!window.confirm("Discard this sale and clear the form?")) return;
    ws.clearFeedback();
    discardDraft();
  }

  // Pieces this sale already holds (sold plus wasted), so editing can re-use them.
  const ownAllocation = useMemo(() => {
    const map = new Map<number, number>();
    if (form.id) {
      ws.saleItems.filter((item) => item.sale_id === form.id).forEach((item) => map.set(item.purchase_id, (map.get(item.purchase_id) ?? 0) + Number(item.quantity_pieces)));
      ws.stockWastage.filter((row) => row.sale_id === form.id).forEach((row) => map.set(row.purchase_id, (map.get(row.purchase_id) ?? 0) + Number(row.quantity_pieces)));
    }
    return map;
  }, [ws.saleItems, ws.stockWastage, form.id]);

  const availableFor = (purchaseId: number) => (ws.stock.get(purchaseId)?.sellablePieces ?? 0) + (ownAllocation.get(purchaseId) ?? 0);

  const candidates = useMemo(() => ws.purchases.filter((purchase) => {
    if (purchase.husk_only) return false; // husk-only purchases have no coconut to sell
    if (selection.has(purchase.id)) return true;
    if (purchase.purchase_mode === "quantity" && (ws.stock.get(purchase.id)?.stockedPieces ?? 0) <= 0.5) return false;
    if (filters.farmer && String(purchase.farmer_id) !== filters.farmer) return false;
    if (filters.from && purchase.trade_date < filters.from) return false;
    if (filters.to && purchase.trade_date > filters.to) return false;
    if (filters.onlyStock && availableFor(purchase.id) <= 0.5) return false;
    return true;
  }), [ws.purchases, selection, filters, ws.stock, ownAllocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const allocations = useMemo(() => Array.from(selection.entries()).map(([purchase_id, entry]) => ({ purchase_id, quantity_pieces: Math.max(toNumber(entry.pieces), 0), wastage_pieces: Math.max(toNumber(entry.wasted), 0) })).filter((item) => item.quantity_pieces > 0 || item.wastage_pieces > 0), [selection]);
  const wastedPieces = allocations.reduce((sum, item) => sum + item.wastage_pieces, 0);
  const wastageLoss = allocations.reduce((sum, item) => sum + item.wastage_pieces * (ws.stock.get(item.purchase_id)?.coconutCostPerPiece ?? 0), 0);
  const allocatedPieces = allocations.reduce((sum, item) => sum + item.quantity_pieces, 0);
  const allocatedKg = allocations.reduce((sum, item) => sum + item.quantity_pieces * (ws.stock.get(item.purchase_id)?.kgPerPiece ?? 0), 0);
  const costBasis = kind === "coconut" ? allocationCost(allocations, ws.stock) : 0;
  /** Full farmer payable for the pieces in this load, including husk credit. */
  /** Dehusking already booked on stock entries for the per-nut pieces in this load. */
  const stockDehusking = kind === "coconut" ? allocations.reduce((sum, item) => sum + item.quantity_pieces * (ws.stock.get(item.purchase_id)?.dehuskingCostPerPiece ?? 0), 0) : 0;
  /** Expected sale price from the stock entries in this load, weighted by weight. */
  const ratedKg = allocations.reduce((sum, item) => { const info = ws.stock.get(item.purchase_id); return sum + (info && info.stockSaleRatePerKg > 0 ? item.quantity_pieces * info.kgPerPiece : 0); }, 0);
  const estimatedRate = ratedKg > 0 ? Math.round(allocations.reduce((sum, item) => { const info = ws.stock.get(item.purchase_id); return sum + (info && info.stockSaleRatePerKg > 0 ? item.quantity_pieces * info.kgPerPiece * info.stockSaleRatePerKg : 0); }, 0) / ratedKg * 100) / 100 : 0;

  // Husk sale: the same selection map holds husk pieces per purchase (the "pieces" field only).
  const ownHuskAllocation = useMemo(() => {
    const map = new Map<number, number>();
    if (form.id) ws.huskSaleItems.filter((row) => row.sale_id === form.id).forEach((row) => map.set(row.purchase_id, (map.get(row.purchase_id) ?? 0) + Number(row.quantity_pieces)));
    return map;
  }, [ws.huskSaleItems, form.id]);
  const huskAvailableFor = (purchaseId: number) => (ws.husk.get(purchaseId)?.huskInHand ?? 0) + (ownHuskAllocation.get(purchaseId) ?? 0);
  const huskCandidates = useMemo(() => ws.purchases.filter((purchase) => {
    if (selection.has(purchase.id)) return true;
    if (filters.farmer && String(purchase.farmer_id) !== filters.farmer) return false;
    if (filters.from && purchase.trade_date < filters.from) return false;
    if (filters.to && purchase.trade_date > filters.to) return false;
    return huskAvailableFor(purchase.id) > 0.5;
  }), [ws.purchases, selection, filters, ws.husk, ownHuskAllocation]); // eslint-disable-line react-hooks/exhaustive-deps
  const huskAllocations = useMemo(() => Array.from(selection.entries()).map(([purchase_id, entry]) => ({ purchase_id, quantity_pieces: Math.max(toNumber(entry.pieces), 0) })).filter((item) => item.quantity_pieces > 0), [selection]);
  const huskPiecesSelected = huskAllocations.reduce((sum, item) => sum + item.quantity_pieces, 0);
  const huskCost = huskAllocationCost(huskAllocations, ws.husk);
  const huskInHandTotal = ws.purchases.reduce((sum, purchase) => sum + huskAvailableFor(purchase.id), 0);

  // Pre-fill the rate from the stock entry price until the trader types the agreed rate.
  useEffect(() => {
    if (kind !== "coconut" || form.unit !== "kg" || rateEdited || estimatedRate <= 0) return;
    const next = String(estimatedRate);
    setForm((current) => current.rate === next ? current : { ...current, rate: next });
  }, [kind, form.unit, rateEdited, estimatedRate]);
  const effectivePieces = kind === "husk" ? huskPiecesSelected : allocatedPieces;
  const effectiveCostBasis = kind === "husk" ? huskCost : costBasis;
  // Loading/unloading amounts come from the load's pieces × the per-1,000 rate; other categories use
  // the typed amount. "You pay" lines lower the margin; "Buyer pays" lines go on the buyer's bill
  // (through other charges) and net back out of the margin.
  const lineAmount = (line: CostLine) => (costNeedsTeam(line.category) && toNumber(line.rate) > 0) ? Math.round((effectivePieces / 1000) * toNumber(line.rate) * 100) / 100 : Math.max(toNumber(line.amount), 0);
  const buyerPaidTotal = costLines.filter((line) => line.who === "buyer").reduce((sum, line) => sum + lineAmount(line), 0);
  const youPaidTotal = costLines.filter((line) => line.who === "you").reduce((sum, line) => sum + lineAmount(line), 0);
  const calculation = useMemo(() => calculateSale({ ...form, other_charge_amount: String(buyerPaidTotal) }, effectivePieces, effectiveCostBasis), [form, buyerPaidTotal, effectivePieces, effectiveCostBasis]);
  // Dehusking + harvesting wages the trader pays the teams for the purchases in this load (booked
  // as expenses, including linked-harvest wages), allocated per piece. Counting them makes the
  // coconut margin the true take-home — matching the Farmer-purchase projection and Dashboard net
  // profit. Stock-stage dehusking (purchase_id null) is excluded here; it is in stockDehusking.
  const purchaseLaborPerPiece = useMemo(() => {
    const totals = new Map<number, number>();
    const harvestToPurchase = new Map<number, number>();
    ws.harvestingEntries.forEach((entry) => { if (entry.purchase_id != null) harvestToPurchase.set(entry.id, entry.purchase_id); });
    ws.expenses.forEach((expense) => {
      if (expense.category !== "dehusking_labor" && expense.category !== "harvesting_labor") return;
      const purchaseId = expense.purchase_id ?? (expense.harvesting_entry_id != null ? harvestToPurchase.get(expense.harvesting_entry_id) : undefined);
      if (purchaseId == null) return;
      totals.set(purchaseId, (totals.get(purchaseId) ?? 0) + Number(expense.amount));
    });
    const perPiece = new Map<number, number>();
    totals.forEach((total, purchaseId) => { const pcs = Number(ws.purchaseById.get(purchaseId)?.coconut_quantity) || 0; if (pcs > 0) perPiece.set(purchaseId, total / pcs); });
    return perPiece;
  }, [ws.expenses, ws.harvestingEntries, ws.purchaseById]);
  const laborSpending = kind === "coconut" ? allocations.reduce((sum, item) => sum + item.quantity_pieces * (purchaseLaborPerPiece.get(item.purchase_id) ?? 0), 0) : 0;
  /** All sale costs. You-pay lines lower the margin; buyer-pay lines sit in the bill (via other charges) and cancel here. */
  const extraCostsTotal = youPaidTotal + buyerPaidTotal;
  /** What this load cost: farmer payable for the pieces (stock-stage wastage already absorbed), dehusking booked at the Stock stage, and the dehusking/harvesting wages you pay the teams. */
  const totalSpending = costBasis + stockDehusking + laborSpending;
  /** Margin takes the full spend, any sale-stage wastage, and your own sale costs off what the buyer actually pays (so a buyer deduction lowers it and a reimbursed charge raises it). */
  const margin = calculation.total - totalSpending - wastageLoss - extraCostsTotal;
  // Husk delivery costs: only when the trader delivers the husk. Loading is on the husk pieces.
  const delivering = kind === "husk" && form.delivery_by_trader;
  const huskLoadingCost = delivering ? Math.round(huskPiecesSelected / 1000 * toNumber(form.husk_loading_rate_per_1000) * 100) / 100 : 0;
  const huskFuelCost = delivering ? toNumber(form.husk_fuel_cost) : 0;
  const huskOtherCost = delivering ? toNumber(form.husk_other_expense) : 0;
  const huskDeliveryCost = huskLoadingCost + huskFuelCost + huskOtherCost;
  /** Husk margin: what the buyer pays less the husk cost (zero for per-nut husk), any delivery costs, and your own sale costs. */
  const huskMargin = calculation.total - huskCost - huskDeliveryCost - extraCostsTotal;
  const estimatedQuantity = form.unit === "kg" ? Math.round(allocatedKg * 1000) / 1000 : allocatedPieces;

  // Pre-fill the sold quantity from the purchase and stock weights until the trader types the slip figure.
  useEffect(() => {
    if (kind !== "coconut" || useGrossTare || weightEdited) return;
    const next = estimatedQuantity > 0 ? String(estimatedQuantity) : "";
    setForm((current) => current.quantity === next ? current : { ...current, quantity: next });
  }, [kind, useGrossTare, weightEdited, estimatedQuantity]);

  // Husk is always sold by the piece, however the kind was set (toggle, ?kind=husk, or an older sale).
  useEffect(() => {
    if (kind === "husk" && form.unit !== "piece") setForm((current) => current.unit === "piece" ? current : { ...current, unit: "piece" });
  }, [kind, form.unit]);

  // Husk is sold by the piece: the quantity is the total husk pieces ticked from the purchases.
  useEffect(() => {
    if (kind !== "husk") return;
    const next = huskPiecesSelected > 0 ? String(huskPiecesSelected) : "";
    setForm((current) => current.quantity === next ? current : { ...current, quantity: next });
  }, [kind, huskPiecesSelected]);

  // Colour and condition come from the purchases in the load: the purchase itself for
  // weight-based coconut, the stock entry for per-nut coconut. Nothing to type.
  const loadMix = useMemo(() => {
    const included = allocations
      .map((item) => ({ purchase: ws.purchaseById.get(item.purchase_id), pieces: item.quantity_pieces }))
      .filter((entry): entry is { purchase: Purchase; pieces: number } => Boolean(entry.purchase));
    const colors = new Set(included.map((entry) => entry.purchase.coconut_color));
    const piecesOf = (type: ProcessingType) => included.filter((entry) => (ws.stock.get(entry.purchase.id)?.stockCondition ?? entry.purchase.processing_type) === type).reduce((sum, entry) => sum + entry.pieces, 0);
    const mottaiPieces = piecesOf("mottai");
    const kudumePieces = piecesOf("kudume");
    const condition: ProcessingType = kudumePieces > mottaiPieces ? "kudume" : "mottai";
    const color: SaleColor = included.length === 0 ? "green" : colors.size === 1 ? included[0].purchase.coconut_color : "mixed";
    return { included, mottaiPieces, kudumePieces, condition, color };
  }, [allocations, ws.purchaseById, ws.stock]);

  useEffect(() => {
    if (kind !== "coconut" || loadMix.included.length === 0) return;
    setForm((current) => current.coconut_color === loadMix.color && current.processing_type === loadMix.condition ? current : { ...current, coconut_color: loadMix.color, processing_type: loadMix.condition });
  }, [kind, loadMix]);

  useEffect(() => {
    if (!useGrossTare) return;
    const gross = toNumber(form.gross_weight_kg);
    if (gross > 0) setForm((current) => ({ ...current, quantity: String(Math.max(gross - toNumber(current.empty_weight_kg), 0)) }));
  }, [form.gross_weight_kg, form.empty_weight_kg, useGrossTare]);

  const buyers = ws.buyers.filter((buyer) => buyer.active && (kind === "husk" ? buyer.buys_husk : buyer.buys_coconut));
  // Coconut and husk loading teams are separate roles. The husk delivery block uses husk loaders;
  // the cost lines use the team that matches this sale's kind.
  const huskLoaders = ws.employees.filter((employee) => employee.active && employee.role === "husk_loader");
  const coconutLoaders = ws.employees.filter((employee) => employee.active && employee.role === "loader");
  const costTeams = kind === "husk" ? huskLoaders : coconutLoaders;

  async function addLoader() {
    if (!ws.session || loaderName.trim().length < 2) { ws.fail("Enter the loading team name (at least 2 letters)."); return; }
    // A cost line on a coconut sale adds a coconut loading team; a husk sale (or the husk delivery
    // block) adds a husk loading team. The two teams are kept separate.
    const role: EmployeeRole = costLoaderFor != null && kind === "coconut" ? "loader" : "husk_loader";
    ws.setSaving(true);
    const { data, error } = await supabase.from("employees").insert({ trader_id: ws.session.user.id, name: loaderName.trim(), role, active: true }).select("id").single();
    ws.setSaving(false);
    if (error || !data) { ws.fail(error?.message || "Could not add the loading team."); return; }
    const newId = String((data as { id: number }).id);
    // Apply the new team to whichever control opened the add form: a cost line, or husk delivery.
    if (costLoaderFor != null) updateCostLine(costLoaderFor, { employee_id: newId });
    else setField("husk_loading_employee_id", newId);
    setLoaderName("");
    setAddingLoader(false);
    setCostLoaderFor(null);
    ws.notify("Loading team added.");
    await ws.refresh();
  }

  // "Your costs on this sale" lines: a fixed category (free text only for "Others"), amount, who pays,
  // and an optional loading team for loading/unloading.
  function addCostLine() { setCostLines((current) => [...current, { category: "transportation", label: "", who: "you", amount: "", rate: "", employee_id: "" }]); }
  function updateCostLine(index: number, patch: Partial<CostLine>) { setCostLines((current) => current.map((line, idx) => (idx === index ? { ...line, ...patch } : line))); }
  function removeCostLine(index: number) { setCostLines((current) => current.filter((_, idx) => idx !== index)); if (costLoaderFor === index) { setAddingLoader(false); setCostLoaderFor(null); } }
  // Switching category: loading/unloading pick up the default rate (edit it to change the amount);
  // other categories keep no rate or team.
  function changeCostCategory(index: number, line: CostLine, category: CostCategory) {
    const patch: Partial<CostLine> = { category };
    if (category !== "other") patch.label = "";
    if (costNeedsTeam(category)) { if (!line.rate.trim()) patch.rate = String(settings.husk_loading_rate_per_1000); }
    else { patch.employee_id = ""; patch.rate = ""; }
    updateCostLine(index, patch);
  }

  function toggle(purchaseId: number, checked: boolean) {
    const available = kind === "husk" ? huskAvailableFor(purchaseId) : availableFor(purchaseId);
    setSelection((current) => {
      const next = new Map(current);
      if (checked) next.set(purchaseId, { pieces: String(Math.round(available)), wasted: "" });
      else next.delete(purchaseId);
      return next;
    });
  }

  function setPart(purchaseId: number, key: "pieces" | "wasted", value: string) {
    const available = kind === "husk" ? huskAvailableFor(purchaseId) : availableFor(purchaseId);
    setSelection((current) => {
      const entry = current.get(purchaseId) ?? { pieces: "", wasted: "" };
      // Pieces in the load plus wasted pieces can never exceed what is available.
      const other = key === "pieces" ? toNumber(entry.wasted) : toNumber(entry.pieces);
      const cap = Math.max(0, Math.floor(available) - other);
      const clamped = value === "" ? "" : String(Math.max(0, Math.min(Math.floor(toNumber(value)), cap)));
      return new Map(current).set(purchaseId, { ...entry, [key]: clamped });
    });
  }

  const setField = <K extends keyof SaleForm>(key: K, value: SaleForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  async function saveSale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    if (!form.buyer_id) { ws.fail("Choose the buyer for this sale."); return; }
    if (kind === "coconut") {
      if (allocatedPieces <= 0) { ws.fail("Tick at least one purchase and enter the pieces going in this load."); return; }
      for (const item of allocations) {
        const available = availableFor(item.purchase_id);
        if (item.quantity_pieces + item.wastage_pieces > available + 0.001) { ws.fail(`${formatPurchaseId(item.purchase_id)} only has ${formatNumber(available, 0)} pieces available for loading and wastage together.`); return; }
      }
    } else {
      if (huskPiecesSelected <= 0) { ws.fail("Tick at least one purchase and enter the husk pieces to sell."); return; }
      for (const item of huskAllocations) {
        const available = huskAvailableFor(item.purchase_id);
        if (item.quantity_pieces > available + 0.001) { ws.fail(`${formatPurchaseId(item.purchase_id)} only has ${formatNumber(available, 0)} husk pieces in hand.`); return; }
      }
    }
    if (calculation.quantity <= 0) { ws.fail(kind === "husk" ? "Tick the purchases whose husk you are selling." : form.unit === "kg" ? "Enter the net weight sold in kilograms." : "Enter the quantity sold."); return; }
    if (!form.rate) { ws.fail("Enter the sale rate."); return; }
    if (calculation.deduction > 0 && form.deduction_reason.trim().length < 2) { ws.fail("Add a reason for the deduction."); return; }
    if (calculation.advance > calculation.total) { ws.fail("Advance received cannot be more than the sale total."); return; }
    const paymentStatus: PaymentStatus = calculation.balance <= 0 ? "paid" : calculation.advance > 0 ? "partial" : "pending";
    ws.setSaving(true);
    const { data, error } = await supabase.rpc("save_sale", {
      sale_input: {
        id: form.id ?? null,
        buyer_id: Number(form.buyer_id),
        sale_kind: kind,
        product: kind === "husk" ? "husk" : "coconut",
        sale_date: form.sale_date,
        coconut_color: kind === "husk" ? "mixed" : form.coconut_color,
        processing_type: kind === "husk" ? "mixed" : form.processing_type,
        unit: form.unit,
        quantity: kind === "husk" ? huskPiecesSelected : calculation.quantity,
        rate: calculation.rate,
        coconut_quantity: kind === "coconut" ? allocatedPieces : 0,
        gross_weight_kg: useGrossTare && calculation.gross > 0 ? calculation.gross : null,
        empty_weight_kg: useGrossTare && calculation.gross > 0 ? calculation.empty : null,
        transport_charge: calculation.transport,
        deduction_amount: calculation.deduction,
        deduction_reason: calculation.deduction > 0 ? form.deduction_reason.trim() : null,
        other_charge_amount: calculation.otherCharge,
        other_charge_reason: buyerPaidTotal > 0 ? "Buyer pays: " + Array.from(new Set(costLines.filter((line) => line.who === "buyer" && lineAmount(line) > 0).map((line) => costLineLabel(line)))).join(", ") : null,
        advance_amount: calculation.advance,
        vehicle_id: form.vehicle_id ? Number(form.vehicle_id) : null,
        vehicle_number: form.vehicle_number.trim() || ws.vehicleById.get(Number(form.vehicle_id))?.vehicle_number || null,
        delivery_by_trader: kind === "husk" ? form.delivery_by_trader : false,
        husk_loading_rate_per_1000: delivering ? toNumber(form.husk_loading_rate_per_1000) : 0,
        husk_loading_employee_id: delivering && form.husk_loading_employee_id ? Number(form.husk_loading_employee_id) : null,
        husk_fuel_cost: delivering ? toNumber(form.husk_fuel_cost) : 0,
        husk_other_expense: delivering ? toNumber(form.husk_other_expense) : 0,
        payment_status: paymentStatus,
        notes: form.notes.trim() || null
      },
      items_input: kind === "coconut" ? allocations : [],
      husk_items_input: kind === "husk" ? huskAllocations : [],
      sale_costs_input: costLines.filter((line) => lineAmount(line) > 0).map((line) => ({ label: costStoredLabel(line), amount: lineAmount(line), employee_id: costNeedsTeam(line.category) && line.employee_id ? Number(line.employee_id) : null }))
    });
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    if (ws.session) discardDrafts(ws.session.user.id, draftForm);
    discardDraft();
    ws.notify(form.id ? `${formatSaleId(Number(data))} updated.` : `${formatSaleId(Number(data))} saved. Stock has been reduced for the included purchases.`);
    router.push(historyHref);
    await ws.refresh();
  }

  const unitLabel = form.unit === "kg" ? "kg" : form.unit === "piece" ? "pieces" : "loads";

  // Costs on this sale (both coconut and husk): a compact, left-to-right category list with a
  // who-pays choice. "+ Add cost" sits at the top; "Others" is the only category you can type.
  // Loading/unloading charge by a per-1,000 rate on the load's pieces, with an editable rate.
  const costsSection = (
    <fieldset className="deduction-options sale-costs"><legend>Your costs on this sale <span className="optional">Optional</span></legend>
      <div className="sale-costs-head"><button className="secondary-button" onClick={addCostLine} type="button">+ Add cost</button><span className="field-hint">Transport, driver, loading, unloading or other. Choose who pays: your own costs come off the margin, buyer-paid costs are added to the buyer&apos;s bill. Loading &amp; unloading are {formatNumber(effectivePieces, 0)} pieces ÷ 1,000 × the rate.</span></div>
      {costLines.length ? <div className="cost-lines">{costLines.map((line, index) => {
        const needsTeam = costNeedsTeam(line.category);
        return <div className="cost-line" key={index}>
          <select className="cost-cat-select" value={line.category} onChange={(event) => changeCostCategory(index, line, event.target.value as CostCategory)} aria-label="What this cost is for">{costCategories.map((cat) => <option key={cat.value} value={cat.value}>{cat.label}</option>)}</select>
          {line.category === "other" ? <input className="cost-other" value={line.label} onChange={(event) => updateCostLine(index, { label: event.target.value })} placeholder="Type the expense name" aria-label="Custom cost name" /> : null}
          {needsTeam ? <>
            <input className="cost-rate" type="number" min="0" step="0.01" value={line.rate} onChange={(event) => updateCostLine(index, { rate: event.target.value })} placeholder="Rate /1,000" aria-label="Rate per 1,000 pieces" title="Rate per 1,000 pieces" />
            {toNumber(line.rate) > 0
              ? <input className="cost-amount cost-amount-ro" type="text" value={formatCurrency(lineAmount(line))} readOnly tabIndex={-1} aria-label="Computed amount" title={`${formatNumber(effectivePieces, 0)} ÷ 1,000 × ${toNumber(line.rate)}`} />
              : <input className="cost-amount" type="number" min="0" step="0.01" value={line.amount} onChange={(event) => updateCostLine(index, { amount: event.target.value })} placeholder="Amount ₹" aria-label="Cost amount" />}
          </> : <input className="cost-amount" type="number" min="0" step="0.01" value={line.amount} onChange={(event) => updateCostLine(index, { amount: event.target.value })} placeholder="Amount ₹" aria-label="Cost amount" />}
          <select className="cost-who" value={line.who} onChange={(event) => updateCostLine(index, { who: event.target.value as CostWho })} aria-label="Who pays this cost"><option value="you">You pay</option><option value="buyer">Buyer pays</option></select>
          {needsTeam ? <select className="cost-team" value={line.employee_id} onChange={(event) => { if (event.target.value === "__add__") { setCostLoaderFor(index); setAddingLoader(true); return; } updateCostLine(index, { employee_id: event.target.value }); }} aria-label="Loading team for this cost"><option value="">No team</option>{costTeams.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}<option value="__add__">+ Add {kind === "husk" ? "husk" : "coconut"} loading team</option></select> : null}
          <button className="cost-remove" onClick={() => removeCostLine(index)} type="button" aria-label="Remove this cost">×</button>
        </div>;
      })}</div> : null}
      {costLoaderFor != null && addingLoader ? <div className="inline-form"><label>New {kind === "husk" ? "husk" : "coconut"} loading team name<input value={loaderName} onChange={(event) => setLoaderName(event.target.value)} placeholder="Worker or team name" autoFocus /></label><div className="row-actions"><button className="primary-button" disabled={ws.saving} onClick={addLoader} type="button">Add team</button><button className="link-button" onClick={() => { setAddingLoader(false); setCostLoaderFor(null); setLoaderName(""); }} type="button">Cancel</button></div></div> : null}
      {extraCostsTotal > 0 ? <p className="field-hint"><strong>You pay {formatCurrency(youPaidTotal)}{buyerPaidTotal > 0 ? ` · buyer pays ${formatCurrency(buyerPaidTotal)}` : ""}</strong>{youPaidTotal > 0 ? " — your share comes off the margin below." : ""}</p> : null}
    </fieldset>
  );

  return (
    <div className="stack">
      <DraftNotice show={formDraft.restored || selectionDraft.restored} what="sale" onDiscard={discardDraft} />
      {!form.id && !forcedKind ? <div className="segmented sale-kind"><button className={kind === "coconut" ? "active" : ""} onClick={() => { setKind("coconut"); setWeightEdited(false); setRateEdited(false); setForm((current) => ({ ...current, unit: "kg", buyer_id: "" })); }} type="button"><strong>Coconut load</strong><span>Sell coconut from purchases in stock</span></button><button className={kind === "husk" ? "active" : ""} onClick={() => { setKind("husk"); setWeightEdited(true); setRateEdited(true); setForm((current) => ({ ...current, unit: "piece", buyer_id: "", quantity: "", rate: "" })); setSelection(new Map()); }} type="button"><strong>Husk sale</strong><span>Sell husk kept from your purchases</span></button></div> : null}

      {kind === "coconut" ? <section className="ledger-panel select-table">
        <div className="panel-heading"><div className="step-heading"><span className="step-number">1</span><div><span className="eyebrow">Build the load</span><h2>Select purchases going to the buyer</h2></div></div><div className="chip-row"><span className="chip good">{formatNumber(allocatedPieces, 0)} pieces selected</span>{wastedPieces > 0 ? <span className="chip warn">{formatNumber(wastedPieces, 0)} wasted</span> : null}{allocatedPieces > 0 ? <span className="chip">{loadMix.mottaiPieces > 0 && loadMix.kudumePieces > 0 ? `Mottai ${formatNumber(loadMix.mottaiPieces, 0)} · Kudume ${formatNumber(loadMix.kudumePieces, 0)}` : loadMix.condition === "kudume" ? "Kudume" : "Mottai"}</span> : null}{allocatedKg > 0 ? <span className="chip">about {formatNumber(allocatedKg, 0)} kg from weighbridge purchases</span> : null}<span className="chip">Cost {formatCurrency(costBasis)}</span></div></div>
        <p className="muted-text">Tick each purchase that is being loaded. Reduce the pieces if only part of a purchase goes in this load; the rest stays in stock. Per-nut purchases appear here only after they are weighed on the <Link href="/dashboard/stock">Stock</Link> page. Enter wasted pieces for coconut found rotten or damaged while loading: they are taken off the stock for good and are not sold.</p>
        <div className="filter-bar">
          <label>Purchased from<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
          <label>To<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
          <label>Farmer<select value={filters.farmer} onChange={(event) => setFilters((current) => ({ ...current, farmer: event.target.value }))}><option value="">All farmers</option>{ws.farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name}</option>)}</select></label>
          <label className="checkbox-field"><input type="checkbox" checked={filters.onlyStock} onChange={(event) => setFilters((current) => ({ ...current, onlyStock: event.target.checked }))} /><span><strong>Only purchases with stock</strong></span></label>
        </div>
        <div className="table-wrap"><table><thead><tr><th></th><th>Purchase</th><th>Date</th><th>Farmer</th><th>Coconut</th><th>Available</th><th>Pieces in this load</th><th>Wasted pieces</th><th>Stays in stock</th><th>Cost / nut</th></tr></thead><tbody>
          {candidates.map((purchase) => {
            const available = availableFor(purchase.id);
            const selected = selection.has(purchase.id);
            const info = ws.stock.get(purchase.id);
            return <tr className={selected ? "selected" : available <= 0.5 ? "exhausted" : undefined} key={purchase.id}>
              <td><input type="checkbox" aria-label={`Include ${formatPurchaseId(purchase.id)}`} checked={selected} disabled={!selected && available <= 0.5} onChange={(event) => toggle(purchase.id, event.target.checked)} /></td>
              <td><strong>{formatPurchaseId(purchase.id)}</strong></td>
              <td>{formatDate(purchase.trade_date)}</td>
              <td>{ws.farmerById.get(purchase.farmer_id)?.name ?? "Farmer"}</td>
              <td><span className={`coconut-dot ${purchase.coconut_color}`}></span>{purchase.coconut_color}<span className="muted-text">{purchase.purchase_mode === "quantity" ? `${info?.stockCondition ?? "mottai"} · weighed into stock` : purchase.processing_type}</span></td>
              <td>{formatNumber(available, 0)} of {formatNumber(purchase.purchase_mode === "quantity" ? info?.stockedPieces ?? 0 : Number(purchase.coconut_quantity), 0)}{purchase.purchase_mode === "quantity" ? <span className="muted-text">in stock</span> : null}</td>
              <td>{selected ? <input type="number" min="0" max={Math.floor(available)} step="1" value={selection.get(purchase.id)?.pieces ?? ""} onChange={(event) => setPart(purchase.id, "pieces", event.target.value)} aria-label={`Pieces from ${formatPurchaseId(purchase.id)} in this load`} /> : <span className="muted-text">-</span>}</td>
              <td>{selected ? <input type="number" min="0" max={Math.floor(available)} step="1" value={selection.get(purchase.id)?.wasted ?? ""} onChange={(event) => setPart(purchase.id, "wasted", event.target.value)} placeholder="0" aria-label={`Wasted pieces from ${formatPurchaseId(purchase.id)}`} /> : <span className="muted-text">-</span>}</td>
              <td>{selected ? (() => { const entry = selection.get(purchase.id); const staying = Math.max(available - toNumber(entry?.pieces) - toNumber(entry?.wasted), 0); return staying > 0.5 ? <span className="chip good">{formatNumber(staying, 0)} stays in stock</span> : <span className="muted-text">Nothing left</span>; })() : <span className="muted-text">-</span>}</td>
              <td>{formatCurrency(info?.coconutCostPerPiece ?? 0)}</td>
            </tr>;
          })}
        </tbody></table>{candidates.length === 0 ? <p className="empty-state">No purchases with stock match these filters. Widen the dates or record a purchase first.</p> : null}</div>
        {allocations.length ? <div className="table-wrap"><table><thead><tr><th>Farmer side of this load</th><th>Farmer</th><th>Pieces in load</th><th>Wasted</th><th>Weight from purchase</th><th>Total spending</th></tr></thead><tbody>
          {allocations.map((item) => {
            const info = ws.stock.get(item.purchase_id);
            if (!info) return null;
            return <tr key={item.purchase_id}><td><strong>{formatPurchaseId(item.purchase_id)}</strong><span className="muted-text">{info.stockCondition}{info.purchase.purchase_mode === "quantity" ? " · from stock" : ""}</span></td><td>{ws.farmerById.get(info.purchase.farmer_id)?.name ?? "Farmer"}</td><td>{formatNumber(item.quantity_pieces, 0)}</td><td>{item.wastage_pieces > 0 ? <span className="balance-cell">{formatNumber(item.wastage_pieces, 0)}</span> : "-"}</td><td>{info.kgPerPiece > 0 ? `${formatNumber(item.quantity_pieces * info.kgPerPiece, 1)} kg` : "-"}</td><td className="balance-cell">{formatCurrency(item.quantity_pieces * (info.coconutCostPerPiece + info.dehuskingCostPerPiece + (purchaseLaborPerPiece.get(item.purchase_id) ?? 0)))}</td></tr>;
          })}
          <tr className="day-row"><td colSpan={2}>Total for this load</td><td>{formatNumber(allocatedPieces, 0)}</td><td>{wastedPieces > 0 ? formatNumber(wastedPieces, 0) : "-"}</td><td>{allocatedKg > 0 ? `${formatNumber(allocatedKg, 1)} kg` : "-"}</td><td className="balance-cell">{formatCurrency(totalSpending)}</td></tr>
        </tbody></table></div> : null}
      </section> : null}

      {kind === "husk" ? <section className="ledger-panel select-table">
        <div className="panel-heading"><div className="step-heading"><span className="step-number">1</span><div><span className="eyebrow">Pick the husk</span><h2>Select purchases whose husk you are selling</h2></div></div><div className="row-actions"><Link className="secondary-button" href="/dashboard/husk-purchases?returnTo=husk-sale">+ Add husk purchase</Link></div></div>
        <div className="chip-row"><span className={huskPiecesSelected > 0 ? "chip good" : "chip"}>{formatNumber(huskPiecesSelected, 0)} husk pieces selected</span><span className="chip">In hand {formatNumber(huskInHandTotal, 0)}</span><span className="chip">Husk cost {formatCurrency(huskCost)}</span></div>
        <p className="muted-text">Tick each purchase whose husk is going to the buyer, and reduce the pieces if only part is sold. Husk comes from weight-based purchases where you bought the husk, per-nut purchases after they are weighed on the <Link href="/dashboard/stock">Stock</Link> page, and husk you bought straight from a farmer. Per-nut husk cost you nothing, so it is pure profit.</p>
        <div className="filter-bar">
          <label>Purchased from<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
          <label>To<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
          <label>Farmer<select value={filters.farmer} onChange={(event) => setFilters((current) => ({ ...current, farmer: event.target.value }))}><option value="">All farmers</option>{ws.farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name}</option>)}</select></label>
        </div>
        <div className="table-wrap"><table><thead><tr><th></th><th>Purchase</th><th>Date</th><th>Farmer</th><th>Husk</th><th>In hand</th><th>Pieces to sell</th><th>Husk cost / piece</th></tr></thead><tbody>
          {huskCandidates.map((purchase) => {
            const available = huskAvailableFor(purchase.id);
            const selected = selection.has(purchase.id);
            const info = ws.husk.get(purchase.id);
            return <tr className={selected ? "selected" : available <= 0.5 ? "exhausted" : undefined} key={purchase.id}>
              <td><input type="checkbox" aria-label={`Include ${formatPurchaseId(purchase.id)}`} checked={selected} disabled={!selected && available <= 0.5} onChange={(event) => toggle(purchase.id, event.target.checked)} /></td>
              <td><strong>{formatPurchaseId(purchase.id)}</strong></td>
              <td>{formatDate(purchase.trade_date)}</td>
              <td>{ws.farmerById.get(purchase.farmer_id)?.name ?? "Farmer"}</td>
              <td>{info?.color ? <><span className={`coconut-dot ${info.color}`}></span>{info.color} husk</> : "-"}<span className="muted-text">{info && info.huskCostPerPiece > 0 ? "bought from farmer · cost" : info?.source === "stock" ? "from per-nut stock · no cost" : "kept with the coconut · no cost"}</span></td>
              <td>{formatNumber(available, 0)}</td>
              <td>{selected ? <input type="number" min="0" max={Math.floor(available)} step="1" value={selection.get(purchase.id)?.pieces ?? ""} onChange={(event) => setPart(purchase.id, "pieces", event.target.value)} aria-label={`Husk pieces from ${formatPurchaseId(purchase.id)}`} /> : <span className="muted-text">-</span>}</td>
              <td>{formatCurrency(info?.huskBasisPerPiece ?? 0)}</td>
            </tr>;
          })}
        </tbody></table>{huskCandidates.length === 0 ? <p className="empty-state">No husk in hand matches these filters. Buy husk on a weight-based purchase, or weigh per-nut coconut into stock first.</p> : null}</div>
      </section> : null}

      <div className="purchase-work">
        <form className="tool-panel" onSubmit={saveSale}>
          <div className="panel-heading"><div className="step-heading"><span className="step-number">2</span><div><span className="eyebrow">{form.id ? formatSaleId(form.id) : kind === "coconut" ? "Sale entry" : "Husk sale"}</span><h2>{form.id ? "Edit sale" : kind === "coconut" ? "Buyer and weighbridge details" : "Husk sale details"}</h2></div></div><div className="row-actions">{form.id ? <button className="link-button" onClick={() => { discardDraft(); setDraftScope(draftKey(ws.session?.user.id, draftForm, null)); router.push(newHref); }} type="button">Cancel edit</button> : ((form.buyer_id || form.quantity || form.rate || allocatedPieces > 0 || huskPiecesSelected > 0 || form.notes.trim()) ? <button className="secondary-button" onClick={discardSale} type="button">Discard</button> : null)}<Link className="secondary-button" href={historyHref}>Sales history</Link></div></div>
          <div className="form-grid">
            <label>Buyer<select value={form.buyer_id} onChange={(event) => { const value = event.target.value; if (value === "__add__") { router.push("/dashboard/buyers?returnTo=sale"); return; } setField("buyer_id", value); }} required><option value="__add__">+ Add buyer</option><option value="">Select a buyer</option>{buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}{buyer.business_name ? ` - ${buyer.business_name}` : ""}</option>)}</select>{buyers.length === 0 ? <span className="field-hint">No {kind} buyers yet. Add one from the Buyers page.</span> : null}</label>
            <label>Sale date<input type="date" value={form.sale_date} onChange={(event) => setField("sale_date", event.target.value)} required /></label>
            {kind === "coconut" ? <label>Sold by<select value={form.unit} onChange={(event) => setField("unit", event.target.value as SaleUnit)}><option value="kg">Weight (kg)</option><option value="piece">Pieces</option></select></label> : null}
            <label>Rate (INR per {form.unit === "kg" ? "kg" : form.unit === "piece" ? "piece" : "load"})<input type="number" min="0" step="0.01" value={form.rate} onChange={(event) => { setRateEdited(true); setField("rate", event.target.value); }} required />{kind === "coconut" && form.unit === "kg" && estimatedRate > 0 ? (!rateEdited ? <span className="field-hint">Pre-filled from the stock entry price ({formatCurrency(estimatedRate)} / kg). Change it to the rate agreed with the buyer.</span> : toNumber(form.rate) !== estimatedRate ? <button className="link-button" onClick={() => { setRateEdited(false); setField("rate", String(estimatedRate)); }} type="button">Use stock entry price ({formatCurrency(estimatedRate)} / kg)</button> : null) : null}</label>
          </div>
          {form.unit === "kg" ? <fieldset className="deduction-options"><legend>Weighbridge weight</legend>
            <div className="form-grid">
              <label>Net weight (kg)<input type="number" min="0.001" step="0.001" value={form.quantity} onChange={(event) => { setWeightEdited(true); setField("quantity", event.target.value); }} readOnly={useGrossTare && calculation.gross > 0} required /><span className="field-hint">{useGrossTare ? "Calculated as gross minus empty weight." : !weightEdited && estimatedQuantity > 0 ? `Pre-filled from the purchase and stock weights (${formatNumber(estimatedQuantity)} kg). Replace it with the weighbridge slip figure if it differs.` : "Enter the net weight from the slip, or switch to gross and empty weights."}</span>{!useGrossTare && weightEdited && kind === "coconut" && estimatedQuantity > 0 && toNumber(form.quantity) !== estimatedQuantity ? <button className="link-button" onClick={() => { setWeightEdited(false); setField("quantity", String(estimatedQuantity)); }} type="button">Use purchase weight ({formatNumber(estimatedQuantity)} kg)</button> : null}</label>
              {useGrossTare ? <>
                <label>Gross weight (kg)<input type="number" min="0" step="0.001" value={form.gross_weight_kg} onChange={(event) => setField("gross_weight_kg", event.target.value)} placeholder="Loaded vehicle" /></label>
                <label>Empty / tare weight (kg)<input type="number" min="0" step="0.001" value={form.empty_weight_kg} onChange={(event) => setField("empty_weight_kg", event.target.value)} placeholder="Empty vehicle" /></label>
              </> : null}
            </div>
            <button className="link-button" onClick={() => setUseGrossTare((value) => !value)} type="button">{useGrossTare ? "Enter net weight directly instead" : "Calculate from gross and empty weight"}</button>
          </fieldset> : kind === "husk" ? <label>Husk pieces to sell<input type="number" value={form.quantity} readOnly placeholder="0" /><span className="field-hint">Total husk pieces ticked above. Change the per-purchase pieces in the table to adjust it.</span></label> : <label>Quantity ({unitLabel})<input type="number" min="0.01" step={form.unit === "piece" ? "1" : "0.01"} value={form.quantity} onChange={(event) => { setWeightEdited(true); setField("quantity", event.target.value); }} required />{form.unit === "piece" && allocatedPieces > 0 && toNumber(form.quantity) !== allocatedPieces ? <button className="link-button" onClick={() => { setWeightEdited(false); setField("quantity", String(allocatedPieces)); }} type="button">Use {formatNumber(allocatedPieces, 0)} allocated pieces</button> : null}</label>}
          {kind === "husk" ? <>
            <fieldset className="deduction-options"><legend>Delivery</legend>
              <label className="checkbox-field"><input type="checkbox" checked={form.delivery_by_trader} onChange={(event) => { const on = event.target.checked; setForm((current) => ({ ...current, delivery_by_trader: on, husk_loading_rate_per_1000: on && !current.husk_loading_rate_per_1000.trim() ? String(settings.husk_loading_rate_per_1000) : current.husk_loading_rate_per_1000 })); }} /><span><strong>I deliver the husk to the buyer</strong><small>Leave off when the buyer collects it — then there are no delivery costs. Turn on to add loading, fuel and other costs and the vehicle; they are booked under Expenses and taken off the margin.</small></span></label>
              {form.delivery_by_trader ? <>
                <div className="form-grid">
                  <label>Husk loading worker{huskLoaders.length ? <select value={form.husk_loading_employee_id} onChange={(event) => { if (event.target.value === "__add__") { setCostLoaderFor(null); setAddingLoader(true); return; } setField("husk_loading_employee_id", event.target.value); }}><option value="">Not recorded</option>{huskLoaders.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}<option value="__add__">+ Add husk loading worker</option></select> : <button className="secondary-button" onClick={() => { setCostLoaderFor(null); setAddingLoader(true); }} type="button">+ Add husk loading worker</button>}</label>
                  <label>Loading rate per 1,000 pieces (INR)<input type="number" min="0" step="0.01" value={form.husk_loading_rate_per_1000} onChange={(event) => setField("husk_loading_rate_per_1000", event.target.value)} placeholder={String(settings.husk_loading_rate_per_1000)} /><span className="field-hint">Default from Settings. Loading cost = pieces ÷ 1,000 × this rate.</span></label>
                  <label>Vehicle fuel cost (INR)<input type="number" min="0" step="0.01" value={form.husk_fuel_cost} onChange={(event) => setField("husk_fuel_cost", event.target.value)} /></label>
                  <label>Other expenses (INR)<input type="number" min="0" step="0.01" value={form.husk_other_expense} onChange={(event) => setField("husk_other_expense", event.target.value)} /></label>
                  <label>Vehicle number <span className="optional">Optional</span><input value={form.vehicle_number} onChange={(event) => setField("vehicle_number", event.target.value.toUpperCase())} placeholder="TN 00 AB 0000" /></label>
                </div>
                {addingLoader && costLoaderFor == null ? <div className="inline-form"><label>New husk loading worker name<input value={loaderName} onChange={(event) => setLoaderName(event.target.value)} placeholder="Worker or team name" autoFocus /></label><div className="row-actions"><button className="primary-button" disabled={ws.saving} onClick={addLoader} type="button">Add worker</button><button className="link-button" onClick={() => { setAddingLoader(false); setLoaderName(""); }} type="button">Cancel</button></div></div> : null}
              </> : null}
              <span className="field-hint">These costs apply only when you deliver. Loading is booked as husk loading labor, fuel as diesel, and other as a husk expense — all under Expenses and reflected in the margin.</span>
            </fieldset>
            <label>Advance received (INR)<input type="number" min="0" step="0.01" value={form.advance_amount} onChange={(event) => setField("advance_amount", event.target.value)} /><span className="field-hint">Later receipts are recorded from Sales history.</span></label>
          </> : <div className="form-grid">
            <label>Vehicle number <span className="optional">Optional</span><input value={form.vehicle_number} onChange={(event) => setField("vehicle_number", event.target.value.toUpperCase())} placeholder="TN 00 AB 0000" /></label>
          </div>}
          {costsSection}
          <label>Notes <span className="optional">Optional</span><textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="Quality, market, delivery note" /></label>
          {ws.error ? <p className="error-message form-error" role="alert">{ws.error}</p> : null}
          <button className="primary-button" disabled={ws.saving} type="submit">{ws.saving ? "Saving..." : form.id ? "Update sale" : "Save sale"}</button>
        </form>
        <DraggablePanel title="Live calculation" storageKey="sale-calc">
          <section className="calculation-panel"><span className="eyebrow">Live calculation</span><h2>{kind === "coconut" ? "Load summary" : "Husk sale summary"}</h2><dl className="calculation-list">
            {kind === "coconut" ? <><div><dt>Pieces in load</dt><dd>{formatNumber(allocatedPieces, 0)} pieces</dd></div>{wastedPieces > 0 ? <div className="calculation-deduction"><dt>Wasted pieces removed from stock</dt><dd>{formatNumber(wastedPieces, 0)} pieces</dd></div> : null}<div><dt>Coconut condition</dt><dd>{allocatedPieces > 0 ? (loadMix.mottaiPieces > 0 && loadMix.kudumePieces > 0 ? `${loadMix.condition === "kudume" ? "Kudume" : "Mottai"} (Mottai ${formatNumber(loadMix.mottaiPieces, 0)} · Kudume ${formatNumber(loadMix.kudumePieces, 0)})` : loadMix.condition === "kudume" ? "Kudume" : "Mottai") : "-"}</dd></div>{form.unit === "kg" ? <div><dt>Average weight per nut<small className="formula">{formatNumber(calculation.quantity)} kg ÷ {formatNumber(allocatedPieces, 0)} pieces</small></dt><dd>{allocatedPieces > 0 && calculation.quantity > 0 ? `${formatNumber(calculation.averageKgPerNut * 1000, 1)} g / nut` : "-"}</dd></div> : null}<div><dt>Sale price per nut<small className="formula">{formatCurrency(calculation.saleAmount)} ÷ {formatNumber(allocatedPieces, 0)} pieces</small></dt><dd>{allocatedPieces > 0 ? `${formatCurrency(calculation.pricePerPiece)} / nut` : "-"}</dd></div></> : null}
            <div><dt>{form.unit === "kg" ? "Net weight" : "Quantity"}</dt><dd>{formatNumber(calculation.quantity)} {unitLabel}</dd></div>
            <div className="calculation-credit"><dt>Sale amount<small className="formula">{formatNumber(calculation.quantity)} {unitLabel} × {formatCurrency(calculation.rate)}</small></dt><dd>{formatCurrency(calculation.saleAmount)}</dd></div>
            {calculation.transport > 0 ? <div className="calculation-credit"><dt>Transport charged</dt><dd>{formatCurrency(calculation.transport)}</dd></div> : null}
            {buyerPaidTotal > 0 ? <div className="calculation-credit"><dt>Buyer-paid costs<small className="formula">added to the buyer&apos;s bill</small></dt><dd>{formatCurrency(buyerPaidTotal)}</dd></div> : null}
            {calculation.deduction > 0 ? <div className="calculation-deduction"><dt>Deduction</dt><dd>{formatCurrency(calculation.deduction)}</dd></div> : null}
            <div className="calculation-total"><dt>Buyer pays<small className="formula">{formatCurrency(calculation.saleAmount)}{calculation.transport > 0 ? ` + ${formatCurrency(calculation.transport)} transport` : ""}{calculation.otherCharge > 0 ? ` + ${formatCurrency(calculation.otherCharge)} buyer-paid costs` : ""}{calculation.deduction > 0 ? ` − ${formatCurrency(calculation.deduction)} deduction` : ""}</small></dt><dd>{formatCurrency(calculation.total)}</dd></div>
            <div><dt>Advance received</dt><dd>{formatCurrency(calculation.advance)}</dd></div>
            <div className="calculation-total"><dt>Balance receivable<small className="formula">{formatCurrency(calculation.total)} − {formatCurrency(calculation.advance)}</small></dt><dd>{formatCurrency(calculation.balance)}</dd></div>
            {kind === "coconut" ? <><div className="calculation-deduction calculation-spent"><dt>Total spending on this stock<small className="formula">paid to farmers {formatCurrency(costBasis)}{stockDehusking > 0 ? ` + dehusking ${formatCurrency(stockDehusking)}` : ""}{laborSpending > 0 ? ` + labour ${formatCurrency(laborSpending)}` : ""}</small></dt><dd>{formatCurrency(totalSpending)}</dd></div>{wastageLoss > 0 ? <div className="calculation-deduction"><dt>Wastage loss<small className="formula">spoiled while loading</small></dt><dd>{formatCurrency(wastageLoss)}</dd></div> : null}{extraCostsTotal > 0 ? <div className="calculation-deduction"><dt>Sale costs<small className="formula">you {formatCurrency(youPaidTotal)}{buyerPaidTotal > 0 ? ` + buyer-paid ${formatCurrency(buyerPaidTotal)}` : ""}</small></dt><dd>{formatCurrency(extraCostsTotal)}</dd></div> : null}<div className={margin >= 0 ? "calculation-credit" : "calculation-deduction"}><dt>{`Margin${wastageLoss > 0 ? " after wastage" : ""}`}<small className="formula">buyer pays {formatCurrency(calculation.total)} − {formatCurrency(totalSpending)}{wastageLoss > 0 ? ` − ${formatCurrency(wastageLoss)}` : ""}{extraCostsTotal > 0 ? ` − ${formatCurrency(extraCostsTotal)} your costs` : ""}</small></dt><dd>{formatCurrency(margin)}</dd></div></> : null}
            {kind === "husk" ? <><div className="calculation-deduction calculation-spent"><dt>Husk cost<small className="formula">{huskCost > 0 ? "paid to farmers for husk you bought" : "byproduct husk · cost you nothing"}</small></dt><dd>{formatCurrency(huskCost)}</dd></div>{huskLoadingCost > 0 ? <div className="calculation-deduction"><dt>Loading{form.husk_loading_employee_id ? <small className="formula">{ws.employeeById.get(Number(form.husk_loading_employee_id))?.name ?? ""}</small> : null}<small className="formula">{formatNumber(huskPiecesSelected, 0)} ÷ 1,000 × {formatCurrency(toNumber(form.husk_loading_rate_per_1000))}</small></dt><dd>{formatCurrency(huskLoadingCost)}</dd></div> : null}{huskFuelCost > 0 ? <div className="calculation-deduction"><dt>Vehicle fuel</dt><dd>{formatCurrency(huskFuelCost)}</dd></div> : null}{huskOtherCost > 0 ? <div className="calculation-deduction"><dt>Other delivery expense</dt><dd>{formatCurrency(huskOtherCost)}</dd></div> : null}{extraCostsTotal > 0 ? <div className="calculation-deduction"><dt>Sale costs<small className="formula">you {formatCurrency(youPaidTotal)}{buyerPaidTotal > 0 ? ` + buyer-paid ${formatCurrency(buyerPaidTotal)}` : ""}</small></dt><dd>{formatCurrency(extraCostsTotal)}</dd></div> : null}<div className={huskMargin >= 0 ? "calculation-credit" : "calculation-deduction"}><dt>Margin<small className="formula">buyer pays {formatCurrency(calculation.total)} − {formatCurrency(huskCost)} husk cost{huskDeliveryCost > 0 ? ` − ${formatCurrency(huskDeliveryCost)} delivery` : ""}{extraCostsTotal > 0 ? ` − ${formatCurrency(extraCostsTotal)} your costs` : ""}</small></dt><dd>{formatCurrency(huskMargin)}</dd></div></> : null}
          </dl><p className="field-hint">{kind === "coconut" ? "Buyer pays is the full load value after any deduction and reimbursed charges. Total spending is what this stock cost you — paid to the farmers for these pieces (including any wasted at the Stock stage), dehusking booked there, and the dehusking/harvesting wages you pay the teams for these purchases. Margin is buyer pays minus that spend, so it is the true take-home and matches the Dashboard. Husk is sold separately; transport, loading and other costs you pay go under Expenses." : "Buyer pays is the full husk bill after any deduction and reimbursed charges. Husk cost is what the husk cost you — the credit paid to the farmer for husk you bought, and nothing for byproduct husk (kept with the coconut or from per-nut stock). Margin is buyer pays minus that cost, so byproduct husk is pure profit. The realised husk profit then shows on the purchase in Purchase history. Record any loading wages under Expenses."}</p></section>
        </DraggablePanel>
      </div>
    </div>
  );
}

export default function NewSalePage() {
  return <SaleEntry forcedKind="coconut" />;
}
