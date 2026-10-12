"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { Sprout } from "lucide-react";
import { supabase } from "./supabaseClient";

type Mode = "signup" | "signin";
type Role = "farmer" | "trader";

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
  if (message.includes("already registered") || message.includes("already been registered")) return "This email is already registered. Sign in instead.";
  if (message.includes("invalid login credentials")) return "The email or password is incorrect.";
  if (message.includes("email rate limit")) return "Too many signup attempts. Please wait a few minutes and try again.";
  return caughtError.message || "Something went wrong.";
}

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [roleChoice, setRoleChoice] = useState<Role | "">("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
      if (active) {
        setSession(data.session);
        void loadProfile(data.session);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        void loadProfile(nextSession);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Signed in and set up: the whole app is Version 2, so go straight to the workspace.
  useEffect(() => {
    if (session && profile?.account_type) router.replace("/v2");
  }, [profile?.account_type, router, session]);

  function clearFeedback() {
    setMessage("");
    setError("");
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    setSaving(true);
    try {
      if (mode === "signup") {
        if (!fullName.trim() || !isValidIndianPhone(phone) || !roleChoice) {
          throw new Error("Enter your name, a valid 10-digit Indian mobile number, and choose a workspace.");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        const { error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim(), phone: getStoredIndianPhone(phone), business_name: businessName.trim() || null, account_type: roleChoice } }
        });
        if (signupError) throw signupError;
        setMode("signin");
        setPassword("");
        setConfirmPassword("");
        setMessage("Account created. Sign in to open your workspace and finish your profile.");
      } else {
        const { data, error: signinError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signinError) throw signinError;
        setSession(data.session);
        setMessage("Signed in.");
      }
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError));
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (!session || !roleChoice) {
      setError("Choose Farmer or Trader to continue.");
      return;
    }
    if (!fullName.trim() || !isValidIndianPhone(phone)) {
      setError("Enter your name and a valid 10-digit Indian mobile number.");
      return;
    }
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
    setMode("signin");
    setMessage("");
    setError("");
  }

  if (loading) {
    return <main className="page-shell"><section className="auth-panel loading-panel"><span className="eyebrow">COCONUT TRADE DESK</span><h1>Loading workspace</h1><p>Connecting to your private account.</p></section></main>;
  }

  if (!session) {
    return (
      <main className="page-shell auth-page">
        <section className="auth-panel">
          <div className="brand-lockup"><span className="brand-mark"><Sprout size={21} strokeWidth={2.4} aria-hidden="true" /></span><div><strong>COCONUT TRADE DESK</strong><span>Farmer and trader records</span></div></div>
          <div className="auth-copy"><span className="eyebrow">Private workspace</span><h1>{mode === "signup" ? "Create your account" : "Welcome back"}</h1><p>{mode === "signup" ? "Use your phone, email, password, and workspace choice to create an account." : "Sign in to continue to your private farmer or trader workspace."}</p></div>
          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); clearFeedback(); }} type="button">Sign up</button>
            <button className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); clearFeedback(); }} type="button">Sign in</button>
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
            {error ? <p className="error-message">{error}</p> : null}
            {message ? <p className="status-message">{message}</p> : null}
            <button className="primary-button" disabled={saving} type="submit">{saving ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}</button>
          </form>
        </section>
      </main>
    );
  }

  if (!profile?.account_type) {
    return (
      <main className="page-shell onboarding-page">
        <section className="onboarding-panel">
          <div className="brand-lockup"><span className="brand-mark"><Sprout size={21} strokeWidth={2.4} aria-hidden="true" /></span><div><strong>COCONUT TRADE DESK</strong><span>Set up your private workspace</span></div></div>
          <div className="auth-copy"><span className="eyebrow">One last step</span><h1>What best describes you?</h1><p>Choose your workspace. You can use the same email and phone to sign in later.</p></div>
          <form onSubmit={saveProfile}>
            <div className="role-grid">
              {roleOptions.map((role) => <button className={`role-choice ${roleChoice === role.value ? "selected" : ""}`} key={role.value} onClick={() => setRoleChoice(role.value)} type="button"><span className="role-title">{role.label}</span><span>{role.description}</span></button>)}
            </div>
            <div className="form-grid">
              <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
              <label>Phone number<div className="phone-input"><span>{"🇮🇳 +91"}</span><input inputMode="tel" value={phone} onChange={(event) => setPhone(getIndianPhoneValue(event.target.value))} required /></div></label>
            </div>
            <label>Business or farm name <span className="optional">Optional</span><input value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Your business or farm name" /></label>
            {error ? <p className="error-message">{error}</p> : null}
            <button className="primary-button" disabled={saving || !roleChoice} type="submit">{saving ? "Saving..." : "Continue to workspace"}</button>
          </form>
          <button className="link-button" onClick={signOut} type="button">Sign out</button>
        </section>
      </main>
    );
  }

  return <main className="page-shell"><section className="auth-panel loading-panel"><span className="eyebrow">COCONUT TRADE DESK</span><h1>Opening your workspace</h1><p>Taking you to your dashboard.</p></section></main>;
}
