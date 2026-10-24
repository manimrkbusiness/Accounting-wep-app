"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { PLAN_PRICE_LABEL } from "./plan";

export type BillingState = {
  access: boolean;
  status: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

type RazorpayPaymentFailure = {
  error?: {
    code?: string;
    description?: string;
    reason?: string;
    source?: string;
    step?: string;
  };
};

type RazorpayInstance = { open: () => void; on: (event: string, handler: (failure?: RazorpayPaymentFailure) => void) => void };

function paymentFailureMessage(failure?: RazorpayPaymentFailure) {
  const error = failure?.error;
  if (!error) return "Payment failed. Please try again.";
  const details = [error.description, error.reason].filter(Boolean).join(" — ");
  const context = [error.source, error.step].filter(Boolean).join(" / ");
  const code = error.code ? ` [${error.code}]` : "";
  return `Payment failed${code}: ${details || "Razorpay could not complete this payment."}${context ? ` (${context})` : ""}`;
}

async function authToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

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

/** Shared billing state + actions (status, subscribe via Razorpay checkout, cancel). */
export function useBilling() {
  const [state, setState] = useState<BillingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const token = await authToken();
      if (!token) { setState({ access: true, status: "unknown", trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }); return; }
      const response = await fetch("/api/razorpay/status", { headers: { Authorization: `Bearer ${token}` } });
      setState(await response.json());
    } catch {
      setState({ access: true, status: "error", trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const subscribe = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const token = await authToken();
      if (!token) throw new Error("Please sign in again.");
      const response = await fetch("/api/razorpay/subscription", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not start the subscription.");
      await loadRazorpay();
      const RazorpayCtor = (window as unknown as { Razorpay: new (options: unknown) => RazorpayInstance }).Razorpay;
      const checkout = new RazorpayCtor({
        key: json.keyId,
        subscription_id: json.subscriptionId,
        name: "BizzzTrack",
        description: `Coconut Trade Desk — ${PLAN_PRICE_LABEL} / month`,
        theme: { color: "#1f7a4d" },
        handler: async (resp: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => {
          try {
            const verify = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify(resp)
            });
            if (verify.ok) { await refresh(); } else { const vj = await verify.json().catch(() => ({})); setError(vj.error || "We could not confirm the payment yet. If money was deducted it will reflect shortly — refresh in a minute."); }
          } catch {
            setError("We could not confirm the payment yet. Refresh in a minute.");
          } finally { setBusy(false); }
        },
        modal: { ondismiss: () => setBusy(false) }
      });
      checkout.on("payment.failed", (failure) => { setError(paymentFailureMessage(failure)); setBusy(false); });
      checkout.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }, [refresh]);

  const cancel = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const token = await authToken();
      if (!token) throw new Error("Please sign in again.");
      const response = await fetch("/api/razorpay/cancel", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not cancel the subscription.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel the subscription.");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return { state, busy, error, setError, refresh, subscribe, cancel };
}
