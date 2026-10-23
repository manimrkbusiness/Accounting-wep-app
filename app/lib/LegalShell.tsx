"use client";

import Link from "next/link";
import { Sprout } from "lucide-react";
import { LanguageToggle, useLang } from "./i18n";

const legalCss = `
.legal { color:#16271e; max-width:820px; margin:0 auto; padding:0 20px 80px; }
.legal-top { align-items:center; display:flex; justify-content:space-between; gap:12px; padding:18px 0; }
.legal-brand { align-items:center; color:#15402a; display:flex; font-size:0.8rem; font-weight:800; gap:9px; letter-spacing:0.04em; }
.legal-brand .brand-mark { background:linear-gradient(150deg,#39a865,#1d6b3f); border-radius:8px; color:#fff; display:grid; height:30px; place-items:center; width:30px; }
.legal-top-actions { align-items:center; display:flex; gap:12px; }
.legal-back { color:#5a6b61; font-size:0.86rem; font-weight:600; }
.legal-body h1 { font-size:2rem; letter-spacing:-0.02em; margin:14px 0 6px; }
.legal-updated { color:#5a6b61; font-size:0.86rem; margin:0 0 10px; }
.legal-intro { background:#f4f8f4; border:1px solid #e2ebe4; border-radius:12px; color:#3f5247; font-size:0.9rem; line-height:1.55; padding:14px 16px; margin:14px 0 24px; }
.legal-body h2 { font-size:1.18rem; margin:30px 0 8px; }
.legal-body h3 { font-size:1rem; margin:18px 0 6px; }
.legal-body p, .legal-body li { color:#2c3b33; font-size:0.96rem; line-height:1.65; }
.legal-body ul { margin:8px 0; padding-left:22px; }
.legal-body li { margin:5px 0; }
.legal-body a { color:#1f7a46; font-weight:600; }
.legal-body strong { color:#16271e; }
.legal-foot { border-top:1px solid #e2ebe4; color:#5a6b61; display:flex; flex-wrap:wrap; gap:16px; justify-content:space-between; margin-top:40px; padding-top:18px; font-size:0.86rem; }
.legal-foot a { color:#5a6b61; font-weight:600; }
`;

export function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  const { lang } = useLang();
  const L = (en: string, ta: string) => (lang === "ta" ? ta : en);
  return (
    <main className="legal">
      <style>{legalCss}</style>
      <header className="legal-top">
        <Link className="legal-brand" href="/"><span className="brand-mark"><Sprout size={17} strokeWidth={2.4} aria-hidden="true" /></span><strong>COCONUT TRADE DESK</strong></Link>
        <div className="legal-top-actions"><LanguageToggle /><Link className="legal-back" href="/">← {L("Home", "முகப்பு")}</Link></div>
      </header>
      <article className="legal-body">
        <h1>{title}</h1>
        <p className="legal-updated">{updated}</p>
        <p className="legal-intro">{L("This page is provided in English and Tamil for your understanding. The English version is the authoritative one; if there is any conflict, the English text prevails.", "இந்தப் பக்கம் உங்கள் புரிதலுக்காக ஆங்கிலம் மற்றும் தமிழில் வழங்கப்படுகிறது. ஆங்கிலப் பதிப்பே அதிகாரப்பூர்வமானது; முரண்பாடு இருந்தால் ஆங்கில உரையே செல்லுபடியாகும்.")}</p>
        {children}
      </article>
      <footer className="legal-foot">
        <span>© {new Date().getFullYear()} Coconut Trade Desk</span>
        <span><Link href="/privacy">{L("Privacy", "தனியுரிமை")}</Link> · <Link href="/terms">{L("Terms", "விதிமுறைகள்")}</Link> · <Link href="/login">{L("Sign in", "உள்நுழைக")}</Link></span>
      </footer>
    </main>
  );
}
