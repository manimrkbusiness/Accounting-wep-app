"use client";

import { useState } from "react";
import { supabase } from "./supabaseClient";

type Mode = "signup" | "signin";

function getAuthErrorMessage(caughtError: unknown) {
  const fallbackMessage = "Something went wrong.";

  if (!(caughtError instanceof Error)) {
    return fallbackMessage;
  }

  const message = caughtError.message.toLowerCase();

  if (message.includes("email rate limit")) {
    return "Too many signup emails were sent. Please wait a few minutes, then try again.";
  }

  if (message.includes("email not confirmed")) {
    return "Please confirm your email before signing in.";
  }

  if (message.includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }

  return caughtError.message || fallbackMessage;
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [signedInEmail, setSignedInEmail] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password
        });

        if (signUpError) {
          throw signUpError;
        }

        setPassword("");
        if (data.session) {
          await supabase.auth.signOut();
        }
        setMode("signin");
        setMessage("Account created. Sign in with the same email and password.");
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        throw signInError;
      }

      setSignedInEmail(data.user?.email ?? email);
      setPassword("");
      setMessage("Signed in successfully.");
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setSignedInEmail("");
    setMessage("Signed out.");
    setMode("signin");
  }

  const isSignup = mode === "signup";

  return (
    <main className="page-shell">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="brand-block">
          <span className="eyebrow">Accounting Web App</span>
          <h1 id="auth-title">{isSignup ? "Create your account" : "Sign in"}</h1>
          <p>
            {isSignup
              ? "Start with signup. Your account is created through Supabase Auth."
              : "Use your registered email and password to continue."}
          </p>
        </div>

        {signedInEmail ? (
          <div className="success-state">
            <div>
              <span className="eyebrow">Signed in as</span>
              <strong>{signedInEmail}</strong>
            </div>
            <button type="button" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              Email
              <input
                autoComplete="email"
                inputMode="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
            </label>

            <label>
              Password
              <input
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={6}
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 6 characters"
                required
                type="password"
                value={password}
              />
            </label>

            {message ? <p className="status-message">{message}</p> : null}
            {error ? <p className="error-message">{error}</p> : null}

            <button disabled={loading} type="submit">
              {loading ? "Please wait..." : isSignup ? "Sign up" : "Sign in"}
            </button>
          </form>
        )}

        {!signedInEmail ? (
          <button
            className="link-button"
            type="button"
            onClick={() => {
              setMode(isSignup ? "signin" : "signup");
              setError("");
              setMessage("");
              setPassword("");
            }}
          >
            {isSignup ? "Already have an account? Sign in" : "Need an account? Sign up"}
          </button>
        ) : null}
      </section>
    </main>
  );
}
