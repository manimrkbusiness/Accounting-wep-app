import { ADMIN_CONFIGURED, adminBase, isAuthed, serviceClient } from "../lib/service";
import { AdminGate } from "../AdminGate";
import { AdminShell } from "../AdminShell";
import { subState, type SubRow } from "../lib/format";
import { UsersTable, type UserRow } from "./UsersTable";

export const dynamic = "force-dynamic";

type Profile = { id: string; full_name: string | null; phone: string | null; email: string | null; account_type: string | null; business_name: string | null; created_at: string };
type Row = { trader_id: string };

export default async function AdminUsers() {
  const base = await adminBase();
  if (!(ADMIN_CONFIGURED && (await isAuthed()))) return <AdminGate configured={ADMIN_CONFIGURED} base={base} />;

  const supabase = serviceClient();
  const [profilesRes, subsRes, farmersRes, buyersRes, tradesRes, salesRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone, email, account_type, business_name, created_at").order("created_at", { ascending: false }),
    supabase.from("subscriptions").select("trader_id, status, trial_ends_at, current_period_end"),
    supabase.from("trader_farmers").select("trader_id"),
    supabase.from("buyers").select("trader_id"),
    supabase.from("coconut_trades").select("trader_id, total_amount"),
    supabase.from("sales").select("trader_id")
  ]);

  const profiles = (profilesRes.data ?? []) as Profile[];
  const subBy = new Map(((subsRes.data ?? []) as SubRow[]).map((s) => [s.trader_id, s]));
  const countBy = (rows: Row[] | null) => {
    const map = new Map<string, number>();
    (rows ?? []).forEach((row) => map.set(row.trader_id, (map.get(row.trader_id) ?? 0) + 1));
    return map;
  };
  const farmerCount = countBy(farmersRes.data as Row[] | null);
  const buyerCount = countBy(buyersRes.data as Row[] | null);
  const tradeCount = countBy(tradesRes.data as Row[] | null);
  const saleCount = countBy(salesRes.data as Row[] | null);
  const purchaseValue = new Map<string, number>();
  ((tradesRes.data ?? []) as (Row & { total_amount: number })[]).forEach((row) => purchaseValue.set(row.trader_id, (purchaseValue.get(row.trader_id) ?? 0) + Number(row.total_amount)));

  const users: UserRow[] = profiles.map((p) => {
    const st = subState(subBy.get(p.id));
    return {
      id: p.id,
      name: p.full_name ?? "",
      business: p.business_name,
      phone: p.phone,
      email: p.email,
      role: p.account_type,
      joined: p.created_at,
      subLabel: st.label,
      subTone: st.tone,
      farmers: farmerCount.get(p.id) ?? 0,
      buyers: buyerCount.get(p.id) ?? 0,
      purchases: tradeCount.get(p.id) ?? 0,
      sales: saleCount.get(p.id) ?? 0,
      purchaseValue: purchaseValue.get(p.id) ?? 0
    };
  });

  return (
    <AdminShell base={base}>
      <header className="admin-top">
        <div><span className="admin-eyebrow">Accounts</span><h1>Users ({users.length})</h1><p>Search for any account, then open it to see everything they have.</p></div>
      </header>
      <UsersTable base={base} users={users} />
    </AdminShell>
  );
}
