"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";
import { BarChart3, ChevronRight, CirclePlus, IndianRupee, LayoutDashboard, LogOut, ReceiptText, Scale, Sprout, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "./supabaseClient";

type Mode = "signup" | "signin";
type Role = "farmer" | "trader";
type AppSection = "dashboard" | "farmers" | "purchase" | "history";
type CoconutColor = "green" | "brown" | "black";
type ProcessingType = "mottai" | "kudume";
type PurchaseMode = "weight" | "quantity";
type PaymentStatus = "pending" | "partial" | "paid";

type Profile = {
  id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  account_type: Role | null;
  business_name: string | null;
};

type Farmer = {
  id: number;
  phone: string;
  name: string;
  notes: string | null;
  created_at: string;
};

type FarmerLocation = {
  id: number;
  farmer_id: number;
  location_name: string;
  city: string | null;
};

type CoconutTrade = {
  id: number;
  trader_id: string;
  farmer_id: number;
  location_id: number | null;
  trade_date: string;
  coconut_color: CoconutColor;
  purchase_mode: PurchaseMode;
  processing_type: ProcessingType;
  gross_weight_kg: number;
  empty_weight_kg: number;
  wastage_percent: number;
  rate_per_kg: number;
  rate_per_piece: number;
  coconut_quantity: number;
  husk_removal_rate_per_1000: number;
  tree_collection_rate_per_1000: number;
  husk_removal_cost: number;
  tree_collection_cost: number;
  labor_cost_total: number;
  husk_price_per_1000: number;
  husk_price_total: number;
  average_weight_kg: number;
  average_price_per_piece: number;
  additional_credit_amount: number;
  additional_credit_reason: string | null;
  additional_debit_amount: number;
  additional_debit_reason: string | null;
  advance_amount: number;
  payment_status: PaymentStatus;
  notes: string | null;
  net_weight_kg: number;
  wastage_weight_kg: number;
  payable_weight_kg: number;
  total_amount: number;
  balance_amount: number;
  created_at: string;
};

type FarmerAccessRequest = {
  id: number;
  trader_id: string;
  trader_farmer_id: number;
  farmer_user_id: string;
  trader_name: string;
  trader_business_name: string | null;
  farmer_name: string;
  farmer_phone: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  responded_at: string | null;
};

type TraderSettings = {
  trader_id: string;
  purchase_mode: PurchaseMode;
  husk_removal_rate_per_1000: number;
  tree_collection_rate_per_1000: number;
  husk_price_per_1000: number;
  kudume_wastage_percent: number;
};

type TradeForm = {
  id?: number;
  farmer_id: string;
  location_id: string;
  trade_date: string;
  coconut_color: CoconutColor;
  purchase_mode: PurchaseMode;
  processing_type: ProcessingType;
  coconut_quantity: string;
  gross_weight_kg: string;
  empty_weight_kg: string;
  wastage_percent: string;
  rate_per_kg: string;
  rate_per_piece: string;
  husk_removal_rate_per_1000: string;
  tree_collection_rate_per_1000: string;
  husk_price_per_1000: string;
  deduct_dehusking: boolean;
  deduct_harvesting: boolean;
  advance_amount: string;
  additional_credit_amount: string;
  additional_credit_reason: string;
  additional_debit_amount: string;
  additional_debit_reason: string;
  notes: string;
};

type LocationInput = {
  id?: number;
  name: string;
};

const today = new Date().toISOString().slice(0, 10);

const roleOptions: Array<{ value: Role; label: string; description: string }> = [
  { value: "trader", label: "Trader", description: "Manage farmers and record coconut purchases." },
  { value: "farmer", label: "Farmer", description: "Review purchases shared with you by traders." }
];

const appSections: Array<{ value: AppSection; label: string; shortLabel: string; icon: LucideIcon }> = [
  { value: "dashboard", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
  { value: "farmers", label: "Farmers", shortLabel: "Farmers", icon: UsersRound },
  { value: "purchase", label: "New purchase", shortLabel: "Add", icon: CirclePlus },
  { value: "history", label: "Purchase history", shortLabel: "History", icon: ReceiptText }
];

function getSectionForPath(pathname: string): AppSection {
  if (pathname.endsWith("/farmers")) return "farmers";
  if (pathname.endsWith("/new-purchase")) return "purchase";
  if (pathname.endsWith("/purchase-history")) return "history";
  return "dashboard";
}

function getPathForSection(section: AppSection) {
  if (section === "farmers") return "/dashboard/farmers";
  if (section === "purchase") return "/dashboard/new-purchase";
  if (section === "history") return "/dashboard/purchase-history";
  return "/dashboard";
}

const coconutColors: Array<{ value: CoconutColor; label: string }> = [
  { value: "green", label: "Green coconut" },
  { value: "brown", label: "Brown coconut" },
  { value: "black", label: "Black coconut" }
];

const processingTypes: Array<{ value: ProcessingType; label: string; description: string }> = [
  { value: "mottai", label: "Mottai coconut", description: "Fully shaved coconut" },
  { value: "kudume", label: "Kudume coconut", description: "A small layer of husk remains" }
];

const purchaseModes: Array<{ value: PurchaseMode; label: string; description: string }> = [
  { value: "weight", label: "Weight-based / weighbridge", description: "Pay by payable kilograms" },
  { value: "quantity", label: "Quantity-based / per nut", description: "Pay by individual coconut" }
];

const emptyTradeForm: TradeForm = {
  farmer_id: "",
  location_id: "",
  trade_date: today,
  coconut_color: "green",
  purchase_mode: "weight",
  processing_type: "mottai",
  coconut_quantity: "",
  gross_weight_kg: "",
  empty_weight_kg: "",
  wastage_percent: "0",
  rate_per_kg: "",
  rate_per_piece: "",
  husk_removal_rate_per_1000: "1100",
  tree_collection_rate_per_1000: "1450",
  husk_price_per_1000: "0",
  deduct_dehusking: true,
  deduct_harvesting: true,
  advance_amount: "0",
  additional_credit_amount: "0",
  additional_credit_reason: "",
  additional_debit_amount: "0",
  additional_debit_reason: "",
  notes: ""
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value || 0);
}

function formatPurchaseId(id: number) {
  return `PUR-${String(id).padStart(6, "0")}`;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatNumber(value: number, digits = 3) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(value || 0);
}

function getIndianPhoneValue(value: string) {
  const digits = value.replace(/\D/g, "");
  return (digits.length > 10 && digits.startsWith("91") ? digits.slice(2) : digits).slice(0, 10);
}

function getStoredIndianPhone(value: string) {
  const digits = getIndianPhoneValue(value);
  return digits ? `+91${digits}` : null;
}

function isValidIndianPhone(value: string) {
  return /^[6-9]\d{9}$/.test(getIndianPhoneValue(value));
}

function getAuthErrorMessage(caughtError: unknown) {
  if (!(caughtError instanceof Error)) return "Something went wrong.";
  const message = caughtError.message.toLowerCase();
  if (message.includes("already registered") || message.includes("already been registered")) return "This email is already registered. Sign in instead.";
  if (message.includes("invalid login credentials")) return "The email or password is incorrect.";
  if (message.includes("email rate limit")) return "Too many signup attempts. Please wait a few minutes and try again.";
  return caughtError.message || "Something went wrong.";
}

type PdfTone = "normal" | "credit" | "debit" | "final";

function downloadPurchasePdf(trade: CoconutTrade, farmer: Farmer | undefined, location: FarmerLocation | null, traderName: string) {
  const doc = new jsPDF();
  const left = 18;
  let y = 20;
  const line = (label: string, value: string, tone: PdfTone = "normal") => {
    const valueColor = tone === "credit" ? [18, 107, 82] : tone === "debit" ? [182, 66, 54] : tone === "final" ? [7, 91, 65] : [30, 42, 38];
    const fontSize = tone === "final" ? 13 : 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize);
    doc.setTextColor(30, 42, 38);
    doc.text(label, left, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(valueColor[0], valueColor[1], valueColor[2]);
    doc.text(value, 85, y);
    y += tone === "final" ? 11 : 8;
    doc.setFontSize(10);
    doc.setTextColor(30, 42, 38);
  };

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("COCONUT TRADE DESK", left, y);
  y += 10;
  doc.setFontSize(14);
  doc.text(`PUR-${String(trade.id).padStart(6, "0")}`, left, y);
  y += 8;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(18, 107, 82);
  doc.text(`Trader: ${traderName}`, left, y);
  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(30, 42, 38);
  doc.text("Purchase invoice", left, y);
  y += 10;
  doc.line(left, y, 192, y);
  y += 10;

  line("Date", formatDate(trade.trade_date));
  line("Farmer", farmer?.name ?? "Unknown farmer");
  line("Phone", farmer?.phone ?? "Unavailable");
  line("Location", location?.location_name ?? "Unavailable");
  line("Coconut", trade.purchase_mode === "quantity" ? trade.coconut_color : `${trade.coconut_color} / ${trade.processing_type === "mottai" ? "Mottai" : "Kudume"}`);
  line("Purchase method", trade.purchase_mode === "quantity" ? "Per nut" : "Weight / weighbridge");
  line("Quantity", `${formatNumber(Number(trade.coconut_quantity), 2)} pieces`);
  if (trade.purchase_mode === "weight") {
    line("Average weight per nut", `${formatNumber(Number(trade.average_weight_kg) * 1000, 1)} g per nut`);
  }
  line("Average price per nut", `INR ${formatNumber(Number(trade.average_price_per_piece), 2)} per nut`);
  if (trade.purchase_mode === "weight") {
    line("Gross weight", `${formatNumber(Number(trade.gross_weight_kg))} kg`);
    line("Empty weight", `${formatNumber(Number(trade.empty_weight_kg))} kg`);
    line("Net weight", `${formatNumber(Number(trade.net_weight_kg))} kg`);
    line("Wastage", `${formatNumber(Number(trade.wastage_weight_kg))} kg (${trade.wastage_percent}%)`);
    line("Payable weight", `${formatNumber(Number(trade.payable_weight_kg))} kg`);
  }
  line("Rate", trade.purchase_mode === "quantity" ? `INR ${formatNumber(Number(trade.rate_per_piece), 2)} / nut` : `INR ${formatNumber(Number(trade.rate_per_kg), 2)} / kg`);
  y += 3;
  doc.line(left, y, 192, y);
  y += 10;
  line("Coconut purchase", formatCurrency(Number(trade.total_amount) - Number(trade.husk_price_total) + Number(trade.labor_cost_total)).replace("₹", "INR "), "credit");
  line("Dehusking", formatCurrency(Number(trade.husk_removal_cost)).replace("₹", "INR "), "debit");
  line("Coconut harvesting", formatCurrency(Number(trade.tree_collection_cost)).replace("₹", "INR "), "debit");
  line("Husk / Mattai credit", formatCurrency(Number(trade.husk_price_total)).replace("₹", "INR "), "credit");
  line("Net payable to farmer", formatCurrency(Number(trade.total_amount)).replace("₹", "INR "), "credit");
  line("Advance paid", formatCurrency(Number(trade.advance_amount)).replace("₹", "INR "), "credit");
  if (Number(trade.additional_credit_amount) > 0) {
    line("Additional credit", formatCurrency(Number(trade.additional_credit_amount)).replace("₹", "INR "), "credit");
    line("Credit reason", trade.additional_credit_reason ?? "");
  }
  if (Number(trade.additional_debit_amount) > 0) {
    line("Additional debit", formatCurrency(Number(trade.additional_debit_amount)).replace("₹", "INR "), "debit");
    line("Debit reason", trade.additional_debit_reason ?? "");
  }
  doc.setFillColor(229, 242, 236);
  doc.roundedRect(left, y - 6, 174, 16, 2, 2, "F");
  line("Balance to pay", formatCurrency(Number(trade.balance_amount)).replace("₹", "INR "), "final");
  if (trade.notes) {
    y += 3;
    line("Notes", trade.notes);
  }

  doc.setFontSize(9);
  doc.setTextColor(100, 115, 109);
  doc.text("Generated from Coconut Trade Desk. Keep this invoice for your records.", left, 282);
  doc.save(`purchase-${String(trade.id).padStart(6, "0")}.pdf`);
}

export default function Home() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [roleChoice, setRoleChoice] = useState<Role | "">("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [locations, setLocations] = useState<FarmerLocation[]>([]);
  const [trades, setTrades] = useState<CoconutTrade[]>([]);
  const [accessRequests, setAccessRequests] = useState<FarmerAccessRequest[]>([]);
  const [traderSettings, setTraderSettings] = useState<TraderSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState({ purchaseMode: "weight" as PurchaseMode, huskRemoval: "1100", treeCollection: "1450", huskPrice: "0", kudumeWastage: "3" });
  const [editingSettings, setEditingSettings] = useState(false);
  const [activeSection, setActiveSection] = useState<AppSection>(() => getSectionForPath(pathname));
  const [farmerSearch, setFarmerSearch] = useState("");
  const [tradeSearch, setTradeSearch] = useState("");
  const [tradeForm, setTradeForm] = useState<TradeForm>(emptyTradeForm);
  const [showCreditAdjustment, setShowCreditAdjustment] = useState(false);
  const [showDebitAdjustment, setShowDebitAdjustment] = useState(false);
  const [editingFarmerId, setEditingFarmerId] = useState<number | null>(null);
  const [farmerForm, setFarmerForm] = useState<{ name: string; phone: string; locations: LocationInput[] }>({ name: "", phone: "", locations: [{ name: "" }] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setActiveSection(getSectionForPath(pathname));
  }, [pathname]);

  useEffect(() => {
    if (!pathname.endsWith("/new-purchase") || !trades.length || typeof window === "undefined") return;
    const editId = Number(new URLSearchParams(window.location.search).get("edit"));
    const trade = trades.find((item) => item.id === editId);
    if (!trade) return;
    setTradeForm({
      id: trade.id,
      farmer_id: String(trade.farmer_id),
      location_id: trade.location_id ? String(trade.location_id) : "",
      trade_date: trade.trade_date,
      coconut_color: trade.coconut_color,
      purchase_mode: trade.purchase_mode,
      processing_type: trade.processing_type,
      coconut_quantity: String(trade.coconut_quantity),
      gross_weight_kg: String(trade.gross_weight_kg),
      empty_weight_kg: String(trade.empty_weight_kg),
      wastage_percent: String(trade.wastage_percent),
      rate_per_kg: String(trade.rate_per_kg),
      rate_per_piece: String(trade.rate_per_piece ?? 0),
      husk_removal_rate_per_1000: String(trade.husk_removal_rate_per_1000),
      tree_collection_rate_per_1000: String(trade.tree_collection_rate_per_1000),
      husk_price_per_1000: String(trade.husk_price_per_1000 ?? 0),
      deduct_dehusking: Number(trade.husk_removal_rate_per_1000) > 0,
      deduct_harvesting: Number(trade.tree_collection_rate_per_1000) > 0,
      advance_amount: String(trade.advance_amount),
      additional_credit_amount: String(trade.additional_credit_amount ?? 0),
      additional_credit_reason: trade.additional_credit_reason ?? "",
      additional_debit_amount: String(trade.additional_debit_amount ?? 0),
      additional_debit_reason: trade.additional_debit_reason ?? "",
      notes: trade.notes ?? ""
    });
    setShowCreditAdjustment(Number(trade.additional_credit_amount) > 0);
    setShowDebitAdjustment(Number(trade.additional_debit_amount) > 0);
  }, [pathname, trades]);

  function navigateTo(section: AppSection) {
    setActiveSection(section);
    clearFeedback();
    router.push(getPathForSection(section));
  }

  const loadWorkspace = useCallback(async (activeSession: Session | null) => {
    if (!activeSession) {
      setProfile(null);
      setFarmers([]);
      setLocations([]);
      setTrades([]);
      setAccessRequests([]);
      setTraderSettings(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    const profileResult = await supabase.from("profiles").select("*").eq("id", activeSession.user.id).maybeSingle();

    if (profileResult.error) {
      setError(profileResult.error.message);
      setLoading(false);
      return;
    }

    const loadedProfile = profileResult.data as Profile | null;
    setProfile(loadedProfile);
    setFullName(loadedProfile?.full_name ?? activeSession.user.user_metadata?.full_name ?? "");
    setPhone(loadedProfile?.phone?.replace("+91", "") ?? activeSession.user.user_metadata?.phone?.replace("+91", "") ?? "");
    setBusinessName(loadedProfile?.business_name ?? activeSession.user.user_metadata?.business_name ?? "");
    const metadataRole = activeSession.user.user_metadata?.account_type;
    setRoleChoice(loadedProfile?.account_type ?? (metadataRole === "trader" || metadataRole === "farmer" ? metadataRole : ""));

    if (loadedProfile?.account_type === "trader") {
      const [farmersResult, locationsResult, tradesResult, settingsResult, requestsResult] = await Promise.all([
        supabase.from("trader_farmers").select("*").order("name", { ascending: true }),
        supabase.from("farmer_locations").select("*").order("location_name", { ascending: true }),
        supabase.from("coconut_trades").select("*").order("trade_date", { ascending: false }).order("id", { ascending: false }),
        supabase.from("trader_settings").select("*").maybeSingle(),
        supabase.from("farmer_access_requests").select("*").order("requested_at", { ascending: false })
      ]);

      if (farmersResult.error || locationsResult.error || tradesResult.error || settingsResult.error || requestsResult.error) {
        setError(farmersResult.error?.message || locationsResult.error?.message || tradesResult.error?.message || settingsResult.error?.message || requestsResult.error?.message || "Unable to load trader data.");
      } else {
        setFarmers((farmersResult.data ?? []) as Farmer[]);
        setLocations((locationsResult.data ?? []) as FarmerLocation[]);
        setTrades((tradesResult.data ?? []) as CoconutTrade[]);
        setAccessRequests((requestsResult.data ?? []) as FarmerAccessRequest[]);
        const loadedSettings = (settingsResult.data ?? {
          trader_id: activeSession.user.id,
          purchase_mode: "weight",
          husk_removal_rate_per_1000: 1100,
          tree_collection_rate_per_1000: 1450,
          husk_price_per_1000: 0,
          kudume_wastage_percent: 3
        }) as TraderSettings;
        setTraderSettings(loadedSettings);
        setSettingsForm({
          purchaseMode: loadedSettings.purchase_mode,
          huskRemoval: String(loadedSettings.husk_removal_rate_per_1000),
          treeCollection: String(loadedSettings.tree_collection_rate_per_1000),
          huskPrice: String(loadedSettings.husk_price_per_1000),
          kudumeWastage: String(loadedSettings.kudume_wastage_percent)
        });
        setTradeForm((form) => form.id ? form : {
          ...form,
          purchase_mode: loadedSettings.purchase_mode,
          wastage_percent: form.processing_type === "kudume" ? String(loadedSettings.kudume_wastage_percent) : "0",
          husk_removal_rate_per_1000: String(loadedSettings.husk_removal_rate_per_1000),
          tree_collection_rate_per_1000: String(loadedSettings.tree_collection_rate_per_1000),
          husk_price_per_1000: String(loadedSettings.husk_price_per_1000),
          deduct_dehusking: Number(loadedSettings.husk_removal_rate_per_1000) > 0,
          deduct_harvesting: Number(loadedSettings.tree_collection_rate_per_1000) > 0
        });
      }
    } else if (loadedProfile?.account_type === "farmer") {
      const [requestsResult, farmersResult, locationsResult, tradesResult] = await Promise.all([
        supabase.from("farmer_access_requests").select("*").order("requested_at", { ascending: false }),
        supabase.from("trader_farmers").select("*").order("name", { ascending: true }),
        supabase.from("farmer_locations").select("*").order("location_name", { ascending: true }),
        supabase.from("coconut_trades").select("*").order("trade_date", { ascending: false }).order("id", { ascending: false })
      ]);

      if (requestsResult.error || farmersResult.error || locationsResult.error || tradesResult.error) {
        setError(requestsResult.error?.message || farmersResult.error?.message || locationsResult.error?.message || tradesResult.error?.message || "Unable to load shared purchases.");
      } else {
        setAccessRequests((requestsResult.data ?? []) as FarmerAccessRequest[]);
        setFarmers((farmersResult.data ?? []) as Farmer[]);
        setLocations((locationsResult.data ?? []) as FarmerLocation[]);
        setTrades((tradesResult.data ?? []) as CoconutTrade[]);
      }
      setTraderSettings(null);
    } else {
      setFarmers([]);
      setLocations([]);
      setTrades([]);
      setAccessRequests([]);
      setTraderSettings(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        void loadWorkspace(data.session);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        void loadWorkspace(nextSession);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadWorkspace]);

  useEffect(() => {
    if (session && profile?.account_type && pathname === "/") {
      router.replace("/dashboard");
    }
  }, [pathname, profile?.account_type, router, session]);

  const farmerById = useMemo(() => new Map(farmers.map((farmer) => [farmer.id, farmer])), [farmers]);
  const locationById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);
  const selectedTradeLocations = useMemo(
    () => locations.filter((location) => location.farmer_id === Number(tradeForm.farmer_id)),
    [locations, tradeForm.farmer_id]
  );
  const visibleFarmers = useMemo(() => {
    const query = farmerSearch.trim().toLowerCase();
    if (!query) return farmers;
    return farmers.filter((farmer) => `${farmer.name} ${farmer.phone}`.toLowerCase().includes(query));
  }, [farmerSearch, farmers]);
  const visibleTrades = useMemo(() => {
    const query = tradeSearch.trim().toLowerCase();
    if (!query) return trades;
    return trades.filter((trade) => {
      const farmer = farmerById.get(trade.farmer_id);
      const location = trade.location_id ? locationById.get(trade.location_id) : null;
      return `${formatPurchaseId(trade.id)} ${farmer?.name ?? ""} ${farmer?.phone ?? ""} ${location?.location_name ?? ""} ${trade.coconut_color} ${trade.processing_type}`.toLowerCase().includes(query);
    });
  }, [farmerById, locationById, tradeSearch, trades]);

  const calculation = useMemo(() => {
    const purchaseMode = tradeForm.purchase_mode;
    const quantity = Number(tradeForm.coconut_quantity) || 0;
    const gross = Number(tradeForm.gross_weight_kg) || 0;
    const empty = Number(tradeForm.empty_weight_kg) || 0;
    const net = Math.max(gross - empty, 0);
    const wastagePercent = Number(tradeForm.wastage_percent) || 0;
    const wastage = net * wastagePercent / 100;
    const payable = Math.max(net - wastage, 0);
    const coconutTotal = purchaseMode === "quantity" ? quantity * (Number(tradeForm.rate_per_piece) || 0) : payable * (Number(tradeForm.rate_per_kg) || 0);
    const huskRemovalCost = tradeForm.deduct_dehusking ? quantity / 1000 * (Number(tradeForm.husk_removal_rate_per_1000) || 0) : 0;
    const treeCollectionCost = tradeForm.deduct_harvesting ? quantity / 1000 * (Number(tradeForm.tree_collection_rate_per_1000) || 0) : 0;
    const huskPriceIncome = quantity / 1000 * (Number(tradeForm.husk_price_per_1000) || 0);
    const laborTotal = huskRemovalCost + treeCollectionCost;
    const total = Math.max(coconutTotal + huskPriceIncome - laborTotal, 0);
    const advance = Number(tradeForm.advance_amount) || 0;
    const additionalCredit = Number(tradeForm.additional_credit_amount) || 0;
    const additionalDebit = Number(tradeForm.additional_debit_amount) || 0;
    const averageWeightKg = purchaseMode === "weight" && quantity > 0 ? net / quantity : 0;
    const averageWeightGrams = averageWeightKg * 1000;
    const averagePricePerPiece = quantity > 0 ? total / quantity : 0;
    const balance = total - advance + additionalCredit - additionalDebit;
    return { purchaseMode, quantity, gross, empty, net, wastagePercent, wastage, payable, coconutTotal, huskRemovalCost, treeCollectionCost, huskPriceIncome, laborTotal, total, advance, additionalCredit, additionalDebit, balance, averageWeightKg, averageWeightGrams, averagePricePerPiece };
  }, [tradeForm]);

  const activitySeries = useMemo(() => {
    const totals = new Map<string, number>();
    trades.forEach((trade) => totals.set(trade.trade_date, (totals.get(trade.trade_date) ?? 0) + Number(trade.total_amount)));
    const latestDate = trades[0]?.trade_date ? new Date(`${trades[0].trade_date}T00:00:00`) : new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(latestDate);
      date.setDate(latestDate.getDate() - (6 - index));
      const dateKey = date.toISOString().slice(0, 10);
      return {
        dateKey,
        label: date.toLocaleDateString("en-IN", { weekday: "short" }),
        value: totals.get(dateKey) ?? 0
      };
    });
  }, [trades]);

  function clearFeedback() {
    setMessage("");
    setError("");
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    setSaving(true);

    try {
      if (mode === "signup") {
        if (!fullName.trim() || !isValidIndianPhone(phone) || !roleChoice) {
          throw new Error("Enter your name, a valid 10-digit Indian mobile number, and choose a workspace.");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        const { error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim(), phone: getStoredIndianPhone(phone), business_name: businessName.trim() || null, account_type: roleChoice } }
        });
        if (signupError) throw signupError;
        setMode("signin");
        setPassword("");
        setConfirmPassword("");
        setMessage("Account created. Sign in to open your selected workspace and finish your profile.");
      } else {
        const { data, error: signinError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signinError) throw signinError;
        setSession(data.session);
        setMessage("Signed in.");
      }
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError));
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (!session || !roleChoice) {
      setError("Choose Farmer or Trader to continue.");
      return;
    }
    if (!fullName.trim() || !isValidIndianPhone(phone)) {
      setError("Enter your name and a valid 10-digit Indian mobile number.");
      return;
    }
    setSaving(true);
    const { data, error: profileError } = await supabase.from("profiles").upsert({
      id: session.user.id,
      email: session.user.email ?? email.trim(),
      full_name: fullName.trim(),
      phone: getStoredIndianPhone(phone),
      account_type: roleChoice,
      business_name: businessName.trim() || null
    }).select("*").single();
    setSaving(false);

    if (profileError) {
      setError(profileError.message.includes("already linked") || profileError.code === "23505" ? "This mobile number is already linked to another account." : profileError.message);
      return;
    }

    setProfile(data as Profile);
    navigateTo("dashboard");
    setMessage(roleChoice === "trader" ? "Trader workspace ready." : "Farmer profile created. Approve trader requests here before shared purchases appear.");
    await loadWorkspace(session);
  }

  async function saveFarmer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (!session || profile?.account_type !== "trader") return;
    if (!farmerForm.name.trim() || !isValidIndianPhone(farmerForm.phone)) {
      setError("Enter the farmer name and a valid 10-digit Indian mobile number.");
      return;
    }
    const cleanLocations = farmerForm.locations.map((location) => ({ ...location, name: location.name.trim() })).filter((location) => location.name);
    if (cleanLocations.length === 0) {
      setError("Add at least one farming location.");
      return;
    }
    setSaving(true);

    if (editingFarmerId) {
      const { error: farmerError } = await supabase.from("trader_farmers").update({
        name: farmerForm.name.trim(),
        phone: getStoredIndianPhone(farmerForm.phone)
      }).eq("id", editingFarmerId).eq("trader_id", session.user.id);
      if (farmerError) {
        setSaving(false);
        setError(farmerError.code === "23505" ? "This farmer phone number is already in your portfolio." : farmerError.message);
        return;
      }

      const originalLocations = locations.filter((location) => location.farmer_id === editingFarmerId);
      const retainedIds = new Set(cleanLocations.flatMap((location) => location.id ? [location.id] : []));
      for (const location of cleanLocations) {
        const result = location.id
          ? await supabase.from("farmer_locations").update({ location_name: location.name }).eq("id", location.id).eq("farmer_id", editingFarmerId)
          : await supabase.from("farmer_locations").insert({ farmer_id: editingFarmerId, location_name: location.name, city: null });
        if (result.error) {
          setSaving(false);
          setError(result.error.message);
          return;
        }
      }
      const usedLocationIds = new Set(trades.filter((trade) => trade.farmer_id === editingFarmerId && trade.location_id).map((trade) => trade.location_id as number));
      const removableIds = originalLocations.filter((location) => !retainedIds.has(location.id) && !usedLocationIds.has(location.id)).map((location) => location.id);
      if (removableIds.length) {
        const { error: deleteLocationError } = await supabase.from("farmer_locations").delete().in("id", removableIds).eq("farmer_id", editingFarmerId);
        if (deleteLocationError) {
          setSaving(false);
          setError(deleteLocationError.message);
          return;
        }
      }

      setSaving(false);
      setEditingFarmerId(null);
      setFarmerForm({ name: "", phone: "", locations: [{ name: "" }] });
      setMessage("Farmer details updated. Existing purchase records kept their permanent farmer ID.");
    } else {
      const { data: farmer, error: farmerError } = await supabase.from("trader_farmers").insert({
        trader_id: session.user.id,
        name: farmerForm.name.trim(),
        phone: getStoredIndianPhone(farmerForm.phone),
        notes: null
      }).select("*").single();

      if (farmerError || !farmer) {
        setSaving(false);
        setError(farmerError?.code === "23505" ? "This farmer phone number is already in your portfolio." : farmerError?.message || "Unable to add farmer.");
        return;
      }

      const { error: locationError } = await supabase.from("farmer_locations").insert(
        cleanLocations.map((location) => ({ farmer_id: farmer.id, location_name: location.name, city: null }))
      );
      if (locationError) {
        setSaving(false);
        setError(locationError.message);
        return;
      }
      setSaving(false);
      setFarmerForm({ name: "", phone: "", locations: [{ name: "" }] });
      setMessage("Farmer added to your portfolio.");
    }

    await loadWorkspace(session);
    const returnToPurchase = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("returnTo") === "new-purchase";
    if (returnToPurchase) navigateTo("purchase");
  }

  function editFarmer(farmer: Farmer) {
    setEditingFarmerId(farmer.id);
    setFarmerForm({
      name: farmer.name,
      phone: getIndianPhoneValue(farmer.phone),
      locations: locations.filter((location) => location.farmer_id === farmer.id).map((location) => ({ id: location.id, name: location.location_name }))
    });
    navigateTo("farmers");
  }

  function cancelFarmerEdit() {
    setEditingFarmerId(null);
    setFarmerForm({ name: "", phone: "", locations: [{ name: "" }] });
  }

  async function saveTraderSettings() {
    if (!session || profile?.account_type !== "trader") return;
    const huskRemoval = Number(settingsForm.huskRemoval);
    const treeCollection = Number(settingsForm.treeCollection);
    const huskPrice = Number(settingsForm.huskPrice);
    const kudumeWastage = Number(settingsForm.kudumeWastage);
    if ([huskRemoval, treeCollection, huskPrice, kudumeWastage].some((value) => !Number.isFinite(value) || value < 0) || kudumeWastage > 100) {
      setError("Enter valid non-negative rates and a wastage percentage from 0 to 100.");
      return;
    }
    setSaving(true);
    const { data, error: settingsError } = await supabase.from("trader_settings").upsert({
      trader_id: session.user.id,
      purchase_mode: settingsForm.purchaseMode,
      husk_removal_rate_per_1000: huskRemoval,
      tree_collection_rate_per_1000: treeCollection,
      husk_price_per_1000: huskPrice,
      kudume_wastage_percent: kudumeWastage
    }).select("*").single();
    setSaving(false);
    if (settingsError || !data) {
      setError(settingsError?.message || "Unable to save purchase settings.");
      return;
    }
    const savedSettings = data as TraderSettings;
    setTraderSettings(savedSettings);
    setSettingsForm({ purchaseMode: settingsForm.purchaseMode, huskRemoval: String(huskRemoval), treeCollection: String(treeCollection), huskPrice: String(huskPrice), kudumeWastage: String(kudumeWastage) });
    setTradeForm((form) => form.id ? form : {
      ...form,
      purchase_mode: settingsForm.purchaseMode,
      wastage_percent: form.processing_type === "kudume" ? String(kudumeWastage) : "0",
      husk_removal_rate_per_1000: String(huskRemoval),
      tree_collection_rate_per_1000: String(treeCollection),
      husk_price_per_1000: String(huskPrice),
      deduct_dehusking: huskRemoval > 0,
      deduct_harvesting: treeCollection > 0
    });
    setEditingSettings(false);
    setMessage("Purchase settings saved for future records.");
  }

  async function savePurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (!session || profile?.account_type !== "trader") return;
    if (!tradeForm.farmer_id || !tradeForm.location_id) {
      setError("Choose a farmer and farming location.");
      return;
    }
    if (calculation.quantity <= 0) {
      setError("Enter the coconut quantity in pieces so labor costs can be calculated.");
      return;
    }
    if (calculation.purchaseMode === "weight") {
      if (calculation.gross <= 0 || calculation.empty > calculation.gross) {
        setError("Gross weight must be greater than zero and greater than or equal to empty weight.");
        return;
      }
      if (Number(tradeForm.rate_per_kg) < 0 || !tradeForm.rate_per_kg) {
        setError("Enter the purchase rate per kilogram.");
        return;
      }
    } else if (Number(tradeForm.rate_per_piece) < 0 || !tradeForm.rate_per_piece) {
      setError("Enter the purchase rate per coconut.");
      return;
    }
    if (calculation.advance > calculation.total) {
      setError("Advance cannot be greater than the calculated purchase amount.");
      return;
    }
    const creditReason = tradeForm.additional_credit_reason.trim();
    const debitReason = tradeForm.additional_debit_reason.trim();
    if (calculation.additionalCredit > 0 && !creditReason) {
      setError("Add a reason for the additional credit.");
      return;
    }
    if (calculation.additionalDebit > 0 && !debitReason) {
      setError("Add a reason for the additional debit.");
      return;
    }
    if (calculation.additionalDebit > calculation.total - calculation.advance + calculation.additionalCredit) {
      setError("Additional debit cannot be greater than the amount still payable.");
      return;
    }
    const paymentStatus: PaymentStatus = calculation.balance <= 0 ? "paid" : calculation.advance > 0 ? "partial" : "pending";
    setSaving(true);
    const payload = {
      trader_id: session.user.id,
      farmer_id: Number(tradeForm.farmer_id),
      location_id: Number(tradeForm.location_id),
      trade_date: tradeForm.trade_date,
      coconut_color: tradeForm.coconut_color,
      purchase_mode: calculation.purchaseMode,
      processing_type: calculation.purchaseMode === "quantity" ? "mottai" : tradeForm.processing_type,
      coconut_quantity: calculation.quantity,
      gross_weight_kg: calculation.purchaseMode === "weight" ? calculation.gross : 0,
      empty_weight_kg: calculation.purchaseMode === "weight" ? calculation.empty : 0,
      wastage_percent: calculation.purchaseMode === "weight" && tradeForm.processing_type === "kudume" ? calculation.wastagePercent : 0,
      rate_per_kg: calculation.purchaseMode === "weight" ? Number(tradeForm.rate_per_kg) : 0,
      rate_per_piece: calculation.purchaseMode === "quantity" ? Number(tradeForm.rate_per_piece) : 0,
      husk_removal_rate_per_1000: tradeForm.deduct_dehusking ? Number(tradeForm.husk_removal_rate_per_1000) : 0,
      tree_collection_rate_per_1000: tradeForm.deduct_harvesting ? Number(tradeForm.tree_collection_rate_per_1000) : 0,
      husk_price_per_1000: Number(tradeForm.husk_price_per_1000) || 0,
      advance_amount: calculation.advance,
      additional_credit_amount: calculation.additionalCredit,
      additional_credit_reason: calculation.additionalCredit > 0 ? creditReason : null,
      additional_debit_amount: calculation.additionalDebit,
      additional_debit_reason: calculation.additionalDebit > 0 ? debitReason : null,
      payment_status: paymentStatus,
      notes: tradeForm.notes.trim() || null
    };
    const result = tradeForm.id
      ? await supabase.from("coconut_trades").update(payload).eq("id", tradeForm.id).eq("trader_id", session.user.id)
      : await supabase.from("coconut_trades").insert(payload);
    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setTradeForm({ ...emptyTradeForm, trade_date: today });
    setShowCreditAdjustment(false);
    setShowDebitAdjustment(false);
    navigateTo("history");
    setMessage(tradeForm.id ? "Purchase updated and sharing status refreshed." : "Purchase recorded. A sharing request was sent when a farmer account matched this phone number.");
    await loadWorkspace(session);
  }

  async function deletePurchase(id: number) {
    if (!session || !window.confirm("Delete this purchase record?")) return;
    clearFeedback();
    setSaving(true);
    const { error: deleteError } = await supabase.from("coconut_trades").delete().eq("id", id).eq("trader_id", session.user.id);
    setSaving(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setMessage("Purchase deleted.");
    await loadWorkspace(session);
  }

  async function respondToAccessRequest(requestId: number, decision: "approved" | "rejected") {
    if (!session || profile?.account_type !== "farmer") return;
    clearFeedback();
    setSaving(true);
    const { error: responseError } = await supabase.rpc("respond_to_farmer_access_request", {
      request_key: requestId,
      decision
    });
    setSaving(false);
    if (responseError) {
      setError(responseError.message);
      return;
    }
    setMessage(decision === "approved" ? "Trader connection approved. Shared purchases are now visible." : "Trader connection declined.");
    await loadWorkspace(session);
  }

  function editPurchase(trade: CoconutTrade) {
    clearFeedback();
    setTradeForm({
      id: trade.id,
      farmer_id: String(trade.farmer_id),
      location_id: trade.location_id ? String(trade.location_id) : "",
      trade_date: trade.trade_date,
      coconut_color: trade.coconut_color,
      purchase_mode: trade.purchase_mode,
      processing_type: trade.processing_type,
      coconut_quantity: String(trade.coconut_quantity),
      gross_weight_kg: String(trade.gross_weight_kg),
      empty_weight_kg: String(trade.empty_weight_kg),
      wastage_percent: String(trade.wastage_percent),
      rate_per_kg: String(trade.rate_per_kg),
      rate_per_piece: String(trade.rate_per_piece ?? 0),
      husk_removal_rate_per_1000: String(trade.husk_removal_rate_per_1000),
      tree_collection_rate_per_1000: String(trade.tree_collection_rate_per_1000),
      husk_price_per_1000: String(trade.husk_price_per_1000 ?? 0),
      deduct_dehusking: Number(trade.husk_removal_rate_per_1000) > 0,
      deduct_harvesting: Number(trade.tree_collection_rate_per_1000) > 0,
      advance_amount: String(trade.advance_amount),
      additional_credit_amount: String(trade.additional_credit_amount ?? 0),
      additional_credit_reason: trade.additional_credit_reason ?? "",
      additional_debit_amount: String(trade.additional_debit_amount ?? 0),
      additional_debit_reason: trade.additional_debit_reason ?? "",
      notes: trade.notes ?? ""
    });
    setShowCreditAdjustment(Number(trade.additional_credit_amount) > 0);
    setShowDebitAdjustment(Number(trade.additional_debit_amount) > 0);
    router.push(`/dashboard/new-purchase?edit=${trade.id}`);
  }

  function exportPurchasePdf(trade: CoconutTrade, traderNameOverride?: string) {
    const farmer = farmerById.get(trade.farmer_id);
    const location = trade.location_id ? locationById.get(trade.location_id) ?? null : null;
    const traderName = traderNameOverride ?? profile?.full_name ?? "Trader";
    downloadPurchasePdf(trade, farmer, location, traderName);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMode("signin");
    setMessage("");
    setError("");
  }

  if (loading) {
    return <main className="page-shell"><section className="auth-panel loading-panel"><span className="eyebrow">COCONUT TRADE DESK</span><h1>Loading workspace</h1><p>Connecting to your private account.</p></section></main>;
  }

  if (!session) {
    return (
      <main className="page-shell auth-page">
        <section className="auth-panel">
          <div className="brand-lockup"><span className="brand-mark"><Sprout size={21} strokeWidth={2.4} aria-hidden="true" /></span><div><strong>COCONUT TRADE DESK</strong><span>Farmer and trader records</span></div></div>
          <div className="auth-copy"><span className="eyebrow">Private workspace</span><h1>{mode === "signup" ? "Create your account" : "Welcome back"}</h1><p>{mode === "signup" ? "Use your phone, email, password, and workspace choice to create an account." : "Sign in to continue to your private farmer or trader workspace."}</p></div>
          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); clearFeedback(); }} type="button">Sign up</button>
            <button className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); clearFeedback(); }} type="button">Sign in</button>
          </div>
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {mode === "signup" ? <>
              <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required /></label>
              <label>Phone number<div className="phone-input"><span>{"\uD83C\uDDEE\uD83C\uDDF3 +91"}</span><input inputMode="tel" value={phone} onChange={(event) => setPhone(getIndianPhoneValue(event.target.value))} placeholder="10-digit mobile number" required /></div></label>
              <label>Business or farm name <span className="optional">Optional</span><input value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Your business or farm name" /></label>
              <span className="form-section-label">Workspace</span>
              <div className="role-grid" aria-label="Choose your workspace">
                {roleOptions.map((role) => <button aria-pressed={roleChoice === role.value} className={`role-choice ${roleChoice === role.value ? "selected" : ""}`} key={role.value} onClick={() => setRoleChoice(role.value)} type="button"><span className="role-title">{role.label}</span><span>{role.description}</span></button>)}
              </div>
            </> : null}
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} required /></label>
            {mode === "signup" ? <label>Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={6} required /></label> : null}
            {error ? <p className="error-message">{error}</p> : null}
            {message ? <p className="status-message">{message}</p> : null}
            <button className="primary-button" disabled={saving} type="submit">{saving ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}</button>
          </form>
        </section>
      </main>
    );
  }

  if (!profile?.account_type) {
    return (
      <main className="page-shell onboarding-page">
        <section className="onboarding-panel">
          <div className="brand-lockup"><span className="brand-mark"><Sprout size={21} strokeWidth={2.4} aria-hidden="true" /></span><div><strong>COCONUT TRADE DESK</strong><span>Set up your private workspace</span></div></div>
          <div className="auth-copy"><span className="eyebrow">One last step</span><h1>What best describes you?</h1><p>Choose your workspace. You can use the same email and phone to sign in later.</p></div>
          <form onSubmit={saveProfile}>
            <div className="role-grid">
              {roleOptions.map((role) => <button className={`role-choice ${roleChoice === role.value ? "selected" : ""}`} key={role.value} onClick={() => setRoleChoice(role.value)} type="button"><span className="role-title">{role.label}</span><span>{role.description}</span></button>)}
            </div>
            <div className="form-grid">
              <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
              <label>Phone number<div className="phone-input"><span>{"\uD83C\uDDEE\uD83C\uDDF3 +91"}</span><input inputMode="tel" value={phone} onChange={(event) => setPhone(getIndianPhoneValue(event.target.value))} required /></div></label>
            </div>
            <label>Business or farm name <span className="optional">Optional</span><input value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Your business or farm name" /></label>
            {error ? <p className="error-message">{error}</p> : null}
            <button className="primary-button" disabled={saving || !roleChoice} type="submit">{saving ? "Saving..." : "Continue to workspace"}</button>
          </form>
          <button className="link-button" onClick={signOut} type="button">Sign out</button>
        </section>
      </main>
    );
  }

  const isTrader = profile.account_type === "trader";
  const selectedSection = appSections.find((section) => section.value === activeSection)?.label ?? "Dashboard";
  const totalPurchases = trades.reduce((sum, trade) => sum + Number(trade.total_amount), 0);
  const totalBalance = trades.reduce((sum, trade) => sum + Number(trade.balance_amount), 0);
  const totalPayableWeight = trades.reduce((sum, trade) => sum + Number(trade.payable_weight_kg), 0);
  const recentTrades = trades.slice(0, 5);
  const activityMax = Math.max(1, ...activitySeries.map((item) => item.value));
  const pendingAccessRequests = accessRequests.filter((request) => request.status === "pending");
  const requestByFarmerId = new Map(accessRequests.map((request) => [request.trader_farmer_id, request]));

  return (
    <main className="authenticated-shell">
      <aside className="desktop-sidebar">
        <div className="sidebar-brand"><div className="brand-lockup"><span className="brand-mark"><Sprout size={21} strokeWidth={2.4} aria-hidden="true" /></span><div><strong>COCONUT TRADE DESK</strong><span>{isTrader ? "Trader workspace" : "Farmer workspace"}</span></div></div></div>
        {isTrader ? <nav className="sidebar-nav" aria-label="Main navigation">{appSections.map((section) => { const SectionIcon = section.icon; return <button className={activeSection === section.value ? "active" : ""} key={section.value} onClick={() => navigateTo(section.value)} type="button" aria-current={activeSection === section.value ? "page" : undefined}><SectionIcon size={18} strokeWidth={2.2} aria-hidden="true" /><span>{section.label}</span></button>; })}</nav> : null}
        <div className="sidebar-account"><span className="eyebrow">Signed in as</span><strong>{profile.business_name || profile.full_name}</strong><span>{profile.email}</span></div>
        <button className="secondary-button sidebar-signout" onClick={signOut} type="button"><LogOut size={17} strokeWidth={2.2} aria-hidden="true" />Sign out</button>
      </aside>

      <section className="app-main">
        <header className="topbar">
          <div><span className="eyebrow">{isTrader ? selectedSection : "Farmer workspace"}</span><h1>{isTrader ? (activeSection === "dashboard" ? profile.business_name || profile.full_name : selectedSection) : profile.business_name || profile.full_name}</h1><p>{isTrader ? "Private coconut purchase records" : "Your farmer profile"}</p></div>
          <button className="secondary-button topbar-signout" onClick={signOut} type="button">Sign out</button>
        </header>

        {isTrader ? <nav className="mobile-section-nav" aria-label="Mobile navigation">{appSections.map((section) => { const SectionIcon = section.icon; return <button className={activeSection === section.value ? "active" : ""} key={section.value} onClick={() => navigateTo(section.value)} type="button" aria-current={activeSection === section.value ? "page" : undefined}><SectionIcon size={16} strokeWidth={2.2} aria-hidden="true" /><span>{section.shortLabel}</span></button>; })}</nav> : null}
        {error ? <p className="error-message">{error}</p> : null}
        {message ? <p className="status-message">{message}</p> : null}

        {!isTrader ? <section className="farmer-workspace">
          <section className="tool-panel"><div className="panel-heading"><div><span className="eyebrow">Private connections</span><h2>Purchase requests</h2></div><strong>{pendingAccessRequests.length}</strong></div><p className="muted-text">A trader can only share purchase records with you after you approve the connection while signed in to this account.</p>{pendingAccessRequests.length ? <div className="request-list">{pendingAccessRequests.map((request) => <article className="request-card" key={request.id}><div><strong>{request.trader_business_name || request.trader_name}</strong><span>{request.trader_name} wants to share purchases for {request.farmer_name} ({request.farmer_phone}).</span><small>{new Date(request.requested_at).toLocaleDateString("en-IN")}</small></div><div className="row-actions"><button className="primary-button" disabled={saving} onClick={() => respondToAccessRequest(request.id, "approved")} type="button">Approve</button><button className="danger-button" disabled={saving} onClick={() => respondToAccessRequest(request.id, "rejected")} type="button">Decline</button></div></article>)}</div> : <p className="empty-state">No pending purchase-sharing requests.</p>}</section>
          <section className="ledger-panel"><div className="panel-heading"><div><span className="eyebrow">Shared purchase history</span><h2>Purchases shared with you</h2></div></div><div className="table-wrap"><table><thead><tr><th>Purchase</th><th>Trader</th><th>Date</th><th>Quantity</th><th>Avg weight per nut</th><th>Avg price per nut</th><th>Balance</th><th>Document</th></tr></thead><tbody>{trades.map((trade) => { const request = requestByFarmerId.get(trade.farmer_id); return <tr key={`${trade.trader_id}-${trade.id}`}><td><strong>{formatPurchaseId(trade.id)}</strong><span className="muted-text">{trade.coconut_color} / {trade.processing_type === "mottai" ? "Mottai" : "Kudume"}</span></td><td>{request?.trader_business_name || request?.trader_name || "Approved trader"}</td><td>{formatDate(trade.trade_date)}</td><td>{formatNumber(Number(trade.coconut_quantity), 0)} pieces</td><td>{formatNumber(Number(trade.average_weight_kg) * 1000, 1)} g</td><td>{formatCurrency(Number(trade.average_price_per_piece))}</td><td className={Number(trade.balance_amount) > 0 ? "balance-cell" : "positive"}>{formatCurrency(Number(trade.balance_amount))}</td><td><button className="secondary-button" onClick={() => exportPurchasePdf(trade, request?.trader_name ?? "Trader")} type="button">Export PDF</button></td></tr>; })}</tbody></table>{trades.length === 0 ? <p className="empty-state">Approved purchases will appear here.</p> : null}</div></section>
        </section> : null}

        {isTrader && activeSection === "dashboard" ? <>
          <section className="welcome-band"><div><span className="eyebrow">Trader overview</span><h2>Keep every farmer purchase clear.</h2><p>Search farmers by phone, record weighbridge details, and keep a private purchase history.</p></div><button className="primary-button" onClick={() => navigateTo("purchase")} type="button"><CirclePlus size={18} strokeWidth={2.2} aria-hidden="true" />Record a purchase</button></section>
          <section className="metrics-grid">
            <article><div className="metric-head"><span className="metric-icon"><UsersRound size={18} strokeWidth={2.2} aria-hidden="true" /></span><span>Farmers</span></div><strong>{farmers.length}</strong><small>in your portfolio</small></article>
            <article><div className="metric-head"><span className="metric-icon"><ReceiptText size={18} strokeWidth={2.2} aria-hidden="true" /></span><span>Purchases</span></div><strong>{trades.length}</strong><small>purchase records</small></article>
            <article><div className="metric-head"><span className="metric-icon"><Scale size={18} strokeWidth={2.2} aria-hidden="true" /></span><span>Payable weight</span></div><strong>{formatNumber(totalPayableWeight)} kg</strong><small>after wastage</small></article>
            <article><div className="metric-head"><span className="metric-icon"><IndianRupee size={18} strokeWidth={2.2} aria-hidden="true" /></span><span>Purchase value</span></div><strong>{formatCurrency(totalPurchases)}</strong><small>all recorded purchases</small></article>
          </section>
          <section className="dashboard-grid">
            <article className="tool-panel"><div className="panel-heading"><div><span className="eyebrow">Latest activity</span><h2>Recent purchases</h2></div><button className="link-button" onClick={() => navigateTo("history")} type="button">View history<ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" /></button></div>{recentTrades.length ? <div className="summary-list">{recentTrades.map((trade) => <div key={trade.id}><span>{formatPurchaseId(trade.id)}</span><strong>{farmerById.get(trade.farmer_id)?.name ?? "Farmer"}</strong><span>{formatCurrency(Number(trade.total_amount))}</span></div>)}</div> : <p className="empty-state">No purchases recorded yet.</p>}</article>
            <article className="tool-panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">Live chart</span><h2>Purchase value</h2></div><BarChart3 size={22} strokeWidth={2} aria-hidden="true" /></div><p className="muted-text">Daily farmer payable value for the last seven recorded days.</p><div className="activity-chart" role="img" aria-label="Purchase value for the last seven recorded days"><div className="activity-chart-bars">{activitySeries.map((item) => <div className="activity-bar-slot" key={item.dateKey} title={item.dateKey + ": " + formatCurrency(item.value)}><div className="activity-bar" style={{ height: String(Math.max(item.value > 0 ? item.value / activityMax * 100 : 4, 4)) + "%" }}></div><small>{item.label}</small></div>)}</div></div></article>
            <article className="tool-panel"><div className="panel-heading"><div><span className="eyebrow">Outstanding</span><h2>Balance with farmers</h2></div><IndianRupee size={22} strokeWidth={2} aria-hidden="true" /></div><strong className="large-number">{formatCurrency(totalBalance)}</strong><p className="muted-text">Advance payments are subtracted from each purchase total.</p><button className="secondary-button" onClick={() => navigateTo("history")} type="button"><ReceiptText size={16} strokeWidth={2.2} aria-hidden="true" />Open purchase history</button></article>
          </section>
        </> : null}

        {isTrader && activeSection === "farmers" ? <section className="workspace-grid">
          <form className="tool-panel" onSubmit={saveFarmer}>
            <div className="panel-heading">
              <div><span className="eyebrow">{editingFarmerId ? "Edit farmer" : "Portfolio"}</span><h2>{editingFarmerId ? "Update farmer details" : "Add a farmer"}</h2></div>
              {editingFarmerId ? <button className="link-button" onClick={cancelFarmerEdit} type="button">Cancel edit</button> : null}
            </div>
            <p className="muted-text">Use the farmer phone number to identify the contact. Add every farming land as its own location.</p>
            <label>Farmer name<input value={farmerForm.name} onChange={(event) => setFarmerForm((form) => ({ ...form, name: event.target.value }))} required /></label>
            <label>Phone number<div className="phone-input"><span>{"\uD83C\uDDEE\uD83C\uDDF3 +91"}</span><input inputMode="tel" value={farmerForm.phone} onChange={(event) => setFarmerForm((form) => ({ ...form, phone: getIndianPhoneValue(event.target.value) }))} placeholder="10-digit mobile number" required /></div></label>
            <div className="field-heading"><label>Farming locations</label><button className="link-button" onClick={() => setFarmerForm((form) => ({ ...form, locations: [...form.locations, { name: "" }] }))} type="button">+ Add location</button></div>
            {farmerForm.locations.map((location, index) => <div className="location-row" key={location.id ?? `location-${index}`}><input aria-label={`Farming location ${index + 1}`} value={location.name} onChange={(event) => setFarmerForm((form) => ({ ...form, locations: form.locations.map((item, locationIndex) => locationIndex === index ? { ...item, name: event.target.value } : item) }))} placeholder="Village, town, or farm area" required />{farmerForm.locations.length > 1 ? <button className="remove-button" onClick={() => setFarmerForm((form) => ({ ...form, locations: form.locations.filter((_item, locationIndex) => locationIndex !== index) }))} type="button" aria-label="Remove location">Remove</button> : null}</div>)}
            <button className="primary-button" disabled={saving} type="submit">{saving ? "Saving..." : editingFarmerId ? "Update farmer" : "Add farmer"}</button>
          </form>
          <section className="tool-panel"><div className="panel-heading"><div><span className="eyebrow">Your portfolio</span><h2>Find a farmer</h2></div><strong>{farmers.length}</strong></div><label>Search by name or phone<input value={farmerSearch} onChange={(event) => setFarmerSearch(event.target.value)} placeholder="Try +91 or a name" /></label><div className="farmer-list">{visibleFarmers.map((farmer) => <article className="farmer-card" key={farmer.id}><div><strong>{farmer.name}</strong><span>{farmer.phone}</span></div><div className="location-tags">{locations.filter((location) => location.farmer_id === farmer.id).map((location) => <span key={location.id}>{location.location_name}</span>)}</div><a className="secondary-button" href={`/dashboard/farmers/${farmer.id}`}>View farmer</a><button className="secondary-button" onClick={() => editFarmer(farmer)} type="button">Edit farmer</button></article>)}{visibleFarmers.length === 0 ? <p className="empty-state">No farmers match this search.</p> : null}</div></section>
        </section> : null}

        {isTrader && activeSection === "purchase" ? <section className="workspace-grid">
          <form className="tool-panel purchase-form" onSubmit={savePurchase}>
            <div className="panel-heading"><div><span className="eyebrow">{tradeForm.id ? formatPurchaseId(tradeForm.id) : "New record"}</span><h2>{tradeForm.id ? "Edit purchase" : "Record coconut purchase"}</h2></div>{tradeForm.id ? <button className="link-button" onClick={() => { setTradeForm({ ...emptyTradeForm, trade_date: today }); router.push("/dashboard/new-purchase"); }} type="button">Cancel edit</button> : null}</div>
            <div className="form-grid">
              <label>Farmer<select value={tradeForm.farmer_id} onChange={(event) => { const value = event.target.value; if (value === "__add_farmer__") { router.push("/dashboard/farmers?returnTo=new-purchase"); return; } setTradeForm((form) => ({ ...form, farmer_id: value, location_id: "" })); }} required><option value="__add_farmer__">+ Add farmer</option><option value="">Select a farmer</option>{farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name} - {farmer.phone}</option>)}</select></label>
              <label>Farming location<select value={tradeForm.location_id} onChange={(event) => setTradeForm((form) => ({ ...form, location_id: event.target.value }))} required><option value="">Select location</option>{selectedTradeLocations.map((location) => <option key={location.id} value={location.id}>{location.location_name}{location.city ? ", " + location.city : ""}</option>)}</select></label>
              <label>Purchase date<input type="date" value={tradeForm.trade_date} onChange={(event) => setTradeForm((form) => ({ ...form, trade_date: event.target.value }))} required /></label>
              <label>Coconut colour<select value={tradeForm.coconut_color} onChange={(event) => setTradeForm((form) => ({ ...form, coconut_color: event.target.value as CoconutColor }))}>{coconutColors.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label>Purchase method<select value={tradeForm.purchase_mode} onChange={(event) => { const value = event.target.value as PurchaseMode; setTradeForm((form) => ({ ...form, purchase_mode: value, processing_type: value === "quantity" ? "mottai" : form.processing_type, wastage_percent: value === "quantity" ? "0" : form.processing_type === "kudume" ? String(traderSettings?.kudume_wastage_percent ?? 3) : "0" })); }}><option value="weight">Weight-based / weighbridge</option><option value="quantity">Quantity-based / per nut</option></select><span className="field-hint">{tradeForm.purchase_mode === "quantity" ? "Pay by individual coconut using a per-nut price." : "Pay by payable kilograms after weighbridge deductions."}</span></label>
            </div>
            {tradeForm.purchase_mode === "weight" ? <fieldset><legend>Coconut preparation</legend><div className="segmented">{processingTypes.map((item) => <button className={tradeForm.processing_type === item.value ? "active" : ""} key={item.value} onClick={() => setTradeForm((form) => ({ ...form, processing_type: item.value, wastage_percent: item.value === "kudume" ? (form.wastage_percent === "0" ? String(traderSettings?.kudume_wastage_percent ?? 3) : form.wastage_percent) : "0" }))} type="button"><strong>{item.label}</strong><span>{item.description}</span></button>)}</div></fieldset> : <p className="mode-note">Quantity-based purchases use individual coconut pieces and do not use Mottai, Kudume, or weighbridge fields.</p>}
            <div className="form-grid">
              <label>Coconut quantity (pieces)<input type="number" min="1" step="1" value={tradeForm.coconut_quantity} onChange={(event) => setTradeForm((form) => ({ ...form, coconut_quantity: event.target.value }))} required /><span className="field-hint">Labor and Mattai credit are calculated per 1,000 pieces.</span></label>
              {tradeForm.purchase_mode === "weight" ? <label>Empty weight (kg)<input type="number" min="0" step="0.001" value={tradeForm.empty_weight_kg} onChange={(event) => setTradeForm((form) => ({ ...form, empty_weight_kg: event.target.value }))} placeholder="Vehicle / basket weight" required /></label> : null}
              {tradeForm.purchase_mode === "weight" ? <label>Gross weight (kg)<input type="number" min="0.001" step="0.001" value={tradeForm.gross_weight_kg} onChange={(event) => setTradeForm((form) => ({ ...form, gross_weight_kg: event.target.value }))} required /></label> : null}
              {tradeForm.purchase_mode === "weight" ? <div className="calculated-field"><span>Net weight (kg)</span><strong>{formatNumber(calculation.net)} kg</strong></div> : null}
              {tradeForm.purchase_mode === "weight" ? <label>Rate per kg (INR)<input type="number" min="0" step="0.01" value={tradeForm.rate_per_kg} onChange={(event) => setTradeForm((form) => ({ ...form, rate_per_kg: event.target.value }))} required /></label> : <label>Price per coconut (INR)<input type="number" min="0" step="0.01" value={tradeForm.rate_per_piece} onChange={(event) => setTradeForm((form) => ({ ...form, rate_per_piece: event.target.value }))} required /><span className="field-hint">The purchase total is pieces multiplied by this price.</span></label>}
              <label>Husk / Mattai price per 1,000 (INR)<input type="number" min="0" step="0.01" value={tradeForm.husk_price_per_1000} onChange={(event) => setTradeForm((form) => ({ ...form, husk_price_per_1000: event.target.value }))} /><span className="field-hint">Optional credit added to the farmer for husk.</span></label>
              <label>Advance paid (INR)<input type="number" min="0" step="0.01" value={tradeForm.advance_amount} onChange={(event) => setTradeForm((form) => ({ ...form, advance_amount: event.target.value }))} /></label>
            </div>
            <fieldset className="deduction-options"><legend>Farmer deductions</legend><div className="checkbox-grid"><label className="checkbox-field"><input type="checkbox" checked={tradeForm.deduct_dehusking} onChange={(event) => setTradeForm((form) => ({ ...form, deduct_dehusking: event.target.checked }))} /><span><strong>Deduct dehusking</strong><small>Trader pays this labor and subtracts it from the farmer amount.</small></span></label><label className="checkbox-field"><input type="checkbox" checked={tradeForm.deduct_harvesting} onChange={(event) => setTradeForm((form) => ({ ...form, deduct_harvesting: event.target.checked }))} /><span><strong>Deduct coconut harvesting</strong><small>Trader pays this labor and subtracts it from the farmer amount.</small></span></label></div><span className="field-hint">Leave a deduction unchecked when the trader bears that cost.</span></fieldset>
            <label>Notes <span className="optional">Optional</span><textarea value={tradeForm.notes} onChange={(event) => setTradeForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Any quality, transport, or payment note" /></label>
            <button className="primary-button" disabled={saving || farmers.length === 0} type="submit">{saving ? "Saving..." : tradeForm.id ? "Update purchase" : "Save purchase"}</button>
          </form>
          <aside className="side-stack"><section className="tool-panel settings-panel"><div className="panel-heading"><div><span className="eyebrow">Protected defaults</span><h2>Purchase cost settings</h2></div>{editingSettings ? <button className="link-button" onClick={() => { setEditingSettings(false); setSettingsForm({ purchaseMode: traderSettings?.purchase_mode ?? "weight", huskRemoval: String(traderSettings?.husk_removal_rate_per_1000 ?? 1100), treeCollection: String(traderSettings?.tree_collection_rate_per_1000 ?? 1450), huskPrice: String(traderSettings?.husk_price_per_1000 ?? 0), kudumeWastage: String(traderSettings?.kudume_wastage_percent ?? 3) }); }} type="button">Cancel</button> : <button className="secondary-button" onClick={() => setEditingSettings(true)} type="button">Edit</button>}</div><p className="muted-text">These defaults are used for new purchases and saved with each invoice.</p><div className="settings-grid"><label>Default purchase method<select value={settingsForm.purchaseMode} disabled={!editingSettings} onChange={(event) => setSettingsForm((form) => ({ ...form, purchaseMode: event.target.value as PurchaseMode }))}>{purchaseModes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Dehusking deduction / 1,000<input type="number" min="0" step="0.01" value={settingsForm.huskRemoval} disabled={!editingSettings} onChange={(event) => setSettingsForm((form) => ({ ...form, huskRemoval: event.target.value }))} /></label><label>Coconut harvesting deduction / 1,000<input type="number" min="0" step="0.01" value={settingsForm.treeCollection} disabled={!editingSettings} onChange={(event) => setSettingsForm((form) => ({ ...form, treeCollection: event.target.value }))} /></label><label>Husk / Mattai price / 1,000<input type="number" min="0" step="0.01" value={settingsForm.huskPrice} disabled={!editingSettings} onChange={(event) => setSettingsForm((form) => ({ ...form, huskPrice: event.target.value }))} /></label><label>Kudume wastage (%)<input type="number" min="0" max="100" step="0.01" value={settingsForm.kudumeWastage} disabled={!editingSettings} onChange={(event) => setSettingsForm((form) => ({ ...form, kudumeWastage: event.target.value }))} /></label></div>{editingSettings ? <button className="primary-button" disabled={saving} onClick={saveTraderSettings} type="button">Save settings</button> : null}</section><section className="calculation-panel"><span className="eyebrow">Live calculation</span><h2>{calculation.purchaseMode === "quantity" ? "Per-nut summary" : "Weighbridge summary"}</h2><dl className="calculation-list">{calculation.purchaseMode === "weight" ? <><div><dt>Net weight</dt><dd>{formatNumber(calculation.net)} kg</dd></div><div><dt>Wastage</dt><dd>{formatNumber(calculation.wastage)} kg</dd></div><div><dt>Payable weight</dt><dd>{formatNumber(calculation.payable)} kg</dd></div></> : null}<div><dt>Coconut quantity</dt><dd>{formatNumber(calculation.quantity, 0)} pieces</dd></div><div><dt>Average weight per nut</dt><dd>{calculation.purchaseMode === "weight" ? formatNumber(calculation.averageWeightGrams, 1) + " g / nut" : "Not used"}</dd></div><div><dt>Average price per nut</dt><dd>{formatCurrency(calculation.averagePricePerPiece)} / nut</dd></div><div className="calculation-credit"><dt>Coconut purchase</dt><dd>{formatCurrency(calculation.coconutTotal)}</dd></div><div className="calculation-deduction"><dt>Dehusking</dt><dd>{formatCurrency(calculation.huskRemovalCost)}</dd></div><div className="calculation-deduction"><dt>Coconut harvesting</dt><dd>{formatCurrency(calculation.treeCollectionCost)}</dd></div><div className="calculation-credit"><dt>Husk / Mattai credit</dt><dd>{formatCurrency(calculation.huskPriceIncome)}</dd></div><div className="calculation-total"><dt>Net payable to farmer</dt><dd>{formatCurrency(calculation.total)}</dd></div><div><dt>Advance</dt><dd>{formatCurrency(calculation.advance)}</dd></div>{calculation.additionalCredit > 0 ? <div className="calculation-credit"><dt>Additional credit</dt><dd>{formatCurrency(calculation.additionalCredit)}</dd></div> : null}{calculation.additionalDebit > 0 ? <div className="calculation-deduction"><dt>Additional debit</dt><dd>{formatCurrency(calculation.additionalDebit)}</dd></div> : null}<div className="calculation-total"><dt>Balance to pay</dt><dd>{formatCurrency(calculation.balance)}</dd></div></dl><p className="field-hint">Checked dehusking and harvesting amounts are deducted from the farmer payment. Unchecked costs are borne by the trader. Husk / Mattai and green credits increase the farmer amount; red deductions reduce it.</p></section><section className="tool-panel"><span className="eyebrow">Workflow</span><h2>Before saving</h2><p className="muted-text">Choose the farmer and location, enter the piece quantity and weighbridge details, then save the invoice.</p></section></aside>
        </section> : null}

        {isTrader && activeSection === "purchase" ? <section className="tool-panel adjustment-panel"><div className="panel-heading"><div><span className="eyebrow">After advance</span><h2>Farmer adjustments</h2></div><span className="muted-text">Optional</span></div><p className="muted-text">Add a documented amount to pay the farmer or deduct an amount from the farmer balance.</p><div className="adjustment-actions"><button className="adjustment-toggle credit" onClick={() => { setShowCreditAdjustment(true); setTradeForm((form) => ({ ...form, additional_credit_amount: form.additional_credit_amount === "0" ? "" : form.additional_credit_amount })); }} type="button">+ Add credit to farmer</button><button className="adjustment-toggle debit" onClick={() => { setShowDebitAdjustment(true); setTradeForm((form) => ({ ...form, additional_debit_amount: form.additional_debit_amount === "0" ? "" : form.additional_debit_amount })); }} type="button">- Add debit to farmer</button></div>{showCreditAdjustment || Number(tradeForm.additional_credit_amount) > 0 ? <div className="adjustment-fields credit-fields"><label>Credit amount (INR)<input type="number" min="0" step="0.01" value={tradeForm.additional_credit_amount} onChange={(event) => setTradeForm((form) => ({ ...form, additional_credit_amount: event.target.value }))} /></label><label>Why is this being credited? <span className="required-note">Required when amount is entered</span><input value={tradeForm.additional_credit_reason} onChange={(event) => setTradeForm((form) => ({ ...form, additional_credit_reason: event.target.value }))} placeholder="Reason for additional payment" /></label></div> : null}{showDebitAdjustment || Number(tradeForm.additional_debit_amount) > 0 ? <div className="adjustment-fields debit-fields"><label>Debit amount (INR)<input type="number" min="0" step="0.01" value={tradeForm.additional_debit_amount} onChange={(event) => setTradeForm((form) => ({ ...form, additional_debit_amount: event.target.value }))} /></label><label>Why is this being deducted? <span className="required-note">Required when amount is entered</span><input value={tradeForm.additional_debit_reason} onChange={(event) => setTradeForm((form) => ({ ...form, additional_debit_reason: event.target.value }))} placeholder="Reason for deduction" /></label></div> : null}</section> : null}

        {isTrader && activeSection === "history" ? <section className="ledger-panel"><div className="panel-heading"><div><span className="eyebrow">Private ledger</span><h2>Purchase history</h2></div></div><label className="search-field">Search purchase ID, farmer, phone, or location<input value={tradeSearch} onChange={(event) => setTradeSearch(event.target.value)} placeholder="PUR-000001 or +91..." /></label><div className="table-wrap"><table><thead><tr><th>Purchase</th><th>Date</th><th>Farmer</th><th>Location</th><th>Coconut</th><th>Quantity</th><th>Avg weight per nut</th><th>Weight</th><th>Avg price per nut</th><th>Net payable</th><th>Balance</th><th>Sharing</th><th>Actions</th></tr></thead><tbody>{visibleTrades.map((trade) => { const farmer = farmerById.get(trade.farmer_id); const location = trade.location_id ? locationById.get(trade.location_id) : null; const sharingRequest = accessRequests.find((request) => request.trader_farmer_id === trade.farmer_id); return <tr key={trade.id}><td><a href={`/trades/${trade.id}`}>{formatPurchaseId(trade.id)}</a><span className="muted-text">{trade.purchase_mode === "quantity" ? "Per nut" : trade.processing_type === "mottai" ? "Mottai" : "Kudume"}</span></td><td>{formatDate(trade.trade_date)}</td><td><strong>{farmer?.name ?? "Unknown farmer"}</strong><span className="muted-text">{farmer?.phone}</span></td><td>{location?.location_name ?? "-"}</td><td><span className={`coconut-dot ${trade.coconut_color}`}></span>{trade.coconut_color}</td><td>{formatNumber(Number(trade.coconut_quantity), 0)} pieces</td><td>{trade.purchase_mode === "quantity" ? "Not used" : formatNumber(Number(trade.average_weight_kg) * 1000, 1) + " g"}</td><td>{trade.purchase_mode === "quantity" ? "Per nut" : formatNumber(Number(trade.payable_weight_kg)) + " kg"}{trade.purchase_mode === "weight" ? <span className="muted-text">Gross {formatNumber(Number(trade.gross_weight_kg))} kg</span> : null}</td><td>{formatCurrency(Number(trade.average_price_per_piece))}</td><td className="amount-cell">{formatCurrency(Number(trade.total_amount))}<span className="muted-text">Dehusking {formatCurrency(Number(trade.husk_removal_cost))}</span><span className="muted-text">Harvesting {formatCurrency(Number(trade.tree_collection_cost))}</span><span className="positive">Mattai {formatCurrency(Number(trade.husk_price_total))}</span></td><td className={Number(trade.balance_amount) > 0 ? "balance-cell" : "positive"}>{formatCurrency(Number(trade.balance_amount))}<span className="muted-text">{trade.payment_status}</span>{Number(trade.additional_credit_amount) > 0 ? <span className="positive">+{formatCurrency(Number(trade.additional_credit_amount))}</span> : null}{Number(trade.additional_debit_amount) > 0 ? <span className="balance-cell">-{formatCurrency(Number(trade.additional_debit_amount))}</span> : null}</td><td><span className={`status-badge ${sharingRequest?.status ?? "pending"}`}>{sharingRequest?.status ?? "No account match"}</span></td><td><div className="row-actions"><button className="secondary-button" onClick={() => exportPurchasePdf(trade)} type="button">Export PDF</button><button className="secondary-button" onClick={() => editPurchase(trade)} type="button">Edit</button><button className="danger-button" disabled={saving} onClick={() => deletePurchase(trade.id)} type="button">Delete</button></div></td></tr>; })}</tbody></table>{visibleTrades.length === 0 ? <p className="empty-state">No purchases match this search.</p> : null}</div></section> : null}
      </section>
    </main>
  );
}
