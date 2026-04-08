# NeoBookworm.uk — implementation reference

This document describes what the site is for, how it is built as of the latest repository state, and how to troubleshoot technical issues. It is intended for developers or operators maintaining the project.

---

## 1. Purpose and positioning

**NeoBookworm.uk** is the marketing website for a small web design business focused on **local tradespeople** (especially around Swindon / Wiltshire), with a **fixed build price (£499)** and optional **ongoing care (£19.99/month)**.

### What the site tries to achieve

- **Explain the offer** in plain English (avoid jargon like “SEO”, “hosting”, “SSL”; prefer “appear in Google search lists”, “keep your site live”, etc.).
- **Convert visitors** via clear pricing, process explanation, examples, and contact paths.
- **Onboard paying clients** through a structured **intake form** that captures business details, story, style preferences, and **work photos / logo**, then records them in **Notion** with files in **Cloudflare R2**.
- **Capture casual enquiries** via a **short contact form** that sends email over **SMTP** (when configured).

### Constraints called out in project conventions

- **No business phone number** on NeoBookworm.uk itself; owner contact is **email-led** (e.g. quick contact + intake success copy).
- **Accreditation “logos”** on demos should use the **CSS badge library**, not real trademark artwork.
- Client **demo sites** (eight trade templates) are **planned** in project docs; the current repository primarily holds the **main marketing site** and **APIs**—not necessarily all demo deployments.

---

## 2. Repository layout (high level)

| Path | Role |
|------|------|
| `index.html` | Home |
| `how-it-works.html` | Process |
| `pricing.html` | Pricing |
| `examples.html` | Style / demo showcases (placeholders vs real imagery per project status) |
| `about.html` | About |
| `contact.html` | Quick enquiry form → `/api/contact` |
| `intake-form.html` | Client onboarding → direct R2 upload + Notion |
| `privacy.html`, `terms.html` | Legal |
| `accreditations/accreditation-badges.html` | Reusable badge HTML/CSS for client sites |
| `api/` | Vercel serverless handlers (Node) |
| `scripts/` | Maintenance / verification scripts (Notion schema, R2, multipart tests) |
| `netlify.toml` | Netlify functions bundler hint (see §5—**production marketing site is Vercel**) |
| `package.json` | Node dependencies for serverless + scripts |
| `CLAUDE.md` | Maintainer instructions and build-status tables (keep in sync when shipping features) |

**Static assets:** HTML references `favicon.ico`, `favicon-32x32.png`, `favicon-16x16.png`, and various images from paths such as `/Images/` in copy—ensure deployed assets exist on the host.

---

## 3. Technology stack

| Layer | Choice |
|-------|--------|
| **Front-end** | Static HTML, inline CSS, minimal vanilla JS (no bundler in repo) |
| **Fonts** | Google Fonts (**Playfair Display**, **DM Sans** on most marketing pages; intake uses **Cormorant Garamond** + DM Sans) |
| **Hosting (main site)** | **Vercel** (production: `neobookworm.uk`; HTML references `/_vercel/insights/script.js`) |
| **Serverless** | Vercel **Node** functions under `api/*.js` |
| **Client intake storage** | **Cloudflare R2** (S3-compatible API) + public URLs |
| **CRM / structured intake** | **Notion** database (“Client Sites”) |
| **Transactional email** | **Nodemailer** + SMTP (Brevo or similar—env-driven) |

**Important:** Vercel **serverless request bodies** are limited to about **4.5 MB**. That is why the intake form uses **presigned PUT** uploads **directly to R2**, not a single giant multipart POST through the function.

---

## 4. Design system (marketing pages)

Approximate tokens used on primary pages (`index.html`, etc.):

| Token | Typical use |
|-------|----------------|
| Navy `#0f1f3d` | Primary background |
| Amber `#f5a623` | Accent, hover `#d4891a` |
| White / off-white | Text and contrast |

**Tone:** Plain English, local/trust framing, fixed price transparency.

Individual pages may embed **page-specific** `:root` variables; do not assume every file shares identical CSS classes—**intake-form.html** is a separate visual system (dark gold/navy wizard).

---

## 5. Hosting and deployment notes

### Vercel (authoritative for neobookworm.uk)

- **Serverless routes** map from `api/<name>.js` to `/<api>/<name>` (e.g. `api/contact.js` → `POST /api/contact`).
- After changing **environment variables**, redeploy or confirm functions pick up new values.
- **CORS for intake** must be configured on the **R2 bucket** for browser `PUT` to the S3 API hostname—not only on Vercel.

### `netlify.toml`

The repo includes `[functions] node_bundler = "esbuild"`. Treat this as **legacy / auxiliary** unless you actively deploy this tree to Netlify. **Do not assume Netlify env vars** apply to the live marketing site if production is Vercel.

### Client demo sites

Project documentation describes **separate Netlify sites** per trade demo; they are **not all present as subfolders** in this snapshot. Troubleshooting “demo site X” may mean a **different repo or deploy target**.

---

## 6. API reference (serverless)

### 6.1 `POST /api/contact`

**File:** `api/contact.js`  

**Purpose:** Accept JSON from `contact.html` and send an email.

**Request body (JSON):**

- `name`, `email`, `message` — **required**
- `trade`, `phone` — optional

**Environment variables:**

| Variable | Required | Notes |
|----------|----------|--------|
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | For real send | If missing, handler logs body and returns `{ ok: true, note: '...' }` so the UI still “succeeds” |
| `SMTP_PORT` | Optional | Default `587`; `465` uses implicit TLS |
| `TO_EMAIL` | Optional | Default `nick@neobookworm.uk` |

**Troubleshooting:**

| Symptom | Likely cause |
|---------|----------------|
| “Success” but no mail | SMTP env vars unset—check function logs for “SMTP not configured” |
| 500 from API | SMTP auth/TLS/port wrong; provider blocking; check Vercel logs |
| CORS / network errors | Unusual for same-origin `fetch`; check mixed content (HTTPS page → HTTP API) |

**CORS:** Implements `OPTIONS` for preflight.

---

### 6.2 Intake: `POST /api/intake-upload-session`

**File:** `api/intake-upload-session.js`  

**Purpose:** Start a **direct-to-R2** upload session; returns **presigned PUT URLs** and a signed **`session`** object for finalize.

**Request body (JSON):**

```json
{
  "photos": [{ "name": "string", "mimeType": "image/jpeg" }],
  "logo": { "name": "string", "mimeType": "image/png" } | null
}
```

**Response (JSON):** `{ session, uploads, logo }` — see `api/intake-shared.js` (`buildIntakeDirectUploadSession`).

**Limits / validation:**

- Max **20** photos (`MAX_PHOTOS_DIRECT` in `intake-shared.js`).
- MIME types must be in the **allowlist** (JPEG, PNG, WebP, GIF, HEIC/HEIF, SVG, PDF).
- Requires full **R2** env configuration.

**Troubleshooting:**

| Symptom | Likely cause |
|---------|----------------|
| 400 “file type not allowed” | Browser sent empty/wrong `mimeType`—intake form uses `guessMimeFromName` fallback |
| 500 R2 / secret errors | Missing `R2_*` vars; `INTAKE_UPLOAD_SECRET` and `NOTION_API_KEY` both empty (signing requires at least one—prefer `INTAKE_UPLOAD_SECRET`) |

---

### 6.3 Intake: browser `PUT` to R2 (presigned URL)

**Not a Vercel route** — browser talks to **`https://…r2.cloudflarestorage.com`** (or region/jurisdiction variant).

**Headers:** `Content-Type` must match the value used when signing (the form sets `item.contentType`).

**Troubleshooting:**

| Symptom | Likely cause |
|---------|----------------|
| CORS error on PUT or OPTIONS | R2 bucket **CORS policy** missing site origin, `PUT`, or `Content-Type` in `AllowedHeaders` |
| 403 on PUT | Expired presigned URL; wrong object key; clock skew (rare) |
| Success PUT but wrong file in Notion | Mismatch between session file order and `FormData` order—should follow `uploads[]` vs `photosInput.files` pairing |

Official context: [Cloudflare R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/).

---

### 6.4 Intake: `POST /api/intake-finalize`

**File:** `api/intake-finalize.js`  

**Purpose:** Verify objects exist in R2, then create/update **Notion** row; idempotent per `uploadId` via marker object `intake/{uploadId}/_submitted.json`.

**Request body (JSON):** `{ session, …fields }` where `session` is exactly the object returned earlier (includes HMAC **`signature`**). Field names align with multipart intake (`fullName`, `bizName`, `trade`, etc.)—see `extractFinalizeFields` in `intake-shared.js`.

**Troubleshooting:**

| Symptom | Likely cause |
|---------|----------------|
| 400 “Session expired” | User waited past `expiresAt` (signature TTL; presign aligned to ~1 h in shared code) |
| 400 “did not finish uploading” | HEAD missing for a key—failed or skipped PUT |
| 400 “Empty upload” | Zero-byte object |
| 200 + `duplicate: true` | `_submitted.json` already present—repeat submit |
| 500 Notion errors | Invalid/revoked `NOTION_API_KEY`; DB not shared with integration; schema mismatch |
| Notion row but images don’t embed | Notion cannot fetch **public URL**; R2 public access / `R2_PUBLIC_URL` / hotlinking |

---

### 6.5 Legacy: `POST /api/submit-intake`

**File:** `api/submit-intake.js`  

**Purpose:** **Multipart/form-data** intake: files pass **through** the function, then upload to R2 paths under `clients/{safeBizName}/…`.

**Config:** `bodyParser: false` so raw multipart can be read.

**Caveat:** Total body size is capped by Vercel (**~4.5 MB**). **Many phone photos will fail** with payload-too-large errors. Prefer the **upload-session → PUT → finalize** flow used by `intake-form.html`.

**Troubleshooting:** Use `node scripts/verify-intake-multipart.js` to validate **parsing only** (no R2/Notion).

---

### 6.6 Shared intake implementation

**File:** `api/intake-shared.js`  

**Exports:** R2 helpers, `parseMultipart`, `uploadToR2`, `createNotionRecord`, `buildIntakeDirectUploadSession`, `finalizeIntakeDirectUpload`, constants.

**Notion database ID:** embedded as `DATABASE_ID` (same default as `scripts/ensure-notion-intake-properties.js` unless overridden there via `NOTION_DATABASE_ID`).

**Notion property names** must match `NOTION_PROP` in code—run `scripts/ensure-notion-intake-properties.js` if columns are missing.

**R2 folder layout:**

- Direct flow: `intake/{uploadId}/photos/…`, `intake/{uploadId}/logo/…`, plus `…/_submitted.json`.
- Multipart flow: `clients/{safeBiz}/photos/…`, `clients/{safeBiz}/logo/…`.

---

## 7. Environment variables (consolidated)

### Intake + Notion + R2

| Variable | Used by | Notes |
|----------|---------|--------|
| `NOTION_API_KEY` | Intake finalize, `createNotionRecord`, ensure script | Internal integration secret |
| `NOTION_MAX_ATTEMPTS` | Notion fetch retries | Optional; default 4 |
| `INTAKE_UPLOAD_SECRET` | HMAC for `session` | **Recommended**; fallback to `NOTION_API_KEY` if unset |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | S3 client | R2 API token with read/write on bucket |
| `R2_BUCKET_NAME` | S3 operations | |
| `R2_PUBLIC_URL` | Public URL base for objects | No trailing slash inconsistency is tolerated in some helpers via trim |
| `R2_ENDPOINT` **or** `R2_ACCOUNT_ID` | S3 API endpoint | Must be `*.r2.cloudflarestorage.com`—**not** the public `r2.dev` host |
| `R2_JURISDICTION` | EU buckets | e.g. `eu` + `*.eu.r2.cloudflarestorage.com` |
| `R2_REGION` | Routing hint | Often `auto` |
| `R2_FORCE_PATH_STYLE` | Set `1` if uploads fail | Virtual-host vs path-style |

### Contact email

| Variable | Notes |
|----------|--------|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Required for real delivery |
| `TO_EMAIL` | Inbound mailbox |

---

## 8. Operational scripts (`scripts/`)

| Script | Command idea | Purpose |
|--------|----------------|---------|
| `ensure-notion-intake-properties.js` | `NOTION_API_KEY=… node scripts/ensure-notion-intake-properties.js` | PATCH Notion DB to add missing intake columns |
| `verify-intake-multipart.js` | `node scripts/verify-intake-multipart.js` | Unit-style check of multipart parser |
| `test-r2.js` | Requires R2 env | Manual R2 connectivity (see file header) |

---

## 9. Page-by-page behaviour (static)

| Page | Interactive behaviour |
|------|------------------------|
| `index.html` | Nav, scroll reveals, links to rest of site |
| `contact.html` | AJAX `POST /api/contact` |
| `intake-form.html` | Multi-step wizard; submit uses **upload-session + R2 PUT + finalize** |
| Others | Mostly static; `examples.html` etc. may use scroll/reveal patterns |

---

## 10. Known implementation quirks (troubleshooting)

1. **`terms.html` references `include-header.js`** and `#site-header`, but **`include-header.js` is not present** in this repository snapshot. Expect a **404** in dev tools and an empty header region unless the file is restored or the references are removed.
2. **Temporary editor files** (`*.tmp.*`) may appear under the repo root; they are not part of the deployed site—exclude from deploy if present.
3. **`@notionhq/client` is in `package.json`** but the intake path primarily uses **`fetch`** to Notion REST in `intake-shared.js`—do not assume the official client drives intake.
4. **Intake success** does not guarantee email notification unless separately implemented; primary sink is **Notion**.

---

## 11. Analytics

`contact.html` and `intake-form.html` include:

```html
<script defer src="/_vercel/insights/script.js"></script>
```

If the site is ever hosted elsewhere without Vercel Insights, this script may 404—harmless.

---

## 12. Accreditation badge library

**File:** `accreditations/accreditation-badges.html`  

Contains **copy-paste CSS** and HTML patterns for trade badges (Gas Safe, NICEIC, Checkatrade, etc.) for **client demo sites**, not necessarily loaded by the main marketing pages.

---

## 13. Suggested diagnostic order (when “something broke”)

1. **Reproduce** on production with browser **Network** tab (preserve log).
2. **Identify layer:** static HTML/JS vs Vercel API vs R2 vs Notion vs SMTP.
3. **Check Vercel function logs** for the relevant `/api/…` route.
4. **Intake uploads:** verify **R2 CORS** and **presigned PUT** status codes.
5. **Intake DB:** open Notion integration access + run ensure script if properties error.
6. **Contact:** verify SMTP env vars and provider activity dashboard.

---

## 14. Document maintenance

When shipping meaningful changes to pages, APIs, or env requirements, update:

- This file (`WEBSITE-REFERENCE.md`), and
- `CLAUDE.md` status tables if your workflow relies on them.

---

*Generated as an implementation snapshot for the NeoBookworm.uk repository. Business terms and pricing on the live site always take precedence over this document.*
