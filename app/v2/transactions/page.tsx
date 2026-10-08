"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowDownToLine, ArrowUpFromLine, Wallet } from "lucide-react";
import { useWorkspace } from "../lib/workspace";
import { inRange, summarizeCash } from "../lib/calc";
import { bucketTransactions, buildTransactions, transactionKinds, type TransactionKind } from "../lib/transactions";
import { formatCurrency, formatDate, today } from "../lib/format";
import { EmptyState, KeyValueList, Metric, Panel, PeriodPicker, periodToRange, type PeriodPreset } from "../components/ui";

export default function TransactionsPage() {
  const ws = useWorkspace();
  const [period, setPeriod] = useState<{ preset: PeriodPreset; from: string; to: string }>({ preset: "month", from: "", to: today() });
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [kind, setKind] = useState<"" | TransactionKind>("");
  const [search, setSearch] = useState("");
  const range = periodToRange(period.preset, period.from, period.to);

  const allTransactions = useMemo(() => buildTransactions({ purchases: ws.purchases, sales: ws.sales, expenses: ws.expenses, cashEntries: ws.cashEntries, farmerById: ws.farmerById, buyerById: ws.buyerById, employeeById: ws.employeeById }), [ws.purchases, ws.sales, ws.expenses, ws.cashEntries, ws.farmerById, ws.buyerById, ws.employeeById]);
  const periodTransactions = useMemo(() => allTransactions.filter((row) => inRange(row.date, range)), [allTransactions, range]);
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return periodTransactions.filter((row) => {
      if (direction !== "all" && row.direction !== direction) return false;
      if (kind && row.kind !== kind) return false;
      if (!query) return true;
      return `${row.label} ${row.counterparty} ${row.reference ?? ""} ${row.description ?? ""} ${row.method ?? ""}`.toLowerCase().includes(query);
    });
  }, [periodTransactions, direction, kind, search]);

  const moneyIn = periodTransactions.filter((row) => row.direction === "in").reduce((sum, row) => sum + row.amount, 0);
  const moneyOut = periodTransactions.filter((row) => row.direction === "out").reduce((sum, row) => sum + row.amount, 0);
  const todayRows = allTransactions.filter((row) => row.date === today());
  const todayIn = todayRows.filter((row) => row.direction === "in").reduce((sum, row) => sum + row.amount, 0);
  const todayOut = todayRows.filter((row) => row.direction === "out").reduce((sum, row) => sum + row.amount, 0);
  const cash = useMemo(() => summarizeCash({ purchases: ws.purchases, sales: ws.sales, expenses: ws.expenses, cashEntries: ws.cashEntries, range: null }), [ws.purchases, ws.sales, ws.expenses, ws.cashEntries]);
  const buckets = useMemo(() => bucketTransactions(periodTransactions, range), [periodTransactions, range]);
  const chartMax = Math.max(1, ...buckets.map((bucket) => Math.max(bucket.moneyIn, bucket.moneyOut)));

  const breakdown = (dir: "in" | "out") => transactionKinds
    .filter((item) => item.direction === dir)
    .map((item) => ({ label: item.label, value: formatCurrency(periodTransactions.filter((row) => row.kind === item.value).reduce((sum, row) => sum + row.amount, 0)) }))
    .filter((entry) => entry.value !== formatCurrency(0));

  const groupedRows = useMemo(() => {
    const groups: Array<{ date: string; moneyIn: number; moneyOut: number; items: typeof rows }> = [];
    rows.forEach((row) => {
      let group = groups[groups.length - 1];
      if (!group || group.date !== row.date) {
        group = { date: row.date, moneyIn: 0, moneyOut: 0, items: [] };
        groups.push(group);
      }
      if (row.direction === "in") group.moneyIn += row.amount; else group.moneyOut += row.amount;
      group.items.push(row);
    });
    return groups;
  }, [rows]);

  const chronological = useMemo(() => [...rows].reverse(), [rows]);
  const runningByKey = useMemo(() => {
    const map = new Map<string, number>();
    let running = 0;
    chronological.forEach((row) => {
      running += row.direction === "in" ? row.amount : -row.amount;
      map.set(row.key, running);
    });
    return map;
  }, [chronological]);

  return (
    <div className="stack">
      <section className="metrics-grid wide">
        <Metric icon={ArrowDownToLine} label="Money in" value={formatCurrency(moneyIn)} hint={range ? `${formatDate(range.from)} to ${formatDate(range.to)}` : "All time"} tone="positive" />
        <Metric icon={ArrowUpFromLine} label="Money out" value={formatCurrency(moneyOut)} hint={`${periodTransactions.length} transactions in this period`} tone="negative" />
        <Metric icon={Activity} label="Net movement" value={formatCurrency(moneyIn - moneyOut)} hint={`Today: in ${formatCurrency(todayIn)} · out ${formatCurrency(todayOut)}`} tone={moneyIn - moneyOut >= 0 ? "positive" : "negative"} />
        <Metric icon={Wallet} label={cash.tracked ? "Cash in hand" : "Net cash movement"} value={formatCurrency(cash.cashInHand)} hint={cash.tracked ? "All time, after every entry" : "Add opening cash in the cash book to track cash in hand"} />
      </section>

      <section className="dashboard-grid">
        <Panel eyebrow="Daily flow" title="Money in versus money out" action={<div className="flow-legend"><span><i className="in"></i>In</span><span><i className="out"></i>Out</span></div>}>
          <PeriodPicker preset={period.preset} from={period.from} to={period.to} onChange={setPeriod} />
          {buckets.length ? <div className="flow-chart"><div className="flow-chart-bars">{buckets.map((bucket) => <div className="flow-slot" key={bucket.key} title={`${bucket.label}: in ${formatCurrency(bucket.moneyIn)}, out ${formatCurrency(bucket.moneyOut)}`}><div className="flow-pair"><div className="flow-bar in" style={{ height: `${Math.max(bucket.moneyIn / chartMax * 100, bucket.moneyIn > 0 ? 3 : 1)}%` }}></div><div className="flow-bar out" style={{ height: `${Math.max(bucket.moneyOut / chartMax * 100, bucket.moneyOut > 0 ? 3 : 1)}%` }}></div></div><small>{bucket.label}</small></div>)}</div></div> : <EmptyState>No transactions in this period yet.</EmptyState>}
          <p className="field-hint">Advances on purchases and sales, farmer payments, buyer receipts, expenses and cash book entries are all included. Bars group by day, week or month depending on the period length.</p>
        </Panel>
        <div className="side-stack">
          <Panel eyebrow="Where money came from" title="Money in by type">{breakdown("in").length ? <KeyValueList rows={breakdown("in")} /> : <EmptyState>Nothing received in this period.</EmptyState>}</Panel>
          <Panel eyebrow="Where money went" title="Money out by type">{breakdown("out").length ? <KeyValueList rows={breakdown("out")} /> : <EmptyState>Nothing paid in this period.</EmptyState>}</Panel>
        </div>
      </section>

      <section className="ledger-panel">
        <div className="panel-heading"><div><span className="eyebrow">History</span><h2>Transaction history</h2></div><div className="page-actions"><Link className="secondary-button" href="/v2/expenses">Add expense</Link><Link className="secondary-button" href="/v2/cash">Add cash entry</Link></div></div>
        <div className="filter-bar">
          <label>Direction<select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}><option value="all">In and out</option><option value="in">Money in</option><option value="out">Money out</option></select></label>
          <label>Type<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="">All types</option>{transactionKinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="search-field">Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Farmer, buyer, worker, PUR-000012, note..." /></label>
        </div>
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Who</th><th>Reference</th><th>Method</th><th>Note</th><th>In</th><th>Out</th><th>Running net</th></tr></thead><tbody>
          {groupedRows.map((group) => <GroupRows key={group.date} group={group} runningByKey={runningByKey} />)}
        </tbody></table>{rows.length === 0 ? <EmptyState>No transactions match these filters.</EmptyState> : null}</div>
      </section>
    </div>
  );
}

function GroupRows({ group, runningByKey }: { group: { date: string; moneyIn: number; moneyOut: number; items: ReturnType<typeof buildTransactions> }; runningByKey: Map<string, number> }) {
  return (
    <>
      <tr className="day-row"><td colSpan={6}>{formatDate(group.date)}</td><td className="positive">{group.moneyIn > 0 ? formatCurrency(group.moneyIn) : ""}</td><td className="balance-cell">{group.moneyOut > 0 ? formatCurrency(group.moneyOut) : ""}</td><td></td></tr>
      {group.items.map((row) => <tr key={row.key}>
        <td>{formatDate(row.date)}</td>
        <td><span className={`chip ${row.direction === "in" ? "good" : "warn"}`}>{row.label}</span></td>
        <td>{row.counterparty}</td>
        <td>{row.reference && row.href ? <Link href={row.href}>{row.reference}</Link> : row.reference ?? "-"}</td>
        <td>{row.method ?? "-"}</td>
        <td>{row.description ?? "-"}</td>
        <td className="positive">{row.direction === "in" ? formatCurrency(row.amount) : ""}</td>
        <td className="balance-cell">{row.direction === "out" ? formatCurrency(row.amount) : ""}</td>
        <td className={(runningByKey.get(row.key) ?? 0) >= 0 ? "amount-cell" : "balance-cell"}>{formatCurrency(runningByKey.get(row.key) ?? 0)}</td>
      </tr>)}
    </>
  );
}
