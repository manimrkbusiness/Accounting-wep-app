"use client";

import { CostSettingsPanel } from "../components/CostSettingsPanel";
import { Panel } from "../components/ui";

export default function SettingsPage() {
  return (
    <section className="workspace-grid">
      <CostSettingsPanel description="These defaults are applied automatically to every new purchase and stock entry. Change them here. Editing a rate on a single purchase form changes that purchase only, not these defaults." />
      <Panel eyebrow="How they are used" title="What each default does">
        <dl className="detail-list">
          <div><dt>Default purchase method</dt><dd>Pre-selected on New purchase. Weight-based pays by payable kilograms after the weighbridge; per nut pays by piece and goes through Stock before a sale.</dd></div>
          <div><dt>Dehusking deduction / 1,000</dt><dd>Taken off the farmer amount when "Deduct dehusking" is ticked on a purchase. The same rate is the dehusking cost booked when per-nut coconut is weighed into stock.</dd></div>
          <div><dt>Coconut harvesting deduction / 1,000</dt><dd>Taken off the farmer amount when "Deduct coconut harvesting" is ticked on a purchase.</dd></div>
          <div><dt>Husk / Mattai price per nut</dt><dd>Credit added to the farmer on weight-based purchases, calculated on the piece count. Per-nut purchases keep the husk with you.</dd></div>
          <div><dt>Kudume wastage %</dt><dd>Deducted from the net weight of Kudume coconut, on purchases and on stock entries, to give the payable or sellable weight.</dd></div>
        </dl>
        <p className="field-hint">Changing a default does not alter purchases or stock entries already saved. Each record keeps the rates it was saved with.</p>
      </Panel>
    </section>
  );
}
