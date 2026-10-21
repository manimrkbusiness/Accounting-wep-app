import { adminClient, verifyWebhookSignature } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Razorpay -> us. Keeps the subscription status in step over time: each monthly charge extends the
// period; a failed charge or cancellation downgrades access. Verified by the webhook secret.
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  if (!verifyWebhookSignature(raw, signature)) {
    return Response.json({ ok: false }, { status: 400 });
  }
  let event: { event?: string; payload?: { subscription?: { entity?: { id?: string; current_end?: number } } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const type = event.event ?? "";
  const subscription = event.payload?.subscription?.entity;
  const subscriptionId = subscription?.id;
  if (!subscriptionId) return Response.json({ ok: true });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (["subscription.activated", "subscription.authenticated", "subscription.charged", "subscription.resumed", "subscription.updated"].includes(type)) {
    update.status = "active";
    if (subscription?.current_end) update.current_period_end = new Date(subscription.current_end * 1000).toISOString();
  } else if (type === "subscription.pending") {
    update.status = "past_due";
  } else if (type === "subscription.halted") {
    update.status = "halted";
  } else if (type === "subscription.cancelled" || type === "subscription.completed") {
    update.status = "cancelled";
  } else {
    return Response.json({ ok: true });
  }

  try {
    const admin = adminClient();
    await admin.from("subscriptions").update(update).eq("razorpay_subscription_id", subscriptionId);
  } catch {
    // Acknowledge anyway; Razorpay retries, and a transient failure shouldn't 500 the webhook.
  }
  return Response.json({ ok: true });
}
