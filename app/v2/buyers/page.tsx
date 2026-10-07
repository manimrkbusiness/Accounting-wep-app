"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../supabaseClient";
import { useWorkspace } from "../lib/workspace";
import { saleOutstanding, sumBy } from "../lib/calc";
import { formatCurrency, getIndianPhoneValue, getStoredIndianPhone, isValidIndianPhone } from "../lib/format";
import type { Buyer } from "../lib/types";
import { EmptyState, Panel } from "../components/ui";

type BuyerForm = { id?: number; name: string; phone: string; business_name: string; city: string; buys_coconut: boolean; buys_husk: boolean; notes: string; active: boolean };

const blank: BuyerForm = { name: "", phone: "", business_name: "", city: "", buys_coconut: true, buys_husk: false, notes: "", active: true };

export default function BuyersPage() {
  const ws = useWorkspace();
  const router = useRouter();
  const [form, setForm] = useState<BuyerForm>(blank);
  const [search, setSearch] = useState("");
  const [returnTo, setReturnTo] = useState<string | null>(null);

  useEffect(() => {
    setReturnTo(new URLSearchParams(window.location.search).get("returnTo"));
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ws.buyers.filter((buyer) => !query || `${buyer.name} ${buyer.business_name ?? ""} ${buyer.phone ?? ""} ${buyer.city ?? ""}`.toLowerCase().includes(query));
  }, [ws.buyers, search]);

  function edit(buyer: Buyer) {
    setForm({ id: buyer.id, name: buyer.name, phone: buyer.phone ? getIndianPhoneValue(buyer.phone) : "", business_name: buyer.business_name ?? "", city: buyer.city ?? "", buys_coconut: buyer.buys_coconut, buys_husk: buyer.buys_husk, notes: buyer.notes ?? "", active: buyer.active });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ws.clearFeedback();
    if (!ws.session) return;
    if (form.name.trim().length < 2) { ws.fail("Enter the buyer name."); return; }
    if (form.phone && !isValidIndianPhone(form.phone)) { ws.fail("Enter a valid 10-digit Indian mobile number or leave the phone empty."); return; }
    if (!form.buys_coconut && !form.buys_husk) { ws.fail("Tick what this buyer purchases: coconut, husk, or both."); return; }
    ws.setSaving(true);
    const payload = { trader_id: ws.session.user.id, name: form.name.trim(), phone: form.phone ? getStoredIndianPhone(form.phone) : null, business_name: form.business_name.trim() || null, city: form.city.trim() || null, buys_coconut: form.buys_coconut, buys_husk: form.buys_husk, notes: form.notes.trim() || null, active: form.active };
    const result = form.id ? await supabase.from("buyers").update(payload).eq("id", form.id).eq("trader_id", ws.session.user.id) : await supabase.from("buyers").insert(payload);
    ws.setSaving(false);
    if (result.error) { ws.fail(result.error.message); return; }
    ws.notify(form.id ? "Buyer updated." : "Buyer added.");
    setForm(blank);
    await ws.refresh();
    if (returnTo === "sale") router.push("/v2/sales/new");
  }

  return (
    <section className="workspace-grid">
      <form className="tool-panel" onSubmit={save}>
        <div className="panel-heading"><div><span className="eyebrow">{form.id ? "Edit buyer" : "Buyer directory"}</span><h2>{form.id ? "Update buyer" : "Add a buyer"}</h2></div>{form.id ? <button className="link-button" onClick={() => setForm(blank)} type="button">Cancel edit</button> : null}</div>
        <p className="muted-text">Buyers are the traders, mills or merchants you sell coconut loads or husk to.</p>
        <label>Buyer name<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label>
        <div className="form-grid">
          <label>Business name <span className="optional">Optional</span><input value={form.business_name} onChange={(event) => setForm((current) => ({ ...current, business_name: event.target.value }))} /></label>
          <label>Phone number <span className="optional">Optional</span><div className="phone-input"><span>{"🇮🇳 +91"}</span><input inputMode="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: getIndianPhoneValue(event.target.value) }))} placeholder="10-digit mobile number" /></div></label>
          <label>City / market <span className="optional">Optional</span><input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} /></label>
        </div>
        <fieldset className="deduction-options"><legend>What this buyer purchases</legend><div className="checkbox-grid"><label className="checkbox-field"><input type="checkbox" checked={form.buys_coconut} onChange={(event) => setForm((current) => ({ ...current, buys_coconut: event.target.checked }))} /><span><strong>Coconut loads</strong><small>Appears when creating a coconut sale.</small></span></label><label className="checkbox-field"><input type="checkbox" checked={form.buys_husk} onChange={(event) => setForm((current) => ({ ...current, buys_husk: event.target.checked }))} /><span><strong>Husk</strong><small>Appears when creating a husk sale.</small></span></label></div></fieldset>
        <label>Notes <span className="optional">Optional</span><textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Payment habits, preferred quality, contact person" /></label>
        {form.id ? <label className="checkbox-field"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /><span><strong>Active buyer</strong><small>Inactive buyers stay in history but are hidden from new sales.</small></span></label> : null}
        <button className="primary-button" disabled={ws.saving} type="submit">{ws.saving ? "Saving..." : form.id ? "Update buyer" : "Add buyer"}</button>
      </form>
      <Panel eyebrow="Your buyers" title="Find a buyer" action={<strong>{ws.buyers.length}</strong>}>
        <label>Search by name, business, phone or city<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buyer name or market" /></label>
        <div className="card-list">
          {visible.map((buyer) => {
            const buyerSales = ws.sales.filter((sale) => sale.buyer_id === buyer.id);
            const due = sumBy(buyerSales, (sale) => Math.max(saleOutstanding(sale, ws.cashEntries), 0));
            return <article key={buyer.id}>
              <div><strong>{buyer.name}{!buyer.active ? " (inactive)" : ""}</strong><span>{[buyer.business_name, buyer.phone, buyer.city].filter(Boolean).join(" · ") || "No contact details"}</span></div>
              <div className="chip-row">{buyer.buys_coconut ? <span className="chip">Coconut</span> : null}{buyer.buys_husk ? <span className="chip">Husk</span> : null}<span className="chip">{buyerSales.length} sales · {formatCurrency(sumBy(buyerSales, (sale) => sale.total_amount))}</span>{due > 0.005 ? <span className="chip warn">Due {formatCurrency(due)}</span> : null}</div>
              <div className="row-actions"><button className="secondary-button" onClick={() => edit(buyer)} type="button">Edit buyer</button></div>
            </article>;
          })}
          {visible.length === 0 ? <EmptyState>No buyers yet. Add the merchants you sell loads to.</EmptyState> : null}
        </div>
      </Panel>
    </section>
  );
}
