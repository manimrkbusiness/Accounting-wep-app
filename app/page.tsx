"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
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

type TradeForm = {
  id?: number;
  farmer_id: string;
  location_id: string;
  trade_date: string;
  coconut_color: CoconutColor;
  processing_type: ProcessingType;
  gross_weight_kg: string;
  empty_weight_kg: string;
  wastage_percent: string;
  rate_per_kg: string;
  advance_amount: string;
  notes: string;
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
  gross_weight_kg: "",
  empty_weight_kg: "",
  wastage_percent: "0",
  rate_per_kg: "",
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

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => /[",\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
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
  const [activeSection, setActiveSection] = useState<AppSection>("dashboard");
  const [farmerSearch, setFarmerSearch] = useState("");
  const [farmerPicker, setFarmerPicker] = useState("");
  const [tradeSearch, setTradeSearch] = useState("");
  const [tradeForm, setTradeForm] = useState<TradeForm>(emptyTradeForm);
  const [farmerForm, setFarmerForm] = useState({ name: "", phone: "", locations: [""] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadWorkspace = useCallback(async (activeSession: Session | null) => {
    if (!activeSession) {
      setProfile(null);
      setFarmers([]);
      setLocations([]);
      setTrades([]);
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
      const [farmersResult, locationsResult, tradesResult] = await Promise.all([
        supabase.from("trader_farmers").select("*").order("name", { ascending: true }),
        supabase.from("farmer_locations").select("*").order("location_name", { ascending: true }),
        supabase.from("coconut_trades").select("*").order("trade_date", { ascending: false }).order("id", { ascending: false })
      ]);

      if (farmersResult.error || locationsResult.error || tradesResult.error) {
        setError(farmersResult.error?.message || locationsResult.error?.message || tradesResult.error?.message || "Unable to load trader data.");
      } else {
        setFarmers((farmersResult.data ?? []) as Farmer[]);
        setLocations((locationsResult.data ?? []) as FarmerLocation[]);
        setTrades((tradesResult.data ?? []) as CoconutTrade[]);
      }
    } else {
      setFarmers([]);
      setLocations([]);
      setTrades([]);
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
    const gross = Number(tradeForm.gross_weight_kg) || 0;
    const empty = Number(tradeForm.empty_weight_kg) || 0;
    const net = Math.max(gross - empty, 0);
    const wastagePercent = Number(tradeForm.wastage_percent) || 0;
    const wastage = net * wastagePercent / 100;
    const payable = Math.max(net - wastage, 0);
    const total = payable * (Number(tradeForm.rate_per_kg) || 0);
    const advance = Number(tradeForm.advance_amount) || 0;
    return { gross, empty, net, wastagePercent, wastage, payable, total, advance, balance: total - advance };
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
    setActiveSection("dashboard");
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
    const cleanLocations = farmerForm.locations.map((value) => value.trim()).filter(Boolean);
    if (cleanLocations.length === 0) {
      setError("Add at least one farming location.");
      return;
    }
    setSaving(true);
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
      cleanLocations.map((locationName) => ({ farmer_id: farmer.id, location_name: locationName, city: null }))
    );
    setSaving(false);
    if (locationError) {
      setError(locationError.message);
      return;
    }

    setFarmerForm({ name: "", phone: "", locations: [""] });
    setMessage("Farmer added to your portfolio.");
    await loadWorkspace(session);
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
      gross_weight_kg: calculation.gross,
      empty_weight_kg: calculation.empty,
      wastage_percent: tradeForm.processing_type === "kudume" ? calculation.wastagePercent : 0,
      rate_per_kg: Number(tradeForm.rate_per_kg),
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
    setFarmerPicker("");
    setActiveSection("history");
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
      gross_weight_kg: String(trade.gross_weight_kg),
      empty_weight_kg: String(trade.empty_weight_kg),
      wastage_percent: String(trade.wastage_percent),
      rate_per_kg: String(trade.rate_per_kg),
      advance_amount: String(trade.advance_amount),
      notes: trade.notes ?? ""
    });
    const selectedFarmer = farmerById.get(trade.farmer_id);
    setFarmerPicker(selectedFarmer ? `${selectedFarmer.name} - ${selectedFarmer.phone}` : "");
    setActiveSection("purchase");
  }

  function exportTrades() {
    downloadCsv("coconut-purchase-history.csv", [
      ["Purchase ID", "Date", "Farmer", "Farmer phone", "Location", "Coconut", "Type", "Gross kg", "Empty kg", "Net kg", "Wastage kg", "Payable kg", "Rate/kg", "Total", "Advance", "Balance", "Payment"],
      ...visibleTrades.map((trade) => {
        const farmer = farmerById.get(trade.farmer_id);
        const location = trade.location_id ? locationById.get(trade.location_id) : null;
        return [formatPurchaseId(trade.id), trade.trade_date, farmer?.name ?? "", farmer?.phone ?? "", location?.location_name ?? "", trade.coconut_color, trade.processing_type, String(trade.gross_weight_kg), String(trade.empty_weight_kg), String(trade.net_weight_kg), String(trade.wastage_weight_kg), String(trade.payable_weight_kg), String(trade.rate_per_kg), String(trade.total_amount), String(trade.advance_amount), String(trade.balance_amount), trade.payment_status];
      })
    ]);
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
        {isTrader ? <nav className="sidebar-nav" aria-label="Main navigation">{appSections.map((section) => <button className={activeSection === section.value ? "active" : ""} key={section.value} onClick={() => { setActiveSection(section.value); clearFeedback(); }} type="button">{section.label}</button>)}</nav> : null}
        <div className="sidebar-account"><span className="eyebrow">Signed in as</span><strong>{profile.business_name || profile.full_name}</strong><span>{profile.email}</span></div>
        <button className="secondary-button sidebar-signout" onClick={signOut} type="button">Sign out</button>
      </aside>

      <section className="app-main">
        <header className="topbar">
          <div><span className="eyebrow">{isTrader ? selectedSection : "Farmer workspace"}</span><h1>{isTrader ? (activeSection === "dashboard" ? profile.business_name || profile.full_name : selectedSection) : profile.business_name || profile.full_name}</h1><p>{isTrader ? "Private coconut purchase records" : "Your farmer profile"}</p></div>
          <button className="secondary-button topbar-signout" onClick={signOut} type="button">Sign out</button>
        </header>

        {isTrader ? <nav className="mobile-section-nav" aria-label="Mobile navigation">{appSections.map((section) => <button className={activeSection === section.value ? "active" : ""} key={section.value} onClick={() => { setActiveSection(section.value); clearFeedback(); }} type="button">{section.shortLabel}</button>)}</nav> : null}
        {error ? <p className="error-message">{error}</p> : null}
        {message ? <p className="status-message">{message}</p> : null}

        {!isTrader ? <section className="empty-workspace"><span className="eyebrow">Farmer workspace</span><h2>Your farmer tools are coming next.</h2><p>Your account and contact details are saved. The farmer purchase, crop, expense, and income tools will be added in the next phase.</p></section> : null}

        {isTrader && activeSection === "dashboard" ? <>
          <section className="welcome-band"><div><span className="eyebrow">Trader overview</span><h2>Keep every farmer purchase clear.</h2><p>Search farmers by phone, record weighbridge details, and keep a private purchase history.</p></div><button className="primary-button" onClick={() => setActiveSection("purchase")} type="button">Record a purchase</button></section>
          <section className="metrics-grid">
            <article><span>Farmers</span><strong>{farmers.length}</strong><small>in your portfolio</small></article>
            <article><span>Purchases</span><strong>{trades.length}</strong><small>purchase records</small></article>
            <article><span>Payable weight</span><strong>{formatNumber(totalPayableWeight)} kg</strong><small>after wastage</small></article>
            <article><span>Purchase value</span><strong>{formatCurrency(totalPurchases)}</strong><small>all recorded purchases</small></article>
          </section>
          <section className="dashboard-grid">
            <article className="tool-panel"><div className="panel-heading"><div><span className="eyebrow">Latest activity</span><h2>Recent purchases</h2></div><button className="link-button" onClick={() => setActiveSection("history")} type="button">View history</button></div>{recentTrades.length ? <div className="summary-list">{recentTrades.map((trade) => <div key={trade.id}><span>{formatPurchaseId(trade.id)}</span><strong>{farmerById.get(trade.farmer_id)?.name ?? "Farmer"}</strong><span>{formatCurrency(Number(trade.total_amount))}</span></div>)}</div> : <p className="empty-state">No purchases recorded yet.</p>}</article>
            <article className="tool-panel"><span className="eyebrow">Outstanding</span><h2>Balance with farmers</h2><strong className="large-number">{formatCurrency(totalBalance)}</strong><p className="muted-text">Advance payments are subtracted from each purchase total.</p><button className="secondary-button" onClick={() => setActiveSection("history")} type="button">Open purchase history</button></article>
          </section>
        </> : null}

        {isTrader && activeSection === "farmers" ? <section className="workspace-grid">
          <form className="tool-panel" onSubmit={saveFarmer}><div className="panel-heading"><div><span className="eyebrow">Portfolio</span><h2>Add a farmer</h2></div></div><p className="muted-text">Farmer ID is the Indian phone number. Add every farming land as its own location.</p><label>Farmer name<input value={farmerForm.name} onChange={(event) => setFarmerForm((form) => ({ ...form, name: event.target.value }))} required /></label><label>Farmer ID / phone<div className="phone-input"><span>{"\uD83C\uDDEE\uD83C\uDDF3 +91"}</span><input inputMode="tel" value={farmerForm.phone} onChange={(event) => setFarmerForm((form) => ({ ...form, phone: getIndianPhoneValue(event.target.value) }))} placeholder="10-digit mobile number" required /></div></label><div className="field-heading"><label>Farming locations</label><button className="link-button" onClick={() => setFarmerForm((form) => ({ ...form, locations: [...form.locations, ""] }))} type="button">+ Add location</button></div>{farmerForm.locations.map((location, index) => <div className="location-row" key={`location-${index}`}><input aria-label={`Farming location ${index + 1}`} value={location} onChange={(event) => setFarmerForm((form) => ({ ...form, locations: form.locations.map((value, locationIndex) => locationIndex === index ? event.target.value : value) }))} placeholder="Village, town, or farm area" required />{farmerForm.locations.length > 1 ? <button className="remove-button" onClick={() => setFarmerForm((form) => ({ ...form, locations: form.locations.filter((_value, locationIndex) => locationIndex !== index) }))} type="button" aria-label="Remove location">Remove</button> : null}</div>)}<button className="primary-button" disabled={saving} type="submit">{saving ? "Saving..." : "Add farmer"}</button></form>
          <section className="tool-panel"><div className="panel-heading"><div><span className="eyebrow">Your portfolio</span><h2>Find a farmer</h2></div><strong>{farmers.length}</strong></div><label>Search by name or phone<input value={farmerSearch} onChange={(event) => setFarmerSearch(event.target.value)} placeholder="Try +91 or a name" /></label><div className="farmer-list">{visibleFarmers.map((farmer) => <article className="farmer-card" key={farmer.id}><div><strong>{farmer.name}</strong><span>{farmer.phone}</span></div><div className="location-tags">{locations.filter((location) => location.farmer_id === farmer.id).map((location) => <span key={location.id}>{location.location_name}</span>)}</div></article>)}{visibleFarmers.length === 0 ? <p className="empty-state">No farmers match this search.</p> : null}</div></section>
        </section> : null}

        {isTrader && activeSection === "purchase" ? <section className="workspace-grid">
          <form className="tool-panel purchase-form" onSubmit={savePurchase}><div className="panel-heading"><div><span className="eyebrow">{tradeForm.id ? formatPurchaseId(tradeForm.id) : "New record"}</span><h2>{tradeForm.id ? "Edit purchase" : "Record coconut purchase"}</h2></div>{tradeForm.id ? <button className="link-button" onClick={() => { setTradeForm({ ...emptyTradeForm, trade_date: today }); setFarmerPicker(""); }} type="button">Cancel edit</button> : null}</div><div className="form-grid"><label>Farmer<input list="farmer-options" value={farmerPicker} onChange={(event) => { const value = event.target.value; const match = farmers.find((farmer) => `${farmer.name} - ${farmer.phone}` === value); setFarmerPicker(value); setTradeForm((form) => ({ ...form, farmer_id: match ? String(match.id) : "", location_id: "" })); }} placeholder={farmers.length ? "Search name or phone" : "Add a farmer first"} required /><datalist id="farmer-options">{farmers.map((farmer) => <option key={farmer.id} value={`${farmer.name} - ${farmer.phone}`} />)}</datalist></label><label>Farming location<select value={tradeForm.location_id} onChange={(event) => setTradeForm((form) => ({ ...form, location_id: event.target.value }))} required><option value="">Select location</option>{selectedTradeLocations.map((location) => <option key={location.id} value={location.id}>{location.location_name}{location.city ? `, ${location.city}` : ""}</option>)}</select></label><label>Purchase date<input type="date" value={tradeForm.trade_date} onChange={(event) => setTradeForm((form) => ({ ...form, trade_date: event.target.value }))} required /></label><label>Coconut colour<select value={tradeForm.coconut_color} onChange={(event) => setTradeForm((form) => ({ ...form, coconut_color: event.target.value as CoconutColor }))}>{coconutColors.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><fieldset><legend>Coconut preparation</legend><div className="segmented">{processingTypes.map((item) => <button className={tradeForm.processing_type === item.value ? "active" : ""} key={item.value} onClick={() => setTradeForm((form) => ({ ...form, processing_type: item.value, wastage_percent: item.value === "kudume" ? (form.wastage_percent === "0" ? "3" : form.wastage_percent) : "0" }))} type="button"><strong>{item.label}</strong><span>{item.description}</span></button>)}</div></fieldset><div className="form-grid"><label>Gross weight (kg)<input type="number" min="0.001" step="0.001" value={tradeForm.gross_weight_kg} onChange={(event) => setTradeForm((form) => ({ ...form, gross_weight_kg: event.target.value }))} required /></label><label>Empty weight (kg)<input type="number" min="0" step="0.001" value={tradeForm.empty_weight_kg} onChange={(event) => setTradeForm((form) => ({ ...form, empty_weight_kg: event.target.value }))} placeholder="Vehicle / basket weight" required /></label>{tradeForm.processing_type === "kudume" ? <label>Wastage deduction (%)<input type="number" min="0" max="100" step="0.01" value={tradeForm.wastage_percent} onChange={(event) => setTradeForm((form) => ({ ...form, wastage_percent: event.target.value }))} /><span className="field-hint">Default is 3%: 30 kg per 1,000 kg.</span></label> : null}<label>Rate per kg (INR)<input type="number" min="0" step="0.01" value={tradeForm.rate_per_kg} onChange={(event) => setTradeForm((form) => ({ ...form, rate_per_kg: event.target.value }))} required /></label><label>Advance paid (INR)<input type="number" min="0" step="0.01" value={tradeForm.advance_amount} onChange={(event) => setTradeForm((form) => ({ ...form, advance_amount: event.target.value }))} /></label></div><label>Notes <span className="optional">Optional</span><textarea value={tradeForm.notes} onChange={(event) => setTradeForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Any quality, transport, or payment note" /></label><button className="primary-button" disabled={saving || farmers.length === 0} type="submit">{saving ? "Saving..." : tradeForm.id ? "Update purchase" : "Save purchase"}</button></form>
          <aside className="side-stack"><section className="calculation-panel"><span className="eyebrow">Live calculation</span><h2>Weighbridge summary</h2><dl className="calculation-list"><div><dt>Net weight</dt><dd>{formatNumber(calculation.net)} kg</dd></div><div><dt>Wastage</dt><dd>{formatNumber(calculation.wastage)} kg</dd></div><div><dt>Payable weight</dt><dd>{formatNumber(calculation.payable)} kg</dd></div><div><dt>Purchase total</dt><dd>{formatCurrency(calculation.total)}</dd></div><div><dt>Advance</dt><dd>{formatCurrency(calculation.advance)}</dd></div><div className="calculation-total"><dt>Balance</dt><dd>{formatCurrency(calculation.balance)}</dd></div></dl><p className="field-hint">Net = gross weight - empty weight. Payable weight subtracts the Kudume wastage deduction.</p></section><section className="tool-panel"><span className="eyebrow">Workflow</span><h2>Before saving</h2><p className="muted-text">Choose the farmer phone record and one of their farming locations. The purchase ID is generated automatically and can be used in the history URL.</p></section></aside>
        </section> : null}

        {isTrader && activeSection === "history" ? <section className="ledger-panel"><div className="panel-heading"><div><span className="eyebrow">Private ledger</span><h2>Purchase history</h2></div><button className="secondary-button" onClick={exportTrades} type="button">Download CSV</button></div><label className="search-field">Search purchase ID, farmer, phone, or location<input value={tradeSearch} onChange={(event) => setTradeSearch(event.target.value)} placeholder="PUR-000001 or +91..." /></label><div className="table-wrap"><table><thead><tr><th>Purchase</th><th>Date</th><th>Farmer</th><th>Location</th><th>Coconut</th><th>Weight</th><th>Total</th><th>Balance</th><th>Actions</th></tr></thead><tbody>{visibleTrades.map((trade) => { const farmer = farmerById.get(trade.farmer_id); const location = trade.location_id ? locationById.get(trade.location_id) : null; return <tr key={trade.id}><td><a href={`/trades/${trade.id}`}>{formatPurchaseId(trade.id)}</a><span className="muted-text">{trade.processing_type === "mottai" ? "Mottai" : "Kudume"}</span></td><td>{formatDate(trade.trade_date)}</td><td><strong>{farmer?.name ?? "Unknown farmer"}</strong><span className="muted-text">{farmer?.phone}</span></td><td>{location?.location_name ?? "-"}</td><td><span className={`coconut-dot ${trade.coconut_color}`}></span>{trade.coconut_color}</td><td>{formatNumber(Number(trade.payable_weight_kg))} kg<span className="muted-text">Gross {formatNumber(Number(trade.gross_weight_kg))} kg</span></td><td className="amount-cell">{formatCurrency(Number(trade.total_amount))}</td><td className={Number(trade.balance_amount) > 0 ? "balance-cell" : "positive"}>{formatCurrency(Number(trade.balance_amount))}<span className="muted-text">{trade.payment_status}</span></td><td><div className="row-actions"><button className="secondary-button" onClick={() => editPurchase(trade)} type="button">Edit</button><button className="danger-button" disabled={saving} onClick={() => deletePurchase(trade.id)} type="button">Delete</button></div></td></tr>; })}</tbody></table>{visibleTrades.length === 0 ? <p className="empty-state">No purchases match this search.</p> : null}</div></section> : null}
      </section>
    </main>
  );
}
