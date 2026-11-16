"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, CirclePlus, Store, TrendingUp, Truck, Wallet } from "lucide-react";
import { useWorkspace } from "./lib/workspace";
import { purchaseOutstanding, saleOutstanding, summarizeFinancials } from "./lib/calc";
import { formatCurrency, today } from "./lib/format";
import { Metric, Panel, PeriodPicker, periodToRange, type PeriodPreset } from "./components/ui";

export default function DashboardPage() {
  const ws = useWorkspace();
  const [period, setPeriod] = useState<{ preset: PeriodPreset; from: string; to: string }>({ preset: "all", from: "", to: today() });
  const range = periodToRange(period.preset, period.from, period.to);

  const summary = useMemo(() => summarizeFinancials({ purchases: ws.purchases, sales: ws.sales, saleItems: ws.saleItems, expenses: ws.expenses, cashEntries: ws.cashEntries, range, stockEntries: ws.stockEntries, stockEntryItems: ws.stockEntryItems, stockWastage: ws.stockWastage, wastageSales: ws.wastageSales }), [ws.purchases, ws.sales, ws.saleItems, ws.expenses, ws.cashEntries, range, ws.stockEntries, ws.stockEntryItems, ws.stockWastage, ws.wastageSales]);

  // Profit on the coconut itself: the margin after cost of sold, wastage loss and any wasted-nut sales.
  const coconutProfit = summary.coconutMargin - summary.wastageLoss + summary.wastageSalesIncome;

  // Pending money: what buyers still owe us (receivables) and what we still owe farmers, teams and
  // for diesel/other costs (payables). The full breakdown lives on /dashboard/pending.
  const receivableTotal = useMemo(() => ws.sales.reduce((sum, sale) => sum + Math.max(saleOutstanding(sale, ws.cashEntries), 0), 0), [ws.sales, ws.cashEntries]);
  const farmerPayable = useMemo(() => ws.purchases.reduce((sum, purchase) => sum + Math.max(purchaseOutstanding(purchase, ws.cashEntries), 0), 0), [ws.purchases, ws.cashEntries]);
  const expensePayable = useMemo(() => ws.expenses.filter((expense) => !expense.paid).reduce((sum, expense) => sum + Number(expense.amount), 0), [ws.expenses]);
  const payableTotal = farmerPayable + expensePayable;

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
        <div className="summary-list">
          <div><span>Receivables</span><strong>From buyers (coconut + husk)</strong><span className="positive">{formatCurrency(receivableTotal)}</span></div>
          <div><span>Payables — farmers</span><strong>Farmer balances</strong><span className="balance-cell">{formatCurrency(farmerPayable)}</span></div>
          <div><span>Payables — laborers, diesel &amp; costs</span><strong>Unpaid expenses</strong><span className="balance-cell">{formatCurrency(expensePayable)}</span></div>
          <div><span>Total you owe</span><strong>Farmers + costs</strong><span className="balance-cell">{formatCurrency(payableTotal)}</span></div>
        </div>
        <p className="field-hint">One place to collect from buyers and pay farmers, teams and diesel / other costs — with the same payment options you already use.</p>
      </Panel>
    </div>
  );
}
