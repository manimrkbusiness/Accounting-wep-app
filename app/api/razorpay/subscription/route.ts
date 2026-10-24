import { adminClient, billingConfigured, getUserId, razorpayFetch, RZP_KEY_ID, RZP_PLAN_ID } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Creates a Razorpay subscription for the configured plan (RAZORPAY_PLAN_ID) and stores its id on the
// trader's row. The row is only marked "active" once /verify or the webhook confirms the paid charge.
// Resubscribing resets any leftover cancellation fields so a fresh subscription starts clean.
export async function POST(request: Request) {
  if (!billingConfigured() || !RZP_PLAN_ID) {
    return Response.json({ error: "Billing is not configured yet. Please try again shortly." }, { status: 503 });
  }
  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "Please sign in again." }, { status: 401 });
  try {
    const subscription = await razorpayFetch("/subscriptions", {
      method: "POST",
      body: { plan_id: RZP_PLAN_ID, total_count: 120, quantity: 1, customer_notify: 1, notes: { trader_id: userId } }
    });
    const subscriptionId = subscription.id as string;
    const admin = adminClient();
    await admin.from("subscriptions").upsert(
      { trader_id: userId, razorpay_subscription_id: subscriptionId, cancel_at_period_end: false, current_period_end: null, updated_at: new Date().toISOString() },
      { onConflict: "trader_id" }
    );
    return Response.json({ subscriptionId, keyId: RZP_KEY_ID });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not start the subscription." }, { status: 500 });
  }
}
