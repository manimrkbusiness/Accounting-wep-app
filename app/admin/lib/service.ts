import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Emails allowed into the control panel. From ADMIN_EMAILS (comma-separated), else the owner. */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "01madmad@gmail.com")
  .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);

/** True only when the server can reach Supabase with the service-role key. */
export const ADMIN_CONFIGURED = Boolean(supabaseUrl && serviceKey);

const COOKIE = "mrk_admin_session";

/**
 * Supabase client with the service-role key. It bypasses row level security, so it
 * is used ONLY in server components and server actions and never reaches the browser.
 */
export function serviceClient() {
  if (!supabaseUrl || !serviceKey) throw new Error("Admin service is not configured.");
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function sessionToken() {
  return crypto.createHmac("sha256", serviceKey || "unset").update("mrk-admin-session-v2").digest("hex");
}

function equals(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Verifies a Supabase access token and returns the email when it belongs to an allowed admin. */
export async function verifyAdminToken(token: string): Promise<string | null> {
  if (!token || !supabaseUrl || !anonKey) return null;
  try {
    const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.getUser(token);
    const email = data.user?.email?.toLowerCase() ?? "";
    if (error || !email) return null;
    return ADMIN_EMAILS.includes(email) ? email : null;
  } catch {
    return null;
  }
}

export async function isAuthed() {
  if (!ADMIN_CONFIGURED) return false;
  const store = await cookies();
  const value = store.get(COOKIE)?.value;
  return Boolean(value) && equals(value as string, sessionToken());
}

export async function setAuthCookie() {
  const store = await cookies();
  store.set(COOKIE, sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export async function clearAuthCookie() {
  const store = await cookies();
  store.delete(COOKIE);
}

/** The public base path the panel is served under (the secret path, or /admin). */
export async function adminBase() {
  const store = await headers();
  return store.get("x-admin-base") || "/admin";
}
