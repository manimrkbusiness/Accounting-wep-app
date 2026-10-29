"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../../supabaseClient";
import { useWorkspace } from "../../lib/workspace";
import { sumBy } from "../../lib/calc";
import { formatCurrency, formatDate, formatPurchaseId } from "../../lib/format";
import { employeeRoles, expenseCategories, type Expense } from "../../lib/types";
import { EmptyState } from "../../components/ui";

const categoryLabel = (value: string) => expenseCategories.find((c) => c.value === value)?.label ?? value;
const roleLabel = (value: string) => employeeRoles.find((r) => r.value === value)?.label ?? value;

export default function TeamDetailPage() {
  const ws = useWorkspace();
  const params = useParams<{ id: string }>();
  const employeeId = Number(params?.id);
  const employee = ws.employeeById.get(employeeId);

  // This team's wage/cost entries, newest first.
  const entries = useMemo(
    () => ws.expenses.filter((expense) => expense.employee_id === employeeId).slice().sort((a, b) => (a.expense_date < b.expense_date ? 1 : a.expense_date > b.expense_date ? -1 : b.id - a.id)),
    [ws.expenses, employeeId]
  );
  const total = sumBy(entries, (expense) => expense.amount);
  const pending = sumBy(entries.filter((expense) => !expense.paid), (expense) => expense.amount);
  const pendingEntries = entries.filter((expense) => !expense.paid);

  async function setPaid(expense: Expense, paid: boolean) {
    if (!ws.session) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("expenses").update({ paid, paid_at: paid ? new Date().toISOString() : null }).eq("id", expense.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify(paid ? "Marked as paid." : "Marked as pending.");
    await ws.refresh();
  }

  async function payAll() {
    if (!ws.session || pendingEntries.length === 0) return;
    if (!window.confirm(`Mark all ${pendingEntries.length} pending entries (${formatCurrency(pending)}) as paid?`)) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("expenses").update({ paid: true, paid_at: new Date().toISOString() }).in("id", pendingEntries.map((e) => e.id)).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify(`${pendingEntries.length} entries marked as paid.`);
    await ws.refresh();
  }

  function linkedTo(expense: Expense) {
    if (expense.purchase_id) return <Link className="chip" href={`/dashboard/purchases?focus=${expense.purchase_id}`}>{formatPurchaseId(expense.purchase_id)}</Link>;
    if (expense.harvesting_entry_id) return <Link className="chip" href="/dashboard/harvesting">Harvest</Link>;
    if (expense.sale_id) return <span className="chip">Sale</span>;
    if (expense.stock_entry_id) return <Link className="chip" href="/dashboard/stock">Stock</Link>;
    return <span className="muted-text">-</span>;
  }

  if (ws.status === "loading") return <p className="muted-text">Loading…</p>;
  if (!employee) return <div className="stack"><section className="ledger-panel"><p className="muted-text">This team or worker was not found. <Link className="link-button" href="/dashboard/team">Back to Team &amp; vehicles</Link></p></section></div>;

  return (
    <div className="stack">
      {ws.error ? <p className="error-message" role="alert">{ws.error}</p> : null}
      <section className="tool-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow"><Link className="link-button" href="/dashboard/team">← Team &amp; vehicles</Link></span>
            <h2>{employee.name}{!employee.active ? " (inactive)" : ""}</h2>
          </div>
          {pending > 0 ? <button className="primary-button" disabled={ws.saving} onClick={payAll} type="button">Mark all paid</button> : null}
        </div>
        <p className="muted-text">{[roleLabel(employee.role), employee.phone, Number(employee.daily_wage) > 0 ? `${formatCurrency(Number(employee.daily_wage))} / day` : null].filter(Boolean).join("  ·  ") || "—"}</p>
      </section>

      <section className="calculation-panel"><dl className="calculation-list">
        <div><dt>Total wages booked<small className="formula">{entries.length} entr{entries.length === 1 ? "y" : "ies"}</small></dt><dd>{formatCurrency(total)}</dd></div>
        <div className="calculation-credit"><dt>Paid</dt><dd>{formatCurrency(total - pending)}</dd></div>
        <div className={pending > 0 ? "calculation-deduction calculation-spent" : "calculation-credit"}><dt>Pending</dt><dd>{formatCurrency(pending)}</dd></div>
      </dl><p className="field-hint">Every wage booked to this team shows here. Mark each one Paid once you have actually handed over the money, or use &quot;Mark all paid&quot;.</p></section>

      <section className="ledger-panel">
        <div className="panel-heading"><div><span className="eyebrow">History</span><h2>Work &amp; payments</h2></div></div>
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Work</th><th>For</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>
          {entries.map((expense) => <tr key={expense.id}>
            <td>{formatDate(expense.expense_date)}</td>
            <td>{categoryLabel(expense.category)}{expense.description ? <span className="muted-text">{expense.description}</span> : null}</td>
            <td>{linkedTo(expense)}</td>
            <td className="amount-cell">{formatCurrency(Number(expense.amount))}</td>
            <td>{expense.paid ? <span className="chip good">Paid{expense.paid_at ? ` · ${formatDate(expense.paid_at)}` : ""}</span> : <span className="chip warn">Pending</span>}</td>
            <td><button className={expense.paid ? "secondary-button" : "primary-button"} disabled={ws.saving} onClick={() => setPaid(expense, !expense.paid)} type="button">{expense.paid ? "Mark pending" : "Mark paid"}</button></td>
          </tr>)}
        </tbody></table>{entries.length === 0 ? <EmptyState>No wages booked to this team yet. Harvesting, dehusking and loading wages appear here once recorded.</EmptyState> : null}</div>
      </section>
    </div>
  );
}
