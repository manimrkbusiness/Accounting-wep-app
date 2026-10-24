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

// Returns the trader's payment history and next charge date, fetched live from Razorpay so it is
// always accurate (receipts, transaction ids and amounts) without storing anything ourselves.
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

    const items = ((invRes as unknown as { items?: RzpInvoice[] } | null)?.items ?? []) as RzpInvoice[];
    const invoices = items.map((inv) => ({
      id: String(inv.id ?? ""),
      amount: typeof inv.amount === "number" ? inv.amount / 100 : null,
      status: String(inv.status ?? ""),
      paymentId: inv.payment_id ? String(inv.payment_id) : null,
      date: inv.paid_at ? new Date(inv.paid_at * 1000).toISOString() : inv.date ? new Date(inv.date * 1000).toISOString() : null,
      receiptUrl: inv.short_url ? String(inv.short_url) : null
    }));

    const sub = subRes as unknown as { status?: string; charge_at?: number; current_end?: number } | null;
    const nextRaw = Number(sub?.charge_at || sub?.current_end || 0);
    const nextChargeAt = nextRaw > 0 ? new Date(nextRaw * 1000).toISOString() : null;

    return Response.json({ invoices, nextChargeAt, status: sub?.status ?? null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load billing history." }, { status: 500 });
  }
}
