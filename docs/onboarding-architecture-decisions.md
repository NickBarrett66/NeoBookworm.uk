# NeoBookworm — Onboarding Architecture Decisions

Captured at the end of **Session 0** of [the build plan](./neobookworm-onboarding-build-plan-v3.md). These are the locked-in decisions that every later session reads as input. Update this file (don't re-derive elsewhere) if any of them changes.

**Last updated:** 25 May 2026

---

## The 7 locked decisions

These are the architectural decisions the plan locked in v3 and that v1 of the onboarding system is built on top of. Each one has a "do not relitigate without reason" stamp.

### 1. Onboarding state lives in a new `clients` table

A new `clients` table in the **`neobookworm-enquiries`** D1 database, keyed by `slug`, with `source_type` + `source_id` columns. Four valid `source_type` values: `landing_enquiry`, `intake`, `contact`, `prospect`.

The existing `prospects` table in `neobookworm-prospects` keeps its current meaning (cold outreach targets) and is not touched. Cold prospects flow into `clients` only at the "promote" step (Session 1 + Session 6).

Schema is defined in Session 1 of the build plan.

### 2. The public client portal `/c/{slug}/` is a Vercel function

`api/portal.js`, reusing the `queryD1` helper now shared via `api/_lib/d1.js`. Same runtime as the rest of the Vercel API. No second runtime, no second deployment target, no second auth model.

The playbook's "portal-worker" section is superseded — see ⚠ note in the playbook itself.

### 3. Onboarding emails send via Google Workspace SMTP

`smtp.gmail.com:587`, STARTTLS, user `nick@neobookworm.uk` authenticated with a Google **app password** stored as `GW_SMTP_PASS`. From-address is always `nick@neobookworm.uk`; From-name is `"Nick at NeoBookworm"`.

This is a **separate transport** from the contact form's iCloud SMTP (`smtp.mail.me.com:587`, `neobookworm@icloud.com`). The two transports are deliberately kept apart:

| Path                         | Transport                  | Env vars used                      | Files                                                   |
|------------------------------|----------------------------|-----------------------------------|----------------------------------------------------------|
| Onboarding (new in v1)       | Google Workspace SMTP      | `GW_SMTP_USER`, `GW_SMTP_PASS`    | `api/_lib/email.js` (Session 3)                          |
| Contact form (live, working) | iCloud SMTP                | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `TO_EMAIL` | `api/contact.js`, `api/notify-landing-enquiry.js`        |

> Do not merge the two. The contact form's iCloud transport is left untouched in this build.

### 4. Operator surface = a new "Clients" tab in `dashboard.html`

`dashboard.html` already has Prospects / Enquiries / Campaigns tabs gated by `DASHBOARD_SECRET`. The onboarding operator view is added as a **fourth tab** (`Clients`) on the same page, reusing the existing tab/filter/sort machinery and the `api/dashboard.js` action-dispatch pattern.

A tradesperson can never log in here. To avoid two renderers drifting, the dashboard's per-client detail view **links to / iframes the real `/c/{slug}/` portal** rather than reimplementing it.

### 5. Onboarding emails are a separate auto-send transactional path

The cold-campaign system (the `outbox` queue, approval gates, sequence + suppression logic in `neobookworm-prospects`) is **not** repurposed for onboarding. Onboarding sends a single template to a single recipient on demand from a Vercel function (`api/_lib/email.js`), logs the send to `email_log` in `neobookworm-enquiries`, and otherwise has nothing in common with the cold-campaign outbox.

Don't let the two send mechanisms blur.

### 6. Notion is retired as a source of truth

**Worker leg implemented in this session.** D1 is canonical for all inbound enquiries, intake submissions, contact form submissions, and onboarding clients. Specifically:

- The `landing-enquiry` Cloudflare Worker (`workers/landing-enquiry/`) no longer writes to Notion. `src/notion.js` is deleted; `src/sync.js` no longer has a Notion leg; `src/scheduled.js` retry + digest queries only consider `email_status`. `NOTION_API_KEY` is no longer read by any Worker code path and can be safely removed with `wrangler secret delete NOTION_API_KEY`.
- No **scheduled** job writes to Notion (the Worker's `*/15` retry cron and `0 8` digest cron now only handle the email leg).
- `prospects.notion_id` in `neobookworm-prospects` stays as the opaque primary key on cold prospects. It is a stable unique string — renaming isn't worth the churn.
- Vestigial columns are kept for now (don't drop in this session, drop in a later housekeeping migration):
  - `landing_enquiries.notion_id`, `notion_status`, `notion_error`, `notion_attempts`, `notion_page_id`, `notion_synced_at` — new rows leave them NULL.
  - `intake_submissions.notion_page_id` — same intent; see follow-ups below for the path that still populates it.

**Known remaining Notion writers (follow-up cleanups, not blocking onboarding work):**

- **`api/intake-finalize.js` / `api/submit-intake.js` / `api/intake-shared.js`** — the structured intake form (`intake-form.html`) still calls Notion (`createNotionRecord` in `intake-shared.js`) when a client submits the full intake. This populates `intake_submissions.notion_page_id`. It is **deliberately untouched in this session** because the intake flow is on the Vercel side, not the Worker, and switching it off without first wiring intake into the new `clients` table (Session 6) would lose the only post-submission visibility we have. Plan to retire this path in/after Session 6 once the dashboard "Clients" tab is the operator surface for intake submissions.
- **Notion-referencing skills** (`neobookworm-campaign-setup`, `-prospect-runner`, `-site-brief`) read `notion_id` as an opaque ID only, which still works. No skill is known to *write* to Notion; if one is added later it should be considered a regression against this decision.

The single small downstream change in `api/notify-landing-enquiry.js` is a one-line guard in the digest renderer so old code that printed `Notion: ${r.notion_status}` no longer prints `Notion: undefined` when the Worker omits that field. The iCloud SMTP credentials and transport in that file are unchanged.

### 7. Timestamps stay TEXT `datetime('now')`

All new `clients` / `email_log` / `feedback` / `stripe_events` tables use SQLite TEXT timestamps populated with the D1 default `datetime('now')`. This matches every existing table in both D1 databases — no INTEGER unix time, no mixing of formats.

The playbook's `email_log` schema (which suggested a different timestamp shape) is superseded by Session 1 in the build plan.

---

## Email-identity test result

**Decision under test:** decision #3 above — that the new Google Workspace SMTP path delivers mail From `nick@neobookworm.uk` with fully aligned SPF, DKIM, and DMARC, scoring at least 8/10 on mail-tester.com.

This needs **one real send** through the new transport to confirm before any code in Session 3 ships, because if `nick@` can't send-as cleanly the whole onboarding voice falls back to `neobookworm@icloud.com` (a documented but weaker fallback in the plan's Session 0 recovery section).

The test itself is a manual step. Fill in the table once the send has been done — leave it as `PENDING` if Session 0 closes before the test has been run, and run the test before opening Session 3.

| Field                         | Value                                                                |
|-------------------------------|----------------------------------------------------------------------|
| Test send date                | PENDING                                                              |
| From address                  | `nick@neobookworm.uk`                                                |
| Transport                     | `smtp.gmail.com:587` (STARTTLS), Google Workspace app password       |
| mail-tester URL               | PENDING (paste full URL)                                             |
| mail-tester score             | PENDING (target ≥ 8/10)                                              |
| SPF aligned?                  | PENDING (target ✅, sender = `_spf.google.com`)                       |
| DKIM aligned?                 | PENDING (target ✅, `google._domainkey` selector)                    |
| DMARC aligned?                | PENDING (target ✅, alignment with `From:` domain)                   |
| Result                        | PENDING — passes / fails / fallback needed                           |

If the test fails, do **not** open Session 3. Either fix DNS (SPF/DKIM/DMARC alignment in the `neobookworm.uk` zone) or fall back to sending onboarding from `neobookworm@icloud.com` and flag the weaker voice in the plan's open questions.

---

## What this session deliberately did **not** touch

To keep the diff reversible in a single isolated commit:

- **`api/contact.js`** — the contact form's iCloud SMTP transport (and its inline D1 insert) is untouched. Onboarding gets its own separate `_lib/email.js` (Session 3).
- **The cold-campaign `outbox`** queue / approval gates / sequence logic in `neobookworm-prospects`. Untouched.
- **The `neobookworm-prospects` database** as a whole — schema, indexes, `prospects.notion_id` PK. Untouched.
- **Vestigial Notion columns** on `landing_enquiries` and `intake_submissions`. Left in place (stop writing, don't drop). A later housekeeping migration will drop them.
- **`api/notify-landing-enquiry.js`** iCloud transport — only the digest renderer's "Notion:" line was made conditional. SMTP creds and the single-enquiry renderer are unchanged.

---

## Session 0 outputs (for the record)

| Path                                                | Status       | Purpose                                                                                          |
|-----------------------------------------------------|--------------|--------------------------------------------------------------------------------------------------|
| `api/_lib/d1.js`                                    | new          | Shared `queryD1` + db-id constants for all Vercel functions.                                     |
| `api/dashboard.js`                                  | edited       | Imports from `_lib/d1.js`. No behaviour change.                                                  |
| `workers/landing-enquiry/src/index.js`              | edited       | Docstring + env-typing reflect Notion removal.                                                   |
| `workers/landing-enquiry/src/sync.js`               | edited       | Notion leg removed; email leg unchanged.                                                         |
| `workers/landing-enquiry/src/email.js`              | edited       | `sendNotifyEmail` no longer takes `notionPageId`.                                                |
| `workers/landing-enquiry/src/scheduled.js`          | edited       | Retry + digest SQL only consider `email_status`. Digest payload drops Notion fields.             |
| `workers/landing-enquiry/src/notion.js`             | deleted      | All Notion code lived here.                                                                      |
| `workers/landing-enquiry/README.md`                 | edited       | Reflects Notion retirement, secret removal, updated SQL examples.                                |
| `api/notify-landing-enquiry.js`                     | edited       | Digest renderer guards `Notion:` line on `r.notion_status`.                                      |
| `docs/onboarding-architecture-decisions.md`         | new          | This document.                                                                                   |
| `CLAUDE.md`                                         | edited       | "Outstanding items" entry for Notion retirement is marked done.                                  |

---

## How to use this document

- **In every future Cursor session:** read this file as input alongside the build plan. If a decision here conflicts with a session prompt, this file wins; raise it back to Nick before writing code.
- **If a decision genuinely needs to change:** update the relevant section, note the date, note why, and link the chat that drove the change. Don't re-derive in the build plan.
- **If a future session adds a new architectural decision:** add it here as a numbered item under "The N+1 locked decisions" with the same shape.
