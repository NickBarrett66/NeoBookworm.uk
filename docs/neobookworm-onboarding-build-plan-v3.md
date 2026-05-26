# NeoBookworm — Onboarding Build Plan v3 (operator-ready brownfield build)

How to take the [Onboarding Playbook](./neobookworm-onboarding-playbook.md) from document to working system — **built on top of the dashboard, D1, and Workers you already have**, and structured so each Cursor session can be opened, run, and closed with zero re-derivation.

**Saved at:** NeoBookworm.uk/docs (alongside the playbook)

-----

## What changed from v2

v2 was architecturally correct but assumed the operator would assemble each Cursor session by hand. v3 keeps every locked decision and adds the missing operator layer:

1. **A global prerequisites section** — every account, credential, and tool gathered up front, before Session 0.
2. **An environment-variable registry** — one table for every secret, which session adds it, and where it goes.
3. **A per-session "Cursor kickoff" block** — a copy-paste prompt + an explicit *inputs (read)* vs *outputs (create)* file split.
4. **Explicit exit gates** — you do not open session N+1 until session N's Definition of Done is green and committed.
5. **A "V3 scope decisions" section** — the playbook now carries its own inline ⚠ warnings at the five contradiction points, so this plan no longer needs to override them. This section retains only the three scope decisions that aren't in the playbook at all, plus the internal→display stage mapping Cursor needs to build the progress strip.
6. **Three descope/scope decisions made explicit** — portal photo upload, the `/google-business/` page, and Koalendar auto-send were silently floating in v2.
7. **One schema correction** — the `review_delivered` stage (used by J2 in the playbook) was missing from the v2 stage constraint. Added.

-----

## Contents

- [Before you start — global prerequisites](#prereqs)
- [Environment-variable registry](#env-registry)
- [V3 scope decisions & display mapping](#playbook-corrections)
- [Why this is a brownfield build](#why-brownfield)
- [How to use this plan](#how-to-use-this-plan)
- [Architecture at a glance](#architecture-at-a-glance)
- [Session map](#session-map)
- [Sequencing & exit gates](#sequencing)
- **Sessions**
  - [Session 0 — Reconcile, verify email identity, retire Notion](#session-0)
  - [Session 1 — The `clients` table + promotion logic](#session-1)
  - [Session 2 — Email template module](#session-2)
  - [Session 3 — Transactional send helper](#session-3)
  - [Session 4 — Portal Vercel function (skeleton)](#session-4)
  - [Session 5 — Dashboard "Clients" tab](#session-5)
  - [Session 6 — Acknowledgement automation + promote action](#session-6)
  - [Mini-QA: Phase A](#mini-qa-a)
  - [Session 7 — Portal remaining stages](#session-7)
  - [Session 8 — Portal action buttons](#session-8)
  - [Session 9 — Handover doc HTML variants](#session-9)
  - [Mini-QA: Phase B](#mini-qa-b)
  - [Session 10 — Stripe webhook](#session-10)
  - [Session 11 — Nudge cron](#session-11)
  - [Session 12 — OneTimeSecret (defer)](#session-12)
  - [Session 13 — Full end-to-end QA](#session-13)
  - [Session 14 — First-5-prospects playbook](#session-14)
- [Open questions / things to watch](#open-questions)
- [After Session 14: ongoing operation](#after)

-----

<a id="prereqs"></a>

# Before you start — global prerequisites

Gather all of this **once**, before Session 0. Every session assumes these are in place; nothing below should make you stop mid-build to go create an account.

## Accounts & access

- [x] **Cloudflare** — account login + an API token with D1 + Workers edit rights, and `wrangler` authenticated locally (`wrangler whoami` succeeds). Needed for D1 migrations (S1+) and redeploying the landing-enquiry Worker (S0, S6).
- [x] **Vercel** — project access + Vercel CLI authenticated (`vercel whoami`). You'll set env vars via the dashboard (Settings → Environment Variables) or `vercel env add`. Needed every session that ships an `api/` function.
- [x] **Google Workspace** — admin/owner of `nick@neobookworm.uk`, with **2-factor authentication switched on** (required before an app password can be generated). Needed S0.
- [x] **Stripe** — account in **test mode**, with the ability to create Payment Links and a webhook endpoint. Live keys come later. Needed S10.
- [x] **OneTimeSecret** — nothing to set up (free public API, no auth). Needed S12 only.

## Tools

- [x] **Node 18+** locally — the template and send-helper test scripts are `.mjs` files you run from a terminal.
- [x] **Git working tree clean** at the start of each session — so a single `git revert` undoes the session if needed. Commit or stash before you begin.
- [x] **mail-tester.com** — free, no account. Used in S0 to confirm SPF/DKIM/DMARC alignment.

## Test fixtures

- [x] **5 Gmail test aliases** you control — e.g. `youraddress+test1@gmail.com` … `+test5@gmail.com`. Gmail treats `+tag` as the same inbox, so one Gmail account gives you all five. Used from S3 onward and throughout QA.
- [x] **A real phone** for portal checks (the playbook's whole premise is mobile-first tradespeople).

## One-time credential tasks (do these in Session 0, listed here so they're not a surprise)

- Generate a Google **app password** for `nick@neobookworm.uk` (myaccount.google.com → Security → App passwords). Store it as `GW_SMTP_PASS` (see registry below).
- Confirm DNS once: MX → Google, SPF includes `_spf.google.com`, `google._domainkey` present, DMARC present. (Already verified in the v2 research; re-confirm with mail-tester after the first send.)

-----

<a id="env-registry"></a>

# Environment-variable registry

Every secret the build introduces, in one place. **"Where" = Vercel env var** unless stated. Set Vercel vars for *all* environments (Production + Preview) unless you have a reason not to.

| Var | Added in | Where to set | Example / notes | Nick |
| --- | --- | --- | --- | --- |
| `GW_SMTP_USER` | S0 | Vercel | Google Workspace sender for onboarding mail. | `nick@neobookworm.uk` |
| `GW_SMTP_PASS` | S0 | Vercel | Google app password (no spaces). | `jlsumlrakhmutkir` |
| `GW_SMTP_HOST` | S3 | Code constant (or Vercel) | Gmail SMTP host. | `smtp.gmail.com` |
| `GW_SMTP_PORT` | S3 | Code constant (or Vercel) | `587` (STARTTLS). | `587` |
| `ONBOARDING_INTAKE_SECRET` | S6 | Vercel **and** Worker secret (`wrangler secret put`) | Shared secret so only the landing-enquiry Worker can call `api/onboarding-intake`. | `1776` |
| `STRIPE_SECRET_KEY` | S10 | Vercel | `sk_test_…` first; swap to `sk_live_…` at go-live. | — |
| `STRIPE_WEBHOOK_SECRET` | S10 | Vercel | `whsec_…` from the Stripe webhook endpoint config. | — |
| `CRON_SECRET` | S11 | Vercel | Random string; the cron endpoint rejects requests without the matching header. | `1664` |
| `NUDGE_DRY_RUN` | S11 | Vercel | Set to `1` to compute + email a digest instead of sending. Run dry for ~2 weeks. | `1` |

**Do not touch (existing, confirmed working):** `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` (iCloud, contact form), `TO_EMAIL`, `R2_*`, `INTAKE_UPLOAD_SECRET`, `DASHBOARD_SECRET`. The onboarding transport (`GW_*`) is **separate** from the contact form's iCloud transport — see [memory: email send paths]. Never merge the two.

-----

<a id="playbook-corrections"></a>

# V3 scope decisions & display mapping

The playbook now carries inline ⚠ superseded warnings at the five implementation contradiction points (Worker structure, `email_log` schema, `review_delivered` stage, timestamps, `{ots_hosting}`), so you don't need to override them here. If a Cursor session flags something in the playbook as wrong, the playbook itself will say so; or refer it back to this plan's locked decisions.

This section covers only what isn't in the playbook at all.

## Scope decisions

These were floating in v2 with no home. Decisions:

- **Portal photo upload → descoped for v1 (manual).** The playbook's `researching`/`building` panel shows a "Send work photos" button opening an R2 upload form. **Do not build the R2 upload flow in v1.** Render the button as "Reply to any of my emails with your photos" (a `mailto:` / instruction). Revisit once volume justifies it. (Rationale: the portal is the only place the prospect can write to; an R2 presign + upload UI is real work for a job email already does fine.)
- **`/google-business/` portal page → built in S7.** It's a static walkthrough reused for every client, sourced from `guides/local-search-guide.html`. Added to Session 7 deliverables so Post-5's link resolves.
- **Koalendar auto-send (J5 booking) → out of scope for v1.** Koalendar sends its own confirmation; the playbook's "send this from the Worker after booking" is **not built**. J5 bookings are handled by manual promotion from the dashboard like all other J5 entries.

## Internal stages → portal display strip (suggested mapping)

The schema has 13 internal stages; the playbook's progress strip shows 6. Use this mapping in S4 (`displayStage(stage)` helper). Tune labels to taste — the implementer owns it, but ship *a* mapping rather than inventing one ad hoc:

| Display strip | Internal stage(s)                                         |
|---            |---                                                        |
| Acknowledged  | `acknowledged`                                            |
| Researching   | `researching`                                             |
| Building      | `building`, `reviewing`, `revisions`                      |
| Preview ready | `preview_ready`, `review_delivered`                       |
| Your decision | `awaiting_payment`, `preparing_live`                      |
| Live          | `live`, `care_active`, `self_managed`                     |
| *(off-strip)* | `dropped_out` → renders its own panel, no strip highlight |

-----

<a id="why-brownfield"></a>

# Why this is a brownfield build

Most of "Phase A" already exists and is live. This plan builds the **missing ~30%** instead of rebuilding the 70% that already works.

### What already exists (reuse, don't rebuild)

| The naive plan says "build" | Reality on the ground |
|---|---|
| Create 2 D1 databases                           | `neobookworm-prospects` (~5.5 MB, real data) and `neobookworm-enquiries` already exist. |
| Set up MailChannels / SPF/DKIM for Worker email | **Not needed.** Email works via SMTP through Vercel. The entire MailChannels strand is deleted. |
| Build an intake Worker                          | `neobookworm-landing-enquiry` is deployed, writing `landing_enquiries`, with retry cron + daily digest. |
| Wire the landing pages                          | `plumbers.html`, `plumbers-switch.html`, `electricians*.html` already POST to that Worker. |
| Build a new `/admin/` view                      | `dashboard.html` (~3,900 lines) **is** the admin view — Prospects / Enquiries / Campaigns tabs, gated by `DASHBOARD_SECRET`, served by `api/dashboard.js`. |

### Decisions locked (do not relitigate without reason)

1. **Onboarding state lives in a new `clients` table** in `neobookworm-enquiries`, keyed by `slug`, with `source_type` + `source_id`. Four sources: `landing_enquiry`, `intake`, `contact`, `prospect`. The existing `prospects` table keeps its meaning (cold outreach targets) untouched.
2. **The public client portal `/c/{slug}/` is a Vercel function** (`api/portal.js`), reusing the `queryD1` helper from `api/dashboard.js`. No second runtime.
3. **Onboarding emails send via Google Workspace SMTP** (`smtp.gmail.com`:587) as `nick@neobookworm.uk`. A **separate transport** from the contact form's iCloud SMTP, which is left untouched.
4. **Operator surface = a new "Clients" tab in `dashboard.html`.** "Enquiries" stays the raw inbound inbox; an enquiry (or cold prospect) is *promoted* into a client.
5. **Onboarding emails are a separate auto-send transactional path.** The cold-campaign `outbox` queue + approval gates are not touched.
6. **Notion is retired as a source of truth.** D1 is canonical. `notion_id` survives only as an opaque ID on `prospects`.
7. **Timestamps stay TEXT `datetime('now')`** to match every existing table.

### The two-surface model

The dashboard is **operator-only** (behind `DASHBOARD_SECRET`); a tradesperson can never log in. So:

- **Client-facing portal** — public, the slug is the only key, rendered by `api/portal.js`. What the prospect sees.
- **Operator management** — the dashboard "Clients" tab. To avoid two renderers drifting, the dashboard **links to / iframes the real portal URL** rather than re-implementing the client view.

-----

<a id="how-to-use-this-plan"></a>

## How to use this plan

Each session has the same shape: goal, critical-path flag, time estimate, dependencies, manual prerequisites, pre-flight checklist, a **Cursor kickoff block**, deliverables, definition of done, recovery/rollback.

### The session ritual

1. Confirm the session's **Manual prerequisites** are done (credentials, env vars, accounts). These are pulled out separately from the dependency on prior sessions.
2. Make sure your git tree is clean.
3. Open Cursor → **Composer in Agent mode** → set the model named in the session header.
4. **@-mention the Inputs (read) files.** Do not @-mention the Outputs (create) files — they don't exist yet.
5. Paste the **Cursor kickoff** block. It instructs Cursor to confirm the decisions back to you *before* writing code.
6. Confirm the decisions, then let it build.
7. Walk the **Definition of Done** checklist. Don't move on until every box is green and committed (see [exit gates](#sequencing)).

### Inputs vs outputs

Every session lists **Inputs (read)** — existing files Cursor needs as context — and **Outputs (create/edit)** — what it will write. This removes the v2 ambiguity where the "share" list mixed files that exist with files that don't.

### Model guidance

| Phase of work | Model |
|---|---|
| Architecture / schema / nudge logic | **Opus** when expensive to be wrong |
| Routine implementation | Sonnet |
| Quick spot-checks | Haiku |

-----

<a id="architecture-at-a-glance"></a>

## Architecture at a glance

```
                      ┌─────────────────────────────────────────────┐
   LANDING PAGES ───► │ neobookworm-landing-enquiry Worker (exists)  │
   (plumbers.html …)  │  writes landing_enquiries  (Notion: REMOVED) │
                      │  + POSTs new enquiry → api/onboarding-intake │
                      └───────────────┬─────────────────────────────┘
                                      ▼
   INTAKE FORM ──────────────► neobookworm-enquiries (D1)
   (intake-form.html)          ├─ landing_enquiries   (raw inbound)
                               ├─ intake_submissions  (raw inbound)
   CONTACT FORM ─────────────► ├─ contact_enquiries   (raw inbound)
   (contact.html)              ├─ clients   ◄── NEW: onboarding state, keyed by slug
                               ├─ email_log ◄── NEW
                               ├─ feedback  ◄── NEW
                               └─ stripe_events ◄── NEW (S10)

   COLD PROSPECTS ───────────► neobookworm-prospects (D1)
   (prospects / campaigns /    └─ prospects (status='Emailed' → reply → promote to clients)
    outbox — unchanged)

   VERCEL FUNCTIONS (api/)
   ├─ dashboard.js   (exists) ── + new client_* actions, DASHBOARD_SECRET
   ├─ portal.js      (NEW)    ── public /c/{slug}/  read + decision/feedback POSTs
   ├─ onboarding-intake.js (NEW) ── Worker→Vercel promote+acknowledge (ONBOARDING_INTAKE_SECRET)
   ├─ stripe-webhook.js (NEW) ── payment → stage + Convergence-5
   ├─ cron-nudge.js  (NEW)    ── Vercel Cron, nudge schedule (CRON_SECRET)
   └─ _lib/
        ├─ d1.js        (extract queryD1 from dashboard.js)
        ├─ slug.js      (slugify + generateSlug)
        ├─ promote.js   (promoteToClient)
        ├─ email.js     (Google Workspace SMTP, From nick@neobookworm.uk)
        ├─ templates.js (all onboarding email templates + render)
        └─ working-days.js (S11)

   DASHBOARD (dashboard.html, DASHBOARD_SECRET)
   └─ Tabs: Prospects | Enquiries | Campaigns | Clients ◄── NEW
```

-----

<a id="session-map"></a>

## Session map

| # | Session | Critical path? | Realistic time | Model |
|--|--|--|--|--|
| 0 | Reconcile, verify email identity, retire Notion | Yes | 2–3 h | **Opus** |
| 1 | `clients` table + promotion logic | Yes | 2–3 h | **Opus** |
| 2 | Email template module | Yes | 1.5–2 h | Sonnet |
| 3 | Transactional send helper | Yes | 1.5 h | Sonnet |
| 4 | Portal Vercel function (skeleton) | Yes | 2–3 h | Sonnet |
| 5 | Dashboard "Clients" tab | Yes | 3–4 h | Sonnet |
| 6 | Acknowledgement automation + promote action | Yes | 2–3 h | Sonnet |
| A1 | Mini-QA: Phase A | Yes | 1 h | Sonnet |
| 7 | Portal remaining stages (+ google-business page) | Yes | 2–3 h | Sonnet |
| 8 | Portal action buttons | Yes | 2–3 h | Sonnet |
| 9 | Handover doc HTML variants | Yes | 2 h | Sonnet |
| B1 | Mini-QA: Phase B | Yes | 1 h | Sonnet |
| 10 | Stripe webhook | Yes | 3 h | Sonnet |
| 11 | Nudge cron | Yes | 3–4 h | **Opus** |
| 12 | OneTimeSecret | Defer | 1.5 h | Sonnet |
| 13 | Full end-to-end QA | Yes | 3–4 h | Sonnet |
| 14 | First-5-prospects playbook | Yes | 1 h | Sonnet |

**Total realistic time:** ~28–34 hours of focused work.

-----

<a id="sequencing"></a>

## Sequencing & exit gates

**Phase A — Foundation + minimum viable onboarding (S0–S6).** End state: an inbound enquiry (or promoted cold prospect) becomes a `clients` row with a slug, gets an acknowledgement email From `nick@neobookworm.uk`, has a public portal URL that resolves, and shows up in the dashboard "Clients" tab where you can drive its stage by hand. Notion is gone.

**Mini-QA: Phase A** before building further.

**Phase B — Full portal experience (S7–S9).** Remaining stages, action buttons, handover docs, google-business page.

**Mini-QA: Phase B.**

**Phase C — Automation polish (S10–S14).** Stripe, nudges, OneTimeSecret, full QA, first-5 playbook.

**Strong recommendation:** run real prospects through Phase A+B manually for 2–3 weeks before starting Phase C.

### Exit gate (the one rule that keeps this clean)

> **Do not open session N+1 until every Definition-of-Done box in session N is ticked and the work is committed to git.** A half-finished session is the only thing that turns this from a 30-hour build into a 60-hour one. If you must stop mid-session, commit a WIP and note which DoD boxes remain.

### What can overlap

The "Depends on" line is the real DAG. In practice: S2 and S4 both depend only on S1, so they can be done in either order (or batched in one sitting). Everything else is effectively linear. Don't parallelise S5/S6 with the portal sessions — they touch the same files.

-----

<a id="session-0"></a>

# Session 0 — Reconcile, verify email identity, retire Notion

**Goal:** Lock the foundations the rest of the build assumes: confirm the email identity works, make D1 the single source of truth by decommissioning Notion, and extract the shared helpers the new functions will import.

**Critical path?** Yes. **Time:** 2–3 h. **Depends on:** Nothing. **Model:** Opus.

### Manual prerequisites (do before opening Cursor)

- [x] 2FA on for `nick@neobookworm.uk`; generate a Google **app password**.
- [x] Set `GW_SMTP_USER` + `GW_SMTP_PASS` in Vercel (see [registry](#env-registry)).
- [x] `wrangler whoami` and `vercel whoami` both succeed.
- [x] mail-tester.com open in a tab.

### Decisions to confirm

1. **Email identity.** Onboarding sends as `nick@neobookworm.uk` via Google Workspace SMTP. SPF/DKIM/DMARC already align for Google. The contact form's iCloud transport is **not** reused. Build step: send one real test, confirm SPF/DKIM/DMARC all pass via mail-tester (score ≥ 8/10).
2. **Notion retirement scope.** Drop all Notion writes: the landing-enquiry Worker stops calling Notion; any Notion-sync cron is disabled; `landing_enquiries.notion_*` and `intake_submissions.notion_page_id` become vestigial (stop writing them; don't drop columns yet). `prospects.notion_id` stays as opaque PK.
3. **Shared helper extraction.** Extract `queryD1` (plus account/db-id constants) from `api/dashboard.js` to `api/_lib/d1.js` so the new functions import one battle-tested copy.

### Inputs (read)

`CLAUDE.md`, `WEBSITE-REFERENCE.md`, `api/dashboard.js`, `api/contact.js`, `workers/landing-enquiry/` (source + README), this plan, the playbook Conventions section.

### Outputs (create/edit)

`docs/onboarding-architecture-decisions.md` (new), `api/_lib/d1.js` (new), `api/dashboard.js` (edit: import from `_lib/d1.js`), `workers/landing-enquiry/` (edit: remove Notion calls), CLAUDE.md (edit: mark Notion retired).

### Cursor kickoff (paste this)

> Implement **Session 0** of `docs/neobookworm-onboarding-build-plan-v3.md`. First read the "Playbook corrections" section of that plan and confirm the three decisions in this session's checklist back to me before writing any code. Then: (1) extract `queryD1` + the account/db-id constants from `api/dashboard.js` into a new `api/_lib/d1.js` exporting `queryD1`, `prospectsDb()`, `enquiriesDb()`, `accountId()`, and update `api/dashboard.js` to import them with **no behaviour change**; (2) remove all Notion calls from the landing-enquiry Worker in a single isolated commit; (3) write `docs/onboarding-architecture-decisions.md` capturing the 7 locked decisions + the email-identity test result. Do **not** touch the contact form's iCloud transport, the `outbox`, or `neobookworm-prospects`.

### Definition of done

- [ ] A test email through the Vercel Google-Workspace SMTP path arrives From `nick@neobookworm.uk`, aligned SPF/DKIM, mail-tester ≥ 8/10.
- [x] `api/dashboard.js` works exactly as before after importing from `_lib/d1.js` (all three tabs load).
- [ ] A new landing-page submission creates a `landing_enquiries` row with **no** Notion call (check Worker logs).
- [ ] No scheduled job still writes to Notion.
- [x] `docs/onboarding-architecture-decisions.md` exists.

### Recovery / rollback

- **If `nick@` can't send-as:** fall back to `neobookworm@icloud.com` for v1 and flag it; revisit. (Voice is weaker but the system works.)
- **If removing Notion breaks the Worker:** Notion calls are an isolated block; the removal is one commit, so revert is one step.
- **Notion-referencing skills** (`campaign-setup`, `prospect-runner`, `site-brief`) read `notion_id` as an ID only — still fine. Separate cleanup pass, out of scope.

-----

<a id="session-1"></a>

# Session 1 — The `clients` table + promotion logic

**Goal:** Create the single onboarding record and the logic that promotes an enquiry (or cold prospect) into it.

**Critical path?** Yes. Everything reads/writes this table. **Time:** 2–3 h. **Depends on:** S0. **Model:** Opus.

### Manual prerequisites

- [x] `wrangler` authenticated; confirm `neobookworm-enquiries` has a `d1_migrations` table (it does — use the wrangler migrations workflow).

### Decisions to confirm

1. **Slug format:** `{business-slugified}-{5-char-random}`; fall back to `{name-slugified}-{5-char-random}`; final fallback `client-{8-char-random}`. Lowercase ASCII, collision-checked against `clients.slug`.
2. **Journey is derived, not re-captured.** `landing_enquiries.start_option` (`leave_it_with_me`/`tell_more` → J1, `review_site_first` → J2, `ready_to_switch` → J3); `intake_submissions` → J4; `contact_enquiries` → J5; promoted `prospects` → operator picks at promotion time.
3. **13 stages in a CHECK constraint** (v3: adds `review_delivered` for J2): `acknowledged, researching, building, reviewing, review_delivered, preview_ready, revisions, awaiting_payment, preparing_live, live, care_active, self_managed, dropped_out`.
4. **Migrations via existing tooling** (`d1_migrations` in `neobookworm-enquiries`). Not touching `neobookworm-prospects`.
5. **Timestamps as TEXT `datetime('now')`.**

### Inputs (read)

Playbook (Conventions, Five Journeys, the portal stage list), `api/_lib/d1.js`, the live schemas of `landing_enquiries`, `intake_submissions`, `contact_enquiries`, `prospects`.

### Outputs (create/edit)

Migration SQL + rollback for `neobookworm-enquiries`; `api/_lib/slug.js`; `api/_lib/promote.js`.

### `clients` table (in `neobookworm-enquiries`)

```sql
CREATE TABLE clients (
  slug              TEXT PRIMARY KEY,
  source_type       TEXT NOT NULL CHECK (source_type IN
                      ('landing_enquiry','intake','contact','prospect')),
  source_id         TEXT NOT NULL,           -- id of the originating row (or notion_id for prospect)

  business_name     TEXT,
  contact_name      TEXT,
  email             TEXT NOT NULL,

  journey           TEXT CHECK (journey IN ('J1','J2','J3','J4','J5')),
  stage             TEXT NOT NULL DEFAULT 'acknowledged' CHECK (stage IN (
                      'acknowledged','researching','building','reviewing','review_delivered',
                      'preview_ready','revisions','awaiting_payment','preparing_live',
                      'live','care_active','self_managed','dropped_out')),
  stage_changed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  next_action_by    TEXT,                    -- promised deliver-by, ISO

  current_url       TEXT,                    -- switch journeys
  preview_url       TEXT,
  live_url          TEXT,

  domain            TEXT,
  domain_status     TEXT CHECK (domain_status IN ('confirmed','suggested','unresolved')),

  plan              TEXT CHECK (plan IN ('care','self_managed')),  -- NULL = undecided
  payment_status    TEXT NOT NULL DEFAULT 'none',
  stripe_customer_id TEXT,
  last_payment_at   TEXT,

  revision_count    INTEGER NOT NULL DEFAULT 0,
  review_content    TEXT,                    -- J2 review, Markdown
  hosting_provider  TEXT,
  hosting_url       TEXT,
  client_email      TEXT,                    -- the address used to set up their accounts

  last_nudge_sent_at TEXT,
  opt_out           INTEGER NOT NULL DEFAULT 0,
  notes             TEXT
);

CREATE UNIQUE INDEX idx_clients_source ON clients(source_type, source_id);
CREATE INDEX idx_clients_stage ON clients(stage, stage_changed_at);
CREATE INDEX idx_clients_email ON clients(email);
```

Plus:

- **`email_log`** (this is the canonical schema — the playbook's is superseded): `id INTEGER PK AUTOINCREMENT, slug TEXT NOT NULL, template TEXT NOT NULL, sent_at TEXT NOT NULL, subject TEXT NOT NULL, recipient TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'sent', error TEXT`. Indexes: `(slug, sent_at DESC)` for portal history, `(slug, template)` for nudge dedup.
- **`feedback`**: `id INTEGER PK AUTOINCREMENT, slug TEXT NOT NULL, categories TEXT, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))`.
- **`api/_lib/slug.js`** — `slugify()` + `generateSlug(business, name, queryD1)` with collision retry.
- **`api/_lib/promote.js`** — `promoteToClient({ source_type, source_id, journey })`: reads the source row, builds a `clients` row, generates a slug, returns it. **Idempotent:** if a client already exists for that `(source_type, source_id)`, returns the existing slug.
- Rollback SQL for each migration.

### Cursor kickoff (paste this)

> Implement **Session 1** of `docs/neobookworm-onboarding-build-plan-v3.md`. Confirm the five decisions back to me first. Note the **13-stage** CHECK constraint (v3 adds `review_delivered`) and that `email_log` uses `slug` + TEXT `sent_at` — the playbook's `email_log` schema is dead, ignore it. Create the migration (with rollback) for `clients`, `email_log`, `feedback` in `neobookworm-enquiries` via the `d1_migrations` workflow, plus `api/_lib/slug.js` and `api/_lib/promote.js` (idempotent). Do not modify `neobookworm-prospects`.

### Definition of done

- [x] `wrangler d1 migrations apply neobookworm-enquiries` applies cleanly; `clients`, `email_log`, `feedback` exist with the constraints above.
- [ ] `generateSlug('Hart Plumbing','Tom', q)` → e.g. `hart-plumbing-3f9k2`; empty business → name fallback; both empty → `client-…`.
- [ ] `promoteToClient` creates exactly one row from a real `landing_enquiries` id, no-op on a second call.
- [ ] A `<script>` business name stores raw/safe (escaping is the portal's job — confirm storage doesn't execute anything).

### Recovery / rollback

- **Schema change after applying:** new migration, never edit an applied one.
- **Wrong promotion:** `DELETE FROM clients WHERE slug=?` (no downstream rows yet).

-----

<a id="session-2"></a>

# Session 2 — Email template module

**Goal:** One place that renders every onboarding email, enforcing the subject-threading convention.

**Critical path?** Yes. **Time:** 1.5–2 h. **Depends on:** S1. **Model:** Sonnet.

### Manual prerequisites

- None (pure code + data).

### Decisions to confirm

1. **Storage:** JS constants in `api/_lib/templates.js`. (Optional D1 `template_overrides` lookup later; start constants-only.)
2. **Interpolation:** single braces `{name}`, strict allowlist — unknown variable → throw; missing required variable → throw.
3. **Subject threading:** every template returns `{business} — your NeoBookworm website`, except the two exceptions (`{business} — invoice`, `{business} — credentials to keep safe`). The module owns the subject per template ID.
4. **Plain text only.** No HTML email.
5. **`{ots_hosting}` not `{ots_netlify}`** — the playbook's Conventions list already uses `{ots_hosting}`; the old name is retired.

### Inputs (read)

Playbook Conventions (placeholders, sign-off), playbook J1-E1 (implement first), the full template inventory in the playbook, `api/_lib/d1.js`.

### Outputs (create/edit)

`api/_lib/templates.js`, `api/_lib/templates.test.mjs`, `docs/onboarding-email-templates.md`.

### Cursor kickoff (paste this)

> Implement **Session 2** of `docs/neobookworm-onboarding-build-plan-v3.md`. Confirm the five decisions first. Build `api/_lib/templates.js` exporting `TEMPLATES`, `SUBJECTS`, `ALLOWED_VARS`, and `renderTemplate(id, vars) → { subject, body }`. Implement **J1-E1 verbatim** from the playbook; stub the other IDs (added in later sessions). Strict allowlist: unknown id, unknown var, or missing required var all throw. Use `{ots_hosting}` not `{ots_netlify}`. Add a runnable `api/_lib/templates.test.mjs` and `docs/onboarding-email-templates.md`.

### Definition of done

- [ ] `renderTemplate('J1-E1', { name:'Tom', business:'Hart Plumbing', deliver_by:'Tuesday 4 June', portal_url:'…' })` returns the correct subject + body.
- [ ] Unknown template ID throws; unknown var throws; missing required var throws.
- [ ] `node api/_lib/templates.test.mjs` runs clean.

### Recovery / rollback

- Templates are pure data; re-implementing the renderer carries content over untouched.

-----

<a id="session-3"></a>

# Session 3 — Transactional send helper

**Goal:** A single function the dashboard, portal, webhook, and cron all call to send a templated onboarding email and log it.

**Critical path?** Yes. **Time:** 1.5 h. **Depends on:** S0 (email identity), S1 (`email_log`), S2 (templates). **Model:** Sonnet.

### Manual prerequisites

- [x] `GW_SMTP_USER` / `GW_SMTP_PASS` set in Vercel (from S0).
- [ ] A `+test` Gmail alias ready to receive.

### Decisions to confirm

1. **New Google Workspace transport** — do NOT reuse `api/contact.js`'s iCloud config. `smtp.gmail.com`:587, user `nick@neobookworm.uk`, pass = `GW_SMTP_PASS`. From = `nick@neobookworm.uk`, Reply-To = `nick@neobookworm.uk`, From-name = "Nick at NeoBookworm".
2. **Failure philosophy:** a failed send writes `email_log` with `status='failed'` + error and **does not throw** to the caller (the client already has a portal URL; resend by hand). Exception: the dashboard's manual "send" surfaces failure directly.
3. **No threading header hacks** — Gmail threads on identical subject + participants, guaranteed by the template module.

### Inputs (read)

`api/contact.js` (the working Nodemailer SMTP pattern), `api/_lib/templates.js`, `api/_lib/d1.js`.

### Outputs (create/edit)

`api/_lib/email.js`; a thin debug endpoint or `.mjs` script for one real send.

### Cursor kickoff (paste this)

> Implement **Session 3** of `docs/neobookworm-onboarding-build-plan-v3.md`. Confirm the three decisions first. Build `api/_lib/email.js` exporting `sendTemplated({ slug, templateId, vars, to })`: render via `templates.js`, send via a **new** Google Workspace Nodemailer transport (`smtp.gmail.com`:587, `GW_SMTP_USER`/`GW_SMTP_PASS`, From `nick@neobookworm.uk`, From-name "Nick at NeoBookworm"), then write an `email_log` row. Returns `{ ok, error? }`; a failed send logs `status='failed'` and does **not** throw. Reuse the contact-form Nodemailer pattern but a separate transport — do not touch the iCloud config. Add a small script to fire one real J1-E1 send to a `+test` alias.

### Definition of done

- [ ] One real J1-E1 send lands in the test inbox From `nick@neobookworm.uk`, plain text, correct sign-off.
- [ ] An `email_log` row is written with `status='sent'`.
- [ ] Forcing an SMTP error writes `status='failed'` and does not crash the caller.

### Recovery / rollback

- **Deliverability:** diagnose with mail-tester before suspecting code; SPF/DKIM alignment was set in S0.

-----

<a id="session-4"></a>

# Session 4 — Portal Vercel function (skeleton)

**Goal:** Public `/c/{slug}/` renders a branded, read-only portal for the three early stages (`acknowledged`, `researching`, `building`). No buttons yet.

**Why before automation:** the acknowledgement email (S6) contains the portal URL. It must resolve before any email is sent.

**Critical path?** Yes. **Time:** 2–3 h. **Depends on:** S1. **Model:** Sonnet.

### Manual prerequisites

- None beyond S1 (insert 2–3 test `clients` rows by hand for verification).

### Decisions to confirm

1. **Routing:** add a rewrite in `vercel.json` mapping `/c/:slug` → `/api/portal?slug=:slug`, and `/c/:slug/review`, `/c/:slug/handover`, `/c/:slug/google-business` to the same function with a `section` param.
2. **Rendering:** tagged template literals + an escape helper. No framework. Self-hosted fonts (per CLAUDE.md — never Google Fonts CDN), reuse `/fonts/`.
3. **Unknown slug → branded 404**, not Vercel's default.
4. **Read-only this session.** Buttons are S8.
5. **Display-stage helper:** implement `displayStage(stage)` using the [mapping table](#playbook-corrections) — needed now so the progress strip is correct from the start.

### Inputs (read)

Playbook "The portal" + stage copy for `acknowledged`/`researching`/`reviewing`/`building`, CLAUDE.md design system, `index.html` (for the look + the self-hosted font pattern), `api/_lib/d1.js`, `vercel.json`.

### Outputs (create/edit)

`api/portal.js` (new), `vercel.json` (edit: rewrites). Plus a couple of test `clients` rows.

### Cursor kickoff (paste this)

> Implement **Session 4** of `docs/neobookworm-onboarding-build-plan-v3.md`. This is a **Vercel function**, not a Cloudflare Worker — the playbook's "portal-worker" section is marked superseded. Confirm the five decisions first. Build `api/portal.js`: GET handler, look up the client by slug via `_lib/d1.js`, render a branded page (tagged template literals + an escape helper, self-hosted fonts per CLAUDE.md) for stages `acknowledged`/`researching`/`building`; other stages → a friendly "we're working on this part" placeholder; unknown slug → branded 404. Include a header ("Hi {name} from {business}"), a 6-step progress strip driven by `displayStage(stage)` (use the mapping table in the plan), the active stage panel with computed deliver-by, a useful-links block, and a conversation-history block reading `email_log` in human time. Add the `vercel.json` rewrites for `/c/:slug` and the `/review`, `/handover`, `/google-business` sections.

### Definition of done

- [ ] `https://neobookworm.uk/c/{test-slug}/` renders for `acknowledged`, `researching`, `building`.
- [ ] Unknown slug → branded 404.
- [ ] Clean on a real phone at 375 px.
- [ ] Conversation history shows `email_log` entries in human time ("3 hours ago").
- [ ] A `<script>` in the business name renders inert (escaping works).
- [ ] Progress strip highlights the correct display stage via `displayStage`.

### Recovery / rollback

- Vercel deploys are atomic + instantly revertable; the rewrite only affects `/c/*`.

-----

<a id="session-5"></a>

# Session 5 — Dashboard "Clients" tab

**Goal:** The operator surface — a 4th tab in `dashboard.html` listing every onboarding client with stage, days-in-stage, portal link, and a detail view.

**Critical path?** Yes. **Time:** 3–4 h. **Depends on:** S1, S4. **Model:** Sonnet.

### Manual prerequisites

- None beyond prior sessions.

### Decisions to confirm

1. **Backend actions in `api/dashboard.js`** (consistent with the existing pattern + auth): GET `client_list`, `client_detail`; POST `client_promote`, `client_set_stage`, `client_send` (fires a template via `_lib/email.js`), `client_set_fields` (preview_url, domain, plan, etc.).
2. **Frontend:** add `<button class="tab-btn" data-tab="clients">Clients</button>` to `.tab-nav`; extend `goToTabRoot` + the render switch; reuse the table/filter/sort machinery.
3. **Columns:** business+contact | journey | stage | days-in-stage | last email | next action by | portal link | actions. Highlight rows stuck > 14 days.
4. **Detail view:** the client's fields, an **iframe/link to the live portal** (single renderer — no re-implementation), the `email_log` timeline, action buttons (advance stage, send next template, mark preview-ready, set preview URL / domain / plan).
5. **"Send personal note"** = open a Gmail compose URL pre-filled with the client email + the threading subject. No automation.

### Inputs (read)

`dashboard.html` (the tab pattern: `.tab-btn[data-tab]`, `state.tab`, `goToTabRoot(tab)`, render-into-`#main-content`), `api/dashboard.js` (action dispatch + `queryD1` + `DASHBOARD_SECRET`), `api/_lib/email.js`, the playbook stage list.

### Outputs (create/edit)

`api/dashboard.js` (edit: new `client_*` actions), `dashboard.html` (edit: Clients tab list + detail).

### Cursor kickoff (paste this)

> Implement **Session 5** of `docs/neobookworm-onboarding-build-plan-v3.md`. Confirm the five decisions first. Add `client_*` actions to `api/dashboard.js` following the existing action-dispatch + `DASHBOARD_SECRET` pattern, and a "Clients" tab to `dashboard.html` reusing the existing table/filter/sort components and the `.tab-btn[data-tab]` / `goToTabRoot` pattern. The detail view must **iframe/link the real `/c/{slug}/` portal** — do not re-implement the client view. Send actions go through `_lib/email.js`. The existing three tabs must be untouched.

### Definition of done

- [ ] Clients tab lists all non-dropped clients with all columns; filter + sort work.
- [ ] Detail view renders fields + live-portal iframe + email timeline.
- [ ] "Advance stage" updates D1 and the portal reflects it.
- [ ] "Send next template" sends via `_lib/email.js` and logs to `email_log`.
- [ ] Stuck-row highlight works.
- [ ] Mobile-usable.

### Recovery / rollback

- All new actions are additive; the existing three tabs are untouched. Git revert restores instantly via Vercel.

-----

<a id="session-6"></a>

# Session 6 — Acknowledgement automation + promote action

**Goal:** Close the loop from "inbound enquiry exists" to "client promoted, acknowledged, portal live." Covers both automatic (new enquiry) and manual (cold-prospect reply) promotion.

**Critical path?** Yes. **Time:** 2–3 h. **Depends on:** S2, S3, S4, S5. **Model:** Sonnet.

### Manual prerequisites

- [ ] Generate `ONBOARDING_INTAKE_SECRET`; set it in **both** Vercel and the Worker (`wrangler secret put ONBOARDING_INTAKE_SECRET`).
- [ ] Have a way to test the Worker→Vercel call **before** redeploying the live Worker — e.g. call `api/onboarding-intake` directly with a curl/test payload first, since this session modifies a **production** Worker.

### Decisions to confirm

1. **Auto-promote on inbound:** yes for J1/J2/J3/J4 (journey unambiguous from the form) → acknowledgement fires within seconds. J5 (contact) and cold-prospect replies are **manual promote** from the dashboard (you choose the journey).
2. **Where auto-promotion runs:** the Worker POSTs the new enquiry to `api/onboarding-intake` (authenticated by `ONBOARDING_INTAKE_SECRET`), which promotes + acknowledges. (Reuses the "Worker calls Vercel for email" pattern CLAUDE.md mandates.)
3. **Add the 5 acknowledgement templates** (J1-E1, J2-E1, J3-E1, J4-E1, J5-E1) to `templates.js`.
4. **Idempotency:** promotion is already idempotent (S1). The acknowledgement only fires on first promotion (check `email_log` for a prior acknowledgement of that slug).

### Inputs (read)

`workers/landing-enquiry/` source, `api/dashboard.js`, `api/_lib/promote.js`, `api/_lib/email.js`, `api/_lib/templates.js`, the 5 acknowledgement templates in the playbook.

### Outputs (create/edit)

`api/onboarding-intake.js` (new), `workers/landing-enquiry/` (edit: POST to it after writing `landing_enquiries`), `api/dashboard.js` (edit: `client_promote` sends the acknowledgement for manual promotions, journey chosen in UI), `api/_lib/templates.js` (edit: 5 acknowledgement templates).

### Cursor kickoff (paste this)

> Implement **Session 6** of `docs/neobookworm-onboarding-build-plan-v3.md`. Confirm the four decisions first. Build `api/onboarding-intake.js` (Vercel function, gated by `ONBOARDING_INTAKE_SECRET`) that calls `promoteToClient` + `sendTemplated(acknowledgement)`; auto-promote J1–J4 only. Update the landing-enquiry Worker to POST the new enquiry to it **after** writing `landing_enquiries`, in an isolated commit. Extend the dashboard `client_promote` action to send the acknowledgement on manual promotion with the journey chosen in the UI (J5 + cold prospects). Add the 5 acknowledgement templates to `templates.js`. Acknowledgement fires only on first promotion (dedup via `email_log`). The enquiry must still land in D1 even if the Vercel call fails.

### Definition of done

- [ ] A real form submission on each of J1–J4 auto-creates a client, sends the right acknowledgement From `nick@`, and the portal URL resolves.
- [ ] Manually promoting a `contact_enquiries` row and a cold `prospects` row creates a client, lets you pick the journey, sends the acknowledgement.
- [ ] Subject line is the identical threading pattern across journeys for the same business.
- [ ] Second submission within an hour doesn't double-send.

### Recovery / rollback

- **Worker → Vercel call fails:** the enquiry still lands in D1; promote it by hand from the dashboard. The prospect is never blocked.

-----

<a id="mini-qa-a"></a>

# Mini-QA: Phase A

**Goal:** Prove S0–S6 work together before building on them. **Time:** 1 h.

For each of the 5 entry points, on a real phone: submit the form → watch the success state → open the acknowledgement in real Gmail (threaded? plain text? signed correctly? From `nick@`?) → click the portal link → view portal on phone + desktop → check conversation-history → confirm the client appears in the dashboard Clients tab. Plus: manually promote one cold prospect and confirm the same.

**Definition of done:** all entry points pass; every defect logged; all severity-1 defects fixed and re-verified.

-----

<a id="session-7"></a>

# Session 7 — Portal remaining stages (+ google-business page)

**Goal:** Render the remaining stages: `reviewing`, `review_delivered`, `preview_ready`, `revisions`, `awaiting_payment`, `preparing_live`, `live`, `care_active`, `self_managed`, `dropped_out`, plus the `/review/` page and the static `/google-business/` page.

**Critical path?** Yes. **Time:** 2–3 h. **Depends on:** S4. **Model:** Sonnet.

### Manual prerequisites

- None (insert test `clients` rows in each stage for verification).

### Decisions to confirm

1. **Review page** reads `clients.review_content` (Markdown) → HTML at `/c/{slug}/review/`. The `review_delivered` stage panel surfaces the link + the J2 branch options (rendered inert until S8).
2. **`/google-business/` page** is a static walkthrough sourced from `guides/local-search-guide.html`, served at `/c/{slug}/google-business/` (so Post-5's link resolves). Same for every client.
3. **Handover page** is S9; for now the route exists with a "coming soon" panel.
4. **Photo upload is descoped (v3):** the `researching`/`building` panel's "Send work photos" becomes "Reply to any of my emails with your photos" — **no R2 upload form.**
5. **Useful links per stage** = a `linksForStage(stage, journey)` helper.
6. **`dropped_out` lifecycle:** if > 30 days since `stage_changed_at`, render the "unpublished" panel.
7. **preview_ready buttons render but are inert** (wired in S8).

### Inputs (read)

Playbook "The portal — stage-by-stage copy" (full), `guides/local-search-guide.html`, `api/portal.js`.

### Outputs (create/edit)

`api/portal.js` (edit: all remaining stage panels + `/review/` + `/google-business/` + `linksForStage` + `daysSince`).

### Cursor kickoff (paste this)

> Implement **Session 7** of `docs/neobookworm-onboarding-build-plan-v3.md`. Confirm the seven decisions first. Extend `api/portal.js` with panels for every remaining stage (including `review_delivered`), the `/review/` page (Markdown `review_content` → HTML), and a static `/google-business/` walkthrough sourced from `guides/local-search-guide.html`. Add `linksForStage(stage, journey)` and a `daysSince` helper. **Descope the photo upload** — render "Send work photos" as a reply-by-email instruction, no R2 form. `dropped_out` > 30 days → unpublished panel. preview_ready buttons render but stay inert (wired in S8). Wrap the stage switch in try/catch → fall back to a generic "working on this" panel, never a 500.

### Definition of done

- [ ] A test client in each of the 13 stages renders correctly; progress strip accurate via `displayStage`.
- [ ] `/review/` renders for a client with `review_content`; branded 404 without.
- [ ] `/google-business/` renders for any client.
- [ ] `dropped_out` > 30 days renders the unpublished panel.
- [ ] All stages mobile-clean.

### Recovery / rollback

- The try/catch around the stage switch guarantees no 500 — unknown/error stage falls back to a generic panel.

-----

<a id="session-8"></a>

# Session 8 — Portal action buttons

**Goal:** Wire the three preview_ready buttons (Love it / A few changes / Not for me) and the structured feedback form. These are **public** POSTs (the client clicks them) — no `DASHBOARD_SECRET`.

**Critical path?** Yes. **Time:** 2–3 h. **Depends on:** S3, S7. **Model:** Sonnet.

### Manual prerequisites

- None.

### Decisions to confirm

1. **POST routes on `api/portal.js`:** `POST /c/:slug/decision { choice: 'love'|'changes'|'no' }` and `POST /c/:slug/feedback { categories[], note? }`.
2. **Slug-as-key risk:** accepted for v1 (anyone with the slug could click). Add Cloudflare/Vercel rate limiting if abused; CSRF tokens only if needed.
3. **On 'love':** stage → `awaiting_payment`, send Convergence-3. **Note (v3):** the Stripe payment link in Convergence-3 isn't real until S10 wires `client_reference_id={slug}`. Until then, the template's `{stripe_link}` is a placeholder — acceptable because you're hand-driving these in Phase B, but do **not** send Convergence-3 to a real prospect before S10 ships. **On 'changes':** require a feedback row within the last few minutes, stage → `revisions`, `next_action_by` = +2 working days, send Convergence-1. **On 'no':** stage → `dropped_out`, send Convergence-4.
4. **Idempotent:** if already past `preview_ready`, no-op with a friendly "already confirmed" panel.

### Inputs (read)

Playbook Convergence-1, -3, -4 + the structured "few changes" form, `api/portal.js`, `api/_lib/email.js`.

### Outputs (create/edit)

`api/portal.js` (edit: decision + feedback POST handlers, wired preview_ready buttons, inline feedback form), `api/_lib/templates.js` (edit: Convergence-1/-3/-4).

### Cursor kickoff (paste this)

> Implement **Session 8** of `docs/neobookworm-onboarding-build-plan-v3.md`. Confirm the four decisions first. Add public POST handlers to `api/portal.js`: `/c/:slug/decision` and `/c/:slug/feedback` (no `DASHBOARD_SECRET`). Wire the three preview_ready buttons (small inline JS) and the structured checkbox feedback form. 'love' → `awaiting_payment` + Convergence-3; 'changes' → store feedback row + `revisions` + `next_action_by` +2 working days + Convergence-1; 'no' → `dropped_out` + Convergence-4. Idempotent: past `preview_ready` → friendly "already confirmed" no-op. Add Convergence-1/-3/-4 to `templates.js`. Note `{stripe_link}` is a placeholder until S10.

### Definition of done

- [ ] "Love it" → `awaiting_payment` + Convergence-3; "Changes" → feedback stored + `revisions` + Convergence-1; "Not for me" → `dropped_out` + Convergence-4.
- [ ] Double-click doesn't double-send.
- [ ] Every email threads into the existing Gmail conversation.
- [ ] Portal re-renders to the new stage after each action.

### Recovery / rollback

- **Double send:** add a uniqueness guard on `email_log` (one template per slug per minute).
- **Clunky mobile form:** degrade to textarea-only.

-----

<a id="session-9"></a>

# Session 9 — Handover doc HTML variants

**Goal:** Branded HTML handover at `/c/{slug}/handover/`, replacing docx attachments. Care / self-managed / undecided variants.

**Critical path?** Yes (the launch email links it). **Time:** 2 h. **Depends on:** S7. **Model:** Sonnet.

### Manual prerequisites

- [ ] Plain-text export of both handover `.docx` files to hand to Cursor.

### Decisions to confirm

1. **Variant selection** by `clients.plan`: `care` / `self_managed` / NULL → undecided page presenting both.
2. **`@media print`** block + print button.
3. **"Last updated"** date hardcoded in the template.
4. **Faithful copy** from the docx — convert format only.

### Inputs (read)

Plain-text export of both handover docx files, `guides/website-handover.html` (strong source), `api/portal.js`, playbook handover routing notes (Post-1, Post-3).

### Outputs (create/edit)

`api/portal.js` (edit: handover render, 3 variants, at `/c/:slug/handover/`).

### Cursor kickoff (paste this)

> Implement **Session 9** of `docs/neobookworm-onboarding-build-plan-v3.md`. Confirm the four decisions first. Render the handover doc at `/c/:slug/handover/` in `api/portal.js`, branded (navy/amber/Playfair/DM Sans per CLAUDE.md) and print-friendly (`@media print` + print button). Pick the variant from `clients.plan` (`care` / `self_managed` / NULL → undecided showing both). Reproduce the docx content faithfully — convert format only — using `guides/website-handover.html` as a styling reference. Hardcode a "Last updated" date.

### Definition of done

- [ ] Renders the correct variant per `plan` (undecided page for NULL).
- [ ] Print preview is clean black-on-white with the brand header.
- [ ] All docx content faithfully reproduced; all links work; mobile-clean.

### Recovery / rollback

- docx is source of truth; re-convert if content drifts.

-----

<a id="mini-qa-b"></a>

# Mini-QA: Phase B

**Goal:** Walk one test client `acknowledged → live` by hand-driving stages from the dashboard, verifying portal render + emails + Gmail threading at each step. **Time:** 1 h.

Test the happy path (J1), the revisions path, the kind close, both handover variants, and the J2 review → `review_delivered` flow. **Definition of done:** all flows pass; no 500s; all emails in one Gmail thread; severity-1 defects fixed before Phase C.

-----

<a id="session-10"></a>

# Session 10 — Stripe webhook

**Goal:** Payment confirmed → `clients` updates → Convergence-5 sent. Plus care-plan subscription events.

**Critical path?** Yes. **Time:** 3 h. **Depends on:** S1, S3, S8. **Model:** Sonnet.

### Manual prerequisites

- [ ] Stripe in test mode; create **two Payment Links**: £199 build fee (one-off), £9.99/mo care plan (subscription).
- [ ] Create a webhook endpoint in Stripe pointing at `/api/stripe-webhook`; copy its signing secret.
- [ ] Set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in Vercel.

### Decisions to confirm

1. **`api/stripe-webhook.js`** (Vercel function), signature-verified.
2. **Link payment to client** via `client_reference_id={slug}` on the Payment Link URL. (This is the real `{stripe_link}` the S8 Convergence-3 placeholder was waiting on — update the `awaiting_payment` portal button + Convergence-3 to use it.)
3. **Events:** `checkout.session.completed` → `payment_status='paid'`, stage → `preparing_live`, pick Convergence-5 domain variant from `clients.domain_status`, send. `invoice.payment_succeeded` → `last_payment_at`, `plan='care'`, no client email. `invoice.payment_failed` → alert you, no state change. `customer.subscription.deleted` → `plan=NULL`, kind email.
4. **Idempotency:** a `stripe_events` table recording processed `event_id`s.

### Inputs (read)

Playbook Convergence-5 (3 variants), `api/_lib/email.js`, `api/_lib/d1.js`, `api/portal.js` (the `awaiting_payment` button).

### Outputs (create/edit)

`api/stripe-webhook.js` (new), migration for `stripe_events` (new), `api/_lib/templates.js` (edit: Convergence-5 ×3), `api/portal.js` (edit: real Stripe link with `client_reference_id`; `care_active` "Manage billing" → Stripe Customer Portal).

### Cursor kickoff (paste this)

> Implement **Session 10** of `docs/neobookworm-onboarding-build-plan-v3.md`. This is a **Vercel function** — the playbook's "Worker structure" section is marked superseded. Confirm the four decisions first. Build `api/stripe-webhook.js` with signature verification (`STRIPE_WEBHOOK_SECRET`) and handlers for `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted` as specified. Link payments via `client_reference_id={slug}`. Add a `stripe_events` table (migration) for idempotency. Add Convergence-5 (3 variants) to `templates.js`, selected by `clients.domain_status`. Update the `awaiting_payment` portal button to the real Payment Link and add a `care_active` "Manage billing" link to the Stripe Customer Portal. Never disable signature verification.

### Definition of done

- [ ] A real test-mode payment drives a client to `preparing_live` + sends the correct Convergence-5 variant.
- [ ] `payment_failed` alerts you; `subscription.deleted` handled.
- [ ] Replayed event isn't processed twice.

### Recovery / rollback

- Stripe retries failed webhooks for days — fix the handler and events catch up. Never disable signature verification.

-----

<a id="session-11"></a>

# Session 11 — Nudge cron

**Goal:** A daily Vercel Cron that sends nudges per the playbook schedule, respecting "no more than one per 3 working days," including the 21-day auto-close.

**Critical path?** Yes. **Time:** 3–4 h (may span two sittings). **Depends on:** S1, S3, S8. **Model:** Opus.

**Why Opus:** off-by-one here spams clients; the auto-close is destructive.

### Manual prerequisites

- [ ] Set `CRON_SECRET` + `NUDGE_DRY_RUN=1` in Vercel.
- [ ] Backdated test `clients` rows ready (4/8/14/21 days in `preview_ready`; 5/14 days in `awaiting_payment`).

### Decisions to confirm

1. **Vercel Cron** in `vercel.json` (e.g. `0 9 * * 1-5`) hitting `api/cron-nudge.js`. Guard with `CRON_SECRET` so it can't be triggered publicly.
2. **Working-day vs calendar-day arithmetic (v3 clarity):** the `preview_ready` and `awaiting_payment` nudges are measured in **working days** (`isWorkingDay`, `workingDaysBetween`, `addWorkingDays` over parsed ISO strings). The post-launch touches (Post-5 at 14, Post-6 at 30) are measured in **calendar days** after the `live` stage. Don't conflate them.
3. **Bank holidays not handled** in v1.
4. **Dry-run mode** via `NUDGE_DRY_RUN`: compute + email you a digest instead of sending. Run dry-run for ~2 weeks.
5. **Cooldown:** check the most recent nudge in `email_log`; skip if < 3 working days.
6. **Send-then-update** for auto-close (network send first; on success update stage) so a client is never marked `dropped_out` without notification.

### Inputs (read)

Playbook "The nudge schedule" (full) + Nudge-1..6 + Post-5/Post-6 templates, `api/_lib/email.js`, `api/_lib/d1.js`.

### Outputs (create/edit)

`api/cron-nudge.js` (new), `api/_lib/working-days.js` (new), a pure `decideNudge(client, recentNudges, today)` (unit-tested), `api/_lib/templates.js` (edit: Nudge-1..6, Post-5, Post-6), `vercel.json` (edit: cron), optional dashboard "nudge preview".

### Cursor kickoff (paste this)

> Implement **Session 11** of `docs/neobookworm-onboarding-build-plan-v3.md`. This is a **Vercel Cron function** — the playbook's "Worker structure" section is marked superseded. Confirm the six decisions first — pay attention to **working-day vs calendar-day** arithmetic (decision 2). Build `api/_lib/working-days.js`, a pure unit-testable `decideNudge(client, recentNudges, today)`, and `api/cron-nudge.js` guarded by `CRON_SECRET` with a `NUDGE_DRY_RUN` digest mode. Enforce the "≤1 nudge per 3 working days" cooldown via `email_log`. The 21-day `preview_ready` auto-close must **send first, then** set `dropped_out` (never mark without notifying). Add Nudge-1..6, Post-5, Post-6 to `templates.js` and the cron schedule to `vercel.json`. Write unit tests covering every nudge scenario in the playbook.

### Definition of done

- [ ] Unit tests cover all nudge scenarios from the playbook.
- [ ] Dry-run digest accurately describes intended sends.
- [ ] Backdated test clients (4/8/14/21 days) each get the expected nudge; no double-sends across two runs.
- [ ] 21-day auto-close sends the email **and** sets `dropped_out`.
- [ ] Post-5/Post-6 fire once per client, not every run.

### Recovery / rollback

- Flip `NUDGE_DRY_RUN` on instantly if a nudge misfires. Revert a wrong auto-close by hand and apologise by email.

-----

<a id="session-12"></a>

# Session 12 — OneTimeSecret (defer)

**Goal:** Generate OTS links for self-managed handover credentials from a dashboard action.

**Critical path?** Defer-if-needed — 3 OTS creates by hand = ~5 min/client until volume justifies automating. **Time:** 1.5 h. **Depends on:** S3, S5. **Model:** Sonnet.

### Manual prerequisites

- None (OTS free tier, no auth).

### Decisions to confirm

- Free tier, no auth; TTL 604800 (7 days); passwords pasted into a dashboard form, never stored except as OTS URLs in a transient `handover_secrets` table.

### Inputs (read)

OTS API docs, playbook Post-3 self-managed template, `api/dashboard.js`, `api/_lib/email.js`.

### Outputs (create/edit)

`api/_lib/onetimesecret.js` (new), `api/dashboard.js` (edit: `client_generate_handover_secrets` action), `api/_lib/templates.js` (edit: Post-3 self-managed), migration for `handover_secrets`.

### Cursor kickoff (paste this)

> Implement **Session 12** of `docs/neobookworm-onboarding-build-plan-v3.md`. Confirm the decision first. Build `api/_lib/onetimesecret.js` (`createSecret(password, ttl=604800) → URL`) and a `client_generate_handover_secrets` dashboard action (gated by `DASHBOARD_SECRET`): 3 password fields → 3 OTS URLs → render + send Post-3 self-managed (fresh subject `{business} — credentials to keep safe`). Add Post-3 self-managed to `templates.js`. Store only OTS URLs in a transient `handover_secrets` table, never the passwords.

### Definition of done

- [ ] Form submits 3 passwords → Post-3 email arrives with 3 working one-view OTS links.
- [ ] Regenerate works after a lapsed window.

### Recovery / rollback

- OTS down → paste into the OTS web UI by hand; same email.

-----

<a id="session-13"></a>

# Session 13 — Full end-to-end QA

**Goal:** Walk every journey end-to-end, find defects, fix the critical ones.

**Critical path?** Yes. No real prospects until this passes. **Time:** 3–4 h. **Depends on:** all prior. **Model:** Sonnet.

### Manual prerequisites

- [ ] `+test1..+test5` Gmail aliases ready.
- [ ] Stripe test mode; `NUDGE_DRY_RUN` available to toggle.

For each of J1–J5: submit → verify client row → acknowledgement in 60 s → portal renders → drive stages from the dashboard → preview-ready email → feedback flow + Convergence-1 → revisions → Love it + Convergence-3 → Stripe test pay + Convergence-5 → mark live + Post-1 → reply care/self-managed + Post-3 (+ OTS for one). Plus nudge testing with backdated clients and one real (non-dry-run) run.

**Definition of done:** all 5 journeys complete; all emails render with no broken placeholders and thread correctly; Stripe verified; nudge dry-run correct; zero severity-1 defects; you'd be happy for a real client to walk this today.

-----

<a id="session-14"></a>

# Session 14 — First-5-prospects playbook

**Goal:** A short operating manual at `docs/first-5-prospects.md` for handling the first 5 real clients with extra human touches, a watch list, decision points to pause at, and the prompt prep for the post-5 template revision. Plus a tracking sheet and a calendar reminder for the post-5 review.

**Critical path?** Yes. The first 5 are when you learn what the templates actually feel like. **Time:** 1 h. **Model:** Sonnet.

### Outputs (create/edit)

`docs/first-5-prospects.md` (new).

### Cursor kickoff (paste this)

> Implement **Session 14** of `docs/neobookworm-onboarding-build-plan-v3.md`. Write `docs/first-5-prospects.md`: an operating manual for the first 5 real clients — extra human touches per journey, a watch list, decision points to pause at, and the prompt prep for the post-5 template revision. Include a simple tracking-sheet structure and a calendar-reminder note for the post-5 review. Journey-agnostic.

-----

<a id="open-questions"></a>

# Open questions / things to watch

1. **Email identity — RESOLVED.** Onboarding sends as `nick@neobookworm.uk` via Google Workspace SMTP. Full SPF/DKIM/DMARC alignment. Only build-time step: the Google app password (S0). Do not reuse the contact form's iCloud transport.
2. **Notion-referencing skills** (`neobookworm-campaign-setup`, `-prospect-runner`, `-site-brief`) mention Notion but read `notion_id` as an opaque ID only — still fine. Any that *write* to Notion need a separate cleanup pass. Out of scope.
3. **`prospects.notion_id` as PK.** Keep it — a stable unique string. Renaming isn't worth the churn.
4. **Vestigial Notion columns** (`landing_enquiries.notion_*`, `intake_submissions.notion_page_id`) — stop writing them in S0; drop them in a later housekeeping migration, not now.
5. **Cold-prospect promotion UX.** The dashboard promote dialog must ask for the journey (no form-derived signal for cold prospects).
6. **Single renderer discipline.** The dashboard must *link/iframe* the live portal, never re-implement it. Enforce in S5 review.
7. **Outbox stays cold-only.** Don't let the two send mechanisms blur.
8. **Stripe link timing.** Convergence-3 (S8) references `{stripe_link}`, but the real per-client link arrives in S10. Don't send Convergence-3 to a real prospect before S10 ships.
9. **Photo upload (descoped).** If clients start emailing lots of photos and it's painful, revisit the R2 upload flow as a post-launch addition.

-----

<a id="after"></a>

# After Session 14: ongoing operation

- **First 5 prospects:** follow the operating manual; be present beyond what the system requires; write everything down.
- **Post-5 review (Opus, ~2 h):** revise cold/wrong templates, adjust stage transitions where friction is consistent, update timing promises.
- **Deliberately deferred** until you feel the pain: portal photo upload, deliverability/bounce monitoring, reactivation flow for returning drop-outs, care-plan churn analytics, refer-a-friend, SMS fallback, full bank-holiday calendar, A/B testing, Koalendar auto-send.
- **Maintenance rhythm:** weekly (stuck clients in the dashboard), monthly (`email_log` failed sends), quarterly (which templates trigger replies), annually (does the playbook still match how you work?).

-----

*End of build plan v3 (operator-ready brownfield build).*
