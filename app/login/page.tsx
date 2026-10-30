"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { Sprout } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useLang, LanguageToggle } from "../lib/i18n";

type Mode = "signup" | "signin";
type Role = "farmer" | "trader";
type Flow = "auth" | "verify" | "forgot-request" | "forgot-verify" | "forgot-reset";

type Profile = {
  id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  account_type: Role | null;
  business_name: string | null;
};

const CONSENT_KEY = "ctd-consent";

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
  if (message.includes("already registered") || message.includes("already been registered")) return "This email is already registered. Sign in instead, or reset your password.";
  if (message.includes("invalid login credentials")) return "The email or password is incorrect.";
  if (message.includes("not confirmed")) return "Please verify your email first — we can resend the code.";
  if (message.includes("token has expired") || message.includes("otp expired") || message.includes("invalid token") || (message.includes("invalid") && message.includes("code"))) return "That code is wrong or has expired. Request a new one.";
  if (message.includes("provider is not enabled") || message.includes("unsupported provider")) return "Google sign-in isn't set up yet. Use your email for now.";
  if (message.includes("same") && message.includes("password")) return "Choose a password different from your old one.";
  if (message.includes("rate limit")) return "Too many attempts. Please wait a minute and try again.";
  return caughtError.message || "Something went wrong.";
}

export default function LoginPage() {
  const router = useRouter();
  const { lang } = useLang();
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);

  const roleOptions: Array<{ value: Role; label: string; description: string }> = [
    { value: "trader", label: L("Trader", "வியாபாரி"), description: L("Manage farmers and record coconut purchases.", "விவசாயிகளை நிர்வகித்து தேங்காய் கொள்முதலைப் பதிவு செய்யுங்கள்.") },
    { value: "farmer", label: L("Farmer", "விவசாயி"), description: L("Review purchases shared with you by traders.", "வியாபாரிகள் பகிர்ந்த கொள்முதல்களைப் பார்க்கவும்.") }
  ];

  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>("signup");
  const [flow, setFlow] = useState<Flow>("auth");
  const [recoverySession, setRecoverySession] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [roleChoice, setRoleChoice] = useState<Role | "">("");
  const [otp, setOtp] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const redirectTo = () => (typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined);

  const loadProfile = useCallback(async (activeSession: Session | null) => {
    if (!activeSession) { setProfile(null); setLoading(false); return; }
    setLoading(true);
    setError("");
    const result = await supabase.from("profiles").select("*").eq("id", activeSession.user.id).maybeSingle();
    if (result.error) { setError(result.error.message); setLoading(false); return; }
    const loaded = result.data as Profile | null;
    setProfile(loaded);
    setFullName(loaded?.full_name ?? activeSession.user.user_metadata?.full_name ?? "");
    setPhone(loaded?.phone?.replace("+91", "") ?? activeSession.user.user_metadata?.phone?.replace("+91", "") ?? "");
    setBusinessName(loaded?.business_name ?? activeSession.user.user_metadata?.business_name ?? "");
    const metadataRole = activeSession.user.user_metadata?.account_type;
    setRoleChoice(loaded?.account_type ?? (metadataRole === "trader" || metadataRole === "farmer" ? metadataRole : ""));
    // Restore consent the user gave before an email/Google round-trip, so the profile can record it.
    try {
      const stored = JSON.parse(localStorage.getItem(CONSENT_KEY) || "null");
      if (stored && typeof stored === "object") { setTermsAccepted(Boolean(stored.terms)); setMarketingConsent(Boolean(stored.marketing)); }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (!active) return; setSession(data.session); void loadProfile(data.session); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next);
      if (event === "PASSWORD_RECOVERY") { setRecoverySession(true); setFlow("forgot-reset"); setLoading(false); return; }
      void loadProfile(next);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [loadProfile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("reset") === "1") { setRecoverySession(true); setFlow("forgot-reset"); }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (session && profile?.account_type && flow === "auth" && !recoverySession) router.replace("/dashboard");
  }, [profile?.account_type, router, session, flow, recoverySession]);

  function clearFeedback() { setMessage(""); setError(""); }
  function switchMode(next: Mode) { setMode(next); setFlow("auth"); clearFeedback(); }
  function rememberConsent() { try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ terms: termsAccepted, marketing: marketingConsent })); } catch { /* ignore */ } }
  // Fire-and-forget: the server sends the welcome / new-sign-in email (it decides which, and throttles).
  async function notifyAuthEvent() {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch("/api/account/notify", { method: "POST", headers: { Authorization: `Bearer ${token}` }, keepalive: true });
    } catch { /* non-blocking */ }
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    setSaving(true);
    try {
      if (mode === "signup") {
        if (!fullName.trim() || !isValidIndianPhone(phone) || !roleChoice) throw new Error("Enter your name, a valid 10-digit Indian mobile number, and choose a workspace.");
        if (password.length < 6) throw new Error("Password must be at least 6 characters.");
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        if (!termsAccepted) throw new Error("Please accept the Terms and Privacy Policy to create an account.");
        rememberConsent();
        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirectTo(), data: { full_name: fullName.trim(), phone: getStoredIndianPhone(phone), business_name: businessName.trim() || null, account_type: roleChoice, marketing_consent: marketingConsent, terms_accepted: true } }
        });
        if (signupError) throw signupError;
        if (data.session) setMessage("Account created.");
        else { setOtp(""); setCooldown(30); setFlow("verify"); setMessage(`We emailed a verification code to ${email.trim()}. Enter it below.`); }
      } else {
        const { data, error: signinError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signinError) throw signinError;
        setSession(data.session);
        setMessage("Signed in.");
        void notifyAuthEvent();
      }
    } catch (caughtError) {
      const raw = caughtError instanceof Error ? caughtError.message.toLowerCase() : "";
      if (raw.includes("not confirmed")) { setOtp(""); setFlow("verify"); setError("Your email isn't verified yet. Enter the code we emailed you, or resend a new one."); }
      else setError(getAuthErrorMessage(caughtError));
    } finally { setSaving(false); }
  }

  async function handleVerifySignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (otp.trim().length < 4) { setError("Enter the code from your email."); return; }
    setSaving(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token: otp.trim(), type: "signup" });
      if (verifyError) throw verifyError;
      setMessage("Email verified.");
      setFlow("auth");
    } catch (caughtError) { setError(getAuthErrorMessage(caughtError)); }
    finally { setSaving(false); }
  }

  async function handleForgotRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (!email.trim()) { setError("Enter the email for your account."); return; }
    setSaving(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() });
      if (resetError) throw resetError;
      setPassword(""); setConfirmPassword(""); setOtp(""); setRecoverySession(false); setCooldown(30); setFlow("forgot-verify");
      setMessage(`We emailed a reset code to ${email.trim()}. Enter it to continue.`);
    } catch (caughtError) { setError(getAuthErrorMessage(caughtError)); }
    finally { setSaving(false); }
  }

  // Step 1 of the code reset: verify the emailed code. Only on success do we move to the
  // "set a new password" step, so the user never types a password against an invalid code.
  async function handleForgotVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (otp.trim().length < 4) { setError("Enter the reset code from your email."); return; }
    setSaving(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token: otp.trim(), type: "recovery" });
      if (verifyError) throw verifyError;
      setRecoverySession(true); setOtp(""); setFlow("forgot-reset");
      setMessage("Code verified. Now set your new password.");
    } catch (caughtError) { setError(getAuthErrorMessage(caughtError)); }
    finally { setSaving(false); }
  }

  // Step 2: set the new password. Reached only after a verified code (above) or a reset link, so a
  // recovery session already exists. On success we sign out so the user signs in with the new password.
  async function handleForgotReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      setRecoverySession(false); setPassword(""); setConfirmPassword(""); setOtp("");
      setMode("signin"); setFlow("auth");
      setMessage("Password updated. Please sign in with your new password.");
    } catch (caughtError) { setError(getAuthErrorMessage(caughtError)); }
    finally { setSaving(false); }
  }

  async function handleGoogle() {
    clearFeedback();
    // No terms gate here: Google users accept the Terms on the "finish your profile" step,
    // which also collects their phone number and workspace before the dashboard opens.
    rememberConsent();
    setSaving(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
      if (oauthError) throw oauthError;
    } catch (caughtError) { setError(getAuthErrorMessage(caughtError)); setSaving(false); }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    clearFeedback();
    try {
      if (flow === "forgot-reset" || flow === "forgot-verify") { const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() }); if (e) throw e; }
      else { const { error: e } = await supabase.auth.resend({ type: "signup", email: email.trim() }); if (e) throw e; }
      setCooldown(30); setMessage("We sent a new code.");
    } catch (caughtError) { setError(getAuthErrorMessage(caughtError)); }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (!session || !roleChoice) { setError("Choose Farmer or Trader to continue."); return; }
    if (!fullName.trim() || !isValidIndianPhone(phone)) { setError("Enter your name and a valid 10-digit Indian mobile number."); return; }
    if (!termsAccepted) { setError("Please accept the Terms and Privacy Policy to continue."); return; }
    setSaving(true);
    const { data, error: profileError } = await supabase.from("profiles").upsert({
      id: session.user.id,
      email: session.user.email ?? email.trim(),
      full_name: fullName.trim(),
      phone: getStoredIndianPhone(phone),
      account_type: roleChoice,
      business_name: businessName.trim() || null,
      marketing_consent: marketingConsent,
      terms_accepted_at: new Date().toISOString()
    }).select("*").single();
    setSaving(false);
    if (profileError) { setError(profileError.message.includes("already linked") || profileError.code === "23505" ? "This mobile number is already linked to another account." : profileError.message); return; }
    try { localStorage.removeItem(CONSENT_KEY); } catch { /* ignore */ }
    setProfile(data as Profile);
    void notifyAuthEvent();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null); setRecoverySession(false); setFlow("auth"); setMode("signin"); setMessage(""); setError("");
  }

  const feedback = <>{error ? <p className="error-message">{error}</p> : null}{message ? <p className="status-message">{message}</p> : null}</>;
  const consentBlock = (
    <div className="consent-block">
      <label className="consent-line"><input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} /><span>{L("Send me product updates, tips and offers by email or message.", "தயாரிப்பு புதுப்பிப்புகள், குறிப்புகள், சலுகைகளை மின்னஞ்சல்/செய்தி மூலம் அனுப்பவும்.")} <em className="optional">{L("Optional", "விருப்பம்")}</em></span></label>
      <label className="consent-line"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /><span>{L("I agree to the", "நான் ஏற்கிறேன்")} <Link href="/terms" target="_blank">{L("Terms & Conditions", "விதிமுறைகள்")}</Link> {L("and", "மற்றும்")} <Link href="/privacy" target="_blank">{L("Privacy Policy", "தனியுரிமைக் கொள்கை")}</Link>. <em className="required-tag">{L("Required", "அவசியம்")}</em></span></label>
    </div>
  );
  const roleSelect = (
    <label>{L("Workspace", "பணியிடம்")}
      <select value={roleChoice} onChange={(event) => setRoleChoice(event.target.value as Role | "")} required>
        <option value="" disabled>{L("Choose Trader or Farmer", "வியாபாரி அல்லது விவசாயியைத் தேர்வுசெய்க")}</option>
        {roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
      </select>
      {roleChoice ? <span className="field-hint">{roleOptions.find((role) => role.value === roleChoice)?.description}</span> : null}
    </label>
  );

  if (loading) {
    return <main className="page-shell"><section className="auth-panel loading-panel"><span className="eyebrow">COCONUT TRADE DESK</span><h1>{L("Loading", "ஏற்றுகிறது")}</h1><p>{L("Connecting to your private account.", "உங்கள் தனிப்பட்ட கணக்குடன் இணைக்கிறது.")}</p></section></main>;
  }

  if (!session) {
    return (
      <main className="page-shell auth-page">
        <section className="auth-panel">
          <div className="auth-panel-top"><Link className="link-button" href="/">← {L("Home", "முகப்பு")}</Link><LanguageToggle /></div>
          <div className="brand-lockup"><span className="brand-mark"><Sprout size={21} strokeWidth={2.4} aria-hidden="true" /></span><div><strong>COCONUT TRADE DESK</strong><span>{L("Farmer and trader records", "விவசாயி மற்றும் வியாபாரி பதிவுகள்")}</span></div></div>

          {flow === "auth" ? <>
            <div className="auth-copy"><span className="eyebrow">{L("Private workspace", "தனிப்பட்ட பணியிடம்")}</span><h1>{mode === "signup" ? L("Create your account", "உங்கள் கணக்கை உருவாக்கவும்") : L("Welcome back", "மீண்டும் வரவேற்கிறோம்")}</h1><p>{mode === "signup" ? L("Sign up with Google, or your phone, email and password.", "Google மூலம், அல்லது தொலைபேசி, மின்னஞ்சல், கடவுச்சொல் மூலம் பதிவு செய்யுங்கள்.") : L("Sign in to continue to your private workspace.", "உங்கள் தனிப்பட்ட பணியிடத்திற்குத் தொடர உள்நுழையவும்.")}</p></div>
            <button className="auth-oauth-button" disabled={saving} onClick={handleGoogle} type="button"><span className="g-mark">G</span>{L("Continue with Google", "Google உடன் தொடரவும்")}</button>
            <div className="auth-divider"><span>{L("or", "அல்லது")}</span></div>
            <div className="auth-tabs" role="tablist">
              <button className={mode === "signup" ? "active" : ""} onClick={() => switchMode("signup")} type="button">{L("Sign up", "பதிவு")}</button>
              <button className={mode === "signin" ? "active" : ""} onClick={() => switchMode("signin")} type="button">{L("Sign in", "உள்நுழை")}</button>
            </div>
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {mode === "signup" ? <>
                <label>{L("Full name", "முழுப் பெயர்")}<input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required /></label>
                <label>{L("Phone number", "தொலைபேசி எண்")}<div className="phone-input"><span>{"🇮🇳 +91"}</span><input inputMode="tel" value={phone} onChange={(event) => setPhone(getIndianPhoneValue(event.target.value))} placeholder={L("10-digit mobile number", "10 இலக்க எண்")} required /></div></label>
                <label>{L("Business or farm name", "வணிக/பண்ணை பெயர்")} <span className="optional">{L("Optional", "விருப்பம்")}</span><input value={businessName} onChange={(event) => setBusinessName(event.target.value)} /></label>
                {roleSelect}
              </> : null}
              <label>{L("Email", "மின்னஞ்சல்")}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
              <label>{L("Password", "கடவுச்சொல்")}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} required /></label>
              {mode === "signup" ? <label>{L("Confirm password", "கடவுச்சொல்லை உறுதிப்படுத்து")}<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={6} required /></label> : null}
              {mode === "signup" ? consentBlock : null}
              {mode === "signin" ? <button className="link-button auth-forgot" onClick={() => { setFlow("forgot-request"); clearFeedback(); }} type="button">{L("Forgot password?", "கடவுச்சொல் மறந்துவிட்டதா?")}</button> : null}
              {feedback}
              <button className="primary-button" disabled={saving || (mode === "signup" && !termsAccepted)} type="submit">{saving ? L("Please wait...", "காத்திருக்கவும்...") : mode === "signup" ? L("Create account", "கணக்கை உருவாக்கு") : L("Sign in", "உள்நுழை")}</button>
            </form>
          </> : null}

          {flow === "verify" ? <>
            <div className="auth-copy"><span className="eyebrow">{L("Verify your email", "மின்னஞ்சலை சரிபார்க்கவும்")}</span><h1>{L("Enter the code", "குறியீட்டை உள்ளிடவும்")}</h1><p>{L("We emailed a verification code to", "சரிபார்ப்புக் குறியீட்டை அனுப்பியுள்ளோம்")} <strong>{email}</strong>.</p></div>
            <form className="auth-form" onSubmit={handleVerifySignup}>
              <label>{L("Verification code", "சரிபார்ப்புக் குறியீடு")}<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} required /></label>
              {feedback}
              <button className="primary-button" disabled={saving} type="submit">{saving ? L("Verifying...", "சரிபார்க்கிறது...") : L("Verify email", "சரிபார்க்கவும்")}</button>
              <div className="auth-actions"><button className="link-button" disabled={cooldown > 0} onClick={handleResend} type="button">{cooldown > 0 ? L(`Resend in ${cooldown}s`, `${cooldown}வி இல் மீண்டும்`) : L("Resend code", "குறியீட்டை மீண்டும் அனுப்பு")}</button><button className="link-button" onClick={() => switchMode("signin")} type="button">{L("Back to sign in", "உள்நுழைவுக்குத் திரும்பு")}</button></div>
            </form>
          </> : null}

          {flow === "forgot-request" ? <>
            <div className="auth-copy"><span className="eyebrow">{L("Reset password", "கடவுச்சொல் மீட்டமை")}</span><h1>{L("Forgot your password?", "கடவுச்சொல் மறந்துவிட்டதா?")}</h1><p>{L("Enter your account email and we'll send a reset code.", "உங்கள் மின்னஞ்சலை உள்ளிடவும், மீட்டமைப்புக் குறியீடு அனுப்புவோம்.")}</p></div>
            <form className="auth-form" onSubmit={handleForgotRequest}>
              <label>{L("Email", "மின்னஞ்சல்")}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
              {feedback}
              <button className="primary-button" disabled={saving} type="submit">{saving ? L("Sending...", "அனுப்புகிறது...") : L("Send reset code", "குறியீட்டை அனுப்பு")}</button>
              <div className="auth-actions"><button className="link-button" onClick={() => switchMode("signin")} type="button">{L("Back to sign in", "உள்நுழைவுக்குத் திரும்பு")}</button></div>
            </form>
          </> : null}

          {flow === "forgot-verify" ? <>
            <div className="auth-copy"><span className="eyebrow">{L("Reset password", "கடவுச்சொல் மீட்டமை")}</span><h1>{L("Enter the reset code", "மீட்டமைப்புக் குறியீட்டை உள்ளிடவும்")}</h1><p>{L("Enter the reset code we emailed to", "நாங்கள் அனுப்பிய மீட்டமைப்புக் குறியீட்டை உள்ளிடவும்")} <strong>{email}</strong>.</p></div>
            <form className="auth-form" onSubmit={handleForgotVerify}>
              <label>{L("Reset code", "மீட்டமைப்புக் குறியீடு")}<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} required /></label>
              {feedback}
              <button className="primary-button" disabled={saving} type="submit">{saving ? L("Verifying...", "சரிபார்க்கிறது...") : L("Verify code", "குறியீட்டைச் சரிபார்")}</button>
              <div className="auth-actions"><button className="link-button" disabled={cooldown > 0} onClick={handleResend} type="button">{cooldown > 0 ? L(`Resend in ${cooldown}s`, `${cooldown}வி இல் மீண்டும்`) : L("Resend code", "மீண்டும் அனுப்பு")}</button><button className="link-button" onClick={() => switchMode("signin")} type="button">{L("Back to sign in", "உள்நுழைவுக்குத் திரும்பு")}</button></div>
            </form>
          </> : null}

          {flow === "forgot-reset" ? <>
            <div className="auth-copy"><span className="eyebrow">{L("Reset password", "கடவுச்சொல் மீட்டமை")}</span><h1>{L("Set a new password", "புதிய கடவுச்சொல் அமைக்கவும்")}</h1><p>{L("Choose a new password for your account.", "உங்கள் கணக்கிற்கு புதிய கடவுச்சொல்லைத் தேர்வுசெய்யவும்.")}</p></div>
            <form className="auth-form" onSubmit={handleForgotReset}>
              <label>{L("New password", "புதிய கடவுச்சொல்")}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={6} required /></label>
              <label>{L("Confirm new password", "புதிய கடவுச்சொல்லை உறுதிப்படுத்து")}<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={6} required /></label>
              {feedback}
              <button className="primary-button" disabled={saving} type="submit">{saving ? L("Updating...", "புதுப்பிக்கிறது...") : L("Update password", "கடவுச்சொல்லைப் புதுப்பி")}</button>
              <div className="auth-actions"><button className="link-button" onClick={() => switchMode("signin")} type="button">{L("Back to sign in", "உள்நுழைவுக்குத் திரும்பு")}</button></div>
            </form>
          </> : null}
        </section>
      </main>
    );
  }

  if (!profile?.account_type) {
    return (
      <main className="page-shell onboarding-page">
        <section className="onboarding-panel">
          <div className="auth-panel-top"><span /><LanguageToggle /></div>
          <div className="brand-lockup"><span className="brand-mark"><Sprout size={21} strokeWidth={2.4} aria-hidden="true" /></span><div><strong>COCONUT TRADE DESK</strong><span>{L("Set up your workspace", "உங்கள் பணியிடத்தை அமைக்கவும்")}</span></div></div>
          <div className="auth-copy"><span className="eyebrow">{L("One last step", "கடைசி படி")}</span><h1>{L("Finish your profile", "உங்கள் சுயவிவரத்தை முடிக்கவும்")}</h1><p>{L("Choose your workspace and confirm your mobile number.", "உங்கள் பணியிடத்தைத் தேர்ந்தெடுத்து தொலைபேசி எண்ணை உறுதிப்படுத்தவும்.")}</p></div>
          <form onSubmit={saveProfile}>
            {roleSelect}
            <div className="form-grid">
              <label>{L("Full name", "முழுப் பெயர்")}<input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
              <label>{L("Phone number", "தொலைபேசி எண்")}<div className="phone-input"><span>{"🇮🇳 +91"}</span><input inputMode="tel" value={phone} onChange={(event) => setPhone(getIndianPhoneValue(event.target.value))} required /></div></label>
            </div>
            <label>{L("Business or farm name", "வணிக/பண்ணை பெயர்")} <span className="optional">{L("Optional", "விருப்பம்")}</span><input value={businessName} onChange={(event) => setBusinessName(event.target.value)} /></label>
            {consentBlock}
            {feedback}
            <button className="primary-button" disabled={saving || !roleChoice || !termsAccepted} type="submit">{saving ? L("Saving...", "சேமிக்கிறது...") : L("Continue to workspace", "பணியிடத்திற்குச் செல்")}</button>
          </form>
          <button className="link-button" onClick={signOut} type="button">{L("Sign out", "வெளியேறு")}</button>
        </section>
      </main>
    );
  }

  return <main className="page-shell"><section className="auth-panel loading-panel"><span className="eyebrow">COCONUT TRADE DESK</span><h1>{L("Opening your workspace", "உங்கள் பணியிடம் திறக்கிறது")}</h1><p>{L("Taking you to your dashboard.", "உங்கள் டாஷ்போர்டுக்கு அழைத்துச் செல்கிறோம்.")}</p></section></main>;
}
