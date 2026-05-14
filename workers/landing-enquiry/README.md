# landing-enquiry Worker (Phase 2)

Cloudflare Worker that receives landing page enquiries from `plumbers.html` and
`plumbers-switch.html`, validates them, saves them to D1, and then — in the
background — creates a Notion row and sends a notification email via Vercel.

**Phase 2 scope:** D1 insert + `ctx.waitUntil` background sync (Notion + email).  
The existing Vercel `/api/landing-enquiry` is **unchanged** and still handles live traffic.  
Switch-over happens in Phase 3.

---

## Deployed details

| | |
|---|---|
| **Worker URL** | `https://neobookworm-landing-enquiry.nickbarrett.workers.dev` |
| **Wrangler version** | 4.90.1 |
| **D1 database** | `neobookworm-enquiries` |
| **D1 database ID** | `771b3047-f977-485e-9cfb-736815931998` |
| **D1 region** | WEUR (served from AMS) |
| **Current version ID** | `7a0a701a-f94f-47f2-946e-20ce6e31ba09` (Phase 1) — Phase 2 redeployed 14 May 2026 |
| **Migration applied** | `0001_landing_enquiries.sql` ✅ |
| **Deployed** | 14 May 2026 |
| **Secrets set** | `NOTION_API_KEY` ✅, `NOTIFY_SECRET` ✅ |
| **Vercel notify endpoint** | `api/notify-landing-enquiry.js` deployed ✅ |

### Phase 1 test results (14 May 2026)

| Test | Result |
|---|---|
| Valid plumbers payload | `200 { ok: true, id: "93ddada1-25ed-44ec-9edc-25f8073fbc9f" }` ✅ |
| Missing email → 400 | `{ "error": "Email address is required." }` ✅ |
| CORS preflight OPTIONS | `204`, `Access-Control-Allow-Origin: https://neobookworm.uk` ✅ |
| Row visible in D1 | `notion_status: pending`, `email_status: pending` ✅ |

### Phase 2 test results (14 May 2026)

| Test | Result |
|---|---|
| POST valid payload → 200 + id | ✅ |
| D1 row `notion_status='ok'` after background sync | ✅ |
| `notion_page_id` populated in D1 | ✅ |
| Email notification received via `/api/notify-landing-enquiry` | ✅ |

---

## First-time setup

### 1. Install dependencies

**Every command in this README must be run from the `workers/landing-enquiry/` directory.**
If you run wrangler from the repo root it will fail — the wrangler binary lives here.

```bash
cd workers/landing-enquiry
npm install
```

Verify wrangler is working:

```bash
npx wrangler --version
```

### 2. Log in to Cloudflare

```bash
npx wrangler login
```

This opens a browser window. Approve access to your Cloudflare account.

### 3. Create the D1 database

> **Already done.** Database `neobookworm-enquiries` (`771b3047-f977-485e-9cfb-736815931998`) exists in WEUR.  
> Only follow this step if you are setting up from scratch on a different account.

```bash
npx wrangler d1 create neobookworm-enquiries
```

Wrangler prints a `database_id` — paste it into `wrangler.toml` under `[[d1_databases]]`.

### 4. Apply the migration (remote)

> **Already done.** `0001_landing_enquiries.sql` was applied on 14 May 2026.  
> Run this again only if you add a new migration file.

```bash
npx wrangler d1 migrations apply neobookworm-enquiries --remote
```

### 5. Deploy the Worker

> **Already deployed** to `https://neobookworm-landing-enquiry.nickbarrett.workers.dev`  
> Run this to push any future code changes.

```bash
npx wrangler deploy
```

---

## Local development

### Apply migration locally first

```bash
npm run migrate:local
```

### Start the local dev server

```bash
npm run dev
```

The Worker runs at `http://localhost:8787` by default.

---

## Test examples (curl)

Replace `$WORKER` with `http://localhost:8787` for local, or the deployed URL for remote.

### Valid plumbers payload — expect 200 + id

```bash
curl -s -X POST "$WORKER" \
  -H "Content-Type: application/json" \
  -H "Origin: https://neobookworm.uk" \
  -d '{
    "fullName":    "Dave Watkins",
    "bizName":     "Watkins Plumbing",
    "email":       "dave@example.com",
    "startOption": "leave_it_with_me",
    "source":      "plumbers-landing"
  }'
```

Expected response:
```json
{ "ok": true, "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
```

### Missing email — expect 400

```bash
curl -s -X POST "$WORKER" \
  -H "Content-Type: application/json" \
  -H "Origin: https://neobookworm.uk" \
  -d '{ "fullName": "Dave Watkins", "bizName": "Watkins Plumbing" }'
```

Expected response:
```json
{ "error": "Email address is required." }
```

### CORS preflight — expect 204 with CORS headers

```bash
curl -s -I -X OPTIONS "$WORKER" \
  -H "Origin: https://neobookworm.uk" \
  -H "Access-Control-Request-Method: POST"
```

Expected: `HTTP/2 204` with `Access-Control-Allow-Origin: https://neobookworm.uk`.

### Plumbers-switch payload (includes currentUrl) — expect 200

```bash
curl -s -X POST "$WORKER" \
  -H "Content-Type: application/json" \
  -H "Origin: https://neobookworm.uk" \
  -d '{
    "fullName":    "Sandra Hill",
    "bizName":     "Hill Heating",
    "email":       "sandra@example.com",
    "startOption": "review_site_first",
    "source":      "plumbers-switch-landing",
    "currentUrl":  "https://old-site-example.co.uk"
  }'
```

### Check the row was saved (local)

```bash
npx wrangler d1 execute neobookworm-enquiries --local \
  --command "SELECT id, email, source, notion_status FROM landing_enquiries ORDER BY created_at DESC LIMIT 1"
```

### Check the row was saved (remote)

```bash
npx wrangler d1 execute neobookworm-enquiries --remote \
  --command "SELECT id, email, source, notion_status FROM landing_enquiries ORDER BY created_at DESC LIMIT 1"
```

---

## Environment variables / secrets

### Worker secrets (set via `wrangler secret put` from `workers/landing-enquiry/`)

```bash
wrangler secret put NOTION_API_KEY   # Notion internal integration secret
wrangler secret put NOTIFY_SECRET    # shared secret — must match Vercel NOTIFY_SECRET
```

| Secret | Purpose |
|---|---|
| `NOTION_API_KEY` | Creates row in Client Sites Notion database. If not set, `notion_status` is set to `skipped` and a warning is logged. |
| `NOTIFY_SECRET` | Authenticates POST to `/api/notify-landing-enquiry` on Vercel. If not set, `email_status` is set to `skipped`. |

SMTP credentials stay on Vercel — Workers cannot open TCP connections to ports 587/465.

### Vercel env var to add

```
NOTIFY_SECRET   # same value as Worker NOTIFY_SECRET secret
```

Add this in the Vercel dashboard → Project → Settings → Environment Variables.
Existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `TO_EMAIL` are unchanged.

---

## Background sync behaviour (Phase 2)

After D1 insert succeeds, `ctx.waitUntil(syncEnquiry(env, id))` runs in the background:

1. **Load row** — `SELECT * FROM landing_enquiries WHERE id = ?`; parse `payload_json` for field data
2. **Notion** — create Client Sites row; on success set `notion_status='ok'`, `notion_page_id=<id>`; on failure set `notion_status='failed'`, `notion_error=<message>`. Always increment `notion_attempts`.
3. **Email** — POST to `https://neobookworm.uk/api/notify-landing-enquiry` with `X-Notify-Secret`; on success set `email_status='ok'`; on failure set `email_status='failed'`, `email_error=<message>`. Always increment `email_attempts`.
4. **Secrets not set** — `NOTION_API_KEY` missing → `notion_status='skipped'`; `NOTIFY_SECRET` missing → `email_status='skipped'`.

The HTTP response (`200 { ok: true, id }`) is always returned before background tasks finish. Notion/email failures **never** affect the HTTP response.

Email includes the Notion page URL when `notionPageId` is set (Notion ran first).

---

## Route setup (when ready)

To serve the Worker at `api.neobookworm.uk/landing-enquiry`:

1. In your Cloudflare dashboard, ensure `neobookworm.uk` is proxied through Cloudflare.
2. Create a DNS A/AAAA record for `api.neobookworm.uk` pointing to `192.0.2.1` (dummy IP — Workers intercept before it reaches the origin).
3. Uncomment and update the `routes` block in `wrangler.toml`:
   ```toml
   routes = [{ pattern = "api.neobookworm.uk/landing-enquiry", zone_name = "neobookworm.uk" }]
   ```
4. Redeploy: `npx wrangler deploy`

The landing pages (`plumbers.html`, `plumbers-switch.html`) do **not** change in Phase 1 — they still POST to Vercel's `/api/landing-enquiry`.

---

## Performance

Target: p95 response time under 1 second (typically under 300ms).

### Results — 14 May 2026 (remote, Swindon → WEUR/AMS)

| Request | Time | Notes |
|---|---|---|
| POST 1 | 685ms | Cold start (Worker initialising) |
| POST 2 | 87ms | Warm |
| POST 3 | 102ms | Warm |
| POST 4 | 83ms | Warm |
| POST 5 | 90ms | Warm |

**p50 (warm): ~90ms. p95 (including cold start): 685ms.**  
All five under 1 second. ✅ Target met.

The first request is slower because Cloudflare spins up a new Worker isolate on the first hit after a period of inactivity. Warm requests run at 83–102ms — well inside the 300ms typical target. From a user's perspective, the landing page form submits and shows the thank-you message in under 100ms on any warm hit.

### Re-run the timing test yourself

From `workers/landing-enquiry/` in PowerShell:

```powershell
$WORKER = "https://neobookworm-landing-enquiry.nickbarrett.workers.dev"
$headers = @{ "Content-Type" = "application/json"; "Origin" = "https://neobookworm.uk" }
$body = '{"fullName":"Perf Test","bizName":"Perf Co","email":"perf@example.com","source":"plumbers-landing"}'

1..5 | ForEach-Object {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $r  = Invoke-RestMethod -Method POST -Uri $WORKER -Headers $headers -Body $body
  $sw.Stop()
  "POST $_ — $($sw.ElapsedMilliseconds)ms — id: $($r.id)"
}
```

---

## Regression note

`api/landing-enquiry.js` on Vercel is **intentionally untouched**. It continues to
handle live traffic (Notion write + SMTP email) exactly as before. The Worker is
parallel infrastructure — the switch-over happens in Phase 3.

---

## Phase 3 prerequisites

```
Phase 2 complete when:
- [x] NOTION_API_KEY set on Worker (wrangler secret put NOTION_API_KEY) — 14 May 2026
- [x] NOTIFY_SECRET set on Worker and in Vercel env vars; api/notify-landing-enquiry.js deployed — 14 May 2026
- [x] Worker redeployed (npx wrangler deploy) after secrets are set — 14 May 2026
- [x] Test row in D1 shows notion_status='ok' (query with wrangler d1 execute --remote) — 14 May 2026
- [x] Test notification email received via notify endpoint — 14 May 2026
- [ ] Failed Notion path tested: POST with wrong NOTION_API_KEY → row saved, notion_status='failed', notion_error populated
- [ ] NOTIFY_SECRET-not-set path tested: email_status='skipped', Notion still succeeds
- [x] plumbers.html still on Vercel /api/landing-enquiry (not yet cut over)
```

Phase 3 will cut over `plumbers.html` and `plumbers-switch.html` to POST directly to
the Worker URL (`https://neobookworm-landing-enquiry.nickbarrett.workers.dev`), and
add a retry cron for rows where `notion_status='failed'` or `email_status='failed'`.
