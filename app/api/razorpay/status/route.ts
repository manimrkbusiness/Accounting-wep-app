import { adminClient, billingConfigured, getUserId, hasAccess } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns whether the signed-in trader can use the workspace, creating their 14-day trial row the
// first time. Fails OPEN (access: true) on any problem, so a billing issue never locks the app.
export async function GET(request: Request) {
  if (!billingConfigured()) return Response.json({ access: true, status: "unconfigured" });
  const userId = await getUserId(request);
  if (!userId) return Response.json({ access: true, status: "unknown" });
  try {
    const admin = adminClient();
    await admin.from("subscriptions").upsert({ trader_id: userId }, { onConflict: "trader_id", ignoreDuplicates: true });
    const { data: row } = await admin.from("subscriptions").select("status, trial_ends_at, current_period_end, cancel_at_period_end").eq("trader_id", userId).maybeSingle();
    return Response.json({
      access: hasAccess(row),
      status: row?.status ?? null,
      trialEndsAt: row?.trial_ends_at ?? null,
      currentPeriodEnd: row?.current_period_end ?? null,
      cancelAtPeriodEnd: row?.cancel_at_period_end ?? false
    });
  } catch {
    return Response.json({ access: true, status: "error" });
  }
}
