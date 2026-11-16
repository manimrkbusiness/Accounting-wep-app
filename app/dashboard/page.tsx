"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, CirclePlus, Store, TrendingUp, Truck } from "lucide-react";
import { useWorkspace } from "./lib/workspace";
import { purchaseOutstanding, saleOutstanding, summarizeFinancials } from "./lib/calc";
import { formatCurrency, today } from "./lib/format";
import { EmptyState, Metric, Panel, PeriodPicker, periodToRange, type PeriodPreset } from "./components/ui";

export default function DashboardPage() {
  const ws = useWorkspace();
  const [period, setPeriod] = useState<{ preset: PeriodPreset; from: string; to: string }>({ preset: "all", from: "", to: today() });
  const range = periodToRange(period.preset, period.from, period.to);

  const summary = useMemo(() => summarizeFinancials({ purchases: ws.purchases, sales: ws.sales, saleItems: ws.saleItems, expenses: ws.expenses, cashEntries: ws.cashEntries, range, stockEntries: ws.stockEntries, stockEntryItems: ws.stockEntryItems, stockWastage: ws.stockWastage, wastageSales: ws.wastageSales }), [ws.purchases, ws.sales, ws.saleItems, ws.expenses, ws.cashEntries, range, ws.stockEntries, ws.stockEntryItems, ws.stockWastage, ws.wastageSales]);

  // Profit on the coconut itself: the margin after cost of sold, wastage loss and any wasted-nut sales.
  const coconutProfit = summary.coconutMargin - summary.wastageLoss + summary.wastageSalesIncome;

  const farmerDues = useMemo(() => {
    const totals = new Map<number, number>();
    ws.purchases.forEach((purchase) => {
      const due = purchaseOutstanding(purchase, ws.cashEntries);
      if (due > 0.005) totals.set(purchase.farmer_id, (totals.get(purchase.farmer_id) ?? 0) + due);
    });
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [ws.purchases, ws.cashEntries]);

  const buyerDues = useMemo(() => {
    const totals = new Map<number, number>();
    ws.sales.forEach((sale) => {
      const due = saleOutstanding(sale, ws.cashEntries);
      if (due > 0.005) totals.set(sale.buyer_id, (totals.get(sale.buyer_id) ?? 0) + due);
    });
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [ws.sales, ws.cashEntries]);

  const totalFarmerDue = farmerDues.reduce((sum, [, due]) => sum + due, 0);
  const totalBuyerDue = buyerDues.reduce((sum, [, due]) => sum + due, 0);

  return (
    <div className="stack">
      <section className="welcome-band">
        <div><span className="eyebrow">Trader overview</span><h2>Buy from farmers, sell by the load, keep every rupee tracked.</h2><p>Tap any profit below to open its sales. The two boxes show who still owes you and who you still owe.</p></div>
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

      <section className="dashboard-grid">
        <Panel eyebrow="Outstanding" title={`Pending to farmers${totalFarmerDue > 0 ? ` — ${formatCurrency(totalFarmerDue)}` : ""}`}>
          {farmerDues.length ? <div className="summary-list">{farmerDues.map(([farmerId, due]) => <div key={farmerId}><span>Farmer</span><strong>{ws.farmerById.get(farmerId)?.name ?? "Farmer"}</strong><span className="balance-cell">{formatCurrency(due)}</span></div>)}</div> : <EmptyState>All farmer balances are settled.</EmptyState>}
          <p className="field-hint">Record a payment on the Farmer purchase page to clear a farmer from this list.</p>
          <Link className="secondary-button" href="/dashboard/purchases">Go to farmer purchases</Link>
        </Panel>
        <Panel eyebrow="Outstanding" title={`Pending from buyers${totalBuyerDue > 0 ? ` — ${formatCurrency(totalBuyerDue)}` : ""}`}>
          {buyerDues.length ? <div className="summary-list">{buyerDues.map(([buyerId, due]) => <div key={buyerId}><span>Buyer</span><strong>{ws.buyerById.get(buyerId)?.name ?? "Buyer"}</strong><span className="positive">{formatCurrency(due)}</span></div>)}</div> : <EmptyState>No money pending from buyers.</EmptyState>}
          <p className="field-hint">Use “Receive payment” on a sale to mark a buyer paid and clear them from this list.</p>
          <Link className="secondary-button" href="/dashboard/ledger">Go to sales ledger</Link>
        </Panel>
      </section>
    </div>
  );
}
