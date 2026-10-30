"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { formatDate } from "../lib/format";

type Invoice = { id: string; amount: number | null; status: string; paymentId: string | null; date: string | null; periodStart: string | null; periodEnd: string | null; receiptUrl: string | null };
type HistoryData = { invoices: Invoice[]; nextChargeAt: string | null; status: string | null };

function rupees(amount: number | null) {
  return amount == null ? "—" : `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Trader-facing payment history + downloadable receipts, fetched live from Razorpay. */
export function BillingHistory({ refreshKey = 0 }: { refreshKey?: number | string }) {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) { setData({ invoices: [], nextChargeAt: null, status: null }); return; }
      const response = await fetch("/api/razorpay/invoices", { headers: { Authorization: `Bearer ${token}` } });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load billing history.");
      setData(json as HistoryData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load billing history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const invoices = data?.invoices ?? [];

  return (
    <section className="tool-panel">
      <div className="panel-heading" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div><span className="eyebrow">Billing</span><h2>Payments &amp; receipts</h2></div>
        <button className="secondary-button" type="button" disabled={loading} onClick={() => void load()}>{loading ? "Loading…" : "Reload"}</button>
      </div>

      {data?.nextChargeAt ? (
        <p className="field-hint">Next automatic charge: <strong>{formatDate(data.nextChargeAt)}</strong>.</p>
      ) : (
        <p className="field-hint">Every payment you make appears here with a receipt you can download.</p>
      )}

      {error ? <p className="error-message form-error" role="alert">{error}</p> : null}

      {invoices.length === 0 ? (
        <p className="muted-text">{loading ? "Loading your payment history…" : "No payments yet. Your first receipt will appear here after your first charge."}</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", borderBottom: "1px solid var(--line)" }}>
                <th style={{ padding: "8px 10px", fontWeight: 600 }}>Date</th>
                <th style={{ padding: "8px 10px", fontWeight: 600 }}>Amount</th>
                <th style={{ padding: "8px 10px", fontWeight: 600 }}>Billing period</th>
                <th style={{ padding: "8px 10px", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "8px 10px", fontWeight: 600 }}>Transaction ID</th>
                <th style={{ padding: "8px 10px", fontWeight: 600 }}>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const paid = inv.status === "paid";
                return (
                  <tr key={inv.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "10px" }}>{inv.date ? formatDate(inv.date) : "—"}</td>
                    <td style={{ padding: "10px", fontWeight: 600 }}>{rupees(inv.amount)}</td>
                    <td style={{ padding: "10px", color: "var(--muted)", whiteSpace: "nowrap" }}>{inv.periodStart && inv.periodEnd ? `${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}` : "—"}</td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ color: paid ? "var(--green)" : "var(--muted)", fontWeight: 600, textTransform: "capitalize" }}>{inv.status || "—"}</span>
                    </td>
                    <td style={{ padding: "10px", color: "var(--muted)", fontSize: "0.82rem", wordBreak: "break-all" }}>{inv.paymentId ?? "—"}</td>
                    <td style={{ padding: "10px" }}>
                      {inv.receiptUrl ? <a href={inv.receiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--green)", fontWeight: 600 }}>Download</a> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
