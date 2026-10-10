"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowLeftRight, Boxes, HardHat, LayoutDashboard, LogOut, Receipt, Settings, ShoppingCart, Sprout, Store, Trees, Truck, UsersRound, Wallet } from "lucide-react";
import { useWorkspace } from "../lib/workspace";
import { resumeHref, useDraftIndex } from "../lib/useDraft";

type NavItem = { href: string; label: string; short: string; icon: LucideIcon; description: string };

export const navItems: NavItem[] = [
  { href: "/v2", label: "Dashboard", short: "Home", icon: LayoutDashboard, description: "Profit, stock, cash and outstanding balances at a glance." },
  { href: "/v2/purchases", label: "Purchases", short: "Buy", icon: ShoppingCart, description: "Coconut bought from farmers and what is still in stock." },
  { href: "/v2/stock", label: "Stock", short: "Stock", icon: Boxes, description: "Weigh per-nut purchases into stock so they can go into a lorry load." },
  { href: "/v2/harvesting", label: "Coconut Harvesting", short: "Harvest", icon: Trees, description: "Harvesting teams, the coconuts they harvest each day, and the labor you pay them." },
  { href: "/v2/sales", label: "Sales", short: "Sell", icon: Truck, description: "Coconut loads and husk sold to buyers." },
  { href: "/v2/farmers", label: "Farmers", short: "Farmers", icon: UsersRound, description: "Farmer contacts and their farming locations." },
  { href: "/v2/buyers", label: "Buyers", short: "Buyers", icon: Store, description: "Coconut and husk buyers you sell to." },
  { href: "/v2/expenses", label: "Expenses", short: "Spend", icon: Receipt, description: "Labor, transport, diesel, food and other costs." },
  { href: "/v2/transactions", label: "Transactions", short: "Money", icon: ArrowLeftRight, description: "Every rupee in and out, day by day, across purchases, sales, expenses and the cash book." },
  { href: "/v2/cash", label: "Cash book", short: "Cash", icon: Wallet, description: "Capital, payments to farmers and receipts from buyers." },
  { href: "/v2/team", label: "Team & vehicles", short: "Team", icon: HardHat, description: "Workers you pay and vehicles you run." },
  { href: "/v2/settings", label: "Settings", short: "Settings", icon: Settings, description: "Default purchase method, deduction rates, husk price and Kudume wastage." }
];

const subPages: Record<string, { label: string; description: string }> = {
  "/v2/purchases/new": { label: "New purchase", description: "Record coconut bought from a farmer. Costs are calculated for you." },
  "/v2/sales/new": { label: "New sale", description: "Pick the purchases going in this load, then enter the buyer and weighbridge details." }
};

function pageMeta(pathname: string) {
  if (subPages[pathname]) return subPages[pathname];
  const match = navItems.find((item) => item.href !== "/v2" && pathname.startsWith(item.href)) ?? navItems[0];
  return { label: match.label, description: match.description };
}

function isActive(pathname: string, href: string) {
  if (href === "/v2") return pathname === "/v2";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const workspace = useWorkspace();
  const { status, profile, message, error, signOut } = workspace;
  const drafts = useDraftIndex(workspace.session?.user.id);

  // While an entry is unsaved, its sidebar item reopens that entry instead of the list.
  const resumeTargets: Record<string, string | null> = {
    "/v2/purchases": resumeHref(drafts, "purchase", "/v2/purchases/new"),
    "/v2/sales": resumeHref(drafts, "sale", "/v2/sales/new"),
    "/v2/stock": drafts.some((draft) => draft.form === "stock") ? "/v2/stock" : null
  };
  const hrefFor = (item: NavItem) => resumeTargets[item.href] ?? item.href;
  const hasDraft = (item: NavItem) => Boolean(resumeTargets[item.href]);

  if (status === "loading") {
    return <main className="page-shell"><section className="auth-panel loading-panel"><span className="eyebrow">Version 2 workspace</span><h1>Loading workspace</h1><p>Connecting to your private trader records.</p></section></main>;
  }
  if (status === "signed-out") {
    return <main className="page-shell"><section className="auth-panel"><span className="eyebrow">Version 2 workspace</span><h1>Sign in required</h1><p>Version 2 uses the same account as Version 1. Sign in first, then open Version 2 from the home page.</p><a className="primary-button" href="/">Go to sign in</a></section></main>;
  }
  if (status === "no-profile") {
    return <main className="page-shell"><section className="auth-panel"><span className="eyebrow">Version 2 workspace</span><h1>Finish your profile first</h1><p>Choose your workspace type on the home page, then come back to Version 2.</p><a className="primary-button" href="/">Go to home</a></section></main>;
  }
  if (status === "not-trader") {
    return <main className="page-shell"><section className="auth-panel"><span className="eyebrow">Version 2 workspace</span><h1>Trader workspace only</h1><p>Version 2 is being tested with trader accounts first. Farmer accounts keep using the current workspace.</p><a className="primary-button" href="/dashboard">Back to workspace</a></section></main>;
  }

  const meta = pageMeta(pathname);

  return (
    <main className="authenticated-shell v2-shell">
      <aside className="desktop-sidebar">
        <div className="sidebar-brand"><div className="brand-lockup"><span className="brand-mark"><Sprout size={21} strokeWidth={2.4} aria-hidden="true" /></span><div><strong>COCONUT TRADE DESK</strong><span>Version 2 preview</span></div></div></div>
        <nav className="sidebar-nav" aria-label="Version 2 navigation">
          {navItems.map((item) => { const Icon = item.icon; const active = isActive(pathname, item.href); return <Link className={active ? "active" : ""} href={hrefFor(item)} key={item.href} aria-current={active ? "page" : undefined} title={hasDraft(item) ? "Opens your unsaved entry" : undefined}><Icon size={18} strokeWidth={2.2} aria-hidden="true" /><span>{item.label}</span>{hasDraft(item) ? <em className="nav-draft">Unsaved</em> : null}</Link>; })}
          <Link className="v2-back-link" href="/dashboard"><ArrowLeft size={18} strokeWidth={2.2} aria-hidden="true" /><span>Back to Version 1</span></Link>
        </nav>
        <div className="sidebar-account"><span className="eyebrow">Signed in as</span><strong>{profile?.business_name || profile?.full_name}</strong><span>{profile?.email}</span></div>
        <button className="secondary-button sidebar-signout" onClick={() => void signOut()} type="button"><LogOut size={17} strokeWidth={2.2} aria-hidden="true" />Sign out</button>
      </aside>

      <section className="app-main">
        <header className="topbar">
          <div><span className="eyebrow">Version 2 preview</span><h1>{meta.label}</h1><p>{meta.description}</p></div>
          <div className="topbar-actions"><Link className="secondary-button topbar-v1" href="/dashboard"><ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" />Version 1</Link><button className="secondary-button topbar-signout" onClick={() => void signOut()} type="button">Sign out</button></div>
        </header>
        <nav className="mobile-section-nav" aria-label="Mobile navigation">
          {navItems.map((item) => { const Icon = item.icon; const active = isActive(pathname, item.href); return <Link className={active ? "active" : ""} href={hrefFor(item)} key={item.href} aria-current={active ? "page" : undefined}><Icon size={16} strokeWidth={2.2} aria-hidden="true" /><span>{item.short}</span>{hasDraft(item) ? <em className="nav-draft">•</em> : null}</Link>; })}
        </nav>
        {error ? <p className="error-message">{error}</p> : null}
        {message ? <p className="status-message">{message}</p> : null}
        {children}
      </section>
    </main>
  );
}
