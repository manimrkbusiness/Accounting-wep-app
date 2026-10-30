import { adminClient, billingConfigured, getUserId, razorpayFetch } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RzpInvoice = {
  id?: string;
  amount?: number;
  status?: string;
  payment_id?: string | null;
  paid_at?: number | null;
  date?: number | null;
  short_url?: string | null;
};

// Adds one plan cycle to a start time, so each payment can show the period it covers.
function addPeriod(startMs: number, period: string, interval: number): number {
  const d = new Date(startMs);
  const n = interval > 0 ? interval : 1;
  if (period === "daily") d.setDate(d.getDate() + n);
  else if (period === "weekly") d.setDate(d.getDate() + 7 * n);
  else if (period === "yearly") d.setFullYear(d.getFullYear() + n);
  else d.setMonth(d.getMonth() + n); // monthly (default)
  return d.getTime();
}

// Returns the trader's payment history (with the billing period each payment covers) and the next
// charge date, fetched live from Razorpay so it is always accurate without storing anything ourselves.
export async function GET(request: Request) {
  if (!billingConfigured()) return Response.json({ invoices: [], nextChargeAt: null, status: null });
  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "Please sign in again." }, { status: 401 });
  try {
    const admin = adminClient();
    const { data: row } = await admin.from("subscriptions").select("razorpay_subscription_id").eq("trader_id", userId).maybeSingle();
    const subId = row?.razorpay_subscription_id;
    if (!subId) return Response.json({ invoices: [], nextChargeAt: null, status: null });

    const [subRes, invRes] = await Promise.all([
      razorpayFetch(`/subscriptions/${subId}`).catch(() => null),
      razorpayFetch(`/invoices?subscription_id=${subId}&count=100`).catch(() => null)
    ]);

    const sub = subRes as unknown as { status?: string; charge_at?: number; current_end?: number; plan_id?: string } | null;

    // The plan's cycle (monthly by default) tells us how long each payment covers.
    let planPeriod = "monthly";
    let planInterval = 1;
    if (sub?.plan_id) {
      const plan = (await razorpayFetch(`/plans/${sub.plan_id}`).catch(() => null)) as unknown as { period?: string; interval?: number } | null;
      if (plan?.period) planPeriod = plan.period;
      if (plan?.interval) planInterval = Number(plan.interval) || 1;
    }

    const items = ((invRes as unknown as { items?: RzpInvoice[] } | null)?.items ?? []) as RzpInvoice[];
    const invoices = items.map((inv) => {
      const startMs = inv.paid_at ? inv.paid_at * 1000 : inv.date ? inv.date * 1000 : null;
      const paid = inv.status === "paid";
      const endMs = paid && startMs ? addPeriod(startMs, planPeriod, planInterval) : null;
      return {
        id: String(inv.id ?? ""),
        amount: typeof inv.amount === "number" ? inv.amount / 100 : null,
        status: String(inv.status ?? ""),
        paymentId: inv.payment_id ? String(inv.payment_id) : null,
        date: startMs ? new Date(startMs).toISOString() : null,
        periodStart: paid && startMs ? new Date(startMs).toISOString() : null,
        periodEnd: endMs ? new Date(endMs).toISOString() : null,
        receiptUrl: inv.short_url ? String(inv.short_url) : null
      };
    });

    const nextRaw = Number(sub?.charge_at || sub?.current_end || 0);
    const nextChargeAt = nextRaw > 0 ? new Date(nextRaw * 1000).toISOString() : null;

    return Response.json({ invoices, nextChargeAt, status: sub?.status ?? null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load billing history." }, { status: 500 });
  }
}
