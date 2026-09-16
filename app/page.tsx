"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";
import { supabase } from "./supabaseClient";

type Mode = "signup" | "signin";
type Role = "farmer" | "trader";
type AppSection = "dashboard" | "farmers" | "purchase" | "history";
type CoconutColor = "green" | "brown" | "black";
type ProcessingType = "mottai" | "kudume";
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
  farmer_id: number;
  location_id: number | null;
  trade_date: string;
  coconut_color: CoconutColor;
  processing_type: ProcessingType;
  gross_weight_kg: number;
  empty_weight_kg: number;
  wastage_percent: number;
  rate_per_kg: number;
  coconut_quantity: number;
  husk_removal_rate_per_1000: number;
  tree_collection_rate_per_1000: number;
  husk_removal_cost: number;
  tree_collection_cost: number;
  labor_cost_total: number;
  average_weight_kg: number;
  average_price_per_piece: number;
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

type TraderSettings = {
  trader_id: string;
  husk_removal_rate_per_1000: number;
  tree_collection_rate_per_1000: number;
  kudume_wastage_percent: number;
};

type TradeForm = {
  id?: number;
  farmer_id: string;
  location_id: string;
  trade_date: string;
  coconut_color: CoconutColor;
  processing_type: ProcessingType;
  coconut_quantity: string;
  gross_weight_kg: string;
  empty_weight_kg: string;
  wastage_percent: string;
  rate_per_kg: string;
  husk_removal_rate_per_1000: string;
  tree_collection_rate_per_1000: string;
  advance_amount: string;
  notes: string;
};

type LocationInput = {
  id?: number;
  name: string;
};

const today = new Date().toISOString().slice(0, 10);

const roleOptions: Array<{ value: Role; label: string; description: string }> = [
  { value: "trader", label: "Trader", description: "Manage farmers and record coconut purchases." },
  { value: "farmer", label: "Farmer", description: "Your farmer workspace will be added in the next phase." }
];

const appSections: Array<{ value: AppSection; label: string; shortLabel: string }> = [
  { value: "dashboard", label: "Dashboard", shortLabel: "Home" },
  { value: "farmers", label: "Farmers", shortLabel: "Farmers" },
  { value: "purchase", label: "New purchase", shortLabel: "Add" },
  { value: "history", label: "Purchase history", shortLabel: "History" }
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

const emptyTradeForm: TradeForm = {
  farmer_id: "",
  location_id: "",
  trade_date: today,
  coconut_color: "green",
  processing_type: "mottai",
  coconut_quantity: "",
  gross_weight_kg: "",
  empty_weight_kg: "",
  wastage_percent: "0",
  rate_per_kg: "",
  husk_removal_rate_per_1000: "1100",
  tree_collection_rate_per_1000: "1450",
  advance_amount: "0",
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

function downloadPurchasePdf(trade: CoconutTrade, farmer: Farmer | undefined, location: FarmerLocation | null) {
  const doc = new jsPDF();
  const left = 18;
  let y = 20;
  const line = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, left, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 85, y);
    y += 8;
  };

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("COCONUT TRADE DESK", left, y);
  y += 10;
  doc.setFontSize(14);
  doc.text(`PUR-${String(trade.id).padStart(6, "0")}`, left, y);
  y += 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Purchase invoice", left, y);
  y += 10;
  doc.line(left, y, 192, y);
  y += 10;

  line("Date", formatDate(trade.trade_date));
  line("Farmer", farmer?.name ?? "Unknown farmer");
  line("Phone", farmer?.phone ?? "Unavailable");
  line("Location", location?.location_name ?? "Unavailable");
  line("Coconut", `${trade.coconut_color} / ${trade.processing_type === "mottai" ? "Mottai" : "Kudume"}`);
  line("Quantity", `${formatNumber(Number(trade.coconut_quantity), 2)} pieces`);
  line("Average weight", `${formatNumber(Number(trade.average_weight_kg) * 1000, 1)} g per coconut`);
  line("Average price", `INR ${formatNumber(Number(trade.average_price_per_piece), 2)} per coconut`);
  line("Gross weight", `${formatNumber(Number(trade.gross_weight_kg))} kg`);
  line("Empty weight", `${formatNumber(Number(trade.empty_weight_kg))} kg`);
  line("Net weight", `${formatNumber(Number(trade.net_weight_kg))} kg`);
  line("Wastage", `${formatNumber(Number(trade.wastage_weight_kg))} kg (${trade.wastage_percent}%)`);
  line("Payable weight", `${formatNumber(Number(trade.payable_weight_kg))} kg`);
  line("Rate", `INR ${formatNumber(Number(trade.rate_per_kg), 2)} / kg`);
  y += 3;
  doc.line(left, y, 192, y);
  y += 10;
  line("Coconut purchase", formatCurrency(Number(trade.total_amount) - Number(trade.labor_cost_total)).replace("₹", "INR "));
  line("Husk removal", formatCurrency(Number(trade.husk_removal_cost)).replace("₹", "INR "));
  line("Coconut harvesting", formatCurrency(Number(trade.tree_collection_cost)).replace("₹", "INR "));
  line("Net payable to farmer", formatCurrency(Number(trade.total_amount)).replace("₹", "INR "));
  line("Advance paid", formatCurrency(Number(trade.advance_amount)).replace("₹", "INR "));
  line("Balance", formatCurrency(Number(trade.balance_amount)).replace("₹", "INR "));
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
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [roleChoice, setRoleChoice] = useState<Role | "">("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [locations, setLocations] = useState<FarmerLocation[]>([]);
  const [trades, setTrades] = useState<CoconutTrade[]>([]);
  const [traderSettings, setTraderSettings] = useState<TraderSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState({ huskRemoval: "1100", treeCollection: "1450", kudumeWastage: "3" });
  const [editingSettings, setEditingSettings] = useState(false);
  const [activeSection, setActiveSection] = useState<AppSection>(() => getSectionForPath(pathname));
  const [farmerSearch, setFarmerSearch] = useState("");
  const [tradeSearch, setTradeSearch] = useState("");
  const [tradeForm, setTradeForm] = useState<TradeForm>(emptyTradeForm);
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
      processing_type: trade.processing_type,
      coconut_quantity: String(trade.coconut_quantity),
      gross_weight_kg: String(trade.gross_weight_kg),
      empty_weight_kg: String(trade.empty_weight_kg),
      wastage_percent: String(trade.wastage_percent),
      rate_per_kg: String(trade.rate_per_kg),
      husk_removal_rate_per_1000: String(trade.husk_removal_rate_per_1000),
      tree_collection_rate_per_1000: String(trade.tree_collection_rate_per_1000),
      advance_amount: String(trade.advance_amount),
      notes: trade.notes ?? ""
    });
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
    setRoleChoice(loadedProfile?.account_type ?? "");

    if (loadedProfile?.account_type === "trader") {
      const [farmersResult, locationsResult, tradesResult, settingsResult] = await Promise.all([
        supabase.from("trader_farmers").select("*").order("name", { ascending: true }),
        supabase.from("farmer_locations").select("*").order("location_name", { ascending: true }),
        supabase.from("coconut_trades").select("*").order("trade_date", { ascending: false }).order("id", { ascending: false }),
        supabase.from("trader_settings").select("*").maybeSingle()
      ]);

      if (farmersResult.error || locationsResult.error || tradesResult.error || settingsResult.error) {
        setError(farmersResult.error?.message || locationsResult.error?.message || tradesResult.error?.message || settingsResult.error?.message || "Unable to load trader data.");
      } else {
        setFarmers((farmersResult.data ?? []) as Farmer[]);
        setLocations((locationsResult.data ?? []) as FarmerLocation[]);
        setTrades((tradesResult.data ?? []) as CoconutTrade[]);
        const loadedSettings = (settingsResult.data ?? {
          trader_id: activeSession.user.id,
          husk_removal_rate_per_1000: 1100,
          tree_collection_rate_per_1000: 1450,
          kudume_wastage_percent: 3
        }) as TraderSettings;
        setTraderSettings(loadedSettings);
        setSettingsForm({
          huskRemoval: String(loadedSettings.husk_removal_rate_per_1000),
          treeCollection: String(loadedSettings.tree_collection_rate_per_1000),
          kudumeWastage: String(loadedSettings.kudume_wastage_percent)
        });
        setTradeForm((form) => form.id ? form : {
          ...form,
          wastage_percent: form.processing_type === "kudume" ? String(loadedSettings.kudume_wastage_percent) : "0",
          husk_removal_rate_per_1000: String(loadedSettings.husk_removal_rate_per_1000),
          tree_collection_rate_per_1000: String(loadedSettings.tree_collection_rate_per_1000)
        });
      }
    } else {
      setFarmers([]);
      setLocations([]);
      setTrades([]);
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
    const quantity = Number(tradeForm.coconut_quantity) || 0;
    const gross = Number(tradeForm.gross_weight_kg) || 0;
    const empty = Number(tradeForm.empty_weight_kg) || 0;
    const net = Math.max(gross - empty, 0);
    const wastagePercent = Number(tradeForm.wastage_percent) || 0;
    const wastage = net * wastagePercent / 100;
    const payable = Math.max(net - wastage, 0);
    const coconutTotal = payable * (Number(tradeForm.rate_per_kg) || 0);
    const huskRemovalCost = quantity / 1000 * (Number(tradeForm.husk_removal_rate_per_1000) || 0);
    const treeCollectionCost = quantity / 1000 * (Number(tradeForm.tree_collection_rate_per_1000) || 0);
    const laborTotal = huskRemovalCost + treeCollectionCost;
    const total = Math.max(coconutTotal - laborTotal, 0);
    const advance = Number(tradeForm.advance_amount) || 0;
    const averageWeightKg = quantity > 0 ? net / quantity : 0;
    const averageWeightGrams = averageWeightKg * 1000;
    const averagePricePerPiece = quantity > 0 ? total / quantity : 0;
    return { quantity, gross, empty, net, wastagePercent, wastage, payable, coconutTotal, huskRemovalCost, treeCollectionCost, laborTotal, total, advance, balance: total - advance, averageWeightKg, averageWeightGrams, averagePricePerPiece };
  }, [tradeForm]);

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
        if (!fullName.trim() || !isValidIndianPhone(phone)) {
          throw new Error("Enter your name and a valid 10-digit Indian mobile number.");
        }
        const { error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim(), phone: getStoredIndianPhone(phone), business_name: businessName.trim() || null } }
        });
        if (signupError) throw signupError;
        setMode("signin");
        setPassword("");
        setMessage("Account created. Sign in to choose Farmer or Trader and finish your profile.");
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
      setError(profileError.message);
      return;
    }

    setProfile(data as Profile);
    navigateTo("dashboard");
    setMessage(roleChoice === "trader" ? "Trader workspace ready." : "Farmer profile created. Your workspace will be added in the next phase.");
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
    const kudumeWastage = Number(settingsForm.kudumeWastage);
    if ([huskRemoval, treeCollection, kudumeWastage].some((value) => !Number.isFinite(value) || value < 0) || kudumeWastage > 100) {
      setError("Enter valid non-negative labor rates and a wastage percentage from 0 to 100.");
      return;
    }
    setSaving(true);
    const { data, error: settingsError } = await supabase.from("trader_settings").upsert({
      trader_id: session.user.id,
      husk_removal_rate_per_1000: huskRemoval,
      tree_collection_rate_per_1000: treeCollection,
      kudume_wastage_percent: kudumeWastage
    }).select("*").single();
    setSaving(false);
    if (settingsError || !data) {
      setError(settingsError?.message || "Unable to save purchase settings.");
      return;
    }
    const savedSettings = data as TraderSettings;
    setTraderSettings(savedSettings);
    setSettingsForm({ huskRemoval: String(huskRemoval), treeCollection: String(treeCollection), kudumeWastage: String(kudumeWastage) });
    setTradeForm((form) => form.id ? form : {
      ...form,
      wastage_percent: form.processing_type === "kudume" ? String(kudumeWastage) : "0",
      husk_removal_rate_per_1000: String(huskRemoval),
      tree_collection_rate_per_1000: String(treeCollection)
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
    if (calculation.gross <= 0 || calculation.empty > calculation.gross) {
      setError("Gross weight must be greater than zero and greater than or equal to empty weight.");
      return;
    }
    if (calculation.quantity <= 0) {
      setError("Enter the coconut quantity in pieces so labor costs can be calculated.");
      return;
    }
    if (Number(tradeForm.rate_per_kg) < 0 || !tradeForm.rate_per_kg) {
      setError("Enter the purchase rate per kilogram.");
      return;
    }
    if (calculation.advance > calculation.total) {
      setError("Advance cannot be greater than the calculated purchase amount.");
      return;
    }
    const paymentStatus: PaymentStatus = calculation.advance >= calculation.total ? "paid" : calculation.advance > 0 ? "partial" : "pending";
    setSaving(true);
    const payload = {
      trader_id: session.user.id,
      farmer_id: Number(tradeForm.farmer_id),
      location_id: Number(tradeForm.location_id),
      trade_date: tradeForm.trade_date,
      coconut_color: tradeForm.coconut_color,
      processing_type: tradeForm.processing_type,
      coconut_quantity: calculation.quantity,
      gross_weight_kg: calculation.gross,
      empty_weight_kg: calculation.empty,
      wastage_percent: tradeForm.processing_type === "kudume" ? calculation.wastagePercent : 0,
      rate_per_kg: Number(tradeForm.rate_per_kg),
      husk_removal_rate_per_1000: Number(tradeForm.husk_removal_rate_per_1000),
      tree_collection_rate_per_1000: Number(tradeForm.tree_collection_rate_per_1000),
      advance_amount: calculation.advance,
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
    navigateTo("history");
    setMessage(tradeForm.id ? "Purchase updated." : "Purchase recorded.");
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

  function editPurchase(trade: CoconutTrade) {
    clearFeedback();
    setTradeForm({
      id: trade.id,
      farmer_id: String(trade.farmer_id),
      location_id: trade.location_id ? String(trade.location_id) : "",
      trade_date: trade.trade_date,
      coconut_color: trade.coconut_color,
      processing_type: trade.processing_type,
      coconut_quantity: String(trade.coconut_quantity),
      gross_weight_kg: String(trade.gross_weight_kg),
      empty_weight_kg: String(trade.empty_weight_kg),
      wastage_percent: String(trade.wastage_percent),
      rate_per_kg: String(trade.rate_per_kg),
      husk_removal_rate_per_1000: String(trade.husk_removal_rate_per_1000),
      tree_collection_rate_per_1000: String(trade.tree_collection_rate_per_1000),
      advance_amount: String(trade.advance_amount),
      notes: trade.notes ?? ""
    });
    router.push(`/dashboard/new-purchase?edit=${trade.id}`);
  }

  function exportPurchasePdf(trade: CoconutTrade) {
    const farmer = farmerById.get(trade.farmer_id);
    const location = trade.location_id ? locationById.get(trade.location_id) ?? null : null;
    downloadPurchasePdf(trade, farmer, location);
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
          <div className="brand-lockup"><span className="brand-mark">CT</span><div><strong>COCONUT TRADE DESK</strong><span>Farmer and trader records</span></div></div>
          <div className="auth-copy"><span className="eyebrow">Private workspace</span><h1>{mode === "signup" ? "Create your account" : "Welcome back"}</h1><p>{mode === "signup" ? "Start with your name, phone, and email. Choose Farmer or Trader after signing in." : "Sign in to continue to your private farmer or trader workspace."}</p></div>
          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); clearFeedback(); }} type="button">Sign up</button>
            <button className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); clearFeedback(); }} type="button">Sign in</button>
          </div>
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {mode === "signup" ? <>
              <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required /></label>
              <label>Phone number<div className="phone-input"><span>{"\uD83C\uDDEE\uD83C\uDDF3 +91"}</span><input inputMode="tel" value={phone} onChange={(event) => setPhone(getIndianPhoneValue(event.target.value))} placeholder="10-digit mobile number" required /></div></label>
              <label>Business or farm name <span className="optional">Optional</span><input value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Your business or farm name" /></label>
            </> : null}
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} required /></label>
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
          <div className="brand-lockup"><span className="brand-mark">CT</span><div><strong>COCONUT TRADE DESK</strong><span>Set up your private workspace</span></div></div>
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

  return (
    <main className="authenticated-shell">
      <aside className="desktop-sidebar">
        <div className="sidebar-brand"><div className="brand-lockup"><span className="brand-mark">CT</span><div><strong>COCONUT TRADE DESK</strong><span>{isTrader ? "Trader workspace" : "Farmer workspace"}</span></div></div></div>
        {isTrader ? <nav className="sidebar-nav" aria-label="Main navigation">{appSections.map((section) => <button className={activeSection === section.value ? "active" : ""} key={section.value} onClick={() => navigateTo(section.value)} type="button">{section.label}</button>)}</nav> : null}
        <div className="sidebar-account"><span className="eyebrow">Signed in as</span><strong>{profile.business_name || profile.full_name}</strong><span>{profile.email}</span></div>
        <button className="secondary-button sidebar-signout" onClick={signOut} type="button">Sign out</button>
      </aside>

      <section className="app-main">
        <header className="topbar">
          <div><span className="eyebrow">{isTrader ? selectedSection : "Farmer workspace"}</span><h1>{isTrader ? (activeSection === "dashboard" ? profile.business_name || profile.full_name : selectedSection) : profile.business_name || profile.full_name}</h1><p>{isTrader ? "Private coconut purchase records" : "Your farmer profile"}</p></div>
          <button className="secondary-button topbar-signout" onClick={signOut} type="button">Sign out</button>
        </header>

        {isTrader ? <nav className="mobile-section-nav" aria-label="Mobile navigation">{appSections.map((section) => <button className={activeSection === section.value ? "active" : ""} key={section.value} onClick={() => navigateTo(section.value)} type="button">{section.shortLabel}</button>)}</nav> : null}
        {error ? <p className="error-message">{error}</p> : null}
        {message ? <p className="status-message">{message}</p> : null}

        {!isTrader ? <section className="empty-workspace"><span className="eyebrow">Farmer workspace</span><h2>Your farmer tools are coming next.</h2><p>Your account and contact details are saved. The farmer purchase, crop, expense, and income tools will be added in the next phase.</p></section> : null}

        {isTrader && activeSection === "dashboard" ? <>
          <section className="welcome-band"><div><span className="eyebrow">Trader overview</span><h2>Keep every farmer purchase clear.</h2><p>Search farmers by phone, record weighbridge details, and keep a private purchase history.</p></div><button className="primary-button" onClick={() => navigateTo("purchase")} type="button">Record a purchase</button></section>
          <section className="metrics-grid">
            <article><span>Farmers</span><strong>{farmers.length}</strong><small>in your portfolio</small></article>
            <article><span>Purchases</span><strong>{trades.length}</strong><small>purchase records</small></article>
            <article><span>Payable weight</span><strong>{formatNumber(totalPayableWeight)} kg</strong><small>after wastage</small></article>
            <article><span>Purchase value</span><strong>{formatCurrency(totalPurchases)}</strong><small>all recorded purchases</small></article>
          </section>
          <section className="dashboard-grid">
            <article className="tool-panel"><div className="panel-heading"><div><span className="eyebrow">Latest activity</span><h2>Recent purchases</h2></div><button className="link-button" onClick={() => navigateTo("history")} type="button">View history</button></div>{recentTrades.length ? <div className="summary-list">{recentTrades.map((trade) => <div key={trade.id}><span>{formatPurchaseId(trade.id)}</span><strong>{farmerById.get(trade.farmer_id)?.name ?? "Farmer"}</strong><span>{formatCurrency(Number(trade.total_amount))}</span></div>)}</div> : <p className="empty-state">No purchases recorded yet.</p>}</article>
            <article className="tool-panel"><span className="eyebrow">Outstanding</span><h2>Balance with farmers</h2><strong className="large-number">{formatCurrency(totalBalance)}</strong><p className="muted-text">Advance payments are subtracted from each purchase total.</p><button className="secondary-button" onClick={() => navigateTo("history")} type="button">Open purchase history</button></article>
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
          <form className="tool-panel purchase-form" onSubmit={savePurchase}><div className="panel-heading"><div><span className="eyebrow">{tradeForm.id ? formatPurchaseId(tradeForm.id) : "New record"}</span><h2>{tradeForm.id ? "Edit purchase" : "Record coconut purchase"}</h2></div>{tradeForm.id ? <button className="link-button" onClick={() => { setTradeForm({ ...emptyTradeForm, trade_date: today }); router.push("/dashboard/new-purchase"); }} type="button">Cancel edit</button> : null}</div><div className="form-grid"><label>Farmer<select value={tradeForm.farmer_id} onChange={(event) => { const value = event.target.value; if (value === "__add_farmer__") { router.push("/dashboard/farmers?returnTo=new-purchase"); return; } setTradeForm((form) => ({ ...form, farmer_id: value, location_id: "" })); }} required><option value="__add_farmer__">+ Add farmer</option><option value="">Select a farmer</option>{farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name} - {farmer.phone}</option>)}</select></label><label>Farming location<select value={tradeForm.location_id} onChange={(event) => setTradeForm((form) => ({ ...form, location_id: event.target.value }))} required><option value="">Select location</option>{selectedTradeLocations.map((location) => <option key={location.id} value={location.id}>{location.location_name}{location.city ? `, ${location.city}` : ""}</option>)}</select></label><label>Purchase date<input type="date" value={tradeForm.trade_date} onChange={(event) => setTradeForm((form) => ({ ...form, trade_date: event.target.value }))} required /></label><label>Coconut colour<select value={tradeForm.coconut_color} onChange={(event) => setTradeForm((form) => ({ ...form, coconut_color: event.target.value as CoconutColor }))}>{coconutColors.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><fieldset><legend>Coconut preparation</legend><div className="segmented">{processingTypes.map((item) => <button className={tradeForm.processing_type === item.value ? "active" : ""} key={item.value} onClick={() => setTradeForm((form) => ({ ...form, processing_type: item.value, wastage_percent: item.value === "kudume" ? (form.wastage_percent === "0" ? String(traderSettings?.kudume_wastage_percent ?? 3) : form.wastage_percent) : "0" }))} type="button"><strong>{item.label}</strong><span>{item.description}</span></button>)}</div></fieldset><div className="form-grid"><label>Coconut quantity (pieces)<input type="number" min="1" step="1" value={tradeForm.coconut_quantity} onChange={(event) => setTradeForm((form) => ({ ...form, coconut_quantity: event.target.value }))} required /><span className="field-hint">Labor charges are calculated per 1,000 pieces.</span></label><label>Empty weight (kg)<input type="number" min="0" step="0.001" value={tradeForm.empty_weight_kg} onChange={(event) => setTradeForm((form) => ({ ...form, empty_weight_kg: event.target.value }))} placeholder="Vehicle / basket weight" required /></label><label>Gross weight (kg)<input type="number" min="0.001" step="0.001" value={tradeForm.gross_weight_kg} onChange={(event) => setTradeForm((form) => ({ ...form, gross_weight_kg: event.target.value }))} required /></label><div className="calculated-field"><span>Net weight (kg)</span><strong>{formatNumber(calculation.net)} kg</strong></div><label>Rate per kg (INR)<input type="number" min="0" step="0.01" value={tradeForm.rate_per_kg} onChange={(event) => setTradeForm((form) => ({ ...form, rate_per_kg: event.target.value }))} required /></label><label>Advance paid (INR)<input type="number" min="0" step="0.01" value={tradeForm.advance_amount} onChange={(event) => setTradeForm((form) => ({ ...form, advance_amount: event.target.value }))} /></label></div><label>Notes <span className="optional">Optional</span><textarea value={tradeForm.notes} onChange={(event) => setTradeForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Any quality, transport, or payment note" /></label><button className="primary-button" disabled={saving || farmers.length === 0} type="submit">{saving ? "Saving..." : tradeForm.id ? "Update purchase" : "Save purchase"}</button></form>
          <aside className="side-stack"><section className="tool-panel settings-panel"><div className="panel-heading"><div><span className="eyebrow">Protected defaults</span><h2>Purchase cost settings</h2></div>{editingSettings ? <button className="link-button" onClick={() => { setEditingSettings(false); setSettingsForm({ huskRemoval: String(traderSettings?.husk_removal_rate_per_1000 ?? 1100), treeCollection: String(traderSettings?.tree_collection_rate_per_1000 ?? 1450), kudumeWastage: String(traderSettings?.kudume_wastage_percent ?? 3) }); }} type="button">Cancel</button> : <button className="secondary-button" onClick={() => setEditingSettings(true)} type="button">Edit</button>}</div><p className="muted-text">These defaults are used for new purchases and saved with each invoice.</p><div className="settings-grid"><label>Husk removal / 1,000<input type="number" min="0" step="0.01" value={settingsForm.huskRemoval} disabled={!editingSettings} onChange={(event) => setSettingsForm((form) => ({ ...form, huskRemoval: event.target.value }))} /></label><label>Coconut harvesting / 1,000<input type="number" min="0" step="0.01" value={settingsForm.treeCollection} disabled={!editingSettings} onChange={(event) => setSettingsForm((form) => ({ ...form, treeCollection: event.target.value }))} /></label><label>Kudume wastage (%)<input type="number" min="0" max="100" step="0.01" value={settingsForm.kudumeWastage} disabled={!editingSettings} onChange={(event) => setSettingsForm((form) => ({ ...form, kudumeWastage: event.target.value }))} /></label></div>{editingSettings ? <button className="primary-button" disabled={saving} onClick={saveTraderSettings} type="button">Save settings</button> : null}</section><section className="calculation-panel"><span className="eyebrow">Live calculation</span><h2>Weighbridge summary</h2><dl className="calculation-list"><div><dt>Net weight</dt><dd>{formatNumber(calculation.net)} kg</dd></div><div><dt>Wastage</dt><dd>{formatNumber(calculation.wastage)} kg</dd></div><div><dt>Payable weight</dt><dd>{formatNumber(calculation.payable)} kg</dd></div><div><dt>Average weight</dt><dd>{formatNumber(calculation.averageWeightGrams, 1)} g / coconut</dd></div><div><dt>Average farmer price</dt><dd>{formatCurrency(calculation.averagePricePerPiece)} / coconut</dd></div><div><dt>Coconut purchase</dt><dd>{formatCurrency(calculation.coconutTotal)}</dd></div><div><dt>Husk removal</dt><dd>{formatCurrency(calculation.huskRemovalCost)}</dd></div><div><dt>Coconut harvesting</dt><dd>{formatCurrency(calculation.treeCollectionCost)}</dd></div><div><dt>Net payable to farmer</dt><dd>{formatCurrency(calculation.total)}</dd></div><div><dt>Advance</dt><dd>{formatCurrency(calculation.advance)}</dd></div><div className="calculation-total"><dt>Balance</dt><dd>{formatCurrency(calculation.balance)}</dd></div></dl><p className="field-hint">Average weight uses net weight. Average farmer price uses the amount after labor deductions.</p></section><section className="tool-panel"><span className="eyebrow">Workflow</span><h2>Before saving</h2><p className="muted-text">Choose the farmer and location, enter the piece quantity and weighbridge details, then save the invoice.</p></section></aside>
        </section> : null}

        {isTrader && activeSection === "history" ? <section className="ledger-panel"><div className="panel-heading"><div><span className="eyebrow">Private ledger</span><h2>Purchase history</h2></div></div><label className="search-field">Search purchase ID, farmer, phone, or location<input value={tradeSearch} onChange={(event) => setTradeSearch(event.target.value)} placeholder="PUR-000001 or +91..." /></label><div className="table-wrap"><table><thead><tr><th>Purchase</th><th>Date</th><th>Farmer</th><th>Location</th><th>Coconut</th><th>Quantity</th><th>Avg weight</th><th>Weight</th><th>Avg price</th><th>Net payable</th><th>Balance</th><th>Actions</th></tr></thead><tbody>{visibleTrades.map((trade) => { const farmer = farmerById.get(trade.farmer_id); const location = trade.location_id ? locationById.get(trade.location_id) : null; return <tr key={trade.id}><td><a href={`/trades/${trade.id}`}>{formatPurchaseId(trade.id)}</a><span className="muted-text">{trade.processing_type === "mottai" ? "Mottai" : "Kudume"}</span></td><td>{formatDate(trade.trade_date)}</td><td><strong>{farmer?.name ?? "Unknown farmer"}</strong><span className="muted-text">{farmer?.phone}</span></td><td>{location?.location_name ?? "-"}</td><td><span className={`coconut-dot ${trade.coconut_color}`}></span>{trade.coconut_color}</td><td>{formatNumber(Number(trade.coconut_quantity), 0)} pieces</td><td>{formatNumber(Number(trade.average_weight_kg) * 1000, 1)} g</td><td>{formatNumber(Number(trade.payable_weight_kg))} kg<span className="muted-text">Gross {formatNumber(Number(trade.gross_weight_kg))} kg</span></td><td>{formatCurrency(Number(trade.average_price_per_piece))}</td><td className="amount-cell">{formatCurrency(Number(trade.total_amount))}</td><td className={Number(trade.balance_amount) > 0 ? "balance-cell" : "positive"}>{formatCurrency(Number(trade.balance_amount))}<span className="muted-text">{trade.payment_status}</span></td><td><div className="row-actions"><button className="secondary-button" onClick={() => exportPurchasePdf(trade)} type="button">Export PDF</button><button className="secondary-button" onClick={() => editPurchase(trade)} type="button">Edit</button><button className="danger-button" disabled={saving} onClick={() => deletePurchase(trade.id)} type="button">Delete</button></div></td></tr>; })}</tbody></table>{visibleTrades.length === 0 ? <p className="empty-state">No purchases match this search.</p> : null}</div></section> : null}
      </section>
    </main>
  );
}
