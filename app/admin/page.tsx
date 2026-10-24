import Link from "next/link";
import { ADMIN_CONFIGURED, adminBase, isAuthed, serviceClient } from "./lib/service";
import { AdminGate } from "./AdminGate";
import { AdminShell } from "./AdminShell";
import { money, num, dateTime, subState, type SubRow } from "./lib/format";

export const dynamic = "force-dynamic";

type Profile = { id: string; full_name: string | null; phone: string | null; email: string | null; account_type: string | null; business_name: string | null; created_at: string };
type Row = { trader_id: string };

export default async function AdminDashboard() {
  const base = await adminBase();
  if (!(ADMIN_CONFIGURED && (await isAuthed()))) return <AdminGate configured={ADMIN_CONFIGURED} base={base} />;

  const supabase = serviceClient();
  const [profilesRes, subsRes, farmersRes, buyersRes, tradesRes, salesRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone, email, account_type, business_name, created_at").order("created_at", { ascending: false }),
    supabase.from("subscriptions").select("trader_id, status, trial_ends_at, current_period_end"),
    supabase.from("trader_farmers").select("trader_id"),
    supabase.from("buyers").select("trader_id"),
    supabase.from("coconut_trades").select("trader_id, total_amount"),
    supabase.from("sales").select("trader_id, total_amount")
  ]);

  const profiles = (profilesRes.data ?? []) as Profile[];
  const subs = (subsRes.data ?? []) as SubRow[];
  const subByTrader = new Map(subs.map((s) => [s.trader_id, s]));

  const traders = profiles.filter((p) => p.account_type === "trader");
  const farmerAccounts = profiles.filter((p) => p.account_type === "farmer");
  const noRole = profiles.filter((p) => p.account_type !== "trader" && p.account_type !== "farmer");

  let onTrial = 0, active = 0, expired = 0, noSub = 0;
  traders.forEach((t) => {
    const tone = subState(subByTrader.get(t.id)).tone;
    if (tone === "trial") onTrial += 1;
    else if (tone === "active") active += 1;
    else if (tone === "expired") expired += 1;
    else noSub += 1;
  });

  const sumBy = (rows: (Row & { total_amount: number | string })[] | null) => (rows ?? []).reduce((acc, row) => acc + Number(row.total_amount), 0);
  const totalPurchase = sumBy(tradesRes.data as (Row & { total_amount: number })[] | null);
  const totalSales = sumBy(salesRes.data as (Row & { total_amount: number })[] | null);
  const recent = profiles.slice(0, 8);

  return (
    <AdminShell base={base}>
      <header className="admin-top">
        <div><span className="admin-eyebrow">Overview</span><h1>Dashboard</h1><p>Every account and what they are doing. Read-only.</p></div>
        <Link className="admin-primary admin-cta" href={`${base}/users`}>View all users →</Link>
      </header>

      <section className="admin-metrics">
        <div><span>Total users</span><strong>{num(profiles.length)}</strong></div>
        <div><span>Traders</span><strong>{num(traders.length)}</strong></div>
        <div><span>On trial</span><strong>{num(onTrial)}</strong></div>
        <div><span>Paid (active)</span><strong>{num(active)}</strong></div>
        <div><span>Trial ended / lapsed</span><strong>{num(expired)}</strong></div>
        <div><span>No subscription yet</span><strong>{num(noSub)}</strong></div>
        <div><span>Farmer accounts</span><strong>{num(farmerAccounts.length)}</strong></div>
        <div><span>Farmers added</span><strong>{num((farmersRes.data ?? []).length)}</strong></div>
        <div><span>Buyers added</span><strong>{num((buyersRes.data ?? []).length)}</strong></div>
        <div><span>Purchase value</span><strong>{money(totalPurchase)}</strong></div>
        <div><span>Sales value</span><strong>{money(totalSales)}</strong></div>
        {noRole.length ? <div><span>Role not set</span><strong>{num(noRole.length)}</strong></div> : null}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head"><h2>Newest sign-ups</h2><Link className="admin-link" href={`${base}/users`}>All users →</Link></div>
        <div className="admin-table-wrap"><table><thead><tr><th>Name / business</th><th>Phone</th><th>Email</th><th>Role</th><th>Subscription</th><th>Joined</th><th></th></tr></thead><tbody>
          {recent.map((p) => { const st = subState(subByTrader.get(p.id)); return <tr key={p.id}>
            <td><strong>{p.business_name || p.full_name || "—"}</strong>{p.business_name && p.full_name ? <span className="admin-sub">{p.full_name}</span> : null}</td>
            <td>{p.phone ?? "-"}</td>
            <td>{p.email ?? "-"}</td>
            <td>{p.account_type ?? "not set"}</td>
            <td>{p.account_type === "trader" ? <span className={`admin-tag ${st.tone}`}>{st.label}</span> : "-"}</td>
            <td>{dateTime(p.created_at)}</td>
            <td><Link className="admin-link" href={`${base}/users/${p.id}`}>Open</Link></td>
          </tr>; })}
          {recent.length === 0 ? <tr><td colSpan={7} className="admin-empty">No users yet.</td></tr> : null}
        </tbody></table></div>
      </section>
    </AdminShell>
  );
}
