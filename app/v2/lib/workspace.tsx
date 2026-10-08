"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../supabaseClient";
import type { Buyer, CashEntry, Employee, Expense, Farmer, FarmerLocation, Profile, Purchase, Sale, SaleItem, StockEntry, StockEntryItem, TraderSettings, Vehicle } from "./types";
import { buildStockMap, type StockInfo } from "./calc";

export type WorkspaceStatus = "loading" | "signed-out" | "no-profile" | "not-trader" | "ready";

type WorkspaceData = {
  farmers: Farmer[];
  locations: FarmerLocation[];
  purchases: Purchase[];
  settings: TraderSettings | null;
  buyers: Buyer[];
  employees: Employee[];
  vehicles: Vehicle[];
  sales: Sale[];
  saleItems: SaleItem[];
  stockEntries: StockEntry[];
  stockEntryItems: StockEntryItem[];
  expenses: Expense[];
  cashEntries: CashEntry[];
};

const emptyData: WorkspaceData = {
  farmers: [],
  locations: [],
  purchases: [],
  settings: null,
  buyers: [],
  employees: [],
  vehicles: [],
  sales: [],
  saleItems: [],
  stockEntries: [],
  stockEntryItems: [],
  expenses: [],
  cashEntries: []
};

export type Workspace = WorkspaceData & {
  session: Session | null;
  profile: Profile | null;
  status: WorkspaceStatus;
  message: string;
  error: string;
  saving: boolean;
  setSaving: (value: boolean) => void;
  notify: (message: string) => void;
  fail: (error: string) => void;
  clearFeedback: () => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  farmerById: Map<number, Farmer>;
  locationById: Map<number, FarmerLocation>;
  purchaseById: Map<number, Purchase>;
  buyerById: Map<number, Buyer>;
  saleById: Map<number, Sale>;
  employeeById: Map<number, Employee>;
  vehicleById: Map<number, Vehicle>;
  stock: Map<number, StockInfo>;
  traderName: string;
};

const WorkspaceContext = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<WorkspaceStatus>("loading");
  const [data, setData] = useState<WorkspaceData>(emptyData);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadWorkspace = useCallback(async (activeSession: Session | null) => {
    if (!activeSession) {
      setProfile(null);
      setData(emptyData);
      setStatus("signed-out");
      return;
    }
    const profileResult = await supabase.from("profiles").select("*").eq("id", activeSession.user.id).maybeSingle();
    if (profileResult.error) {
      setError(profileResult.error.message);
      setStatus("ready");
      return;
    }
    const loadedProfile = profileResult.data as Profile | null;
    setProfile(loadedProfile);
    if (!loadedProfile?.account_type) {
      setStatus("no-profile");
      return;
    }
    if (loadedProfile.account_type !== "trader") {
      setStatus("not-trader");
      return;
    }
    const [farmers, locations, purchases, settings, buyers, employees, vehicles, sales, saleItems, stockEntries, stockEntryItems, expenses, cashEntries] = await Promise.all([
      supabase.from("trader_farmers").select("*").order("name"),
      supabase.from("farmer_locations").select("*").order("location_name"),
      supabase.from("coconut_trades").select("*").order("trade_date", { ascending: false }).order("id", { ascending: false }),
      supabase.from("trader_settings").select("*").maybeSingle(),
      supabase.from("buyers").select("*").order("name"),
      supabase.from("employees").select("*").order("name"),
      supabase.from("vehicles").select("*").order("vehicle_number"),
      supabase.from("sales").select("*").order("sale_date", { ascending: false }).order("id", { ascending: false }),
      supabase.from("sale_items").select("*"),
      supabase.from("stock_entries").select("*").order("entry_date", { ascending: false }).order("id", { ascending: false }),
      supabase.from("stock_entry_items").select("*"),
      supabase.from("expenses").select("*").order("expense_date", { ascending: false }).order("id", { ascending: false }),
      supabase.from("cash_entries").select("*").order("entry_date", { ascending: false }).order("id", { ascending: false })
    ]);
    const failed = [farmers, locations, purchases, settings, buyers, employees, vehicles, sales, saleItems, stockEntries, stockEntryItems, expenses, cashEntries].find((result) => result.error);
    if (failed?.error) {
      setError(failed.error.message);
    } else {
      setData({
        farmers: (farmers.data ?? []) as Farmer[],
        locations: (locations.data ?? []) as FarmerLocation[],
        purchases: (purchases.data ?? []) as Purchase[],
        settings: (settings.data ?? null) as TraderSettings | null,
        buyers: (buyers.data ?? []) as Buyer[],
        employees: (employees.data ?? []) as Employee[],
        vehicles: (vehicles.data ?? []) as Vehicle[],
        sales: (sales.data ?? []) as Sale[],
        saleItems: (saleItems.data ?? []) as SaleItem[],
        stockEntries: (stockEntries.data ?? []) as StockEntry[],
        stockEntryItems: (stockEntryItems.data ?? []) as StockEntryItem[],
        expenses: (expenses.data ?? []) as Expense[],
        cashEntries: (cashEntries.data ?? []) as CashEntry[]
      });
    }
    setStatus("ready");
  }, []);

  useEffect(() => {
    let active = true;
    let loadedUserId: string | null | undefined;
    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (!active) return;
      loadedUserId = sessionData.session?.user.id ?? null;
      setSession(sessionData.session);
      void loadWorkspace(sessionData.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      const nextUserId = nextSession?.user.id ?? null;
      setSession(nextSession);
      if (loadedUserId !== undefined && nextUserId === loadedUserId) return;
      loadedUserId = nextUserId;
      void loadWorkspace(nextSession);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadWorkspace]);

  const refresh = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    await loadWorkspace(sessionData.session);
  }, [loadWorkspace]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setData(emptyData);
    setStatus("signed-out");
  }, []);

  const value = useMemo<Workspace>(() => {
    const farmerById = new Map(data.farmers.map((farmer) => [farmer.id, farmer]));
    const locationById = new Map(data.locations.map((location) => [location.id, location]));
    const purchaseById = new Map(data.purchases.map((purchase) => [purchase.id, purchase]));
    const buyerById = new Map(data.buyers.map((buyer) => [buyer.id, buyer]));
    const saleById = new Map(data.sales.map((sale) => [sale.id, sale]));
    const employeeById = new Map(data.employees.map((employee) => [employee.id, employee]));
    const vehicleById = new Map(data.vehicles.map((vehicle) => [vehicle.id, vehicle]));
    return {
      ...data,
      session,
      profile,
      status,
      message,
      error,
      saving,
      setSaving,
      notify: (text: string) => { setMessage(text); setError(""); },
      fail: (text: string) => { setError(text); setMessage(""); },
      clearFeedback: () => { setMessage(""); setError(""); },
      refresh,
      signOut,
      farmerById,
      locationById,
      purchaseById,
      buyerById,
      saleById,
      employeeById,
      vehicleById,
      stock: buildStockMap(data.purchases, data.saleItems, data.stockEntries, data.stockEntryItems),
      traderName: profile?.business_name || profile?.full_name || "Trader"
    };
  }, [data, session, profile, status, message, error, saving, refresh, signOut]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside the Version 2 workspace.");
  return context;
}
