import { adminClient, billingConfigured, getUserId, razorpayFetch } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Schedules a cancellation at the end of the paid cycle: access continues until then, and the
// webhook (subscription.cancelled) flips the status when the cycle actually ends.
export async function POST(request: Request) {
  if (!billingConfigured()) return Response.json({ error: "Billing is not configured." }, { status: 503 });
  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "Please sign in again." }, { status: 401 });
  try {
    const admin = adminClient();
    const { data: row } = await admin.from("subscriptions").select("razorpay_subscription_id, status").eq("trader_id", userId).maybeSingle();
    if (!row?.razorpay_subscription_id) {
      return Response.json({ error: "No active subscription to cancel." }, { status: 400 });
    }
    await razorpayFetch(`/subscriptions/${row.razorpay_subscription_id}/cancel`, { method: "POST", body: { cancel_at_cycle_end: 1 } });
    await admin.from("subscriptions").update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq("trader_id", userId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not cancel the subscription." }, { status: 500 });
  }
}
