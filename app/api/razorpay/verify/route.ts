import { adminClient, billingConfigured, getUserId, razorpayFetch, verifySubscriptionSignature } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called by the browser after a successful Razorpay checkout. Verifies the signature with the key
// secret and only then marks the trader's subscription active — a forged request can't self-activate.
export async function POST(request: Request) {
  if (!billingConfigured()) return Response.json({ error: "Billing is not configured." }, { status: 503 });
  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const paymentId = String(body?.razorpay_payment_id ?? "");
  const subscriptionId = String(body?.razorpay_subscription_id ?? "");
  const signature = String(body?.razorpay_signature ?? "");
  if (!verifySubscriptionSignature(paymentId, subscriptionId, signature)) {
    return Response.json({ error: "Payment could not be verified." }, { status: 400 });
  }
  try {
    const admin = adminClient();
    const { data: row } = await admin.from("subscriptions").select("razorpay_subscription_id").eq("trader_id", userId).maybeSingle();
    if (!row || row.razorpay_subscription_id !== subscriptionId) {
      return Response.json({ error: "This payment does not match your subscription." }, { status: 400 });
    }
    await admin.from("subscriptions").update({ status: "active", updated_at: new Date().toISOString() }).eq("trader_id", userId);
    // Pull the real next-charge date from Razorpay so the renewal date shows immediately, rather than
    // waiting for the first webhook. Best-effort: the webhook keeps it in step afterwards.
    try {
      const sub = await razorpayFetch(`/subscriptions/${subscriptionId}`);
      const end = Number(sub.current_end || sub.charge_at || 0);
      if (end > 0) await admin.from("subscriptions").update({ current_period_end: new Date(end * 1000).toISOString() }).eq("trader_id", userId);
    } catch {
      // Leave current_period_end for the webhook to fill in.
    }
    return Response.json({ access: true, status: "active" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not activate the subscription." }, { status: 500 });
  }
}
