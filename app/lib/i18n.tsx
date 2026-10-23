"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "en" | "ta";

type Entry = { en: string; ta: string };

/**
 * Shared UI strings (chrome, nav, buttons). Long-form marketing/legal copy lives inside each page
 * and is rendered bilingually there. The trader can switch language in Settings; it is remembered
 * in the browser.
 */
const strings: Record<string, Entry> = {
  // Common chrome
  "common.signIn": { en: "Sign in", ta: "உள்நுழைக" },
  "common.signUp": { en: "Sign up", ta: "பதிவு செய்க" },
  "common.getStarted": { en: "Get started free", ta: "இலவசமாக தொடங்குங்கள்" },
  "common.openWorkspace": { en: "Open workspace", ta: "பணியிடத்தைத் திறக்க" },
  "common.language": { en: "Language", ta: "மொழி" },
  "common.back": { en: "Back", ta: "பின்செல்" },
  "lang.en": { en: "English", ta: "English" },
  "lang.ta": { en: "தமிழ் (Tamil)", ta: "தமிழ்" },
  // Navigation (used by the workspace sidebar)
  "nav.dashboard": { en: "Dashboard", ta: "டாஷ்போர்டு" },
  "nav.harvesting": { en: "Coconut Harvesting", ta: "தென்னை அறுவடை" },
  "nav.purchases": { en: "Coconut purchases", ta: "தேங்காய் கொள்முதல்" },
  "nav.stock": { en: "Stock", ta: "கையிருப்பு" },
  "nav.sales": { en: "Coconut sales", ta: "தேங்காய் விற்பனை" },
  "nav.huskPurchase": { en: "Husk purchase", ta: "மட்டை கொள்முதல்" },
  "nav.huskSale": { en: "Husk sale", ta: "மட்டை விற்பனை" },
  "nav.farmers": { en: "Farmers", ta: "விவசாயிகள்" },
  "nav.buyers": { en: "Buyers", ta: "வாங்குபவர்கள்" },
  "nav.team": { en: "Team & vehicles", ta: "குழு & வாகனங்கள்" },
  "nav.expenses": { en: "Expenses", ta: "செலவுகள்" },
  "nav.transactions": { en: "Transactions", ta: "பரிவர்த்தனைகள்" },
  "nav.cash": { en: "Cash book", ta: "பணப் புத்தகம்" },
  "nav.settings": { en: "Settings", ta: "அமைப்புகள்" }
};

type LangContextValue = { lang: Lang; setLang: (lang: Lang) => void; t: (key: string) => string };

const LangContext = createContext<LangContextValue>({ lang: "en", setLang: () => {}, t: (key) => key });

export const LANG_STORAGE_KEY = "ctd-lang";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANG_STORAGE_KEY);
      if (stored === "en" || stored === "ta") {
        setLangState(stored);
        document.documentElement.lang = stored;
      }
    } catch {
      // ignore unavailable storage
    }
  }, []);

  const setLang = (next: Lang) => {
    setLangState(next);
    try { localStorage.setItem(LANG_STORAGE_KEY, next); } catch { /* ignore */ }
    try { document.documentElement.lang = next; } catch { /* ignore */ }
  };

  const t = (key: string) => strings[key]?.[lang] ?? strings[key]?.en ?? key;

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

/** Small language toggle used in the landing header and Settings. */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`lang-toggle ${className}`} role="group" aria-label="Language">
      <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")} type="button">EN</button>
      <button className={lang === "ta" ? "active" : ""} onClick={() => setLang("ta")} type="button">த</button>
    </div>
  );
}
