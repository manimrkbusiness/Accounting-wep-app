"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { Sprout, ShoppingCart, Scale, Truck, Leaf, Wallet, LineChart, ShieldCheck, Languages } from "lucide-react";
import { supabase } from "./supabaseClient";
import { useLang, LanguageToggle } from "./lib/i18n";

const landingCss = `
.landing { --ld-green:#2f8f57; --ld-green-deep:#15402a; --ld-ink:#16271e; --ld-muted:#5a6b61; --ld-line:#e2ebe4; color:var(--ld-ink); }
.landing * { box-sizing:border-box; }
.landing a { text-decoration:none; }
.landing-top { align-items:center; display:flex; justify-content:space-between; gap:16px; max-width:1120px; margin:0 auto; padding:18px 20px; }
.landing-brand { align-items:center; color:var(--ld-green-deep); display:flex; font-size:0.82rem; font-weight:800; gap:9px; letter-spacing:0.04em; }
.landing-brand .brand-mark { background:linear-gradient(150deg,#39a865,#1d6b3f); border-radius:9px; color:#fff; display:grid; height:34px; place-items:center; width:34px; }
.landing-brand .brand-mark.small { height:26px; width:26px; border-radius:7px; }
.landing-top-actions { align-items:center; display:flex; gap:10px; }
.lang-toggle { background:#eef3ee; border:1px solid var(--ld-line); border-radius:999px; display:inline-flex; gap:2px; padding:3px; }
.lang-toggle button { background:transparent; border:0; border-radius:999px; color:var(--ld-muted); cursor:pointer; font-size:0.78rem; font-weight:700; min-height:26px; padding:3px 11px; }
.lang-toggle button.active { background:#fff; box-shadow:0 1px 4px rgba(20,50,30,0.14); color:var(--ld-green-deep); }
.landing-btn { border-radius:10px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:0.9rem; min-height:42px; padding:10px 18px; transition:transform .15s ease, box-shadow .2s ease, background .2s ease; }
.landing-btn.ghost { background:transparent; border:1px solid var(--ld-line); color:var(--ld-green-deep); }
.landing-btn.solid { background:linear-gradient(150deg,#3bb06c,#1f7a46); border:1px solid transparent; box-shadow:0 8px 20px rgba(31,122,70,0.28); color:#fff; }
.landing-btn.solid:hover { transform:translateY(-2px); box-shadow:0 12px 26px rgba(31,122,70,0.34); }
.landing-btn.big { min-height:52px; padding:14px 26px; font-size:1rem; }
.landing-btn.full { width:100%; }
.hero-eyebrow { color:var(--ld-green); font-size:0.8rem; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; }
.landing-hero { position:relative; overflow:hidden; background:radial-gradient(1200px 500px at 80% -10%, #1f6b41 0%, transparent 60%), linear-gradient(165deg, #0e2a1b 0%, #184a2f 55%, #0f3220 100%); color:#eaf4ec; }
.hero-aura { position:absolute; inset:0; pointer-events:none; }
.hero-aura .orb { position:absolute; border-radius:50%; filter:blur(50px); opacity:0.5; }
.orb-a { width:360px; height:360px; background:#3fe08a; top:-80px; right:-60px; animation:floatY 9s ease-in-out infinite; }
.orb-b { width:300px; height:300px; background:#1f8f58; bottom:-120px; left:-40px; animation:floatY 11s ease-in-out infinite reverse; }
.orb-c { width:220px; height:220px; background:#9ff7c0; top:40%; left:45%; opacity:0.25; animation:floatY 13s ease-in-out infinite; }
.hero-inner { position:relative; max-width:1120px; margin:0 auto; padding:56px 20px 76px; display:grid; grid-template-columns:1.05fr 0.95fr; gap:40px; align-items:center; }
.hero-copy h1 { font-size:clamp(2rem, 5vw, 3.3rem); line-height:1.08; margin:14px 0 16px; letter-spacing:-0.02em; }
.hero-copy p { color:#cfe6d6; font-size:1.08rem; line-height:1.6; max-width:30em; }
.hero-cta { display:flex; flex-wrap:wrap; gap:12px; margin:26px 0 12px; }
.hero-cta .landing-btn.ghost { border-color:rgba(255,255,255,0.35); color:#eaf4ec; }
.hero-note { color:#a7cdb5; font-size:0.86rem; }
.hero-visual { position:relative; min-height:320px; }
.hero-card { background:rgba(255,255,255,0.97); border-radius:16px; box-shadow:0 24px 60px rgba(5,25,15,0.4); color:var(--ld-ink); padding:20px; width:min(360px,100%); }
.hero-card .hc-row { align-items:center; display:flex; gap:10px; font-size:0.9rem; padding:7px 0; }
.hero-card .hc-row strong { margin-left:auto; }
.hc-dot { width:10px; height:10px; border-radius:50%; background:#c7d3cb; display:inline-block; }
.hc-dot.green { background:#36a765; }
.hc-bar { background:#eaf1ec; border-radius:6px; height:9px; margin:10px 0; overflow:hidden; }
.hc-bar span { background:linear-gradient(90deg,#3bb06c,#1f7a46); display:block; height:100%; }
.hc-foot { align-items:center; border-top:1px solid var(--ld-line); display:flex; font-size:0.9rem; justify-content:space-between; margin-top:8px; padding-top:12px; }
.hc-foot .pos { color:#1f8f52; }
.hero-chip { position:absolute; background:#fff; border-radius:999px; box-shadow:0 10px 24px rgba(5,25,15,0.25); color:var(--ld-green-deep); font-size:0.8rem; font-weight:700; padding:8px 14px; }
.hero-chip.one { top:6px; right:10px; }
.hero-chip.two { bottom:18px; left:-6px; }
.hero-coco { position:absolute; right:-10px; bottom:-24px; opacity:0.95; }
.float-slow { animation:floatY 6s ease-in-out infinite; }
.float-fast { animation:floatY 4s ease-in-out infinite; }
@keyframes floatY { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-14px); } }
.landing-strip { align-items:center; display:grid; grid-template-columns:repeat(4,1fr); gap:16px; max-width:1000px; margin:-34px auto 0; position:relative; background:#fff; border:1px solid var(--ld-line); border-radius:16px; box-shadow:0 14px 40px rgba(20,50,30,0.1); padding:22px; text-align:center; }
.landing-strip strong { color:var(--ld-green-deep); display:block; font-size:1.5rem; }
.landing-strip span { color:var(--ld-muted); font-size:0.82rem; }
.landing-section { max-width:1120px; margin:0 auto; padding:64px 20px; }
.landing-section.alt { background:#f4f8f4; max-width:none; }
.landing-section.alt > * { max-width:1120px; margin-left:auto; margin-right:auto; }
.section-head { text-align:center; max-width:40em; margin:0 auto 34px; }
.section-head .eyebrow { color:var(--ld-green); font-size:0.78rem; font-weight:800; letter-spacing:0.07em; text-transform:uppercase; }
.section-head h2 { font-size:clamp(1.5rem,3.4vw,2.2rem); letter-spacing:-0.02em; margin:10px 0 0; }
.feature-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
.feature-card { background:#fff; border:1px solid var(--ld-line); border-radius:14px; padding:22px; transition:transform .2s ease, box-shadow .2s ease; }
.feature-card:hover { transform:translateY(-4px); box-shadow:0 16px 36px rgba(20,50,30,0.12); }
.feature-icon { align-items:center; background:linear-gradient(150deg,#e7f6ec,#cdeed8); border-radius:11px; color:#1f7a46; display:inline-flex; height:44px; justify-content:center; width:44px; }
.feature-card h3 { font-size:1.08rem; margin:14px 0 6px; }
.feature-card p { color:var(--ld-muted); font-size:0.92rem; line-height:1.55; }
.step-row { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
.step-card { background:#fff; border:1px solid var(--ld-line); border-radius:14px; padding:24px; }
.step-num { align-items:center; background:linear-gradient(150deg,#3bb06c,#1f7a46); border-radius:50%; color:#fff; display:inline-flex; font-weight:800; height:38px; justify-content:center; width:38px; }
.step-card h3 { font-size:1.08rem; margin:14px 0 6px; }
.step-card p { color:var(--ld-muted); font-size:0.92rem; line-height:1.55; }
.who-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
.who-card { background:linear-gradient(160deg,#133c27,#1d5e3a); border-radius:16px; color:#eaf4ec; padding:28px; }
.who-card.soft { background:#fff; border:1px dashed var(--ld-line); color:var(--ld-ink); }
.who-card h3 { font-size:1.2rem; margin:0 0 10px; }
.who-card p { line-height:1.6; opacity:0.95; }
.who-card.soft p { color:var(--ld-muted); opacity:1; }
.price-card { background:#fff; border:1px solid var(--ld-line); border-radius:18px; box-shadow:0 18px 44px rgba(20,50,30,0.1); margin:0 auto; max-width:460px; padding:30px; text-align:center; }
.price-top { align-items:baseline; display:flex; gap:6px; justify-content:center; }
.price-amount { color:var(--ld-green-deep); font-size:3rem; font-weight:800; }
.price-per { color:var(--ld-muted); }
.price-trial { color:var(--ld-green); font-weight:700; margin:6px 0 18px; }
.price-list { display:grid; gap:10px; list-style:none; margin:0 0 22px; padding:0; text-align:left; }
.price-list li { color:var(--ld-ink); font-size:0.92rem; padding-left:26px; position:relative; }
.price-list li::before { content:"✓"; color:#1f8f52; font-weight:800; left:4px; position:absolute; }
.trust-card { align-items:center; background:#f4f8f4; border:1px solid var(--ld-line); border-radius:16px; display:flex; gap:18px; padding:26px; }
.trust-icon { align-items:center; background:#fff; border-radius:12px; color:#1f7a46; display:inline-flex; height:52px; justify-content:center; min-width:52px; }
.trust-card h3 { margin:0 0 6px; }
.trust-card p { color:var(--ld-muted); line-height:1.55; margin:0; }
.trust-card a { color:#1f7a46; font-weight:600; }
.landing-final { background:linear-gradient(165deg,#0e2a1b,#184a2f); color:#eaf4ec; text-align:center; padding:72px 20px; }
.landing-final h2 { font-size:clamp(1.6rem,3.6vw,2.4rem); margin:0 0 10px; }
.landing-final p { color:#cfe6d6; margin:0 0 24px; }
.landing-foot { align-items:center; border-top:1px solid var(--ld-line); display:flex; flex-wrap:wrap; gap:16px; justify-content:space-between; max-width:1120px; margin:0 auto; padding:26px 20px; }
.foot-links { align-items:center; display:flex; flex-wrap:wrap; gap:18px; }
.foot-links a { color:var(--ld-muted); font-size:0.88rem; font-weight:600; }
.foot-lang { align-items:center; color:var(--ld-muted); display:inline-flex; gap:6px; }
.foot-copy { color:var(--ld-muted); font-size:0.82rem; }
.reveal { opacity:0; transform:translateY(22px); transition:opacity .7s ease, transform .7s ease; }
.reveal.in { opacity:1; transform:none; }
@media (max-width:860px) {
  .hero-inner { grid-template-columns:1fr; }
  .hero-visual { min-height:260px; }
  .landing-strip { grid-template-columns:repeat(2,1fr); }
  .feature-grid, .step-row, .who-grid { grid-template-columns:1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .reveal { opacity:1; transform:none; transition:none; }
  .float-slow, .float-fast, .orb-a, .orb-b, .orb-c { animation:none; }
}
`;

export default function LandingPage() {
  const { lang } = useLang();
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { if (active) setSession(next); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  // Reveal sections on scroll for a cinematic feel.
  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window)) { items.forEach((el) => el.classList.add("in")); return; }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("in"); observer.unobserve(entry.target); } });
    }, { threshold: 0.15 });
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [lang]);

  const primaryCta = session
    ? { href: "/dashboard", label: L("Open workspace", "பணியிடத்தைத் திறக்க") }
    : { href: "/login", label: L("Start free — 9-day trial", "இலவசம் — 9 நாள் சோதனை") };

  const features = [
    { icon: ShoppingCart, title: L("Coconut purchases", "தேங்காய் கொள்முதல்"), body: L("Record every lorry from every farmer — by weight or per nut. Husk credit, labour and advances are worked out for you.", "ஒவ்வொரு விவசாயியிடமிருந்தும் ஒவ்வொரு லாரியையும் பதிவு செய்யுங்கள் — எடை அல்லது தேங்காய் எண்ணிக்கை மூலம். மட்டை விலை, கூலி, முன்பணம் தானாகக் கணக்கிடப்படும்.") },
    { icon: Scale, title: L("Stock & weighbridge", "கையிருப்பு & எடை"), body: L("Weigh per-nut coconut into stock, track what is loaded vs. wasted, and know the real cost of every nut.", "தேங்காயை எடைபோட்டு கையிருப்பில் சேர்த்து, ஏற்றப்பட்டது vs. வீணானது கண்காணித்து, ஒவ்வொரு தேங்காயின் உண்மையான செலவை அறியுங்கள்.") },
    { icon: Truck, title: L("Sales & margin", "விற்பனை & லாபம்"), body: L("Build a lorry load from your stock, bill the buyer, and see your margin on every sale — instantly.", "உங்கள் கையிருப்பிலிருந்து லாரி சுமையை உருவாக்கி, வாங்குபவருக்கு பில் செய்து, ஒவ்வொரு விற்பனையிலும் உங்கள் லாபத்தை உடனே பார்க்கவும்.") },
    { icon: Leaf, title: L("Husk, bought & sold", "மட்டை, கொள்முதல் & விற்பனை"), body: L("Buy husk from farmers or keep it from your nuts, then sell it separately — the profit is tracked on its own.", "விவசாயிகளிடமிருந்து மட்டை வாங்கவும் அல்லது உங்கள் தேங்காயிலிருந்து வைத்திருக்கவும், தனியாக விற்கவும் — லாபம் தனித்தனியே கணக்கிடப்படும்.") },
    { icon: Wallet, title: L("Expenses & cash book", "செலவுகள் & பணப் புத்தகம்"), body: L("Labour, diesel, loading and more — plus every rupee paid to farmers and received from buyers, in one ledger.", "கூலி, டீசல், ஏற்றுதல் மற்றும் பலவும் — விவசாயிகளுக்குச் செலுத்தியது, வாங்குபவர்களிடமிருந்து பெற்றது அனைத்தும் ஒரே பதிவேட்டில்.") },
    { icon: LineChart, title: L("Profit dashboard", "லாப டாஷ்போர்டு"), body: L("Coconut margin, husk profit, wastage, stock value and outstanding balances — your whole business at a glance.", "தேங்காய் லாபம், மட்டை லாபம், வீணானது, கையிருப்பு மதிப்பு, நிலுவைத் தொகை — உங்கள் முழு வணிகமும் ஒரே பார்வையில்.") }
  ];

  const steps = [
    { n: "1", title: L("Record the purchase", "கொள்முதலைப் பதிவு செய்க"), body: L("Add the farmer, the lorry and the rate. Costs and the farmer's balance are calculated for you.", "விவசாயி, லாரி, விலையைச் சேர்க்கவும். செலவுகளும் விவசாயியின் நிலுவையும் கணக்கிடப்படும்.") },
    { n: "2", title: L("Weigh and sell", "எடைபோட்டு விற்கவும்"), body: L("Weigh per-nut stock, tick the purchases going on the lorry, and enter the buyer and rate.", "கையிருப்பை எடைபோட்டு, லாரியில் செல்லும் கொள்முதல்களைத் தேர்ந்தெடுத்து, வாங்குபவர் மற்றும் விலையை உள்ளிடவும்.") },
    { n: "3", title: L("See your profit", "உங்கள் லாபத்தைப் பாருங்கள்"), body: L("Every sale shows what you spent and what you made. The dashboard keeps the running total.", "ஒவ்வொரு விற்பனையும் நீங்கள் செலவழித்ததையும் சம்பாதித்ததையும் காட்டுகிறது. டாஷ்போர்டு மொத்தத்தை வைத்திருக்கும்.") }
  ];

  return (
    <main className="landing">
      <style>{landingCss}</style>
      <header className="landing-top">
        <div className="landing-brand"><span className="brand-mark"><Sprout size={20} strokeWidth={2.4} aria-hidden="true" /></span><strong>COCONUT TRADE DESK</strong></div>
        <nav className="landing-top-actions">
          <LanguageToggle />
          {session
            ? <Link className="landing-btn ghost" href="/dashboard">{L("Open workspace", "பணியிடம்")}</Link>
            : <><Link className="landing-btn ghost" href="/login">{L("Sign in", "உள்நுழைக")}</Link><Link className="landing-btn solid" href="/login">{L("Get started", "தொடங்குங்கள்")}</Link></>}
        </nav>
      </header>

      <section className="landing-hero">
        <div className="hero-aura" aria-hidden="true"><span className="orb orb-a" /><span className="orb orb-b" /><span className="orb orb-c" /></div>
        <div className="hero-inner">
          <div className="hero-copy reveal">
            <span className="hero-eyebrow">{L("For South Indian coconut traders", "தென்னிந்திய தேங்காய் வியாபாரிகளுக்காக")}</span>
            <h1>{L("Your coconut trade, finally organised.", "உங்கள் தேங்காய் வியாபாரம், இறுதியாக ஒழுங்காக.")}</h1>
            <p>{L("Record purchases, stock, sales, husk and cash in one place — and know your real profit on every lorry. No more notebooks, no more guessing.", "கொள்முதல், கையிருப்பு, விற்பனை, மட்டை, பணம் அனைத்தையும் ஒரே இடத்தில் பதிவு செய்து — ஒவ்வொரு லாரியிலும் உங்கள் உண்மையான லாபத்தை அறியுங்கள். இனி நோட்டுப் புத்தகம் இல்லை, யூகம் இல்லை.")}</p>
            <div className="hero-cta">
              <Link className="landing-btn solid big" href={primaryCta.href}>{primaryCta.label}</Link>
              <a className="landing-btn ghost big" href="#features">{L("See how it works", "எப்படி வேலை செய்கிறது")}</a>
            </div>
            <p className="hero-note">{L("9-day free trial · then ₹519/month · cancel anytime", "9 நாள் இலவச சோதனை · பின் ₹519/மாதம் · எப்போது வேண்டுமானாலும் ரத்து")}</p>
          </div>
          <div className="hero-visual reveal" aria-hidden="true">
            <div className="hero-card float-slow">
              <div className="hc-row"><span className="hc-dot green" /><span>{L("PUR-000044 · Koudham", "PUR-000044 · கௌதம்")}</span><strong>5,000</strong></div>
              <div className="hc-row"><span className="hc-dot" /><span>{L("Weighed into stock", "கையிருப்பில் எடை")}</span><strong>₹1,26,250</strong></div>
              <div className="hc-bar"><span style={{ width: "72%" }} /></div>
              <div className="hc-foot"><span>{L("Margin this load", "இந்த சுமை லாபம்")}</span><strong className="pos">+ ₹18,400</strong></div>
            </div>
            <div className="hero-chip float-fast one">{L("Profit, live", "லாபம், நேரலை")}</div>
            <div className="hero-chip float-fast two">{L("Husk tracked", "மட்டை கண்காணிப்பு")}</div>
            <svg className="hero-coco float-slow" viewBox="0 0 120 120" width="120" height="120"><defs><radialGradient id="co" cx="35%" cy="30%"><stop offset="0%" stopColor="#bfe6c6" /><stop offset="100%" stopColor="#3f7a52" /></radialGradient></defs><circle cx="60" cy="60" r="48" fill="url(#co)" /><ellipse cx="46" cy="44" rx="10" ry="13" fill="#2f5c3e" opacity="0.5" /><ellipse cx="74" cy="50" rx="8" ry="11" fill="#2f5c3e" opacity="0.4" /><ellipse cx="58" cy="72" rx="9" ry="12" fill="#2f5c3e" opacity="0.45" /></svg>
          </div>
        </div>
      </section>

      <section className="landing-strip reveal">
        <div><strong>6</strong><span>{L("stages, one app", "கட்டங்கள், ஒரே ஆப்")}</span></div>
        <div><strong>₹0</strong><span>{L("to start — 9 days free", "தொடங்க — 9 நாட்கள் இலவசம்")}</span></div>
        <div><strong>100%</strong><span>{L("private to you", "உங்களுக்கு மட்டுமே தனிப்பட்டது")}</span></div>
        <div><strong>EN · த</strong><span>{L("English & Tamil", "ஆங்கிலம் & தமிழ்")}</span></div>
      </section>

      <section className="landing-section reveal" id="features">
        <div className="section-head"><span className="eyebrow">{L("Everything a coconut trader needs", "ஒரு தேங்காய் வியாபாரிக்குத் தேவையான அனைத்தும்")}</span><h2>{L("Built around how you actually trade", "நீங்கள் உண்மையில் வியாபாரம் செய்யும் விதத்தைச் சுற்றி கட்டமைக்கப்பட்டது")}</h2></div>
        <div className="feature-grid">
          {features.map((feature) => { const Icon = feature.icon; return (
            <article className="feature-card" key={feature.title}>
              <span className="feature-icon"><Icon size={22} strokeWidth={2.1} aria-hidden="true" /></span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ); })}
        </div>
      </section>

      <section className="landing-section alt reveal">
        <div className="section-head"><span className="eyebrow">{L("Three steps", "மூன்று படிகள்")}</span><h2>{L("From lorry to profit in minutes", "லாரியிலிருந்து லாபம் வரை நிமிடங்களில்")}</h2></div>
        <div className="step-row">
          {steps.map((step) => (
            <div className="step-card" key={step.n}><span className="step-num">{step.n}</span><h3>{step.title}</h3><p>{step.body}</p></div>
          ))}
        </div>
      </section>

      <section className="landing-section reveal">
        <div className="who-grid">
          <div className="who-card">
            <h3>{L("For traders — today", "வியாபாரிகளுக்கு — இன்று")}</h3>
            <p>{L("Coconut Trade Desk is built for you first. Keep your whole business — farmers, lorries, stock, buyers, husk, cash and profit — in one private workspace you can open on your phone.", "Coconut Trade Desk முதலில் உங்களுக்காகவே. உங்கள் முழு வணிகத்தையும் — விவசாயிகள், லாரிகள், கையிருப்பு, வாங்குபவர்கள், மட்டை, பணம், லாபம் — உங்கள் தொலைபேசியில் திறக்கக்கூடிய ஒரே தனிப்பட்ட பணியிடத்தில் வைத்திருங்கள்.")}</p>
          </div>
          <div className="who-card soft">
            <h3>{L("For farmers — coming soon", "விவசாயிகளுக்கு — விரைவில்")}</h3>
            <p>{L("Later, farmers will log in with their phone number and see the coconut records their trader entered about them — transparent, with their consent. Planned for the months ahead.", "பின்னர், விவசாயிகள் தங்கள் தொலைபேசி எண் மூலம் உள்நுழைந்து, அவர்களின் வியாபாரி பதிவு செய்த தேங்காய் பதிவுகளைப் பார்க்கலாம் — அவர்களின் சம்மதத்துடன், வெளிப்படையாக. வரும் மாதங்களில் திட்டமிடப்பட்டுள்ளது.")}</p>
          </div>
        </div>
      </section>

      <section className="landing-section alt reveal" id="pricing">
        <div className="section-head"><span className="eyebrow">{L("Simple pricing", "எளிய விலை")}</span><h2>{L("Start free. Pay only when it helps.", "இலவசமாகத் தொடங்குங்கள். உதவும்போது மட்டும் செலுத்துங்கள்.")}</h2></div>
        <div className="price-card">
          <div className="price-top"><span className="price-amount">₹519</span><span className="price-per">{L("/ month", "/ மாதம்")}</span></div>
          <p className="price-trial">{L("9-day free trial — no card needed to start", "9 நாள் இலவச சோதனை — தொடங்க கார்டு தேவையில்லை")}</p>
          <ul className="price-list">
            <li>{L("Every stage: purchase, stock, sales, husk, expenses, cash", "ஒவ்வொரு கட்டமும்: கொள்முதல், கையிருப்பு, விற்பனை, மட்டை, செலவு, பணம்")}</li>
            <li>{L("Live profit dashboard and reports", "நேரலை லாப டாஷ்போர்டு மற்றும் அறிக்கைகள்")}</li>
            <li>{L("English and Tamil", "ஆங்கிலம் மற்றும் தமிழ்")}</li>
            <li>{L("Your data stays private to you", "உங்கள் தரவு உங்களுக்கு மட்டுமே தனிப்பட்டது")}</li>
          </ul>
          <Link className="landing-btn solid big full" href={session ? "/dashboard" : "/login"}>{session ? L("Open workspace", "பணியிடம்") : L("Start your free trial", "இலவச சோதனையைத் தொடங்குங்கள்")}</Link>
        </div>
      </section>

      <section className="landing-section reveal">
        <div className="trust-card">
          <span className="trust-icon"><ShieldCheck size={26} strokeWidth={2} aria-hidden="true" /></span>
          <div>
            <h3>{L("Your records are yours alone", "உங்கள் பதிவுகள் உங்களுக்கு மட்டுமே")}</h3>
            <p>{L("Every trader's data is isolated — no one else can see your farmers, prices or profit. Read our", "ஒவ்வொரு வியாபாரியின் தரவும் தனிமைப்படுத்தப்பட்டுள்ளது — உங்கள் விவசாயிகள், விலைகள், லாபத்தை வேறு யாரும் பார்க்க முடியாது. எங்கள்")} <Link href="/privacy">{L("Privacy Policy", "தனியுரிமைக் கொள்கையை")}</Link> {L("and", "மற்றும்")} <Link href="/terms">{L("Terms", "விதிமுறைகளை")}</Link> {L("anytime.", "எப்போது வேண்டுமானாலும் படியுங்கள்.")}</p>
          </div>
        </div>
      </section>

      <section className="landing-final reveal">
        <h2>{L("Ready to know your real profit?", "உங்கள் உண்மையான லாபத்தை அறியத் தயாரா?")}</h2>
        <p>{L("Set up your trader workspace in minutes — free for 9 days.", "நிமிடங்களில் உங்கள் வியாபாரி பணியிடத்தை அமைக்கவும் — 9 நாட்களுக்கு இலவசம்.")}</p>
        <Link className="landing-btn solid big" href={session ? "/dashboard" : "/login"}>{primaryCta.label}</Link>
      </section>

      <footer className="landing-foot">
        <div className="landing-brand"><span className="brand-mark small"><Sprout size={16} strokeWidth={2.4} aria-hidden="true" /></span><strong>COCONUT TRADE DESK</strong></div>
        <div className="foot-links">
          <Link href="/login">{L("Sign in", "உள்நுழைக")}</Link>
          <Link href="/privacy">{L("Privacy", "தனியுரிமை")}</Link>
          <Link href="/terms">{L("Terms", "விதிமுறைகள்")}</Link>
          <span className="foot-lang"><Languages size={15} aria-hidden="true" /><LanguageToggle /></span>
        </div>
        <span className="foot-copy">© {new Date().getFullYear()} Coconut Trade Desk</span>
      </footer>
    </main>
  );
}
