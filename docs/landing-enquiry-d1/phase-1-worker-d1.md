# Agent task: Phase 1 — Cloudflare Worker + D1 for landing enquiries (save only)

## Context

NeoBookworm.uk landing pages `plumbers.html` and `plumbers-switch.html` POST options 1 & 2 to `/api/landing-enquiry` on Vercel. That endpoint is slow because it awaits Notion + SMTP before responding. We are migrating to **D1 first, Notion/email later**.

**Phase 1 scope only:** create Cloudflare Worker infrastructure that validates the payload, inserts into D1, and returns `{ ok: true }` quickly. Do **not** call Notion or SMTP yet. Do **not** change `plumbers.html` or `plumbers-switch.html` fetch URLs yet (still `/api/landing-enquiry` on Vercel).

## Repo

`c:\Users\Nick\Dropbox\00 Neobookworm\NeoBookworm.uk`

## Create this structure

```
workers/
  landing-enquiry/
    package.json
    wrangler.toml
    .gitignore                   # node_modules/, .wrangler/
    README.md                    # setup + local dev + deploy steps for Nick
    migrations/
      0001_landing_enquiries.sql
    src/
      index.js
      validate.js
      cors.js
```

## D1 schema (`0001_landing_enquiries.sql`)

Include all columns needed for later phases (even if unused in Phase 1):

- `id` (TEXT PK, uuid)
- `created_at` (TEXT ISO8601)
- `full_name`, `biz_name`, `email`, `start_option`, `source` (NOT NULL where appropriate)
- `details`, `current_url` (nullable TEXT)
- `notion_status`, `email_status` (TEXT, default `'pending'`)
- `notion_page_id`, `notion_error`, `email_error` (nullable TEXT)
- `notion_attempts`, `email_attempts` (INTEGER default 0)
- `payload_json` (TEXT NOT NULL — full request body)
- Index on `(notion_status, email_status, created_at)`

## API contract (must match existing Vercel endpoint)

**POST** JSON body:

```json
{
  "fullName": "string",
  "bizName": "string",
  "email": "string",
  "startOption": "leave_it_with_me | tell_more | review_site_first | ready_to_switch",
  "details": "string (optional)",
  "source": "plumbers-landing | plumbers-switch-landing",
  "currentUrl": "string (optional, plumbers-switch)"
}
```

Validation: `fullName`, `bizName`, `email` required (same rules as `api/landing-enquiry.js`).

**Success:** `200` `{ "ok": true, "id": "<uuid>" }`  
**Validation error:** `400` `{ "error": "..." }`  
**D1 failure:** `500` `{ "error": "Could not save enquiry." }` (generic — no internal details to client)

## Worker behaviour

- Handle `OPTIONS` for CORS preflight.
- CORS allow origins: `https://neobookworm.uk`, `https://www.neobookworm.uk`, and any port on localhost (`http://localhost:…`, `http://127.0.0.1:…`). Browsers send a literal port in the `Origin` header (e.g. `http://localhost:5500`) — use `startsWith('http://localhost:')` / `startsWith('http://127.0.0.1:')`, not exact glob matching.
- On successful insert, log `[landing-enquiry] D1 saved: <id>` (console only).
- Do **not** implement `ctx.waitUntil` sync in Phase 1.

## wrangler.toml

- Worker name: `neobookworm-landing-enquiry`
- Required:
  ```toml
  compatibility_date = "2024-09-23"
  compatibility_flags = ["nodejs_compat"]
  ```
- D1 binding: `DB` → database name `neobookworm-enquiries`
- Document in README that Nick must run:
  - `npx wrangler d1 create neobookworm-enquiries`
  - paste `database_id` into wrangler.toml
  - `npx wrangler d1 migrations apply neobookworm-enquiries --remote`
  - `npx wrangler deploy`
- Route target (document, do not require DNS in Phase 1): `api.neobookworm.uk/landing-enquiry`

## Constraints

- Do not modify `.env` or `.claude/settings.local.json`.
- Do not change `plumbers.html`, `plumbers-switch.html`, or `api/landing-enquiry.js` in Phase 1.
- Do not pull in `intake-shared.js` or AWS SDK into the Worker — keep the Worker bundle small.
- Plain English in README; no jargon in user-facing error strings.

## Testing requirements (agent must run or document how Nick runs)

### Local

1. `npx wrangler d1 migrations apply neobookworm-enquiries --local` (or `--remote` if creds available).
2. `npx wrangler dev` and POST a valid plumbers payload with curl — expect `200` + `id` in <500ms locally.
3. POST missing `email` — expect `400`.
4. POST with `Origin: https://neobookworm.uk` — expect CORS headers on response and successful OPTIONS.
5. Query local D1: row exists with correct fields and `notion_status`/`email_status` = `pending`.

   ```bash
   npx wrangler d1 execute neobookworm-enquiries --local --command "SELECT id, email, source, notion_status FROM landing_enquiries ORDER BY created_at DESC LIMIT 1"
   ```

### Remote (if `wrangler login` / deploy credentials available)

6. Deploy to Cloudflare.
7. POST to deployed Worker URL — same assertions as local.
8. Confirm Vercel `api/landing-enquiry.js` is **unchanged** and still works (regression note in handoff).

### Performance check

9. Time 5 consecutive successful POSTs to Worker — p95 response time should be **under 1 second** (typically <300ms). Log timings in handoff.

## Deliverables

- All files under `workers/landing-enquiry/`
- `workers/landing-enquiry/README.md` with setup, secrets list (empty for Phase 1), test curl examples, and deployed URL placeholder
- Short handoff note at bottom of README: **Phase 2 prerequisites** (see below)

## Phase 2 handoff block (add to README)

```
Phase 1 complete when:
- [ ] D1 database created (local + remote)
- [ ] Migration 0001 applied
- [ ] Worker deployed and POST /landing-enquiry returns 200 + id
- [ ] Row visible in D1
- [ ] plumbers.html still points at Vercel /api/landing-enquiry (intentional)
```

Do not update CLAUDE.md build tables unless you add a single row to Outstanding for the Worker migration — optional, not required in Phase 1.
