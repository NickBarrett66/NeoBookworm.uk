# Agent task: Phase 4 — Point landing pages at Worker; deprecate Vercel route

## Prerequisite checks (STOP if any fail)

1. Worker URL live and tested: `https://api.neobookworm.uk/landing-enquiry` (or documented equivalent) returns `200` + CORS for `https://neobookworm.uk`.
2. Phase 3 complete: retry cron deployed; Nick has seen at least one successful end-to-end test (D1 + Notion + email) via Worker POST.
3. D1 remote has migration applied; query works.
4. DNS: `api.neobookworm.uk` proxied through Cloudflare to Worker (Nick confirms — agent should document verification steps, not create Cloudflare account). Use **`[[custom_domains]]`** in `wrangler.toml` (preferred over legacy `[routes]`):
   ```toml
   [[custom_domains]]
   domain = "api.neobookworm.uk"
   ```
5. Compare Worker vs Vercel behaviour: same JSON contract, same validation errors.

## Context

Switch production form traffic from Vercel `api/landing-enquiry.js` to the Cloudflare Worker. Option 3 (intake redirect) is unchanged.

## HTML changes

Update `fetch` URL in:

- `plumbers.html` — options 1 & 2 POST only
- `plumbers-switch.html` — options 1 & 2 POST only

Use absolute URL for cross-origin:

```javascript
fetch('https://api.neobookworm.uk/landing-enquiry', {
```

(Adjust if README documents a different production URL.)

Option 3 redirect to `/intake-form.html?...` stays on neobookworm.uk — no change.

## Vercel endpoint

Update `api/landing-enquiry.js` to one of:

- **Preferred:** Return `410 Gone` with JSON `{ error: 'This endpoint moved. Use api.neobookworm.uk/landing-enquiry' }` and log referrer — catches stale caches.
- **Or:** Thin proxy to Worker (only if same contract; adds latency — avoid unless Nick requests).

Add comment at top pointing to `workers/landing-enquiry/README.md`.

## Documentation

Update `CLAUDE.md`:

- Outstanding: landing-enquiry Worker + D1 — mark done or update
- `plumbers.html` / `plumbers-switch.html` notes: forms POST to Worker
- `WEBSITE-REFERENCE.md` if it documents APIs — add Worker URL, D1, cron, secrets on Cloudflare not Vercel

## Constraints

- Do not remove Worker code.
- Do not change accordion form UX, copy, or option 3 flow.
- Do not modify `.env`.

## Testing requirements (full acceptance)

### Functional — plumbers.html

1. Option 1 (Free preview): fill name/biz/email → submit → thank-you appears in **under 2 seconds** on production after deploy.
2. D1: new row with `source='plumbers-landing'`, `start_option='leave_it_with_me'`.
3. Within 2 minutes: `notion_status='ok'` and notification email received (via Vercel notify endpoint).
4. Option 2 with textarea details — `details` in D1 and Notion notes.
5. Option 3 — still redirects to intake-form (no Worker).

### Functional — plumbers-switch.html

6. Option 1 with `currentUrl` — URL in D1 + Notion notes.
7. Option 2 with details — same as above with `ready_to_switch`.

### Failure UX

8. **Dev only:** comment out the `DB` D1 binding in a local `wrangler.toml` override, POST a valid payload — expect `500` with generic error `{ "error": "Could not save enquiry." }`, **not** thank-you. Do not test on production.
9. Vercel old URL `POST /api/landing-enquiry` returns 410 (or documented behaviour) — no silent fallback to slow path.

### CORS / browser

10. Real browser submit from `https://neobookworm.uk/plumbers.html` — no CORS console errors.

### Performance (production)

11. Five submits — median time-to-thank-you **<2s** (Network tab: Worker POST only, not Vercel).

### Monitoring (document for Nick — 1 week)

12. Add README section **Post go-live monitoring**:

    - Daily: `wrangler d1 execute ...` failed count
    - Check Cloudflare cron logs
    - Compare D1 row count vs Notion new rows for landing sources
    - Digest email if Phase 3 enabled

## Deliverables

- Updated `plumbers.html`, `plumbers-switch.html`
- Updated `api/landing-enquiry.js` (410 or documented deprecation)
- Updated `CLAUDE.md` (+ `WEBSITE-REFERENCE.md` if API map exists)
- Handoff summary: production URL, date switched, monitoring checklist
