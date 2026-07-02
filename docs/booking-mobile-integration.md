# HE Tyres — Unified Depot + Mobile Booking

**Purpose:** Bring the two HE Tyres fitting mechanisms — the live **depot slot
booking** widget and the separate **"fit tyres at my home" enquiry** — into a
single customer journey. The customer starts from one place and does the same
thing whether they want depot or mobile; the only honest difference is that a
depot slot is **instantly confirmed** and a mobile visit is **requested, then
confirmed by Howie**.

This document is written in the same session-and-gate style as
[booking-widget-build.md](booking-widget-build.md). Read the Context box at the
top of a session before starting it, and do not proceed past a Gate until every
criterion passes.

> **Do not start building until you have read
> [booking-widget-build.md](booking-widget-build.md) in full.** This document
> extends that system — it assumes the Phase 1/2 architecture (Worker + D1 +
> Google Calendar + KV token cache + Vercel SMTP bridge) already in production.

---

## Decisions already made (do not re-litigate)

These were agreed with Nick before this document was written. They shape every
session below.

| Decision | Choice | Consequence |
|---|---|---|
| Mobile booking model | **Request, then Howie confirms** | Mobile creates a `pending` booking, not a `confirmed` one. Howie approves before the customer gets a firm confirmation. The system proposes a sensible time; Howie arranges his actual day. |
| Travel-time maths | **Distance bands** (no extra API) | Customer postcode → lat/long via postcodes.io (already integrated) → straight-line distance from depot × road factor → banded travel margin. No routing API, no per-lookup cost. |
| Routing between jobs | **Can chain nearby jobs** | Because Howie confirms manually, chaining happens in his head at confirm time. The software only reserves provisional travel time so requests don't collide; it does not compute optimal routes. Automatic chaining is a later polish, not a v1 requirement. |
| Resource model | **One at a time (just Howie)** | Depot and mobile draw from the **same** single resource. The shared Google Calendar already enforces this: a mobile block removes overlapping depot slots and vice versa. No per-slot capacity counting needed. |

### Why request-then-confirm makes this tractable

The single hardest part of a mobile-fitting booker is computing a correct route
and travel time automatically. The request model removes that requirement: the
system reserves a **generous-but-sensible** block of provisional time, and Howie
tightens the real schedule when he approves the request. This is why chaining
"just works" manually before any chaining code is written — Howie sees the
day's requests and arranges them himself.

Corollary: distance bands can err slightly generous. Over-reserved time is
trivial for Howie to reclaim at confirm; under-reserved time is what makes him
arrive late.

---

## Architecture overview

Nothing about the **depot** path changes. Mobile reuses the same engine with
three additions: a postcode gate, a distance-band block size, and a `pending`
booking status with a Howie-confirm step.

```
GET  /hetyres                     ← booking UI (now opens with a depot / mobile chooser)
GET  /hetyres/slots?date=…        ← depot slots (unchanged)
GET  /hetyres/mobile-windows?date=…&postcode=…   ← NEW: mobile arrival windows for a day + postcode
POST /hetyres/book                ← depot booking (unchanged: status=confirmed)
POST /hetyres/mobile-request      ← NEW: mobile booking (status=pending, holding email)
GET  /hetyres/confirm/:token      ← NEW: Howie approves a pending mobile booking → confirmed
```

Shared-resource guarantee (already true, restated): both depot events and mobile
events live in the **same Google Calendar**, so `getBusyPeriods` +
`filterAvailableSlots` already prevent a depot slot being sold over a mobile
visit and vice versa. A mobile `pending` block occupies calendar time the moment
it is requested, so it is visible to the depot slot maths immediately.

---

## The customer journey (target end state)

One entry point replaces both today's "Book a depot slot" button **and** the
separate mobile enquiry form.

1. **Where would you like your tyres fitted?**
   `[ 🔧 At the depot — watch over a coffee ]` · `[ 🚐 At my home or work — we come to you ]`

2. **When:**
   - **Depot** — unchanged. Pick day → pick 30-min slot → **instantly confirmed**.
   - **Mobile** — **postcode first** (postcodes.io):
     - `> 15 mi` from depot → friendly out-of-area message ("just outside our
       patch — give Ema a call on 01793 876 969"). Not a dead end, not a fake slot.
     - in area → compute distance band → show the same day strip, offering
       **arrival windows** (e.g. "Tue morning", "Tue afternoon"), sized to fit
       `travel + fit + travel`. Windows, **not** fake-precise minute slots.

3. **Details** — shared fields (name, email, phone, vehicle / tyre info). Mobile
   additionally asks for the full address via the Postcoder house-level finder
   (already wired into the widget).

4. **Outcome — same *feel*, honestly different label:**
   - **Depot** → "Booked! See you Tuesday at 09:00." + calendar invite.
   - **Mobile** → "Requested! Howie will confirm your Tuesday morning visit
     shortly." + a holding email. On Howie's approval → the firm confirmation
     email is sent and the event firms up.

The only visible difference is **"Booked" vs "Requested"** — which correctly
sets expectations without making the two paths feel like different products.

---

## Distance bands (starting values — Howie to tune)

Depot origin: **Unit 5 Star West, Westmead Drive, Westlea, Swindon SN5 7SW**.

Straight-line distance (postcode centroid → depot centroid) × road factor **1.3**:

| Band | Distance from depot | Travel reserved (each way) |
|---|---|---|
| A | 0–5 mi | 20 min |
| B | 5–10 mi | 35 min |
| C | 10–15 mi | 50 min |
| — | > 15 mi | out of area → call |

Reserved mobile block length = `travel_out + fitting_time + travel_back + safety_margin`.

Defaults: `fitting_time` = 45 min (one vehicle, typical), `safety_margin` = 15 min.
All of these belong in config (see Session M4) so Howie can adjust without a deploy.

---

## Session M1 — Unify the front door

Ship the single journey immediately, with **no maths yet**. Depot behaves exactly
as it does today; mobile still routes to the existing enquiry path. This de-risks
the UX before any calendar logic changes.

### Context to load
```
workers/booking/src/ui.js
workers/booking/src/index.js
he-tyres/index.html            ← current depot iframe embed + mobile enquiry form
docs/booking-widget-build.md
docs/booking-mobile-integration.md   ← this document
```

### Prompt for Cursor / Claude Code

```
Read docs/booking-widget-build.md and docs/booking-mobile-integration.md in full
before doing anything — this session is "Session M1 — Unify the front door" in
booking-mobile-integration.md. Follow that session's task list (M1.1–M1.3) and
do not proceed past what it describes; do not start Session M2's work.

Context files to open first: workers/booking/src/ui.js,
workers/booking/src/index.js, he-tyres/index.html.

Constraints:
- The depot booking path must not change in behaviour or markup beyond what's
  needed to sit behind the new chooser. Byte-for-byte the same slot-picking,
  booking, and confirmation flow.
- Add a View 0 chooser ("At the depot — watch over a coffee" / "At my home or
  work — we come to you") shown before the calendar in ui.js.
- Mobile selection reveals a short "where to come" form that still submits to
  the existing enquiry path (api/he-tyres-enquiry.js) — do not build any new
  calendar/booking logic for mobile in this session, that's Session M2.
- Update he-tyres/index.html CTAs (hero "Book a depot slot", services-modal
  CTAs) to open the unified widget. Keep the standalone mobile enquiry form as
  a fallback for now.
- Preserve: postMessage('booking-confirmed') on success, the mobile
  full-viewport calendar behaviour at ≤900px, amber selected states, vanilla
  JS only, no new dependencies.
- No TypeScript, no frameworks — match the existing code style exactly.

When done, verify against Gate M1 in docs/booking-mobile-integration.md and
report which criteria pass. Do not mark this session complete until all Gate
M1 criteria are met.
```

### Tasks
- **M1.1** In `ui.js`, add **View 0 — the chooser**: two large buttons ("At the
  depot" / "At my home or work") shown before the calendar. Selecting "depot"
  reveals the existing date/time picker unchanged. Selecting "mobile" (for now)
  reveals a short "we'll come to you — tell us where" form that submits to the
  existing enquiry path.
- **M1.2** On `he-tyres/index.html`, point the hero "Book a depot slot" CTA and
  the services-modal CTAs at the unified widget. Keep the standalone mobile
  enquiry form reachable as a fallback until Session M2 makes mobile a real
  booking, then retire it.
- **M1.3** Preserve all existing depot behaviour: postMessage on success, mobile
  full-viewport calendar (≤900px), amber selected states.

### Gate M1
- [ ] The widget opens on the depot/mobile chooser; depot path is byte-for-byte
  the current experience.
- [ ] Mobile path collects where-to-come and lands as an enquiry (as today).
- [ ] No regression in the depot booking flow (slot load, book, confirm email).

---

## Session M2 — Mobile becomes a real (pending) booking

The substantive session. Postcode gate, distance-band block, `pending` status,
holding email, and the Howie-confirm link.

### Context to load
```
workers/booking/src/index.js
workers/booking/src/calendar.js
workers/booking/src/db.js
workers/booking/src/config.js
workers/booking/src/email.js
docs/booking-mobile-integration.md
```

### Prompt for Cursor / Claude Code

```
Read docs/booking-widget-build.md and docs/booking-mobile-integration.md in
full before doing anything — this session is "Session M2 — Mobile becomes a
real (pending) booking" in booking-mobile-integration.md. Follow tasks
M2.1–M2.6 exactly and stop at Gate M2; do not start Session M3 or M4 work.

Context files to open first: workers/booking/src/index.js,
workers/booking/src/calendar.js, workers/booking/src/db.js,
workers/booking/src/config.js, workers/booking/src/email.js.

This session assumes Session M1 (the depot/mobile chooser in ui.js) is
already built — if it isn't, stop and say so rather than building it here.

Build, in order:
1. workers/booking/src/geo.js — postcode → lat/long via postcodes.io → 
   haversine distance to the depot centroid (Unit 5 Star West, Westmead
   Drive, Westlea, Swindon SN5 7SW) × road factor 1.3 → band lookup using the
   table in the "Distance bands" section of booking-mobile-integration.md.
   Returns { inArea, band, travelEachWayMin }; inArea:false beyond
   maxRadiusMiles (15).
2. GET /hetyres/mobile-windows?date=&postcode= — resolve band, compute block
   length (2×travel + fit(45min default) + margin(15min default)), reuse
   getWorkingSlots + getBusyPeriods from calendar.js, return arrival windows
   (AM/PM style, not exact times) that contain a contiguous free gap ≥ block
   length. Out-of-area postcodes return { inArea:false } so the UI can show
   the call-us message — do not throw an error for this case.
3. A D1 migration adding to bookings: type ('depot'|'mobile'), address,
   postcode, band, arrival_window, confirm_token. Follow the existing
   migration file naming/numbering convention in workers/booking/migrations/.
4. POST /hetyres/mobile-request — validate server-side (never trust the
   client's window), re-derive the window using the same logic as step 2,
   insert a bookings row with status='pending', create the Google Calendar
   event immediately (titled/coloured to clearly read PENDING — do not wait
   for confirmation to reserve the calendar time), fire a holding email to
   the customer and a "new mobile request" email to Howie containing a link
   to GET /hetyres/confirm/:confirm_token. Reuse the existing honeypot and
   rate-limit guards from the depot /book endpoint — do not write new ones.
5. GET /hetyres/confirm/:token — flips the row to status='confirmed', updates
   the calendar event to drop the PENDING marker, sends the customer the firm
   confirmation email (reuse the existing confirmation email template/path
   from email.js). Must be idempotent — a second click on an already-
   confirmed token shows a friendly "already confirmed" page, not an error.
6. Wire the UI (ui.js): postcode field → out-of-area message or arrival-window
   buttons → shared details form + the existing Postcoder address finder →
   "Requested — Howie will confirm shortly" success state, distinct copy from
   the depot "Booked" state.

Constraints:
- Do not touch the depot booking path's behaviour.
- Do not build chaining logic (Session M3) or config-schema fields
  (Session M4) in this session.
- Match existing code style: vanilla JS, ES modules, no TypeScript, no new
  npm dependencies without flagging it first.
- All new SQL must be idempotent (IF NOT EXISTS) like the existing migrations.

When done, verify against every Gate M2 criterion in
docs/booking-mobile-integration.md, including the shared-resource proof (a
pending mobile block must remove the correct depot slots on the same day).
Report which criteria pass and which don't — do not claim the session
complete if any fail.
```

### Tasks
- **M2.1 — Distance + bands (`geo.js`).** Add a helper that takes a UK postcode,
  fetches its lat/long from postcodes.io, computes haversine distance to the
  depot centroid, applies the road factor, and returns `{ inArea, band,
  travelEachWayMin }`. Depot centroid is a config constant. Out of area
  (> `maxRadiusMiles`) returns `{ inArea: false }`.
- **M2.2 — Mobile window endpoint.** `GET /hetyres/mobile-windows?date=…&postcode=…`:
  1. Resolve band → block length = `2×travel + fit + margin`.
  2. Reuse `getWorkingSlots` + `getBusyPeriods` for the day.
  3. Return the **arrival windows** (e.g. AM/PM, or 2-hour windows) that contain
     a contiguous free gap ≥ block length. Return `{ inArea:false }` for
     out-of-area so the UI can show the call-us message.
- **M2.3 — D1: `pending` mobile bookings.** Extend the `bookings` schema
  (migration) with the mobile fields it doesn't yet hold: `type` (`depot`|`mobile`),
  `address`, `postcode`, `band`, `arrival_window`, and a `confirm_token`.
  Mobile rows insert with `status='pending'`. The existing partial unique index
  is on `status='confirmed'`, so a `pending` mobile block still needs to occupy
  calendar time — create the Google event at request time (see M2.5) OR hold the
  time via a `pending`-aware overlap check; **decide and document which** (creating
  the event immediately, coloured/titled "PENDING", is simplest and makes the slot
  visibly reserved on Howie's calendar).
- **M2.4 — Mobile request endpoint.** `POST /hetyres/mobile-request`: validate,
  re-derive the window server-side (never trust the client), insert the `pending`
  row, create the pending calendar event, fire the **holding email** to the
  customer and a **"new mobile request — confirm?"** email to Howie containing the
  `GET /hetyres/confirm/:token` link. Same honeypot / rate-limit guards as the
  depot endpoint.
- **M2.5 — Confirm endpoint.** `GET /hetyres/confirm/:token`: flips the row to
  `confirmed`, firms the calendar event title/colour, and sends the customer the
  **firm confirmation** email. Idempotent (a second click is a no-op with a
  friendly "already confirmed" page). Optionally a decline link → `cancelled`
  (frees the time) + a polite "can't make that one" email.
- **M2.6 — UI wiring.** Mobile path: postcode field (with the out-of-area
  message), then arrival-window buttons from M2.2, then the shared details form +
  Postcoder address finder, then the "Requested — Howie will confirm" success
  state (distinct copy from the depot "Booked" state).

### Gate M2
- [ ] A postcode inside 15 mi returns arrival windows sized to its band; a
  postcode outside returns the call-us message.
- [ ] Submitting a mobile request creates a `pending` D1 row and a PENDING
  calendar event, and sends the holding email + Howie's confirm email.
- [ ] The pending block removes overlapping **depot** slots (shared-resource
  proof) — verify a depot day around a pending mobile block loses the right slots.
- [ ] Clicking Howie's confirm link flips the row to `confirmed`, firms the
  event, and sends the firm confirmation email; a second click is a safe no-op.
- [ ] Decline (if built) frees the time and the depot slots reappear.

---

## Session M3 — Chaining polish (optional / later)

Not required for launch — the request model already gives Howie manual chaining.
Build only once mobile is live and volume justifies it.

### Context to load
```
workers/booking/src/index.js
workers/booking/src/db.js
workers/booking/src/geo.js         ← built in Session M2
docs/booking-mobile-integration.md
```

### Prompt for Cursor / Claude Code

```
Read docs/booking-mobile-integration.md in full before doing anything — this
session is "Session M3 — Chaining polish" and is optional/later work. Only
proceed if Session M2 (pending mobile bookings, geo.js, confirm endpoint) is
already built and live — if it isn't, stop and say so.

Context files to open first: workers/booking/src/index.js,
workers/booking/src/db.js, workers/booking/src/geo.js.

Build tasks M3.1–M3.3:
1. In Howie's confirm view (or a new lightweight day view), group same-day
   pending mobile requests that share the same or adjacent distance band so
   he can see them as a candidate run.
2. When Howie accepts requests as a run, trim the double-counted travel
   (site→site instead of depot→site→depot for the middle legs) and tighten
   the reserved calendar blocks accordingly.
3. Consider a "provisional AM / PM" grouping mode where several nearby
   requests share a half-day.

Constraints:
- Do not change the depot booking path or the core M2 request/confirm flow —
  this only adds a grouping/optimisation layer on top.
- Keep the manual-decision model: Howie still approves, this just gives him
  better information to approve well.

When done, verify against Gate M3 in docs/booking-mobile-integration.md and
report which criteria pass.
```

### Tasks
- **M3.1** In Howie's confirm view (or a lightweight day view), group **same-day
  mobile requests in the same/adjacent bands** so he can accept them as a run.
- **M3.2** When accepted as a run, trim the double-counted travel (site→site
  instead of depot→site→depot) and tighten the reserved blocks.
- **M3.3** Consider a "provisional AM / PM" mode where several nearby requests
  share a half-day and Howie sequences them.

### Gate M3
- [ ] Two nearby same-day requests can be confirmed as a run with less total
  reserved travel than confirming them independently.

---

## Session M4 — Config the bands (fold into schema)

Move all mobile tunables into the tenant config schema so Howie changes them
without a deploy (see the "Config management surface" section of
[booking-widget-build.md](booking-widget-build.md)).

### Context to load
```
workers/booking/src/schema.js
workers/booking/src/geo.js         ← built in Session M2
workers/booking/src/admin.js
dashboard.html                     ← Bookings tab
docs/booking-widget-build.md       ← "Config management surface" section
docs/booking-mobile-integration.md
```

### Prompt for Cursor / Claude Code

```
Read docs/booking-widget-build.md (especially the "Config management surface"
section) and docs/booking-mobile-integration.md in full before doing
anything — this session is "Session M4 — Config the bands" in
booking-mobile-integration.md. Follow tasks M4.1–M4.3.

Context files to open first: workers/booking/src/schema.js,
workers/booking/src/geo.js, workers/booking/src/admin.js, dashboard.html
(the Bookings tab section).

This session assumes Session M2 (geo.js and the mobile-windows endpoint using
hardcoded band constants) is already built — if it isn't, stop and say so.

Build:
1. Add these fields to the CONFIG_SCHEMA in schema.js, scope: 'client'
   (Howie-editable) unless noted: mobileEnabled (bool), depotOrigin
   (lat/long, scope: 'nick' — this is a fixed business fact, not
   client-editable), maxRadiusMiles (int), roadFactor (number),
   bands (array of {maxMiles, travelEachWayMin}), mobileFitMinutes (int),
   mobileSafetyMarginMinutes (int), arrivalWindowMode ('am-pm'|'2h').
   Validate/clamp each per the existing schema conventions (see how existing
   fields like slotDuration or minLeadMinutes are validated).
2. Update geo.js and the /hetyres/mobile-windows endpoint to read these
   values from the tenant's resolved config (the same config object the rest
   of the Worker already loads per-request) instead of hardcoded constants.
3. Add these fields to the dashboard Bookings tab form (dashboard.html /
   api/dashboard.js or api/_lib/booking.js, whichever proxies the admin
   config today) so Nick can edit them for the hetyres tenant. Follow the
   existing form-field patterns exactly — this must be schema-driven like
   the rest of the config surface, not a one-off form.
4. Confirm the existing KV-bust-on-write behaviour in admin.js covers these
   new fields (it should, since it's a whole-config write) — do not add a
   second cache-invalidation path.

Constraints:
- Do not hardcode any booking-specific assumptions into shared
  validation/schema helpers if avoidable — the existing build doc notes this
  schema may generalise beyond booking later.
- Do not change the depot config surface or its existing fields.

When done, verify against Gate M4 in docs/booking-mobile-integration.md:
changing a band or radius value via the dashboard must change offered
mobile windows immediately, with no code deploy and no stale KV read. Report
which criteria pass.
```

### Tasks
- **M4.1** Add to `schema.js`, `scope: 'client'` where Howie should own it:
  `mobileEnabled` (bool), `depotOrigin` (lat/long), `maxRadiusMiles`,
  `roadFactor`, `bands` (array of `{maxMiles, travelEachWayMin}`),
  `mobileFitMinutes`, `mobileSafetyMarginMinutes`, `arrivalWindowMode`
  (`am-pm` | `2h`).
- **M4.2** `geo.js` and the window endpoint read from config, not constants.
- **M4.3** Surface these in the dashboard Bookings tab; validate/clamp on write.

### Gate M4
- [ ] Changing a band value or the radius in config changes the offered windows
  with no code deploy and no stale KV cache.

---

## Build order summary

1. **M1 — Unify the front door.** Ships the journey; depot unchanged, mobile
   still an enquiry. Immediate visible win.
2. **M2 — Mobile as a pending booking.** The real work: postcode gate, bands,
   `pending`, holding + confirm emails, shared-calendar reservation.
3. **M3 — Chaining polish.** Optional; manual chaining works from day one.
4. **M4 — Config the bands.** Hand the dials to Howie.

## Things to get right

- **Arrival windows, not fake minutes.** Mobile UX must promise a window
  ("Tuesday morning"), never "09:07", or you'll set an expectation the traffic
  breaks.
- **"Booked" vs "Requested" copy** must be unmistakable so mobile customers know
  a human is confirming.
- **Pending blocks must occupy calendar time** the instant they're requested, or
  two customers can request the same slice.
- **GDPR/retention** — mobile rows now hold a home address. Fold into the same
  retention window as the rest of `bookings` and note it in the privacy copy.
