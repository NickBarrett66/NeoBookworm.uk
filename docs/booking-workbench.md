# HE Tyres — Booking Workbench (Emma & Howie's day view)

**Purpose:** Give Emma and Howie a single page — the **workbench** — where they
see upcoming bookings and track the preparation each one needs (check stock,
order tyres, mark ready). It is the operational surface Google Calendar can't
be: Calendar answers *"what's on today"*; the workbench answers *"are we ready
for it"*. It also becomes the natural home for pending mobile requests, so
confirm/decline stops living only in Howie's inbox.

This document is written in the same session-and-gate style as
[booking-widget-build.md](booking-widget-build.md) and
[booking-mobile-integration.md](booking-mobile-integration.md). Read the
Context box at the top of a session before starting it, and do not proceed
past a Gate until every criterion passes.

> **Do not start building until you have read
> [booking-widget-build.md](booking-widget-build.md) in full and the M1/M2
> sections of [booking-mobile-integration.md](booking-mobile-integration.md).**
> This document assumes Sessions M1 and M2 are live in production (unified
> chooser, `pending` mobile bookings with `confirm_token`, the
> `GET /:slug/confirm/:token` flow). Sessions M3 and M4 are **not**
> prerequisites — see "Relationship to M3 and M4" below.

---

## Decisions already made (do not re-litigate)

Agreed with Nick before this document was written.

| Decision | Choice | Consequence |
|---|---|---|
| Scope discipline | **Only what Google Calendar can't do** | The workbench is a day/week list with prep state and actions. It is NOT a stock system, invoicing, a customer database/CRM, or a booking editor. If a feature idea isn't "prep state" or "an action that already exists as an email link", it's out. |
| Prep model | **One status field, not a task system** | A single `prep_status` per booking: `new → stock_checked → ordered → ready`. One tap to advance. No task lists, no assignees — it's a two-person business. |
| Notes | **One internal free-text field per booking** | `internal_note` — "205/55 R16, ordered from Stapleton's, due Thurs". Separate from the customer-facing `note`. Never shown to the customer. |
| Auth | **Per-tenant secret link, no login** | A long random token in the tenant config, used as `?key=…` on a bookmarkable URL. Same trust model as the existing manage/confirm token links. Rotatable from Nick's dashboard (it's a config write). No accounts, no passwords, no sessions. |
| Where it lives | **Booking Worker, server-rendered** | `GET /:slug/workbench` on `neobookworm-booking`, rendered like the existing manage pages (vanilla JS, no frameworks). Not a page on he-tyres/ (it must see D1 directly) and not Nick's dashboard (that's Nick's surface, not the client's). |
| Tenant-generic | **Config-gated feature, not an HE Tyres one-off** | `workbenchEnabled` flag in `schema.js`, off by default. Built once, sellable to every future £9.99/mo client. No `hetyres` string literals in workbench code paths. |
| Editing booking details | **Not allowed** | Reschedule/cancel already exist and keep D1 + Google Calendar in sync. Free-form editing of times or customer details invites drift between the two — excluded permanently, not deferred. |

### Explicitly out of scope (whole document)

Stock/inventory quantities · invoicing, payments, pricing · customer history /
CRM views · multi-user accounts, permissions, audit trails · editing booking
times or customer details outside the existing reschedule flow · SMS.

---

## Architecture overview

Nothing about the customer-facing booking flow changes. The workbench is a new
read/act surface over data that already exists.

```
GET  /:slug/workbench?key=TOKEN            ← the page (server-rendered day/week list)
GET  /:slug/workbench/data?key=TOKEN       ← JSON refresh (same auth, W1)
POST /:slug/workbench/prep                 ← advance prep_status / save internal_note (W2)
POST /:slug/workbench/confirm              ← confirm/decline pending mobile (W3, reuses handleConfirm logic)
(cancel/reschedule reuse the existing /:slug/cancel and /:slug/reschedule
 endpoints with the admin-signed key — no new mutation paths)
```

Key existing mechanisms the workbench builds on — reuse, do not duplicate:

- **`bookings` table** already holds everything W1 displays: `slot_start`,
  `name`, `email`, `phone`, `reg`, `note`, `address`, `postcode`, `type`
  (`depot`|`mobile`), `band`, `arrival_window`, `status`
  (`confirmed`|`pending`|`cancelled`), `confirm_token`, `manage_token`.
- **Admin-signed manage links** (`makeAdminKey`/`verifyAdminKey` in
  `signing.js`) already bypass the customer cancellation cutoff in
  `handleCancel`/`handleReschedule`. The workbench's cancel/amend buttons are
  those same calls.
- **`handleConfirm`** (`index.js`) already flips a pending mobile row to
  confirmed, firms the calendar event, and sends the firm confirmation email,
  idempotently. The workbench confirm button must call the same underlying
  logic so the email link and the button are behaviourally identical.
- **Email** goes booking-Worker → `neobookworm-uk` `/api/notify-booking`
  (`NOTIFY_BOOKING_SECRET` on **both** Workers) → Vercel SMTP bridge. The
  optional W3 digest uses this same path — no new email plumbing.

### Auth model (all sessions)

- `workbenchToken`: a ≥32-char random secret stored in the tenant's config
  (D1 `tenants` + KV cache, like every other config value). Generated by Nick
  from the dashboard; rotating it is an ordinary config write that busts KV.
- Every workbench route requires `key` (query param for GET, body field for
  POST) to match the tenant's `workbenchToken`. Constant-time comparison.
  Wrong/missing key → a branded "link not recognised — ask Nick for a fresh
  link" page (GET) or 403 JSON (POST). Never reveal whether the slug exists.
- The page must send `X-Robots-Tag: noindex` **and** a
  `<meta name="robots" content="noindex, nofollow">`, plus
  `Referrer-Policy: no-referrer` and `Cache-Control: no-store` — the URL *is*
  the credential and the page shows customer home addresses.

---

## Relationship to M3 and M4 (booking-mobile-integration.md)

- **M3 (chaining polish) dissolves into the workbench.** M3's brief was "in
  Howie's confirm view *(or a lightweight day view)*, group same-day mobile
  requests…". That day view is this workbench. Do **not** build M3 as a
  standalone page: when M3 is eventually justified by volume, build it as a
  feature of the workbench's pending-requests section (proximity grouping +
  travel-trim on confirm-as-run). Until then, Howie chains manually — which
  the workbench already makes easier by showing all pending requests together.
- **M4 (config the bands) stays independent** but pairs naturally with
  Session W2: both add fields to `schema.js` and to the dashboard Bookings
  tab. If M4 hasn't been done by the time W2 starts, consider doing them in
  the same era so `schema.js` and the dashboard form are touched once, not
  twice. Neither depends on the other.

Revised build order across both documents:
**W1 → W2 (± M4) → W3 → M3-as-workbench-feature (optional, volume-driven).**

---

## Session W1 — Read-only workbench

Ship the page with zero schema changes and zero mutations. Today / Tomorrow /
This-week list, contact links, pending mobile requests pinned to the top
(displayed only — confirm still happens via the existing email link in this
session). Immediate visible value; de-risks auth and layout before anything
writes.

### Context to load
```
workers/booking/src/index.js
workers/booking/src/ui.js          ← manage-page rendering patterns to match
workers/booking/src/db.js
workers/booking/src/config.js
workers/booking/src/schema.js
docs/booking-widget-build.md
docs/booking-workbench.md          ← this document
```

### Prompt for Cursor / Claude Code

```
Read docs/booking-widget-build.md and docs/booking-workbench.md in full before
doing anything — this session is "Session W1 — Read-only workbench" in
booking-workbench.md. Follow tasks W1.1–W1.5 and stop at Gate W1; do not build
prep status, notes, or any mutation endpoint (Sessions W2/W3).

Context files to open first: workers/booking/src/index.js,
workers/booking/src/ui.js, workers/booking/src/db.js,
workers/booking/src/config.js, workers/booking/src/schema.js.

Build, in order:
1. schema.js — add workbenchEnabled (bool, scope 'nick', default false) and
   workbenchToken (text, scope 'nick', nullable, min length 32 when set;
   never rendered back into any client-facing config payload). Follow the
   existing field conventions exactly.
2. GET /:slug/workbench?key=… — require workbenchEnabled and a constant-time
   token match; otherwise a branded "link not recognised" page with no hint
   whether the slug exists. On success render a server-side page:
   - Pending mobile requests pinned at top (status='pending'), showing
     arrival window, band, name, postcode/address, phone, reg — display
     only, with a line noting confirmation is via the email link (W3 adds
     the button).
   - Then Today / Tomorrow / Next 7 days groups of confirmed bookings:
     time (or arrival window for mobile), depot/mobile marker, name, reg,
     phone as tel: link, email as mailto:, and for mobile jobs the address
     with a Google Maps link. Customer note shown if present.
   - Cancelled rows excluded. Empty groups say so ("Nothing booked today").
3. GET /:slug/workbench/data?key=… — the same auth, returning the same
   bookings as JSON, and a small vanilla-JS auto-refresh (e.g. every 5
   minutes and on visibilitychange) so a phone left open stays current.
4. Response headers on both routes: X-Robots-Tag: noindex,
   Referrer-Policy: no-referrer, Cache-Control: no-store; and the robots
   meta tag in the page head.
5. Mobile-first layout — this page will live on two phones. Large tap
   targets, one column, readable outdoors. Match the existing widget's
   styling approach (tenant theme colours from config).

Constraints:
- No new npm dependencies, vanilla JS only, server-rendered like the manage
  pages. No framework, no client-side router.
- Read-only: this session must not write to D1 or Google Calendar at all.
- No hetyres-specific literals — everything via slug + config.
- Add the workbenchToken field to the dashboard Bookings tab form only if it
  falls out naturally from the schema-driven form; otherwise note that Nick
  can set it via the admin API and leave the form for W2.

When done, verify against Gate W1 in docs/booking-workbench.md and report
which criteria pass. Do not mark the session complete until all pass.
```

### Tasks
- **W1.1 — Config fields.** `workbenchEnabled` (bool, `scope: 'nick'`, default
  `false`) and `workbenchToken` (text, `scope: 'nick'`, nullable, ≥32 chars
  when set) in `schema.js`. The token must never appear in any client-facing
  config payload the widget UI receives.
- **W1.2 — The page.** `GET /:slug/workbench?key=…`: auth as above, then a
  server-rendered list — pending mobile requests pinned top; confirmed
  bookings grouped Today / Tomorrow / Next 7 days; per row: time or arrival
  window, depot/mobile marker, name, reg, `tel:` phone, `mailto:` email,
  Maps-linked address for mobile jobs, customer note.
- **W1.3 — JSON refresh.** `GET /:slug/workbench/data?key=…` + a light
  auto-refresh so the page stays current on a phone left open.
- **W1.4 — Secrecy headers.** `noindex` (header + meta), `no-referrer`,
  `no-store` on all workbench responses.
- **W1.5 — Phone-first layout.** One column, big tap targets, tenant theme
  colours. Emma and Howie will use this on phones in a workshop.

### Gate W1
- [ ] Correct token → the list renders with today's/this week's real bookings,
  grouped correctly, phone/maps links working; wrong or missing token → the
  branded refusal page, identical whether or not the slug exists.
- [ ] Pending mobile requests appear pinned at the top.
- [ ] A tenant without `workbenchEnabled` gets the refusal page even with a
  (stale) valid token.
- [ ] No D1 writes anywhere in the new code paths; depot/mobile booking flows
  unchanged.
- [ ] `noindex`, `no-referrer`, `no-store` present on both workbench routes.

---

## Session W2 — Prep status + internal notes

The core of the idea: track "check stock / order tyres / ready" per booking.
First schema change and first mutations.

### Context to load
```
workers/booking/src/index.js
workers/booking/src/db.js
workers/booking/src/schema.js
workers/booking/migrations/            ← naming/numbering convention
dashboard.html                         ← Bookings tab (token field, if deferred from W1)
docs/booking-workbench.md
```

### Prompt for Cursor / Claude Code

```
Read docs/booking-workbench.md in full before doing anything — this session
is "Session W2 — Prep status + internal notes". It assumes Session W1 (the
read-only workbench) is built and live — if it isn't, stop and say so.
Follow tasks W2.1–W2.5 and stop at Gate W2; do not build confirm/decline or
cancel buttons (Session W3).

Context files to open first: workers/booking/src/index.js,
workers/booking/src/db.js, workers/booking/src/schema.js, and the
workers/booking/migrations/ directory.

Build, in order:
1. A D1 migration (next number in sequence) adding to bookings:
   prep_status TEXT NOT NULL DEFAULT 'new', internal_note TEXT. Idempotent
   like the existing migrations. Apply to staging first, then production,
   BEFORE deploying the Worker that reads them.
2. POST /:slug/workbench/prep — body { key, bookingId, prepStatus?,
   internalNote? }. Auth identical to W1. Validate prepStatus against the
   fixed set: new | stock_checked | ordered | ready. Verify the booking
   belongs to the slug. Update only the provided fields. Return the updated
   row.
3. UI: each booking row gets a one-tap prep control that advances
   new → stock_checked → ordered → ready (with a way to step back one stage
   for mis-taps), and an internal-note box that saves on blur/submit. The
   internal note must be visually distinct from the customer's own note and
   labelled as private.
4. Readiness highlighting: any booking today or tomorrow whose prep_status
   is not 'ready' gets a clear warning treatment; the Today group header
   shows a count ("2 of 5 not ready"). This glance-level signal is the whole
   point of the page — make it unmissable but not noisy.
5. Optional-but-cheap: prep_status resets are never automatic; cancelled
   bookings drop out of the list as in W1 regardless of prep state.

Constraints:
- prep_status and internal_note are internal-only: they must never appear in
  any customer-facing email, the manage page, or the booking UI.
- Do not build a configurable stage list — the four stages are fixed. If a
  future tenant needs different stages, that's a schema.js decision for that
  future session, noted here deliberately as out of scope.
- If Session M4 (config the bands) is still unbuilt, flag to Nick that this
  session and M4 both touch schema.js + the dashboard Bookings tab and could
  be done in the same era — but do not build M4's fields yourself.

When done, verify against Gate W2 in docs/booking-workbench.md and report
which criteria pass, including the migration having been applied to both
staging and production databases.
```

### Tasks
- **W2.1 — Migration.** `prep_status TEXT NOT NULL DEFAULT 'new'`,
  `internal_note TEXT` on `bookings`. Staging first; production **before**
  the Worker deploy that reads them.
- **W2.2 — Prep endpoint.** `POST /:slug/workbench/prep` — token auth,
  slug-ownership check, fixed status vocabulary, partial updates.
- **W2.3 — Prep UI.** One-tap advance through the four stages (+ step-back),
  internal-note box, clearly labelled private.
- **W2.4 — Readiness highlighting.** Today/tomorrow rows not `ready` get the
  warning treatment; group header shows a not-ready count.
- **W2.5 — Dashboard token field.** If deferred from W1, surface
  `workbenchToken` (+ enable flag) in the dashboard Bookings tab so Nick can
  issue/rotate links without the raw admin API.

### Gate W2
- [ ] Advancing prep status on a phone is one tap, survives refresh, and is
  visible on the other phone after its next refresh.
- [ ] Internal note saves and reloads; it appears nowhere customer-facing
  (check the manage page, confirmation email templates, and booking UI).
- [ ] A today-booking left at `ordered` is visually flagged; the count is
  right.
- [ ] Invalid status values and cross-slug booking IDs are rejected.
- [ ] Migration applied to staging **and** production; the Worker deployed
  after, not before.

---

## Session W3 — Actions inline (+ optional morning digest)

Make the workbench the one place to act, not just look: confirm/decline
pending mobile requests, cancel/amend any booking. Optionally a 7am digest
email so the day's prep state arrives even if nobody opens the page.

### Context to load
```
workers/booking/src/index.js       ← handleConfirm, handleCancel, handleReschedule
workers/booking/src/signing.js     ← makeAdminKey / verifyAdminKey
workers/booking/src/email.js
workers/booking/wrangler.toml      ← no [triggers] block yet — digest adds one
worker/routes/notify-booking.js    ← email templates (neobookworm-uk Worker)
docs/booking-workbench.md
```

### Prompt for Cursor / Claude Code

```
Read docs/booking-workbench.md in full before doing anything — this session
is "Session W3 — Actions inline". It assumes Sessions W1 and W2 are live —
if not, stop and say so. Follow tasks W3.1–W3.4 and stop at Gate W3.

Context files to open first: workers/booking/src/index.js (handleConfirm,
handleCancel, handleReschedule), workers/booking/src/signing.js,
workers/booking/src/email.js, workers/booking/wrangler.toml, and
worker/routes/notify-booking.js in the repo root (the neobookworm-uk Worker
owns the email templates).

Build, in order:
1. Refactor the body of handleConfirm into a shared internal function
   (e.g. confirmPendingBooking(bookingRow, env, ctx)) so the email link
   route and the workbench both call one implementation. Behaviour of the
   email link must not change — same idempotency, same emails, same
   calendar update.
2. POST /:slug/workbench/confirm — body { key, bookingId, action:
   'confirm'|'decline' }. Workbench-token auth (NOT the confirm_token — the
   workbench key already proves staff). Confirm calls the shared function.
   Decline mirrors the existing decline path: row → cancelled, calendar
   event removed, polite "can't make that one" email to the customer.
   Both idempotent.
3. Cancel / amend buttons on each booking row: cancel calls the existing
   POST /:slug/cancel with the admin-signed key (makeAdminKey) so the staff
   cutoff-bypass applies; amend links to the existing admin manage URL
   (adminManageUrl) which already offers reschedule. Do not build any new
   cancel/reschedule logic — if something is missing, report it rather than
   duplicating.
4. OPTIONAL — morning digest (build only if Nick confirms he wants it in
   this session): a [triggers] crons entry in workers/booking/wrangler.toml
   (currently absent) + a scheduled handler that, for each tenant with
   workbenchEnabled and a digest flag/hour in config, emails the business:
   today's bookings with prep status, any pending mobile requests, and
   tomorrow's not-ready count, with a link to the workbench. Send via the
   existing notify-booking path — check whether a new template in
   worker/routes/notify-booking.js is needed, which means deploying BOTH
   Workers (this is the same two-Worker deploy trap noted in CLAUDE.md for
   NOTIFY_BOOKING_SECRET).

Constraints:
- Every mutation goes through an existing, already-tested path (shared
  confirm function, existing cancel/reschedule endpoints). The workbench
  adds buttons, not logic.
- Confirm/decline buttons need an "are you sure" step — a tap on a phone in
  a workshop is easy to fat-finger.
- Digest is per-tenant config-gated and defaults off.

When done, verify against Gate W3 in docs/booking-workbench.md and report
which criteria pass. If the digest was built, confirm which Workers were
deployed.
```

### Tasks
- **W3.1 — Shared confirm logic.** Extract `handleConfirm`'s core so the email
  link and the workbench button are one implementation. Email-link behaviour
  byte-for-byte unchanged.
- **W3.2 — Confirm/decline inline.** `POST /:slug/workbench/confirm` with a
  confirmation step in the UI; idempotent both ways.
- **W3.3 — Cancel/amend inline.** Buttons that reuse the existing
  admin-signed cancel endpoint and admin manage URL. No new mutation logic.
- **W3.4 — Morning digest (optional).** Cron trigger (new to this Worker) +
  per-tenant config gate + digest email via the notify-booking path.
  Remember: a new template lives in `worker/routes/notify-booking.js` on the
  **neobookworm-uk** Worker → both Workers need deploying.

### Gate W3
- [ ] Confirming a pending mobile request from the workbench produces exactly
  the same D1 state, calendar event, and customer email as clicking the link
  in Howie's email; doing both is a safe no-op.
- [ ] Decline frees the calendar time (depot slots reappear) and sends the
  polite email.
- [ ] Cancel from the workbench works inside the customer cutoff window
  (staff bypass) and updates calendar + sends the cancellation email.
- [ ] No new cancel/reschedule/confirm logic exists outside the shared/
  existing paths (grep for duplicated calendar or email calls).
- [ ] If built: digest arrives at the configured hour, only for tenants with
  it enabled, and links to the workbench.

---

## Build order summary

1. **W1 — Read-only workbench.** Auth + the list. No schema change, no writes.
2. **W2 — Prep status + notes.** The core idea. Migration `prep_status` +
   `internal_note`. (Consider pairing with M4 — both touch `schema.js` and
   the dashboard Bookings tab.)
3. **W3 — Actions inline.** Confirm/decline, cancel/amend, optional digest.
4. **M3 — Chaining polish**, later and only if volume justifies it, built as a
   workbench feature per "Relationship to M3 and M4" above.

## Things to get right

- **The URL is the credential.** `noindex` + `no-referrer` + `no-store` on
  every workbench response; token never in client-facing config payloads;
  rotation must be a plain config write. Treat a leaked link like a leaked
  password: rotate, done.
- **One confirm implementation.** The moment the workbench button and the
  email link diverge, one of them will silently rot. W3.1 is the most
  important task in Session W3.
- **Internal means internal.** `prep_status` and `internal_note` must never
  leak into customer emails, the manage page, or the booking UI — check the
  templates, not just the new code.
- **Phones first.** This page lives on two phones in a workshop. If a prep
  update takes more than one tap or the not-ready flag isn't visible at
  arm's length, it won't get used.
- **GDPR/retention.** The workbench displays customer home addresses behind a
  bearer link. It reads the same `bookings` rows as everything else, so the
  existing retention window covers it — but the link-secrecy measures above
  are part of that story. Don't weaken them for convenience.
- **Two-Worker deploys.** Anything touching email templates involves
  `worker/routes/notify-booking.js` on **neobookworm-uk** as well as
  `workers/booking` — the same trap already noted in CLAUDE.md for
  `NOTIFY_BOOKING_SECRET`.
