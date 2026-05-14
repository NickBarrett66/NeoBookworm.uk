# Agent task: Phase 3 — Retry cron + daily failed-sync alert

## Prerequisite checks (STOP if any fail)

1. Phase 2 README handoff items all checked (or Nick confirms).
2. `workers/landing-enquiry/src/sync.js` (or equivalent) exists and is reusable for retry.
3. Remote D1 has at least one test row; sync columns populated correctly on a real POST.
4. Worker secrets: `NOTION_API_KEY` and `NOTIFY_SECRET` set; Vercel notify endpoint deployed for production alerting (or user accepts email digest skipped in dev).
5. `plumbers.html` / `plumbers-switch.html` still point at Vercel — do not change in Phase 3.

## Context

Some `waitUntil` syncs will fail (Notion blips, notify endpoint timeouts). Phase 3 adds:

1. **Scheduled Worker** (cron) to retry failed rows
2. **Optional daily email** to Nick listing rows still failed after retries

## Retry Worker

Create either:

- Same worker with `scheduled` handler in `wrangler.toml`, **or**
- `workers/landing-enquiry-retry/` — prefer **same worker** + `scheduled` if simpler.

### Cron schedule

`*/15 * * * *` (every 15 minutes) — document in wrangler.toml:

```toml
[triggers]
crons = ["*/15 * * * *", "0 8 * * *"]
```

### Retry logic

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

- Reuse Phase 2 `syncEnquiry(env, id)` for each row — it loads fields from `payload_json`.
- **Only retry failed legs:** skip Notion if `notion_status` is already `'ok'`; skip email if `email_status` is already `'ok'` or `'skipped'`.
- Increment attempt counters on each try for the leg that runs.
- After 5 attempts on a given leg, leave that leg as `failed` (no infinite loop).

### Daily digest

Second cron: `0 8 * * *` (08:00 UTC). Cloudflare crons are UTC-only — there is no automatic UK DST adjustment:

| Cron (UTC) | UK winter (GMT) | UK summer (BST) |
|---|---|---|
| `0 8 * * *` | 08:00 | 09:00 |
| `0 7 * * *` | 07:00 | 08:00 |

Use `0 8 * * *` and document “08:00 UK in winter, 09:00 in summer” in README (or pick `0 7 * * *` if 08:00 in summer matters more).

Query **all unresolved** rows where `notion_status='failed' OR email_status='failed'` (do not limit to last 24 hours — old failures must not be silently dropped).

**Digest API (extend Phase 2 notify function — do not invent a separate SMTP path):**

`POST https://neobookworm.uk/api/notify-landing-enquiry` with header `X-Notify-Secret` and JSON:

```json
{
  "type": "digest",
  "rows": [
    {
      "id": "uuid",
      "created_at": "ISO8601",
      "email": "…",
      "biz_name": "…",
      "source": "…",
      "notion_status": "failed",
      "email_status": "ok",
      "notion_error": "…",
      "email_error": null
    }
  ]
}
```

In `api/notify-landing-enquiry.js`: if `type === 'digest'`, send one email to `TO_EMAIL` with subject `NeoBookworm: landing enquiries needing attention` and a plain-text table of the rows; if `rows` is empty or omitted, return `200` without sending. For `type` absent or any other value, keep existing single-enquiry behaviour from Phase 2.

- If zero failures in D1, **do not POST** (prefer silent — no email).

## Constraints

- Do not change landing page fetch URLs.
- Do not modify Vercel `api/landing-enquiry.js` yet.
- Share sync module between HTTP and cron — no duplicated Notion/email logic.

## Testing requirements

### Retry cron

1. **Seed a failed row** in remote/local D1 (`UPDATE notion_status='failed'`, `notion_attempts=1` with valid `payload_json`).
2. Invoke scheduled handler locally: `wrangler dev --test-scheduled` or equivalent (document command used).
3. Confirm row moves to `ok` if Notion/notify work, or `notion_attempts` increments on continued failure.
4. Row with `notion_attempts >= 5` is **not** picked up again.

### Digest

5. Seed 2 failed rows → run digest handler → email received with both ids (if notify endpoint configured).
6. Zero failed rows → no email sent (verify logs only).

### Safety

7. Cron does not re-process rows already `ok` / `skipped`.
8. No duplicate Notion pages on retry (if `notion_status` already `ok`, skip Notion leg).

## Deliverables

- Updated `wrangler.toml` with crons
- `src/scheduled.js` or integrated scheduled handler
- `src/digest.js` if separate
- README: cron behaviour, manual replay command:

  ```bash
  npx wrangler d1 execute neobookworm-enquiries --remote --command "SELECT id, notion_status, email_status, notion_attempts FROM landing_enquiries WHERE notion_status='failed' OR email_status='failed'"
  ```

- **Phase 4 prerequisites** section

## Phase 4 handoff block

```
Phase 3 complete when:
- [ ] Cron deployed and visible in Cloudflare dashboard → Triggers
- [ ] Retry tested on at least one artificial failed row
- [ ] Daily digest tested OR explicitly disabled with reason in README
- [ ] Worker URL stable: https://api.neobookworm.uk/landing-enquiry (or documented final URL)
- [ ] Nick confirms ready to switch live form traffic
```
