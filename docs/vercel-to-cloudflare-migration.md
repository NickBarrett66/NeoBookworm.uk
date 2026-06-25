# NeoBookworm.uk — Vercel → Cloudflare Migration

**Goal:** Move neobookworm.uk off Vercel onto a single Cloudflare Worker with Static Assets, with a thin Vercel "SMTP bridge" for the code that needs TCP email sending (nodemailer). The two standalone Workers already on Cloudflare (`landing-enquiry`, `booking`) are untouched.

**Agreed approach:** Option A — thin Vercel bridge.

**DNS:** The original "keep DNS at Krystal" intent proved incompatible with apex-on-Pages (verified 2026-06-25 — see Phase 0 / decision D3). The DNS **zone moves to Cloudflare** (registration stays at Krystal). Google Workspace email records carry over unchanged and must be verified on import.

---

## Architecture after migration

```
DNS zone: Cloudflare (moved from Krystal in Phase 0 — registration stays at Krystal)
  ├── neobookworm.uk         → Cloudflare Worker (static + routes)  [apex via CNAME-flattening]
  ├── www.neobookworm.uk     → Cloudflare Worker (CNAME)
  ├── bridge.neobookworm.uk  → Vercel (CNAME — the SMTP bridge)
  ├── MX / SPF / DKIM / DMARC → Google Workspace (carried over from Krystal, unchanged)
  └── (later) booking. / api. → Workers custom domains (now unblocked)

Cloudflare Worker + Static Assets (neobookworm.uk) — ONE Worker
  ├── Static files (all HTML/CSS/JS/images — served from repo root via env.ASSETS;
  │   non-static dirs excluded by .assetsignore)
  │
  ├── worker/index.js — entry: `export default { fetch }` + router on URL.pathname
  │
  ├── Ported logic route handlers (worker/routes/):
  │   ├── portal.js          ← portal.js          (/c/:slug + sub-paths)
  │   ├── portal-action.js   ← portal-action.js   (/c/:slug/action)
  │   ├── dashboard.js       ← dashboard.js       (/api/dashboard)
  │   ├── intake.js          ← intake.js          (/api/intake + rewrite aliases)
  │   ├── run-site-audit.js  ← run-site-audit.js  (/api/run-site-audit)
  │   ├── booking-asset.js   ← booking-asset.js   (/api/booking-asset)
  │   └── reg-lookup.js      ← reg-lookup.js      (/api/reg-lookup)
  │
  └── SMTP forwarder route handlers (CRITICAL — see "The same-origin problem"):
      ├── contact.js              → forwards to bridge   (/api/contact)
      ├── he-tyres-enquiry.js     → forwards to bridge   (/api/he-tyres-enquiry)
      ├── notify-landing-enquiry.js → forwards to bridge (/api/notify-landing-enquiry)
      └── notify-booking.js       → forwards to bridge   (/api/notify-booking)

Vercel (thin SMTP bridge — repurposed existing project, reachable at bridge.neobookworm.uk)
  ├── api/contact.js               (iCloud SMTP — public contact form)
  ├── api/he-tyres-enquiry.js      (iCloud SMTP — HE Tyres form)
  ├── api/notify-landing-enquiry.js (iCloud SMTP — landing-enquiry Worker, via forwarder)
  ├── api/notify-booking.js        (GW SMTP — booking Worker, via forwarder)
  └── api/send-email.js            (GW SMTP — NEW; called by the Worker's logic routes)

Cloudflare Workers (separate, unchanged)
  ├── neobookworm-landing-enquiry.nickbarrett.workers.dev
  └── neobookworm-booking.nickbarrett.workers.dev
```

> **Platform note (decision D1, resolved 2026-06-25):** the site is deployed as a **single Cloudflare Worker with Static Assets**, not Cloudflare Pages. Pages is in maintenance mode; Workers is the actively-developed path, lets `.assetsignore` cleanly exclude `api/`/`workers/`/`docs/` from the static upload (no `dist/` build step), and matches the Worker model the existing `landing-enquiry`/`booking` Workers already use. Throughout this doc, "route handler" = a module under `worker/routes/` dispatched by the router in `worker/index.js`. The function *logic* ported is identical to what it would have been on Pages — only the handler wrapper and routing differ.

### Why the bridge is needed

The Worker runtime cannot open TCP connections to SMTP ports (587/465). Nodemailer requires TCP. So any code that sends email via nodemailer must stay on Vercel (or call a Vercel endpoint that does it). The new `send-email.js` endpoint is the bridge for onboarding emails sent from the Worker's logic routes.

### The same-origin problem (the critical issue this review caught)

**The original draft was wrong to assume the 4 existing SMTP functions could simply "stay on Vercel".** Every caller of those functions uses a hardcoded same-origin URL `https://neobookworm.uk/api/...`:

| Caller | Hardcoded URL | File |
|---|---|---|
| Contact form (browser) | `/api/contact` | `contact.html:1165` |
| HE Tyres form (browser) | `/api/he-tyres-enquiry` | `he-tyres/index.html:1749` |
| landing-enquiry Worker | `https://neobookworm.uk/api/notify-landing-enquiry` | `workers/landing-enquiry/src/email.js:35`, `scheduled.js:119` |
| booking Worker | `https://neobookworm.uk/api/notify-booking` | `workers/booking/src/email.js:1` |

The moment `neobookworm.uk` DNS points at the Cloudflare Worker, **all four of these requests hit the Worker, not Vercel.** If the Worker has nothing at those paths, contact emails, HE Tyres enquiries, landing-enquiry notifications and booking confirmations all silently break.

**Two ways to solve it:**

- **Option 1 — Forwarder route handlers (CHOSEN).** Give the Worker a route at each of the four paths that forwards the request (method, body, and the `X-Notify-Secret` / `Content-Type` headers) to the Vercel bridge, and returns the bridge's response. **No changes to the other Workers, no frontend changes** — every caller keeps using `neobookworm.uk/api/...`. This keeps the brief's "Workers untouched" guarantee intact (the two standalone Workers stay as-is).
- **Option 2 — Repoint the callers.** Change the hardcoded URLs in both standalone Workers and both HTML forms to `https://bridge.neobookworm.uk/api/...` and redeploy. Rejected: it touches the "untouched" Workers, needs CORS on the bridge for the browser forms, and scatters the bridge URL across four codebases.

We use **Option 1**. The forwarder routes are added in Phase 4b and must be live before DNS cutover (Phase 7).

> Note: the `reg-lookup`, `onboarding-intake` (intake `?action=onboarding`) and `run-site-audit` paths are *also* called by the standalone Workers at `https://neobookworm.uk/api/...`, but those are being ported to logic routes on the new Worker, so after cutover the callers correctly reach the new versions at the same path. No forwarder needed for those — they are real ports, not bridges.

---

## Decisions to confirm before Phase 1

These came out of the technical review and change the manual steps. Resolve them first.

### D1 — Platform — RESOLVED: Workers Static Assets

**Decision (Nick, 2026-06-25): deploy as a single Cloudflare Worker with Static Assets, not Pages.** Rationale: Pages is in maintenance mode (Workers gets all new investment and has feature parity for static + SSR + custom domains as of early 2026); `.assetsignore` cleanly excludes `api/`/`workers/`/`docs/`/`scripts/`/`*.md` from the static upload so there is no `dist/` build step or source-leak risk; and it matches the Worker model the existing `landing-enquiry`/`booking` Workers already use. The cost — one router file instead of file-per-endpoint routing — is small and has an in-repo precedent (`workers/booking/src/index.js`). This document is written for the Workers path.

### D2 — Bridge hostname — RESOLVED: `bridge.neobookworm.uk`

**Decision (Nick, 2026-06-25).** The bridge is reachable at `bridge.neobookworm.uk` — a CNAME to Vercel created in the now-Cloudflare zone, added as a custom domain on the repurposed Vercel project, with `VERCEL_BRIDGE_URL=https://bridge.neobookworm.uk` in the Worker env. (The `*.vercel.app` URL is the fallback only.)

### D3 — Apex DNS — RESOLVED: move zone to Cloudflare

**Verified 2026-06-25.** Krystal's DNS supports only A/CNAME/MX/TXT (no ALIAS/ANAME/CNAME-flattening), and Cloudflare Pages publishes no static apex A-record IP — so the bare apex cannot point at Pages while DNS stays at Krystal. **Decision (Nick): move the DNS zone to Cloudflare** (registration stays at Krystal; nameservers change). This is now **Phase 0** and must complete (with Google Workspace email verified) before the Phase 7 apex repoint. It also unblocks `booking.neobookworm.uk` / `api.neobookworm.uk`.

---

## Gotchas caught in the fresh review (2026-06-25)

These are live-environment hazards specific to the fact that **the same repo currently auto-deploys to production on Vercel from `main`**. They are woven into the phases below, but collected here so none is missed.

### G1 — WIP commits go live on Vercel; `worker/` would leak as source *(HIGH)*
Vercel rebuilds and deploys the live site on every push to `main`. There is **no `.vercelignore`** today. So the moment Phase 3–5 add `worker/index.js` etc., Vercel serves them as static files at `https://neobookworm.uk/worker/index.js` — source-leak on the live site. Two mitigations, do both:
- **Do the migration on a feature branch**, not `main`. Only merge to `main` (→ Vercel) when you deliberately want something live — notably `api/send-email.js` (Phase 2), which *must* reach Vercel before Phase 7.
- **Add a `.vercelignore`** (Phase 2) listing `worker/`, `wrangler.toml`, `.assetsignore`, `_redirects`, `_headers`, `docs/` so Vercel never serves or builds them even if they land on `main`. (`_redirects`/`_headers` are harmless on Vercel but tidier ignored.)

### G2 — Vercel's 12-function Hobby limit *(MEDIUM)*
There are **11** functions in `api/` today. Adding `api/send-email.js` (Phase 2) makes **12 — exactly the Hobby ceiling.** It will deploy, but there is **zero headroom**: any stray new function fails the Vercel build until Phase 8 deletes the seven migrated ones. Don't add anything else to `api/` mid-migration.

### G3 — Workers plan + bundle size *(LOW — measured, fits free plan)*
The one Worker bundles `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` + `@anthropic-ai/sdk`. The compressed-size limit is **3 MB free / 10 MB paid**. **Measured 2026-06-25** (esbuild bundle of the exact APIs used, gzipped): **~188 KB — about 6% of the free limit**, ~2.9 MB headroom before route code. So this is *not* a blocker on either plan; the raw `node_modules` size is misleading because tree-shaking + gzip collapse it. No need for aws4fetch / fetch-based rewrites for size reasons. Still worth a `wrangler deploy --dry-run --outdir=.wrangler-build` sanity check at Phase 6, and confirm the plan covers the request volume you want (free = 100k Worker invocations/day; static-asset requests are free/unlimited). If it were ever tight, remedies in order: Paid plan → `aws4fetch` instead of the AWS SDK → call the Anthropic REST API with `fetch` → split into two Workers. (Lazy `import()` does **not** help — Workers count dynamic imports toward script size.)

### G4 — `run-site-audit` long Claude call vs Worker limits *(MEDIUM)*
The audit crawls pages and calls Claude — can run many seconds. Workers bill **CPU time, not I/O wait**, so awaiting a slow `fetch` is usually fine (often *better* than Vercel's wall-clock function timeout). But confirm the audit doesn't do heavy synchronous CPU work, and consider `ctx.waitUntil()` if the dashboard "Re-run" button doesn't need to block on the result. Test a real audit on the workers.dev URL in Phase 5/7.

### G5 — `reg-lookup` CORS must stay `*` in the port *(MEDIUM)*
`api/reg-lookup.js` sets `Access-Control-Allow-Origin: *` and the booking widget calls it **cross-origin** from embeds (e.g. the HE Tyres site, `workers/booking/src/ui.js:1184`). The ported `worker/routes/reg-lookup.js` must return that `*` CORS header itself (the `_headers` file only covers static responses, not the route's own `Response`). Miss this and cross-origin reg lookups break on embedded booking widgets.

---

## Environment variables

### Worker project (Cloudflare dashboard → Workers & Pages → the Worker → Settings → Variables, or `wrangler secret put`)

Plain vars can go in `wrangler.toml` `[vars]`; secrets should use `wrangler secret put` or the dashboard "Encrypt" option. Do **not** commit secrets to `wrangler.toml`.

> **You cannot pull these values from Vercel** (confirmed 2026-06-25). The vars are Vercel "Sensitive" type — write-only; `vercel env pull` returns the names with **empty** values. Get each value from the **recovery sheet** below (Nick's own secret store is the primary source; the bridge's own copies stay live on Vercel untouched).

| Variable | Purpose | Source |
|---|---|---|
| `CF_API_TOKEN` | D1 REST API queries (until native bindings are wired) | See recovery sheet ↓ |
| `ANTHROPIC_API_KEY` | Claude site audit | See recovery sheet ↓ |
| `R2_ACCESS_KEY_ID` | R2 uploads (intake) | See recovery sheet ↓ |
| `R2_SECRET_ACCESS_KEY` | R2 uploads | See recovery sheet ↓ |
| `R2_BUCKET_NAME` | R2 uploads | See recovery sheet ↓ |
| `R2_PUBLIC_URL` | R2 public base URL | See recovery sheet ↓ |
| `R2_ENDPOINT` or `R2_ACCOUNT_ID` | R2 endpoint | See recovery sheet ↓ |
| `INTAKE_UPLOAD_SECRET` | HMAC signing for presigned URLs | See recovery sheet ↓ |
| `DASHBOARD_SECRET` | Admin API Bearer token | See recovery sheet ↓ |
| `ONBOARDING_INTAKE_SECRET` | standalone-Worker→new-Worker callback auth | See recovery sheet ↓ |
| `BOOKING_ADMIN_SECRET` | Dashboard→booking Worker auth | See recovery sheet ↓ |
| `BOOKING_WORKER_URL` | Booking Worker base URL | See recovery sheet ↓ (optional) |
| `VERCEL_BRIDGE_URL` | Base URL of Vercel SMTP bridge (`https://bridge.neobookworm.uk`, no trailing slash) | NEW — set after bridge custom domain is live |
| `BRIDGE_SECRET` | Shared secret for Worker→bridge `send-email` calls (must match Vercel) | NEW — generate a strong random string |

### Vercel bridge project (keep existing env vars, add one)

| Variable | Action |
|---|---|
| `SMTP_HOST/PORT/USER/PASS` | Keep — iCloud SMTP |
| `TO_EMAIL` | Keep |
| `GW_SMTP_USER` | Keep — Google Workspace SMTP |
| `GW_SMTP_PASS` | Keep |
| `NOTIFY_SECRET` | Keep — landing-enquiry Worker calls this |
| `NOTIFY_BOOKING_SECRET` | Keep — booking Worker calls this |
| `CF_API_TOKEN` | Keep — used by send-email bridge for D1 email_log writes |
| `HE_TYRES_TO_EMAIL` | Keep |
| `BRIDGE_SECRET` | NEW — shared secret between the Worker routes and send-email.js |

Variables to **remove from Vercel** after migration is complete (Phase 7):
`ANTHROPIC_API_KEY`, `R2_*`, `INTAKE_UPLOAD_SECRET`, `DASHBOARD_SECRET`, `ONBOARDING_INTAKE_SECRET`, `BOOKING_ADMIN_SECRET`

### Worker env-var recovery sheet

Vercel's Sensitive vars can't be read back, so source each value as below. **Primary source = Nick's own secret store** (the values were saved there — just retrieve them; no rotation needed). The "fallback" column is only if a value turns out to be missing from the store. The bridge keeps its own copies live on Vercel — these are only for the **new Worker**.

| Variable | Known value (use directly) | Retrieve from store? | Fallback if missing |
|---|---|---|---|
| `CF_ACCOUNT_ID` | `4f0a019a24cacd090cf6b3c3cf31c732` | — | — |
| `R2_ACCOUNT_ID` | = `CF_ACCOUNT_ID` | — | — |
| `D1_ENQUIRIES_ID` | `771b3047-f977-485e-9cfb-736815931998` | — | — |
| `D1_PROSPECTS_ID` | `0ae32598-1680-4995-a010-96b647eacabd` | — | — |
| `R2_BUCKET_NAME` | `neo-bookworm-uk` | — | — |
| `BOOKING_WORKER_URL` | `https://neobookworm-booking.nickbarrett.workers.dev` | — | — |
| `VERCEL_BRIDGE_URL` | `https://bridge.neobookworm.uk` | — | — (new) |
| `R2_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` (`.eu.` if EU bucket) | confirm against R2 bucket settings | read from R2 dashboard |
| `R2_PUBLIC_URL` | — | ✅ from store | read from R2 bucket public-URL/custom-domain settings |
| `CF_API_TOKEN` | — | ✅ from store | regenerate: Cloudflare → My Profile → API Tokens |
| `ANTHROPIC_API_KEY` | — | ✅ from store | regenerate: Anthropic Console → API Keys |
| `R2_ACCESS_KEY_ID` | — | ✅ from store | regenerate: Cloudflare → R2 → Manage API Tokens |
| `R2_SECRET_ACCESS_KEY` | — | ✅ from store | regenerate (shown once, with the key above) |
| `INTAKE_UPLOAD_SECRET` | — | ✅ from store | set a new arbitrary string (self-contained to the app) |
| `DASHBOARD_SECRET` | — | ✅ from store | set new (you type it to log into `dashboard.html`) |
| `ONBOARDING_INTAKE_SECRET` | — | ✅ from store | **rotate on both**: new value on Worker + `wrangler secret put` on `landing-enquiry` Worker |
| `BOOKING_ADMIN_SECRET` | — | ✅ from store | **rotate on both**: new value on Worker + `wrangler secret put ADMIN_SECRET` on `booking` Worker |
| `BRIDGE_SECRET` | — | — | **new**: generate a strong random string; set the same value on the Vercel bridge |

Skip entirely (Notion retired): `NOTION_API_KEY`, `NOTION_INTAKE_DATABASE_ID`. Bridge-only (already live on Vercel, not needed on the Worker): `SMTP_*`, `GW_SMTP_*`, `TO_EMAIL`, `HE_TYRES_TO_EMAIL`, `NOTIFY_SECRET`, `NOTIFY_BOOKING_SECRET` — plus `BRIDGE_SECRET` is **added** to the bridge.

---

## Progress tracker

| Phase | Description | Status |
|---|---|---|
| 0 | **Move DNS zone to Cloudflare** + verify Google Workspace email imports | ✅ Done 2026-06-26 |
| 1 | Static routing files (`_redirects`, `_headers`) | ✅ Done 2026-06-25 |
| 2 | Vercel bridge: add `api/send-email.js` (the `bridge.` custom domain is set up in Phase 7) | ✅ Done 2026-06-25 |
| 3 | Port `_lib` helpers to ES modules (`worker/_lib/`) | Not started |
| 4 | Worker entry + router; port simple routes (`reg-lookup`, `booking-asset`, `portal` + sub-paths) | Not started |
| 4b | **SMTP forwarder routes** (`contact`, `he-tyres-enquiry`, `notify-landing-enquiry`, `notify-booking`) | Not started |
| 5 | Port complex routes (`portal-action`, `intake`, `run-site-audit`, `dashboard`) | Not started |
| 6 | Worker config (`wrangler.toml`, `.assetsignore`, assets/clean-URL settings) | Not started |
| 7 | Deploy, smoke-test, cut over DNS | Not started |
| 8 | Cleanup — remove migrated functions from Vercel, update CLAUDE.md | Not started |

### Production-risk rating (1 = no prod impact, 10 = could take the live site/email down)

| Phase | Prod-risk | Why |
|---|---|---|
| 0 — DNS zone → Cloudflare | **7** | Touches live email DNS (MX/SPF/DKIM/DMARC). A missed record on import breaks Google Workspace mail at nameserver flip. Website itself stays on Vercel, so web risk is low — email is the exposure. Mitigated by the save-and-reconcile + verify steps. |
| 1 — `_redirects`/`_headers` | **1** | Inert files Vercel ignores; nothing serves them until the Worker exists. |
| 2 — `api/send-email.js` | **3** | New file deploys live to Vercel. Self-contained + auth-gated, but it (a) brings Vercel to the 12-function limit (G2) and (b) is the first WIP that reaches `main` — handle `.vercelignore`/branch here (G1). |
| 3 — `_lib` → ESM | **1** | New files under `worker/`; not executed by anything live. Only risk is the source-leak if served by Vercel — neutralised by `.vercelignore`/branch (G1). |
| 4 — Worker entry + simple routes | **1** | Same as 3 — code exists but nothing routes to it until Phase 7. |
| 4b — SMTP forwarders | **1** | Same — inert until the Worker is the origin. |
| 5 — Complex routes | **1** | Same. Highest *porting* difficulty (dashboard/intake/audit) but zero live impact pre-cutover. |
| 6 — Worker config + first deploy | **2** | `wrangler deploy` creates a Worker on a `*.workers.dev` URL — **not** on your domain, so the live site is untouched. Bundle size measured fine (G3), so the main risk is just a config/`[assets]` misstep caught on staging. |
| 7 — Smoke-test + **apex cutover** | **8** | The actual switch. Apex repoint moves all traffic + the four email forwarders to the Worker at once. A bug in any route, a missing env var, or a broken forwarder = live breakage. Mitigated by full smoke-test on workers.dev first + fast DNS rollback. The single highest-risk step. |
| 8 — Cleanup | **2** | Post-cutover deletions on Vercel. Only risk is deleting a file still imported by a bridge function — the dependency map guards this. |

---

## Phase 0 — Move the DNS zone to Cloudflare (RESOLVED — decision made)

**Background (verified 2026-06-25):** Krystal's DNS supports only **A, CNAME, MX, TXT** — no ALIAS/ANAME/CNAME-flattening — and Cloudflare Pages provides **no static apex A-record IP** (a non-Cloudflare domain cannot CNAME to a Cloudflare target; it errors 1001). Therefore the bare apex `neobookworm.uk` **cannot** point at Pages while DNS stays at Krystal. **Decision (Nick, 2026-06-25): move the DNS zone to Cloudflare.** Domain registration stays at Krystal; only nameservers change. This also unblocks the long-planned `booking.neobookworm.uk` and `api.neobookworm.uk` custom domains (see CLAUDE.md outstanding items).

**This phase is the riskiest manual step because it touches live email DNS. Do it carefully.**

#### Captured email DNS — reconciliation checklist (verified live 2026-06-26)

Queried directly from public DNS (Google DoH), independent of any control-panel view. **All email records exist and resolve from Krystal** (authoritative NS = `ns1–ns4.kloudns.co.uk`, which is Krystal's DNS). They are all `TXT`/`MX` records — there is no record *type* literally named SPF/DKIM/DMARC, which is why they can be hard to spot in the panel (look under TXT entries, or cPanel's "Email Deliverability" tool). **After the Cloudflare import, confirm each of these is present and identical** — Cloudflare's auto-scan frequently misses the DKIM `google._domainkey` selector. All values are public DNS data (no secrets).

| Name | Type | Value |
|---|---|---|
| `@` | MX | `1 smtp.google.com` |
| `@` | TXT (SPF) | `v=spf1 include:_spf.google.com ~all` |
| `_dmarc` | TXT (DMARC) | `v=DMARC1; p=quarantine; rua=mailto:nick@neobookworm.uk; pct=100` |
| `google._domainkey` | TXT (DKIM) | `v=DKIM1;k=rsa;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAymbc9h57PVSVX1hEHrNzzXKjlthxHkYrDLbYhqSu689YQ8LY1gYarTs0Vmayny3+05Bva7apVB7981MozSBRWM9S77PZDlgHAGCk3EK5SpnZuPnm3DAzpZiCbXrxyYipV/tJkuOded6LaS2D3Njz5TpdVRV7wl/CWbhkQ1k2zybRtM6vb8ZdMEpvDLtu+4MxX4A/XlKJt2oMwSRtJFl1WyX21h7kFmKTfMpuAUUywmnL9ZUEEYg0ZqLE4zbntXc1fPaaHEdNj6zcz65cTGIh8r9m1bsH914W24Nk3OXAqKxKcb0ZcUuJRcd+GPv+blvrXb7oZfxC+4/ItmJffUbRIwIDAQAB` |
| `@` | TXT (verify) | `google-site-verification=nIsx96izq9o8hZCV6gHnojZEVvhdyZsH8mDbS6E95Wc` |
| `@` | TXT (verify) | `google-site-verification=91noMWCbHqR6iJ8QeygbcoOUiOfHeDWxA00pvv3oqUc` |

Plus the website records: apex `A` → Vercel **`216.198.79.1`** (verified from the live Krystal zone 2026-06-26; leave as-is until Phase 7 — this is what keeps the site on Vercel after the nameserver flip), and `www`, `bridge` etc. as applicable.

**Steps:**
1. **Save the current Krystal zone.** Use the captured table above as your email-records baseline, and additionally record **every other** record in the Krystal panel (apex `A`, `www`, any subdomains). Screenshot the full zone. This is the source of truth you reconcile against.
2. **Add the zone in Cloudflare** (Cloudflare dashboard → Add a site → `neobookworm.uk` → Free plan). Cloudflare auto-scans and imports existing public records.
3. **Reconcile the imported records against the captured table above.** Confirm **MX, SPF, DKIM, DMARC are all present and identical** (especially the `google._domainkey` DKIM TXT — the most commonly missed). Manually add anything Cloudflare's scan didn't pick up. **Do not skip this — a missing SPF/DKIM/MX record means Google Workspace mail breaks the moment nameservers flip.**
4. **Leave the apex A record pointing at Vercel for now** inside Cloudflare (so the live site is unaffected when nameservers flip). Set the apex/`www` to **DNS-only (grey cloud)** initially to avoid proxy surprises during cutover; you'll repoint them to the Worker in Phase 7.
5. **Flip the nameservers at the Krystal registrar** to the two Cloudflare nameservers shown. Propagation is typically 1–24h.
6. **Verify after propagation:** `dig MX neobookworm.uk`, `dig TXT neobookworm.uk`, and send a test email to + from the Google Workspace account. Confirm the website still loads (still on Vercel at this point).

**Success criteria:**
- `neobookworm.uk` is an active zone on Cloudflare.
- MX/SPF/DKIM/DMARC verified identical to the saved Krystal zone; Google Workspace send + receive tested OK.
- Website still serving from Vercel (apex A record unchanged) — nothing user-facing has changed yet.

**Only after this phase is verified do the Pages custom-domain + apex repoint happen (Phase 7).** Separating the nameserver move (Phase 0) from the apex repoint (Phase 7) means email migrates independently of the website, and either can be rolled back alone.

There is no code session prompt for this phase — it is manual dashboard work Nick performs. Record completion + the email-verification result in the decisions log before starting Phase 7's cutover.

---

## Phase 1 — Static routing files

**What:** Create `_redirects` and `_headers` in the repo root. These replace the `vercel.json` `redirects` and `headers` blocks; Workers Static Assets honours both files. Clean URLs are handled by the `[assets] html_handling` setting in `wrangler.toml` (Phase 6), not a dashboard toggle.

**Files touched:**
- `_redirects` (new)
- `_headers` (new)
- `vercel.json` — NOT touched yet (still needed while Vercel is live)

**No function code changes in this phase.**

**Success criteria:**
- `_redirects` correctly maps the 3 trailing-slash redirects
- `_headers` correctly adds CORS headers to `/api/reg-lookup`
- Both files are committed; ready to be picked up when the Worker is deployed (Workers Static Assets honours `_redirects`/`_headers` the same way Pages does)

**Session prompt:**

```
We are migrating NeoBookworm.uk from Vercel to Cloudflare (single Worker + Static Assets, NOT Pages).
Read docs/vercel-to-cloudflare-migration.md in full before starting.
Also read vercel.json.

Phase 1 only — create two files in the repo root:

1. `_redirects` — translate the three `redirects` entries in vercel.json into
   Cloudflare _redirects format (301 permanent).

2. `_headers` — translate the single `headers` entry in vercel.json
   (CORS on /api/reg-lookup) into Cloudflare _headers format.

Do NOT touch vercel.json, do NOT create any worker/ files yet,
do NOT touch any existing files. Only create these two new files.

After creating the files, confirm what each rule does and mark Phase 1
complete in the progress tracker table in docs/vercel-to-cloudflare-migration.md.
```

---

## Phase 2 — Vercel bridge: add `api/send-email.js`

**What:** Add a new Vercel endpoint that the Cloudflare Worker's routes will call to send onboarding emails via GW SMTP. The existing SMTP functions (`contact.js`, `he-tyres-enquiry.js`, `notify-landing-enquiry.js`, `notify-booking.js`) are kept exactly as-is. No existing function is deleted yet.

**Files touched:**
- `api/send-email.js` (new)
- `.vercelignore` (new — see G1) listing `worker/`, `wrangler.toml`, `.assetsignore`, `_redirects`, `_headers`, `docs/`

**⚠ Before this phase (G1/G2):**
- Strongly prefer doing all migration work on a **feature branch**; merge to `main` only what should go live. `api/send-email.js` does need to reach Vercel, so either merge just this, or accept that `main` deploys it.
- Adding `send-email.js` takes `api/` from 11 → **12 functions, the Hobby ceiling**. Do not add any further `api/` function until Phase 8 deletes the migrated ones.

**Context on what this endpoint needs to do:**

The Worker's routes will POST to `/api/send-email` with:
```json
{
  "slug": "client-slug",
  "templateId": "J1-E1",
  "vars": { "client_name": "...", ... },
  "to": "client@example.com"
}
```
OR with a pre-rendered body (for dashboard "send personal note" path):
```json
{
  "slug": "client-slug",
  "templateId": "manual",
  "subject": "...",
  "body": "...",
  "to": "client@example.com"
}
```

The endpoint must:
1. Authenticate via `Authorization: Bearer <BRIDGE_SECRET>` (env var `BRIDGE_SECRET`)
2. Call `renderTemplate(templateId, vars)` from `_lib/templates.js` if `templateId !== 'manual'`
3. Send via `GW_SMTP_USER`/`GW_SMTP_PASS` (same transport as existing `_lib/email.js`)
4. Write a row to D1 `email_log` via the CF REST API (same as `_lib/email.js` does today)
5. Return `{ ok: true }` or `{ ok: false, error: "..." }`

This endpoint is intentionally simple — it is NOT a general-purpose email API. It only sends pre-defined onboarding templates or manual bodies to single recipients.

**Required env vars on Vercel (add these):**
- `BRIDGE_SECRET` — new; choose any strong random string; must match `VERCEL_BRIDGE_URL` in Pages

**Files to read before starting:**
- `api/_lib/email.js` — existing GW SMTP send logic to replicate
- `api/_lib/templates.js` — `renderTemplate()` function to import
- `api/_lib/d1.js` — `queryD1()` for email_log writes
- `api/notify-landing-enquiry.js` — example of iCloud SMTP pattern for reference

**Success criteria:**
- `api/send-email.js` exists and handles both template and manual-body modes
- Auth rejects missing/wrong `BRIDGE_SECRET`
- SMTP and D1 errors are caught and returned as `{ ok: false, error }` without throwing
- Deployed to Vercel and smoke-tested with a curl command (dry run)

**Session prompt:**

```
We are migrating NeoBookworm.uk from Vercel to Cloudflare (single Worker + Static Assets, NOT Pages).
Read docs/vercel-to-cloudflare-migration.md in full before starting.
We are on Phase 2.

Read these files before writing any code:
- api/_lib/email.js
- api/_lib/templates.js
- api/_lib/d1.js

Create api/send-email.js — a new Vercel serverless function that acts as the
SMTP bridge for the Cloudflare Worker's routes. Full spec is in Phase 2 of the migration doc.

Key requirements:
- Auth: Authorization: Bearer <BRIDGE_SECRET> env var. Reject anything else with 401.
- Accepts { slug, templateId, vars, to } — calls renderTemplate then sends via GW SMTP.
- Also accepts { slug, templateId: 'manual', subject, body, to } — skips renderTemplate.
- Sends via nodemailer using GW_SMTP_USER / GW_SMTP_PASS (same as email.js).
- Writes a row to D1 email_log via CF REST API (same pattern as _lib/email.js _logEmail).
- Returns { ok: true } on success, { ok: false, error: string } on failure. Never throws.
- Uses CommonJS (module.exports) to match the rest of the api/ directory.

Do NOT touch any existing files.
After creating the file, show a curl command to smoke-test it.
Mark Phase 2 complete in the migration doc progress tracker.
```

---

## Phase 3 — Port `_lib` helpers to ES modules

**What:** The Worker uses ES modules (`import`/`export`), not CommonJS (`require`/`module.exports`). The shared `_lib` helpers need to be converted. Create a `worker/_lib/` directory with ES module versions, leaving the originals in `api/_lib/` untouched (the Vercel bridge still needs them).

**Runtime gotchas (apply throughout Phases 3–5):**
- `compatibility_flags = ["nodejs_compat"]` must be set (Phase 6) for the below to work.
- `require('crypto')` → `import { randomUUID } from 'node:crypto'`, **or** use the Workers global `crypto.randomUUID()` (no import needed). `intake-shared.js` and `contact.js`-style UUID generation are affected.
- `Buffer` (used in body parsing and base64 in `booking-asset`/`intake-shared`) → `import { Buffer } from 'node:buffer'`. Don't assume it's global.
- `@aws-sdk/client-s3` and `@anthropic-ai/sdk` import normally but rely on `nodejs_compat`. Wrangler runs esbuild on the Worker; verify they bundle and watch the total compressed Worker size (10 MB paid limit — fine, but both SDKs are sizeable).
- No `process.env` — every helper takes `env` as a parameter (passed from the Worker's `fetch(request, env, ctx)`).

**Files to create** (ES module mirrors of the originals):
- `worker/_lib/d1.js`
- `worker/_lib/templates.js`
- `worker/_lib/slug.js`
- `worker/_lib/site-url.js`
- `worker/_lib/promote.js`
- `worker/_lib/acknowledge.js`
- `worker/_lib/audit.js`
- `worker/_lib/intake-shared.js`
- `worker/_lib/booking.js`
- `worker/_lib/email.js` — **important:** this is NOT the nodemailer version; it's a thin wrapper that calls the Vercel bridge via `fetch()` instead of SMTP

**The `worker/_lib/email.js` replacement:**

```js
// Instead of nodemailer, this calls the Vercel SMTP bridge.
// env.VERCEL_BRIDGE_URL and env.BRIDGE_SECRET must be set.
export async function sendTemplated(env, { slug, templateId, vars, to }) {
  return callBridge(env, { slug, templateId, vars, to });
}
export async function sendRendered(env, { slug, templateId, subject, body, to }) {
  return callBridge(env, { slug, templateId: templateId || 'manual', subject, body, to });
}
async function callBridge(env, payload) {
  const url = `${env.VERCEL_BRIDGE_URL}/api/send-email`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.BRIDGE_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { ok: false, error: `Bridge HTTP ${res.status}` };
  return res.json();
}
```

Note: `env` is now passed explicitly because the Worker receives it as a `fetch` argument, not via `process.env`.

**Files to read before starting:**
- All files in `api/_lib/` (to understand what needs converting)

**Success criteria:**
- All `_lib` helpers exist under `worker/_lib/` as ES modules
- `worker/_lib/email.js` calls the Vercel bridge, not nodemailer
- `worker/_lib/d1.js` takes `env` as a parameter (not `process.env`)
- All internal imports within `worker/_lib/` use ES import syntax
- `api/_lib/` originals are untouched

**Session prompt:**

```
We are migrating NeoBookworm.uk from Vercel to Cloudflare (single Worker + Static Assets, NOT Pages).
Read docs/vercel-to-cloudflare-migration.md in full before starting.
We are on Phase 3.

Read ALL files in api/_lib/ before writing any code.

Create ES module versions of all _lib helpers under worker/_lib/.
The originals in api/_lib/ must NOT be touched — Vercel still needs them.

Key differences from the originals:
1. Use `export`/`import` instead of `module.exports`/`require`.
2. Replace `process.env.X` with an `env` parameter passed by the caller
   (the Worker receives env as a fetch() argument, not process.env).
3. worker/_lib/email.js must NOT use nodemailer. Instead it calls the
   Vercel SMTP bridge via fetch(). See the spec in Phase 3 of the migration doc.
4. worker/_lib/d1.js: queryD1(env, dbId, sql, params) — env is the first arg.
   accountId(), prospectsDb(), enquiriesDb() become helper functions that
   read from env rather than process.env.

Do NOT create any route handlers or the Worker entry yet (that is Phase 4).
Do NOT touch any existing files.
Mark Phase 3 complete in the migration doc progress tracker.
```

---

## Phase 4 — Worker entry, router, and simple routes

**What:** Stand up the Worker entry + router, then port the simplest routes (no SMTP dependency). Get these working before the complex ones.

**Files to create:**
- `worker/index.js` — the Worker entry: `export default { async fetch(request, env, ctx) }`. Parses `URL.pathname`, dispatches to a route handler, and **falls through to `env.ASSETS.fetch(request)` for anything not matched** (so static files are served). Mirror the routing style of `workers/booking/src/index.js`.
- `worker/routes/reg-lookup.js` — SOAP proxy to RegCheck API (`/api/reg-lookup`). **Must return `Access-Control-Allow-Origin: *` in its own Response (G5)** — the booking widget calls it cross-origin from embeds.
- `worker/routes/booking-asset.js` — R2 logo upload (`/api/booking-asset`)
- `worker/routes/portal.js` — client portal SSR HTML. Handles `/c/:slug` and the sub-paths `/c/:slug/guides|review|handover|google-business` (extract the slug + section from the path; replaces the old vercel.json `?section=` rewrites).
- `worker/routes/portal-action.js` — portal approve/changes/decline (`/c/:slug/action`)

**Router + handler pattern:**

```js
// worker/index.js
import * as regLookup from './routes/reg-lookup.js';
import * as portal from './routes/portal.js';
// …
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p === '/api/reg-lookup') return regLookup.handle(request, env, ctx);
    if (p === '/c' || p.startsWith('/c/')) return portal.handle(request, env, ctx, url);
    // … other routes …
    return env.ASSETS.fetch(request);   // static assets fall-through
  },
};
```

Each route handler exports e.g. `export async function handle(request, env, ctx, url) { … }`, reads env via the `env` arg, parses the body with `await request.json()` (or `.text()`/`.formData()` as needed), and returns a Web `Response`. Slug/section come from parsing `url.pathname` (there is no file-based `[slug]` param — the router extracts it).

**Routing notes:**
- The intake rewrite aliases (`/api/intake-upload-session`, `/api/intake-finalize`, `/api/onboarding-intake`) are handled in the router by mapping those paths to the intake handler with the right `action` (replaces the vercel.json rewrites). The intake route itself is Phase 5 — just reserve the paths now or add them in Phase 5.
- `env.ASSETS` requires the `[assets]` binding in `wrangler.toml` (Phase 6). For local dev before Phase 6, `wrangler dev` still serves routes; assets need the binding configured.

**Files to read before starting:**
- `api/reg-lookup.js`, `api/booking-asset.js`
- `api/portal.js` (large — read fully), `api/portal-action.js`
- `workers/booking/src/index.js` (router pattern to mirror)
- `vercel.json` (the `/c/:slug/*` rewrites define the paths the router must cover)
- All files in `worker/_lib/`

**Success criteria:**
- `worker/index.js` routes the four endpoints and falls through to `env.ASSETS` otherwise.
- Each route handler uses `(request, env, ctx)`-style args and Web Request/Response.
- `env.X` used throughout (not `process.env.X`); imports point to `worker/_lib/`.
- The portal sub-paths resolve to the right section.
- Logic is functionally identical to the originals.

**Session prompt:**

```
We are migrating NeoBookworm.uk from Vercel to Cloudflare (single Worker + Static Assets, NOT Pages).
Read docs/vercel-to-cloudflare-migration.md in full before starting.
We are on Phase 4.

Read these files before writing any code:
- api/reg-lookup.js
- api/booking-asset.js
- api/portal.js
- api/portal-action.js
- workers/booking/src/index.js   (mirror this router style)
- vercel.json                    (the /c/:slug/* rewrites = paths to cover)
- All files in worker/_lib/ (created in Phase 3)

Create worker/index.js (entry + router) and the four route handlers listed in
Phase 4 of the migration doc.

Worker rules:
- Entry: `export default { async fetch(request, env, ctx) { … } }`
- Router dispatches on `new URL(request.url).pathname`; unmatched paths return
  `env.ASSETS.fetch(request)` so static files are served.
- Route handlers export `handle(request, env, ctx, url)` and return Web Responses.
- Extract :slug and the portal section by parsing url.pathname (no file-based params).
- Access env via the env arg (not process.env).
- Parse bodies with await request.json()/.text()/.formData() as appropriate.
- Import from worker/_lib/ using relative ES import paths.
- For email sends, use worker/_lib/email.js (which calls the Vercel bridge).

The portal sub-pages (guides, review, handover, google-business) all delegate
to the same portal rendering logic with a `section` parameter — mirror how
vercel.json currently passes ?section= via rewrites.

Do NOT touch any files in api/ or worker/_lib/.
Mark Phase 4 complete in the migration doc progress tracker.
```

---

## Phase 4b — SMTP forwarder functions (critical)

**What:** Create four tiny route handlers that sit at the same `/api/*` paths the SMTP functions currently occupy and forward each request to the Vercel bridge. Without these, contact/HE-Tyres/landing-enquiry/booking emails break the instant DNS cuts over (see "The same-origin problem" above). These must exist before Phase 7.

**Files to create (+ wire each into `worker/index.js`):**
- `worker/routes/contact.js`
- `worker/routes/he-tyres-enquiry.js`
- `worker/routes/notify-landing-enquiry.js`
- `worker/routes/notify-booking.js`

**Reference forwarder implementation:**

```js
// worker/routes/notify-landing-enquiry.js
export async function handle(request, env, ctx) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST')
    return new Response('Method Not Allowed', { status: 405 });

  const target = `${env.VERCEL_BRIDGE_URL}/api/notify-landing-enquiry`;
  // Forward body + only the headers the bridge needs. Do NOT forward Host.
  const headers = { 'Content-Type': request.headers.get('content-type') || 'application/json' };
  const notifySecret = request.headers.get('x-notify-secret');
  if (notifySecret) headers['X-Notify-Secret'] = notifySecret;

  const resp = await fetch(target, {
    method: 'POST',
    headers,
    body: await request.text(),
  });
  // Pass the bridge's status + body straight back to the caller.
  return new Response(await resp.text(), {
    status: resp.status,
    headers: { 'Content-Type': resp.headers.get('content-type') || 'application/json' },
  });
}
```

**Per-forwarder header notes:**
- `contact.js` and `he-tyres-enquiry.js` — browser callers, JSON body, **no** secret header. `he-tyres-enquiry.js` original does CORS/Origin checks and returns CORS headers; the forwarder is same-origin so it does not strictly need them, but it must still forward the JSON body faithfully. Confirm the success/error JSON shape returned matches what `he-tyres/index.html` and `contact.html` expect (both read `{ ok: true }` / `{ error }`).
- `notify-landing-enquiry.js` and `notify-booking.js` — Worker callers, must forward `X-Notify-Secret`. The bridge still validates the secret, so the secret never lives in the forwarder.

**Important:** the forwarders need `VERCEL_BRIDGE_URL` set in the Worker env. They do **not** need `BRIDGE_SECRET` (that is only for the `send-email` path, which the logic routes call directly). Remember to wire the four paths into `worker/index.js` and confirm the router does **not** fall through to `env.ASSETS` for them.

**Success criteria:**
- Four forwarder routes exist + are wired into the router; each forwards POST to the matching bridge path and relays status + body.
- `X-Notify-Secret` is forwarded for the two Worker-facing endpoints.
- A POST to `/api/contact` on the workers.dev staging URL produces an email via the bridge.

**Session prompt:**

```
We are migrating NeoBookworm.uk from Vercel to Cloudflare (single Worker + Static Assets, NOT Pages).
Read docs/vercel-to-cloudflare-migration.md in full before starting.
We are on Phase 4b — SMTP forwarder routes.

Read these files first to confirm the exact request/response shapes:
- api/contact.js and contact.html (the fetch around line 1165)
- api/he-tyres-enquiry.js and he-tyres/index.html (the fetch around line 1749)
- api/notify-landing-enquiry.js and workers/landing-enquiry/src/email.js
- api/notify-booking.js and workers/booking/src/email.js
- worker/index.js (add the four routes to the router)

Create the four forwarder route handlers under worker/routes/ described in
Phase 4b, and wire them into worker/index.js. Each forwards the POST (body +
needed headers) to `${env.VERCEL_BRIDGE_URL}/api/<same-path>` and relays the
bridge's status code and body back unchanged.

Rules:
- Forward X-Notify-Secret for notify-landing-enquiry and notify-booking only.
- Do NOT forward the Host header.
- Do NOT embed any secret in the forwarder.
- Keep the returned JSON shape identical to what the original Vercel function
  returned, so the browser forms and standalone Workers see no difference.

Do NOT touch api/ or the standalone Workers under workers/.
Mark Phase 4b complete in the migration doc progress tracker.
```

---

## Phase 5 — Port complex routes

**What:** The three remaining routes: `dashboard.js`, `intake.js`, and `run-site-audit.js`. These are the most complex, contain the most lines, and have the most shared-lib dependencies. Port them one at a time, dashboard last (it is the largest file in the project). Wire each into `worker/index.js` as you go.

**Files to create:**
- `worker/routes/run-site-audit.js` — Anthropic site audit trigger (`/api/run-site-audit`)
- `worker/routes/intake.js` — intake upload-session / finalize / onboarding dispatcher. Router maps `/api/intake`, `/api/intake-upload-session`, `/api/intake-finalize`, `/api/onboarding-intake` to this handler with the right `action` (replaces the vercel.json rewrites).
- `worker/routes/dashboard.js` — full admin API (largest file) (`/api/dashboard`)

**Key notes:**

`run-site-audit.js`: `import Anthropic from '@anthropic-ai/sdk'` works under `nodejs_compat`. Watch combined bundle size (it ships in the same Worker as the AWS SDK). **Duration (G4):** the crawl + Claude call can run many seconds; Workers bill CPU not I/O-wait so this is usually fine, but if the dashboard "Re-run" doesn't need to block, return early and use `ctx.waitUntil()`. Test a real audit on workers.dev.

`intake.js`: The AWS SDK (`@aws-sdk/client-s3`) works under `nodejs_compat`. The R2 presign flow is unchanged — it generates presigned PUT URLs the browser uses directly. The old `?action=` dispatch can stay, driven by the path the router matched.

`dashboard.js`: ~1,000+ lines. Port methodically by action group. The `client_send` action currently calls `_lib/email.js` directly and must call `worker/_lib/email.js` (the bridge wrapper, `sendTemplated(env, …)`) instead.

**Files to read before starting:**
- `api/run-site-audit.js`
- `api/_lib/audit.js`
- `api/intake.js`
- `api/_lib/intake-shared.js`
- `api/_lib/promote.js`
- `api/_lib/acknowledge.js`
- `api/dashboard.js` (read fully — it is large)
- All files in `worker/_lib/`

**Success criteria:**
- All three routes exist under `worker/routes/` and are wired into `worker/index.js`
- `(request, env, ctx)` handler pattern throughout
- `env.X` used, not `process.env.X`
- Email sends go through `worker/_lib/email.js` bridge wrapper
- Logic is functionally identical to originals

**Session prompt:**

```
We are migrating NeoBookworm.uk from Vercel to Cloudflare (single Worker + Static Assets, NOT Pages).
Read docs/vercel-to-cloudflare-migration.md in full before starting.
We are on Phase 5.

Read these files before writing any code:
- api/run-site-audit.js and api/_lib/audit.js
- api/intake.js and api/_lib/intake-shared.js
- api/_lib/promote.js and api/_lib/acknowledge.js
- api/dashboard.js (read in full — it is large)
- worker/index.js (wire each new route in)
- All files in worker/_lib/

Create route handlers under worker/routes/ for run-site-audit, intake, and
dashboard as specified in Phase 5, wiring each into worker/index.js. Port in
this order: run-site-audit first (simplest), then intake, then dashboard.

Worker rules: same as Phase 4 (handle(request, env, ctx[, url]); Web Response;
env arg not process.env).
Map the intake rewrite aliases (/api/intake-upload-session, /api/intake-finalize,
/api/onboarding-intake) to the intake handler with the right action.
For email sends (dashboard client_send, intake onboarding, audit Nick notification),
import from worker/_lib/email.js and pass env as the first argument:
  import { sendTemplated } from '../_lib/email.js';
  await sendTemplated(env, { slug, templateId, vars, to });

dashboard.js is large — port each action handler methodically. Do not skip
any actions. After porting, list every action from the original and confirm
it is present in the new version.

Do NOT touch any files in api/.
Mark Phase 5 complete in the migration doc progress tracker.
```

---

## Phase 6 — Worker config (`wrangler.toml`, `.assetsignore`, assets)

**What:** Configure the root `wrangler.toml` so the one Worker serves both the static site (via `env.ASSETS`) and the API routes, and create `.assetsignore` so non-static directories are never uploaded. No `dist/` build step — assets serve directly from the repo root.

**Bundle size (G3 — measured, fine):** the heavy SDKs gzip to **~188 KB**, ~6% of the free-plan 3 MB limit, so size is not a concern on either plan. Still run `wrangler deploy --dry-run --outdir=.wrangler-build` once as a sanity check. Choose Free vs Paid on request volume (free = 100k Worker invocations/day), not size.

**Files to create:**
- `wrangler.toml` (repo root) — `main`, `compatibility_date`/`flags`, `[assets]` block
- `.assetsignore` (repo root) — excludes non-static files from the asset upload

### The exclusion problem — solved by `.assetsignore` (no build step)

Workers Static Assets uploads the directory named in `[assets].directory`. Pointing it at the repo root would otherwise upload `api/*.js`, `workers/`, `docs/`, `scripts/` as public files (a **source-code leak** — it would serve the Vercel bridge source at `/api/contact.js`). `.assetsignore` (a `.gitignore`-style blocklist, a first-class Workers feature) excludes them cleanly while still serving from root.

`.assetsignore` (repo root):
```
# Server/code dirs — never serve as static assets
api/
worker/
workers/
docs/
scripts/
node_modules/
**/node_modules
.git/
*.md
wrangler.toml
.assetsignore
package.json
package-lock.json
.env*
```
(Confirm against `git ls-files` so nothing non-static is missed and nothing the site needs is accidentally excluded — e.g. keep `vendor/`, `fonts/`, `Images/`, `accreditations/`, `guides/`, `demos/`, `ridgecoat-decorators/`, `meridian-heating/`, `he-tyres/`.)

### Contents of root `wrangler.toml`

```toml
name = "neobookworm-uk"
main = "worker/index.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]   # REQUIRED — AWS SDK, Anthropic SDK, Buffer, node:crypto

[assets]
directory = "."                # serve the repo root, minus .assetsignore
binding = "ASSETS"             # router falls through to env.ASSETS.fetch(request)
html_handling = "auto-trailing-slash"   # clean URLs: /about → /about.html
not_found_handling = "none"    # let the Worker/router handle 404s (e.g. branded portal 404)

# Plain (non-secret) vars can go here under [vars]; put secrets via `wrangler secret put`.

# --- Bindings below are OPTIONAL / FUTURE ---
# Routes currently use the D1 REST API (CF_API_TOKEN) and the AWS S3 SDK (R2_* keys),
# so these native bindings are NOT required for cutover. Listed for the later refactor.
# [[d1_databases]]
# binding = "DB"
# database_name = "neobookworm-enquiries"
# database_id = "771b3047-f977-485e-9cfb-736815931998"
#
# [[d1_databases]]
# binding = "PROSPECTS_DB"
# database_name = "neobookworm-prospects"
# database_id = "0ae32598-1680-4995-a010-96b647eacabd"
#
# [[r2_buckets]]
# binding = "R2"
# bucket_name = "neo-bookworm-uk"
```

`compatibility_flags = ["nodejs_compat"]` is **not optional** — without it the AWS SDK, the Anthropic SDK, and any use of `Buffer`/`node:crypto` fail at runtime. With `compatibility_date` ≥ 2024-09-23 this also enables `nodejs_compat_v2`.

> **Verify the exact `[assets]` option names against current Wrangler docs when building** (`directory`, `binding`, `html_handling`, `not_found_handling`, and whether assets-vs-Worker precedence needs `run_worker_first`). The defaults serve assets first then fall through to the Worker, which is what we want — but confirm, because these option names have shifted across Wrangler versions.

### Clean URLs

`html_handling = "auto-trailing-slash"` reproduces Vercel's `cleanUrls`: `/about` serves `/about.html`. Verify in Phase 7 that internal links + the `_redirects` rules still resolve. (`_redirects` and `_headers` are honoured by Workers Static Assets the same way Pages honoured them.)

### Manual Cloudflare dashboard / CLI steps

Deployment is via Wrangler (Git-connected builds are a Pages feature; for a Worker you deploy with `wrangler deploy`, optionally wired to CI later). In order:
1. Ensure `wrangler` is installed/authenticated (`wrangler login`).
2. Set secrets: for each variable in the Worker env-var table, run `wrangler secret put <NAME>` (or add non-secrets under `[vars]`). Don't forget `VERCEL_BRIDGE_URL` and `BRIDGE_SECRET`.
3. `wrangler deploy` → creates/updates the `neobookworm-uk` Worker and prints the `*.workers.dev` URL. Note it for Phase 7 smoke testing.
4. (Optional/future) add the D1/R2 native bindings and refactor `worker/_lib/d1.js` to use them.
5. **Do not add the custom domain / touch the apex DNS yet** — that is Phase 7.

**Success criteria:**
- `wrangler.toml` + `.assetsignore` exist at repo root; `nodejs_compat` set; `main = worker/index.js`.
- `wrangler deploy` succeeds; the `*.workers.dev` URL serves the homepage and the API routes.
- **No source file** (`/api/contact.js`, `/worker/index.js`, `/workers/...`, `/wrangler.toml`) is reachable on the deployed site.

**Session prompt:**

```
We are migrating NeoBookworm.uk from Vercel to Cloudflare (single Worker + Static Assets, NOT Pages).
Read docs/vercel-to-cloudflare-migration.md in full before starting.
We are on Phase 6.

Read vercel.json, the existing workers/booking/wrangler.toml and
workers/landing-enquiry/wrangler.toml, run `git ls-files` for the exact
top-level inventory, and check current Wrangler docs for the [assets]
config option names (they have changed across versions).

Create:
1. .assetsignore (repo root) — gitignore-style blocklist excluding api/, worker/,
   workers/, docs/, scripts/, node_modules, .git/, *.md, wrangler.toml,
   package*.json, .env*. Verify against git ls-files that nothing the static
   site needs (vendor/, fonts/, Images/, guides/, demos/, the demo-site dirs)
   is excluded.
2. Root wrangler.toml — name=neobookworm-uk, main=worker/index.js,
   compatibility_date=2024-09-23, compatibility_flags=["nodejs_compat"],
   and an [assets] block (directory=".", binding="ASSETS", clean-URL handling,
   not_found_handling so the router owns 404s). Leave D1/R2 bindings commented.

Confirm the [assets] option names against the live Wrangler docs before
finalising — do not guess. Explain any option you set.

Do NOT deploy. Do NOT touch wrangler.toml files inside workers/.
Review the "Manual Cloudflare CLI steps" section against what you built and
correct it if anything differs. Mark Phase 6 complete in the progress tracker.
```

---

## Phase 7 — Deploy and smoke-test

**What:** Deploy the Worker, run smoke tests against the `*.workers.dev` staging URL before touching the apex DNS.

**This phase is mostly manual** — it requires Cloudflare + Krystal dashboard access and browser testing. Claude Code assists with writing the test plan and interpreting errors.

**Prerequisite:** Phase 0 is complete — the zone is already on Cloudflare, with Google Workspace email verified, and the apex A record still pointing at Vercel (site unchanged).

### Step 1 — Stand up the bridge hostname (before apex repoint)

The bridge must be reachable on a hostname that points at Vercel after the apex moves to the Worker:
1. In **Vercel** → the (repurposed) project → **Settings → Domains**, add `bridge.neobookworm.uk`.
2. In **Cloudflare DNS** (the zone now lives here), add a `CNAME` record: `bridge` → the target Vercel shows you (typically `cname.vercel-dns.com`). Set it **DNS-only (grey cloud)** — do not proxy a Vercel origin.
3. Wait for Vercel to validate + issue the TLS cert for `bridge.neobookworm.uk`.
4. Set `VERCEL_BRIDGE_URL=https://bridge.neobookworm.uk` in the **Worker** env (`wrangler secret put` or dashboard) and redeploy the Worker.
5. **Leave the apex `neobookworm.uk` pointing at Vercel for now** — only `bridge.` is new at this stage. The live site is unaffected.

### Step 2 — Smoke test against the `*.workers.dev` staging URL

Static:
- [ ] `https://neobookworm-uk.<subdomain>.workers.dev/` homepage loads
- [ ] `/guides` resolves (clean URL via `html_handling`)
- [ ] `/he-tyres` → `/he-tyres/` redirect works (from `_redirects`)
- [ ] `/ridgecoat-decorators` and `/demos/hartley-plumbing` redirects work
- [ ] **Source-leak check:** `/api/contact.js`, `/worker/index.js`, `/workers/...`, `/wrangler.toml` all return 404 (must NOT serve source)

API — ported logic routes (on workers.dev):
- [ ] `GET /api/reg-lookup?reg=TEST` returns JSON (or correct error)
- [ ] `GET /c/<test-slug>` returns portal HTML (or branded 404)
- [ ] `POST /api/dashboard` with `Authorization: Bearer <DASHBOARD_SECRET>`, `action=summary` returns JSON

API — SMTP forwarders → bridge (this is the critical path the review uncovered):
- [ ] `POST /api/contact` (workers.dev) with a test payload → forwarder → bridge → **test email arrives**
- [ ] `POST /api/notify-landing-enquiry` (workers.dev) with the correct `X-Notify-Secret` → email arrives
- [ ] `POST /api/notify-booking` (workers.dev) with the correct secret → email arrives
- [ ] Wrong/missing `X-Notify-Secret` → bridge returns 401 (forwarder relays it)

Bridge direct (on `bridge.neobookworm.uk`):
- [ ] `POST /api/send-email` with `Authorization: Bearer <BRIDGE_SECRET>` and a template payload → email arrives + `email_log` row written

### Step 3 — Apex repoint to the Worker (the user-facing cutover)

The zone is already on Cloudflare (Phase 0), so this is a simple, fast-to-roll-back DNS edit — no nameserver change, no ALIAS workaround. Email records are untouched throughout.

1. Lower the TTL on the apex + `www` records (Cloudflare lets you set this) the day before, so rollback is quick.
2. In Cloudflare **Workers & Pages → the `neobookworm-uk` Worker → Settings → Domains & Routes → Add → Custom Domain**, add `neobookworm.uk` and `www.neobookworm.uk`. Because the zone is on Cloudflare, it creates the apex record via **CNAME-flattening automatically** — no manual ALIAS needed.
3. This replaces the apex A record that pointed at Vercel. The site now serves from the Worker. `bridge.neobookworm.uk` still resolves to Vercel; the standalone Workers and browser forms keep calling `neobookworm.uk/api/*` and hit the Worker's forwarders/routes.
4. **Do not touch MX/SPF/DKIM/DMARC** — they were verified in Phase 0 and stay exactly as-is.
5. Keep the old apex domain attached to the Vercel project for ~24h as rollback insurance (re-point the Cloudflare apex back to Vercel's IP to revert), then detach in Phase 8.
6. Re-run the entire Step 2 checklist against `https://neobookworm.uk/` once DNS propagates — including the forwarder→bridge email path and the source-leak check.

**Session prompt:**

```
We are migrating NeoBookworm.uk from Vercel to Cloudflare (single Worker + Static Assets, NOT Pages).
Read docs/vercel-to-cloudflare-migration.md in full before starting.
We are on Phase 7 — deploy and smoke-test.

State so far (fill in before running):
- Phase 0 done? (zone on Cloudflare, Google Workspace email verified): [yes/no]
- bridge.neobookworm.uk custom domain on Vercel: [done? cert issued?]
- Worker staging URL: [INSERT *.workers.dev URL]
- VERCEL_BRIDGE_URL set in Worker env: [yes/no]

Walk me through Phase 7 of the migration doc in order: bridge hostname first,
then the Step 2 smoke-test checklist against the workers.dev URL, then the
Step 3 apex repoint. For each smoke-test item tell me the exact curl/browser
action and what a pass vs failure looks like.

Pay special attention to the forwarder → bridge email path and the source-leak
check (/api/contact.js must 404).

If a route errors, read the relevant worker/routes/ file and worker/_lib/ helper
to diagnose before proposing a fix. Do not change code without confirming the
diagnosis.

Do NOT begin the apex repoint until every Step 2 check passes AND Phase 0 is
verified complete. Mark Phase 7 complete only once neobookworm.uk resolves to
the Worker and the checklist passes against the live domain.
```

---

## Phase 8 — Cleanup

**What:** Remove the migrated functions from the Vercel project, update CLAUDE.md, and tidy up.

**Vercel functions to DELETE** (keep only the 5 bridge functions):
- `api/portal.js`
- `api/portal-action.js`
- `api/dashboard.js`
- `api/intake.js`
- `api/run-site-audit.js`
- `api/booking-asset.js`
- `api/reg-lookup.js`
- `api/_lib/` (move common code to `vercel/_lib/` or keep minimal set for bridge)

**vercel.json** — strip out all the `/c/:slug/*` rewrites. Keep only:
- The 3 trailing-slash redirects (in case old Vercel links are bookmarked)
- CORS header on `/api/reg-lookup` (can be removed entirely if reg-lookup is deleted)

**`CLAUDE.md` updates:**
- Update deployment section: the marketing site + app run on a single Cloudflare Worker (Static Assets); a thin Vercel project at `bridge.neobookworm.uk` handles SMTP only.
- Update "what to avoid" to note that SMTP-sending code stays on the Vercel bridge (Workers can't do TCP SMTP).
- Remove/replace notes referencing Vercel's Hobby 12-function limit (no longer the binding constraint).
- Note the DNS zone now lives on Cloudflare (update the related Outstanding Items entry, and that `booking.`/`api.` custom domains are now unblocked).

**Vercel env vars to remove** (no longer needed by bridge):
`ANTHROPIC_API_KEY`, `R2_*`, `INTAKE_UPLOAD_SECRET`, `DASHBOARD_SECRET`, `ONBOARDING_INTAKE_SECRET`, `BOOKING_ADMIN_SECRET`.
**Keep on the bridge:** `SMTP_*`, `TO_EMAIL`, `HE_TYRES_TO_EMAIL`, `GW_SMTP_USER/PASS`, `NOTIFY_SECRET`, `NOTIFY_BOOKING_SECRET`, `BRIDGE_SECRET`, and `CF_API_TOKEN` (the `send-email` bridge writes `email_log` to D1 via the REST API, so it still needs it — confirm before removing).

**Do NOT delete the Worker forwarders.** The four forwarder routes on the Worker (`worker/routes/contact.js`, `he-tyres-enquiry.js`, `notify-landing-enquiry.js`, `notify-booking.js`) are permanent — they are the only thing routing those same-origin paths to the bridge. The Vercel `api/contact.js` etc. stay too (they do the actual SMTP). Both halves are needed.

**Bridge domain:** keep `bridge.neobookworm.uk` on the Vercel project. Removing the old `neobookworm.uk` apex attachment from Vercel (after the 24h rollback window) is fine; removing `bridge.` would break all email.

**Session prompt:**

```
We are migrating NeoBookworm.uk from Vercel to Cloudflare (single Worker + Static Assets, NOT Pages).
Read docs/vercel-to-cloudflare-migration.md in full before starting.
We are on Phase 8 — cleanup after successful migration.

The migration is live. neobookworm.uk now runs on a single Cloudflare Worker
(Static Assets). The Vercel project is now the thin SMTP bridge only, reachable
at bridge.neobookworm.uk.

Tasks:
1. Delete the 7 migrated function files from api/ (list in Phase 8 of migration doc).
   Keep: contact.js, he-tyres-enquiry.js, notify-landing-enquiry.js,
   notify-booking.js, send-email.js. Delete everything else.
2. Clean up api/_lib/ — remove any files only used by deleted functions.
   Keep anything still imported by the 5 remaining bridge functions.
3. Update vercel.json — remove /c/:slug/* rewrites. Keep trailing-slash redirects.
4. Update CLAUDE.md — deployment section, function inventory, environment variables.
   Reflect the new Worker + Vercel bridge architecture and the Cloudflare DNS move.
5. Update the progress tracker in this doc (mark Phase 8 complete).

Check each deletion carefully — confirm the file is not imported by any
remaining Vercel bridge function before deleting it.
```

---

## Reference: file dependency map

Which `_lib` files are used by which functions (to guide Phase 8 cleanup):

| `_lib` file | Used by (Vercel bridge) | Used by (Worker routes) |
|---|---|---|
| `d1.js` | `send-email.js` (email_log) | all functions |
| `email.js` | — (bridge IS email) | `portal-action`, `dashboard`, `intake`, `run-site-audit` |
| `templates.js` | `send-email.js` | `dashboard` (preview action) |
| `slug.js` | — | `portal`, `portal-action`, `dashboard`, `intake` |
| `site-url.js` | — | `portal`, `dashboard` |
| `promote.js` | — | `intake`, `dashboard` |
| `acknowledge.js` | — | `intake` |
| `audit.js` | — | `run-site-audit` |
| `intake-shared.js` | — | `intake`, `booking-asset` |
| `booking.js` | — | `dashboard` |

After Phase 8, the Vercel bridge only needs: `d1.js`, `templates.js`, and `send-email.js` (plus its own copy of the nodemailer transport logic). The `_lib` directory on the Vercel side can be reduced to just those two files.

---

## Key decisions log

| Date | Decision | Rationale |
|---|---|---|
| 2026-06-24 | Option A (thin Vercel bridge) chosen | Workers can't do TCP SMTP; existing iCloud + GW creds work; Vercel Hobby is free |
| 2026-06-24 | Mailchannels ruled out | Free tier ended Aug 2024; now just another paid provider |
| 2026-06-24 | Native Cloudflare email binding deferred | Requires DNS on Cloudflare; revisit when DNS migrated |
| 2026-06-24 | D1 native bindings deferred | REST API approach works in the Worker runtime; refactor to `env.DB` bindings separately |
| 2026-06-24 | Phased migration chosen | Safer; each phase is independently deployable and testable |
| 2026-06-25 | **Review fix:** SMTP forwarders added (Phase 4b) | Frontend forms + both Workers call hardcoded `neobookworm.uk/api/*`; after cutover those hit Pages, not Vercel. Forwarders keep callers unchanged. |
| 2026-06-25 | Bridge moves to `bridge.neobookworm.uk` | Apex now resolves to the Cloudflare Worker; bridge needs its own hostname that still points at Vercel. |
| 2026-06-25 | `nodejs_compat` flag is mandatory | AWS SDK, Anthropic SDK, `Buffer`, `node:crypto` all require it. |
| 2026-06-25 | ~~Dedicated `dist/` publish dir via copy script~~ **SUPERSEDED by D1** | Was the Pages-path fix for serving `api/*.js`/`workers/` publicly. Under Workers Static Assets this is replaced by `.assetsignore` (no build step). |
| 2026-06-25 | "Remove .html extensions" toggle claim removed | No such toggle exists; Pages serves clean URLs automatically. |
| 2026-06-25 | **Open:** Pages vs Workers Static Assets (D1) | Cloudflare steers new projects to Workers Static Assets; Pages chosen for lower porting effort. Revisit if exclusion/`.assetsignore` becomes painful. |
| 2026-06-25 | **RESOLVED (D3):** move DNS zone to Cloudflare | Verified Krystal has no apex ALIAS/ANAME and Cloudflare has no static apex IP, so apex-on-Cloudflare is impossible with DNS at Krystal. Nick chose to move the zone to Cloudflare (registration stays at Krystal). Overrides the brief's "keep DNS at Krystal". Now Phase 0. Email records must be verified on import. |
| 2026-06-25 | **RESOLVED (D1):** Workers Static Assets, not Pages | Pages is maintenance-mode; Workers gets all new investment + has parity. `.assetsignore` removes the source-leak/`dist/` problem; matches existing Workers. Cost: one router file vs file-per-endpoint (in-repo precedent). |
| 2026-06-25 | **RESOLVED (D2):** bridge host = `bridge.neobookworm.uk` | Stable, purpose-named; CNAME to Vercel in the Cloudflare zone. Set as `VERCEL_BRIDGE_URL`. |
| 2026-06-26 | **Phase 0 COMPLETE** — zone live on Cloudflare | NS = adam/sydney.ns.cloudflare.com. Email verified via live DNS: MX `1 smtp.google.com`, SPF, DKIM (`google._domainkey`, char-for-char match), DMARC, both google-site-verification TXTs. `booking` CNAME re-added. Apex `A` `216.198.79.1` + `www` set **grey-cloud (DNS-only)** → site still on Vercel. Note: Cloudflare's import proxied (orange) the apex by default — switched to grey to avoid proxy-in-front-of-Vercel SSL issues; real Cloudflare edge benefits return at Phase 7 via the Worker. |
