"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";

type BillingState = { access: boolean; status: string | null; trialEndsAt: string | null; currentPeriodEnd: string | null };

type RazorpayInstance = { open: () => void; on: (event: string, handler: () => void) => void };
type RazorpayOptions = {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  theme?: { color?: string };
  handler: (response: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
};

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("No window."));
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment window. Check your connection."));
    document.body.appendChild(script);
  });
}

function daysLeft(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

/** Gates the workspace behind a 14-day trial, then a ₹519/month Razorpay subscription. Fails open. */
export function BillingGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BillingState | null>(null); // null = still checking
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const check = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { setState({ access: true, status: "unknown", trialEndsAt: null, currentPeriodEnd: null }); return; }
      const response = await fetch("/api/razorpay/status", { headers: { Authorization: `Bearer ${token}` } });
      setState(await response.json());
    } catch {
      setState({ access: true, status: "error", trialEndsAt: null, currentPeriodEnd: null });
    }
  }, []);

  useEffect(() => { void check(); }, [check]);

  const subscribe = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      const response = await fetch("/api/razorpay/subscription", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not start the subscription.");
      await loadRazorpay();
      const RazorpayCtor = (window as unknown as { Razorpay: new (options: RazorpayOptions) => RazorpayInstance }).Razorpay;
      const checkout = new RazorpayCtor({
        key: json.keyId,
        subscription_id: json.subscriptionId,
        name: "BizzzTrack",
        description: "Coconut Trade Desk — ₹519 / month",
        theme: { color: "#1f7a4d" },
        handler: async (resp) => {
          try {
            const verify = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify(resp)
            });
            if (verify.ok) { await check(); } else { const vj = await verify.json().catch(() => ({})); setError(vj.error || "We could not confirm the payment yet. If money was deducted it will reflect shortly — refresh in a minute."); }
          } catch {
            setError("We could not confirm the payment yet. Refresh in a minute.");
          } finally { setBusy(false); }
        },
        modal: { ondismiss: () => setBusy(false) }
      });
      checkout.on("payment.failed", () => { setError("Payment failed. Please try again."); setBusy(false); });
      checkout.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }, [check]);

  const blocked = state !== null && state.access === false;

  if (blocked) {
    const expiredTrial = state?.status === "trialing" || state?.status === null;
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 16px" }}>
        <section className="auth-panel" style={{ maxWidth: 560, width: "100%", textAlign: "left", display: "grid", gap: 14 }}>
          <span className="eyebrow">BizzzTrack</span>
          <h1 style={{ margin: 0 }}>{expiredTrial ? "Your free trial has ended" : "Subscription needed"}</h1>
          <p style={{ margin: 0 }}>Keep your full Coconut Trade Desk — purchases, stock, sales, husk, team, cash book and reports — for <strong>₹519 / month</strong>. Pay with UPI, Google Pay, PhonePe, card or net-banking; it renews automatically and you can cancel anytime.</p>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, color: "var(--muted)", fontSize: "0.9rem" }}>
            <li>Everything you already use, nothing removed</li>
            <li>Automatic monthly billing after you authorize once</li>
            <li>Your data stays exactly where it is</li>
          </ul>
          {error ? <p className="error-message" role="alert">{error}</p> : null}
          <button className="primary-button" disabled={busy} onClick={() => void subscribe()} type="button">{busy ? "Opening payment…" : "Subscribe — ₹519 / month"}</button>
          <button className="link-button" onClick={() => void check()} type="button">I already paid — refresh</button>
        </section>
      </div>
    );
  }

  return (
    <>
      {state?.status === "trialing" && state.trialEndsAt ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 14px", marginBottom: 14, borderRadius: 8, background: "rgba(31, 122, 77, 0.10)", border: "1px solid rgba(31, 122, 77, 0.25)", fontSize: "0.9rem" }}>
          <span>Free trial — <strong>{daysLeft(state.trialEndsAt)} day{daysLeft(state.trialEndsAt) === 1 ? "" : "s"} left</strong>. ₹519 / month after that.</span>
          <button className="link-button" disabled={busy} onClick={() => void subscribe()} type="button">{busy ? "Opening…" : "Subscribe now"}</button>
        </div>
      ) : null}
      {error && state?.status === "trialing" ? <p className="error-message" role="alert">{error}</p> : null}
      {children}
    </>
  );
}
