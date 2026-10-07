"use client";

import { useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { inRange, sumBy } from "../lib/calc";
import { formatCurrency, formatDate, formatPurchaseId, formatSaleId, today, toNumber } from "../lib/format";
import { expenseCategories, expenseScopes, type Expense, type ExpenseCategory, type ExpenseScope } from "../lib/types";
import { EmptyState, KeyValueList, Panel, PeriodPicker, periodToRange, type PeriodPreset } from "../components/ui";

type ExpenseForm = { id?: number; expense_date: string; category: ExpenseCategory; scope: ExpenseScope; amount: string; employee_id: string; vehicle_id: string; purchase_id: string; sale_id: string; description: string };

const blank = (): ExpenseForm => ({ expense_date: today(), category: "harvesting_labor", scope: "coconut", amount: "", employee_id: "", vehicle_id: "", purchase_id: "", sale_id: "", description: "" });

const categoryLabel = (value: ExpenseCategory) => expenseCategories.find((item) => item.value === value)?.label ?? value;

export default function ExpensesPage() {
  const ws = useWorkspace();
  const [form, setForm] = useState<ExpenseForm>(blank);
  const [period, setPeriod] = useState<{ preset: PeriodPreset; from: string; to: string }>({ preset: "month", from: "", to: today() });
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const range = periodToRange(period.preset, period.from, period.to);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ws.expenses.filter((expense) => {
      if (!inRange(expense.expense_date, range)) return false;
      if (categoryFilter && expense.category !== categoryFilter) return false;
      if (!query) return true;
      const employee = expense.employee_id ? ws.employeeById.get(expense.employee_id)?.name ?? "" : "";
      const vehicle = expense.vehicle_id ? ws.vehicleById.get(expense.vehicle_id)?.vehicle_number ?? "" : "";
      return `${categoryLabel(expense.category)} ${employee} ${vehicle} ${expense.description ?? ""}`.toLowerCase().includes(query);
    });
  }, [ws.expenses, ws.employeeById, ws.vehicleById, range, categoryFilter, search]);

  const totals = useMemo(() => expenseCategories.map((category) => ({ label: category.label, value: formatCurrency(sumBy(rows.filter((expense) => expense.category === category.value), (expense) => expense.amount)) })).filter((entry) => entry.value !== formatCurrency(0)), [rows]);
  const total = sumBy(rows, (expense) => expense.amount);
  const showEmployee = ["harvesting_labor", "dehusking_labor", "loading_labor", "food", "other"].includes(form.category);
  const showVehicle = ["transport", "diesel", "vehicle_maintenance", "loading_labor", "other"].includes(form.category);

  function edit(expense: Expense) {
    setForm({ id: expense.id, expense_date: expense.expense_date, category: expense.category, scope: expense.scope, amount: String(expense.amount), employee_id: expense.employee_id ? String(expense.employee_id) : "", vehicle_id: expense.vehicle_id ? String(expense.vehicle_id) : "", purchase_id: expense.purchase_id ? String(expense.purchase_id) : "", sale_id: expense.sale_id ? String(expense.sale_id) : "", description: expense.description ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    const amount = toNumber(form.amount);
    if (amount <= 0) { ws.fail("Enter the expense amount."); return; }
    ws.setSaving(true);
    const payload = { trader_id: ws.session.user.id, expense_date: form.expense_date, category: form.category, scope: form.scope, amount, employee_id: form.employee_id ? Number(form.employee_id) : null, vehicle_id: form.vehicle_id ? Number(form.vehicle_id) : null, purchase_id: form.purchase_id ? Number(form.purchase_id) : null, sale_id: form.sale_id ? Number(form.sale_id) : null, description: form.description.trim() || null };
    const result = form.id ? await supabase.from("expenses").update(payload).eq("id", form.id).eq("trader_id", ws.session.user.id) : await supabase.from("expenses").insert(payload);
    ws.setSaving(false);
    if (result.error) { ws.fail(result.error.message); return; }
    ws.notify(form.id ? "Expense updated." : "Expense recorded.");
    setForm(blank());
    await ws.refresh();
  }

  async function remove(expense: Expense) {
    if (!ws.session || !window.confirm("Delete this expense?")) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error } = await supabase.from("expenses").delete().eq("id", expense.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify("Expense deleted.");
    await ws.refresh();
  }

  const selectedCategory = expenseCategories.find((item) => item.value === form.category);

  return (
    <div className="stack">
      <section className="workspace-grid">
        <form className="tool-panel" onSubmit={save}>
          <div className="panel-heading"><div><span className="eyebrow">{form.id ? "Edit expense" : "New expense"}</span><h2>{form.id ? "Update expense" : "Record an expense"}</h2></div>{form.id ? <button className="link-button" onClick={() => setForm(blank())} type="button">Cancel edit</button> : null}</div>
          <p className="muted-text">Wages, transport, diesel, maintenance, food and anything else you pay for. Link it to a worker, vehicle, purchase or sale when it helps you track it.</p>
          <div className="form-grid">
            <label>Date<input type="date" value={form.expense_date} onChange={(event) => setForm((current) => ({ ...current, expense_date: event.target.value }))} required /></label>
            <label>Type<select value={form.category} onChange={(event) => { const category = event.target.value as ExpenseCategory; const scope = expenseCategories.find((item) => item.value === category)?.defaultScope ?? "general"; setForm((current) => ({ ...current, category, scope })); }}>{expenseCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><span className="field-hint">{selectedCategory?.hint}</span></label>
            <label>Amount (INR)<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} required /></label>
            <label>Counts towards<select value={form.scope} onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value as ExpenseScope }))}>{expenseScopes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><span className="field-hint">Husk expenses reduce husk profit; the rest reduce coconut profit.</span></label>
            {showEmployee ? <label>Worker <span className="optional">Optional</span><select value={form.employee_id} onChange={(event) => setForm((current) => ({ ...current, employee_id: event.target.value }))}><option value="">Not linked to a worker</option>{ws.employees.filter((employee) => employee.active || String(employee.id) === form.employee_id).map((employee) => <option key={employee.id} value={employee.id}>{employee.name} ({employee.role})</option>)}</select></label> : null}
            {showVehicle ? <label>Vehicle <span className="optional">Optional</span><select value={form.vehicle_id} onChange={(event) => setForm((current) => ({ ...current, vehicle_id: event.target.value }))}><option value="">Not linked to a vehicle</option>{ws.vehicles.filter((vehicle) => vehicle.active || String(vehicle.id) === form.vehicle_id).map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicle_number}</option>)}</select></label> : null}
            <label>Purchase <span className="optional">Optional</span><select value={form.purchase_id} onChange={(event) => setForm((current) => ({ ...current, purchase_id: event.target.value }))}><option value="">Not linked to a purchase</option>{ws.purchases.slice(0, 100).map((purchase) => <option key={purchase.id} value={purchase.id}>{formatPurchaseId(purchase.id)} · {ws.farmerById.get(purchase.farmer_id)?.name ?? "Farmer"} · {formatDate(purchase.trade_date)}</option>)}</select></label>
            <label>Sale <span className="optional">Optional</span><select value={form.sale_id} onChange={(event) => setForm((current) => ({ ...current, sale_id: event.target.value }))}><option value="">Not linked to a sale</option>{ws.sales.slice(0, 100).map((sale) => <option key={sale.id} value={sale.id}>{formatSaleId(sale.id)} · {ws.buyerById.get(sale.buyer_id)?.name ?? "Buyer"} · {formatDate(sale.sale_date)}</option>)}</select></label>
          </div>
          <label>Description <span className="optional">Optional</span><input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Breakfast for 6 workers, tyre repair, diesel 40 litres..." /></label>
          <button className="primary-button" disabled={ws.saving} type="submit">{ws.saving ? "Saving..." : form.id ? "Update expense" : "Save expense"}</button>
        </form>
        <Panel eyebrow="Period summary" title={`Expenses total ${formatCurrency(total)}`}>
          {totals.length ? <KeyValueList rows={totals} /> : <EmptyState>No expenses in this period.</EmptyState>}
        </Panel>
      </section>

      <section className="ledger-panel">
        <div className="panel-heading"><div><span className="eyebrow">History</span><h2>Expense records</h2></div></div>
        <div className="filter-bar">
          <PeriodPicker preset={period.preset} from={period.from} to={period.to} onChange={setPeriod} />
          <label>Type<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All types</option>{expenseCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="search-field">Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Worker, vehicle or description" /></label>
        </div>
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Counts towards</th><th>Linked to</th><th>Description</th><th>Amount</th><th>Actions</th></tr></thead><tbody>
          {rows.map((expense) => {
            const links = [
              expense.employee_id ? ws.employeeById.get(expense.employee_id)?.name : null,
              expense.vehicle_id ? ws.vehicleById.get(expense.vehicle_id)?.vehicle_number : null,
              expense.purchase_id ? formatPurchaseId(expense.purchase_id) : null,
              expense.sale_id ? formatSaleId(expense.sale_id) : null
            ].filter(Boolean);
            return <tr key={expense.id}><td>{formatDate(expense.expense_date)}</td><td>{categoryLabel(expense.category)}</td><td>{expenseScopes.find((item) => item.value === expense.scope)?.label}</td><td>{links.length ? <div className="chip-row">{links.map((link) => <span className="chip" key={String(link)}>{link}</span>)}</div> : <span className="muted-text">-</span>}</td><td>{expense.description || "-"}</td><td className="balance-cell">{formatCurrency(Number(expense.amount))}</td><td><div className="row-actions"><button className="secondary-button" onClick={() => edit(expense)} type="button">Edit</button><button className="danger-button" disabled={ws.saving} onClick={() => remove(expense)} type="button">Delete</button></div></td></tr>;
          })}
        </tbody></table>{rows.length === 0 ? <EmptyState>No expenses match these filters.</EmptyState> : null}</div>
      </section>
    </div>
  );
}
