# NeoBookworm — Onboarding Build Plan v1

How to take the [Onboarding Playbook](./neobookworm-onboarding-playbook.md) from document to working system, broken into 12 focused sessions.

**Saved at:** NeoBookworm.uk/docs (alongside the playbook)

---

## How to use this plan

Each session is designed to be:
- **Independently completable** in 60–90 minutes of focused work
- **Self-contained enough** that you don't need to remember the previous session's exact code
- **Cursor-prompt-ready** — each session has a draft prompt that you'll flesh out with actual file context before pasting

The plan is sequenced by dependency, not priority. You can't skip ahead easily — each session unlocks the next. But within a session, you can pause and resume.

### Before each Cursor session

The Cursor prompts below are **scaffolds, not finished prompts**. Before pasting any of them into Cursor:

1. Open the relevant Claude.ai session (model recommended per session below)
2. Paste the scaffold
3. Add the actual file context Cursor will need (existing code patterns, current schema, related files)
4. Ask Claude to flesh out the `{{FILL IN}}` placeholders and tighten the prompt
5. Only then paste the finished prompt into Cursor

This pre-flight catches structural flaws cheaply. Cursor faithfully executes whatever you give it — including the bad ideas.

### Model choice per session

- **Opus** — architecture and structural decisions where being wrong is expensive
- **Sonnet** — code generation, prompt refinement, iterative build work (default)
- **Haiku** — quick checks, consistency sweeps, low-stakes lookups

---

## Session map at a glance

| # | Session | Depends on | Est. time | Model for prep |
|---|---|---|---|---|
| 1 | D1 schema design and migration | — | 60 min | **Opus** |
| 2 | Email template storage strategy | 1 | 45 min | **Opus** |
| 3 | Intake Worker (form submissions + acknowledgements) | 1, 2 | 90 min | Sonnet |
| 4 | Landing page form hookups | 3 | 60 min | Sonnet |
| 5 | Portal Worker (read-only first) | 1 | 90 min | Sonnet |
| 6 | Portal action buttons (write-back) | 5 | 60 min | Sonnet |
| 7 | Stripe webhook integration | 1, 3 | 75 min | Sonnet |
| 8 | OneTimeSecret integration | 3 | 45 min | Sonnet |
| 9 | Handover doc HTML variants | 5 | 75 min | Sonnet |
| 10 | Nudge Worker (cron-triggered) | 1, 3 | 75 min | **Opus** |
| 11 | Internal admin view | 5 | 60 min | Sonnet |
| 12 | End-to-end QA across all journeys | All | 90 min | Sonnet |

**Total build time:** ~13 hours across 12 sessions. Realistically spread over 3–4 weeks at a comfortable pace.

---

## Sequencing — what to build in what order

Three phases:

### Phase A: Foundation (sessions 1–4)
Get the data layer and first email flowing end-to-end. By the end of this phase, a prospect can submit a form on a landing page, land in D1, and receive an acknowledgement email. **The minimum viable onboarding system.**

You can run prospects through this manually-augmented for as long as you want before adding the rest. Sessions 5–12 are upgrades, not blockers.

### Phase B: The portal experience (sessions 5–6, 9)
Add the per-prospect portal page, action buttons, and the handover doc. By the end of this phase, prospects get the full visible experience — the bit that makes it feel world-class.

### Phase C: Automation polish (sessions 7, 8, 10, 11, 12)
Stripe integration, OneTimeSecret, the nudge worker, the admin view, and end-to-end testing. The bits that mean you don't have to do it all by hand any more.

**Strong recommendation:** Don't try to do Phase C before you've run 3–5 real prospects through Phase A+B manually. You'll discover things to change in the templates and stages before you've automated them.

---

# Session 1 — D1 schema design and migration

**Goal:** Production-ready D1 schema covering prospects, email log, and any supporting tables, with migration scripts to deploy and roll back.

**Why Opus for prep:** This is the foundational decision the next 11 sessions all depend on. A schema change in week 3 is painful; a schema change in week 1 is free. Spend the Opus tokens here.

**Deliverables:**
- `migrations/0001_create_prospects.sql`
- `migrations/0002_create_email_log.sql`
- `migrations/0003_indexes.sql` (covering the queries the nudge worker and portal need)
- Rollback scripts for each
- A short README at `migrations/README.md` explaining how to apply and roll back
- The schema documented in the project's main docs (probably an update to CLAUDE.md or a new doc)

**Pre-flight thinking (do this in Claude.ai before Cursor):**

The playbook lists 12 stages. Are they all needed at v1, or are some only relevant later (e.g. `care_active` doesn't apply until first paying client)? Should journey + entry source be one column or two? Do you want `created_at` and `updated_at` to be unix timestamps or ISO strings? (Workers + D1 lean towards integer unix timestamps — simpler arithmetic for the nudge worker.) What's the slug generation strategy — random suffix on business name, or pure random?

**Cursor prompt scaffold:**

```
I'm building the D1 schema for NeoBookworm's onboarding system.
Context: this is a Cloudflare Worker project, D1 is the database,
prospects flow through a defined set of journeys and stages.

The full design is in {{PASTE: relevant sections of playbook —
Conventions, the five journeys table, stage list, email_log
schema sketch}}.

Existing D1 setup in this repo: {{FILL IN: wrangler.toml D1 binding,
any existing schema files, any existing migration tooling}}.

Tasks:
1. Create migration files in migrations/ following the
   incrementing-number convention
2. The prospects table needs: {{FILL IN per pre-flight decisions}}
3. The email_log table tracks every send — see playbook section
   "Implementation notes / D1 schema"
4. Add indexes for the queries the nudge worker will run:
   - "all prospects in stage X where stage_changed_at > N days ago"
   - "last nudge sent for prospect P"
   - "all prospects by stage"
5. Provide rollback scripts for each migration
6. Update CLAUDE.md with a "D1 schema" section explaining the model

Don't deploy. Just produce the files and explain what each migration
does. I'll apply them manually after review.
```

---

# Session 2 — Email template storage strategy

**Goal:** Decide and implement how email templates are stored, retrieved, and rendered. This is the architecture decision that determines whether changing email copy in six months is a 30-second job or a redeploy.

**Why Opus for prep:** Two reasonable approaches (templates as code constants vs templates in D1 vs templates as files in R2), each with real tradeoffs. Picking wrong creates friction every time you tweak copy.

**Deliverables:**
- A decision document (one page) on the chosen approach, with reasoning
- The template rendering library (a small TS module that takes a template ID + variables and returns subject + body)
- The first template implemented and tested: J1-E1 acknowledgement
- A test harness so you can render any template without sending it

**Pre-flight thinking:**

Three options:
- **Code constants** — fastest to write, requires redeploy for any change. Fine if you barely change copy.
- **D1 table** — change via SQL, no redeploy. Adds a query per send. Risk: templates and code can drift.
- **R2 markdown files** — version-controlled via a separate process. Most flexible, most overhead.

My instinct: **code constants for v1**, with an escape hatch (the renderer takes an optional D1 override per template ID). When you need to change copy mid-cycle, you insert a D1 row and the renderer picks it up; otherwise the constant is used. Simple, escapable, no premature optimisation.

Variable interpolation: standard `{name}` style with a strict allowlist — unknown variables throw rather than silently rendering as literal `{wrong_var}`.

**Cursor prompt scaffold:**

```
I'm building the email template system for NeoBookworm's onboarding
Workers. Decision: {{PASTE OUTCOME OF PRE-FLIGHT}}.

The full set of templates is in {{REFERENCE: playbook sections J1
through Ongoing-3 plus all Nudge templates}}.

Existing email-sending code: {{FILL IN: existing Nodemailer setup
from contact.html backend, any TS types, Worker structure}}.

Tasks:
1. Create src/templates/index.ts exporting a function:
   renderTemplate(id: string, vars: Record<string, string>):
     { subject: string; body: string }
2. Use a strict variable allowlist — throw on unknown vars
3. Implement the J1-E1 template as the first one, exactly as
   per the playbook (copy verbatim, with placeholders)
4. {{IF D1 OVERRIDE OPTION CHOSEN}}: also check D1 for an override
   row keyed by template ID before falling back to the constant
5. Provide a test harness: a small CLI or test file that renders
   any template with example vars and prints the result
6. Don't implement all 30 templates yet — that's session 3's
   problem during the intake worker build

Don't wire up to email sending yet. Just the rendering layer.
```

---

# Session 3 — Intake Worker

**Goal:** A single Cloudflare Worker that receives form submissions from any of the 11 entry points, writes to D1, generates a slug, and sends the appropriate acknowledgement email.

**Deliverables:**
- `workers/intake/` (or similar) with the full Worker code
- Routes: `/intake/preview`, `/intake/review`, `/intake/switch`, `/intake/full`, `/intake/quick`, `/intake/koalendar-webhook`
- Slug generation logic
- D1 writes for each entry
- Email send for each entry (J1-E1, J2-E1, J3-E1, J4-E1, J5-E1 variants)
- All templates from the playbook implemented in `src/templates/`
- `wrangler.toml` updated with the new Worker
- Internal "new prospect" notification email to you on every submission

**Pre-flight thinking:**

What's the slug strategy? `hartley-plumbing-3f9k2` is the example in the playbook — business name slugified + 5-char random suffix. Need to handle empty business names (some quick-message form submissions might omit it).

What's the email send mechanism inside a Worker? Gmail SMTP via Nodemailer doesn't run in Workers (no Node runtime). Options:
- **MailChannels** — free for Cloudflare Workers, works via SMTP API
- **A separate SMTP relay** — overkill
- **A small companion Node service on a VPS** that the Worker POSTs to — too much infrastructure

MailChannels is the obvious answer. Set up domain verification, then `fetch('https://api.mailchannels.net/tx/v1/send', ...)` from the Worker. Free, sender is `nick@neobookworm.uk`, threading via subject line just works.

What if a submission fails (D1 down, MailChannels down)? Workers can't easily retry async. Best pattern: write to D1 first, then attempt send; if send fails, log to a `failed_sends` D1 table and you process those manually. Don't make the user wait for the email — return 200 to the form once the D1 write succeeds.

**Cursor prompt scaffold:**

```
I'm building the intake Worker for NeoBookworm's onboarding.

Schema is already in place from session 1: {{REFERENCE: prospects
and email_log tables}}.
Template rendering is in place from session 2:
{{REFERENCE: renderTemplate function}}.

This Worker accepts form submissions from 11 entry points, all
detailed in {{REFERENCE: playbook section "The five journeys"}}.

Existing Worker patterns in this repo: {{FILL IN: example Worker
code, wrangler.toml structure, how D1 is bound}}.

Tasks:
1. Create workers/intake/src/index.ts with a fetch handler
   routing on URL path
2. Routes and their handlers:
   - POST /intake/preview → J1 entry handler
   - POST /intake/review → J2 entry handler
   - POST /intake/switch → J3 entry handler
   - POST /intake/full → J4 entry handler
   - POST /intake/quick → J5 quick-message handler
   - POST /intake/koalendar-webhook → J5 Koalendar handler
3. Each handler:
   a. Validates the payload (zod or similar)
   b. Generates a slug
   c. Writes a row to prospects with stage='acknowledged'
   d. Sends the appropriate acknowledgement email via MailChannels
   e. Logs to email_log
   f. Sends an internal notification to nick@neobookworm.uk
   g. Returns JSON: { ok: true, portal_url, slug }
4. Implement all five acknowledgement templates (J1-E1 through J5-E1)
   plus the Koalendar booking variant
5. Failure handling: if email send fails, write to failed_sends but
   still return 200 — the prospect's row exists, email can be
   retried by hand
6. CORS for cross-origin form posts from neobookworm.uk

Don't implement the personal "I'm human" emails (those are manual).
Don't implement nudge logic (that's session 10).
```

---

# Session 4 — Landing page form hookups

**Goal:** Update the four trade landing pages (plumbers.html, electricians.html, plumbers-switch.html, electricians-switch.html) and the main contact page to POST to the new intake Worker endpoints. Replace whatever they currently submit to.

**Deliverables:**
- Updated `<form>` action URLs on all four landing pages
- Updated JS handling success and error states
- A polished "what happens next" success state (currently most show a generic thank-you — upgrade to mention the portal link)
- Same on `contact.html` for the quick message form
- Same on intake-form.html — though this one may already work with the existing Vercel intake API and only needs the success state updating to reference the portal
- Updated timing copy on the landing pages per the playbook recommendations (2 working days for review, 7 for preview, etc.) — do this here while you're touching the pages

**Pre-flight thinking:**

The existing intake-form.html has a complex direct-to-R2 upload flow for photos. Do you want J4 prospects to still upload photos via the existing R2 pipeline, with the intake Worker just receiving the metadata + file URLs? Or do you want to consolidate everything through the new intake Worker?

My instinct: **keep the existing R2 photo upload flow.** It works, it handles the 4.5MB Vercel limit elegantly, and there's no benefit to rebuilding it. The intake Worker receives the photo URLs as part of the J4 payload after upload is complete. Treat the existing intake-finalize endpoint as the "feeder" into the new intake Worker for J4 specifically.

Timing copy: this is the moment to fix the four landing pages' aspirational timings. Do all four in this session while you're already in the files.

**Cursor prompt scaffold:**

```
I'm hooking up the existing landing-page forms to the new intake
Worker (session 3).

The pages to update: {{LIST: plumbers.html, electricians.html,
plumbers-switch.html, electricians-switch.html, contact.html}}.

Worker endpoints from session 3:
{{REFERENCE: the 6 POST routes}}.

Tasks per page:
1. Update the form action URL and/or fetch() call to hit the
   correct intake Worker endpoint based on start_option:
   - leave_it_with_me / tell_more → /intake/preview
   - review_site_first → /intake/review
   - ready_to_switch → /intake/switch
   - intake_form → /intake/full (or stays with the existing
     Vercel pipeline — see note below)
   - quick message form on contact.html → /intake/quick
2. On success, show a polished "what happens next" state:
   - Acknowledge by first name
   - Mention the email about to arrive
   - Show the portal_url returned by the Worker as a tappable button
   - Reassuring tone matching the rest of the brand
3. Update the timing copy on each page:
   - "1 working day" review → "within 2 working days"
   - "5 working days" preview → "within 7 working days"
   - "within a day" care plan changes (FAQ) → "within a couple of
     working days"
4. Don't change the existing intake-form.html photo upload flow —
   it works. After photos finish uploading, POST the metadata to
   /intake/full so the new Worker creates the prospect row.

QA after: submit each form variant from each page, confirm the
right Worker endpoint is hit and the right email goes out.
```

---

# Session 5 — Portal Worker (read-only)

**Goal:** A Cloudflare Worker that serves the per-prospect portal page at `/c/{slug}/`. Read-only first — no buttons that change state. That's session 6.

**Deliverables:**
- `workers/portal/` Worker code
- A single fetch handler for `GET /c/:slug/`
- Reads D1 for the prospect
- Renders branded HTML matching NeoBookworm's design system (navy / amber / Playfair / DM Sans)
- All stage-specific copy from the playbook section "The portal — stage-by-stage copy"
- The progress strip showing journey stages
- "Useful links" appropriate to current stage
- "Conversation history" from email_log
- 404 handling for unknown slugs (kind, branded — not bare HTTP 404)
- Mobile-first responsive design
- Routing config in wrangler.toml or Cloudflare dashboard to serve `neobookworm.uk/c/*` from this Worker

**Pre-flight thinking:**

The portal needs to look like NeoBookworm, not like a third-party tool. The fonts, colours, and overall feel should be indistinguishable from the main marketing site. Easiest way: inline the same CSS variables and self-hosted font definitions as the main site. The Worker generates a complete HTML document; no shared CSS file across origins.

Mobile-first is critical — tradespeople will view this on their phone in a van between jobs. Test the rendered HTML at 375px width before doing anything else.

How does the portal know which template variant to use for the "active panel"? Read the `stage` column and switch. Keep the switch statement simple and exhaustive — every defined stage has a case, unknown stages render a generic "Working on it" panel as fallback.

What about the J2 review page (`/c/{slug}/review/`) and the handover page (`/c/{slug}/handover/`)? Those are extra routes within the same Worker. Plan for them in the routing structure now, even if the bodies come in later sessions (9 for handover; the review page is small enough to add here).

**Cursor prompt scaffold:**

```
I'm building the portal Worker for NeoBookworm.

It serves a per-prospect status page at neobookworm.uk/c/{slug}/
showing where they are in the journey, useful links, and email history.

Full design and stage-by-stage copy in {{REFERENCE: playbook section
"The portal"}}.

Brand reference: {{FILL IN: link to or content of CLAUDE.md design
system section — colours, fonts, tone, the self-hosted font files
already in the repo}}.

Schema: prospects and email_log tables from session 1.

Tasks:
1. Create workers/portal/src/index.ts with routes:
   - GET /c/:slug/ → main portal page
   - GET /c/:slug/review/ → J2 review page (use placeholder content
     for now if the review system isn't fully spec'd)
   - GET /c/:slug/handover/ → returns "coming soon" for now
     (session 9 builds this)
   - GET /c/:slug/google-business/ → returns the existing
     local-search-guide.html content, lightly adapted
2. Main portal page must include:
   a. Header with NeoBookworm logo (small) and "Hi {name} from
      {business}"
   b. Progress strip with 6 stages, current highlighted in amber
   c. Active panel — switch on stage, render copy per the playbook
   d. Useful links section, 2–4 stage-appropriate links
   e. Conversation history — list email_log rows for this prospect,
      humanised ("Acknowledgement — sent 3 days ago")
   f. Footer with contact email
3. Mobile-first responsive (375px → 768px → 1024px breakpoints)
4. Self-host the two fonts inline (woff2 base64 or via fetch from
   neobookworm.uk/fonts/)
5. 404 for unknown slugs renders a friendly branded page, not a
   bare 404
6. NO action buttons that change state — read-only this session.
   Buttons that link OUT (mailto, external guide links) are fine.
   Buttons that POST back to update D1 come in session 6.

Test by hand: insert a few prospect rows in different stages,
visit the URLs, check the rendering on mobile and desktop.
```

---

# Session 6 — Portal action buttons

**Goal:** Add the buttons that POST back to the Worker and change D1 state. These are what move prospects through the journey.

**Deliverables:**
- The three big buttons on `preview_ready` stage: "Love it", "A few changes please" (opens structured form), "Not for me"
- The structured feedback form for changes
- The "Pay £199" button on `awaiting_payment` (links to Stripe Checkout — webhook handling is session 7)
- The "Send work photos" upload form on `researching` / `building` (uses existing R2 pattern)
- New POST routes in the portal Worker: `/c/:slug/decision`, `/c/:slug/feedback`
- D1 stage transitions triggered correctly
- Convergence-1 (revisions requested), Convergence-3 (love it), Convergence-4 (kind close) emails sent on the relevant transitions
- All template implementations for these

**Pre-flight thinking:**

The decision buttons trigger emails. So the portal Worker now needs to call the email sending function. Cleanest: extract the email send + log code from the intake Worker into a shared module both Workers can import. Or simpler: duplicate it. For v1, duplicate is fine — abstraction has a cost.

CSRF? Technically the slug acts as a weak shared secret. Adding a CSRF token adds friction without much real security benefit at this stage — anyone who knows the slug can already submit feedback as that prospect. Accept the risk for v1. If you ever see abuse, add a rate limit.

The "few changes" form structure is in the playbook. Make sure the structured checkbox data is stored in D1 (a new `feedback` table?) so the conversation history can show "Requested changes: wrong photos, wrong area" not just "Changes requested."

**Cursor prompt scaffold:**

```
I'm adding interactive buttons to the portal Worker built in session 5.

Existing portal: {{REFERENCE: workers/portal from session 5}}.
Email send module: {{REFERENCE: how session 3 sends emails — either
extract to shared/ or duplicate}}.

Specs in playbook sections:
- "preview_ready" stage portal copy (the three buttons)
- Convergence-1, -3, -4 email templates
- "few changes" structured feedback form structure

Tasks:
1. Add POST routes:
   - POST /c/:slug/decision  body: { choice: 'love' | 'changes' | 'no' }
   - POST /c/:slug/feedback   body: { categories: string[], note?: string }
   - POST /c/:slug/photos     (uses existing R2 upload pattern)
2. On 'love' decision:
   - Update D1: stage → awaiting_payment, stage_changed_at = now
   - Send Convergence-3 email (note: domain variants — for now,
     send Variant C with a TODO comment; session 7 enhances this)
   - Log to email_log
3. On 'changes' decision: client should have already submitted
   feedback via the form; the decision and feedback POSTs are
   separate. Update D1: stage → revisions, set next_action_by to
   +2 working days. Send Convergence-1.
4. On 'no' decision: stage → dropped_out. Send Convergence-4.
5. Create feedback table in D1 if needed (migration in this session):
   id, prospect_id, categories (JSON array as text), note,
   submitted_at
6. Update portal page to render the three buttons on preview_ready
   stage. Use a small inline JS to handle clicks (avoid full page
   reloads) and show success state.
7. The "few changes" button opens a modal/inline form with the
   structured checkboxes. Submit posts to /feedback first, then
   /decision with choice='changes'.

Test all three paths end-to-end. Verify D1 state updates and emails
land in your inbox.
```

---

# Session 7 — Stripe webhook integration

**Goal:** Payment received → D1 stage updates → Convergence-5 email sent. Also handles ongoing care plan subscription events (charge succeeded, charge failed, subscription cancelled).

**Deliverables:**
- A new route on the intake Worker (or a separate Worker — see pre-flight): `POST /webhooks/stripe`
- Stripe webhook signature verification
- Handlers for: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`
- D1 updates per event
- Convergence-5 email send on successful payment
- Domain variant logic for Convergence-5 (based on what's known in D1)
- Stripe Customer Portal link integration

**Pre-flight thinking:**

You'll need two Stripe products:
- A one-off £199 product (the build fee)
- A £9.99/month subscription product (the care plan)

The portal "Pay £199" button creates a Stripe Checkout session for the one-off. The care plan signup happens later — either after launch via a separate "subscribe to care plan" link in Post-3, or bundled into the Stripe Checkout at the same time as the £199.

My recommendation: **keep them separate.** Per the Convergence-3 email, the care plan question is explicitly deferred to after launch. Forcing the decision at payment muddles the experience. The £199 Checkout is for the build; the care plan is offered separately in Post-3 with its own Stripe Payment Link.

Webhook security: Stripe signs webhooks. Workers can verify using Web Crypto API. Don't skip this — without verification, anyone can POST to your webhook and trigger emails / state changes.

Should this be its own Worker or part of intake? Webhooks are an unusual shape (one Stripe → many possible D1 state changes), and they have different security needs. Slight preference for a separate `webhooks` Worker that handles Stripe today and other webhooks later (Koalendar already has one, MailChannels might have bounce webhooks). But intake Worker is fine too.

**Cursor prompt scaffold:**

```
I'm adding Stripe webhook handling for NeoBookworm.

Stripe products to create in dashboard before this session:
- One-off £199 build fee (product ID: {{FILL IN AFTER CREATION}})
- £9.99/month care plan subscription (product ID: {{FILL IN}})

Webhook endpoint will receive: checkout.session.completed,
invoice.payment_succeeded, invoice.payment_failed,
customer.subscription.deleted.

Existing Worker structure: {{REFERENCE}}.
Email module: {{REFERENCE}}.
D1 schema: {{REFERENCE: prospects table including payment_status,
plan fields}}.

Tasks:
1. Decide: extend intake Worker with /webhooks/stripe route, OR
   create new workers/webhooks/ Worker. {{PASTE DECISION}}.
2. Add Stripe webhook signature verification using Web Crypto API.
   Reject any request with an invalid signature.
3. Handle checkout.session.completed:
   - Look up prospect by metadata.prospect_id (we'll pass this
     when creating the Checkout session)
   - Update prospects: payment_status='paid', stage='preparing_live'
   - Send Convergence-5 email — with the correct domain variant
     based on prospects.domain_status or whatever the D1 field is
4. Handle invoice.payment_succeeded for the care plan subscription:
   - Log to email_log silently (no email send — Stripe sends its
     own receipt)
   - Update last_payment_at on the prospect row
5. Handle invoice.payment_failed:
   - Personal email to you (not the client) so you can reach out
6. Handle customer.subscription.deleted:
   - Update plan to NULL, send a kind "sorry to see you go" email
7. On the portal Worker (session 6), update the "Pay £199" button
   to create a Stripe Checkout session with metadata.prospect_id
   set to the slug. Use Stripe Payment Links if simpler — they
   support metadata too.
8. Add a "Manage billing" button on the portal for care_active
   stage that opens Stripe Customer Portal.

Test with Stripe CLI: stripe listen + stripe trigger
checkout.session.completed.
```

---

# Session 8 — OneTimeSecret integration

**Goal:** Automate the generation of OneTimeSecret links for the self-managed handover email. You stop manually creating 3+ secrets per client; instead a single button triggers all of them.

**Deliverables:**
- A new portal-Worker route: `POST /c/:slug/generate-handover-secrets` (admin-only — see session 11)
- OneTimeSecret API integration
- Storage of generated secret URLs in D1 (temporarily — they expire in 7 days)
- The Post-3 self-managed email triggered with all three OTS links populated
- A confirmation page showing you which secrets were generated and when they expire

**Pre-flight thinking:**

OneTimeSecret's free public API doesn't require auth but is rate-limited. For 3 secrets per client and a few clients per week, you're nowhere near limits.

The actual passwords need to come from somewhere — your password manager. The flow: when a client goes self-managed, you create their Netlify/Cloudflare Pages, Krystal, and GitHub accounts manually (these are prohibited actions for me to do anyway), then in your admin view you paste the three passwords into a form. The Worker calls OTS, generates the three links, stores them temporarily in D1, sends Post-3.

Important: don't store the actual passwords in D1, even temporarily. Only the OTS URLs (which expire in 7 days anyway).

What if the client misses the 7-day window? The Worker also exposes a "regenerate" route. You paste the passwords again, new links go out.

**Cursor prompt scaffold:**

```
I'm adding OneTimeSecret automation to the self-managed handover flow.

OneTimeSecret API docs: https://onetimesecret.com/docs/api/secrets
Endpoint: POST https://onetimesecret.com/api/v1/share
Free, no auth required, returns { secret_key }.

The Post-3 self-managed email template is in {{REFERENCE: playbook
Post-3 self-managed variant}} — it uses {ots_hosting}, {ots_domain},
{ots_github} placeholders.

D1 fields available: prospects.hosting_provider, prospects.hosting_url,
prospects.plan.

Tasks:
1. Add POST /c/:slug/generate-handover-secrets to the portal Worker:
   - Body: { hosting_password, domain_password, github_password }
   - Validates the prospect is in stage='live' and plan='self_managed'
   - Calls OneTimeSecret 3 times with ttl=604800 (7 days)
   - Constructs the three URLs: https://onetimesecret.com/secret/{key}
   - Stores them in a transient table (handover_secrets:
     prospect_id, secret_type, url, expires_at) — these are URLs,
     not passwords
   - Renders and sends Post-3 self-managed email with all three URLs
     populated
2. Add POST /c/:slug/regenerate-handover-secrets — same as above
   but expects the client to have already failed to use the
   previous links
3. Admin view (session 11) gets the form to trigger this

Security: this route must be admin-only. For now, gate with a
simple shared-secret header check. Session 11 adds proper admin auth.

Don't store passwords in D1 anywhere. The Worker holds them only
in memory during the request, sends to OTS, discards.
```

---

# Session 9 — Handover doc HTML variants

**Goal:** Branded HTML versions of the two handover docx files, served from the portal at `/c/{slug}/handover/`. They replace the docx attachments entirely.

**Deliverables:**
- Two HTML templates: care plan and self-managed
- Branded to NeoBookworm (navy / amber / Playfair / DM Sans)
- Mobile-first responsive
- The portal Worker's `/handover/` route renders the right variant based on D1 plan field
- The "Print this page" button (so clients can keep a paper copy if they want)
- All content from the docx files faithfully converted (no content changes — just format)

**Pre-flight thinking:**

The two docx files are already in your project. Convert each to HTML preserving structure: H1s, H2s, the boxed callouts, the bulleted lists, the inline links. Use the existing self-hosted fonts.

Should the variant be selected per request from D1, or rendered at handover time and stored as a snapshot? Per request is fine — content shouldn't change after launch. If it does, the prospect sees the latest version, which is probably what you want.

The Post-1 launch email links to `/handover/`. Make sure the URL is exactly that — no trailing query strings, no fragment identifiers.

Add a small "Last updated" timestamp at the foot of each handover page so if you ever revise the content, clients can see whether they have the current version.

**Cursor prompt scaffold:**

```
I'm building the handover doc HTML versions for the portal.

Source files: {{REFERENCE: NeoBookworm-Handover-CarePlan.docx and
NeoBookworm-Handover-SelfManaged.docx — extract text via Python
or similar, paste into the prompt}}.

Brand reference: {{FILL IN}}.
Portal Worker: {{REFERENCE: session 5 Worker}}.

Tasks:
1. Convert both docx files to clean semantic HTML preserving:
   - Headings hierarchy
   - The boxed callout (the TPS registration box)
   - Bulleted lists
   - Inline links (mailto, https)
   - Bold text
2. Apply NeoBookworm branding:
   - Navy header band with logo
   - Playfair Display for H1/H2
   - DM Sans for body
   - Amber accent for callouts and links
   - Mobile-first responsive
3. Add at the foot of each:
   - "Last updated: {{ISO date}}"
   - A "Print this page" button (window.print())
   - A small link back to the main portal page
4. Update the portal Worker's GET /c/:slug/handover/ route to:
   - Read prospects.plan from D1
   - Render the care-plan HTML if plan='care', self-managed
     HTML if plan='self_managed'
   - 404 (branded) if plan is null (handover doc not relevant yet)
5. Make sure the Post-1 launch email link to /handover/ works
   for both plan types — the email goes out before the client
   picks a plan, so route to a "you haven't chosen a plan yet"
   intermediate page or render both options inline

Verify on mobile: tradespeople will read this on a phone.
```

---

# Session 10 — Nudge Worker

**Goal:** A cron-triggered Worker that runs once per working day, reads D1, and sends nudges per the playbook nudge schedule. The most architecturally subtle session — gets the rules wrong and you spam your prospects.

**Why Opus for prep:** Cron logic + state machine + "do not over-nudge" rules + working-days arithmetic. Easy to get subtly wrong. Worth the careful think.

**Deliverables:**
- `workers/nudge/` Worker
- Cron trigger configured for 10:00 UK time, working days only
- Logic: for each stage, check if any prospect is overdue for a nudge
- Hard rule enforcement: no more than one nudge per prospect per 3 working days
- Nudge templates 1–6 implemented
- Auto-close logic for the 21-day rule (preview_ready dormancy)
- A "dry run" mode that lists what it would send without sending
- An admin endpoint to inspect what's queued

**Pre-flight thinking:**

Working days arithmetic. You're in the UK. Bank holidays are a thing. Building a full holiday calendar is overkill for v1 — just check whether today's weekday is Mon-Fri. On bank holidays the nudge worker still runs but it's no big deal; better to occasionally nudge on a bank holiday than to maintain a holiday table.

Cron schedule: Cloudflare Workers cron uses UTC. UK is UTC+0 (winter) or UTC+1 (summer). Two cron entries — `0 10 * * 1-5` for GMT and `0 9 * * 1-5` for BST — covers it, with a guard at the top of the handler that bails if the local hour isn't 10.

The 3-day cooldown is critical. Read `email_log` for the most recent nudge to that prospect, check the date diff in working days, skip if < 3.

The auto-close logic (Nudge-4, day 21): when triggered, the Worker sends the soft close email AND updates the prospect to `dropped_out`. Make this a transaction or be very careful about ordering — you don't want to mark them dropped without sending the email, or send the email without marking them dropped.

Dry-run mode is essential. The first 10 runs should be dry-run only, with the output emailed to you, so you can sanity-check before the Worker actually sends anything to clients.

**Cursor prompt scaffold:**

```
I'm building the nudge Worker for NeoBookworm — the most behaviourally
sensitive Worker in the system.

Full nudge schedule and templates in {{REFERENCE: playbook section
"The nudge schedule"}}.

Cardinal rule: never more than one nudge per prospect per 3 working
days. Without this enforcement we will spam clients and lose trust.

Schema: prospects + email_log from session 1.

Tasks:
1. Create workers/nudge/src/index.ts with a scheduled() handler
   (Worker cron trigger).
2. wrangler.toml: configure two crons to cover GMT and BST:
   - 0 10 * * 1-5 (GMT mornings)
   - 0 9 * * 1-5 (BST mornings)
   Add a guard in scheduled() that checks the actual UK local
   time and bails if not within 09:30-10:30 to deduplicate.
3. Logic per run:
   a. SELECT all prospects where stage IN (preview_ready,
      awaiting_payment, live) and opt_out = 0
   b. For each, check days-since-stage_changed_at in WORKING days
      (skip weekends)
   c. Check last_nudge_sent_at — skip if < 3 working days ago
   d. Match against the nudge schedule table in the playbook
   e. If match found, render the template, send, log, update
      last_nudge_sent_at
4. The 21-day preview_ready auto-close (Nudge-4):
   a. Send the soft-close email
   b. Update stage='dropped_out'
   c. Set stage_changed_at = now
   Do these in a single D1 batch transaction.
5. Post-5 (Google Business nudge at day 14 post-live) and Post-6
   (review prompt at day 30 post-live) are run by this Worker too.
   Make sure each only runs ONCE per prospect — check email_log
   for prior sends of the same template ID.
6. Dry-run mode: env var NUDGE_DRY_RUN=1 — Worker calculates what
   it would do but instead emails the plan to you as a single
   digest. Run in dry-run for the first 2 weeks.
7. Admin endpoint: GET /admin/nudge-preview — returns JSON of
   what the next scheduled run would do.

Working-days arithmetic: write a helper workingDaysBetween(a, b)
that handles weekends. Don't worry about UK bank holidays for v1.

Test by inserting prospects with various stage_changed_at dates
and running the Worker manually via wrangler dev.
```

---

# Session 11 — Internal admin view

**Goal:** A simple admin page at `/admin/` showing all current prospects, their stages, days since last action, and quick actions. Gated by a single shared password (basic but adequate for one user).

**Deliverables:**
- `GET /admin/` on the portal Worker (or a separate admin Worker)
- Single password gate (env var, not in code)
- Table view of all prospects sortable by stage, days-since-last-action, journey
- "Days since last activity" warning highlights for prospects > 14 days stuck
- Quick action buttons: "Send personal note", "Mark preview ready", "Trigger handover secrets" (links to session 8 flow)
- A "next nudge preview" link to session 10's admin endpoint
- A simple stats panel: prospects by stage, conversion rate by journey
- Mobile-friendly (you'll check this on your phone)

**Pre-flight thinking:**

Don't over-engineer this. It's for you, one user, no concurrency concerns. A single HTML page rendered server-side, refreshed by hand, is plenty. No React, no SPA, no real-time updates. The data is in D1; you query, render, done.

Auth: a shared password in an env var, checked against a cookie or basic auth header. Cookie is friendlier. Set a session cookie on successful login, valid for 7 days. That's enough security for a single-user admin view that holds no actual secrets (passwords aren't here — they're in your password manager).

The "Send personal note" action is the most useful one. It pre-fills a Gmail compose URL with the prospect's email and the existing subject line, so you can write the personal note in 2 minutes with no copy-paste.

**Cursor prompt scaffold:**

```
I'm building the admin view for NeoBookworm — single-user dashboard
for monitoring prospects and triggering manual actions.

Portal Worker exists from session 5. Schema from session 1.

Tasks:
1. Add to portal Worker (or new admin Worker if preferred):
   - GET /admin/ → if authed, render dashboard; if not, login form
   - POST /admin/login → check password (env var), set session
     cookie, redirect to /admin/
   - POST /admin/logout
2. Dashboard renders a single page with:
   a. Stats panel at top: count by stage, conversion rate by
      journey, prospects added this week
   b. Main table of all non-dropped prospects:
      - Slug (linked to portal page)
      - Name + business
      - Journey + entry source
      - Current stage
      - Days since stage_changed_at (highlight red if > 14)
      - Days since last nudge
      - Quick action buttons
   c. Sortable columns (basic HTML sort, no JS framework)
   d. Filter dropdown: "All", "Active only", "Stuck > 7 days",
      "By journey"
3. Quick action buttons per row:
   - "Send personal note" → opens Gmail compose URL with email
     pre-filled, subject pre-filled, body empty
   - "Mark preview ready" → POSTs to internal route that updates
     stage and triggers preview-ready email (J1-E4, J3-E4, J4-E4
     based on journey)
   - "Generate handover secrets" → opens form from session 8
   - "Mark live" → updates stage to 'live', triggers Post-1
4. Mobile-friendly — you'll check this on your phone in spare moments
5. Auth: simple password gate, env var ADMIN_PASSWORD, session
   cookie valid 7 days

Don't add user management. Don't add audit logging. Don't add
permissions. One user, one password, simple.
```

---

# Session 12 — End-to-end QA

**Goal:** Run a fake prospect through every one of the five journeys, end to end, in a staging environment. Find and fix everything that breaks. Don't go live until this session passes.

**Deliverables:**
- A test harness or runbook for each of J1, J2, J3, J4, J5
- Confirmation that all 30+ emails fire in the right sequence with the right copy
- Confirmation that the portal renders correctly at every stage
- Confirmation that the nudge worker fires appropriately (use date manipulation in D1 to "fast-forward" prospects without waiting weeks)
- A short defect log with everything found and how it was fixed
- A go-live checklist

**Pre-flight thinking:**

This is the session where the cracks show. Expect to find at least a dozen issues — broken placeholders, wrong stage transitions, emails sent twice, threads broken because subject changed, mobile rendering bugs, edge cases in domain logic. That's normal. Budget time for fixes inside the QA session.

Use a real Gmail address you control (a +test alias works) so you can see the email thread as a real prospect would.

Don't skip the nudge testing. Manually update `stage_changed_at` in D1 to dates 4, 8, 14, 21 days ago and run the nudge worker. Confirm each nudge fires once and only once.

For Stripe, use test mode end-to-end. Use Stripe's test card number `4242 4242 4242 4242` to simulate a payment. Verify the webhook fires and the state transitions correctly.

**Cursor prompt scaffold:**

```
End-to-end QA across all five NeoBookworm onboarding journeys.

Goal: catch every defect before the first real prospect.

For each journey J1-J5, run through this sequence:

1. Submit the form (real form, real network, real Worker)
2. Verify D1 row created with correct fields
3. Verify acknowledgement email arrives in test inbox within 60s
4. Verify portal page renders correctly at the assigned slug
5. Verify portal looks right on mobile (375px) and desktop (1440px)
6. Manually trigger the next stage (preview ready) via admin
7. Verify preview-ready email arrives, threaded correctly
8. Verify portal updates with the three buttons
9. Click "few changes" — submit feedback form
10. Verify Convergence-1 email arrives, D1 stage updated
11. Manually mark revisions complete — verify Convergence-2 email
12. Click "love it" — verify Convergence-3, D1 stage to
    awaiting_payment
13. Pay via Stripe test mode — verify webhook fires, Convergence-5
    email arrives, stage to preparing_live
14. Manually mark stage to live — verify Post-1 email, portal
    shows live state
15. Submit "care plan" reply — verify Post-3 care plan email
16. Submit "self-managed" reply (alt run) — verify handover secrets
    flow, Post-3 self-managed email with 3 OTS links

Then test nudge worker:
- Insert test prospects with stage_changed_at backdated 4, 8, 14,
  21 days
- Run nudge worker manually
- Verify each gets the right nudge, no over-sending

Document every defect found. Don't fix in QA session — log them,
fix in a follow-up pass, then re-run that journey.

Go-live checklist:
[ ] All 5 journeys pass end-to-end
[ ] All 30 emails render correctly with no broken placeholders
[ ] Mobile renders cleanly for all portal stages
[ ] Stripe webhook signature verified
[ ] OneTimeSecret links generate and expire correctly
[ ] Nudge worker dry-run shows expected output
[ ] Admin view functional
[ ] Failed-send queue exists and is monitored
[ ] D1 backup strategy in place
```

---

# After session 12

You're live. The first prospect arrives.

**For the first 5 prospects:**

Even with the system built, **deliberately run prospects 1–5 with extra human touch.** Don't let the automation be the only contact — that's how you find out the templates feel cold even though they tested fine.

After every prospect makes it to "live" or "dropped_out", write down:
- Which emails felt right
- Which felt off (and why)
- What the portal stages got wrong
- What you wished was different

After 5 prospects, do a v2 pass on the templates and stages. Then trust the automation more.

**Long-term: what's not in this plan but might be needed later**

- **Email deliverability monitoring** — bounce/complaint webhooks from MailChannels, written back to D1, surfaced in admin
- **A "reactivation" flow** for dropped_out prospects who come back after 90+ days
- **Care plan churn analytics** — why people cancel, when, at what stage of their relationship
- **A "refer a friend" mechanic** — only when you have 10+ happy clients to make it credible
- **SMS / WhatsApp fallback** for prospects who go silent on email — adds vendor cost
- **A proper holiday calendar** for the nudge worker — only matters once you have 50+ active prospects

None of these are needed at v1. Flag them when you actually feel the pain.

---

*End of build plan.*
