"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { adminLogin } from "./actions";

/** Email-gated entry to the control panel: reads the existing app session or signs in, then hands
 *  the access token to the server action, which verifies the email against the admin allow-list. */
export function AdminLogin({ base }: { base: string }) {
  const [sessionEmail, setSessionEmail] = useState<string | null | undefined>(undefined); // undefined = still checking
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessionEmail(data.session?.user.email ?? null)).catch(() => setSessionEmail(null));
  }, []);

  async function enterWithToken(token: string | undefined) {
    if (!token) { setError("Please sign in again."); setBusy(false); return; }
    const result = await adminLogin(token);
    if (result.ok) { window.location.assign(base); return; }
    setBusy(false);
    setError(result.error || "Could not open the control panel.");
  }

  async function enterExisting() {
    setBusy(true); setError("");
    const { data } = await supabase.auth.getSession();
    await enterWithToken(data.session?.access_token);
  }

  async function signInAndEnter(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const { data, error: signErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signErr || !data.session) { setBusy(false); setError(signErr?.message || "Sign in failed."); return; }
    await enterWithToken(data.session.access_token);
  }

  async function useDifferentAccount() {
    setBusy(true);
    await supabase.auth.signOut().catch(() => {});
    setSessionEmail(null);
    setError("");
    setBusy(false);
  }

  if (sessionEmail === undefined) {
    return <main className="admin-shell admin-login"><div className="admin-card"><h1>Control panel</h1><p>Checking your session…</p></div></main>;
  }

  if (sessionEmail) {
    return (
      <main className="admin-shell admin-login">
        <div className="admin-card">
          <h1>Control panel</h1>
          <p>Signed in as <strong>{sessionEmail}</strong>.</p>
          {error ? <p className="admin-error">{error}</p> : null}
          <button className="admin-primary" disabled={busy} onClick={enterExisting} type="button">{busy ? "Opening…" : "Enter control panel"}</button>
          <button className="admin-ghost" disabled={busy} onClick={useDifferentAccount} type="button">Use a different account</button>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-shell admin-login">
      <form className="admin-card" onSubmit={signInAndEnter}>
        <h1>Control panel</h1>
        <p>Sign in with your admin email.</p>
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" autoFocus required /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
        {error ? <p className="admin-error">{error}</p> : null}
        <button className="admin-primary" disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
