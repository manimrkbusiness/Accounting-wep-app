"use client";

import { useState } from "react";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { draftKey, useDraft } from "../lib/useDraft";
import { DraftNotice } from "../components/DraftNotice";
import { sumBy } from "../lib/calc";
import { formatCurrency, getIndianPhoneValue, getStoredIndianPhone, isValidIndianPhone } from "../lib/format";
import { employeeRoles, vehicleTypes, type Employee, type EmployeeRole, type Ownership, type Vehicle, type VehicleType } from "../lib/types";
import { EmptyState } from "../components/ui";

type EmployeeForm = { id?: number; name: string; phone: string; role: EmployeeRole; daily_wage: string; notes: string; active: boolean };
type VehicleForm = { id?: number; vehicle_number: string; vehicle_type: VehicleType; ownership: Ownership; notes: string; active: boolean };

const blankEmployee: EmployeeForm = { name: "", phone: "", role: "harvester", daily_wage: "", notes: "", active: true };
const blankVehicle: VehicleForm = { vehicle_number: "", vehicle_type: "lorry", ownership: "own", notes: "", active: true };

// Harvesting, dehusking and loading are teams (the name is the team or its head); the rest are individuals.
const teamRoles: EmployeeRole[] = ["harvester", "dehusker", "loader", "husk_loader"];
const sectionLabel: Record<EmployeeRole, string> = {
  harvester: "Coconut harvesting teams",
  dehusker: "Dehusking teams",
  loader: "Coconut loading teams",
  husk_loader: "Husk loading teams",
  driver: "Drivers",
  supervisor: "Supervisors",
  other: "Other workers"
};

export default function TeamPage() {
  const ws = useWorkspace();
  const employeeDraft = useDraft<EmployeeForm>(draftKey(ws.session?.user.id, "employee"), () => blankEmployee);
  const vehicleDraft = useDraft<VehicleForm>(draftKey(ws.session?.user.id, "vehicle"), () => blankVehicle);
  const employeeForm = employeeDraft.value;
  const setEmployeeForm = employeeDraft.setValue;
  const vehicleForm = vehicleDraft.value;
  const setVehicleForm = vehicleDraft.setValue;
  const [showEmployeeForm, setShowEmployeeForm] = useState(() => Boolean(employeeForm.id) || employeeForm.name.trim().length > 0);
  const [showVehicleForm, setShowVehicleForm] = useState(() => Boolean(vehicleForm.id) || vehicleForm.vehicle_number.trim().length > 0);

  const employeeHasEntries = (employee: Employee) =>
    ws.expenses.some((expense) => expense.employee_id === employee.id) ||
    ws.sales.some((sale) => sale.husk_loading_employee_id === employee.id) ||
    ws.harvestingEntries.some((entry) => entry.head_employee_id === employee.id) ||
    ws.harvestingTeamMembers.some((member) => member.employee_id === employee.id);

  const vehicleHasEntries = (vehicle: Vehicle) =>
    ws.expenses.some((expense) => expense.vehicle_id === vehicle.id) ||
    ws.sales.some((sale) => sale.vehicle_id === vehicle.id);

  async function saveEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    if (employeeForm.name.trim().length < 2) { ws.fail("Enter the team or worker name."); return; }
    if (employeeForm.phone && !isValidIndianPhone(employeeForm.phone)) { ws.fail("Enter a valid 10-digit mobile number or leave it empty."); return; }
    ws.setSaving(true);
    const payload = { trader_id: ws.session.user.id, name: employeeForm.name.trim(), phone: employeeForm.phone ? getStoredIndianPhone(employeeForm.phone) : null, role: employeeForm.role, daily_wage: Number(employeeForm.daily_wage) || 0, notes: employeeForm.notes.trim() || null, active: employeeForm.active };
    const result = employeeForm.id ? await supabase.from("employees").update(payload).eq("id", employeeForm.id).eq("trader_id", ws.session.user.id) : await supabase.from("employees").insert(payload);
    ws.setSaving(false);
    if (result.error) { ws.fail(result.error.message); return; }
    ws.notify(employeeForm.id ? "Saved." : "Added to your team.");
    employeeDraft.clear(blankEmployee);
    setShowEmployeeForm(false);
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
    vehicleDraft.clear(blankVehicle);
    setShowVehicleForm(false);
    await ws.refresh();
  }

  function editEmployee(employee: Employee) {
    ws.clearFeedback();
    setEmployeeForm({ id: employee.id, name: employee.name, phone: employee.phone ? getIndianPhoneValue(employee.phone) : "", role: employee.role, daily_wage: String(employee.daily_wage || ""), notes: employee.notes ?? "", active: employee.active });
    setShowEmployeeForm(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editVehicle(vehicle: Vehicle) {
    ws.clearFeedback();
    setVehicleForm({ id: vehicle.id, vehicle_number: vehicle.vehicle_number, vehicle_type: vehicle.vehicle_type, ownership: vehicle.ownership, notes: vehicle.notes ?? "", active: vehicle.active });
    setShowVehicleForm(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteEmployee(employee: Employee) {
    if (employeeHasEntries(employee)) { ws.fail(`${employee.name} has wages or records linked and cannot be deleted. Mark them inactive instead.`); return; }
    if (!window.confirm(`Delete ${employee.name}?`)) return;
    if (!ws.session) return;
    ws.setSaving(true);
    const { error } = await supabase.from("employees").delete().eq("id", employee.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify(`${employee.name} deleted.`);
    await ws.refresh();
  }

  async function deleteVehicle(vehicle: Vehicle) {
    if (vehicleHasEntries(vehicle)) { ws.fail(`${vehicle.vehicle_number} is used on loads or expenses and cannot be deleted. Mark it inactive instead.`); return; }
    if (!window.confirm(`Delete ${vehicle.vehicle_number}?`)) return;
    if (!ws.session) return;
    ws.setSaving(true);
    const { error } = await supabase.from("vehicles").delete().eq("id", vehicle.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify(`${vehicle.vehicle_number} deleted.`);
    await ws.refresh();
  }

  function cancelEmployee() { employeeDraft.clear(blankEmployee); setShowEmployeeForm(false); }
  function cancelVehicle() { vehicleDraft.clear(blankVehicle); setShowVehicleForm(false); }

  const isTeamRole = teamRoles.includes(employeeForm.role);

  return (
    <div className="stack">
      <DraftNotice show={employeeDraft.restored} what="team entry" onDiscard={cancelEmployee} />
      <DraftNotice show={vehicleDraft.restored} what="vehicle entry" onDiscard={cancelVehicle} />
      {ws.error ? <p className="error-message" role="alert">{ws.error}</p> : null}

      {showEmployeeForm ? <form className="tool-panel" onSubmit={saveEmployee}>
        <div className="panel-heading"><div><span className="eyebrow">{employeeForm.id ? "Edit" : "Workers"}</span><h2>{employeeForm.id ? "Update team or worker" : "Add a team or worker"}</h2></div><button className="link-button" onClick={cancelEmployee} type="button">{employeeForm.id ? "Cancel edit" : "Close"}</button></div>
        <p className="muted-text">Harvesting, dehusking and loading are teams — enter the team name or its head. Drivers and supervisors are individuals. Wages you pay them are recorded under Expenses and totalled here.</p>
        <div className="form-grid">
          <label>{isTeamRole ? "Team name / head" : "Name"}<input value={employeeForm.name} onChange={(event) => setEmployeeForm((current) => ({ ...current, name: event.target.value }))} required /></label>
          <label>Role<select value={employeeForm.role} onChange={(event) => setEmployeeForm((current) => ({ ...current, role: event.target.value as EmployeeRole }))}>{employeeRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
          <label>Phone <span className="optional">Optional</span><div className="phone-input"><span>{"🇮🇳 +91"}</span><input inputMode="tel" value={employeeForm.phone} onChange={(event) => setEmployeeForm((current) => ({ ...current, phone: getIndianPhoneValue(event.target.value) }))} /></div></label>
          <label>Usual daily wage (INR) <span className="optional">Optional</span><input type="number" min="0" step="0.01" value={employeeForm.daily_wage} onChange={(event) => setEmployeeForm((current) => ({ ...current, daily_wage: event.target.value }))} /></label>
        </div>
        <label>Notes <span className="optional">Optional</span><input value={employeeForm.notes} onChange={(event) => setEmployeeForm((current) => ({ ...current, notes: event.target.value }))} /></label>
        {employeeForm.id ? <label className="checkbox-field"><input type="checkbox" checked={employeeForm.active} onChange={(event) => setEmployeeForm((current) => ({ ...current, active: event.target.checked }))} /><span><strong>Active</strong></span></label> : null}
        {ws.error ? <p className="error-message form-error" role="alert">{ws.error}</p> : null}
        <button className="primary-button" disabled={ws.saving} type="submit">{ws.saving ? "Saving..." : employeeForm.id ? "Update" : "Add to team"}</button>
      </form> : null}

      {showVehicleForm ? <form className="tool-panel" onSubmit={saveVehicle}>
        <div className="panel-heading"><div><span className="eyebrow">{vehicleForm.id ? "Edit vehicle" : "Vehicles"}</span><h2>{vehicleForm.id ? "Update vehicle" : "Add a vehicle"}</h2></div><button className="link-button" onClick={cancelVehicle} type="button">{vehicleForm.id ? "Cancel edit" : "Close"}</button></div>
        <p className="muted-text">Own or hired vehicles used for loads. Diesel and maintenance expenses can be linked to each vehicle.</p>
        <div className="form-grid">
          <label>Vehicle number<input value={vehicleForm.vehicle_number} onChange={(event) => setVehicleForm((current) => ({ ...current, vehicle_number: event.target.value.toUpperCase() }))} placeholder="TN 00 AB 0000" required /></label>
          <label>Type<select value={vehicleForm.vehicle_type} onChange={(event) => setVehicleForm((current) => ({ ...current, vehicle_type: event.target.value as VehicleType }))}>{vehicleTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
          <label>Ownership<select value={vehicleForm.ownership} onChange={(event) => setVehicleForm((current) => ({ ...current, ownership: event.target.value as Ownership }))}><option value="own">Own vehicle</option><option value="hired">Hired vehicle</option></select></label>
          <label>Notes <span className="optional">Optional</span><input value={vehicleForm.notes} onChange={(event) => setVehicleForm((current) => ({ ...current, notes: event.target.value }))} /></label>
        </div>
        {vehicleForm.id ? <label className="checkbox-field"><input type="checkbox" checked={vehicleForm.active} onChange={(event) => setVehicleForm((current) => ({ ...current, active: event.target.checked }))} /><span><strong>Active vehicle</strong></span></label> : null}
        {ws.error ? <p className="error-message form-error" role="alert">{ws.error}</p> : null}
        <button className="primary-button" disabled={ws.saving} type="submit">{ws.saving ? "Saving..." : vehicleForm.id ? "Update vehicle" : "Add vehicle"}</button>
      </form> : null}

      <section className="ledger-panel">
        <div className="panel-heading"><div><span className="eyebrow">Team & vehicles</span><h2>Your team ({ws.employees.length}) and vehicles ({ws.vehicles.length})</h2></div><div className="page-actions">{!showEmployeeForm ? <button className="primary-button" onClick={() => { ws.clearFeedback(); employeeDraft.clear(blankEmployee); setShowEmployeeForm(true); }} type="button">+ Add a team</button> : null}{!showVehicleForm ? <button className="secondary-button" onClick={() => { ws.clearFeedback(); vehicleDraft.clear(blankVehicle); setShowVehicleForm(true); }} type="button">+ Add a vehicle</button> : null}</div></div>
        <div className="team-board">
          {employeeRoles.map((role) => {
            const group = ws.employees.filter((employee) => employee.role === role.value);
            if (group.length === 0) return null;
            return <div className="team-card-box" key={role.value}>
              <div className="box-heading"><strong>{sectionLabel[role.value]}</strong><span className="chip">{group.length}</span></div>
              <div className="card-list">
                {group.map((employee) => {
                  const paid = sumBy(ws.expenses.filter((expense) => expense.employee_id === employee.id), (expense) => expense.amount);
                  const locked = employeeHasEntries(employee);
                  return <article key={employee.id}><div><strong>{employee.name}{!employee.active ? " (inactive)" : ""}</strong><span>{[employee.phone, Number(employee.daily_wage) > 0 ? `${formatCurrency(Number(employee.daily_wage))} / day` : null].filter(Boolean).join(" · ") || "—"}</span></div><div className="chip-row"><span className="chip">Paid {formatCurrency(paid)} so far</span></div><div className="row-actions"><button className="secondary-button" onClick={() => editEmployee(employee)} type="button">Edit</button><button className="danger-button" disabled={ws.saving || locked} title={locked ? "Has wages or records; cannot delete" : undefined} onClick={() => deleteEmployee(employee)} type="button">Delete</button></div></article>;
                })}
              </div>
            </div>;
          })}
          <div className="team-card-box">
            <div className="box-heading"><strong>Vehicles</strong><span className="chip">{ws.vehicles.length}</span></div>
            <div className="card-list">
              {ws.vehicles.map((vehicle) => {
                const spent = sumBy(ws.expenses.filter((expense) => expense.vehicle_id === vehicle.id), (expense) => expense.amount);
                const loads = ws.sales.filter((sale) => sale.vehicle_id === vehicle.id).length;
                const locked = vehicleHasEntries(vehicle);
                return <article key={vehicle.id}><div><strong>{vehicle.vehicle_number}{!vehicle.active ? " (inactive)" : ""}</strong><span>{vehicleTypes.find((type) => type.value === vehicle.vehicle_type)?.label} · {vehicle.ownership === "own" ? "Own" : "Hired"}</span></div><div className="chip-row"><span className="chip">{loads} loads</span><span className="chip">Spent {formatCurrency(spent)}</span></div><div className="row-actions"><button className="secondary-button" onClick={() => editVehicle(vehicle)} type="button">Edit</button><button className="danger-button" disabled={ws.saving || locked} title={locked ? "Used on loads or expenses; cannot delete" : undefined} onClick={() => deleteVehicle(vehicle)} type="button">Delete</button></div></article>;
              })}
              {ws.vehicles.length === 0 ? <EmptyState>No vehicles added yet.</EmptyState> : null}
            </div>
          </div>
          {ws.employees.length === 0 ? <EmptyState>No team members added yet. Use “Add a team”.</EmptyState> : null}
        </div>
      </section>
    </div>
  );
}
