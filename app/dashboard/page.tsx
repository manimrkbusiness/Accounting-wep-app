"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, CalendarClock, CirclePlus, HandCoins, Package, Store, TrendingUp, Truck, Wallet } from "lucide-react";
import { useWorkspace } from "./lib/workspace";
import { purchaseOutstanding, saleOutstanding, summarizeFinancials } from "./lib/calc";
import { dueLabel, dueReminders, harvestReminders } from "./lib/reminders";
import { defaultSettings } from "./components/CostSettingsPanel";
import { formatCurrency, formatDate, today } from "./lib/format";
import { EmptyState, Metric, Panel, PeriodPicker, periodToRange, type PeriodPreset } from "./components/ui";

export default function DashboardPage() {
  const ws = useWorkspace();
  const [period, setPeriod] = useState<{ preset: PeriodPreset; from: string; to: string }>({ preset: "all", from: "", to: today() });
  const range = periodToRange(period.preset, period.from, period.to);

  const summary = useMemo(() => summarizeFinancials({ purchases: ws.purchases, sales: ws.sales, saleItems: ws.saleItems, expenses: ws.expenses, cashEntries: ws.cashEntries, range, stockEntries: ws.stockEntries, stockEntryItems: ws.stockEntryItems, stockWastage: ws.stockWastage, wastageSales: ws.wastageSales }), [ws.purchases, ws.sales, ws.saleItems, ws.expenses, ws.cashEntries, range, ws.stockEntries, ws.stockEntryItems, ws.stockWastage, ws.wastageSales]);

  // Profit on the coconut itself: the margin after cost of sold, wastage loss and any wasted-nut sales.
  const coconutProfit = summary.coconutMargin - summary.wastageLoss + summary.wastageSalesIncome;

  // Pending money: receivables from buyers (split coconut vs husk) and payables (farmers + unpaid
  // labour/fuel/costs). The full breakdown and payment actions live on /dashboard/pending.
  const receivableCoconut = useMemo(() => ws.sales.filter((sale) => sale.sale_kind !== "husk").reduce((sum, sale) => sum + Math.max(saleOutstanding(sale, ws.cashEntries), 0), 0), [ws.sales, ws.cashEntries]);
  const receivableHusk = useMemo(() => ws.sales.filter((sale) => sale.sale_kind === "husk").reduce((sum, sale) => sum + Math.max(saleOutstanding(sale, ws.cashEntries), 0), 0), [ws.sales, ws.cashEntries]);
  const farmerPayable = useMemo(() => ws.purchases.reduce((sum, purchase) => sum + Math.max(purchaseOutstanding(purchase, ws.cashEntries), 0), 0), [ws.purchases, ws.cashEntries]);
  const expensePayable = useMemo(() => ws.expenses.filter((expense) => !expense.paid).reduce((sum, expense) => sum + Number(expense.amount), 0), [ws.expenses]);

  // Farmers whose next harvest falls due within 3 days (or is overdue) — the next-few-days schedule.
  const upcomingHarvest = useMemo(() => dueReminders(harvestReminders(ws.farmers, ws.harvestingEntries, ws.settings ?? defaultSettings, today())), [ws.farmers, ws.harvestingEntries, ws.settings]);

  return (
    <div className="stack">
      <section className="welcome-band">
        <div><span className="eyebrow">Trader overview</span><h2>Buy from farmers, sell by the load, keep every rupee tracked.</h2><p>Tap any profit below to open its sales. Pending payments shows who still owes you and who you still owe.</p></div>
        <div className="page-actions"><Link className="primary-button" href="/dashboard/purchases/new"><CirclePlus size={18} strokeWidth={2.2} aria-hidden="true" />Record purchase</Link><Link className="secondary-button" href="/dashboard/sales/new"><Truck size={18} strokeWidth={2.2} aria-hidden="true" />Record sale</Link></div>
      </section>

      <PeriodPicker preset={period.preset} from={period.from} to={period.to} onChange={setPeriod} />

      <section className="metrics-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <Metric icon={TrendingUp} label="Net profit" value={formatCurrency(summary.netProfit)} hint={`Coconut + husk profit, minus ${formatCurrency(summary.expensesTotal)} expenses. Tap for the full ledger.`} tone={summary.netProfit >= 0 ? "positive" : "negative"} href="/dashboard/ledger" />
        <Metric icon={Truck} label="Profit from coconut" value={formatCurrency(coconutProfit)} hint="Coconut sales minus their cost. Tap for coconut sales." tone={coconutProfit >= 0 ? "positive" : "negative"} href="/dashboard/sales" />
        <Metric icon={Store} label="Profit from husk" value={formatCurrency(summary.huskProfit)} hint="Husk sales minus husk cost. Tap for husk sales." tone={summary.huskProfit >= 0 ? "positive" : "negative"} href="/dashboard/husk-sales" />
      </section>

      <section>
        <Link className="secondary-button" href="/dashboard/ledger"><ArrowLeftRight size={16} strokeWidth={2.2} aria-hidden="true" />Open complete transaction ledger (coconut + husk)</Link>
      </section>

      <Panel eyebrow="Pending payments" title="Receivables and payables" action={<Link className="primary-button" href="/dashboard/pending"><Wallet size={18} strokeWidth={2.2} aria-hidden="true" />Open pending payments</Link>}>
        <div className="metrics-grid pending-metrics" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Metric icon={Truck} label="Receive · Coconut buyers" value={formatCurrency(receivableCoconut)} hint="Tap to view all and record a receipt." tone="positive" href="/dashboard/pending?tab=receivables" />
          <Metric icon={Package} label="Receive · Husk buyers" value={formatCurrency(receivableHusk)} hint="Tap to view all and record a receipt." tone="positive" href="/dashboard/pending?tab=receivables" />
          <Metric icon={HandCoins} label="Pay · Farmers" value={formatCurrency(farmerPayable)} hint="Tap to view all and pay a farmer." href="/dashboard/pending?tab=payables" />
          <Metric icon={Wallet} label="Pay · Laborers & fuel" value={formatCurrency(expensePayable)} hint="Tap to view all and mark paid." href="/dashboard/pending?tab=payables" />
        </div>
        <p className="field-hint">Receivables are split by coconut and husk buyers; payables cover farmers and your unpaid laborers, fuel and other costs. Tap any box to open it and settle.</p>
      </Panel>

      <Panel eyebrow="Harvesting schedule" title="Upcoming coconut harvest — next 3 days" action={<Link className="secondary-button" href="/dashboard/reminders"><CalendarClock size={16} strokeWidth={2.2} aria-hidden="true" />Open harvest reminders</Link>}>
        {upcomingHarvest.length ? <div className="summary-list">{upcomingHarvest.slice(0, 10).map((reminder) => <div key={reminder.farmer.id}><span>{reminder.dueDate ? formatDate(reminder.dueDate) : "—"}</span><strong>{reminder.farmer.name}</strong><span className={reminder.status === "overdue" || reminder.status === "due" ? "balance-cell" : "muted-text"}>{dueLabel(reminder)}</span></div>)}</div> : <EmptyState>No harvests due in the next 3 days — you&apos;re all caught up.</EmptyState>}
        <p className="field-hint">Farmers whose last harvest plus their cycle is due within 3 days (or already overdue), so you can line up the harvesting team. Open harvest reminders to WhatsApp them.</p>
      </Panel>
    </div>
  );
}
