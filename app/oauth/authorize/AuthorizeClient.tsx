"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { approveAuthorization, denyAuthorization, type AuthorizeParams } from "./approve";

const CSS = `
.bzt-auth { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f1f5f3; padding: 24px; font-family: Inter, system-ui, sans-serif; }
.bzt-auth .card { background: #fff; border: 1px solid #d8e6df; border-radius: 14px; box-shadow: 0 10px 40px rgba(0,60,40,.08); max-width: 420px; width: 100%; padding: 28px; }
.bzt-auth .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.bzt-auth .mark { width: 34px; height: 34px; border-radius: 9px; background: #007a5e; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; }
.bzt-auth h1 { font-size: 1.4rem; margin: 0 0 6px; color: #10241c; }
.bzt-auth p { color: #40564b; margin: 0 0 12px; font-size: .95rem; }
.bzt-auth .muted { color: #6a7d74; font-size: .86rem; }
.bzt-auth label { display: block; font-size: .8rem; color: #40564b; margin-bottom: 10px; }
.bzt-auth input { width: 100%; margin-top: 4px; padding: 10px 12px; border: 1px solid #c7d8d0; border-radius: 8px; font-size: .95rem; }
.bzt-auth button { font-size: .95rem; font-weight: 600; border-radius: 8px; padding: 11px 14px; cursor: pointer; border: 1px solid transparent; }
.bzt-auth button[disabled] { opacity: .6; cursor: default; }
.bzt-auth .primary { width: 100%; background: #007a5e; color: #fff; margin-top: 4px; }
.bzt-auth .google { width: 100%; background: #fff; border: 1px solid #c7d8d0; color: #10241c; margin-bottom: 14px; }
.bzt-auth .ghost { background: transparent; border: 1px solid #c7d8d0; color: #40564b; }
.bzt-auth .row { display: flex; gap: 10px; margin-top: 12px; }
.bzt-auth .row button { flex: 1; }
.bzt-auth .or { text-align: center; color: #93a69d; font-size: .8rem; margin: 6px 0 14px; }
.bzt-auth .err { background: #fdeceb; color: #b42318; padding: 10px 12px; border-radius: 8px; font-size: .85rem; }
`;

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="bzt-auth">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="card">
        <div className="brand"><span className="mark">B</span><strong>BizzTrack</strong></div>
        {children}
      </div>
    </main>
  );
}

export function AuthorizeClient({ params, valid, clientName }: { params: AuthorizeParams; valid: boolean; clientName: string }) {
  const [sessionEmail, setSessionEmail] = useState<string | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessionEmail(data.session?.user.email ?? null)).catch(() => setSessionEmail(null));
  }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const { data, error: signErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signErr || !data.session) { setError(signErr?.message || "Sign in failed."); return; }
    setSessionEmail(data.session.user.email ?? null);
  }
  async function google() {
    setError("");
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href } });
  }
  async function allow() {
    setBusy(true); setError("");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setBusy(false); setError("Please sign in again."); return; }
    const result = await approveAuthorization({ ...params, supabaseAccessToken: token });
    if ("redirect" in result) { window.location.assign(result.redirect); return; }
    setBusy(false); setError(result.error);
  }
  async function deny() {
    const result = await denyAuthorization({ redirect_uri: params.redirect_uri, state: params.state });
    window.location.assign(result.redirect);
  }

  if (!valid) {
    return <Card><h1>Connection request</h1><p className="err">This authorization request is invalid or is missing required details. Please start the connection again from your assistant.</p></Card>;
  }
  if (sessionEmail === undefined) {
    return <Card><p>Checking your session…</p></Card>;
  }
  if (sessionEmail) {
    return (
      <Card>
        <h1>Authorize access</h1>
        <p>Allow <strong>{clientName}</strong> to read and create records in your BizzTrack account?</p>
        <p className="muted">Signed in as <strong>{sessionEmail}</strong>. It will only ever access <strong>your own</strong> account&apos;s data — never anyone else&apos;s.</p>
        {error ? <p className="err">{error}</p> : null}
        <button className="primary" disabled={busy} onClick={allow} type="button">{busy ? "Connecting…" : "Allow"}</button>
        <div className="row">
          <button className="ghost" disabled={busy} onClick={deny} type="button">Deny</button>
          <button className="ghost" disabled={busy} onClick={() => supabase.auth.signOut().then(() => setSessionEmail(null))} type="button">Use another account</button>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <h1>Sign in</h1>
      <p className="muted">Sign in to connect <strong>{clientName}</strong> to your BizzTrack account.</p>
      <button className="google" onClick={google} type="button">Continue with Google</button>
      <div className="or">or</div>
      <form onSubmit={signIn}>
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
        {error ? <p className="err">{error}</p> : null}
        <button className="primary" disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </Card>
  );
}
