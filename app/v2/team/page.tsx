"use client";

import { useState } from "react";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { sumBy } from "../lib/calc";
import { formatCurrency, getIndianPhoneValue, getStoredIndianPhone, isValidIndianPhone } from "../lib/format";
import { employeeRoles, vehicleTypes, type Employee, type EmployeeRole, type Ownership, type Vehicle, type VehicleType } from "../lib/types";
import { EmptyState, Panel } from "../components/ui";

type EmployeeForm = { id?: number; name: string; phone: string; role: EmployeeRole; daily_wage: string; notes: string; active: boolean };
type VehicleForm = { id?: number; vehicle_number: string; vehicle_type: VehicleType; ownership: Ownership; notes: string; active: boolean };

const blankEmployee: EmployeeForm = { name: "", phone: "", role: "harvester", daily_wage: "", notes: "", active: true };
const blankVehicle: VehicleForm = { vehicle_number: "", vehicle_type: "lorry", ownership: "own", notes: "", active: true };

export default function TeamPage() {
  const ws = useWorkspace();
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>(blankEmployee);
  const [vehicleForm, setVehicleForm] = useState<VehicleForm>(blankVehicle);

  async function saveEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    if (employeeForm.name.trim().length < 2) { ws.fail("Enter the worker name."); return; }
    if (employeeForm.phone && !isValidIndianPhone(employeeForm.phone)) { ws.fail("Enter a valid 10-digit mobile number or leave it empty."); return; }
    ws.setSaving(true);
    const payload = { trader_id: ws.session.user.id, name: employeeForm.name.trim(), phone: employeeForm.phone ? getStoredIndianPhone(employeeForm.phone) : null, role: employeeForm.role, daily_wage: Number(employeeForm.daily_wage) || 0, notes: employeeForm.notes.trim() || null, active: employeeForm.active };
    const result = employeeForm.id ? await supabase.from("employees").update(payload).eq("id", employeeForm.id).eq("trader_id", ws.session.user.id) : await supabase.from("employees").insert(payload);
    ws.setSaving(false);
    if (result.error) { ws.fail(result.error.message); return; }
    ws.notify(employeeForm.id ? "Worker updated." : "Worker added.");
    setEmployeeForm(blankEmployee);
    await ws.refresh();
  }

  async function saveVehicle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    if (vehicleForm.vehicle_number.trim().length < 3) { ws.fail("Enter the vehicle number."); return; }
    ws.setSaving(true);
    const payload = { trader_id: ws.session.user.id, vehicle_number: vehicleForm.vehicle_number.trim().toUpperCase(), vehicle_type: vehicleForm.vehicle_type, ownership: vehicleForm.ownership, notes: vehicleForm.notes.trim() || null, active: vehicleForm.active };
    const result = vehicleForm.id ? await supabase.from("vehicles").update(payload).eq("id", vehicleForm.id).eq("trader_id", ws.session.user.id) : await supabase.from("vehicles").insert(payload);
    ws.setSaving(false);
    if (result.error) { ws.fail(result.error.code === "23505" ? "This vehicle number is already added." : result.error.message); return; }
    ws.notify(vehicleForm.id ? "Vehicle updated." : "Vehicle added.");
    setVehicleForm(blankVehicle);
    await ws.refresh();
  }

  function editEmployee(employee: Employee) {
    setEmployeeForm({ id: employee.id, name: employee.name, phone: employee.phone ? getIndianPhoneValue(employee.phone) : "", role: employee.role, daily_wage: String(employee.daily_wage || ""), notes: employee.notes ?? "", active: employee.active });
  }

  function editVehicle(vehicle: Vehicle) {
    setVehicleForm({ id: vehicle.id, vehicle_number: vehicle.vehicle_number, vehicle_type: vehicle.vehicle_type, ownership: vehicle.ownership, notes: vehicle.notes ?? "", active: vehicle.active });
  }

  return (
    <div className="stack">
      <section className="workspace-grid">
        <form className="tool-panel" onSubmit={saveEmployee}>
          <div className="panel-heading"><div><span className="eyebrow">{employeeForm.id ? "Edit worker" : "Workers"}</span><h2>{employeeForm.id ? "Update worker" : "Add a worker"}</h2></div>{employeeForm.id ? <button className="link-button" onClick={() => setEmployeeForm(blankEmployee)} type="button">Cancel edit</button> : null}</div>
          <p className="muted-text">Harvesters, dehusking and loading workers, drivers. Wages you pay them are recorded under Expenses and totalled here.</p>
          <div className="form-grid">
            <label>Name<input value={employeeForm.name} onChange={(event) => setEmployeeForm((current) => ({ ...current, name: event.target.value }))} required /></label>
            <label>Role<select value={employeeForm.role} onChange={(event) => setEmployeeForm((current) => ({ ...current, role: event.target.value as EmployeeRole }))}>{employeeRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
            <label>Phone <span className="optional">Optional</span><div className="phone-input"><span>{"🇮🇳 +91"}</span><input inputMode="tel" value={employeeForm.phone} onChange={(event) => setEmployeeForm((current) => ({ ...current, phone: getIndianPhoneValue(event.target.value) }))} /></div></label>
            <label>Usual daily wage (INR) <span className="optional">Optional</span><input type="number" min="0" step="0.01" value={employeeForm.daily_wage} onChange={(event) => setEmployeeForm((current) => ({ ...current, daily_wage: event.target.value }))} /></label>
          </div>
          <label>Notes <span className="optional">Optional</span><input value={employeeForm.notes} onChange={(event) => setEmployeeForm((current) => ({ ...current, notes: event.target.value }))} /></label>
          {employeeForm.id ? <label className="checkbox-field"><input type="checkbox" checked={employeeForm.active} onChange={(event) => setEmployeeForm((current) => ({ ...current, active: event.target.checked }))} /><span><strong>Active worker</strong></span></label> : null}
          <button className="primary-button" disabled={ws.saving} type="submit">{ws.saving ? "Saving..." : employeeForm.id ? "Update worker" : "Add worker"}</button>
        </form>
        <Panel eyebrow="Your team" title="Workers" action={<strong>{ws.employees.length}</strong>}>
          <div className="card-list">
            {ws.employees.map((employee) => {
              const paid = sumBy(ws.expenses.filter((expense) => expense.employee_id === employee.id), (expense) => expense.amount);
              return <article key={employee.id}><div><strong>{employee.name}{!employee.active ? " (inactive)" : ""}</strong><span>{employeeRoles.find((role) => role.value === employee.role)?.label}{employee.phone ? ` · ${employee.phone}` : ""}{Number(employee.daily_wage) > 0 ? ` · ${formatCurrency(Number(employee.daily_wage))} / day` : ""}</span></div><div className="chip-row"><span className="chip">Paid {formatCurrency(paid)} so far</span></div><div className="row-actions"><button className="secondary-button" onClick={() => editEmployee(employee)} type="button">Edit</button></div></article>;
            })}
            {ws.employees.length === 0 ? <EmptyState>No workers added yet.</EmptyState> : null}
          </div>
        </Panel>
      </section>

      <section className="workspace-grid">
        <form className="tool-panel" onSubmit={saveVehicle}>
          <div className="panel-heading"><div><span className="eyebrow">{vehicleForm.id ? "Edit vehicle" : "Vehicles"}</span><h2>{vehicleForm.id ? "Update vehicle" : "Add a vehicle"}</h2></div>{vehicleForm.id ? <button className="link-button" onClick={() => setVehicleForm(blankVehicle)} type="button">Cancel edit</button> : null}</div>
          <p className="muted-text">Own or hired vehicles used for loads. Diesel and maintenance expenses can be linked to each vehicle.</p>
          <div className="form-grid">
            <label>Vehicle number<input value={vehicleForm.vehicle_number} onChange={(event) => setVehicleForm((current) => ({ ...current, vehicle_number: event.target.value }))} placeholder="TN 00 AB 0000" required /></label>
            <label>Type<select value={vehicleForm.vehicle_type} onChange={(event) => setVehicleForm((current) => ({ ...current, vehicle_type: event.target.value as VehicleType }))}>{vehicleTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
            <label>Ownership<select value={vehicleForm.ownership} onChange={(event) => setVehicleForm((current) => ({ ...current, ownership: event.target.value as Ownership }))}><option value="own">Own vehicle</option><option value="hired">Hired vehicle</option></select></label>
            <label>Notes <span className="optional">Optional</span><input value={vehicleForm.notes} onChange={(event) => setVehicleForm((current) => ({ ...current, notes: event.target.value }))} /></label>
          </div>
          {vehicleForm.id ? <label className="checkbox-field"><input type="checkbox" checked={vehicleForm.active} onChange={(event) => setVehicleForm((current) => ({ ...current, active: event.target.checked }))} /><span><strong>Active vehicle</strong></span></label> : null}
          <button className="primary-button" disabled={ws.saving} type="submit">{ws.saving ? "Saving..." : vehicleForm.id ? "Update vehicle" : "Add vehicle"}</button>
        </form>
        <Panel eyebrow="Fleet" title="Vehicles" action={<strong>{ws.vehicles.length}</strong>}>
          <div className="card-list">
            {ws.vehicles.map((vehicle) => {
              const spent = sumBy(ws.expenses.filter((expense) => expense.vehicle_id === vehicle.id), (expense) => expense.amount);
              const loads = ws.sales.filter((sale) => sale.vehicle_id === vehicle.id).length;
              return <article key={vehicle.id}><div><strong>{vehicle.vehicle_number}{!vehicle.active ? " (inactive)" : ""}</strong><span>{vehicleTypes.find((type) => type.value === vehicle.vehicle_type)?.label} · {vehicle.ownership === "own" ? "Own" : "Hired"}</span></div><div className="chip-row"><span className="chip">{loads} loads</span><span className="chip">Spent {formatCurrency(spent)}</span></div><div className="row-actions"><button className="secondary-button" onClick={() => editVehicle(vehicle)} type="button">Edit</button></div></article>;
            })}
            {ws.vehicles.length === 0 ? <EmptyState>No vehicles added yet.</EmptyState> : null}
          </div>
        </Panel>
      </section>
    </div>
  );
}
