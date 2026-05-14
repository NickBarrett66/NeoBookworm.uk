# Agent task: Phase 2 — Notion + email sync after D1 (waitUntil)

## Prerequisite checks (STOP if any fail — report to user, do not guess)

Before writing code, verify Phase 1 is complete:

1. **Files exist:** `workers/landing-enquiry/wrangler.toml`, `src/index.js`, `migrations/0001_landing_enquiries.sql`
2. **D1 remote:** `npx wrangler d1 execute neobookworm-enquiries --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name='landing_enquiries'"` returns a row (or document that Nick confirmed remote DB exists).
3. **Worker deployed:** README or wrangler.toml contains a real `database_id` and deploy URL (not placeholders).
4. **Smoke test:** POST to Worker returns `200 { ok: true, id }` and row appears in D1 with `notion_status = 'pending'`.
5. **Landing pages unchanged:** `plumbers.html` and `plumbers-switch.html` still `fetch('/api/landing-enquiry', ...)` — Phase 2 must not switch production traffic yet.

If prerequisites fail, output what's missing and exit.

## Context

Phase 1 Worker saves enquiries to D1 and responds immediately. Phase 2 adds **background sync** via `ctx.waitUntil()`:

- Create Notion row in **Client Sites** database (same as intake)
- POST to Vercel **`/api/notify-landing-enquiry`** for notification email (iCloud SMTP stays on Vercel)
- Update D1 row sync status columns

Prospect still only waits on D1 insert. Notion/email failures must **not** change the HTTP response after D1 succeeded.

## Notion target (port from repo — do not require intake-shared.js in Worker)

Read and port logic from:

- `api/intake-shared.js` → `createLandingEnquiryRecord`, `buildLandingEnquiryNotes`, `LANDING_*_LABELS`, `notionFetchWithRetry`, `assignNotionRichText`, `NOTION_PROP` (**subset only** — see below), `NOTION_VERSION`
- Client Sites `DATABASE_ID`: `4b45078a341941bcb5877e52f3d27c6c`
- Properties: Business Name (title), Full name, Client Email, Trade Category = Plumber, Status = Pending Launch, Additional notes (combined source/start option/current URL/details)

**`NOTION_PROP` subset only** — copy just these keys into the Worker (do not copy the full ~30-key object): `businessName`, `tradeCategory`, `status`, `fullName`, `clientEmail`, `additionalNotes`.

**Trade Category must stay hardcoded to `'Plumber'`** — match existing `createLandingEnquiryRecord` in `intake-shared.js` (line ~795). Do not infer trade from `source` or generalise.

Implement Notion fetch with simple retry (2–3 attempts, backoff) in Worker — do not import Node-only modules.

## Email (delegate to Vercel — do not use SMTP in the Worker)

Cloudflare Workers cannot open TCP connections to SMTP ports (587, 465). **Do not attempt Nodemailer, raw SMTP, or iCloud SMTP in the Worker.** Production email uses iCloud SMTP on Vercel (`smtp.mail.me.com`, port 587) — see `CLAUDE.md` Email sending section.

The correct approach:

1. Create a new thin Vercel serverless function **`api/notify-landing-enquiry.js`** in the main repo that:
   - Accepts `POST` JSON: `{ fullName, bizName, email, startOption, source, currentUrl, details, notionPageId }`
   - Validates header `X-Notify-Secret` against `NOTIFY_SECRET` env var (prevents public abuse)
   - Sends the notification email via iCloud SMTP — reuse the same Nodemailer logic as `api/landing-enquiry.js` `sendNotification` (include Notion page URL when `notionPageId` is set)
   - Returns `200 { ok: true }` on success; `500` on failure

2. In the Worker's `email.js` / `sync.js`, after the Notion step, `fetch` POST to `https://neobookworm.uk/api/notify-landing-enquiry` with row fields and `notionPageId`, passing `X-Notify-Secret` from Worker secret `NOTIFY_SECRET`.

3. Vercel call fails (network or 5xx): set `email_status = 'failed'`, `email_error` = truncated response (max 500 chars), increment `email_attempts`. Do not fail the whole background task.

4. `NOTIFY_SECRET` not set on Worker: set `email_status = 'skipped'`, log warning.

`api/notify-landing-enquiry.js` uses existing Vercel env vars `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `TO_EMAIL` — no new email credentials.

## Worker secrets (document in README)

```
wrangler secret put NOTION_API_KEY
wrangler secret put NOTIFY_SECRET   # same value must be set in Vercel env vars
```

## Vercel env var to add

```
NOTIFY_SECRET   # same value as Worker NOTIFY_SECRET
```

## D1 status updates

After background sync, UPDATE row:

- Notion success: `notion_status='ok'`, `notion_page_id=<id>`, clear `notion_error`, increment `notion_attempts`
- Notion failure: `notion_status='failed'`, `notion_error=<truncated message, max 500 chars>`, increment `notion_attempts`
- Email success: `email_status='ok'`, clear `email_error`, increment `email_attempts`
- Email failure: `email_status='failed'`, `email_error=<truncated, max 500 chars>`, increment `email_attempts`
- Notify endpoint not configured on Worker: `email_status='skipped'`

Run Notion then email sequentially in background (email can include Notion link).

**`syncEnquiry(env, id)`** must load the full D1 row by `id`, parse `payload_json` for field data (used by Phase 3 retry cron as well as initial `waitUntil`). Do not assume fields are only available from the HTTP request body.

## File layout (extend Phase 1)

```
workers/landing-enquiry/src/
  index.js          # add ctx.waitUntil(syncEnquiry(env, id))
  sync.js           # load row from D1 (parse payload_json), notion + email, update D1
  notion.js         # ported Notion create
  email.js          # HTTP POST to /api/notify-landing-enquiry on Vercel

api/
  notify-landing-enquiry.js   # NEW — thin Vercel function; iCloud SMTP via Nodemailer
```

## Constraints

- Still do **not** change `plumbers.html` / `plumbers-switch.html` fetch URLs.
- Leave `api/landing-enquiry.js` on Vercel as-is for now (parallel path). Add `api/notify-landing-enquiry.js` only.
- Do not modify `.env`.

## Testing requirements

### Unit-style (in Worker dev)

1. POST valid enquiry → `200` in <1s **even if** Notion is slow (mock or real).
2. Within 30s, D1 row shows `notion_status='ok'` and `email_status` in (`ok`|`skipped`|`failed`) — query with wrangler d1 execute.
3. **Invalid Notion key** (temp wrong secret on dev): POST still `200`, row saved, `notion_status='failed'`, `notion_error` populated.
4. **`NOTIFY_SECRET` not set on Worker:** `email_status='skipped'`, Notion may still succeed.
5. **`/api/notify-landing-enquiry` returns 500:** `email_status='failed'`, `email_error` populated, `email_attempts` incremented.
6. Payload with `currentUrl` + `details` — Additional notes in Notion matches `buildLandingEnquiryNotes` format (verify via Notion UI or API GET if key available).
7. Both sources: `plumbers-landing` and `plumbers-switch-landing` labels in notes.

### Regression

7. Phase 1 curl tests still pass (fast 200).
8. Vercel endpoint untouched.

### Performance

9. POST response time still p95 <1s with background sync enabled (measure with curl `-w '%{time_total}'`).

## Deliverables

- Updated Worker code + README (secrets, sync behaviour, failure semantics)
- README section: **Phase 3 prerequisites**

## Phase 3 handoff block

```
Phase 2 complete when:
- [ ] NOTION_API_KEY set on Worker
- [ ] NOTIFY_SECRET set on Worker and Vercel; notify endpoint deployed
- [ ] Test row in D1 with notion_status='ok' (production or staging Notion)
- [ ] Test notification email received via notify endpoint
- [ ] Failed Notion path tested (row remains, status=failed)
- [ ] plumbers.html still on Vercel /api/landing-enquiry
```
