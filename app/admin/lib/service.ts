import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminPassword = process.env.ADMIN_PASSWORD;

/** True only when every server-side admin secret is present. */
export const ADMIN_CONFIGURED = Boolean(supabaseUrl && serviceKey && adminPassword);

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
  return crypto.createHmac("sha256", adminPassword || "unset").update("mrk-admin-session-v1").digest("hex");
}

function equals(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function checkPassword(input: string) {
  return Boolean(adminPassword) && equals(input, adminPassword as string);
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
