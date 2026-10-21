// Server-only helpers for the Razorpay billing routes. Never imported by client code, so the
// key secret and service-role key stay on the server.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
export const RZP_PLAN_ID = process.env.RAZORPAY_PLAN_ID ?? "";
const RZP_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";

export function billingConfigured() {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && RZP_KEY_ID && RZP_KEY_SECRET);
}

/** Service-role Supabase client: bypasses RLS to write the subscriptions row after verifying payment. */
export function adminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Billing is not configured on the server.");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Validates the caller's Supabase access token (Authorization: Bearer ...) and returns the user id. */
export async function getUserId(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !SUPABASE_URL || !ANON_KEY) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/** Calls the Razorpay REST API with Basic auth. */
export async function razorpayFetch(path: string, init?: { method?: string; body?: unknown }) {
  const authHeader = "Basic " + Buffer.from(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (json as { error?: { description?: string } })?.error?.description ?? `Razorpay error ${response.status}`;
    throw new Error(message);
  }
  return json as Record<string, unknown>;
}

function hmac(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/** Razorpay checkout signature for a subscription: hmac(payment_id + "|" + subscription_id, key_secret). */
export function verifySubscriptionSignature(paymentId: string, subscriptionId: string, signature: string) {
  if (!paymentId || !subscriptionId || !signature) return false;
  const expected = hmac(`${paymentId}|${subscriptionId}`, RZP_KEY_SECRET);
  return timingSafeEqual(expected, signature);
}

/** Webhook signature: hmac(raw_body, webhook_secret). */
export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  if (!RZP_WEBHOOK_SECRET || !signature) return false;
  const expected = hmac(rawBody, RZP_WEBHOOK_SECRET);
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Whether a subscription row grants access to the workspace right now. */
export function hasAccess(row: { status?: string | null; trial_ends_at?: string | null; current_period_end?: string | null } | null) {
  if (!row) return false;
  const now = Date.now();
  if (row.status === "trialing") return row.trial_ends_at ? new Date(row.trial_ends_at).getTime() > now : false;
  if (row.status === "active") {
    // Active stays valid until a webhook moves it to past_due/halted. Allow a 3-day grace after the period end.
    if (!row.current_period_end) return true;
    return new Date(row.current_period_end).getTime() + 3 * 24 * 60 * 60 * 1000 > now;
  }
  return false;
}
