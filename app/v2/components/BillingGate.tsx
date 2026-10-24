"use client";

import type { ReactNode } from "react";
import { useBilling } from "../lib/useBilling";
import { formatDate } from "../lib/format";

function daysLeft(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

type Notice = { tone: "info" | "warn"; text: ReactNode; action: string };

/**
 * Gates the workspace behind a 14-day trial, then a ₹519/month Razorpay subscription, and surfaces a
 * banner for every in-between state (trial ending, cancellation scheduled, payment due, paused).
 * Fails open: it only blocks when the server explicitly says access is false.
 */
export function BillingGate({ children }: { children: ReactNode }) {
  const { state, busy, error, subscribe, refresh } = useBilling();
  const blocked = state !== null && state.access === false;

  if (blocked) {
    const expiredTrial = state?.status === "trialing" || state?.status == null;
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 16px" }}>
        <section className="auth-panel" style={{ maxWidth: 560, width: "100%", textAlign: "left", display: "grid", gap: 14 }}>
          <span className="eyebrow">BizzzTrack</span>
          <h1 style={{ margin: 0 }}>{expiredTrial ? "Your free trial has ended" : state?.status === "halted" ? "Your subscription is paused" : "Subscription needed"}</h1>
          <p style={{ margin: 0 }}>Keep your full Coconut Trade Desk — purchases, stock, sales, husk, team, cash book and reports — for <strong>₹519 / month</strong>. Pay with UPI, Google Pay, PhonePe, card or net-banking; it renews automatically and you can cancel anytime.</p>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, color: "var(--muted)", fontSize: "0.9rem" }}>
            <li>Everything you already use, nothing removed</li>
            <li>Automatic monthly billing after you authorize once</li>
            <li>Your data stays exactly where it is</li>
          </ul>
          {error ? <p className="error-message" role="alert">{error}</p> : null}
          <button className="primary-button" disabled={busy} onClick={() => void subscribe()} type="button">{busy ? "Opening payment…" : "Subscribe — ₹519 / month"}</button>
          <button className="link-button" onClick={() => void refresh()} type="button">I already paid — refresh</button>
        </section>
      </div>
    );
  }

  const notice: Notice | null = (() => {
    if (!state) return null;
    if (state.status === "trialing" && state.trialEndsAt) {
      const d = daysLeft(state.trialEndsAt);
      return { tone: d <= 3 ? "warn" : "info", text: <>Free trial — <strong>{d} day{d === 1 ? "" : "s"} left</strong>. ₹519 / month after that.</>, action: "Subscribe now" };
    }
    if (state.status === "active" && state.cancelAtPeriodEnd) {
      return { tone: "info", text: <>Your subscription is cancelled and will end {state.currentPeriodEnd ? <>on <strong>{formatDate(state.currentPeriodEnd)}</strong></> : "soon"}. You keep full access until then — resubscribe to stay on.</>, action: "Resubscribe" };
    }
    if (state.status === "past_due") {
      return { tone: "warn", text: <>We couldn&apos;t take this month&apos;s <strong>₹519</strong> payment. Pay now to keep your account active.</>, action: "Pay now" };
    }
    if (state.status === "halted") {
      return { tone: "warn", text: <>Your subscription is paused after a failed payment. Reactivate to keep using BizzzTrack.</>, action: "Reactivate" };
    }
    return null;
  })();

  return (
    <>
      {notice ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 14px", marginBottom: 14, borderRadius: 8, fontSize: "0.9rem", background: notice.tone === "warn" ? "var(--danger-soft)" : "rgba(0, 122, 94, 0.10)", border: notice.tone === "warn" ? "1px solid rgba(193, 59, 53, 0.30)" : "1px solid rgba(0, 122, 94, 0.25)", color: notice.tone === "warn" ? "var(--danger)" : "inherit" }}>
          <span>{notice.text}</span>
          <button className="link-button" disabled={busy} onClick={() => void subscribe()} type="button">{busy ? "Opening…" : notice.action}</button>
        </div>
      ) : null}
      {error ? <p className="error-message" role="alert">{error}</p> : null}
      {children}
    </>
  );
}
