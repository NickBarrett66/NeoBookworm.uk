# landing-enquiry Worker (Phase 3)

Cloudflare Worker that receives landing page enquiries from `plumbers.html` and
`plumbers-switch.html`, validates them, saves them to D1, and then — in the
background — creates a Notion row and sends a notification email via Vercel.

**Phase 3 scope:** retry cron (`*/15 * * * *`) + daily failed-sync digest (`0 8 * * *`).  
The existing Vercel `/api/landing-enquiry` is **unchanged** and still handles live traffic.  
Switch-over happens in Phase 4.

---

## Deployed details

| | |
|---|---|
| **Production URL** | `https://neobookworm-landing-enquiry.nickbarrett.workers.dev` |
| **Custom domain (future)** | `https://api.neobookworm.uk/landing-enquiry` — pending DNS migration to Cloudflare |
| **Wrangler version** | 4.90.1 |
| **D1 database** | `neobookworm-enquiries` |
| **D1 database ID** | `771b3047-f977-485e-9cfb-736815931998` |
| **D1 region** | WEUR (served from AMS) |
| **Current version ID** | Phase 4 deployed — see Cloudflare dashboard for current version ID |
| **Migration applied** | `0001_landing_enquiries.sql` ✅ |
| **Phase 4 deployed** | 14 May 2026 — `plumbers.html` + `plumbers-switch.html` live on Worker ✅ |
| **Secrets set** | `NOTION_API_KEY` ✅, `NOTIFY_SECRET` ✅ |
| **Vercel notify endpoint** | `api/notify-landing-enquiry.js` deployed ✅ |
| **Vercel landing-enquiry** | Deprecated — returns `410 Gone` as of Phase 4 cutover |

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

## Scheduled crons (Phase 3)

Two cron triggers are configured in `wrangler.toml` under `[triggers]`.

### Retry cron — `*/15 * * * *`

Runs every 15 minutes. Queries D1 for rows where either sync leg failed and the
attempt counter is under 5, within the last 7 days:

```sql
SELECT * FROM landing_enquiries
WHERE (
    (notion_status = 'failed' AND notion_attempts < 5)
    OR (email_status = 'failed' AND email_attempts < 5)
  )
  AND created_at > datetime('now', '-7 days')
ORDER BY created_at ASC
LIMIT 20
```

For each row it calls `syncEnquiry(env, id)` — the same function used by the HTTP
handler. `syncEnquiry` skips any leg that is already `ok` or `skipped`, so a row
where Notion succeeded but email failed will only retry the email leg.

After 5 attempts on a given leg the row is left as `failed` and is no longer picked
up by the retry cron (attempt counter is at the cap).

### Daily digest — `0 8 * * *`

Runs at 08:00 UTC each day. Cloudflare crons are UTC-only — no automatic DST adjustment:

| Cron (UTC) | UK winter (GMT) | UK summer (BST) |
|---|---|---|
| `0 8 * * *` | 08:00 | 09:00 |

Queries **all** rows (no age limit) where `notion_status='failed'` OR
`email_status='failed'` — old failures must never be silently dropped.

If any rows are found, POSTs to `https://neobookworm.uk/api/notify-landing-enquiry`
with `{ type: "digest", rows: [...] }`. Vercel sends one summary email to `TO_EMAIL`
with a plain-text table of all failing rows.

If zero rows are failing, no POST is made and no email is sent.

### Manual replay command

Check which rows are currently failing:

```bash
npx wrangler d1 execute neobookworm-enquiries --remote \
  --command "SELECT id, notion_status, email_status, notion_attempts, email_attempts FROM landing_enquiries WHERE notion_status='failed' OR email_status='failed'"
```

### Testing the scheduled handler locally

Invoke the scheduled handler without waiting for the real cron:

```bash
# From workers/landing-enquiry/
npx wrangler dev --test-scheduled
```

Then in a second terminal trigger the retry cron:

```bash
curl "http://localhost:8787/__scheduled?cron=*/15+*+*+*+*"
```

Trigger the digest cron:

```bash
curl "http://localhost:8787/__scheduled?cron=0+8+*+*+*"
```

**Test steps (retry cron):**

1. Seed a failed row in remote D1:

   ```bash
   npx wrangler d1 execute neobookworm-enquiries --remote \
     --command "UPDATE landing_enquiries SET notion_status='failed', notion_attempts=1 WHERE id='<your-test-id>'"
   ```

2. Invoke scheduled handler (local or via `wrangler tail` on the deployed Worker).
3. Confirm the row moves to `notion_status='ok'` or that `notion_attempts` incremented.
4. Seed a row with `notion_attempts=5` — confirm it is **not** retried.

**Test steps (digest):**

5. Seed 2 failed rows → run digest handler → email received listing both IDs.
6. Zero failed rows → confirm no email (check logs only).

**Safety checks:**

7. Rows already `ok` or `skipped` are never re-processed.
8. No duplicate Notion pages: if `notion_status='ok'`, Notion leg is skipped.

---

## Phase 4 cutover (14 May 2026)

`plumbers.html` and `plumbers-switch.html` now POST to
`https://neobookworm-landing-enquiry.nickbarrett.workers.dev`.
`api/landing-enquiry.js` on Vercel now returns `410 Gone`.

**To complete the cutover, run from `workers/landing-enquiry/`:**

```bash
npx wrangler deploy
```

The `[[routes]]` custom domain block is commented out — it requires neobookworm.uk's DNS
to be managed by Cloudflare. Uncomment and redeploy once that migration is done to switch
the production URL to `https://api.neobookworm.uk/landing-enquiry`.

---

## Post go-live monitoring (first week after Phase 4 cutover)

Run these checks daily for the first week after switching live traffic to the Worker.

### Daily failed-row count

```bash
npx wrangler d1 execute neobookworm-enquiries --remote \
  --command "SELECT COUNT(*) AS failing FROM landing_enquiries WHERE notion_status='failed' OR email_status='failed'"
```

Expected: 0. Any non-zero count means the retry cron isn't clearing rows — investigate with the full failed-row query below.

### Full failed-row details

```bash
npx wrangler d1 execute neobookworm-enquiries --remote \
  --command "SELECT id, email, source, notion_status, email_status, notion_attempts, email_attempts, created_at FROM landing_enquiries WHERE notion_status='failed' OR email_status='failed' ORDER BY created_at DESC"
```

### Cron execution logs

In the Cloudflare dashboard → Workers → neobookworm-landing-enquiry → Logs (or use `wrangler tail`):

```bash
npx wrangler tail neobookworm-landing-enquiry
```

Check that the `*/15` retry cron fires every 15 minutes and the `0 8` digest fires each morning.

### D1 row count vs Notion new rows

Compare the count of new rows in D1 for landing sources against new rows in the Notion Client Sites database each day:

```bash
npx wrangler d1 execute neobookworm-enquiries --remote \
  --command "SELECT source, COUNT(*) AS total FROM landing_enquiries WHERE created_at > datetime('now','-1 day') GROUP BY source"
```

Expected: each row has a matching Notion record (`notion_status='ok'`).

### Vercel 410 log check

In the Vercel dashboard → Functions → `api/landing-enquiry` → Logs:
- Any 410 hit after cutover day means a stale request reached the old endpoint — acceptable if count drops to zero within a few hours.
- 410 hits after day 2 would indicate a form somewhere still pointing at Vercel — re-check `plumbers.html` and `plumbers-switch.html`.

### Digest email

The daily digest cron (`0 8 * * *` UTC) sends an email to `TO_EMAIL` if any rows are still failing after retries. If you receive a digest email, check the failed-row query above and investigate the specific IDs listed.

If zero rows are failing, no email is sent — silence is healthy.

---

## Phase 4 prerequisites

```
Phase 3 complete when:
- [x] npx wrangler deploy run from workers/landing-enquiry/ after Phase 3 code changes — 14 May 2026
- [x] Cron triggers visible in Cloudflare dashboard → Workers → neobookworm-landing-enquiry → Triggers — 14 May 2026
- [ ] Retry tested on at least one artificial failed row (notion_attempts incremented or row moves to 'ok')
- [ ] Row with notion_attempts >= 5 confirmed not picked up again
- [ ] Daily digest tested OR explicitly disabled with reason documented here
- [ ] Worker URL stable: https://neobookworm-landing-enquiry.nickbarrett.workers.dev (or custom route)
- [ ] Nick confirms ready to switch live form traffic (plumbers.html / plumbers-switch.html)
```

Phase 4 will cut over `plumbers.html` and `plumbers-switch.html` to POST directly to
the Worker URL, removing the Vercel `/api/landing-enquiry` as the primary path.
