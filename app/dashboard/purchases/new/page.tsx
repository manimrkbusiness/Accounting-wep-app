"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { supabase } from "../../../supabaseClient";
import { useWorkspace } from "../../lib/workspace";
import { draftKey, queryNumber, useDraft } from "../../lib/useDraft";
import { DraftNotice } from "../../components/DraftNotice";
import { calculatePurchase } from "../../lib/calc";
import { formatCurrency, formatDate, formatNumber, formatPurchaseId, today, toNumber } from "../../lib/format";
import { coconutColors, huskColors, huskColorForCoconut, processingTypes, type CoconutColor, type HuskColor, type PaymentStatus, type Purchase, type PurchaseMode, type TraderSettings } from "../../lib/types";
import { defaultSettings } from "../../components/CostSettingsPanel";

type LaborMode = "none" | "farmer" | "trader";

type PurchaseForm = {
  id?: number;
  farmer_id: string;
  location_id: string;
  trade_date: string;
  coconut_color: CoconutColor;
  purchase_mode: PurchaseMode;
  processing_type: "mottai" | "kudume";
  coconut_quantity: string;
  dehusking_pieces: string;
  harvesting_pieces: string;
  net_weight_kg: string;
  wastage_percent: string;
  rate_per_kg: string;
  rate_per_piece: string;
  husk_removal_rate_per_1000: string;
  tree_collection_rate_per_1000: string;
  husk_price_per_piece: string;
  buys_husk: boolean;
  husk_color: HuskColor;
  husk_pieces: string;
  deduct_dehusking: boolean;
  deduct_harvesting: boolean;
  advance_amount: string;
  additional_credit_amount: string;
  additional_credit_reason: string;
  additional_debit_amount: string;
  additional_debit_reason: string;
  notes: string;
  // Harvested coconuts this purchase is made from (new purchases only).
  harvest_ids: number[];
  additional_pieces: string;
  additional_head_id: string;
  additional_rate: string;
  // "Weight + husk" method: farmer paid full weight, trader dehusks and keeps the husk.
  husk_included: boolean;
  trader_dehusking_rate_per_1000: string;
  // Who bears dehusking / harvesting: the farmer (deducted) or the trader (paid to a team).
  dehusking_mode: LaborMode;
  harvesting_mode: LaborMode;
  dehusking_team_id: string;
  harvesting_team_id: string;
};

function blankForm(settings: TraderSettings): PurchaseForm {
  return {
    farmer_id: "",
    location_id: "",
    trade_date: today(),
    coconut_color: "green",
    purchase_mode: settings.purchase_mode,
    processing_type: "mottai",
    coconut_quantity: "",
    dehusking_pieces: "",
    harvesting_pieces: "",
    net_weight_kg: "",
    wastage_percent: "0",
    rate_per_kg: "",
    rate_per_piece: "",
    husk_removal_rate_per_1000: String(settings.husk_removal_rate_per_1000),
    tree_collection_rate_per_1000: String(settings.tree_collection_rate_per_1000),
    husk_price_per_piece: String(settings.husk_price_green_per_piece),
    buys_husk: Number(settings.husk_price_green_per_piece) > 0,
    husk_color: "green",
    husk_pieces: "",
    deduct_dehusking: Number(settings.husk_removal_rate_per_1000) > 0,
    deduct_harvesting: Number(settings.tree_collection_rate_per_1000) > 0,
    advance_amount: "0",
    additional_credit_amount: "0",
    additional_credit_reason: "",
    additional_debit_amount: "0",
    additional_debit_reason: "",
    notes: "",
    harvest_ids: [],
    additional_pieces: "",
    additional_head_id: "",
    additional_rate: String(settings.tree_collection_rate_per_1000),
    husk_included: false,
    trader_dehusking_rate_per_1000: String(settings.husk_removal_rate_per_1000),
    dehusking_mode: Number(settings.husk_removal_rate_per_1000) > 0 ? "farmer" : "none",
    harvesting_mode: Number(settings.tree_collection_rate_per_1000) > 0 ? "farmer" : "none",
    dehusking_team_id: "",
    harvesting_team_id: ""
  };
}

function formFromPurchase(purchase: Purchase, settings: TraderSettings): PurchaseForm {
  // A deduction that was unchecked is stored as a 0 rate. Load the current default
  // instead, so ticking the box on edit applies a real deduction.
  const dehuskingRate = Number(purchase.husk_removal_rate_per_1000) > 0 ? purchase.husk_removal_rate_per_1000 : Number(purchase.trader_dehusking_rate_per_1000) > 0 ? purchase.trader_dehusking_rate_per_1000 : settings.husk_removal_rate_per_1000;
  const harvestingRate = Number(purchase.tree_collection_rate_per_1000) > 0 ? purchase.tree_collection_rate_per_1000 : Number(purchase.trader_harvesting_rate_per_1000) > 0 ? purchase.trader_harvesting_rate_per_1000 : settings.tree_collection_rate_per_1000;
  const dehuskingMode: LaborMode = Number(purchase.husk_removal_rate_per_1000) > 0 ? "farmer" : Number(purchase.trader_dehusking_rate_per_1000) > 0 ? "trader" : "none";
  const harvestingMode: LaborMode = Number(purchase.tree_collection_rate_per_1000) > 0 ? "farmer" : Number(purchase.trader_harvesting_rate_per_1000) > 0 ? "trader" : "none";
  return {
    id: purchase.id,
    farmer_id: String(purchase.farmer_id),
    location_id: purchase.location_id ? String(purchase.location_id) : "",
    trade_date: purchase.trade_date,
    coconut_color: purchase.coconut_color,
    purchase_mode: purchase.purchase_mode,
    processing_type: purchase.processing_type,
    coconut_quantity: String(purchase.coconut_quantity),
    dehusking_pieces: purchase.dehusking_pieces != null ? String(purchase.dehusking_pieces) : "",
    harvesting_pieces: purchase.harvesting_pieces != null ? String(purchase.harvesting_pieces) : "",
    net_weight_kg: String(purchase.net_weight_kg),
    wastage_percent: String(purchase.wastage_percent),
    rate_per_kg: String(purchase.rate_per_kg),
    rate_per_piece: String(purchase.rate_per_piece ?? 0),
    husk_removal_rate_per_1000: String(dehuskingRate),
    tree_collection_rate_per_1000: String(harvestingRate),
    husk_price_per_piece: String(purchase.husk_price_per_piece ?? 0),
    buys_husk: purchase.buys_husk,
    husk_color: purchase.husk_color ?? huskColorForCoconut(purchase.coconut_color),
    husk_pieces: purchase.husk_pieces != null ? String(purchase.husk_pieces) : "",
    deduct_dehusking: Number(purchase.husk_removal_rate_per_1000) > 0,
    deduct_harvesting: Number(purchase.tree_collection_rate_per_1000) > 0,
    advance_amount: String(purchase.advance_amount),
    additional_credit_amount: String(purchase.additional_credit_amount ?? 0),
    additional_credit_reason: purchase.additional_credit_reason ?? "",
    additional_debit_amount: String(purchase.additional_debit_amount ?? 0),
    additional_debit_reason: purchase.additional_debit_reason ?? "",
    notes: purchase.notes ?? "",
    harvest_ids: [],
    additional_pieces: "",
    additional_head_id: "",
    additional_rate: String(harvestingRate),
    husk_included: purchase.husk_included,
    trader_dehusking_rate_per_1000: Number(purchase.trader_dehusking_rate_per_1000) > 0 ? String(purchase.trader_dehusking_rate_per_1000) : String(settings.husk_removal_rate_per_1000),
    dehusking_mode: dehuskingMode,
    harvesting_mode: harvestingMode,
    dehusking_team_id: purchase.dehusking_team_id ? String(purchase.dehusking_team_id) : "",
    harvesting_team_id: purchase.harvesting_team_id ? String(purchase.harvesting_team_id) : ""
  };
}

export default function NewPurchasePage() {
  const ws = useWorkspace();
  const router = useRouter();
  const settings = ws.settings ?? defaultSettings;
  // The form is kept as a draft until saved, so moving to another page does not lose it.
  const [draftScope, setDraftScope] = useState(() => draftKey(ws.session?.user.id, "purchase", queryNumber("edit")));
  const draft = useDraft<PurchaseForm>(draftScope, () => blankForm(settings));
  const form = draft.value;
  const setForm = draft.setValue;
  const [loadedEdit, setLoadedEdit] = useState<number | null>(null);
  const [showCredit, setShowCredit] = useState(() => toNumber(draft.value.additional_credit_amount) > 0);
  const [showDebit, setShowDebit] = useState(() => toNumber(draft.value.additional_debit_amount) > 0);
  const [rateEditor, setRateEditor] = useState<"dehusking" | "harvesting" | "husk" | null>(null);
  const [rateDraft, setRateDraft] = useState("");
  const farmerParamApplied = useRef(false);
  const harvestParamApplied = useRef(false);

  // Arriving from "Save & record purchase" on Coconut Harvesting: start a fresh purchase
  // pre-filled from that harvest (farmer, location and the harvest itself). The existing
  // effects then fill the coconut quantity and harvesting pay from the picked harvest.
  useEffect(() => {
    if (harvestParamApplied.current) return;
    const harvestId = Number(new URLSearchParams(window.location.search).get("harvest"));
    if (!harvestId) return;
    const entry = ws.harvestingEntries.find((e) => e.id === harvestId);
    if (!entry) return; // harvests may still be loading; apply once they are here
    harvestParamApplied.current = true;
    if (entry.purchase_id) { ws.fail("That harvest is already linked to a purchase."); return; }
    const base = blankForm(ws.settings ?? defaultSettings);
    draft.clear({ ...base, farmer_id: entry.farmer_id ? String(entry.farmer_id) : "", location_id: entry.location_id ? String(entry.location_id) : "", harvest_ids: [harvestId] });
    router.replace("/dashboard/purchases/new");
  }, [ws.harvestingEntries, ws.settings, draft, router, ws]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = Number(params.get("edit"));
    const farmerParam = Number(params.get("farmer"));
    if (editId && editId !== loadedEdit) {
      const purchase = ws.purchaseById.get(editId);
      if (purchase) {
        if (!draft.wasRestored) {
          setForm(formFromPurchase(purchase, ws.settings ?? defaultSettings));
          setShowCredit(Number(purchase.additional_credit_amount) > 0);
          setShowDebit(Number(purchase.additional_debit_amount) > 0);
        }
        setLoadedEdit(editId);
      }
    } else if (!editId && !form.id && ws.settings && !draft.wasRestored) {
      setForm((current) => current.coconut_quantity || current.farmer_id ? current : blankForm(ws.settings ?? defaultSettings));
    }
    // Coming back from "+ Add farmer": select the farmer that was just added.
    if (farmerParam && !farmerParamApplied.current && ws.farmerById.has(farmerParam)) {
      farmerParamApplied.current = true;
      setForm((current) => current.farmer_id === String(farmerParam) ? current : { ...current, farmer_id: String(farmerParam), location_id: "", harvest_ids: [] });
    }
  }, [ws.purchaseById, ws.farmerById, ws.settings, loadedEdit, form.id, draft.wasRestored, setForm]);

  function discardDraft() {
    draft.clear(blankForm(settings));
    setShowCredit(false);
    setShowDebit(false);
    setLoadedEdit(null);
  }
  // Always-available way to clear a new purchase, e.g. to switch to a different farmer.
  function discardPurchase() {
    if (!window.confirm("Discard this purchase and clear the form?")) return;
    ws.clearFeedback();
    discardDraft();
  }

  const calculation = useMemo(() => calculatePurchase(form), [form]);
  // The three purchase methods: plain weight, weight + husk, and per nut.
  const method: "weight" | "weight_husk" | "quantity" = form.purchase_mode === "quantity" ? "quantity" : form.husk_included ? "weight_husk" : "weight";
  // Weight + husk: the husk kept to resell (shown in the summary as an estimate).
  const huskKeptPieces = form.husk_pieces.trim() ? calculation.huskPieces : calculation.quantity;
  const farmerLocations = useMemo(() => ws.locations.filter((location) => location.farmer_id === Number(form.farmer_id)), [ws.locations, form.farmer_id]);
  // Only the harvesting team can be named as who harvested; dehuskers and loaders are their own teams.
  const harvesters = useMemo(() => ws.employees.filter((emp) => emp.active && emp.role === "harvester"), [ws.employees]);
  const dehuskers = useMemo(() => ws.employees.filter((emp) => emp.active && emp.role === "dehusker"), [ws.employees]);
  const allocated = form.id ? ws.stock.get(form.id)?.soldPieces ?? 0 : 0;
  const purchaseHasContent = Boolean(form.farmer_id || form.coconut_quantity || form.net_weight_kg || form.rate_per_kg || form.rate_per_piece || form.harvest_ids.length || form.notes.trim());

  // Harvested coconuts this new purchase is built from. Once a harvest is linked to a
  // purchase it drops out of this list, so it only shows again in Coconut Harvesting history.
  const unlinkedHarvests = useMemo(() => ws.harvestingEntries.filter((entry) => !entry.purchase_id), [ws.harvestingEntries]);
  const selectedHarvests = useMemo(() => ws.harvestingEntries.filter((entry) => form.harvest_ids.includes(entry.id)), [ws.harvestingEntries, form.harvest_ids]);
  // The dropdown excludes ones already picked, and keeps to the chosen farmer so a load is from one farmer.
  const availableHarvests = useMemo(() => unlinkedHarvests.filter((entry) => !form.harvest_ids.includes(entry.id) && (!form.farmer_id || !entry.farmer_id || String(entry.farmer_id) === form.farmer_id)), [unlinkedHarvests, form.harvest_ids, form.farmer_id]);
  const selectedHarvestPieces = selectedHarvests.reduce((sum, entry) => sum + Number(entry.coconut_quantity), 0);
  // Once a harvest is picked, the farmer and location are fixed to it; the user edits pieces
  // and labor only, and removes the harvest to change the farmer or location.
  const harvestLocked = selectedHarvests.length > 0;
  // Who the picked harvests were done by, so the purchase can show it instead of asking again.
  const selectedHeadNames = useMemo(() => {
    const names = selectedHarvests.map((entry) => entry.head_employee_id ? ws.employeeById.get(entry.head_employee_id)?.name : entry.team_id ? ws.harvestingTeamById.get(entry.team_id)?.name : null).filter((name): name is string => Boolean(name));
    return Array.from(new Set(names));
  }, [selectedHarvests, ws.employeeById, ws.harvestingTeamById]);
  const additionalPieces = Math.max(toNumber(form.additional_pieces), 0);
  const harvestTotal = selectedHarvestPieces + additionalPieces;
  const harvestAutoRef = useRef(0);
  const harvestingPiecesAutoRef = useRef("");

  function addHarvest(id: number) {
    const entry = ws.harvestingEntries.find((e) => e.id === id);
    if (!entry) return;
    setForm((current) => {
      const next: PurchaseForm = { ...current, harvest_ids: current.harvest_ids.includes(id) ? current.harvest_ids : [...current.harvest_ids, id] };
      // Pre-fill the farmer and location from the harvest when the purchase does not have them yet.
      if (!current.farmer_id && entry.farmer_id) next.farmer_id = String(entry.farmer_id);
      if (!current.location_id && entry.location_id) next.location_id = String(entry.location_id);
      return next;
    });
  }
  function removeHarvest(id: number) {
    setForm((current) => ({ ...current, harvest_ids: current.harvest_ids.filter((x) => x !== id) }));
  }

  // Prefill the purchase quantity from the harvested total, unless it was typed manually.
  useEffect(() => {
    if (form.id || harvestTotal <= 0) return;
    setForm((current) => (current.coconut_quantity === "" || current.coconut_quantity === String(harvestAutoRef.current)) ? { ...current, coconut_quantity: String(harvestTotal) } : current);
    harvestAutoRef.current = harvestTotal;
  }, [harvestTotal, form.id, setForm]);

  // The harvesting labor is for what the team actually harvested, not the whole lorry load.
  // Default "Pieces harvested by the team" to the picked harvests, so bumping the coconut
  // quantity for extra coconuts the farmer already had in hand does not inflate this cost.
  // Blank (nothing picked) keeps the old behaviour of defaulting to the full quantity.
  useEffect(() => {
    if (form.id) return;
    const target = selectedHarvestPieces > 0 ? String(selectedHarvestPieces) : "";
    setForm((current) => (current.harvesting_pieces === "" || current.harvesting_pieces === harvestingPiecesAutoRef.current) ? { ...current, harvesting_pieces: target } : current);
    harvestingPiecesAutoRef.current = target;
  }, [selectedHarvestPieces, form.id, setForm]);

  async function savePurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    if (!form.farmer_id || !form.location_id) { ws.fail("Choose a farmer and farming location."); return; }
    if (calculation.quantity <= 0) { ws.fail("Enter the coconut quantity in pieces so labor costs can be calculated."); return; }
    if (form.id && calculation.quantity + 0.001 < allocated) { ws.fail(`${formatNumber(allocated, 0)} pieces of this purchase are already in sales. Reduce those sales first.`); return; }
    if (calculation.purchaseMode === "weight") {
      if (calculation.net <= 0) { ws.fail("Enter the net weight in kilograms from the weighbridge."); return; }
      if (!form.rate_per_kg || toNumber(form.rate_per_kg) < 0) { ws.fail("Enter the purchase rate per kilogram."); return; }
      if (form.dehusking_mode === "trader" && !form.dehusking_team_id) { ws.fail("Pick the team you pay for dehusking, or switch it to Farmer pays."); return; }
      if (form.harvesting_mode === "trader" && !form.harvesting_team_id) { ws.fail("Pick the team you pay for harvesting, or switch it to Farmer pays."); return; }
    } else if (!form.rate_per_piece || toNumber(form.rate_per_piece) < 0) { ws.fail("Enter the purchase rate per coconut."); return; }
    if (calculation.advance > calculation.total) { ws.fail("Advance cannot be greater than the calculated purchase amount."); return; }
    const creditReason = form.additional_credit_reason.trim();
    const debitReason = form.additional_debit_reason.trim();
    if (calculation.additionalCredit > 0 && !creditReason) { ws.fail("Add a reason for the additional credit."); return; }
    if (calculation.additionalDebit > 0 && !debitReason) { ws.fail("Add a reason for the additional debit."); return; }
    if (calculation.additionalDebit > calculation.total - calculation.advance + calculation.additionalCredit) { ws.fail("Additional debit cannot be greater than the amount still payable."); return; }
    const paymentStatus: PaymentStatus = calculation.balance <= 0 ? "paid" : calculation.advance > 0 ? "partial" : "pending";
    ws.setSaving(true);
    const payload = {
      trader_id: ws.session.user.id,
      farmer_id: Number(form.farmer_id),
      location_id: Number(form.location_id),
      trade_date: form.trade_date,
      coconut_color: form.coconut_color,
      purchase_mode: calculation.purchaseMode,
      processing_type: calculation.purchaseMode === "quantity" ? "mottai" : form.processing_type,
      coconut_quantity: calculation.quantity,
      dehusking_pieces: calculation.purchaseMode === "weight" && form.dehusking_mode !== "none" && form.dehusking_pieces.trim() ? calculation.dehuskingPieces : null,
      harvesting_pieces: calculation.purchaseMode === "weight" && form.harvesting_mode !== "none" && form.harvesting_pieces.trim() ? calculation.harvestingPieces : null,
      net_weight_kg: calculation.purchaseMode === "weight" ? calculation.net : 0,
      wastage_percent: calculation.purchaseMode === "weight" && form.processing_type === "kudume" ? calculation.wastagePercent : 0,
      rate_per_kg: calculation.purchaseMode === "weight" ? toNumber(form.rate_per_kg) : 0,
      rate_per_piece: calculation.purchaseMode === "quantity" ? toNumber(form.rate_per_piece) : 0,
      husk_removal_rate_per_1000: calculation.purchaseMode === "weight" && form.dehusking_mode === "farmer" ? toNumber(form.husk_removal_rate_per_1000) : 0,
      tree_collection_rate_per_1000: calculation.purchaseMode === "weight" && form.harvesting_mode === "farmer" ? toNumber(form.tree_collection_rate_per_1000) : 0,
      husk_price_per_piece: calculation.purchaseMode === "weight" && form.buys_husk ? toNumber(form.husk_price_per_piece) : 0,
      buys_husk: calculation.purchaseMode === "weight" ? form.buys_husk : false,
      husk_color: calculation.purchaseMode === "weight" && form.buys_husk ? form.husk_color : null,
      husk_pieces: calculation.purchaseMode === "weight" && form.buys_husk && form.husk_pieces.trim() ? calculation.huskPieces : null,
      husk_included: calculation.purchaseMode === "weight" && form.husk_included,
      trader_dehusking_rate_per_1000: calculation.purchaseMode === "weight" && form.dehusking_mode === "trader" ? toNumber(form.husk_removal_rate_per_1000) : 0,
      trader_harvesting_rate_per_1000: calculation.purchaseMode === "weight" && form.harvesting_mode === "trader" ? toNumber(form.tree_collection_rate_per_1000) : 0,
      dehusking_team_id: calculation.purchaseMode === "weight" && form.dehusking_mode === "trader" && form.dehusking_team_id ? Number(form.dehusking_team_id) : null,
      harvesting_team_id: calculation.purchaseMode === "weight" && form.harvesting_mode === "trader" && form.harvesting_team_id ? Number(form.harvesting_team_id) : null,
      advance_amount: calculation.advance,
      additional_credit_amount: calculation.additionalCredit,
      additional_credit_reason: calculation.additionalCredit > 0 ? creditReason : null,
      additional_debit_amount: calculation.additionalDebit,
      additional_debit_reason: calculation.additionalDebit > 0 ? debitReason : null,
      payment_status: paymentStatus,
      notes: form.notes.trim() || null
    };
    let newPurchaseId: number | null = form.id ?? null;
    let saveError: string | null = null;
    if (form.id) {
      const { error } = await supabase.from("coconut_trades").update(payload).eq("id", form.id).eq("trader_id", ws.session.user.id);
      saveError = error?.message ?? null;
    } else {
      const { data, error } = await supabase.from("coconut_trades").insert(payload).select("id").single();
      saveError = error?.message ?? null;
      newPurchaseId = (data as { id: number } | null)?.id ?? null;
    }
    if (saveError) { ws.setSaving(false); ws.fail(saveError); return; }

    // Reflect the chosen harvests in this new purchase.
    let inlineHarvestPieces = 0;
    if (!form.id && newPurchaseId) {
      if (form.harvest_ids.length) {
        const { error } = await supabase.from("harvesting_entries").update({ purchase_id: newPurchaseId }).in("id", form.harvest_ids).eq("trader_id", ws.session.user.id);
        if (error) { ws.setSaving(false); ws.fail(`Purchase saved, but linking the harvests failed: ${error.message}`); await ws.refresh(); return; }
      }
      // Record a harvest inline when the trader named a team head (or typed extra pieces)
      // without first recording it on Coconut Harvesting. Blank pieces uses the purchase
      // quantity not already covered by the harvests picked above. Works for both methods.
      inlineHarvestPieces = additionalPieces > 0 ? additionalPieces : (form.additional_head_id ? Math.max(calculation.quantity - selectedHarvestPieces, 0) : 0);
      if (inlineHarvestPieces > 0) {
        const { error } = await supabase.from("harvesting_entries").insert({ trader_id: ws.session.user.id, harvest_date: form.trade_date, head_employee_id: form.additional_head_id ? Number(form.additional_head_id) : null, farmer_id: form.farmer_id ? Number(form.farmer_id) : null, location_id: form.location_id ? Number(form.location_id) : null, coconut_quantity: inlineHarvestPieces, rate_per_1000: Math.max(toNumber(form.additional_rate), 0), purchase_id: newPurchaseId, notes: "Harvest recorded with the purchase" });
        if (error) { ws.setSaving(false); ws.fail(`Purchase saved, but the harvest entry failed: ${error.message}`); await ws.refresh(); return; }
      }
    }
    ws.setSaving(false);
    draft.clear(blankForm(settings));
    const harvestCount = (form.id ? 0 : form.harvest_ids.length) + (inlineHarvestPieces > 0 ? 1 : 0);
    ws.notify(form.id ? "Purchase updated." : `Purchase recorded.${harvestCount > 0 ? ` ${harvestCount} harvest${harvestCount > 1 ? "s" : ""} linked to it.` : ""} It is now in stock and ready to be added to a sale.`);
    await ws.refresh();
    router.push("/dashboard/purchases");
  }

  const setField = <K extends keyof PurchaseForm>(key: K, value: PurchaseForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  // Who bears a labor: none / farmer (deducted) / trader (paid to a team). Keep the legacy
  // deduct_* flag in sync so the live calc still deducts only for farmer-borne labor.
  function setLaborMode(kind: "dehusking" | "harvesting", mode: LaborMode) {
    setForm((current) => kind === "dehusking"
      ? { ...current, dehusking_mode: mode, deduct_dehusking: mode === "farmer" }
      : { ...current, harvesting_mode: mode, deduct_harvesting: mode === "farmer" });
  }
  const traderDehuskCost = form.dehusking_mode === "trader" ? calculation.dehuskingPieces / 1000 * toNumber(form.husk_removal_rate_per_1000) : 0;
  const traderHarvestCost = form.harvesting_mode === "trader" ? calculation.harvestingPieces / 1000 * toNumber(form.tree_collection_rate_per_1000) : 0;

  /** Default husk price for a colour, from Settings. */
  const huskDefaultPrice = (color: HuskColor) => color === "green" ? Number(settings.husk_price_green_per_piece) : Number(settings.husk_price_brown_per_piece);

  /** Switch purchase method, setting the right defaults for each. */
  function applyMethod(value: "weight" | "weight_husk" | "quantity") {
    setForm((current) => {
      if (value === "quantity") {
        return { ...current, purchase_mode: "quantity", husk_included: false, processing_type: "mottai", wastage_percent: "0", dehusking_mode: "none", harvesting_mode: "none" };
      }
      if (value === "weight_husk") {
        // Same options as weight-based; the one difference is the husk is kept by the trader at
        // no extra cost (no farmer credit), via the buys_husk path at price 0.
        return {
          ...current,
          purchase_mode: "weight",
          husk_included: true,
          deduct_dehusking: Number(settings.husk_removal_rate_per_1000) > 0,
          deduct_harvesting: Number(settings.tree_collection_rate_per_1000) > 0,
          dehusking_mode: Number(settings.husk_removal_rate_per_1000) > 0 ? "farmer" : "none",
          harvesting_mode: Number(settings.tree_collection_rate_per_1000) > 0 ? "farmer" : "none",
          buys_husk: true,
          husk_color: huskColorForCoconut(current.coconut_color),
          husk_price_per_piece: "0",
          husk_pieces: "",
          wastage_percent: current.processing_type === "kudume" ? (current.wastage_percent === "0" ? String(settings.kudume_wastage_percent) : current.wastage_percent) : "0"
        };
      }
      // Plain weight: restore the normal weighbridge defaults.
      return {
        ...current,
        purchase_mode: "weight",
        husk_included: false,
        deduct_dehusking: Number(settings.husk_removal_rate_per_1000) > 0,
        deduct_harvesting: Number(settings.tree_collection_rate_per_1000) > 0,
        dehusking_mode: Number(settings.husk_removal_rate_per_1000) > 0 ? "farmer" : "none",
        harvesting_mode: Number(settings.tree_collection_rate_per_1000) > 0 ? "farmer" : "none",
        buys_husk: Number(settings.husk_price_green_per_piece) > 0,
        husk_price_per_piece: String(settings.husk_price_green_per_piece),
        wastage_percent: current.processing_type === "kudume" ? (current.wastage_percent === "0" ? String(settings.kudume_wastage_percent) : current.wastage_percent) : "0"
      };
    });
  }

  function openRateEditor(kind: "dehusking" | "harvesting" | "husk") {
    setRateDraft(kind === "dehusking" ? form.husk_removal_rate_per_1000 : kind === "harvesting" ? form.tree_collection_rate_per_1000 : form.husk_price_per_piece);
    setRateEditor(kind);
  }

  /** Applies the rate to this purchase only. The default in Settings is not touched. */
  function saveRate(kind: "dehusking" | "harvesting" | "husk") {
    const value = toNumber(rateDraft);
    if (value < 0) { ws.fail("Enter a rate of 0 or more."); return; }
    if (kind === "dehusking") setForm((current) => ({ ...current, husk_removal_rate_per_1000: String(value) }));
    else if (kind === "harvesting") setForm((current) => ({ ...current, tree_collection_rate_per_1000: String(value) }));
    else setForm((current) => ({ ...current, husk_price_per_piece: String(value) }));
    setRateEditor(null);
    ws.notify(`${kind === "dehusking" ? "Dehusking" : kind === "harvesting" ? "Coconut harvesting" : "Husk"} ${kind === "husk" ? "price" : "rate"} changed for this purchase only. Your default in Settings is unchanged.`);
  }

  const deductionCard = (kind: "dehusking" | "harvesting") => {
    const mode = kind === "dehusking" ? form.dehusking_mode : form.harvesting_mode;
    const rate = toNumber(kind === "dehusking" ? form.husk_removal_rate_per_1000 : form.tree_collection_rate_per_1000);
    const title = kind === "dehusking" ? "Dehusking" : "Coconut harvesting";
    const piecesField = kind === "dehusking" ? "dehusking_pieces" : "harvesting_pieces";
    const teamField = kind === "dehusking" ? "dehusking_team_id" : "harvesting_team_id";
    const teams = kind === "dehusking" ? dehuskers : harvesters;
    const laborPieces = kind === "dehusking" ? calculation.dehuskingPieces : calculation.harvestingPieces;
    const shownCost = mode === "trader" ? (kind === "dehusking" ? traderDehuskCost : traderHarvestCost) : (kind === "dehusking" ? calculation.huskRemovalCost : calculation.treeCollectionCost);
    return (
      <div className="deduction-card" key={kind}>
        <label className="checkbox-field"><input type="checkbox" checked={mode !== "none"} onChange={(event) => setLaborMode(kind, event.target.checked ? "farmer" : "none")} /><span><strong>{title}</strong><small>Who pays this labor — the farmer, or you.</small></span></label>
        {mode !== "none" ? <>
          <div className="segmented">
            <button className={mode === "farmer" ? "active" : ""} type="button" onClick={() => setLaborMode(kind, "farmer")}><strong>Farmer pays</strong><span>Deducted from the farmer</span></button>
            <button className={mode === "trader" ? "active" : ""} type="button" onClick={() => setLaborMode(kind, "trader")}><strong>You pay</strong><span>Booked to your team</span></button>
          </div>
          {mode === "trader" ? <label>{title} team<select value={form[teamField]} onChange={(event) => setField(teamField, event.target.value)}><option value="">Select a team</option>{teams.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}</select>{teams.length === 0 ? <span className="field-hint">No {kind === "dehusking" ? "dehusking" : "harvesting"} team yet. Add one on <Link href="/dashboard/team">Team &amp; vehicles</Link>.</span> : <span className="field-hint">The wage is booked to this team under Expenses and shows in their history with Paid / Pending.</span>}</label> : null}
          <label>{kind === "dehusking" ? "Pieces dehusked" : "Pieces harvested by the team"} <span className="optional">Blank = all {formatNumber(calculation.quantity, 0)} pieces</span><input type="number" min="0" step="1" value={form[piecesField]} onChange={(event) => setField(piecesField, event.target.value)} placeholder={calculation.quantity > 0 ? formatNumber(calculation.quantity, 0) : "Same as coconut quantity"} /></label>
          <div className="rate-line"><span>{formatCurrency(rate)} per 1,000 pieces{laborPieces > 0 ? ` · ${formatNumber(laborPieces, 0)} pieces · ${formatCurrency(shownCost)} ${mode === "trader" ? "you pay" : "deducted"}` : ""}</span>{rateEditor === kind ? null : <button className="secondary-button rate-edit-button" onClick={() => openRateEditor(kind)} type="button"><Pencil size={14} strokeWidth={2.2} aria-hidden="true" />Edit rate</button>}</div>
          {rateEditor === kind ? <div className="inline-form"><label>{title} rate per 1,000 pieces (INR)<input type="number" min="0" step="0.01" value={rateDraft} onChange={(event) => setRateDraft(event.target.value)} autoFocus /></label><div className="row-actions"><button className="primary-button" disabled={ws.saving} onClick={() => saveRate(kind)} type="button">Save rate</button><button className="link-button" onClick={() => setRateEditor(null)} type="button">Cancel</button></div><span className="field-hint">Applies to this purchase only. The default in Settings stays as it is.</span></div> : null}
          {kind === "harvesting" && mode === "trader" ? <span className="field-hint">If you already recorded this load in &quot;Harvested coconuts&quot; above, leave this off so the harvesting wage is not counted twice.</span> : null}
        </> : null}
      </div>
    );
  };

  return (
    <>
    <DraftNotice show={draft.restored} what="purchase" onDiscard={discardDraft} />
    <section className="workspace-grid">
      <form className="tool-panel purchase-form" onSubmit={savePurchase}>
        <div className="panel-heading"><div><span className="eyebrow">{form.id ? formatPurchaseId(form.id) : "New record"}</span><h2>{form.id ? "Edit purchase" : "Record coconut purchase"}</h2></div><div className="row-actions">{form.id ? <button className="link-button" onClick={() => { discardDraft(); setDraftScope(draftKey(ws.session?.user.id, "purchase", null)); router.push("/dashboard/purchases/new"); }} type="button">Cancel edit</button> : (purchaseHasContent ? <button className="secondary-button" onClick={discardPurchase} type="button">Discard</button> : null)}<Link className="secondary-button" href="/dashboard/purchases">Purchase history</Link></div></div>
        {form.id && allocated > 0 ? <p className="mode-note">{formatNumber(allocated, 0)} pieces of this purchase are already allocated to sales. Those sales are not changed when you edit this record.</p> : null}
        <div className="form-grid">
          <label>Farmer<select value={form.farmer_id} disabled={harvestLocked} onChange={(event) => { const value = event.target.value; if (value === "__add__") { router.push("/dashboard/farmers?returnTo=purchase"); return; } setForm((current) => value === current.farmer_id ? current : ({ ...current, farmer_id: value, location_id: "", harvest_ids: [], additional_head_id: "", additional_pieces: "", coconut_quantity: "" })); }} required><option value="__add__">+ Add farmer</option><option value="">Select a farmer</option>{ws.farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name} - {farmer.phone}</option>)}</select>{harvestLocked ? <span className="field-hint">Fixed to the picked harvest. Remove the harvest below to change the farmer or location.</span> : null}</label>
          <label>Farming location<select value={form.location_id} disabled={harvestLocked} onChange={(event) => setField("location_id", event.target.value)} required><option value="">Select location</option>{farmerLocations.map((location) => <option key={location.id} value={location.id}>{location.location_name}{location.city ? `, ${location.city}` : ""}</option>)}</select></label>
          <label>Purchase date<input type="date" value={form.trade_date} onChange={(event) => setField("trade_date", event.target.value)} required /></label>
          <label>Coconut colour<select value={form.coconut_color} onChange={(event) => setField("coconut_color", event.target.value as CoconutColor)}>{coconutColors.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Purchase method<select value={method} onChange={(event) => applyMethod(event.target.value as "weight" | "weight_husk" | "quantity")}><option value="weight">Weight-based / weighbridge</option><option value="weight_husk">Weight-based with husk</option><option value="quantity">Quantity-based / per nut</option></select><span className="field-hint">{method === "quantity" ? "Pay by individual coconut using a per-nut price. The husk stays with you to sell." : method === "weight_husk" ? "Bought with husk by weight. You pay the farmer the full weight amount; you dehusk (your own cost) and keep the husk to sell. The farmer does the harvesting." : "Pay by payable kilograms after weighbridge deductions. Husk credit is paid to the farmer."}</span></label>
        </div>
        {form.purchase_mode === "weight" ? <fieldset><legend>Coconut preparation</legend><div className="segmented">{processingTypes.map((item) => <button className={form.processing_type === item.value ? "active" : ""} key={item.value} onClick={() => setForm((current) => ({ ...current, processing_type: item.value, wastage_percent: item.value === "kudume" ? (current.wastage_percent === "0" ? String(settings.kudume_wastage_percent) : current.wastage_percent) : "0" }))} type="button"><strong>{item.label}</strong><span>{item.description}</span></button>)}</div></fieldset> : <p className="mode-note">Quantity-based purchases use individual coconut pieces and do not use Mottai, Kudume wastage, Husk / Mattai credit, or weighbridge fields.</p>}
        {!form.id ? <fieldset className="deduction-options"><legend>Harvested coconuts <span className="optional">Optional</span></legend>
          {!form.farmer_id
            ? <p className="field-hint">Choose a farmer above to see the harvests recorded for them that are not linked to a purchase yet.</p>
            : <>
              <p className="field-hint">Unlinked harvests for <strong>{ws.farmerById.get(Number(form.farmer_id))?.name ?? "this farmer"}</strong>. Tap one to build this purchase from it — the location, quantity and harvesting pay fill in for you.</p>
              {availableHarvests.length ? <div className="chip-row">{availableHarvests.map((entry) => <button className="harvest-pick" key={entry.id} type="button" onClick={() => addHarvest(entry.id)}>+ {formatDate(entry.harvest_date)} · {formatNumber(Number(entry.coconut_quantity), 0)} pcs · {entry.head_employee_id ? ws.employeeById.get(entry.head_employee_id)?.name ?? "Worker" : "No head"}{entry.location_id ? ` · ${ws.locationById.get(entry.location_id)?.location_name ?? ""}` : ""}</button>)}</div> : null}
              {selectedHarvests.length ? <div className="chip-row">{selectedHarvests.map((entry) => <span className="chip good" key={entry.id}>{formatDate(entry.harvest_date)} · {formatNumber(Number(entry.coconut_quantity), 0)} pcs{entry.farmer_id ? ` · ${ws.farmerById.get(entry.farmer_id)?.name ?? "Farmer"}` : ""}<button className="chip-remove" onClick={() => removeHarvest(entry.id)} type="button">Remove</button></span>)}</div> : null}
              {availableHarvests.length === 0 && selectedHarvests.length === 0 ? <p className="field-hint">No unlinked harvests for this farmer. Record them on <Link href="/dashboard/harvesting">Coconut Harvesting</Link>, or name the team head below to record one now.</p> : null}
              {selectedHarvests.length > 0
                ? <p className="field-hint">Harvested by <strong>{selectedHeadNames.length ? selectedHeadNames.join(", ") : "— not named on the harvest"}</strong>, from the harvest{selectedHarvests.length > 1 ? "s" : ""} you picked. Coconut-harvesting pay uses the <strong>{formatNumber(selectedHarvestPieces, 0)} harvested pieces</strong>, not the lorry quantity — so you can raise the coconut quantity below for coconuts the farmer already had in hand without changing the harvesting cost.</p>
                : <div className="form-grid">
                <label>Harvested by (team head) <span className="optional">Optional</span><select value={form.additional_head_id} onChange={(event) => setField("additional_head_id", event.target.value)}><option value="">Not recorded here</option>{harvesters.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}</select><span className="field-hint">Pick the harvesting team head who harvested this load when you did not record it on Coconut Harvesting first. A harvest is saved and linked to this purchase.</span></label>
                {form.additional_head_id || additionalPieces > 0 ? <label>Pieces harvested <span className="optional">Optional</span><input type="number" min="0" step="1" value={form.additional_pieces} onChange={(event) => setField("additional_pieces", event.target.value)} placeholder={calculation.quantity > 0 ? formatNumber(Math.max(calculation.quantity - selectedHarvestPieces, 0), 0) : "Pieces harvested"} /><span className="field-hint">Blank uses the purchase quantity{selectedHarvestPieces > 0 ? " not already in the harvests above" : ""}.</span></label> : null}
                {form.additional_head_id || additionalPieces > 0 ? <label>Pay rate per 1,000 (INR)<input type="number" min="0" step="0.01" value={form.additional_rate} onChange={(event) => setField("additional_rate", event.target.value)} /></label> : null}
              </div>}
              {additionalPieces > 0 ? <p className="field-hint"><strong>{formatNumber(harvestTotal, 0)} pieces</strong> harvested ({formatNumber(selectedHarvestPieces, 0)} selected + {formatNumber(additionalPieces, 0)} extra). The coconut quantity below starts from this — change it to the actual lorry load.</p> : null}
            </>
          }
        </fieldset> : (ws.harvestingEntries.some((entry) => entry.purchase_id === form.id) ? <p className="mode-note">Harvests linked to this purchase: {ws.harvestingEntries.filter((entry) => entry.purchase_id === form.id).map((entry) => `${formatNumber(Number(entry.coconut_quantity), 0)} pcs`).join(", ")}. Manage links from Purchase history.</p> : null)}
        <div className="form-grid">
          <label>Coconut quantity (pieces)<input type="number" min="1" step="1" value={form.coconut_quantity} onChange={(event) => setField("coconut_quantity", event.target.value)} required /><span className="field-hint">{form.purchase_mode === "weight" ? "Labor is deducted per 1,000 pieces; husk credit is added per nut." : "Labor deductions are calculated per 1,000 pieces."}</span></label>
          {form.purchase_mode === "weight" ? <label>Net weight (kg)<input type="number" min="0.001" step="0.001" value={form.net_weight_kg} onChange={(event) => setField("net_weight_kg", event.target.value)} placeholder="Weighbridge net weight" required /><span className="field-hint">Wastage and payable weight are calculated from the net weight.</span></label> : null}
          {form.purchase_mode === "weight" ? <label>Rate per kg (INR)<input type="number" min="0" step="0.01" value={form.rate_per_kg} onChange={(event) => setField("rate_per_kg", event.target.value)} required /></label> : <label>Price per coconut (INR)<input type="number" min="0" step="0.01" value={form.rate_per_piece} onChange={(event) => setField("rate_per_piece", event.target.value)} required /><span className="field-hint">The purchase total is pieces multiplied by this price.</span></label>}
          <label>Advance paid (INR)<input type="number" min="0" step="0.01" value={form.advance_amount} onChange={(event) => setField("advance_amount", event.target.value)} /><span className="field-hint">Later settlements are recorded from Purchase history.</span></label>
        </div>
        {form.purchase_mode === "weight" ? <fieldset className="deduction-options"><legend>Dehusking &amp; harvesting</legend><div className="checkbox-grid">{deductionCard("dehusking")}{deductionCard("harvesting")}</div><span className="field-hint">For each one, choose <strong>Farmer pays</strong> (taken off the farmer amount) or <strong>You pay</strong> (booked to the team you pick, under Expenses, shown in their history). Each is worked out on its own piece count; the main coconut quantity above is what goes into stock and the lorry.</span></fieldset> : <p className="field-hint">Per-nut purchases have no farmer deductions. You pay for dehusking (at the Stock stage) and harvesting (on Coconut Harvesting); the farmer is paid the full per-nut amount.</p>}
        {method === "weight" ? <fieldset className="deduction-options"><legend>Farmer credit — buying husk</legend>
          <div className="deduction-card">
            <label className="checkbox-field"><input type="checkbox" checked={form.buys_husk} onChange={(event) => setField("buys_husk", event.target.checked)} /><span><strong>Buy the husk from the farmer</strong><small>Tick when you keep the husk to resell. The husk price is credited to the farmer and the husk goes into your husk stock.</small></span></label>
            {form.buys_husk ? <>
              <div className="checkbox-grid">
                <label>Husk colour<select value={form.husk_color} onChange={(event) => { const color = event.target.value as HuskColor; setForm((current) => ({ ...current, husk_color: color, husk_price_per_piece: String(huskDefaultPrice(color)) })); }}>{huskColors.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <label>Husk pieces <span className="optional">Blank = {formatNumber(calculation.dehuskingPieces, 0)} dehusked</span><input type="number" min="0" step="1" value={form.husk_pieces} onChange={(event) => setField("husk_pieces", event.target.value)} placeholder={formatNumber(calculation.dehuskingPieces, 0)} /><span className="field-hint">How many husk pieces you are buying. Defaults to the dehusked count.</span></label>
              </div>
              <div className="rate-line"><span>{formatCurrency(toNumber(form.husk_price_per_piece))} per piece · {formatNumber(calculation.huskPieces, 0)} pieces · {formatCurrency(calculation.huskPriceIncome)} credited</span>{rateEditor === "husk" ? null : <button className="secondary-button rate-edit-button" onClick={() => openRateEditor("husk")} type="button"><Pencil size={14} strokeWidth={2.2} aria-hidden="true" />Edit price</button>}</div>
              {rateEditor === "husk" ? <div className="inline-form"><label>Husk price per piece (INR)<input type="number" min="0" step="0.01" value={rateDraft} onChange={(event) => setRateDraft(event.target.value)} autoFocus /></label><div className="row-actions"><button className="primary-button" disabled={ws.saving} onClick={() => saveRate("husk")} type="button">Save price</button><button className="link-button" onClick={() => setRateEditor(null)} type="button">Cancel</button></div><span className="field-hint">Applies to this purchase only. The default in Settings stays as it is.</span></div> : null}
            </> : null}
          </div>
          <span className="field-hint">When you buy the husk, this amount is added to what the farmer is paid, and the husk goes into your husk stock to sell later from the Husk sale. Leave unticked when the farmer keeps the husk.</span>
        </fieldset>
          : method === "weight_husk" ? <fieldset className="deduction-options"><legend>Husk you keep</legend>
            <p className="field-hint">Bought with husk, so the husk is yours at no extra cost — it goes into your husk stock to sell on Husk sale. Nothing is credited to the farmer for it.</p>
            <div className="checkbox-grid">
              <label>Husk colour<select value={form.husk_color} onChange={(event) => setField("husk_color", event.target.value as HuskColor)}>{huskColors.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label>Husk pieces kept <span className="optional">Blank = {formatNumber(calculation.dehuskingPieces, 0)} dehusked</span><input type="number" min="0" step="1" value={form.husk_pieces} onChange={(event) => setField("husk_pieces", event.target.value)} placeholder={formatNumber(calculation.dehuskingPieces, 0)} /><span className="field-hint">Husk pieces you keep to sell. Defaults to the dehusked count.</span></label>
            </div>
          </fieldset> : null}
        <div className="adjustment-actions"><button className="adjustment-toggle credit" onClick={() => { setShowCredit(true); setField("additional_credit_amount", form.additional_credit_amount === "0" ? "" : form.additional_credit_amount); }} type="button">+ Add credit to farmer</button><button className="adjustment-toggle debit" onClick={() => { setShowDebit(true); setField("additional_debit_amount", form.additional_debit_amount === "0" ? "" : form.additional_debit_amount); }} type="button">- Add debit to farmer</button></div>
        {showCredit || toNumber(form.additional_credit_amount) > 0 ? <div className="adjustment-fields credit-fields"><label>Credit amount (INR)<input type="number" min="0" step="0.01" value={form.additional_credit_amount} onChange={(event) => setField("additional_credit_amount", event.target.value)} /></label><label>Why is this being credited?<input value={form.additional_credit_reason} onChange={(event) => setField("additional_credit_reason", event.target.value)} placeholder="Reason for additional payment" /></label></div> : null}
        {showDebit || toNumber(form.additional_debit_amount) > 0 ? <div className="adjustment-fields debit-fields"><label>Debit amount (INR)<input type="number" min="0" step="0.01" value={form.additional_debit_amount} onChange={(event) => setField("additional_debit_amount", event.target.value)} /></label><label>Why is this being deducted?<input value={form.additional_debit_reason} onChange={(event) => setField("additional_debit_reason", event.target.value)} placeholder="Reason for deduction" /></label></div> : null}
        <label>Notes <span className="optional">Optional</span><textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="Any quality, transport, or payment note" /></label>
        {ws.error ? <p className="error-message form-error" role="alert">{ws.error}</p> : null}
        <button className="primary-button" disabled={ws.saving || ws.farmers.length === 0} type="submit">{ws.saving ? "Saving..." : form.id ? "Update purchase" : "Save purchase"}</button>
      </form>
      <aside className="side-stack">
        <section className="calculation-panel"><span className="eyebrow">Live calculation</span><h2>{calculation.purchaseMode === "quantity" ? "Per-nut summary" : "Weighbridge summary"}</h2><dl className="calculation-list">
          {calculation.purchaseMode === "weight" ? <><div><dt>Net weight</dt><dd>{formatNumber(calculation.net)} kg</dd></div><div><dt>Wastage<small className="formula">{formatNumber(calculation.net)} kg × {formatNumber(calculation.wastagePercent, 2)}%</small></dt><dd>{formatNumber(calculation.wastage)} kg</dd></div><div><dt>Payable weight<small className="formula">{formatNumber(calculation.net)} kg − {formatNumber(calculation.wastage)} kg</small></dt><dd>{formatNumber(calculation.payable)} kg</dd></div></> : null}
          <div><dt>Coconut quantity</dt><dd>{formatNumber(calculation.quantity, 0)} pieces</dd></div>
          <div><dt>Average weight per nut{calculation.purchaseMode === "weight" ? <small className="formula">{formatNumber(calculation.net)} kg ÷ {formatNumber(calculation.quantity, 0)} pieces</small> : null}</dt><dd>{calculation.purchaseMode === "weight" ? `${formatNumber(calculation.averageWeightGrams, 1)} g / nut` : "Not used"}</dd></div>
          <div><dt>Average price per nut<small className="formula">{formatCurrency(calculation.total)} ÷ {formatNumber(calculation.quantity, 0)} pieces</small></dt><dd>{formatCurrency(calculation.averagePricePerPiece)} / nut</dd></div>
          <div className="calculation-credit"><dt>Coconut purchase<small className="formula">{calculation.purchaseMode === "weight" ? `${formatNumber(calculation.payable)} kg × ${formatCurrency(toNumber(form.rate_per_kg))} / kg` : `${formatNumber(calculation.quantity, 0)} pieces × ${formatCurrency(toNumber(form.rate_per_piece))} / nut`}</small></dt><dd>{formatCurrency(calculation.coconutTotal)}</dd></div>
          {calculation.purchaseMode === "weight" && form.dehusking_mode === "farmer" ? <div className="calculation-deduction"><dt>Dehusking (farmer)<small className="formula">{formatNumber(calculation.dehuskingPieces, 0)} pieces ÷ 1,000 × {formatCurrency(toNumber(form.husk_removal_rate_per_1000))}</small></dt><dd>{formatCurrency(calculation.huskRemovalCost)}</dd></div> : null}
          {calculation.purchaseMode === "weight" && form.harvesting_mode === "farmer" ? <div className="calculation-deduction"><dt>Coconut harvesting (farmer)<small className="formula">{formatNumber(calculation.harvestingPieces, 0)} pieces ÷ 1,000 × {formatCurrency(toNumber(form.tree_collection_rate_per_1000))}</small></dt><dd>{formatCurrency(calculation.treeCollectionCost)}</dd></div> : null}
          {calculation.buysHusk && !form.husk_included ? <div className="calculation-credit"><dt>Husk credit ({form.husk_color} husk)<small className="formula">{formatNumber(calculation.huskPieces, 0)} husk pieces × {formatCurrency(toNumber(form.husk_price_per_piece))} / piece</small></dt><dd>{formatCurrency(calculation.huskPriceIncome)}</dd></div> : null}
          <div className="calculation-total"><dt>Net payable to farmer<small className="formula">{calculation.purchaseMode === "weight" ? `${formatCurrency(calculation.coconutTotal)}${calculation.huskPriceIncome > 0 ? ` + ${formatCurrency(calculation.huskPriceIncome)} husk` : ""} − ${formatCurrency(calculation.huskRemovalCost)} − ${formatCurrency(calculation.treeCollectionCost)}` : `${formatCurrency(calculation.coconutTotal)} (full per-nut amount, no deductions)`}</small></dt><dd>{formatCurrency(calculation.total)}</dd></div>
          {traderDehuskCost > 0 ? <div className="calculation-deduction"><dt>Your dehusking cost<small className="formula">{formatNumber(calculation.dehuskingPieces, 0)} ÷ 1,000 × {formatCurrency(toNumber(form.husk_removal_rate_per_1000))} · booked to your team</small></dt><dd>{formatCurrency(traderDehuskCost)}</dd></div> : null}
          {traderHarvestCost > 0 ? <div className="calculation-deduction"><dt>Your harvesting cost<small className="formula">{formatNumber(calculation.harvestingPieces, 0)} ÷ 1,000 × {formatCurrency(toNumber(form.tree_collection_rate_per_1000))} · booked to your team</small></dt><dd>{formatCurrency(traderHarvestCost)}</dd></div> : null}
          {form.husk_included ? <div className="calculation-credit"><dt>Husk you keep<small className="formula">{formatNumber(huskKeptPieces, 0)} pieces × {formatCurrency(huskDefaultPrice(form.husk_color))} est. · yours to sell, no cost</small></dt><dd>{formatCurrency(huskKeptPieces * huskDefaultPrice(form.husk_color))}</dd></div> : null}
          <div><dt>Advance</dt><dd>{formatCurrency(calculation.advance)}</dd></div>
          {calculation.additionalCredit > 0 ? <div className="calculation-credit"><dt>Additional credit</dt><dd>{formatCurrency(calculation.additionalCredit)}</dd></div> : null}
          {calculation.additionalDebit > 0 ? <div className="calculation-deduction"><dt>Additional debit</dt><dd>{formatCurrency(calculation.additionalDebit)}</dd></div> : null}
          <div className="calculation-total"><dt>Balance to pay<small className="formula">{formatCurrency(calculation.total)} − {formatCurrency(calculation.advance)}{calculation.additionalCredit > 0 ? ` + ${formatCurrency(calculation.additionalCredit)}` : ""}{calculation.additionalDebit > 0 ? ` − ${formatCurrency(calculation.additionalDebit)}` : ""}</small></dt><dd>{formatCurrency(calculation.balance)}</dd></div>
        </dl><p className="field-hint">{form.husk_included ? "Bought with husk: the husk is yours to sell at no cost, with no credit to the farmer. Dehusking and harvesting deductions work the same as a weight-based purchase. " : calculation.buysHusk ? `You are buying the ${form.husk_color} husk at ${formatCurrency(toNumber(form.husk_price_per_piece))} per piece on ${formatNumber(calculation.huskPieces, 0)} pieces; this credit is paid to the farmer and the husk is yours to sell. ` : calculation.purchaseMode === "weight" ? "Husk is not being bought on this purchase. " : ""}Green credits increase the farmer amount; red deductions reduce it.</p></section>
      </aside>
    </section>
    </>
  );
}
