# NeoBookworm — Onboarding Build Plan v2 (brownfield rewrite)

How to take the [Onboarding Playbook](./neobookworm-onboarding-playbook.md) from document to working system — **built on top of the dashboard, D1, and Workers you already have**, not from a blank slate.

**Saved at:** NeoBookworm.uk/docs (alongside the playbook)

-----

## Why this is a rewrite

The previous version of this plan was written greenfield: create databases, build an intake Worker, wire the landing pages, build an admin view from scratch. Almost none of that is true any more. Most of "Phase A" already exists and is live in production. This rewrite reconciles the plan with reality so you build the **missing 30%** instead of rebuilding the 70% that already works.

### What already exists (and the plan must reuse, not rebuild)

| The old plan said "build" | Reality on the ground |
|---|---|
| Create 2 D1 databases | `neobookworm-prospects` (~5.5 MB, real data) and `neobookworm-enquiries` already exist. |
| Set up MailChannels + SPF/DKIM for Worker email | **Not needed.** Email already works via iCloud SMTP through Vercel (`api/contact.js`). CLAUDE.md states Workers can't do SMTP and the correct pattern is "POST to a Vercel function." The entire MailChannels strand is deleted. |
| Build an intake Worker | The `neobookworm-landing-enquiry` Worker is deployed and writing to `landing_enquiries`, with retry cron + daily digest. |
| Wire the landing pages | `plumbers.html`, `plumbers-switch.html`, `electricians*.html` already POST to that Worker. |
| Build a new `/admin/` view | `dashboard.html` (~3,900 lines) **is** the admin view — Prospects / Enquiries / Campaigns tabs, gated by `DASHBOARD_SECRET`, served by `api/dashboard.js` which proxies to D1 over the Cloudflare REST API. |

### Decisions locked before this rewrite (do not relitigate without reason)

1. **Onboarding state lives in a new `clients` table** in `neobookworm-enquiries`, keyed by `slug`, with `source_type` + `source_id`. It accepts four sources: `landing_enquiry`, `intake`, `contact`, and `prospect` (cold replies enter the same pipeline). The existing `prospects` table keeps its current meaning (cold outreach targets) untouched.
2. **The public client portal `/c/{slug}/` is a Vercel function** (`api/portal.js`), reusing the `queryD1` helper already in `api/dashboard.js`. No second runtime.
3. **Onboarding emails send via Google Workspace SMTP** (`smtp.gmail.com`, port 587) authenticated as `nick@neobookworm.uk`, From `nick@neobookworm.uk`. Confirmed viable: the domain's MX is Google, SPF authorises Google (`include:_spf.google.com`), Google DKIM (`google._domainkey`) is published, and DMARC exists — so SPF/DKIM/DMARC all align for this sender. This is a **second, separate transport** from the contact form's iCloud SMTP (which sends as `neobookworm@icloud.com` and is left untouched). The only build-time step is generating a Google app password.
4. **Operator surface = a new "Clients" tab in `dashboard.html`.** "Enquiries" stays the raw inbound inbox; an enquiry (or cold prospect) is *promoted* into a client.
5. **Onboarding emails are a separate auto-send transactional path.** The `outbox` queue + approval gates stay cold-campaign-only and are not touched.
6. **Notion is retired as a source of truth.** D1 is canonical. All Notion writes/sync are decommissioned (S0). `notion_id` survives only as an opaque stable identifier on the `prospects` table.
7. **Timestamps stay TEXT `datetime('now')`** to match every existing table, not unix integers. Working-day arithmetic happens in JS by parsing ISO strings.

### The two-surface model (important)

The dashboard is **operator-only** (behind `DASHBOARD_SECRET`). A tradesperson can never log into it. So the portal splits cleanly in two:

- **Client-facing portal** — public, the slug is the only key, rendered by `api/portal.js`. This is what the prospect sees and clicks.
- **Operator management of it** — the new dashboard "Clients" tab. Lists every onboarding client, their stage, days-in-stage, a link to their *live* portal page, and per-row actions (promote, advance stage, send the next templated email, mark preview-ready, generate handover). To avoid two renderers drifting, the dashboard **links to / iframes the real portal URL** rather than re-implementing the client view.

-----

## Contents

- [How to use this plan](#how-to-use-this-plan)
- [Architecture at a glance](#architecture-at-a-glance)
- [Session map](#session-map)
- [Sequencing](#sequencing)
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

## How to use this plan

Each session has the same shape: goal, critical-path flag, honest time estimate, dependencies, pre-flight checklist, deliverables, definition of done, recovery/rollback. The consistency is the point.

### Pre-flight ritual

1. Open a chat with the recommended prep model for the session.
2. Paste the session's pre-flight checklist.
3. Share the listed real files (`api/dashboard.js`, `dashboard.html`, the relevant landing pages, the playbook section).
4. Confirm the decisions before any code is written.
5. Only then start editing.

### Critical path

Every session is **Critical path** or **Defer-if-needed**. If time gets tight, ship the critical-path sessions to completion and defer the rest. A complete smaller system beats a half-finished bigger one.

### Model guidance

| Phase of work | Model |
|---|---|
| Architecture / schema / nudge logic | **Opus** when expensive to be wrong |
| Routine implementation | Sonnet |
| Quick spot-checks | Haiku |

-----

## Architecture at a glance

```
                      ┌─────────────────────────────────────────────┐
   LANDING PAGES ───► │ neobookworm-landing-enquiry Worker (exists)  │
   (plumbers.html …)  │  writes landing_enquiries  (Notion: REMOVED) │
                      └───────────────┬─────────────────────────────┘
                                      ▼
   INTAKE FORM ──────────────► neobookworm-enquiries (D1)
   (intake-form.html)          ├─ landing_enquiries   (raw inbound)
                               ├─ intake_submissions  (raw inbound)
   CONTACT FORM ─────────────► ├─ contact_enquiries   (raw inbound)
   (contact.html)              ├─ clients   ◄── NEW: onboarding state, keyed by slug
                               ├─ email_log ◄── NEW
                               └─ feedback  ◄── NEW

   COLD PROSPECTS ───────────► neobookworm-prospects (D1)
   (prospects / campaigns /    └─ prospects (status='Emailed' → reply → promote to clients)
    outbox — unchanged)

   VERCEL FUNCTIONS (api/)
   ├─ dashboard.js   (exists) ── + new client_* actions, DASHBOARD_SECRET
   ├─ portal.js      (NEW)    ── public /c/{slug}/  read + decision/feedback POSTs
   ├─ stripe-webhook.js (NEW) ── payment → stage + Convergence-5
   ├─ cron-nudge.js  (NEW)    ── Vercel Cron, nudge schedule
   └─ _lib/
        ├─ d1.js        (extract queryD1 from dashboard.js)
        ├─ email.js     (Google Workspace SMTP, From nick@neobookworm.uk)
        └─ templates.js (all onboarding email templates + render)

   DASHBOARD (dashboard.html, DASHBOARD_SECRET)
   └─ Tabs: Prospects | Enquiries | Campaigns | Clients ◄── NEW
```

-----

## Session map

| # | Session | Critical path? | Realistic time | Prep model |
|--|--|--|--|--|
| 0 | Reconcile, verify email identity, retire Notion | Yes | 2–3 h | **Opus** |
| 1 | `clients` table + promotion logic | Yes | 2–3 h | **Opus** |
| 2 | Email template module | Yes | 1.5–2 h | Sonnet |
| 3 | Transactional send helper | Yes | 1.5 h | Sonnet |
| 4 | Portal Vercel function (skeleton) | Yes | 2–3 h | Sonnet |
| 5 | Dashboard "Clients" tab | Yes | 3–4 h | Sonnet |
| 6 | Acknowledgement automation + promote action | Yes | 2–3 h | Sonnet |
| A1 | Mini-QA: Phase A | Yes | 1 h | Sonnet |
| 7 | Portal remaining stages | Yes | 2–3 h | Sonnet |
| 8 | Portal action buttons | Yes | 2–3 h | Sonnet |
| 9 | Handover doc HTML variants | Yes | 2 h | Sonnet |
| B1 | Mini-QA: Phase B | Yes | 1 h | Sonnet |
| 10 | Stripe webhook | Yes | 3 h | Sonnet |
| 11 | Nudge cron | Yes | 3–4 h | **Opus** |
| 12 | OneTimeSecret | Defer | 1.5 h | Sonnet |
| 13 | Full end-to-end QA | Yes | 3–4 h | Sonnet |
| 14 | First-5-prospects playbook | Yes | 1 h | Sonnet |

**Total realistic time:** ~28–34 hours of focused work — meaningfully less than a greenfield build because the intake path, email transport, D1, and admin shell already exist.

-----

## Sequencing

**Phase A — Foundation + minimum viable onboarding (S0–S6).** End state: an inbound enquiry (or promoted cold prospect) becomes a `clients` row with a slug, gets an acknowledgement email From `nick@neobookworm.uk`, has a public portal URL that resolves, and shows up in the dashboard "Clients" tab where you can drive its stage by hand. Notion is gone.

**Mini-QA: Phase A** before building further.

**Phase B — Full portal experience (S7–S9).** Remaining stages, action buttons (Love it / changes / not for me), handover docs.

**Mini-QA: Phase B.**

**Phase C — Automation polish (S10–S14).** Stripe, nudges, OneTimeSecret, full QA, first-5 playbook.

**Strong recommendation:** run real prospects through Phase A+B manually for 2–3 weeks before starting Phase C.

-----

<a id="session-0"></a>

# Session 0 — Reconcile, verify email identity, retire Notion

**Goal:** Lock the foundations the rest of the build assumes: confirm the email identity works, make D1 the single source of truth by decommissioning Notion, and extract the shared helpers the new functions will import.

**Critical path?** Yes.

**Honest time estimate:** 2–3 hours.

**Depends on:** Nothing.

## Pre-flight checklist

**Share:** `CLAUDE.md`, `WEBSITE-REFERENCE.md`, `api/dashboard.js`, `api/contact.js`, the landing-enquiry Worker source (`workers/landing-enquiry/`), this plan, the playbook Conventions section.

**Decisions to confirm:**

1. **Email identity — RESOLVED.** Onboarding email sends as `nick@neobookworm.uk` via **Google Workspace SMTP** (`smtp.gmail.com`:587). DNS confirms this is correct and aligned: MX → Google, SPF → `include:_spf.google.com`, DKIM → `google._domainkey` published, DMARC present (`p=none`). The contact form's iCloud transport (`neobookworm@icloud.com`) is **not** reused — iCloud isn't in SPF and can't legitimately send as nick@. Build-time steps in this session: (a) generate a Google app password for `nick@neobookworm.uk` (myaccount.google.com → Security → App passwords; 2FA must be on), (b) store it as a new Vercel env var (e.g. `GW_SMTP_USER` / `GW_SMTP_PASS`), (c) send one real test and confirm SPF/DKIM/DMARC all **pass** via mail-tester.com.
2. **Notion retirement scope.** All Notion writes are dropped. That means: the landing-enquiry Worker stops calling Notion; any Notion-sync cron/agent is disabled; `landing_enquiries.notion_status/notion_page_id/notion_error` and `intake_submissions.notion_page_id` become vestigial (leave the columns, stop writing them — dropping columns is a later cleanup, not now). `prospects.notion_id` stays as the opaque primary key but is no longer "synced from Notion."
3. **Shared helper extraction.** `queryD1` currently lives inside `api/dashboard.js`. Extract it (plus account/db-id constants) to `api/_lib/d1.js` so `portal.js`, `stripe-webhook.js`, and `cron-nudge.js` can import the same battle-tested function.

## Deliverables

- A short `docs/onboarding-architecture-decisions.md` capturing the 7 locked decisions + the email-identity test result.
- `api/_lib/d1.js` — extracted `queryD1`, `prospectsDb()`, `enquiriesDb()`, `accountId()`. `api/dashboard.js` updated to import from it (no behaviour change).
- Landing-enquiry Worker: Notion calls removed; redeployed; confirmed still writing `landing_enquiries` cleanly without Notion.
- Any Notion-sync cron/scheduled agent disabled and documented.
- A note in CLAUDE.md's outstanding-items table recording Notion as retired.

## Definition of done

- [ ] A test email sent through the Vercel SMTP path arrives From `nick@neobookworm.uk` with aligned SPF/DKIM (mail-tester score ≥ 8/10).
- [ ] `api/dashboard.js` works exactly as before after importing `queryD1` from `_lib/d1.js` (spot-check the dashboard loads all three tabs).
- [ ] A new landing-page submission creates a `landing_enquiries` row with **no** Notion call attempted (check Worker logs).
- [ ] No scheduled job is still writing to Notion.
- [ ] `docs/onboarding-architecture-decisions.md` exists.

## Recovery / rollback

- **If `nick@neobookworm.uk` can't be sent-as:** fall back to `neobookworm@icloud.com` for v1 and flag it; the playbook's relationship voice is slightly weaker but the system works. Revisit once Workspace relay is sorted.
- **If removing Notion breaks the Worker:** Notion calls should be in an isolated block — wrap removal in a single commit so revert is one step.
- **If skills reference Notion:** several `anthropic-skills` (campaign-setup, prospect-runner, site-brief) mention Notion. They're out of scope here — note them for a separate cleanup pass; they read `notion_id` as an ID, which still works.

-----

<a id="session-1"></a>

# Session 1 — The `clients` table + promotion logic

**Goal:** Create the single onboarding record and the logic that promotes an enquiry (or cold prospect) into it.

**Critical path?** Yes. Everything reads/writes this table.

**Honest time estimate:** 2–3 hours.

**Depends on:** S0.

## Pre-flight checklist

**Share:** playbook (Conventions, Five Journeys, Stage list, The portal stage list), the live schemas of `landing_enquiries`, `intake_submissions`, `contact_enquiries`, `prospects` (already captured below), `api/_lib/d1.js`.

**Decisions to confirm:**

1. **Slug format:** `{business-slugified}-{5-char-random}`; fall back to `{name-slugified}-{5-char-random}`; final fallback `client-{8-char-random}`. Lowercase ASCII, collision-checked against `clients.slug`.
2. **Journey is derived, not re-captured.** Map from existing data: `landing_enquiries.start_option` (`leave_it_with_me`/`tell_more` → J1, `review_site_first` → J2, `ready_to_switch` → J3); `intake_submissions` → J4; `contact_enquiries` → J5; promoted `prospects` → operator picks the journey at promotion time.
3. **12 stages in a CHECK constraint from day one:** `acknowledged, researching, building, reviewing, preview_ready, revisions, awaiting_payment, preparing_live, live, care_active, self_managed, dropped_out`.
4. **Migrations via the existing tooling.** `neobookworm-enquiries` already has a `d1_migrations` table — use the wrangler migrations workflow there. (`neobookworm-prospects` does not; we are not touching it.)
5. **Timestamps as TEXT `datetime('now')`** to match every existing table.

## Deliverables — `clients` table (in `neobookworm-enquiries`)

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
                      'acknowledged','researching','building','reviewing',
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

- `email_log` table: `id INTEGER PK AUTOINCREMENT, slug TEXT NOT NULL, template TEXT NOT NULL, sent_at TEXT NOT NULL, subject TEXT NOT NULL, recipient TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'sent', error TEXT`. Indexes: `(slug, sent_at DESC)` for portal history, `(slug, template)` for nudge dedup.
- `feedback` table: `id INTEGER PK AUTOINCREMENT, slug TEXT NOT NULL, categories TEXT, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))`.
- `api/_lib/slug.js` — `slugify()` + `generateSlug(business, name, queryD1)` with collision retry.
- `api/_lib/promote.js` — `promoteToClient({ source_type, source_id, journey })`: reads the source row, builds a `clients` row, generates a slug, returns it. Idempotent: if a client already exists for that `(source_type, source_id)`, returns the existing slug.
- Rollback SQL for each migration.

## Definition of done

- [ ] Migration applies cleanly to `neobookworm-enquiries`; `clients`, `email_log`, `feedback` exist with the constraints above.
- [ ] `generateSlug('Hart Plumbing','Tom', q)` returns e.g. `hart-plumbing-3f9k2`; empty business → name fallback; both empty → `client-…`.
- [ ] `promoteToClient` creates exactly one row from a real `landing_enquiries` id, and is a no-op on a second call.
- [ ] Inserting a `<script>` name and reading it back proves nothing executes downstream (escaping is the portal's job, but confirm storage is raw/safe).

## Recovery / rollback

- **Schema change after applying:** new migration, never edit an applied one — `d1_migrations` enforces the habit.
- **Wrong promotion:** `DELETE FROM clients WHERE slug=?` (no downstream rows yet at this stage).

-----

<a id="session-2"></a>

# Session 2 — Email template module

**Goal:** One place that renders every onboarding email, enforcing the subject-threading convention.

**Critical path?** Yes.

**Honest time estimate:** 1.5–2 hours.

**Depends on:** S1.

## Pre-flight checklist

**Share:** playbook Conventions (placeholders, sign-off), playbook J1-E1 (implement first), the full template inventory references.

**Decisions to confirm:**

1. **Storage:** JS constants in `api/_lib/templates.js`, with an optional D1 `template_overrides` row check (so you can fix a typo without a redeploy). Start with constants only; add overrides if/when you want them.
2. **Interpolation:** single braces `{name}`, strict allowlist — unknown variable → throw; missing required variable → throw.
3. **Subject threading:** every template returns the same subject `{business} — your NeoBookworm website`, except the two playbook exceptions (`{business} — invoice`, `{business} — credentials to keep safe`). The module owns the subject per template ID.
4. **Plain text only.** No HTML email.

## Deliverables

- `api/_lib/templates.js` — `TEMPLATES`, `SUBJECTS`, `ALLOWED_VARS`, and `renderTemplate(id, vars)` → `{ subject, body }`. J1-E1 implemented verbatim from the playbook; other IDs stubbed and added as later sessions need them.
- `api/_lib/templates.test.mjs` — a runnable Node check.
- `docs/onboarding-email-templates.md`.

## Definition of done

- [ ] `renderTemplate('J1-E1', { name:'Tom', business:'Hart Plumbing', deliver_by:'Tuesday 4 June', portal_url:'…' })` returns the correct subject + body.
- [ ] Unknown template ID throws; unknown var throws; missing required var throws.
- [ ] Test script runs clean.

## Recovery / rollback

- Templates are pure data; re-implementing the renderer carries the content over untouched.

-----

<a id="session-3"></a>

# Session 3 — Transactional send helper

**Goal:** A single function the dashboard, portal, webhook, and cron all call to send a templated onboarding email and log it.

**Critical path?** Yes.

**Honest time estimate:** 1.5 hours.

**Depends on:** S0 (email identity), S1 (`email_log`), S2 (templates).

## Pre-flight checklist

**Share:** `api/contact.js` (the working Nodemailer + iCloud SMTP pattern), `api/_lib/templates.js`, `api/_lib/d1.js`.

**Decisions to confirm:**

1. **New Google Workspace transport** (do NOT reuse `api/contact.js`'s iCloud config). `smtp.gmail.com`:587, user `nick@neobookworm.uk`, pass = the Google app password from S0 (Vercel env `GW_SMTP_USER`/`GW_SMTP_PASS`). From = `nick@neobookworm.uk`, Reply-To = `nick@neobookworm.uk`, From-name = "Nick at NeoBookworm". The contact form keeps its separate iCloud transport.
2. **Failure philosophy:** a failed send logs to `email_log` with `status='failed'` + error and **does not throw** to the caller — the client already has a portal URL, the email is retryable by hand. (Exception: the dashboard's manual "send" action surfaces the failure to you directly.)
3. **No threading header hacks needed** — Gmail threads on identical subject + participants, which the template module guarantees.

## Deliverables

- `api/_lib/email.js` — `sendTemplated({ slug, templateId, vars, to })`: renders, sends via SMTP, writes `email_log`. Returns `{ ok, error? }`.
- A thin debug endpoint or script to fire one real send to a `+test` Gmail alias.

## Definition of done

- [ ] One real J1-E1 send lands in a test inbox From `nick@neobookworm.uk`, plain text, correct sign-off.
- [ ] An `email_log` row is written with `status='sent'`.
- [ ] Forcing an SMTP error writes `status='failed'` and does not crash the caller.

## Recovery / rollback

- **Deliverability problems:** diagnose with mail-tester before suspecting code; SPF/DKIM alignment was set in S0.

-----

<a id="session-4"></a>

# Session 4 — Portal Vercel function (skeleton)

**Goal:** Public `/c/{slug}/` renders a branded, read-only portal for the three early stages (`acknowledged`, `researching`, `building`). No buttons yet.

**Why before automation:** the acknowledgement email (S6) contains the portal URL. It must resolve before any email is sent.

**Critical path?** Yes.

**Honest time estimate:** 2–3 hours.

**Depends on:** S1.

## Pre-flight checklist

**Share:** playbook "The portal" + stage-by-stage copy for `acknowledged`/`researching`/`reviewing`/`building`, CLAUDE.md design system, an existing branded page (e.g. `index.html`) for the look, `api/_lib/d1.js`, `vercel.json`.

**Decisions to confirm:**

1. **Routing:** add a rewrite in `vercel.json` mapping `/c/:slug` → `/api/portal?slug=:slug`, and `/c/:slug/review`, `/c/:slug/handover`, `/c/:slug/google-business` to the same function with a `section` param.
2. **Rendering:** tagged template literals + an escape helper. No framework. Fonts fetched from `https://neobookworm.uk/fonts/` (already cached).
3. **Unknown slug → branded 404**, not Vercel's default.
4. **Read-only this session.** Buttons are S8.

## Deliverables

- `api/portal.js` — GET handler: looks up the client by slug, renders the page for the 3 early stages (other stages → friendly "we're working on this part" placeholder), branded 404 for unknown slug.
- Header (logo, "Hi {name} from {business}"), 6-step progress strip with current stage in amber, active panel per stage with computed deliver-by, useful-links block, conversation-history block (reads `email_log`), contact footer.
- `vercel.json` rewrites.
- A couple of test `clients` rows for manual verification.

## Definition of done

- [ ] `https://neobookworm.uk/c/{test-slug}/` renders for `acknowledged`, `researching`, `building`.
- [ ] Unknown slug → branded 404.
- [ ] Clean on a real phone at 375 px.
- [ ] Conversation history shows `email_log` entries in human time ("3 hours ago").
- [ ] A `<script>` in the business name renders inert (escaping works).

## Recovery / rollback

- Vercel deploys are atomic + instantly revertable; the rewrite only affects `/c/*`, nothing else on the site.

-----

<a id="session-5"></a>

# Session 5 — Dashboard "Clients" tab

**Goal:** The operator surface — a 4th tab in `dashboard.html` listing every onboarding client with stage, days-in-stage, portal link, and a detail view. This is what replaces the old plan's "build a separate admin view."

**Critical path?** Yes.

**Honest time estimate:** 3–4 hours.

**Depends on:** S1, S4.

## Pre-flight checklist

**Share:** `dashboard.html` (study the tab pattern: `.tab-btn[data-tab]`, `state.tab`, `goToTabRoot(tab)`, render-into-`#main-content`), `api/dashboard.js` (study the action dispatch + `queryD1` + `DASHBOARD_SECRET`), the playbook stage list.

**Decisions to confirm:**

1. **Backend actions go into `api/dashboard.js`** as new actions (consistent with the existing pattern + auth): GET `client_list`, `client_detail`; POST `client_promote`, `client_set_stage`, `client_send` (fires a template via `_lib/email.js`), `client_set_fields` (preview_url, domain, plan, etc.).
2. **Frontend:** add `<button class="tab-btn" data-tab="clients">Clients</button>` to `.tab-nav`; extend `goToTabRoot` and the render switch; reuse the existing table/filter/sort machinery.
3. **Columns:** business+contact | journey | stage | days-in-stage | last email | next action by | portal link | actions. Highlight rows stuck > 14 days.
4. **Detail view** shows the client's fields, an **iframe/link to the live portal** (single renderer — no re-implementation), the `email_log` timeline, and action buttons (advance stage, send next template, mark preview-ready, set preview URL / domain / plan).
5. **"Send personal note"** = open a Gmail compose URL pre-filled with the client email + the threading subject. No automation; just convenience.

## Deliverables

- `api/dashboard.js`: the new `client_*` actions.
- `dashboard.html`: Clients tab (list + detail), wired to those actions, reusing existing styles/components.

## Definition of done

- [ ] Clients tab lists all non-dropped clients with all columns; filter + sort work.
- [ ] Detail view renders fields + live-portal iframe + email timeline.
- [ ] "Advance stage" updates D1 and the portal reflects it.
- [ ] "Send next template" sends via `_lib/email.js` and logs to `email_log`.
- [ ] Stuck-row highlight works.
- [ ] Mobile-usable (you'll check this on your phone in spare moments).

## Recovery / rollback

- All new actions are additive; the existing three tabs are untouched. Git revert restores the prior dashboard instantly via Vercel.

-----

<a id="session-6"></a>

# Session 6 — Acknowledgement automation + promote action

**Goal:** Close the loop from "inbound enquiry exists" to "client promoted, acknowledged, portal live." Covers both automatic (new enquiry) and manual (cold-prospect reply) promotion.

**Critical path?** Yes.

**Honest time estimate:** 2–3 hours.

**Depends on:** S2, S3, S4, S5.

## Pre-flight checklist

**Share:** the landing-enquiry Worker source, `api/dashboard.js`, the 5 acknowledgement templates (J1-E1, J2-E1, J3-E1, J4-E1, J5-E1) + the Koalendar/cold-email variants.

**Decisions to confirm:**

1. **Auto-promote on inbound?** Recommended: yes for J1/J2/J3/J4 (the journey is unambiguous from the form), so the acknowledgement fires within seconds. J5 (contact) and cold-prospect replies are **manual promote** from the dashboard (you choose the journey). Implement the auto path by having the landing-enquiry Worker (or a Vercel hook it calls) invoke `promoteToClient` + `sendTemplated(acknowledgement)`.
2. **Where auto-promotion runs:** since email must go through Vercel SMTP, the cleanest path is the Worker POSTs the new enquiry to a small Vercel endpoint (`api/onboarding-intake`) that promotes + acknowledges. (Reuses the "Worker calls Vercel for email" pattern CLAUDE.md already mandates.)
3. **Add the 5 acknowledgement templates** to `templates.js`.
4. **Idempotency:** promotion is already idempotent (S1). The acknowledgement only fires on first promotion (check `email_log` for a prior acknowledgement of that slug).

## Deliverables

- `api/onboarding-intake.js` (or equivalent) — promote + acknowledge for inbound.
- Landing-enquiry Worker updated to call it after writing `landing_enquiries`.
- `client_promote` dashboard action extended to send the acknowledgement for manual promotions (with journey chosen in the UI).
- The 5 acknowledgement templates.

## Definition of done

- [ ] A real form submission on each of J1–J4 auto-creates a client, sends the right acknowledgement From `nick@`, and the portal URL in the email resolves.
- [ ] Manually promoting a `contact_enquiries` row and a cold `prospects` row from the dashboard creates a client, lets you pick the journey, and sends the acknowledgement.
- [ ] Subject line is the identical threading pattern across journeys for the same business.
- [ ] Second submission within an hour doesn't double-send.

## Recovery / rollback

- **Worker → Vercel call fails:** the enquiry still lands in D1; promote it by hand from the dashboard. The prospect is never blocked.

-----

<a id="mini-qa-a"></a>

# Mini-QA: Phase A

**Goal:** Prove S0–S6 work together before building on them.

**Honest time estimate:** 1 hour.

For each of the 5 entry points, on a real phone: submit the form → watch the success state → open the acknowledgement in real Gmail (threaded? plain text? signed correctly? From `nick@`?) → click the portal link → view portal on phone + desktop → check the conversation-history panel → confirm the client appears in the dashboard Clients tab. Plus: manually promote one cold prospect and confirm the same.

**Definition of done:** all entry points pass; every defect logged; all severity-1 defects fixed and re-verified.

-----

<a id="session-7"></a>

# Session 7 — Portal remaining stages

**Goal:** Render the remaining stages: `preview_ready`, `revisions`, `awaiting_payment`, `preparing_live`, `live`, `care_active`, `self_managed`, `dropped_out`, plus the `/review/` page.

**Critical path?** Yes.

**Honest time estimate:** 2–3 hours.

**Depends on:** S4.

## Pre-flight checklist

**Share:** playbook "The portal — stage-by-stage copy" (full), `api/portal.js`.

**Decisions to confirm:**

1. **Review page** reads `clients.review_content` (Markdown) → HTML at `/c/{slug}/review/`.
2. **Handover page** is S9; for now route exists with a "coming soon" panel.
3. **Useful links per stage** = a `linksForStage(stage, journey)` helper.
4. **`dropped_out` lifecycle:** if > 30 days since `stage_changed_at`, render the "unpublished" panel.
5. **preview_ready buttons render but are inert** (wired in S8).

## Deliverables

- `api/portal.js` extended with all 8 stage panels + `/review/` rendering + `linksForStage` + a `daysSince` helper.

## Definition of done

- [ ] A test client in each of the 12 stages renders correctly, progress strip accurate.
- [ ] `/review/` renders for a client with `review_content`; branded 404 without.
- [ ] `dropped_out` > 30 days renders the unpublished panel.
- [ ] All stages mobile-clean.

## Recovery / rollback

- Wrap the stage switch in try/catch → unknown/error stage falls back to a generic "working on this" panel, never a 500.

-----

<a id="session-8"></a>

# Session 8 — Portal action buttons

**Goal:** Wire the three preview_ready buttons (Love it / A few changes / Not for me) and the structured feedback form. These are **public** POSTs (the client clicks them) — no `DASHBOARD_SECRET`.

**Critical path?** Yes.

**Honest time estimate:** 2–3 hours.

**Depends on:** S3, S7.

## Pre-flight checklist

**Share:** playbook Convergence-1, -3, -4 + the structured "few changes" form, `api/portal.js`, `api/_lib/email.js`.

**Decisions to confirm:**

1. **POST routes on `api/portal.js`:** `POST /c/:slug/decision { choice: 'love'|'changes'|'no' }` and `POST /c/:slug/feedback { categories[], note? }`.
2. **Slug-as-key risk:** accepted for v1 (anyone with the slug could click). Add Cloudflare/Vercel rate limiting if abused; CSRF tokens only if needed.
3. **On 'love':** stage → `awaiting_payment`, send Convergence-3 (domain variant TODO until S10 reads `domain_status`). **On 'changes':** require a feedback row within the last few minutes, stage → `revisions`, `next_action_by` = +2 working days, send Convergence-1. **On 'no':** stage → `dropped_out`, send Convergence-4.
4. **Idempotent:** if already past `preview_ready`, no-op with a friendly "already confirmed" panel.

## Deliverables

- Decision + feedback POST handlers in `api/portal.js`.
- preview_ready render: wired buttons (small inline JS), inline checkbox feedback form, per-action success state.
- Convergence-1/-3/-4 templates in `templates.js`.
- `feedback` rows written from the form.

## Definition of done

- [ ] "Love it" → `awaiting_payment` + Convergence-3; "Changes" → feedback stored + `revisions` + Convergence-1; "Not for me" → `dropped_out` + Convergence-4.
- [ ] Double-click doesn't double-send.
- [ ] Every email threads into the existing Gmail conversation.
- [ ] Portal re-renders to the new stage after each action.

## Recovery / rollback

- **Double send:** add a uniqueness guard on `email_log` (one template per slug per minute).
- **Clunky mobile form:** degrade to textarea-only; checkboxes are nice-to-have.

-----

<a id="session-9"></a>

# Session 9 — Handover doc HTML variants

**Goal:** Branded HTML handover at `/c/{slug}/handover/`, replacing docx attachments. Care / self-managed / undecided variants.

**Critical path?** Yes (the launch email links it).

**Honest time estimate:** 2 hours.

**Depends on:** S7.

## Pre-flight checklist

**Share:** plain-text export of both handover docx files, the existing client-facing guides (`guides/website-handover.html` is a strong source), playbook handover routing notes.

**Decisions to confirm:**

1. **Variant selection** by `clients.plan`: `care` / `self_managed` / NULL → undecided page presenting both.
2. **`@media print`** block + print button.
3. **"Last updated"** date hardcoded in the template.
4. **Faithful copy** from the docx — convert format only.

## Deliverables

- Handover render (3 variants) in `api/portal.js` at `/c/:slug/handover/`, branded + print-friendly.

## Definition of done

- [ ] Renders the correct variant per `plan` (and the undecided page for NULL).
- [ ] Print preview is clean black-on-white with the brand header.
- [ ] All docx content faithfully reproduced; all links work; mobile-clean.

## Recovery / rollback

- docx is source of truth; re-convert if content drifts.

-----

<a id="mini-qa-b"></a>

# Mini-QA: Phase B

**Goal:** Walk one test client `acknowledged → live` by hand-driving stages from the dashboard, verifying portal render + emails + Gmail threading at each step.

**Honest time estimate:** 1 hour.

Test the happy path (J1), the revisions path, the kind close, and both handover variants. **Definition of done:** all flows pass; no 500s; all emails in one Gmail thread; severity-1 defects fixed before Phase C.

-----

<a id="session-10"></a>

# Session 10 — Stripe webhook

**Goal:** Payment confirmed → `clients` updates → Convergence-5 sent. Plus care-plan subscription events.

**Critical path?** Yes.

**Honest time estimate:** 3 hours.

**Depends on:** S1, S3, S8.

## Pre-flight checklist

**Share:** playbook Convergence-5 (3 variants), `api/_lib/email.js`, `api/_lib/d1.js`.

**Decisions to confirm:**

1. **`api/stripe-webhook.js`** (Vercel function), signature-verified. Two Stripe Payment Links: £49.99 build fee (one-off), £9.99/mo care plan (subscription).
2. **Link payment to client** via `client_reference_id={slug}` on the Payment Link URL.
3. **Events:** `checkout.session.completed` → `payment_status='paid'`, stage → `preparing_live`, pick Convergence-5 domain variant from `clients.domain_status`, send. `invoice.payment_succeeded` → `last_payment_at`, `plan='care'`, no client email. `invoice.payment_failed` → alert you, no state change. `customer.subscription.deleted` → `plan=NULL`, kind email.
4. **Idempotency:** a `stripe_events` table recording processed `event_id`s.

## Deliverables

- `api/stripe-webhook.js` + signature verification + handlers.
- Convergence-5 (3 variants) in `templates.js`.
- Stripe Payment Links created; portal `awaiting_payment` button uses the real link with `client_reference_id`; `care_active` "Manage billing" → Stripe Customer Portal.

## Definition of done

- [ ] A real test-mode payment drives a client to `preparing_live` + sends the correct Convergence-5 variant.
- [ ] `payment_failed` alerts you; `subscription.deleted` handled.
- [ ] Replayed event isn't processed twice.

## Recovery / rollback

- Stripe retries failed webhooks for days — fix the handler and events catch up. Never disable signature verification.

-----

<a id="session-11"></a>

# Session 11 — Nudge cron

**Goal:** A daily Vercel Cron that sends nudges per the playbook schedule, respecting "no more than one per 3 working days," including the 21-day auto-close.

**Critical path?** Yes.

**Honest time estimate:** 3–4 hours. May span two sittings.

**Why Opus:** off-by-one here spams clients; the auto-close is destructive.

**Depends on:** S1, S3, S8.

## Pre-flight checklist

**Share:** playbook "The nudge schedule" (full) + Nudge-1..6 + Post-5/Post-6 templates.

**Decisions to confirm:**

1. **Vercel Cron** in `vercel.json` (e.g. `0 9 * * 1-5`) hitting `api/cron-nudge.js`. Guard with a secret header/`CRON_SECRET` so it can't be triggered publicly.
2. **Bank holidays not handled** in v1.
3. **Working-day arithmetic** in JS: `isWorkingDay`, `workingDaysBetween`, `addWorkingDays` over parsed ISO strings.
4. **Dry-run mode** via env var: compute + email you a digest instead of sending. Run dry-run for 2 weeks.
5. **Cooldown:** check most recent nudge in `email_log`; skip if < 3 working days.
6. **Send-then-update** for auto-close (network send first; on success update stage) so a client is never marked `dropped_out` without notification.

## Deliverables

- `api/cron-nudge.js` + `api/_lib/working-days.js` + a pure `decideNudge(client, recentNudges, today)` function (easily unit-tested).
- Nudge-1..6, Post-5, Post-6 templates.
- A dashboard "nudge preview" view (reuse the Clients tab) showing what the next run would do.

## Definition of done

- [ ] Unit tests cover all nudge scenarios from the playbook.
- [ ] Dry-run digest accurately describes intended sends.
- [ ] Backdated test clients (4/8/14/21 days) each get the expected nudge; no double-sends across two runs.
- [ ] 21-day auto-close sends the email **and** sets `dropped_out`.
- [ ] Post-5/Post-6 fire once per client, not every run.

## Recovery / rollback

- Flip dry-run on instantly (env var) if a nudge misfires. Revert a wrong auto-close by hand and apologise by email.

-----

<a id="session-12"></a>

# Session 12 — OneTimeSecret (defer)

**Goal:** Generate OTS links for self-managed handover credentials from a dashboard action.

**Critical path?** Defer-if-needed — 3 OTS creates by hand = ~5 min/client until volume justifies automating.

**Honest time estimate:** 1.5 hours.

**Depends on:** S3, S5.

## Pre-flight checklist

**Share:** OTS API docs, playbook Post-3 self-managed template.

**Decisions to confirm:** free tier, no auth; TTL 604800 (7 days); passwords pasted into a dashboard form, never stored except as OTS URLs in a transient `handover_secrets` table.

## Deliverables

- `api/_lib/onetimesecret.js` — `createSecret(password, ttl)` → URL.
- Dashboard action `client_generate_handover_secrets` (gated by `DASHBOARD_SECRET`): 3 password fields → 3 OTS URLs → render + send Post-3 self-managed.
- Post-3 self-managed template.

## Definition of done

- [ ] Form submits 3 passwords → Post-3 email arrives with 3 working one-view OTS links.
- [ ] Regenerate works after a lapsed window.

## Recovery / rollback

- OTS down → paste into the OTS web UI by hand; same email.

-----

<a id="session-13"></a>

# Session 13 — Full end-to-end QA

**Goal:** Walk every journey end-to-end, find defects, fix the critical ones.

**Critical path?** Yes. No real prospects until this passes.

**Honest time estimate:** 3–4 hours.

**Depends on:** all prior.

For each of J1–J5 (using `+test1..+test5` Gmail aliases): submit → verify client row → acknowledgement in 60 s → portal renders → drive stages from the dashboard → preview-ready email → feedback flow + Convergence-1 → revisions → Love it + Convergence-3 → Stripe test pay + Convergence-5 → mark live + Post-1 → reply care/self-managed + Post-3 (+ OTS for one). Plus nudge worker testing with backdated clients and one real (non-dry-run) run.

**Definition of done:** all 5 journeys complete; all emails render with no broken placeholders and thread correctly; Stripe verified; nudge dry-run correct; zero severity-1 defects outstanding; you'd be happy for a real client to walk this today.

-----

<a id="session-14"></a>

# Session 14 — First-5-prospects playbook

**Goal:** A short operating manual at `docs/first-5-prospects.md` for handling the first 5 real clients with extra human touches, a watch list, decision points to pause at, and the prompt prep for the post-5 template revision. Plus a tracking sheet and a calendar reminder for the post-5 review.

**Critical path?** Yes. The first 5 are when you learn what the templates actually feel like.

**Honest time estimate:** 1 hour.

(Content structure unchanged from the prior plan — it was good and is journey-agnostic.)

-----

<a id="open-questions"></a>

# Open questions / things to watch

1. **Email identity — RESOLVED (was the biggest unknown).** Send onboarding email as `nick@neobookworm.uk` via Google Workspace SMTP (`smtp.gmail.com`). DNS confirms full SPF/DKIM/DMARC alignment for Google; iCloud can't be used as nick@. Only build-time step left: generate a Google app password (Nick has confirmed mailbox access). Do not reuse the contact form's iCloud transport.
2. **Notion-referencing skills.** `neobookworm-campaign-setup`, `-prospect-runner`, `-site-brief` mention Notion. They read `notion_id` as an opaque ID (still fine post-retirement) but any that *write* to Notion need a separate cleanup pass. Out of scope here — flagged so it isn't forgotten.
3. **`prospects.notion_id` as PK.** Retiring Notion leaves `notion_id` as the primary key of the cold table. It's a stable unique string — keep it; renaming the PK isn't worth the churn.
4. **Vestigial Notion columns** (`landing_enquiries.notion_*`, `intake_submissions.notion_page_id`) — stop writing them in S0; drop them in a later housekeeping migration, not now.
5. **Cold-prospect promotion UX.** When you promote a cold `prospects` row, you choose the journey by hand (the form-derived signal doesn't exist for them). Make sure the dashboard promote dialog asks for it.
6. **Single renderer discipline.** The dashboard must *link/iframe* the live portal, never re-implement the client view, or the two will drift. Enforce this in S5 review.
7. **Outbox stays cold-only.** Onboarding's transactional path is deliberately separate. Don't let the two send mechanisms blur.

-----

<a id="after"></a>

# After Session 14: ongoing operation

- **First 5 prospects:** follow the operating manual; be present beyond what the system requires; write everything down.
- **Post-5 review (Opus, ~2 h):** revise cold/wrong templates, adjust stage transitions where friction is consistent, update timing promises.
- **Deliberately deferred** until you feel the pain: deliverability/bounce monitoring, reactivation flow for returning drop-outs, care-plan churn analytics, refer-a-friend, SMS fallback, full bank-holiday calendar, A/B testing.
- **Maintenance rhythm:** weekly (stuck clients in the dashboard), monthly (`email_log` failed sends), quarterly (which templates trigger replies), annually (does the playbook still match how you work?).

-----

*End of build plan v2 (brownfield rewrite).*
