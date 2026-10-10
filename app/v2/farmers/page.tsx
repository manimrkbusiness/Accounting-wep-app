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
import { EmptyState, Panel } from "../components/ui";

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

  useEffect(() => {
    setReturnTo(new URLSearchParams(window.location.search).get("returnTo"));
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ws.farmers.filter((farmer) => !query || `${farmer.name} ${farmer.phone}`.toLowerCase().includes(query));
  }, [ws.farmers, search]);

  function edit(farmer: Farmer) {
    setForm({ id: farmer.id, name: farmer.name, phone: getIndianPhoneValue(farmer.phone), locations: ws.locations.filter((location) => location.farmer_id === farmer.id).map((location) => ({ id: location.id, name: location.location_name })) });
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    await ws.refresh();
    if (returnTo === "purchase") router.push(savedFarmerId ? `/v2/purchases/new?farmer=${savedFarmerId}` : "/v2/purchases/new");
  }

  return (
    <>
    <DraftNotice show={draft.restored} what="farmer entry" onDiscard={() => draft.clear(blank)} />
    <section className="workspace-grid">
      <form className="tool-panel" onSubmit={save}>
        <div className="panel-heading"><div><span className="eyebrow">{form.id ? "Edit farmer" : "Portfolio"}</span><h2>{form.id ? "Update farmer details" : "Add a farmer"}</h2></div>{form.id ? <button className="link-button" onClick={() => draft.clear(blank)} type="button">Cancel edit</button> : null}</div>
        <p className="muted-text">Use the farmer phone number to identify the contact. Add every farming land as its own location.</p>
        <label>Farmer name<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label>
        <label>Phone number<div className="phone-input"><span>{"🇮🇳 +91"}</span><input inputMode="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: getIndianPhoneValue(event.target.value) }))} placeholder="10-digit mobile number" required /></div></label>
        <div className="field-heading"><label>Farming locations</label><button className="link-button" onClick={() => setForm((current) => ({ ...current, locations: [...current.locations, { name: "" }] }))} type="button">+ Add location</button></div>
        {form.locations.map((location, index) => <div className="location-row" key={location.id ?? `location-${index}`}><input aria-label={`Farming location ${index + 1}`} value={location.name} onChange={(event) => setForm((current) => ({ ...current, locations: current.locations.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} placeholder="Village, town, or farm area" required />{form.locations.length > 1 ? <button className="remove-button" onClick={() => setForm((current) => ({ ...current, locations: current.locations.filter((_item, itemIndex) => itemIndex !== index) }))} type="button" aria-label="Remove location">Remove</button> : null}</div>)}
        <button className="primary-button" disabled={ws.saving} type="submit">{ws.saving ? "Saving..." : form.id ? "Update farmer" : "Add farmer"}</button>
      </form>
      <Panel eyebrow="Your portfolio" title="Find a farmer" action={<strong>{ws.farmers.length}</strong>}>
        <label>Search by name or phone<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try +91 or a name" /></label>
        <div className="card-list">
          {visible.map((farmer) => {
            const farmerPurchases = ws.purchases.filter((purchase) => purchase.farmer_id === farmer.id);
            const due = sumBy(farmerPurchases, (purchase) => Math.max(purchaseOutstanding(purchase, ws.cashEntries), 0));
            return <article key={farmer.id}>
              <div><strong>{farmer.name}</strong><span>{farmer.phone}</span></div>
              <div className="location-tags">{ws.locations.filter((location) => location.farmer_id === farmer.id).map((location) => <span key={location.id}>{location.location_name}</span>)}</div>
              <div className="chip-row"><span className="chip">{farmerPurchases.length} purchases · {formatCurrency(sumBy(farmerPurchases, (purchase) => purchase.total_amount))}</span>{due > 0.005 ? <span className="chip warn">Due {formatCurrency(due)}</span> : null}</div>
              <div className="row-actions"><a className="secondary-button" href={`/dashboard/farmers/${farmer.id}`}>View farmer</a><button className="secondary-button" onClick={() => edit(farmer)} type="button">Edit farmer</button></div>
            </article>;
          })}
          {visible.length === 0 ? <EmptyState>No farmers match this search.</EmptyState> : null}
        </div>
      </Panel>
    </section>
    </>
  );
}
