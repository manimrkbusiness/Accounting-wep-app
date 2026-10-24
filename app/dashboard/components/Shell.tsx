"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ArrowLeftRight, Boxes, HardHat, LayoutDashboard, Leaf, LogOut, Package, Receipt, Settings, ShoppingCart, Sprout, Store, Trees, Truck, UserCog, UsersRound, Wallet } from "lucide-react";
import { useWorkspace } from "../lib/workspace";
import { resumeHref, useDraftIndex } from "../lib/useDraft";
import { useLang } from "../../lib/i18n";
import { NotificationsBell } from "./NotificationsBell";

type NavItem = { href: string; label: string; short: string; icon: LucideIcon; description: string };

const navLabelKey: Record<string, string> = {
  "/dashboard": "nav.dashboard",
  "/dashboard/harvesting": "nav.harvesting",
  "/dashboard/purchases": "nav.purchases",
  "/dashboard/stock": "nav.stock",
  "/dashboard/sales": "nav.sales",
  "/dashboard/husk-purchases": "nav.huskPurchase",
  "/dashboard/husk-sales": "nav.huskSale",
  "/dashboard/farmers": "nav.farmers",
  "/dashboard/buyers": "nav.buyers",
  "/dashboard/team": "nav.team",
  "/dashboard/expenses": "nav.expenses",
  "/dashboard/transactions": "nav.transactions",
  "/dashboard/cash": "nav.cash",
  "/dashboard/settings": "nav.settings"
};

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard, description: "Profit, stock, cash and outstanding balances at a glance." },
  { href: "/dashboard/harvesting", label: "Coconut Harvesting", short: "Harvest", icon: Trees, description: "Harvesting teams, the coconuts they harvest each day, and the labor you pay them." },
  { href: "/dashboard/purchases", label: "Coconut purchases", short: "Buy", icon: ShoppingCart, description: "Coconut bought from farmers and what is still in stock." },
  { href: "/dashboard/stock", label: "Stock", short: "Stock", icon: Boxes, description: "Weigh per-nut purchases into stock so they can go into a lorry load." },
  { href: "/dashboard/sales", label: "Coconut sales", short: "Sell", icon: Truck, description: "Coconut loads sold to buyers." },
  { href: "/dashboard/husk-purchases", label: "Husk purchase", short: "Husk buy", icon: Leaf, description: "Husk bought straight from a farmer, without any coconut." },
  { href: "/dashboard/husk-sales", label: "Husk sale", short: "Husk sell", icon: Package, description: "Husk sold to buyers, from your coconut purchases or husk purchases." },
  { href: "/dashboard/farmers", label: "Farmers", short: "Farmers", icon: UsersRound, description: "Farmer contacts and their farming locations." },
  { href: "/dashboard/buyers", label: "Buyers", short: "Buyers", icon: Store, description: "Coconut and husk buyers you sell to." },
  { href: "/dashboard/team", label: "Team & vehicles", short: "Team", icon: HardHat, description: "Workers you pay and vehicles you run." },
  { href: "/dashboard/expenses", label: "Expenses", short: "Spend", icon: Receipt, description: "Labor, transport, diesel, food and other costs." },
  { href: "/dashboard/transactions", label: "Transactions", short: "Money", icon: ArrowLeftRight, description: "Every rupee in and out, day by day, across purchases, sales, expenses and the cash book." },
  { href: "/dashboard/cash", label: "Cash book", short: "Cash", icon: Wallet, description: "Capital, payments to farmers and receipts from buyers." },
  { href: "/dashboard/settings", label: "Settings", short: "Settings", icon: Settings, description: "Default purchase method, deduction rates, husk price and Kudume wastage." }
];

const subPages: Record<string, { label: string; description: string }> = {
  "/dashboard/purchases/new": { label: "New purchase", description: "Record coconut bought from a farmer. Costs are calculated for you." },
  "/dashboard/sales/new": { label: "New sale", description: "Pick the purchases going in this load, then enter the buyer and weighbridge details." },
  "/dashboard/husk-sales": { label: "Husk sale", description: "Pick the husk you are selling, then enter the buyer, rate and any delivery costs." },
  "/dashboard/husk-purchases": { label: "Husk purchase", description: "Record husk bought straight from a farmer, without any coconut." },
  "/dashboard/account": { label: "Account", description: "Your profile, business details and subscription." }
};

function pageMeta(pathname: string) {
  if (subPages[pathname]) return subPages[pathname];
  const match = navItems.find((item) => item.href !== "/dashboard" && pathname.startsWith(item.href)) ?? navItems[0];
  return { label: match.label, description: match.description, href: match.href };
}

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const workspace = useWorkspace();
  const { status, profile, message, signOut } = workspace;
  const drafts = useDraftIndex(workspace.session?.user.id);
  const { t } = useLang();
  const navLabel = (item: NavItem) => (navLabelKey[item.href] ? t(navLabelKey[item.href]) : item.label);

  // While an entry is unsaved, its sidebar item reopens that entry instead of the list.
  const resumeTargets: Record<string, string | null> = {
    "/dashboard/purchases": resumeHref(drafts, "purchase", "/dashboard/purchases/new"),
    "/dashboard/sales": resumeHref(drafts, "sale", "/dashboard/sales/new"),
    "/dashboard/husk-sales": drafts.some((draft) => draft.form === "husk-sale") ? "/dashboard/husk-sales" : null,
    "/dashboard/husk-purchases": drafts.some((draft) => draft.form === "husk-purchase") ? "/dashboard/husk-purchases" : null,
    "/dashboard/stock": drafts.some((draft) => draft.form === "stock") ? "/dashboard/stock" : null
  };
  const hrefFor = (item: NavItem) => resumeTargets[item.href] ?? item.href;
  const hasDraft = (item: NavItem) => Boolean(resumeTargets[item.href]);

  if (status === "loading") {
    return <main className="page-shell"><section className="auth-panel loading-panel"><span className="eyebrow">Coconut Trade Desk</span><h1>Loading workspace</h1><p>Connecting to your private trader records.</p></section></main>;
  }
  if (status === "signed-out") {
    return <main className="page-shell"><section className="auth-panel"><span className="eyebrow">Coconut Trade Desk</span><h1>Sign in required</h1><p>Sign in to open your private trader workspace.</p><a className="primary-button" href="/login">Go to sign in</a></section></main>;
  }
  if (status === "no-profile") {
    return <main className="page-shell"><section className="auth-panel"><span className="eyebrow">Coconut Trade Desk</span><h1>Finish your profile first</h1><p>Choose your workspace type to continue.</p><a className="primary-button" href="/login">Continue</a></section></main>;
  }
  if (status === "not-trader") {
    return <main className="page-shell"><section className="auth-panel"><span className="eyebrow">Coconut Trade Desk</span><h1>Trader workspace only</h1><p>This workspace is for trader accounts.</p><button className="primary-button" onClick={() => void signOut()} type="button">Sign out</button></section></main>;
  }

  const meta = pageMeta(pathname);

  return (
    <main className="authenticated-shell v2-shell">
      <aside className="desktop-sidebar">
        <div className="sidebar-brand"><div className="brand-lockup"><span className="brand-mark"><Sprout size={21} strokeWidth={2.4} aria-hidden="true" /></span><div><strong>COCONUT TRADE DESK</strong><span>Trader workspace</span></div></div></div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navItems.map((item) => { const Icon = item.icon; const active = isActive(pathname, item.href); return <Link className={active ? "active" : ""} href={hrefFor(item)} key={item.href} aria-current={active ? "page" : undefined} title={hasDraft(item) ? "Opens your unsaved entry" : undefined}><Icon size={18} strokeWidth={2.2} aria-hidden="true" /><span>{navLabel(item)}</span>{hasDraft(item) ? <em className="nav-draft">Unsaved</em> : null}</Link>; })}
        </nav>
        <div className="sidebar-account" style={{ display: "grid", gap: 8 }}><div style={{ display: "grid", gap: 2, minWidth: 0 }}><span className="eyebrow">Signed in as</span><strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.business_name || profile?.full_name}</strong><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.email}</span></div><Link href="/dashboard/account" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line-strong)", color: "inherit", fontWeight: 600, fontSize: "0.85rem", textDecoration: "none" }}><UserCog size={16} strokeWidth={2.2} aria-hidden="true" />Account &amp; settings</Link></div>
        <button className="secondary-button sidebar-signout" onClick={() => void signOut()} type="button"><LogOut size={17} strokeWidth={2.2} aria-hidden="true" />Sign out</button>
      </aside>

      <section className="app-main">
        <header className="topbar">
          <div><span className="eyebrow">Coconut Trade Desk</span><h1>{"href" in meta && meta.href && navLabelKey[meta.href] ? t(navLabelKey[meta.href]) : meta.label}</h1><p>{meta.description}</p></div>
          <div className="topbar-actions" style={{ display: "flex", alignItems: "center", gap: 10 }}><NotificationsBell /><button className="secondary-button topbar-signout" onClick={() => void signOut()} type="button">Sign out</button></div>
        </header>
        <nav className="mobile-section-nav" aria-label="Mobile navigation">
          {navItems.map((item) => { const Icon = item.icon; const active = isActive(pathname, item.href); return <Link className={active ? "active" : ""} href={hrefFor(item)} key={item.href} aria-current={active ? "page" : undefined}><Icon size={16} strokeWidth={2.2} aria-hidden="true" /><span>{navLabel(item)}</span>{hasDraft(item) ? <em className="nav-draft">•</em> : null}</Link>; })}
        </nav>
        {message ? <p className="status-message">{message}</p> : null}
        {children}
      </section>
    </main>
  );
}
