# Landing enquiry — D1 + Cloudflare Worker migration

Run these agent prompts **in order** in separate Cursor agent sessions. Complete each phase's handoff checklist before starting the next.

| Phase | File | Summary |
|-------|------|---------|
| 1 | [phase-1-worker-d1.md](./phase-1-worker-d1.md) | Worker + D1 save only; fast `200` response |
| 2 | [phase-2-notion-email-sync.md](./phase-2-notion-email-sync.md) | Background Notion + email (Vercel notify endpoint) via `waitUntil` |
| 3 | [phase-3-cron-retry.md](./phase-3-cron-retry.md) | Retry cron + daily failed-sync digest |
| 4 | [phase-4-cutover.md](./phase-4-cutover.md) | Point landing pages at Worker; deprecate Vercel route |

**Production URL target:** `https://api.neobookworm.uk/landing-enquiry`

**Unchanged by this migration:** Option 3 on both landing pages (redirect to `/intake-form.html`).
