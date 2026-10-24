"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { useBilling } from "../lib/useBilling";
import { formatDate, getIndianPhoneValue, getStoredIndianPhone, isValidIndianPhone } from "../lib/format";

function billingSummary(s: ReturnType<typeof useBilling>["state"]) {
  if (!s) return "Checking…";
  if (s.status === "trialing") return s.trialEndsAt ? `Free trial — ends ${formatDate(s.trialEndsAt)}` : "Free trial";
  if (s.status === "active") {
    if (s.cancelAtPeriodEnd) return s.currentPeriodEnd ? `Active — ends ${formatDate(s.currentPeriodEnd)} (cancellation scheduled)` : "Active — cancellation scheduled";
    return s.currentPeriodEnd ? `Active — ₹519 / month, renews ${formatDate(s.currentPeriodEnd)}` : "Active — ₹519 / month";
  }
  if (s.status === "past_due") return "Payment pending — please pay to keep access";
  if (s.status === "halted") return "Paused — last payment failed";
  if (s.status === "cancelled") return "Cancelled";
  return "Not subscribed";
}

export default function AccountPage() {
  const ws = useWorkspace();
  const billing = useBilling();
  const [form, setForm] = useState({ full_name: "", business_name: "", phone: "", email: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (ws.profile) {
      setForm({
        full_name: ws.profile.full_name ?? "",
        business_name: ws.profile.business_name ?? "",
        phone: ws.profile.phone ? getIndianPhoneValue(ws.profile.phone) : "",
        email: ws.profile.email ?? ""
      });
    }
  }, [ws.profile]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    if (form.full_name.trim().length < 2) { ws.fail("Enter your name."); return; }
    if (form.phone && !isValidIndianPhone(form.phone)) { ws.fail("Enter a valid 10-digit mobile number, or leave it empty."); return; }
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").update({
      full_name: form.full_name.trim(),
      business_name: form.business_name.trim() || null,
      phone: form.phone ? getStoredIndianPhone(form.phone) : null
    }).eq("id", ws.session.user.id);
    if (error) { setSavingProfile(false); ws.fail(error.message); return; }
    let emailNote = "";
    const newEmail = form.email.trim();
    if (newEmail && newEmail !== (ws.profile?.email ?? "")) {
      const { error: emailError } = await supabase.auth.updateUser({ email: newEmail });
      if (emailError) { setSavingProfile(false); ws.fail(emailError.message); return; }
      await supabase.from("profiles").update({ email: newEmail }).eq("id", ws.session.user.id);
      emailNote = " A confirmation link was sent to your new email address — your sign-in email changes once you click it.";
    }
    setSavingProfile(false);
    ws.notify("Profile saved." + emailNote);
    await ws.refresh();
  }

  const s = billing.state;
  const isActive = s?.status === "active";
  const canCancel = isActive && !s?.cancelAtPeriodEnd;
  const canSubscribe = s != null && !isActive; // trialing / past_due / halted / cancelled / none

  return (
    <div className="stack">
      {ws.message ? <p className="status-message">{ws.message}</p> : null}

      <section className="tool-panel">
        <div className="panel-heading"><div><span className="eyebrow">Your account</span><h2>Profile</h2></div></div>
        <p className="muted-text">Your personal and business details. These appear on your records and invoices.</p>
        <form onSubmit={saveProfile}>
          <div className="form-grid">
            <label>Your name<input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} required /></label>
            <label>Business / trading name<input value={form.business_name} onChange={(event) => setForm((current) => ({ ...current, business_name: event.target.value }))} placeholder="e.g. MRK Traders" /></label>
            <label>Phone <span className="optional">Optional</span><div className="phone-input"><span>{"🇮🇳 +91"}</span><input inputMode="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: getIndianPhoneValue(event.target.value) }))} /></div></label>
            <label>Login email<input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /><span className="field-hint">Changing this sends a confirmation link to the new address; your login updates once you click it.</span></label>
          </div>
          {ws.error ? <p className="error-message form-error" role="alert">{ws.error}</p> : null}
          <button className="primary-button" disabled={savingProfile} type="submit">{savingProfile ? "Saving…" : "Save profile"}</button>
        </form>
      </section>

      <section className="tool-panel">
        <div className="panel-heading"><div><span className="eyebrow">Billing</span><h2>Subscription &amp; plan</h2></div></div>
        <dl className="calculation-list">
          <div><dt>Plan</dt><dd>Coconut Trade Desk — ₹519 / month</dd></div>
          <div><dt>Status</dt><dd>{billingSummary(s)}</dd></div>
        </dl>
        <p className="field-hint">After the trial, ₹519 is charged every month automatically (UPI AutoPay, card or net-banking). You can cancel anytime — you keep access until the end of the period you already paid for.</p>
        {billing.error ? <p className="error-message form-error" role="alert">{billing.error}</p> : null}
        <div className="row-actions">
          {canSubscribe ? <button className="primary-button" disabled={billing.busy} onClick={() => void billing.subscribe()} type="button">{billing.busy ? "Opening payment…" : "Subscribe — ₹519 / month"}</button> : null}
          {canCancel ? <button className="danger-button" disabled={billing.busy} onClick={() => { if (window.confirm("Cancel your subscription? You'll keep access until the end of the current paid period.")) void billing.cancel(); }} type="button">{billing.busy ? "Please wait…" : "Cancel subscription"}</button> : null}
          <button className="secondary-button" disabled={billing.busy} onClick={() => void billing.refresh()} type="button">Refresh</button>
        </div>
        {isActive && s?.cancelAtPeriodEnd ? <p className="field-hint">Your subscription is set to cancel at the end of the current cycle. To keep it, just subscribe again after it ends.</p> : null}
      </section>
    </div>
  );
}
