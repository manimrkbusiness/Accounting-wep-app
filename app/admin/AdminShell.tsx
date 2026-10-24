"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "./actions";

/** Sidebar + content frame for the authed control panel. `base` is the panel's public path. */
export function AdminShell({ base, children }: { base: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const usersHref = `${base}/users`;
  const items = [
    { href: base, label: "Dashboard", active: pathname === base },
    { href: usersHref, label: "Users", active: pathname === usersHref || pathname.startsWith(`${usersHref}/`) }
  ];
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-brand"><span className="admin-eyebrow">Coconut Trade Desk</span><strong>Control panel</strong></div>
        <nav className="admin-nav">
          {items.map((item) => <Link key={item.href} href={item.href} className={item.active ? "active" : ""}>{item.label}</Link>)}
        </nav>
        <form action={logout} className="admin-sidebar-foot"><input type="hidden" name="base" value={base} /><button className="admin-ghost" type="submit">Lock panel</button></form>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
