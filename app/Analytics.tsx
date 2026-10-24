"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

// IDs come from Vercel env vars so nothing loads until they are set (and no secrets are in code).
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Sends a GA4 page_view on every client-side route change. The gtag `config` already sends the
 * first page_view on load, so this skips its initial run and covers SPA navigations after that —
 * which is what makes every /dashboard/* view (and query-string change) show up in Analytics.
 */
function GaRouteTracker({ gaId }: { gaId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    const query = searchParams?.toString();
    const path = query ? `${pathname}?${query}` : pathname;
    window.gtag("event", "page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
      send_to: gaId
    });
  }, [gaId, pathname, searchParams]);

  return null;
}

/** Google Analytics (GA4) + Microsoft Clarity, mounted once in the root layout. */
export function Analytics() {
  const pathname = usePathname();
  // The /admin control panel is an internal tool — never load analytics or session
  // recording there. This also keeps admin visits out of GA and Clarity numbers.
  if (pathname && pathname.startsWith("/admin")) return null;

  return (
    <>
      {GA_ID ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}</Script>
          <Suspense fallback={null}><GaRouteTracker gaId={GA_ID} /></Suspense>
        </>
      ) : null}
      {CLARITY_ID ? (
        <Script id="ms-clarity" strategy="afterInteractive">{`
          (function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "${CLARITY_ID}");
        `}</Script>
      ) : null}
    </>
  );
}
