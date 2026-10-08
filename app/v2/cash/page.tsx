"use client";

import { useMemo, useState } from "react";
import { Banknote, IndianRupee, Receipt, TrendingUp, Wallet } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { cashDirection, inRange, purchaseOutstanding, purchaseStatusWithout, saleOutstanding, saleStatusWithout, statusForBalance, summarizeCash } from "../lib/calc";
import { formatCurrency, formatDate, formatPurchaseId, formatSaleId, today, toNumber } from "../lib/format";
import { cashKinds, cashMethods, type CashEntry, type CashKind, type CashMethod } from "../lib/types";
import { EmptyState, KeyValueList, Metric, Panel, PeriodPicker, periodToRange, type PeriodPreset } from "../components/ui";

type CashForm = { entry_date: string; kind: CashKind; amount: string; method: CashMethod; farmer_id: string; buyer_id: string; purchase_id: string; sale_id: string; description: string };

const blank = (kind: CashKind = "capital_in"): CashForm => ({ entry_date: today(), kind, amount: "", method: "cash", farmer_id: "", buyer_id: "", purchase_id: "", sale_id: "", description: "" });

const kindLabel = (value: CashKind) => cashKinds.find((item) => item.value === value)?.label ?? value;

export default function CashPage() {
  const ws = useWorkspace();
  const [form, setForm] = useState<CashForm>(() => blank());
  const [period, setPeriod] = useState<{ preset: PeriodPreset; from: string; to: string }>({ preset: "all", from: "", to: today() });
  const range = periodToRange(period.preset, period.from, period.to);

  const position = useMemo(() => summarizeCash({ purchases: ws.purchases, sales: ws.sales, expenses: ws.expenses, cashEntries: ws.cashEntries, range: null }), [ws.purchases, ws.sales, ws.expenses, ws.cashEntries]);
  const periodPosition = useMemo(() => summarizeCash({ purchases: ws.purchases, sales: ws.sales, expenses: ws.expenses, cashEntries: ws.cashEntries, range }), [ws.purchases, ws.sales, ws.expenses, ws.cashEntries, range]);
  const rows = useMemo(() => ws.cashEntries.filter((entry) => inRange(entry.entry_date, range)), [ws.cashEntries, range]);
  const selectedKind = cashKinds.find((item) => item.value === form.kind);
  const openPurchases = ws.purchases.filter((purchase) => purchaseOutstanding(purchase, ws.cashEntries) > 0.005 && (!form.farmer_id || String(purchase.farmer_id) === form.farmer_id));
  const openSales = ws.sales.filter((sale) => saleOutstanding(sale, ws.cashEntries) > 0.005 && (!form.buyer_id || String(sale.buyer_id) === form.buyer_id));

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    const amount = toNumber(form.amount);
    if (amount <= 0) { ws.fail("Enter the amount."); return; }
    if (form.kind === "farmer_payment" && !form.farmer_id) { ws.fail("Choose the farmer who was paid."); return; }
    if (form.kind === "buyer_receipt" && !form.buyer_id) { ws.fail("Choose the buyer who paid."); return; }
    const purchase = form.purchase_id ? ws.purchaseById.get(Number(form.purchase_id)) : null;
    const sale = form.sale_id ? ws.saleById.get(Number(form.sale_id)) : null;
    if (form.kind === "farmer_payment" && purchase && amount > purchaseOutstanding(purchase, ws.cashEntries) + 0.005) { ws.fail(`Only ${formatCurrency(purchaseOutstanding(purchase, ws.cashEntries))} is outstanding on ${formatPurchaseId(purchase.id)}.`); return; }
    if (form.kind === "buyer_receipt" && sale && amount > saleOutstanding(sale, ws.cashEntries) + 0.005) { ws.fail(`Only ${formatCurrency(saleOutstanding(sale, ws.cashEntries))} is receivable on ${formatSaleId(sale.id)}.`); return; }
    ws.setSaving(true);
    const traderId = ws.session.user.id;
    const { error } = await supabase.from("cash_entries").insert({
      trader_id: traderId,
      entry_date: form.entry_date,
      kind: form.kind,
      amount,
      method: form.method,
      farmer_id: form.kind === "farmer_payment" && form.farmer_id ? Number(form.farmer_id) : null,
      buyer_id: form.kind === "buyer_receipt" && form.buyer_id ? Number(form.buyer_id) : null,
      purchase_id: form.kind === "farmer_payment" && purchase ? purchase.id : null,
      sale_id: form.kind === "buyer_receipt" && sale ? sale.id : null,
      description: form.description.trim() || null
    });
    if (!error && purchase && form.kind === "farmer_payment") await supabase.from("coconut_trades").update({ payment_status: statusForBalance(purchaseOutstanding(purchase, ws.cashEntries) - amount, true) }).eq("id", purchase.id).eq("trader_id", traderId);
    if (!error && sale && form.kind === "buyer_receipt") await supabase.from("sales").update({ payment_status: statusForBalance(saleOutstanding(sale, ws.cashEntries) - amount, true) }).eq("id", sale.id).eq("trader_id", traderId);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify(`${kindLabel(form.kind)} recorded.`);
    setForm(blank(form.kind));
    await ws.refresh();
  }

  async function remove(entry: CashEntry) {
    if (!ws.session || !window.confirm(`Delete this ${kindLabel(entry.kind).toLowerCase()} entry?`)) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const traderId = ws.session.user.id;
    const { error } = await supabase.from("cash_entries").delete().eq("id", entry.id).eq("trader_id", traderId);
    if (!error && entry.kind === "farmer_payment" && entry.purchase_id) {
      const purchase = ws.purchaseById.get(entry.purchase_id);
      if (purchase) await supabase.from("coconut_trades").update({ payment_status: purchaseStatusWithout(purchase, ws.cashEntries, entry.id) }).eq("id", purchase.id).eq("trader_id", traderId);
    }
    if (!error && entry.kind === "buyer_receipt" && entry.sale_id) {
      const sale = ws.saleById.get(entry.sale_id);
      if (sale) await supabase.from("sales").update({ payment_status: saleStatusWithout(sale, ws.cashEntries, entry.id) }).eq("id", sale.id).eq("trader_id", traderId);
    }
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify("Cash entry deleted. Linked purchase or sale balances are restored.");
    await ws.refresh();
  }

  return (
    <div className="stack">
      {!position.tracked ? <section className="mode-note">Cash in hand is not being tracked yet. Add an <strong>Opening cash</strong> entry with the money you have in hand today, and the cash book will follow every payment and receipt from there. You can skip this and still see purchases, sales, expenses and profit.</section> : null}
      <section className="metrics-grid wide">
        <Metric icon={Wallet} label={position.tracked ? "Cash in hand" : "Net cash movement"} value={formatCurrency(position.cashInHand)} hint="All time" tone={position.cashInHand >= 0 ? undefined : "negative"} />
        <Metric icon={TrendingUp} label="Capital in business" value={formatCurrency(position.capitalIn - position.capitalOut)} hint={`${formatCurrency(position.capitalIn)} added · ${formatCurrency(position.capitalOut)} withdrawn`} />
        <Metric icon={Banknote} label="Received from buyers" value={formatCurrency(position.receipts)} hint="Advances plus receipts" />
        <Metric icon={IndianRupee} label="Paid to farmers" value={formatCurrency(position.paymentsToFarmers)} hint="Advances plus settlements" />
        <Metric icon={Receipt} label="Expenses paid" value={formatCurrency(position.expensesPaid)} hint="From the Expenses page" />
      </section>

      <section className="workspace-grid">
        <form className="tool-panel" onSubmit={save}>
          <div className="panel-heading"><div><span className="eyebrow">Cash book</span><h2>Add a cash entry</h2></div></div>
          <div className="form-grid">
            <label>Entry type<select value={form.kind} onChange={(event) => setForm((current) => ({ ...blank(event.target.value as CashKind), entry_date: current.entry_date, amount: current.amount }))}>{cashKinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><span className="field-hint">{selectedKind?.hint}</span></label>
            <label>Date<input type="date" value={form.entry_date} onChange={(event) => setForm((current) => ({ ...current, entry_date: event.target.value }))} required /></label>
            <label>Amount (INR)<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} required /></label>
            <label>Method<select value={form.method} onChange={(event) => setForm((current) => ({ ...current, method: event.target.value as CashMethod }))}>{cashMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            {form.kind === "farmer_payment" ? <>
              <label>Farmer<select value={form.farmer_id} onChange={(event) => setForm((current) => ({ ...current, farmer_id: event.target.value, purchase_id: "" }))} required><option value="">Select farmer</option>{ws.farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name}</option>)}</select></label>
              <label>Against purchase <span className="optional">Optional</span><select value={form.purchase_id} onChange={(event) => setForm((current) => ({ ...current, purchase_id: event.target.value }))}><option value="">General payment to this farmer</option>{openPurchases.map((purchase) => <option key={purchase.id} value={purchase.id}>{formatPurchaseId(purchase.id)} · due {formatCurrency(purchaseOutstanding(purchase, ws.cashEntries))}</option>)}</select></label>
            </> : null}
            {form.kind === "buyer_receipt" ? <>
              <label>Buyer<select value={form.buyer_id} onChange={(event) => setForm((current) => ({ ...current, buyer_id: event.target.value, sale_id: "" }))} required><option value="">Select buyer</option>{ws.buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}</option>)}</select></label>
              <label>Against sale <span className="optional">Optional</span><select value={form.sale_id} onChange={(event) => setForm((current) => ({ ...current, sale_id: event.target.value }))}><option value="">General receipt from this buyer</option>{openSales.map((sale) => <option key={sale.id} value={sale.id}>{formatSaleId(sale.id)} · due {formatCurrency(saleOutstanding(sale, ws.cashEntries))}</option>)}</select></label>
            </> : null}
          </div>
          <label>Note <span className="optional">Optional</span><input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="What this money was for" /></label>
          <button className="primary-button" disabled={ws.saving} type="submit">{ws.saving ? "Saving..." : "Save entry"}</button>
        </form>
        <Panel eyebrow="Period movement" title={range ? `${formatDate(range.from)} to ${formatDate(range.to)}` : "All time"}>
          <PeriodPicker preset={period.preset} from={period.from} to={period.to} onChange={setPeriod} />
          <KeyValueList rows={[
            { label: "Capital added", value: formatCurrency(periodPosition.capitalIn), tone: "credit" },
            { label: "Received from buyers", value: formatCurrency(periodPosition.receipts), tone: "credit" },
            { label: "Other income", value: formatCurrency(periodPosition.otherIn), tone: "credit" },
            { label: "Paid to farmers", value: formatCurrency(periodPosition.paymentsToFarmers), tone: "debit" },
            { label: "Expenses paid", value: formatCurrency(periodPosition.expensesPaid), tone: "debit" },
            { label: "Capital withdrawn", value: formatCurrency(periodPosition.capitalOut), tone: "debit" },
            { label: "Other payments", value: formatCurrency(periodPosition.otherOut), tone: "debit" },
            { label: "Net movement", value: formatCurrency(periodPosition.cashInHand), tone: "total" }
          ]} />
          <p className="field-hint">Advances entered on purchases and sales are counted automatically. Expenses come from the Expenses page.</p>
        </Panel>
      </section>

      <section className="ledger-panel">
        <div className="panel-heading"><div><span className="eyebrow">Entries</span><h2>Cash book entries</h2></div></div>
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Linked to</th><th>Method</th><th>Note</th><th>In</th><th>Out</th><th>Actions</th></tr></thead><tbody>
          {rows.map((entry) => {
            const direction = cashDirection(entry.kind);
            const links = [
              entry.farmer_id ? ws.farmerById.get(entry.farmer_id)?.name : null,
              entry.buyer_id ? ws.buyerById.get(entry.buyer_id)?.name : null,
              entry.purchase_id ? formatPurchaseId(entry.purchase_id) : null,
              entry.sale_id ? formatSaleId(entry.sale_id) : null
            ].filter(Boolean);
            return <tr key={entry.id}><td>{formatDate(entry.entry_date)}</td><td>{kindLabel(entry.kind)}</td><td>{links.length ? <div className="chip-row">{links.map((link) => <span className="chip" key={String(link)}>{link}</span>)}</div> : <span className="muted-text">-</span>}</td><td>{cashMethods.find((item) => item.value === entry.method)?.label}</td><td>{entry.description || "-"}</td><td className="positive">{direction === "in" ? formatCurrency(Number(entry.amount)) : ""}</td><td className="balance-cell">{direction === "out" ? formatCurrency(Number(entry.amount)) : ""}</td><td><div className="row-actions"><button className="danger-button" disabled={ws.saving} onClick={() => remove(entry)} type="button">Delete</button></div></td></tr>;
          })}
        </tbody></table>{rows.length === 0 ? <EmptyState>No cash entries in this period.</EmptyState> : null}</div>
      </section>
    </div>
  );
}
