"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { money, num } from "../lib/format";
import type { SubTone } from "../lib/format";

export type UserRow = {
  id: string;
  name: string;
  business: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
  joined: string;
  subLabel: string;
  subTone: SubTone;
  farmers: number;
  buyers: number;
  purchases: number;
  sales: number;
  purchaseValue: number;
};

export function UsersTable({ base, users }: { base: string; users: UserRow[] }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"all" | "trader" | "farmer" | "other">("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (role === "trader" && u.role !== "trader") return false;
      if (role === "farmer" && u.role !== "farmer") return false;
      if (role === "other" && (u.role === "trader" || u.role === "farmer")) return false;
      if (!q) return true;
      return `${u.name} ${u.business ?? ""} ${u.phone ?? ""} ${u.email ?? ""}`.toLowerCase().includes(q);
    });
  }, [users, query, role]);

  return (
    <section className="admin-panel">
      <div className="admin-filter">
        <input className="admin-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, business, phone or email" />
        <div className="admin-segmented">
          {(["all", "trader", "farmer", "other"] as const).map((value) => (
            <button key={value} className={role === value ? "active" : ""} onClick={() => setRole(value)} type="button">{value === "all" ? "All" : value[0].toUpperCase() + value.slice(1) + (value === "other" ? "" : "s")}</button>
          ))}
        </div>
        <span className="admin-count">{num(rows.length)} shown</span>
      </div>
      <div className="admin-table-wrap"><table><thead><tr><th>Name / business</th><th>Phone</th><th>Email</th><th>Role</th><th>Subscription</th><th>Farmers</th><th>Buyers</th><th>Purchases</th><th>Sales</th><th>Purchase value</th><th></th></tr></thead><tbody>
        {rows.map((u) => <tr key={u.id}>
          <td><strong>{u.business || u.name || "—"}</strong>{u.business && u.name ? <span className="admin-sub">{u.name}</span> : null}</td>
          <td>{u.phone ?? "-"}</td>
          <td>{u.email ?? "-"}</td>
          <td>{u.role ?? "not set"}</td>
          <td>{u.role === "trader" ? <span className={`admin-tag ${u.subTone}`}>{u.subLabel}</span> : "-"}</td>
          <td>{num(u.farmers)}</td>
          <td>{num(u.buyers)}</td>
          <td>{num(u.purchases)}</td>
          <td>{num(u.sales)}</td>
          <td>{money(u.purchaseValue)}</td>
          <td><Link className="admin-link" href={`${base}/users/${u.id}`}>Open</Link></td>
        </tr>)}
        {rows.length === 0 ? <tr><td colSpan={11} className="admin-empty">No users match.</td></tr> : null}
      </tbody></table></div>
    </section>
  );
}
