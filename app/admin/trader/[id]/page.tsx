import Link from "next/link";
import { notFound } from "next/navigation";
import { ADMIN_CONFIGURED, adminBase, isAuthed, serviceClient } from "../../lib/service";
import { money, num, dateOnly, dateTime, pur, sal } from "../../lib/format";

export const dynamic = "force-dynamic";

export default async function TraderDetail({ params }: { params: Promise<{ id: string }> }) {
  const base = await adminBase();
  const { id } = await params;

  if (!ADMIN_CONFIGURED || !(await isAuthed())) {
    return <main className="admin-shell"><div className="admin-card"><h1>Locked</h1><p><Link className="admin-link" href={base}>Go to the control panel</Link> and sign in.</p></div></main>;
  }

  const supabase = serviceClient();
  const [profileRes, farmersRes, locationsRes, buyersRes, tradesRes, salesRes, expensesRes, cashRes, stockRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.from("trader_farmers").select("*").eq("trader_id", id).order("name"),
    supabase.from("farmer_locations").select("id, farmer_id, location_name, city"),
    supabase.from("buyers").select("*").eq("trader_id", id).order("name"),
    supabase.from("coconut_trades").select("*").eq("trader_id", id).order("trade_date", { ascending: false }).order("id", { ascending: false }),
    supabase.from("sales").select("*").eq("trader_id", id).order("sale_date", { ascending: false }).order("id", { ascending: false }),
    supabase.from("expenses").select("amount, category, expense_date").eq("trader_id", id),
    supabase.from("cash_entries").select("amount, kind, entry_date").eq("trader_id", id),
    supabase.from("stock_entries").select("id, coconut_quantity, net_weight_kg, entry_date").eq("trader_id", id)
  ]);

  const profile = profileRes.data as { id: string; full_name: string | null; phone: string | null; email: string | null; account_type: string | null; business_name: string | null; created_at: string } | null;
  if (!profile) notFound();

  type Farmer = { id: number; name: string; phone: string; created_at: string };
  type Buyer = { id: number; name: string; phone: string | null; business_name: string | null; city: string | null; buys_coconut: boolean; buys_husk: boolean; active: boolean };
  type Location = { id: number; farmer_id: number; location_name: string; city: string | null };
  type Trade = { id: number; farmer_id: number; trade_date: string; purchase_mode: string; coconut_color: string; coconut_quantity: number; total_amount: number; balance_amount: number; payment_status: string };
  type Sale = { id: number; buyer_id: number; sale_date: string; sale_kind: string; unit: string; quantity: number; rate: number; total_amount: number; balance_amount: number; payment_status: string };

  const farmers = (farmersRes.data ?? []) as Farmer[];
  const buyers = (buyersRes.data ?? []) as Buyer[];
  const locations = (locationsRes.data ?? []) as Location[];
  const trades = (tradesRes.data ?? []) as Trade[];
  const sales = (salesRes.data ?? []) as Sale[];
  const expenses = (expensesRes.data ?? []) as { amount: number }[];
  const cash = (cashRes.data ?? []) as { amount: number; kind: string }[];
  const stock = (stockRes.data ?? []) as { coconut_quantity: number }[];

  const farmerName = new Map(farmers.map((f) => [f.id, f.name]));
  const buyerName = new Map(buyers.map((b) => [b.id, b.name]));
  const farmerIds = new Set(farmers.map((f) => f.id));
  const locationsByFarmer = new Map<number, string[]>();
  locations.filter((l) => farmerIds.has(l.farmer_id)).forEach((l) => locationsByFarmer.set(l.farmer_id, [...(locationsByFarmer.get(l.farmer_id) ?? []), l.city ? `${l.location_name}, ${l.city}` : l.location_name]));

  const purchaseValue = trades.reduce((s, t) => s + Number(t.total_amount), 0);
  const saleValue = sales.reduce((s, x) => s + Number(x.total_amount), 0);
  const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <main className="admin-shell">
      <header className="admin-top">
        <div><span className="admin-eyebrow"><Link className="admin-link" href={base}>← All accounts</Link></span><h1>{profile.business_name || profile.full_name || "Trader"}</h1><p>{[profile.full_name, profile.phone, profile.email].filter(Boolean).join("  ·  ")}</p><p className="admin-note">{profile.account_type ?? "no role"} · joined {dateTime(profile.created_at)} · id {profile.id}</p></div>
      </header>

      <section className="admin-metrics">
        <div><span>Farmers</span><strong>{num(farmers.length)}</strong></div>
        <div><span>Buyers</span><strong>{num(buyers.length)}</strong></div>
        <div><span>Purchases</span><strong>{num(trades.length)}</strong></div>
        <div><span>Sales</span><strong>{num(sales.length)}</strong></div>
        <div><span>Stock entries</span><strong>{num(stock.length)}</strong></div>
        <div><span>Purchase value</span><strong>{money(purchaseValue)}</strong></div>
        <div><span>Sales value</span><strong>{money(saleValue)}</strong></div>
        <div><span>Expenses</span><strong>{money(expenseTotal)}</strong></div>
        <div><span>Cash entries</span><strong>{num(cash.length)}</strong></div>
      </section>

      <section className="admin-panel">
        <h2>Farmers ({farmers.length})</h2>
        <div className="admin-table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Locations</th><th>Added</th></tr></thead><tbody>
          {farmers.map((f) => <tr key={f.id}><td>{f.name}</td><td>{f.phone}</td><td>{(locationsByFarmer.get(f.id) ?? []).join("  ·  ") || "-"}</td><td>{dateTime(f.created_at)}</td></tr>)}
          {farmers.length === 0 ? <tr><td colSpan={4} className="admin-empty">No farmers added.</td></tr> : null}
        </tbody></table></div>
      </section>

      <section className="admin-panel">
        <h2>Buyers ({buyers.length})</h2>
        <div className="admin-table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Business</th><th>City</th><th>Buys</th><th>Status</th></tr></thead><tbody>
          {buyers.map((b) => <tr key={b.id}><td>{b.name}</td><td>{b.phone ?? "-"}</td><td>{b.business_name ?? "-"}</td><td>{b.city ?? "-"}</td><td>{[b.buys_coconut ? "coconut" : null, b.buys_husk ? "husk" : null].filter(Boolean).join(", ") || "-"}</td><td>{b.active ? "active" : "inactive"}</td></tr>)}
          {buyers.length === 0 ? <tr><td colSpan={6} className="admin-empty">No buyers added.</td></tr> : null}
        </tbody></table></div>
      </section>

      <section className="admin-panel">
        <h2>Purchases ({trades.length})</h2>
        <div className="admin-table-wrap"><table><thead><tr><th>Purchase</th><th>Date</th><th>Farmer</th><th>Method</th><th>Coconut</th><th>Pieces</th><th>Net payable</th><th>Balance</th><th>Status</th></tr></thead><tbody>
          {trades.slice(0, 200).map((t) => <tr key={t.id}><td>{pur(t.id)}</td><td>{dateOnly(t.trade_date)}</td><td>{farmerName.get(t.farmer_id) ?? "-"}</td><td>{t.purchase_mode === "quantity" ? "Per nut" : "Weight"}</td><td>{t.coconut_color}</td><td>{num(t.coconut_quantity)}</td><td>{money(t.total_amount)}</td><td>{money(t.balance_amount)}</td><td>{t.payment_status}</td></tr>)}
          {trades.length === 0 ? <tr><td colSpan={9} className="admin-empty">No purchases.</td></tr> : null}
        </tbody></table>{trades.length > 200 ? <p className="admin-note">Showing the latest 200 of {trades.length}.</p> : null}</div>
      </section>

      <section className="admin-panel">
        <h2>Sales ({sales.length})</h2>
        <div className="admin-table-wrap"><table><thead><tr><th>Sale</th><th>Date</th><th>Buyer</th><th>Type</th><th>Quantity</th><th>Rate</th><th>Total</th><th>Balance</th><th>Status</th></tr></thead><tbody>
          {sales.slice(0, 200).map((s) => <tr key={s.id}><td>{sal(s.id)}</td><td>{dateOnly(s.sale_date)}</td><td>{buyerName.get(s.buyer_id) ?? "-"}</td><td>{s.sale_kind}</td><td>{num(s.quantity, 2)} {s.unit}</td><td>{money(s.rate)}</td><td>{money(s.total_amount)}</td><td>{money(s.balance_amount)}</td><td>{s.payment_status}</td></tr>)}
          {sales.length === 0 ? <tr><td colSpan={9} className="admin-empty">No sales.</td></tr> : null}
        </tbody></table>{sales.length > 200 ? <p className="admin-note">Showing the latest 200 of {sales.length}.</p> : null}</div>
      </section>
    </main>
  );
}
