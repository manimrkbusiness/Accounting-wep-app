# Google Search Console + sitemap — step by step

Goal: get **bizztrack.in** indexed by Google so people can find it in search, and give Google a
map of the public pages.

> Order matters: build & deploy the sitemap (steps 1–2) **before** submitting it (step 5).

## 1. Build the sitemap + robots files (developer task — currently 💤 deferred)

Two small files in `app/`:

- **`app/sitemap.ts`** → serves `https://bizztrack.in/sitemap.xml`. List **public** pages only:
  `/`, `/login`, `/privacy`, `/terms`. Do **not** list `/v2/*` (private workspace) or `/admin`.
- **`app/robots.ts`** → serves `https://bizztrack.in/robots.txt`. Allow the public pages,
  `Disallow: /v2` and `Disallow: /admin`, and point to the sitemap URL.

(Next.js generates both from these files automatically — no manual XML.)

## 2. Deploy

Push to `main`; Vercel builds. Then confirm both load:
- `https://bizztrack.in/sitemap.xml`
- `https://bizztrack.in/robots.txt`

## 3. Open Google Search Console

Go to <https://search.google.com/search-console>, sign in with the Google account you want to own
the property, and add a property.

- Choose **URL prefix** and enter `https://bizztrack.in` (simplest), **or**
- Choose **Domain** (covers www + apex + http/https) — this one requires a DNS TXT record.

## 4. Verify ownership

Easiest options:
- **HTML tag** (URL-prefix property): Google gives a `<meta name="google-site-verification" ...>`
  tag → add it to the site `<head>` (via `app/layout.tsx` metadata `verification.google`), deploy,
  then click Verify.
- **DNS TXT** (Domain property): Google gives a `TXT` value → add it at **GoDaddy** (Name `@`,
  the value Google shows), wait a few minutes, click Verify.

## 5. Submit the sitemap

In Search Console → **Sitemaps** → enter `sitemap.xml` → **Submit**. Google will fetch
`https://bizztrack.in/sitemap.xml` and start indexing. Indexing takes days to a couple of weeks.

## 6. (Optional) Request indexing for the home page

Search Console → **URL Inspection** → paste `https://bizztrack.in/` → **Request indexing** to nudge
the home page to the front of the queue.

---

### Quick checklist
- [ ] `app/sitemap.ts` + `app/robots.ts` built and deployed
- [ ] `sitemap.xml` and `robots.txt` load on bizztrack.in
- [ ] Property added in Search Console
- [ ] Ownership verified
- [ ] Sitemap submitted
- [ ] (optional) Home page indexing requested
