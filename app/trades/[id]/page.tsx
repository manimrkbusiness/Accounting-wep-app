"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../supabaseClient";

type Trade = {
  id: number;
  farmer_id: number;
  location_id: number | null;
  trade_date: string;
  coconut_color: string;
  processing_type: string;
  gross_weight_kg: number;
  empty_weight_kg: number;
  wastage_percent: number;
  net_weight_kg: number;
  wastage_weight_kg: number;
  payable_weight_kg: number;
  rate_per_kg: number;
  total_amount: number;
  advance_amount: number;
  balance_amount: number;
  payment_status: string;
  notes: string | null;
};

type Farmer = { name: string; phone: string };
type Location = { location_name: string; city: string | null };

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(value || 0);
}

function formatPurchaseId(id: number) {
  return `PUR-${String(id).padStart(6, "0")}`;
}

export default function TradeDetail() {
  const params = useParams<{ id: string }>();
  const tradeId = Number(params.id);
  const [session, setSession] = useState<Session | null>(null);
  const [trade, setTrade] = useState<Trade | null>(null);
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadTrade() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!active) return;
      setSession(sessionData.session);
      if (!sessionData.session || !tradeId) {
        setLoading(false);
        return;
      }

      const { data, error: tradeError } = await supabase.from("coconut_trades").select("*").eq("id", tradeId).maybeSingle();
      if (!active) return;
      if (tradeError) {
        setError(tradeError.message);
        setLoading(false);
        return;
      }
      if (!data) {
        setLoading(false);
        return;
      }

      const loadedTrade = data as Trade;
      setTrade(loadedTrade);
      const [farmerResult, locationResult] = await Promise.all([
        supabase.from("trader_farmers").select("name, phone").eq("id", loadedTrade.farmer_id).maybeSingle(),
        loadedTrade.location_id ? supabase.from("farmer_locations").select("location_name, city").eq("id", loadedTrade.location_id).maybeSingle() : Promise.resolve({ data: null, error: null })
      ]);
      if (!active) return;
      setFarmer((farmerResult.data ?? null) as Farmer | null);
      setLocation((locationResult.data ?? null) as Location | null);
      if (farmerResult.error || locationResult.error) setError(farmerResult.error?.message || locationResult.error?.message || "Unable to load related details.");
      setLoading(false);
    }
    void loadTrade();
    return () => { active = false; };
  }, [tradeId]);

  const title = useMemo(() => trade ? formatPurchaseId(trade.id) : "Purchase", [trade]);

  if (loading) return <main className="page-shell"><section className="auth-panel loading-panel"><span className="eyebrow">Purchase detail</span><h1>Loading record</h1><p>Checking your private purchase history.</p></section></main>;
  if (!session) return <main className="page-shell"><section className="auth-panel"><h1>Sign in required</h1><p>This purchase record is private to the trader who created it.</p><a className="primary-button" href="/">Go to sign in</a></section></main>;
  if (!trade) return <main className="page-shell"><section className="auth-panel"><h1>Purchase not found</h1><p>This record may not exist or may belong to another trader.</p><a className="primary-button" href="/">Back to workspace</a></section></main>;

  return <main className="page-shell"><section className="detail-page"><header className="detail-header"><div><span className="eyebrow">Purchase detail</span><h1>{title}</h1><p>{trade.trade_date} · Private trader record</p></div><a className="secondary-button" href="/">Back to workspace</a></header>{error ? <p className="error-message">{error}</p> : null}<div className="detail-grid"><article className="tool-panel"><div className="panel-heading"><div><span className="eyebrow">Farmer purchase</span><h2>{farmer?.name ?? "Unknown farmer"}</h2></div><span className="status-badge">{trade.payment_status}</span></div><p className="muted-text">{farmer?.phone ?? "Phone unavailable"} · {location?.location_name ?? "Location unavailable"}</p><dl className="detail-list"><div><dt>Coconut</dt><dd>{trade.coconut_color} · {trade.processing_type === "mottai" ? "Mottai" : "Kudume"}</dd></div><div><dt>Gross weight</dt><dd>{formatNumber(Number(trade.gross_weight_kg))} kg</dd></div><div><dt>Empty weight</dt><dd>{formatNumber(Number(trade.empty_weight_kg))} kg</dd></div><div><dt>Net weight</dt><dd>{formatNumber(Number(trade.net_weight_kg))} kg</dd></div><div><dt>Wastage</dt><dd>{formatNumber(Number(trade.wastage_weight_kg))} kg ({trade.wastage_percent}%)</dd></div><div><dt>Payable weight</dt><dd>{formatNumber(Number(trade.payable_weight_kg))} kg</dd></div><div><dt>Rate</dt><dd>{formatCurrency(Number(trade.rate_per_kg))} / kg</dd></div><div><dt>Notes</dt><dd>{trade.notes || "-"}</dd></div></dl></article><article className="calculation-panel"><span className="eyebrow">Payment summary</span><h2>Purchase total</h2><strong className="large-number">{formatCurrency(Number(trade.total_amount))}</strong><dl className="calculation-list"><div><dt>Advance paid</dt><dd>{formatCurrency(Number(trade.advance_amount))}</dd></div><div className="calculation-total"><dt>Balance</dt><dd>{formatCurrency(Number(trade.balance_amount))}</dd></div></dl><p className="field-hint">Purchase IDs are permanent references for auditing and future exports.</p></article></div></section></main>;
}
