import Link from "next/link";
import { ADMIN_CONFIGURED, adminBase, isAuthed, serviceClient } from "./lib/service";
import { login, logout } from "./actions";
import { money, num, dateTime } from "./lib/format";

export const dynamic = "force-dynamic";

type Profile = { id: string; full_name: string | null; phone: string | null; email: string | null; account_type: string | null; business_name: string | null; created_at: string };
type Row = { trader_id: string };

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const base = await adminBase();
  const sp = await searchParams;

  if (!ADMIN_CONFIGURED) {
    return (
      <main className="admin-shell">
        <div className="admin-card">
          <h1>Control panel not configured</h1>
          <p>Set <code>SUPABASE_SERVICE_ROLE_KEY</code>, <code>ADMIN_PASSWORD</code> and (optionally) <code>ADMIN_SECRET_PATH</code> in the Vercel environment, then redeploy.</p>
        </div>
      </main>
    );
  }

  if (!(await isAuthed())) {
    return (
      <main className="admin-shell admin-login">
        <form className="admin-card" action={login}>
          <h1>Control panel</h1>
          <p>Enter the admin password to continue.</p>
          <input type="hidden" name="base" value={base} />
          <label>Password<input type="password" name="password" autoComplete="off" autoFocus required /></label>
          {sp?.e ? <p className="admin-error">Incorrect password.</p> : null}
          <button className="admin-primary" type="submit">Unlock</button>
        </form>
      </main>
    );
  }

  const supabase = serviceClient();
  const [profilesRes, farmersRes, buyersRes, tradesRes, salesRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone, email, account_type, business_name, created_at").order("created_at", { ascending: false }),
    supabase.from("trader_farmers").select("trader_id"),
    supabase.from("buyers").select("trader_id"),
    supabase.from("coconut_trades").select("trader_id, total_amount"),
    supabase.from("sales").select("trader_id, total_amount")
  ]);

  const profiles = (profilesRes.data ?? []) as Profile[];
  const countBy = (rows: Row[] | null) => {
    const map = new Map<string, number>();
    (rows ?? []).forEach((row) => map.set(row.trader_id, (map.get(row.trader_id) ?? 0) + 1));
    return map;
  };
  const sumBy = (rows: (Row & { total_amount: number | string })[] | null) => {
    const map = new Map<string, number>();
    (rows ?? []).forEach((row) => map.set(row.trader_id, (map.get(row.trader_id) ?? 0) + Number(row.total_amount)));
    return map;
  };
  const farmerCount = countBy(farmersRes.data as Row[] | null);
  const buyerCount = countBy(buyersRes.data as Row[] | null);
  const tradeCount = countBy(tradesRes.data as Row[] | null);
  const saleCount = countBy(salesRes.data as Row[] | null);
  const purchaseValue = sumBy(tradesRes.data as (Row & { total_amount: number })[] | null);
  const saleValue = sumBy(salesRes.data as (Row & { total_amount: number })[] | null);

  const traders = profiles.filter((p) => p.account_type === "trader");
  const farmerAccounts = profiles.filter((p) => p.account_type === "farmer");
  const others = profiles.filter((p) => p.account_type !== "trader" && p.account_type !== "farmer");
  const totalPurchaseValue = Array.from(purchaseValue.values()).reduce((a, b) => a + b, 0);
  const totalSaleValue = Array.from(saleValue.values()).reduce((a, b) => a + b, 0);

  return (
    <main className="admin-shell">
      <header className="admin-top">
        <div><span className="admin-eyebrow">Coconut Trade Desk</span><h1>Control panel</h1><p>Live view of every account and what they are doing. Read-only.</p></div>
        <form action={logout}><input type="hidden" name="base" value={base} /><button className="admin-ghost" type="submit">Lock</button></form>
      </header>

      <section className="admin-metrics">
        <div><span>Traders</span><strong>{num(traders.length)}</strong></div>
        <div><span>Farmer accounts</span><strong>{num(farmerAccounts.length)}</strong></div>
        <div><span>Farmers added</span><strong>{num(Array.from(farmerCount.values()).reduce((a, b) => a + b, 0))}</strong></div>
        <div><span>Buyers added</span><strong>{num(Array.from(buyerCount.values()).reduce((a, b) => a + b, 0))}</strong></div>
        <div><span>Purchase value</span><strong>{money(totalPurchaseValue)}</strong></div>
        <div><span>Sales value</span><strong>{money(totalSaleValue)}</strong></div>
      </section>

      <section className="admin-panel">
        <h2>Traders ({traders.length})</h2>
        <div className="admin-table-wrap"><table><thead><tr><th>Business / name</th><th>Phone</th><th>Email</th><th>Joined</th><th>Farmers</th><th>Buyers</th><th>Purchases</th><th>Sales</th><th>Purchase value</th><th></th></tr></thead><tbody>
          {traders.map((t) => <tr key={t.id}>
            <td><strong>{t.business_name || t.full_name || "Trader"}</strong>{t.business_name && t.full_name ? <span className="admin-sub">{t.full_name}</span> : null}</td>
            <td>{t.phone ?? "-"}</td>
            <td>{t.email ?? "-"}</td>
            <td>{dateTime(t.created_at)}</td>
            <td>{num(farmerCount.get(t.id) ?? 0)}</td>
            <td>{num(buyerCount.get(t.id) ?? 0)}</td>
            <td>{num(tradeCount.get(t.id) ?? 0)}</td>
            <td>{num(saleCount.get(t.id) ?? 0)}</td>
            <td>{money(purchaseValue.get(t.id) ?? 0)}</td>
            <td><Link className="admin-link" href={`${base}/trader/${t.id}`}>Open</Link></td>
          </tr>)}
          {traders.length === 0 ? <tr><td colSpan={10} className="admin-empty">No traders yet.</td></tr> : null}
        </tbody></table></div>
      </section>

      <section className="admin-panel">
        <h2>Farmer accounts ({farmerAccounts.length})</h2>
        <p className="admin-note">People who signed up with the farmer role. Traders add their own farmer contacts separately, shown inside each trader.</p>
        <div className="admin-table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Business / farm</th><th>Joined</th></tr></thead><tbody>
          {farmerAccounts.map((f) => <tr key={f.id}><td>{f.full_name ?? "-"}</td><td>{f.phone ?? "-"}</td><td>{f.email ?? "-"}</td><td>{f.business_name ?? "-"}</td><td>{dateTime(f.created_at)}</td></tr>)}
          {farmerAccounts.length === 0 ? <tr><td colSpan={5} className="admin-empty">No farmer accounts yet.</td></tr> : null}
        </tbody></table></div>
      </section>

      {others.length ? <section className="admin-panel">
        <h2>Other accounts ({others.length})</h2>
        <div className="admin-table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead><tbody>
          {others.map((o) => <tr key={o.id}><td>{o.full_name ?? "-"}</td><td>{o.phone ?? "-"}</td><td>{o.email ?? "-"}</td><td>{o.account_type ?? "not set"}</td><td>{dateTime(o.created_at)}</td></tr>)}
        </tbody></table></div>
      </section> : null}
    </main>
  );
}
