# Launch tasks — Coconut Trade Desk (bizztrack.in)

This folder tracks everything that is **still remaining** before/after launch, plus anything
that must be **submitted to Google or other outside platforms** (sitemaps, Search Console,
verification, etc.).

> **For Claude:** When the user asks "what's left to launch?", or for "the reports / things to
> submit to Google and other platforms", read this file (and the linked files) and tell them
> exactly what is pending and the steps — do not answer from memory. Update the status here
> whenever a task is finished.

Status: ✅ done · 🟡 in progress · ⬜ not started · 💤 later (deferred on purpose)

---

## A. Search engines & "things to submit to Google"  → see [google-search-console.md](google-search-console.md)

| # | Task | Status | Notes |
|---|------|--------|-------|
| A1 | Build `app/sitemap.ts` (generates `/sitemap.xml`) | 💤 later | Public pages only: `/`, `/login`, `/privacy`, `/terms`. Not `/v2/*` or `/admin`. |
| A2 | Build `app/robots.ts` (generates `/robots.txt`) | 💤 later | Allow public pages; disallow `/v2` and `/admin`; link the sitemap. |
| A3 | Verify **bizztrack.in** in **Google Search Console** | ⬜ not started | Ownership check (DNS TXT at GoDaddy, or HTML tag). |
| A4 | Submit the sitemap URL in Search Console | ⬜ not started | `https://bizztrack.in/sitemap.xml` — needs A1 deployed first. |
| A5 | (Optional) Bing Webmaster Tools | 💤 later | Same sitemap; can import from Search Console. |
| A6 | (Optional) Social preview tags (Open Graph / Twitter) | 💤 later | Nicer link cards when the site is shared on WhatsApp etc. |

## B. Analytics polish (GA4 + Clarity)

| # | Task | Status | Notes |
|---|------|--------|-------|
| B1 | Google Analytics (GA4) installed & live | ✅ done | ID `G-MQXYN7P8KL`. Every page + SPA route change tracked. |
| B2 | Microsoft Clarity installed & live | ✅ done | ID `z2i73722ls`. Records all public + app pages. |
| B3 | Exclude `/admin` from GA + Clarity | ✅ done | `app/Analytics.tsx` returns nothing on `/admin*`. |
| B4 | GA4: turn OFF "Page changes based on browser history events" | ⬜ not started | GA → Admin → Data streams → web stream → Enhanced measurement (⚙️) → Page views → Show advanced → untick → Save. Avoids double-counting (the app sends its own page_view per screen). |
| B5 | GA4: set up Key Events (conversions) | 💤 later | e.g. sign-up / start-trial, once those flows are final. |

## C. Authentication roadmap  (plan: `.claude/plans/quiet-crafting-thimble.md`)

| # | Task | Status | Notes |
|---|------|--------|-------|
| C1 | Phase 1 — Google + email/password + email OTP + forgot password | ✅ done | Live on bizztrack.in. |
| C2 | Email system built (Resend) — needs config | 🟡 needs setup | Code shipped 2026-10-30 (welcome, login alert, subscription receipt; `app/lib/email.ts` + `/api/account/notify`). **To turn on:** (1) verify `bizztrack.in` in Resend (add DKIM/SPF at GoDaddy), (2) add `RESEND_API_KEY` + `EMAIL_FROM` in Vercel (Production) and redeploy, (3) set Resend as Supabase **Custom SMTP** (Auth→SMTP) so signup/reset **code** emails deliver reliably. Inert until the key is set. |
| C3 | Phase 2 — phone / SMS OTP | 💤 later | Paid in India (DLT registration + per-SMS cost). Prerequisite for farmer phone login. |
| C4 | Phase 3 — farmer self-serve login | 💤 later | Reuse existing DB scaffolding (`farmer_access_requests`, phone-match triggers, farmer-read RLS). |

## D. Billing (Razorpay — ₹499/month, 14-day trial)

| # | Task | Status | Notes |
|---|------|--------|-------|
| D1 | Confirm Razorpay checkout + webhook flow is complete and tested | 🟡 verify | Env vars present in Vercel (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_ID`, `RAZORPAY_WEBHOOK_SECRET`). Verify end-to-end before charging real cards. |

## E. Infrastructure / housekeeping

| # | Task | Status | Notes |
|---|------|--------|-------|
| E1 | Custom domain bizztrack.in — primary, HTTPS, www → apex redirect | ✅ done | |
| E2 | (Optional) Clear Vercel "DNS Change Recommended" banner | 💤 later | At GoDaddy: A `@` → `216.198.79.1`, CNAME `www` → `bcb7c06ced769f32.vercel-dns-017.com`. Legacy records still work; cosmetic only. |
| E3 | Free Supabase project idle-pause risk | ⬜ watch | Free projects pause after ~7 days idle; move to paid before real customers depend on it. |

---

_Last updated: 2026-10-24._
