"use client";

import { CostSettingsPanel } from "../components/CostSettingsPanel";
import { Panel } from "../components/ui";
import { useLang } from "../../lib/i18n";

function LanguagePanel() {
  const { lang, setLang } = useLang();
  return (
    <section className="tool-panel">
      <div className="panel-heading"><div><span className="eyebrow">{lang === "ta" ? "மொழி" : "Language"}</span><h2>{lang === "ta" ? "ஆப் மொழி" : "App language"}</h2></div></div>
      <p className="muted-text">{lang === "ta" ? "ஆப்பின் மொழியைத் தேர்ந்தெடுக்கவும். இது இந்த சாதனத்தில் நினைவில் வைக்கப்படும். தற்போது ஆங்கிலம் மற்றும் தமிழ் ஆகியவை கிடைக்கின்றன." : "Choose the language for the app. It is remembered on this device. English and Tamil are available now."}</p>
      <div className="segmented">
        <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")} type="button"><strong>English</strong><span>Default</span></button>
        <button className={lang === "ta" ? "active" : ""} onClick={() => setLang("ta")} type="button"><strong>தமிழ்</strong><span>Tamil</span></button>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  return (
    <div className="stack">
    <LanguagePanel />
    <section className="workspace-grid">
      <CostSettingsPanel description="These defaults are applied automatically to every new purchase and stock entry. Change them here. Editing a rate on a single purchase form changes that purchase only, not these defaults." />
      <Panel eyebrow="How they are used" title="What each default does">
        <dl className="detail-list">
          <div><dt>Default purchase method</dt><dd>Pre-selected on New purchase. Weight-based pays by payable kilograms after the weighbridge; per nut pays by piece and goes through Stock before a sale.</dd></div>
          <div><dt>Dehusking deduction / 1,000</dt><dd>Taken off the farmer amount when "Deduct dehusking" is ticked on a purchase. The same rate is the dehusking cost booked when per-nut coconut is weighed into stock.</dd></div>
          <div><dt>Coconut harvesting deduction / 1,000</dt><dd>Taken off the farmer amount when "Deduct coconut harvesting" is ticked on a purchase.</dd></div>
          <div><dt>Green / brown husk price per piece</dt><dd>Default price used when you buy the husk from the farmer on a weight-based purchase or a direct husk purchase, by husk colour. Per-nut purchases keep the husk with you (not paid), using the same prices as the expected husk value.</dd></div>
          <div><dt>Husk loading per 1,000 pieces</dt><dd>Default loading wage used on a husk sale when you deliver the husk to the buyer. It is booked under Expenses and taken off the husk margin. No loading cost applies when the buyer collects.</dd></div>
          <div><dt>Kudume wastage %</dt><dd>Deducted from the net weight of Kudume coconut, on purchases and on stock entries, to give the payable or sellable weight.</dd></div>
        </dl>
        <p className="field-hint">Changing a default does not alter purchases or stock entries already saved. Each record keeps the rates it was saved with.</p>
      </Panel>
    </section>
    </div>
  );
}
