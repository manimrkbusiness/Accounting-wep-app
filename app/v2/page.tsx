"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Banknote, Boxes, CirclePlus, IndianRupee, Receipt, Store, TrendingUp, Truck, UsersRound, Wallet } from "lucide-react";
import { useWorkspace } from "./lib/workspace";
import { huskPiecesInHand, purchaseOutstanding, saleOutstanding, summarizeCash, summarizeFinancials } from "./lib/calc";
import { daysBetween, formatCurrency, formatDate, formatNumber, formatPurchaseId, formatSaleId, today } from "./lib/format";
import { EmptyState, KeyValueList, Metric, Panel, PeriodPicker, periodToRange, type PeriodPreset } from "./components/ui";

export default function DashboardPage() {
  const ws = useWorkspace();
  const [period, setPeriod] = useState<{ preset: PeriodPreset; from: string; to: string }>({ preset: "all", from: "", to: today() });
  const range = periodToRange(period.preset, period.from, period.to);

  const summary = useMemo(() => summarizeFinancials({ purchases: ws.purchases, sales: ws.sales, saleItems: ws.saleItems, expenses: ws.expenses, cashEntries: ws.cashEntries, range, stockEntries: ws.stockEntries, stockEntryItems: ws.stockEntryItems, stockWastage: ws.stockWastage }), [ws.purchases, ws.sales, ws.saleItems, ws.expenses, ws.cashEntries, range, ws.stockEntries, ws.stockEntryItems, ws.stockWastage]);
  const cash = useMemo(() => summarizeCash({ purchases: ws.purchases, sales: ws.sales, expenses: ws.expenses, cashEntries: ws.cashEntries, range: null }), [ws.purchases, ws.sales, ws.expenses, ws.cashEntries]);

  const stockRows = useMemo(() => Array.from(ws.stock.values()).filter((info) => info.remainingPieces > 0.5).sort((a, b) => a.purchase.trade_date.localeCompare(b.purchase.trade_date)), [ws.stock]);
  const farmerDues = useMemo(() => {
    const totals = new Map<number, number>();
    ws.purchases.forEach((purchase) => {
      const due = purchaseOutstanding(purchase, ws.cashEntries);
      if (due > 0.005) totals.set(purchase.farmer_id, (totals.get(purchase.farmer_id) ?? 0) + due);
    });
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [ws.purchases, ws.cashEntries]);
  const buyerDues = useMemo(() => {
    const totals = new Map<number, number>();
    ws.sales.forEach((sale) => {
      const due = saleOutstanding(sale, ws.cashEntries);
      if (due > 0.005) totals.set(sale.buyer_id, (totals.get(sale.buyer_id) ?? 0) + due);
    });
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [ws.sales, ws.cashEntries]);
  const recentSales = ws.sales.slice(0, 5);
  const now = today();

  return (
    <div className="stack">
      <section className="welcome-band">
        <div><span className="eyebrow">Trader overview</span><h2>Buy from farmers, sell by the load, keep every rupee tracked.</h2><p>Record purchases, group them into loads for buyers, log expenses and payments, and the profit is calculated for you.</p></div>
        <div className="page-actions"><Link className="primary-button" href="/v2/purchases/new"><CirclePlus size={18} strokeWidth={2.2} aria-hidden="true" />Record purchase</Link><Link className="secondary-button" href="/v2/sales/new"><Truck size={18} strokeWidth={2.2} aria-hidden="true" />Record sale</Link></div>
      </section>

      <PeriodPicker preset={period.preset} from={period.from} to={period.to} onChange={setPeriod} />

      <section className="metrics-grid wide">
        <Metric icon={TrendingUp} label="Net profit" value={formatCurrency(summary.netProfit)} hint="Sales minus cost of sold coconut, husk cost and expenses" tone={summary.netProfit >= 0 ? "positive" : "negative"} />
        <Metric icon={Truck} label="Coconut sales" value={formatCurrency(summary.coconutRevenue)} hint={`${formatNumber(summary.soldPieces, 0)} pieces sold`} />
        <Metric icon={IndianRupee} label="Cost of sold coconut" value={formatCurrency(summary.coconutCostOfSold)} hint={`Margin ${formatCurrency(summary.coconutMargin)}`} />
        <Metric icon={Receipt} label="Expenses" value={formatCurrency(summary.expensesTotal)} hint="Labor, transport, diesel, food and more" />
        <Metric icon={Store} label="Husk profit" value={formatCurrency(summary.huskProfit)} hint={`Husk sales ${formatCurrency(summary.huskRevenue)} · husk from ${formatNumber(huskPiecesInHand(ws.purchases, ws.sales), 0)} pieces in hand`} tone={summary.huskProfit >= 0 ? "positive" : "negative"} />
      </section>

      <section className="metrics-grid wide">
        <Metric icon={Boxes} label="Stock in hand" value={`${formatNumber(summary.stockPieces, 0)} pieces`} hint={`Worth ${formatCurrency(summary.stockValue)} at cost${summary.stockKg > 0 ? ` · about ${formatNumber(summary.stockKg, 0)} kg` : ""}`} />
        <Metric icon={UsersRound} label="Payable to farmers" value={formatCurrency(summary.payableToFarmers)} hint="After advances and settlements" />
        <Metric icon={Banknote} label="Receivable from buyers" value={formatCurrency(summary.receivableFromBuyers)} hint="After advances and receipts" />
        <Metric icon={Wallet} label={cash.tracked ? "Cash in hand" : "Net cash movement"} value={formatCurrency(cash.cashInHand)} hint={cash.tracked ? "Capital plus receipts minus payments" : "Add opening cash in the cash book to track cash in hand"} tone={cash.cashInHand >= 0 ? undefined : "negative"} />
      </section>

      <section className="dashboard-grid">
        <Panel eyebrow="Profit and loss" title={range ? `${formatDate(range.from)} to ${formatDate(range.to)}` : "All time"}>
          <KeyValueList rows={[
            { label: "Coconut sales to buyers", value: formatCurrency(summary.coconutRevenue), tone: "credit" },
            { label: "Cost of coconut sold", value: formatCurrency(summary.coconutCostOfSold), tone: "debit", hint: "Farmer payable for the pieces in sold loads, excluding husk credit" },
            { label: "Wastage loss", value: formatCurrency(summary.wastageLoss), tone: "debit", hint: `${formatNumber(summary.wastedPieces, 0)} pieces marked wasted, at their coconut cost` },
            { label: "Coconut margin", value: formatCurrency(summary.coconutMargin - summary.wastageLoss), tone: "total" },
            { label: "Husk sales", value: formatCurrency(summary.huskRevenue), tone: "credit" },
            { label: "Husk credit paid to farmers", value: formatCurrency(summary.huskCreditPaid), tone: "debit", hint: "Weight-based purchases only" },
            { label: "Husk expenses", value: formatCurrency(summary.huskExpenses), tone: "debit" },
            { label: "Husk profit", value: formatCurrency(summary.huskProfit), tone: "total" },
            { label: "Operating expenses", value: formatCurrency(summary.operatingExpenses), tone: "debit" },
            { label: "Net profit", value: formatCurrency(summary.netProfit), tone: "total" }
          ]} />
          <p className="field-hint">Purchases in this period: {formatCurrency(summary.purchasesTotal)} for {formatNumber(summary.purchasesPieces, 0)} pieces. Labor deducted from farmers: {formatCurrency(summary.laborDeductedFromFarmers)} (record the wages you actually paid in Expenses).</p>
        </Panel>
        <div className="side-stack">
          <Panel eyebrow="Where money went" title="Expenses by type">
            {summary.expensesByCategory.length ? <KeyValueList rows={summary.expensesByCategory.map((entry) => ({ label: entry.label, value: formatCurrency(entry.amount) }))} /> : <EmptyState>No expenses recorded for this period.</EmptyState>}
            <Link className="secondary-button" href="/v2/expenses"><Receipt size={16} strokeWidth={2.2} aria-hidden="true" />Add expense</Link>
          </Panel>
          <Panel eyebrow="Latest" title="Recent sales">
            {recentSales.length ? <div className="summary-list">{recentSales.map((sale) => <div key={sale.id}><span>{formatSaleId(sale.id)}</span><strong>{ws.buyerById.get(sale.buyer_id)?.name ?? "Buyer"}</strong><span>{formatCurrency(Number(sale.total_amount))}</span></div>)}</div> : <EmptyState>No sales yet. Create a load from your purchases.</EmptyState>}
          </Panel>
        </div>
      </section>

      <section className="ledger-panel">
        <div className="panel-heading"><div><span className="eyebrow">Stock ageing</span><h2>Purchases still in stock</h2></div><Link className="secondary-button" href="/v2/sales/new">Sell from stock</Link></div>
        <p className="muted-text">Coconut waits here until it is allocated to a sale. Older stock is listed first.</p>
        <div className="table-wrap"><table><thead><tr><th>Purchase</th><th>Farmer</th><th>Bought on</th><th>Days in stock</th><th>Remaining</th><th>Value at cost</th></tr></thead><tbody>
          {stockRows.map((info) => <tr key={info.purchase.id}><td><Link href={`/v2/purchases?focus=${info.purchase.id}`}>{formatPurchaseId(info.purchase.id)}</Link><span className="muted-text">{info.purchase.coconut_color} · {info.purchase.purchase_mode === "quantity" ? "Per nut" : info.purchase.processing_type}</span></td><td>{ws.farmerById.get(info.purchase.farmer_id)?.name ?? "Farmer"}</td><td>{formatDate(info.purchase.trade_date)}</td><td>{daysBetween(info.purchase.trade_date, now)} days</td><td>{formatNumber(info.remainingPieces, 0)} / {formatNumber(Number(info.purchase.coconut_quantity), 0)} pieces{info.remainingKg > 0 ? <span className="muted-text">about {formatNumber(info.remainingKg, 0)} kg</span> : null}{info.awaitingStockPieces > 0.5 ? <Link className="chip warn" href={`/v2/stock?purchase=${info.purchase.id}`}>{formatNumber(info.awaitingStockPieces, 0)} to weigh</Link> : null}</td><td className="amount-cell">{formatCurrency(info.remainingValue)}</td></tr>)}
        </tbody></table>{stockRows.length === 0 ? <EmptyState>Everything purchased has been sold.</EmptyState> : null}</div>
      </section>

      <section className="dashboard-grid">
        <Panel eyebrow="Outstanding" title="Farmers to pay">
          {farmerDues.length ? <div className="summary-list">{farmerDues.map(([farmerId, due]) => <div key={farmerId}><span>Farmer</span><strong>{ws.farmerById.get(farmerId)?.name ?? "Farmer"}</strong><span className="balance-cell">{formatCurrency(due)}</span></div>)}</div> : <EmptyState>All farmer balances are settled.</EmptyState>}
          <Link className="secondary-button" href="/v2/purchases">Record a farmer payment</Link>
        </Panel>
        <Panel eyebrow="Outstanding" title="Buyers to collect from">
          {buyerDues.length ? <div className="summary-list">{buyerDues.map(([buyerId, due]) => <div key={buyerId}><span>Buyer</span><strong>{ws.buyerById.get(buyerId)?.name ?? "Buyer"}</strong><span className="positive">{formatCurrency(due)}</span></div>)}</div> : <EmptyState>No money pending from buyers.</EmptyState>}
          <Link className="secondary-button" href="/v2/sales">Record a buyer receipt</Link>
        </Panel>
      </section>
    </div>
  );
}
