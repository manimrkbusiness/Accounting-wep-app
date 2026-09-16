"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../supabaseClient";

type Farmer = { name: string; phone: string; notes: string | null };
type Location = { id: number; location_name: string; city: string | null };
type Trade = { id: number; trade_date: string; coconut_color: string; processing_type: string; payable_weight_kg: number; total_amount: number; balance_amount: number };

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
}

function date(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function FarmerDetail() {
  const params = useParams<{ id: string }>();
  const farmerId = Number(params.id);
  const [session, setSession] = useState<Session | null>(null);
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadFarmer() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!active) return;
      setSession(sessionData.session);
      if (!sessionData.session || !farmerId) {
        setLoading(false);
        return;
      }

      const [farmerResult, locationsResult, tradesResult] = await Promise.all([
        supabase.from("trader_farmers").select("name, phone, notes").eq("id", farmerId).maybeSingle(),
        supabase.from("farmer_locations").select("id, location_name, city").eq("farmer_id", farmerId).order("location_name"),
        supabase.from("coconut_trades").select("id, trade_date, coconut_color, processing_type, payable_weight_kg, total_amount, balance_amount").eq("farmer_id", farmerId).order("trade_date", { ascending: false }).order("id", { ascending: false })
      ]);
      if (!active) return;
      if (farmerResult.error || locationsResult.error || tradesResult.error) {
        setError(farmerResult.error?.message || locationsResult.error?.message || tradesResult.error?.message || "Unable to load farmer details.");
      } else {
        setFarmer((farmerResult.data ?? null) as Farmer | null);
        setLocations((locationsResult.data ?? []) as Location[]);
        setTrades((tradesResult.data ?? []) as Trade[]);
      }
      setLoading(false);
    }
    void loadFarmer();
    return () => { active = false; };
  }, [farmerId]);

  if (loading) return <main className="page-shell"><section className="auth-panel loading-panel"><span className="eyebrow">Farmer details</span><h1>Loading farmer</h1><p>Checking the private farmer record.</p></section></main>;
  if (!session) return <main className="page-shell"><section className="auth-panel"><h1>Sign in required</h1><p>This farmer record is private to the trader who created it.</p><a className="primary-button" href="/">Go to sign in</a></section></main>;
  if (!farmer) return <main className="page-shell"><section className="auth-panel"><h1>Farmer not found</h1><p>This record may not exist or may belong to another trader.</p><a className="primary-button" href="/dashboard/farmers">Back to farmers</a></section></main>;

  return <main className="page-shell"><section className="detail-page"><header className="detail-header"><div><span className="eyebrow">Farmer profile</span><h1>{farmer.name}</h1><p>{farmer.phone} · Private trader record</p></div><a className="secondary-button" href="/dashboard/farmers">Back to farmers</a></header>{error ? <p className="error-message">{error}</p> : null}<div className="detail-grid"><article className="tool-panel"><span className="eyebrow">Farming locations</span><h2>Locations in portfolio</h2><div className="location-tags detail-tags">{locations.map((location) => <span key={location.id}>{location.location_name}{location.city ? `, ${location.city}` : ""}</span>)}</div>{farmer.notes ? <p className="muted-text">{farmer.notes}</p> : null}</article><article className="calculation-panel"><span className="eyebrow">Purchase summary</span><h2>{trades.length} purchase records</h2><strong className="large-number">{money(trades.reduce((sum, trade) => sum + Number(trade.total_amount), 0))}</strong><p className="field-hint">Total recorded value for this farmer.</p></article></div><section className="ledger-panel"><div className="panel-heading"><div><span className="eyebrow">Private history</span><h2>Purchases from {farmer.name}</h2></div></div><div className="table-wrap"><table><thead><tr><th>Purchase</th><th>Date</th><th>Coconut</th><th>Payable weight</th><th>Total</th><th>Balance</th></tr></thead><tbody>{trades.map((trade) => <tr key={trade.id}><td><a href={`/trades/${trade.id}`}>PUR-{String(trade.id).padStart(6, "0")}</a></td><td>{date(trade.trade_date)}</td><td>{trade.coconut_color} · {trade.processing_type === "mottai" ? "Mottai" : "Kudume"}</td><td>{Number(trade.payable_weight_kg).toLocaleString("en-IN")} kg</td><td className="amount-cell">{money(Number(trade.total_amount))}</td><td className={Number(trade.balance_amount) > 0 ? "balance-cell" : "positive"}>{money(Number(trade.balance_amount))}</td></tr>)}</tbody></table>{trades.length === 0 ? <p className="empty-state">No purchases recorded for this farmer.</p> : null}</div></section></section></main>;
}
