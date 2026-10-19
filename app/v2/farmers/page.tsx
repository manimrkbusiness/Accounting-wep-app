"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { draftKey, useDraft } from "../lib/useDraft";
import { DraftNotice } from "../components/DraftNotice";
import { purchaseOutstanding, sumBy } from "../lib/calc";
import { formatCurrency, getIndianPhoneValue, getStoredIndianPhone, isValidIndianPhone } from "../lib/format";
import type { Farmer } from "../lib/types";
import { EmptyState } from "../components/ui";

type LocationInput = { id?: number; name: string };
type FarmerForm = { id?: number; name: string; phone: string; locations: LocationInput[] };

const blank: FarmerForm = { name: "", phone: "", locations: [{ name: "" }] };

export default function FarmersPage() {
  const ws = useWorkspace();
  const router = useRouter();
  const draft = useDraft<FarmerForm>(draftKey(ws.session?.user.id, "farmer"), () => blank);
  const form = draft.value;
  const setForm = draft.setValue;
  const [search, setSearch] = useState("");
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const rt = new URLSearchParams(window.location.search).get("returnTo");
    setReturnTo(rt);
    if (rt) setShowForm(true);
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ws.farmers.filter((farmer) => !query || `${farmer.name} ${farmer.phone}`.toLowerCase().includes(query));
  }, [ws.farmers, search]);

  // The form opens from "Add farmer", from Edit, from a restored draft, or the add-from-purchase flow.
  const formVisible = showForm || Boolean(form.id) || Boolean(returnTo) || draft.restored;

  function startAdd() {
    ws.clearFeedback();
    draft.clear(blank);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    draft.clear(blank);
    setShowForm(false);
  }

  function edit(farmer: Farmer) {
    ws.clearFeedback();
    setForm({ id: farmer.id, name: farmer.name, phone: getIndianPhoneValue(farmer.phone), locations: ws.locations.filter((location) => location.farmer_id === farmer.id).map((location) => ({ id: location.id, name: location.location_name })) });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // A farmer can be removed only when nothing points at them: no purchases, harvests or payments.
  function farmerHistory(farmerId: number) {
    const purchases = ws.purchases.filter((purchase) => purchase.farmer_id === farmerId).length;
    const harvests = ws.harvestingEntries.filter((entry) => entry.farmer_id === farmerId).length;
    const payments = ws.cashEntries.filter((entry) => entry.farmer_id === farmerId).length;
    return { total: purchases + harvests + payments, purchases, harvests, payments };
  }

  async function deleteFarmer(farmer: Farmer) {
    if (!ws.session) return;
    const history = farmerHistory(farmer.id);
    if (history.total > 0) { ws.fail(`${farmer.name} has records (${history.purchases} purchases, ${history.harvests} harvests, ${history.payments} payments) and cannot be deleted. Edit their details instead.`); return; }
    if (!window.confirm(`Delete ${farmer.name}? Their farming locations are removed too. This cannot be undone.`)) return;
    ws.clearFeedback();
    ws.setSaving(true);
    const { error: locationError } = await supabase.from("farmer_locations").delete().eq("farmer_id", farmer.id);
    if (locationError) { ws.setSaving(false); ws.fail(locationError.message); return; }
    const { error } = await supabase.from("trader_farmers").delete().eq("id", farmer.id).eq("trader_id", ws.session.user.id);
    ws.setSaving(false);
    if (error) { ws.fail(error.message); return; }
    ws.notify(`${farmer.name} deleted.`);
    if (form.id === farmer.id) closeForm();
    await ws.refresh();
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    if (!form.name.trim() || !isValidIndianPhone(form.phone)) { ws.fail("Enter the farmer name and a valid 10-digit Indian mobile number."); return; }
    const cleanLocations = form.locations.map((location) => ({ ...location, name: location.name.trim() })).filter((location) => location.name);
    if (cleanLocations.length === 0) { ws.fail("Add at least one farming location."); return; }
    ws.setSaving(true);
    const traderId = ws.session.user.id;
    let savedFarmerId: number | null = null;
    if (form.id) {
      const farmerId = form.id;
      savedFarmerId = farmerId;
      const { error } = await supabase.from("trader_farmers").update({ name: form.name.trim(), phone: getStoredIndianPhone(form.phone) }).eq("id", farmerId).eq("trader_id", traderId);
      if (error) { ws.setSaving(false); ws.fail(error.code === "23505" ? "This farmer phone number is already in your portfolio." : error.message); return; }
      const original = ws.locations.filter((location) => location.farmer_id === farmerId);
      const retained = new Set(cleanLocations.flatMap((location) => location.id ? [location.id] : []));
      for (const location of cleanLocations) {
        const result = location.id
          ? await supabase.from("farmer_locations").update({ location_name: location.name }).eq("id", location.id).eq("farmer_id", farmerId)
          : await supabase.from("farmer_locations").insert({ farmer_id: farmerId, location_name: location.name, city: null });
        if (result.error) { ws.setSaving(false); ws.fail(result.error.message); return; }
      }
      const used = new Set(ws.purchases.filter((purchase) => purchase.farmer_id === farmerId && purchase.location_id).map((purchase) => purchase.location_id as number));
      const removable = original.filter((location) => !retained.has(location.id) && !used.has(location.id)).map((location) => location.id);
      if (removable.length) {
        const { error: deleteError } = await supabase.from("farmer_locations").delete().in("id", removable).eq("farmer_id", farmerId);
        if (deleteError) { ws.setSaving(false); ws.fail(deleteError.message); return; }
      }
      ws.setSaving(false);
      ws.notify("Farmer details updated.");
    } else {
      const { data: farmer, error } = await supabase.from("trader_farmers").insert({ trader_id: traderId, name: form.name.trim(), phone: getStoredIndianPhone(form.phone), notes: null }).select("*").single();
      if (error || !farmer) { ws.setSaving(false); ws.fail(error?.code === "23505" ? "This farmer phone number is already in your portfolio." : error?.message || "Unable to add farmer."); return; }
      savedFarmerId = farmer.id;
      const { error: locationError } = await supabase.from("farmer_locations").insert(cleanLocations.map((location) => ({ farmer_id: farmer.id, location_name: location.name, city: null })));
      ws.setSaving(false);
      if (locationError) { ws.fail(locationError.message); return; }
      ws.notify("Farmer added to your portfolio.");
    }
    draft.clear(blank);
    setShowForm(false);
    await ws.refresh();
    if (returnTo === "purchase") router.push(savedFarmerId ? `/v2/purchases/new?farmer=${savedFarmerId}` : "/v2/purchases/new");
    else if (returnTo === "harvesting") router.push(savedFarmerId ? `/v2/harvesting?farmer=${savedFarmerId}` : "/v2/harvesting");
    else if (returnTo === "husk-purchase") router.push(savedFarmerId ? `/v2/husk-purchases?farmer=${savedFarmerId}` : "/v2/husk-purchases");
  }

  return (
    <>
    <DraftNotice show={draft.restored} what="farmer entry" onDiscard={closeForm} />
    {formVisible ? <section className="workspace-grid">
      <form className="tool-panel" onSubmit={save}>
        <div className="panel-heading"><div><span className="eyebrow">{form.id ? "Edit farmer" : "New farmer"}</span><h2>{form.id ? "Update farmer details" : "Add a farmer"}</h2></div><button className="link-button" onClick={closeForm} type="button">{form.id ? "Cancel edit" : "Close"}</button></div>
        <p className="muted-text">Use the farmer phone number to identify the contact. Add every farming land as its own location.</p>
        <label>Farmer name<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label>
        <label>Phone number<div className="phone-input"><span>{"🇮🇳 +91"}</span><input inputMode="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: getIndianPhoneValue(event.target.value) }))} placeholder="10-digit mobile number" required /></div></label>
        <div className="field-heading"><label>Farming locations</label><button className="link-button" onClick={() => setForm((current) => ({ ...current, locations: [...current.locations, { name: "" }] }))} type="button">+ Add location</button></div>
        {form.locations.map((location, index) => <div className="location-row" key={location.id ?? `location-${index}`}><input aria-label={`Farming location ${index + 1}`} value={location.name} onChange={(event) => setForm((current) => ({ ...current, locations: current.locations.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} placeholder="Village, town, or farm area" required />{form.locations.length > 1 ? <button className="remove-button" onClick={() => setForm((current) => ({ ...current, locations: current.locations.filter((_item, itemIndex) => itemIndex !== index) }))} type="button" aria-label="Remove location">Remove</button> : null}</div>)}
        <button className="primary-button" disabled={ws.saving} type="submit">{ws.saving ? "Saving..." : form.id ? "Update farmer" : "Add farmer"}</button>
      </form>
    </section> : null}
    <section className="ledger-panel">
      <div className="panel-heading"><div><span className="eyebrow">Private ledger</span><h2>Farmers</h2></div>{!formVisible ? <button className="primary-button" onClick={startAdd} type="button">+ Add farmer</button> : null}</div>
      <label className="search-field">Search by name or phone<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try +91 or a name" /></label>
      <div className="table-wrap"><table><thead><tr><th>Farmer</th><th>Farming locations</th><th>Purchases</th><th>Due</th><th>Actions</th></tr></thead><tbody>
        {visible.map((farmer) => {
          const farmerPurchases = ws.purchases.filter((purchase) => purchase.farmer_id === farmer.id);
          const due = sumBy(farmerPurchases, (purchase) => Math.max(purchaseOutstanding(purchase, ws.cashEntries), 0));
          const locations = ws.locations.filter((location) => location.farmer_id === farmer.id);
          const canDelete = farmerHistory(farmer.id).total === 0;
          return <tr key={farmer.id}>
            <td><strong>{farmer.name}</strong><span className="muted-text">{farmer.phone}</span></td>
            <td>{locations.length ? <div className="location-tags">{locations.map((location) => <span key={location.id}>{location.location_name}</span>)}</div> : <span className="muted-text">-</span>}</td>
            <td>{farmerPurchases.length} purchases<span className="muted-text">{formatCurrency(sumBy(farmerPurchases, (purchase) => purchase.total_amount))}</span></td>
            <td>{due > 0.005 ? <span className="balance-cell">{formatCurrency(due)}</span> : <span className="muted-text">-</span>}</td>
            <td><div className="row-actions"><button className="secondary-button" onClick={() => edit(farmer)} type="button">Edit</button><button className="danger-button" disabled={ws.saving || !canDelete} onClick={() => deleteFarmer(farmer)} type="button" title={canDelete ? "Delete this farmer" : "Has records — cannot be deleted"}>Delete</button></div></td>
          </tr>;
        })}
      </tbody></table>{visible.length === 0 ? <EmptyState>No farmers {search ? "match this search" : "yet. Click Add farmer to start."}</EmptyState> : null}</div>
    </section>
    </>
  );
}
