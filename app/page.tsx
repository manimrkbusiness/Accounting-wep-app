"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { Sprout } from "lucide-react";
import { supabase } from "./supabaseClient";

type Mode = "signup" | "signin";
type Role = "farmer" | "trader";
// Sub-flows shown while there is no signed-in session.
type Flow = "auth" | "verify" | "forgot-request" | "forgot-reset";

type Profile = {
  id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  account_type: Role | null;
  business_name: string | null;
};

const roleOptions: Array<{ value: Role; label: string; description: string }> = [
  { value: "trader", label: "Trader", description: "Manage farmers and record coconut purchases." },
  { value: "farmer", label: "Farmer", description: "Review purchases shared with you by traders." }
];

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

export default function Home() {
  const router = useRouter();
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const redirectTo = () => (typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined);

  const loadProfile = useCallback(async (activeSession: Session | null) => {
    if (!activeSession) {
      setProfile(null);
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
    const metadataRole = activeSession.user.user_metadata?.account_type;
    setRoleChoice(loadedProfile?.account_type ?? (metadataRole === "trader" || metadataRole === "farmer" ? metadataRole : ""));
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      void loadProfile(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      // A password-reset link establishes a recovery session: show the new-password step.
      if (event === "PASSWORD_RECOVERY") { setRecoverySession(true); setFlow("forgot-reset"); setLoading(false); return; }
      void loadProfile(nextSession);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // A password-reset link comes back here as /?reset=1 — show the set-new-password step.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("reset") === "1") {
      setRecoverySession(true);
      setFlow("forgot-reset");
    }
  }, []);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Signed in and set up: the whole app is Version 2, so go straight to the workspace — but never
  // mid-way through verification or password reset.
  useEffect(() => {
    if (session && profile?.account_type && flow === "auth" && !recoverySession) router.replace("/v2");
  }, [profile?.account_type, router, session, flow, recoverySession]);

  function clearFeedback() {
    setMessage("");
    setError("");
  }

  function switchMode(next: Mode) {
    setMode(next);
    setFlow("auth");
    clearFeedback();
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
        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirectTo(), data: { full_name: fullName.trim(), phone: getStoredIndianPhone(phone), business_name: businessName.trim() || null, account_type: roleChoice } }
        });
        if (signupError) throw signupError;
        if (data.session) {
          // Email confirmation is OFF on the project → signed in immediately (today's behaviour).
          setMessage("Account created.");
        } else {
          // Email confirmation is ON → verify with the emailed code.
          setOtp("");
          setCooldown(30);
          setFlow("verify");
          setMessage(`We emailed a verification code to ${email.trim()}. Enter it below.`);
        }
      } else {
        const { data, error: signinError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signinError) throw signinError;
        setSession(data.session);
        setMessage("Signed in.");
      }
    } catch (caughtError) {
      const raw = caughtError instanceof Error ? caughtError.message.toLowerCase() : "";
      if (raw.includes("not confirmed")) {
        setOtp("");
        setFlow("verify");
        setError("Your email isn't verified yet. Enter the code we emailed you, or resend a new one.");
      } else {
        setError(getAuthErrorMessage(caughtError));
      }
    } finally {
      setSaving(false);
    }
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
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError));
    } finally {
      setSaving(false);
    }
  }

  async function handleForgotRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (!email.trim()) { setError("Enter the email for your account."); return; }
    setSaving(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() });
      if (resetError) throw resetError;
      setPassword("");
      setConfirmPassword("");
      setOtp("");
      setRecoverySession(false);
      setCooldown(30);
      setFlow("forgot-reset");
      setMessage(`We emailed a reset code to ${email.trim()}. Enter it with your new password.`);
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError));
    } finally {
      setSaving(false);
    }
  }

  async function handleForgotReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setSaving(true);
    try {
      if (!recoverySession) {
        if (otp.trim().length < 4) { setError("Enter the reset code from your email."); setSaving(false); return; }
        const { error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token: otp.trim(), type: "recovery" });
        if (verifyError) throw verifyError;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage("Password updated. Taking you in…");
      setRecoverySession(false);
      setPassword("");
      setConfirmPassword("");
      setOtp("");
      setFlow("auth");
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError));
    } finally {
      setSaving(false);
    }
  }

  async function handleGoogle() {
    clearFeedback();
    setSaving(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
      if (oauthError) throw oauthError;
      // The browser now redirects to Google; keep the spinner until it leaves.
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError));
      setSaving(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    clearFeedback();
    try {
      if (flow === "forgot-reset") {
        const { error: resendError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() });
        if (resendError) throw resendError;
      } else {
        const { error: resendError } = await supabase.auth.resend({ type: "signup", email: email.trim() });
        if (resendError) throw resendError;
      }
      setCooldown(30);
      setMessage("We sent a new code.");
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError));
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (!session || !roleChoice) { setError("Choose Farmer or Trader to continue."); return; }
    if (!fullName.trim() || !isValidIndianPhone(phone)) { setError("Enter your name and a valid 10-digit Indian mobile number."); return; }
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
      setError(profileError.message.includes("already linked") || profileError.code === "23505" ? "This mobile number is already linked to another account." : profileError.message);
      return;
    }
    setProfile(data as Profile);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setRecoverySession(false);
    setFlow("auth");
    setMode("signin");
    setMessage("");
    setError("");
  }

  const feedback = <>{error ? <p className="error-message">{error}</p> : null}{message ? <p className="status-message">{message}</p> : null}</>;

  if (loading) {
    return <main className="page-shell"><section className="auth-panel loading-panel"><span className="eyebrow">COCONUT TRADE DESK</span><h1>Loading workspace</h1><p>Connecting to your private account.</p></section></main>;
  }

  if (!session) {
    return (
      <main className="page-shell auth-page">
        <section className="auth-panel">
          <div className="brand-lockup"><span className="brand-mark"><Sprout size={21} strokeWidth={2.4} aria-hidden="true" /></span><div><strong>COCONUT TRADE DESK</strong><span>Farmer and trader records</span></div></div>

          {flow === "auth" ? <>
            <div className="auth-copy"><span className="eyebrow">Private workspace</span><h1>{mode === "signup" ? "Create your account" : "Welcome back"}</h1><p>{mode === "signup" ? "Sign up with Google, or your phone, email and password." : "Sign in to continue to your private workspace."}</p></div>
            <button className="auth-oauth-button" disabled={saving} onClick={handleGoogle} type="button"><span className="g-mark">G</span>Continue with Google</button>
            <div className="auth-divider"><span>or</span></div>
            <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
              <button className={mode === "signup" ? "active" : ""} onClick={() => switchMode("signup")} type="button">Sign up</button>
              <button className={mode === "signin" ? "active" : ""} onClick={() => switchMode("signin")} type="button">Sign in</button>
            </div>
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {mode === "signup" ? <>
                <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required /></label>
                <label>Phone number<div className="phone-input"><span>{"🇮🇳 +91"}</span><input inputMode="tel" value={phone} onChange={(event) => setPhone(getIndianPhoneValue(event.target.value))} placeholder="10-digit mobile number" required /></div></label>
                <label>Business or farm name <span className="optional">Optional</span><input value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Your business or farm name" /></label>
                <span className="form-section-label">Workspace</span>
                <div className="role-grid" aria-label="Choose your workspace">
                  {roleOptions.map((role) => <button aria-pressed={roleChoice === role.value} className={`role-choice ${roleChoice === role.value ? "selected" : ""}`} key={role.value} onClick={() => setRoleChoice(role.value)} type="button"><span className="role-title">{role.label}</span><span>{role.description}</span></button>)}
                </div>
              </> : null}
              <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
              <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} required /></label>
              {mode === "signup" ? <label>Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={6} required /></label> : null}
              {mode === "signin" ? <button className="link-button auth-forgot" onClick={() => { setFlow("forgot-request"); clearFeedback(); }} type="button">Forgot password?</button> : null}
              {feedback}
              <button className="primary-button" disabled={saving} type="submit">{saving ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}</button>
            </form>
          </> : null}

          {flow === "verify" ? <>
            <div className="auth-copy"><span className="eyebrow">Verify your email</span><h1>Enter the code</h1><p>We emailed a verification code to <strong>{email}</strong>. Enter it to finish creating your account.</p></div>
            <form className="auth-form" onSubmit={handleVerifySignup}>
              <label>Verification code<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} placeholder="Code from email" required /></label>
              {feedback}
              <button className="primary-button" disabled={saving} type="submit">{saving ? "Verifying..." : "Verify email"}</button>
              <div className="auth-actions"><button className="link-button" disabled={cooldown > 0} onClick={handleResend} type="button">{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</button><button className="link-button" onClick={() => switchMode("signin")} type="button">Back to sign in</button></div>
            </form>
          </> : null}

          {flow === "forgot-request" ? <>
            <div className="auth-copy"><span className="eyebrow">Reset password</span><h1>Forgot your password?</h1><p>Enter your account email and we&apos;ll send a reset code.</p></div>
            <form className="auth-form" onSubmit={handleForgotRequest}>
              <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
              {feedback}
              <button className="primary-button" disabled={saving} type="submit">{saving ? "Sending..." : "Send reset code"}</button>
              <div className="auth-actions"><button className="link-button" onClick={() => switchMode("signin")} type="button">Back to sign in</button></div>
            </form>
          </> : null}

          {flow === "forgot-reset" ? <>
            <div className="auth-copy"><span className="eyebrow">Reset password</span><h1>Set a new password</h1><p>{recoverySession ? "Choose a new password for your account." : <>Enter the reset code emailed to <strong>{email}</strong> and your new password.</>}</p></div>
            <form className="auth-form" onSubmit={handleForgotReset}>
              {!recoverySession ? <label>Reset code<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} placeholder="Code from email" required /></label> : null}
              <label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={6} required /></label>
              <label>Confirm new password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={6} required /></label>
              {feedback}
              <button className="primary-button" disabled={saving} type="submit">{saving ? "Updating..." : "Update password"}</button>
              <div className="auth-actions">{!recoverySession ? <button className="link-button" disabled={cooldown > 0} onClick={handleResend} type="button">{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</button> : null}<button className="link-button" onClick={() => switchMode("signin")} type="button">Back to sign in</button></div>
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
          <div className="brand-lockup"><span className="brand-mark"><Sprout size={21} strokeWidth={2.4} aria-hidden="true" /></span><div><strong>COCONUT TRADE DESK</strong><span>Set up your private workspace</span></div></div>
          <div className="auth-copy"><span className="eyebrow">One last step</span><h1>Finish your profile</h1><p>Choose your workspace and confirm your mobile number. You can use the same email and phone to sign in later.</p></div>
          <form onSubmit={saveProfile}>
            <div className="role-grid">
              {roleOptions.map((role) => <button className={`role-choice ${roleChoice === role.value ? "selected" : ""}`} key={role.value} onClick={() => setRoleChoice(role.value)} type="button"><span className="role-title">{role.label}</span><span>{role.description}</span></button>)}
            </div>
            <div className="form-grid">
              <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
              <label>Phone number<div className="phone-input"><span>{"🇮🇳 +91"}</span><input inputMode="tel" value={phone} onChange={(event) => setPhone(getIndianPhoneValue(event.target.value))} required /></div></label>
            </div>
            <label>Business or farm name <span className="optional">Optional</span><input value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Your business or farm name" /></label>
            {feedback}
            <button className="primary-button" disabled={saving || !roleChoice} type="submit">{saving ? "Saving..." : "Continue to workspace"}</button>
          </form>
          <button className="link-button" onClick={signOut} type="button">Sign out</button>
        </section>
      </main>
    );
  }

  return <main className="page-shell"><section className="auth-panel loading-panel"><span className="eyebrow">COCONUT TRADE DESK</span><h1>Opening your workspace</h1><p>Taking you to your dashboard.</p></section></main>;
}
