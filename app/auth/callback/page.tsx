"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sprout } from "lucide-react";
import { supabase } from "../../supabaseClient";

/**
 * Where Supabase sends the user back after Google sign-in (and, as a fallback, a password-reset
 * link). With detectSessionInUrl the client auto-exchanges the PKCE `?code` and establishes the
 * session; we just wait for it and hand off to the home page, which routes to the workspace, the
 * "finish your profile" step, or (for a reset link) the set-new-password step.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let recovered = false;
    const params = new URLSearchParams(window.location.search);
    const described = params.get("error_description") || params.get("error");
    if (described) { setError(described); return; }

    const go = () => { if (active) router.replace(recovered ? "/?reset=1" : "/"); };
    supabase.auth.getSession().then(({ data }) => { if (active && data.session) go(); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") recovered = true;
      if (nextSession) go();
    });
    const timeout = setTimeout(() => {
      if (!active) return;
      supabase.auth.getSession().then(({ data }) => {
        if (active && !data.session) setError("We couldn't finish sign-in. The link may have expired — please try again.");
      });
    }, 7000);

    return () => { active = false; listener.subscription.unsubscribe(); clearTimeout(timeout); };
  }, [router]);

  return (
    <main className="page-shell">
      <section className="auth-panel loading-panel">
        <div className="brand-lockup"><span className="brand-mark"><Sprout size={21} strokeWidth={2.4} aria-hidden="true" /></span><div><strong>COCONUT TRADE DESK</strong><span>Signing you in</span></div></div>
        {error
          ? <><h1>Sign-in link problem</h1><p className="error-message">{error}</p><button className="primary-button" onClick={() => router.replace("/")} type="button">Back to sign in</button></>
          : <><h1>Signing you in…</h1><p>One moment while we finish connecting your account.</p></>}
      </section>
    </main>
  );
}
