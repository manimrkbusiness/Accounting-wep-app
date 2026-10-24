"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ArrowLeftRight, Boxes, HardHat, LayoutDashboard, Leaf, LogOut, Package, Receipt, Settings, ShoppingCart, Sprout, Store, Trees, Truck, UsersRound, Wallet } from "lucide-react";
import { useWorkspace } from "../lib/workspace";
import { resumeHref, useDraftIndex } from "../lib/useDraft";
import { useLang } from "../../lib/i18n";

type NavItem = { href: string; label: string; short: string; icon: LucideIcon; description: string };

const navLabelKey: Record<string, string> = {
  "/v2": "nav.dashboard",
  "/v2/harvesting": "nav.harvesting",
  "/v2/purchases": "nav.purchases",
  "/v2/stock": "nav.stock",
  "/v2/sales": "nav.sales",
  "/v2/husk-purchases": "nav.huskPurchase",
  "/v2/husk-sales": "nav.huskSale",
  "/v2/farmers": "nav.farmers",
  "/v2/buyers": "nav.buyers",
  "/v2/team": "nav.team",
  "/v2/expenses": "nav.expenses",
  "/v2/transactions": "nav.transactions",
  "/v2/cash": "nav.cash",
  "/v2/settings": "nav.settings"
};

export const navItems: NavItem[] = [
  { href: "/v2", label: "Dashboard", short: "Home", icon: LayoutDashboard, description: "Profit, stock, cash and outstanding balances at a glance." },
  { href: "/v2/harvesting", label: "Coconut Harvesting", short: "Harvest", icon: Trees, description: "Harvesting teams, the coconuts they harvest each day, and the labor you pay them." },
  { href: "/v2/purchases", label: "Coconut purchases", short: "Buy", icon: ShoppingCart, description: "Coconut bought from farmers and what is still in stock." },
  { href: "/v2/stock", label: "Stock", short: "Stock", icon: Boxes, description: "Weigh per-nut purchases into stock so they can go into a lorry load." },
  { href: "/v2/sales", label: "Coconut sales", short: "Sell", icon: Truck, description: "Coconut loads sold to buyers." },
  { href: "/v2/husk-purchases", label: "Husk purchase", short: "Husk buy", icon: Leaf, description: "Husk bought straight from a farmer, without any coconut." },
  { href: "/v2/husk-sales", label: "Husk sale", short: "Husk sell", icon: Package, description: "Husk sold to buyers, from your coconut purchases or husk purchases." },
  { href: "/v2/farmers", label: "Farmers", short: "Farmers", icon: UsersRound, description: "Farmer contacts and their farming locations." },
  { href: "/v2/buyers", label: "Buyers", short: "Buyers", icon: Store, description: "Coconut and husk buyers you sell to." },
  { href: "/v2/team", label: "Team & vehicles", short: "Team", icon: HardHat, description: "Workers you pay and vehicles you run." },
  { href: "/v2/expenses", label: "Expenses", short: "Spend", icon: Receipt, description: "Labor, transport, diesel, food and other costs." },
  { href: "/v2/transactions", label: "Transactions", short: "Money", icon: ArrowLeftRight, description: "Every rupee in and out, day by day, across purchases, sales, expenses and the cash book." },
  { href: "/v2/cash", label: "Cash book", short: "Cash", icon: Wallet, description: "Capital, payments to farmers and receipts from buyers." },
  { href: "/v2/settings", label: "Settings", short: "Settings", icon: Settings, description: "Default purchase method, deduction rates, husk price and Kudume wastage." }
];

const subPages: Record<string, { label: string; description: string }> = {
  "/v2/purchases/new": { label: "New purchase", description: "Record coconut bought from a farmer. Costs are calculated for you." },
  "/v2/sales/new": { label: "New sale", description: "Pick the purchases going in this load, then enter the buyer and weighbridge details." },
  "/v2/husk-sales": { label: "Husk sale", description: "Pick the husk you are selling, then enter the buyer, rate and any delivery costs." },
  "/v2/husk-purchases": { label: "Husk purchase", description: "Record husk bought straight from a farmer, without any coconut." },
  "/v2/account": { label: "Account", description: "Your profile, business details and subscription." }
};

function pageMeta(pathname: string) {
  if (subPages[pathname]) return subPages[pathname];
  const match = navItems.find((item) => item.href !== "/v2" && pathname.startsWith(item.href)) ?? navItems[0];
  return { label: match.label, description: match.description, href: match.href };
}

function isActive(pathname: string, href: string) {
  if (href === "/v2") return pathname === "/v2";
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
    "/v2/purchases": resumeHref(drafts, "purchase", "/v2/purchases/new"),
    "/v2/sales": resumeHref(drafts, "sale", "/v2/sales/new"),
    "/v2/husk-sales": drafts.some((draft) => draft.form === "husk-sale") ? "/v2/husk-sales" : null,
    "/v2/husk-purchases": drafts.some((draft) => draft.form === "husk-purchase") ? "/v2/husk-purchases" : null,
    "/v2/stock": drafts.some((draft) => draft.form === "stock") ? "/v2/stock" : null
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
        <div className="sidebar-account" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}><div style={{ display: "grid", gap: 2, minWidth: 0 }}><span className="eyebrow">Signed in as</span><strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.business_name || profile?.full_name}</strong><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.email}</span></div><Link href="/v2/account" title="Account & subscription" aria-label="Account settings" style={{ flexShrink: 0, color: "inherit", display: "inline-flex", padding: 6, borderRadius: 8 }}><Settings size={18} strokeWidth={2.2} aria-hidden="true" /></Link></div>
        <button className="secondary-button sidebar-signout" onClick={() => void signOut()} type="button"><LogOut size={17} strokeWidth={2.2} aria-hidden="true" />Sign out</button>
      </aside>

      <section className="app-main">
        <header className="topbar">
          <div><span className="eyebrow">Coconut Trade Desk</span><h1>{"href" in meta && meta.href && navLabelKey[meta.href] ? t(navLabelKey[meta.href]) : meta.label}</h1><p>{meta.description}</p></div>
          <div className="topbar-actions"><button className="secondary-button topbar-signout" onClick={() => void signOut()} type="button">Sign out</button></div>
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
