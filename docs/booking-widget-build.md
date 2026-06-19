# NeoBookworm Booking Widget — Build Document

**Purpose:** Build a reusable appointment-booking iframe widget hosted at
`booking.neobookworm.uk/:slug`. Phase 1 proves the concept end-to-end with a
single hardcoded client (`hetyres`) connected to a Google Calendar.

**Do not start a session until you have read the Context section at the top of
that session.** Each session ends with a Gate — do not proceed to the next
session until every Gate criterion passes.

---

## Architecture overview

```
neobookworm-booking.nickbarrett.workers.dev/hetyres          ← GET  — serves booking UI (iframe page)
neobookworm-booking.nickbarrett.workers.dev/hetyres/slots    ← GET  — returns available slot times as JSON
neobookworm-booking.nickbarrett.workers.dev/hetyres/book     ← POST — creates Google Cal event + sends email

(booking.neobookworm.uk will replace the above once DNS moves to Cloudflare)
```

Stack:

- **Cloudflare Worker** — serves UI and API
- **Cloudflare KV** — caches Google access tokens (55-min TTL)
- **Cloudflare D1** — `bookings` database, records every booking
- **Google Calendar API** — freebusy read + event write
- **Google Workspace SMTP** — confirmation email to visitor

Repo location: `workers/booking/` inside the NeoBookworm.uk repo.

---

## Manual pre-work (do this before any Cursor session)

These steps require a browser and cannot be automated.

### Step A — Google Cloud project

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project: **NeoBookworm Booking**
3. Enable the **Google Calendar API** for the project
4. Go to APIs & Services → Credentials → Create Credentials → **OAuth 2.0 Client ID**
5. Application type: **Desktop app**, name it `booking-worker-dev`
6. Download the JSON — save it as `workers/booking/oauth-client-secret.json`
  (the root `.gitignore` already has rules for
   `workers/booking/oauth-client-secret.json` and `workers/booking/.dev.vars`,
   so git will not track this file — confirm with
   `git check-ignore workers/booking/oauth-client-secret.json`, which should
   echo the path back. Never commit it.)
7. Go to OAuth Consent Screen → set to **Internal**

> ⚠️ **Critical — this determines whether your booking system survives past 7 days.**
> Google refresh tokens for apps in **"Testing"** publishing status **expire after
> 7 days**. If that happens, every booking request starts failing with
> `invalid_grant` and no events get created — silently.
>
> Avoid this by using **Internal** consent screen, which requires the OAuth project
> to belong to your **Google Workspace org**. `nick@neobookworm.uk` is a Google
> Workspace account (it's the SMTP sender — see CLAUDE.md), so:
>
> - Create the Cloud project while signed in as `nick@neobookworm.uk`
> - Use the **same** `nick@neobookworm.uk` account for the calendar in Phase 1
> (not a personal `@gmail.com` calendar)
> - Set consent screen to **Internal** → refresh tokens never expire
>
> If you must use a personal `@gmail.com` calendar, you have to **publish** the
> app (consent screen → "Publish app" → status "In production"). An unverified
> published app is fine for Calendar scope used only by you, and its refresh
> tokens do not expire. Do **not** leave it in "Testing".

### Step B — Create Cloudflare resources

Run these Wrangler CLI commands from the repo root (approve each prompt):

```bash
# D1 database
npx wrangler d1 create bookings

# KV namespace (older wrangler used `kv:namespace create` with a colon —
# both forms work on wrangler 3.60+, but this is the current syntax)
npx wrangler kv namespace create BOOKING_TOKEN_CACHE

# Custom domain — do this in Session 6, after the Worker is first deployed.
# Add CNAME in Cloudflare DNS: booking → <worker>.workers.dev
```

Copy the `database_id` and `kv_namespace id` values from the output — you will
need them in `wrangler.toml` (Session 1).

### Step C — One-time Google OAuth (run after Session 1 is complete)

A helper script `workers/booking/scripts/get-refresh-token.mjs` is created in
Session 1. Run it once:

```bash
node workers/booking/scripts/get-refresh-token.mjs
```

It opens a browser auth page. Approve access to Google Calendar. Copy the
`refresh_token` from the terminal output.

Then store all secrets in the Worker:

```bash
cd workers/booking
npx wrangler secret put GOOGLE_CLIENT_ID        # from oauth-client-secret.json
npx wrangler secret put GOOGLE_CLIENT_SECRET    # from oauth-client-secret.json
npx wrangler secret put GOOGLE_REFRESH_TOKEN    # from Step C output
npx wrangler secret put GOOGLE_CALENDAR_ID      # your calendar ID (usually your Gmail address)
npx wrangler secret put GW_SMTP_USER            # nick@neobookworm.uk (Google Workspace)
npx wrangler secret put GW_SMTP_PASS            # Google Workspace app password
```

For local dev (`wrangler dev`), mirror these in `workers/booking/.dev.vars`
(gitignored).

---

## Session 1 — Scaffolding and infrastructure

### Context to load into Cursor

```
workers/landing-enquiry/wrangler.toml       ← reference for wrangler.toml structure
workers/landing-enquiry/src/index.js        ← reference for Worker routing pattern
workers/landing-enquiry/package.json        ← reference for package.json structure
docs/booking-widget-build.md               ← this document
```

Also tell Cursor:

> This is a Cloudflare Worker project. Use ES module syntax (`export default {}`).
> No npm framework — vanilla JS only. No TypeScript.

### Tasks

**1.1 — Create `workers/booking/wrangler.toml`**

```toml
name = "neobookworm-booking"
main = "src/index.js"
compatibility_date = "2025-06-01"

[[d1_databases]]
binding = "DB"
database_name = "bookings"
database_id = "REPLACE_WITH_REAL_ID"

[[kv_namespaces]]
binding = "TOKEN_CACHE"
id = "REPLACE_WITH_REAL_ID"

[vars]
ENVIRONMENT = "development"
```

Replace both `REPLACE_WITH_REAL_ID` values with the IDs from Step B.

**1.2 — Create `workers/booking/package.json`**

```json
{
  "name": "neobookworm-booking",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^3.0.0"
  },
  "dependencies": {
    "nodemailer": "^6.9.0"
  }
}
```

**1.3 — Create D1 migration `workers/booking/migrations/0001_init.sql`**

```sql
CREATE TABLE IF NOT EXISTS bookings (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL,
  slot_start      TEXT NOT NULL,
  slot_end        TEXT NOT NULL,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT NOT NULL,
  note            TEXT,
  google_event_id TEXT,
  status          TEXT NOT NULL DEFAULT 'confirmed',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_slug_slot ON bookings(slug, slot_start);

-- Atomic double-booking guard. A second INSERT for the same confirmed slot
-- fails with a UNIQUE constraint error — this is the real race lock, not the
-- freebusy check. Partial index so cancelled rows free the slot again.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bookings_active_slot
  ON bookings(slug, slot_start) WHERE status = 'confirmed';
```

Apply it:

```bash
cd workers/booking
npx wrangler d1 migrations apply bookings
npx wrangler d1 migrations apply bookings --remote
```

**1.4 — Create the one-time OAuth helper script
`workers/booking/scripts/get-refresh-token.mjs`**

```js
// Run once: node scripts/get-refresh-token.mjs
// Reads oauth-client-secret.json, opens browser, prints refresh_token.
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { createInterface } from 'readline';

const creds = JSON.parse(readFileSync(new URL('../oauth-client-secret.json', import.meta.url)));
const { client_id, client_secret } = creds.installed || creds.web;
const REDIRECT = 'http://localhost:4321';
const SCOPE = 'https://www.googleapis.com/auth/calendar';

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${client_id}&redirect_uri=${encodeURIComponent(REDIRECT)}` +
  `&response_type=code&scope=${encodeURIComponent(SCOPE)}&access_type=offline&prompt=consent`;

console.log('\nOpen this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for redirect on http://localhost:4321 ...\n');

const server = createServer(async (req, res) => {
  const code = new URL(req.url, 'http://localhost').searchParams.get('code');
  if (!code) { res.end('No code'); return; }
  res.end('<h1>Done — check your terminal</h1>');
  server.close();

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id, client_secret,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code'
    })
  });
  const data = await resp.json();
  console.log('=== COPY THESE VALUES ===');
  console.log('refresh_token:', data.refresh_token);
  console.log('access_token (short-lived, ignore):', data.access_token);
}).listen(4321);
```

**1.5 — Create stub `workers/booking/src/index.js`**

```js
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    return new Response(`NeoBookworm Booking — ${url.pathname}`, {
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
```

**1.6 — Confirm `.gitignore` covers the secrets**

The root `.gitignore` already ignores `workers/booking/oauth-client-secret.json`
and `workers/booking/.dev.vars` (added when this build doc was written). Add the
one remaining entry for local deps:

```
workers/booking/node_modules/
```

(`node_modules/` is already ignored repo-wide, so this is belt-and-braces only.)
Verify nothing sensitive is staged: `git status --short workers/booking/`
should never list `oauth-client-secret.json` or `.dev.vars`.

### Gate 1 — criteria to pass before Session 2

- [x] `wrangler.toml` has real D1 database_id and KV namespace id
- [x] `npx wrangler dev` (from `workers/booking/`) starts without errors
- [x] `curl http://localhost:8787/hetyres` returns `NeoBookworm Booking — /hetyres`
- [x] `npx wrangler d1 migrations apply bookings` reports success (local)
- [x] `node scripts/get-refresh-token.mjs` opens a browser auth URL (script runs
  ```
  without errors; you don't need to complete the auth flow yet)
  ```

---

## Session 2 — Google Calendar integration (`calendar.js`)

### Context to load into Cursor

```
workers/booking/src/index.js            ← current stub
workers/booking/wrangler.toml           ← env bindings reference
docs/booking-widget-build.md           ← this document (Session 2 section)
```

Also tell Cursor:

> All Google API calls use the native `fetch()` — no google-api client library.
> The Worker receives `env.GOOGLE_CLIENT_ID`, `env.GOOGLE_CLIENT_SECRET`,
> `env.GOOGLE_REFRESH_TOKEN`, `env.GOOGLE_CALENDAR_ID`, `env.TOKEN_CACHE` (KV).
> Working hours for slug "hetyres": Mon–Fri 08:30–17:00, Sat 08:30–12:30, Sun closed.
> Slot duration: 30 minutes. Timezone: Europe/London.

### Tasks

> **Timezone is the highest-risk part of this whole build. Read this first.**
>
> Cloudflare Workers ship the full `Intl` timezone database, so DST is solvable —
> but only if done deliberately. The rules for this codebase:
>
> - **Slot identity is a London wall-clock time**, represented as a string with no
> zone suffix, e.g. `"2026-06-23T08:30:00"`. This is what the UI sends, what the
> `/slots` endpoint returns (as `"08:30"` labels for the day), and what goes in
> `slot_start`. Never store a slot as a bare `Z`/UTC string — that loses meaning
> across the BST/GMT switch.
> - **For Google Calendar event creation**, pass the wall-clock time plus the zone
> and let Google resolve it — do not convert manually:
> `start: { dateTime: "2026-06-23T08:30:00", timeZone: "Europe/London" }`.
> - **For freebusy overlap math**, you need real UTC instants. Convert the London
> wall time to a UTC instant with this canonical helper — put it in `calendar.js`
> and use it everywhere; do not write a second offset calculation:
>
> ```js
> // Returns the UTC offset (ms) that `timeZone` had at the given instant.
> function tzOffsetMs(date, timeZone) {
>   const dtf = new Intl.DateTimeFormat('en-US', {
>     timeZone, hour12: false,
>     year: 'numeric', month: '2-digit', day: '2-digit',
>     hour: '2-digit', minute: '2-digit', second: '2-digit'
>   });
>   const p = dtf.formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
>   const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
>   return asUTC - date.getTime();
> }
>
> // "2026-06-23T08:30:00" (London wall time) -> Date (correct UTC instant).
> export function londonWallToInstant(wall, timeZone = 'Europe/London') {
>   const guess = new Date(wall + 'Z');                 // treat as UTC first
>   const offset = tzOffsetMs(guess, timeZone);         // offset at that instant
>   return new Date(guess.getTime() - offset);
> }
> ```
>
> (The single-step guess is correct for London because the offset is constant
> within any given local day except across the 1am DST jump, which falls outside
> 08:30–17:00 working hours. Add a unit test for a BST date and a GMT date — see
> Session 2 tests.)

**2.1 — Create `workers/booking/src/calendar.js`**

Implement and export:

```js
// Returns a valid Google access token, using KV cache to avoid hitting token
// endpoint on every request. TTL: 3300 seconds (55 min).
export async function getAccessToken(env) { ... }

// Calls the Google Calendar FreeBusy API for the given day (ISO date string
// e.g. "2026-06-20"). Returns an array of busy intervals:
// [{ start: Date, end: Date }, ...]
export async function getBusyPeriods(env, isoDate) { ... }

// Generates all 30-minute slots within working hours for the given isoDate.
// Returns array of { start: Date, end: Date }.
// Returns [] for Sunday or dates in the past.
export function getWorkingSlots(isoDate) { ... }

// Returns available slots by removing busy periods from working slots.
// A slot is unavailable if it overlaps ANY busy period.
// Returns array of ISO strings: ["2026-06-20T08:30:00Z", ...]
export function filterAvailableSlots(workingSlots, busyPeriods) { ... }

// Creates a Google Calendar event. Returns the created event object.
// Throws on failure.
export async function createCalendarEvent(env, { slotStart, slotEnd, name, email, phone, note }) { ... }
```

Implementation notes for Cursor:

- `getAccessToken`: KV key `"gtoken"`, value JSON `{ token, expiresAt }`.
If missing or `expiresAt < Date.now() + 60000`, POST to
`https://oauth2.googleapis.com/token` with grant_type=refresh_token.
- `getBusyPeriods`: POST to
`https://www.googleapis.com/calendar/v3/freeBusy`
body: `{ timeMin, timeMax, items: [{ id: env.GOOGLE_CALENDAR_ID }] }`.
Parse `response.calendars[calendarId].busy`.
- `getWorkingSlots`: working hours table keyed by day-of-week (0=Sun).
Generate slots from start to end in 30-min increments.
All times in `Europe/London` — use `Intl.DateTimeFormat` to determine
the UTC offset for the given date (handles BST/GMT correctly).
- `filterAvailableSlots`: a slot overlaps a busy period if
`slot.start < busy.end && slot.end > busy.start`.
- `createCalendarEvent`: POST to
`https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events`.
Pass `start`/`end` as `{ dateTime, timeZone: 'Europe/London' }` (see timezone
note above). Set `attendees: [{ email }]`.

> **Decision — avoid sending the customer two emails.** If you set
> `sendUpdates: "all"`, Google emails the customer a calendar invite **and** our
> Session 4 confirmation email fires — two emails for one booking, and the Google
> invite is colder/more technical than our plain-English one. For Phase 1, set
> `**sendUpdates: "none"`** and add the customer as an attendee anyway (so the
> event still shows who's coming). Our own confirmation email (Session 4) is the
> single customer-facing message — friendlier, on-brand, and reply-to works.
> If you later want the customer to get a proper calendar entry they can tap to
> add, attach a generated `.ics` file to our confirmation email instead (Phase 2).
> Nick still sees the booking instantly because it lands in his own calendar.

**2.2 — Update `workers/booking/src/index.js`** to add the slots route:

```
GET /hetyres/slots?date=YYYY-MM-DD
```

- Validate `date` param (reject missing, past dates, and dates > 60 days ahead)
- Call `getBusyPeriods` + `getWorkingSlots` + `filterAvailableSlots`
- Return JSON: `{ date: "2026-06-20", slots: ["08:30", "09:00", ...] }`
- Return `{ date, slots: [] }` for Sundays or fully booked days — not an error
- CORS header: `Access-Control-Allow-Origin: *`

**2.3 — Create `workers/booking/src/config.js`**

Centralise per-slug config so Phase 2 can swap this for a D1 lookup:

```js
export const SLUG_CONFIG = {
  hetyres: {
    displayName: 'HE Tyres',
    calendarId: null,        // falls back to env.GOOGLE_CALENDAR_ID
    slotDuration: 30,
    minLeadMinutes: 60,      // can't book a slot starting within the next hour
    maxAdvanceDays: 60,      // furthest ahead a slot can be booked
    timezone: 'Europe/London',
    workingHours: {
      1: { open: '08:30', close: '17:00' }, // Mon
      2: { open: '08:30', close: '17:00' },
      3: { open: '08:30', close: '17:00' },
      4: { open: '08:30', close: '17:00' },
      5: { open: '08:30', close: '17:00' }, // Fri
      6: { open: '08:30', close: '12:30' }, // Sat
    }
  }
};

export function getConfig(slug) {
  return SLUG_CONFIG[slug] ?? null;
}
```

**2.4 — Add unit tests for the pure logic** (`workers/booking/test/slots.test.js`)

The pure functions (`getWorkingSlots`, `filterAvailableSlots`,
`londonWallToInstant`) are where timezone and boundary bugs hide. Test them with
Vitest (Cloudflare's recommended Worker test runner). Add to `package.json`:
`"test": "vitest run"` and devDependency `vitest`. Required cases:

- `getWorkingSlots` for a **Monday** returns 17 slots, first `08:30`, last `16:30`
(a 30-min slot starting 16:30 ends 17:00 — the last legal start).
- `getWorkingSlots` for a **Saturday** returns slots `08:30`…`12:00`.
- `getWorkingSlots` for a **Sunday** returns `[]`.
- `getWorkingSlots` for a **past date** returns `[]`.
- `filterAvailableSlots`: a busy period `09:00–10:00` removes exactly the `09:00`
and `09:30` slots and nothing else.
- `filterAvailableSlots`: a busy period that touches a slot edge only
(`08:00–08:30`) does **not** remove the `08:30` slot (overlap is strict `<`/`>`).
- `londonWallToInstant("2026-06-23T08:30:00")` (BST) → instant equals
`2026-06-23T07:30:00Z` (London is UTC+1 in June).
- `londonWallToInstant("2026-01-12T08:30:00")` (GMT) → instant equals
`2026-01-12T08:30:00Z` (London is UTC+0 in January).

### Gate 2 — criteria to pass before Session 3

- [x] `npx vitest run` passes all cases in 2.4 (run this before the manual checks)

- [x] `GET /hetyres/slots?date=2026-06-23` (a Monday) returns JSON with slots
  ```
  `["08:30","09:00","09:30",...,"16:30"]` (17 slots if calendar is empty)
  ```
- [x] `GET /hetyres/slots?date=2026-06-22` (a Sunday) returns `{ slots: [] }`
- [x] `GET /hetyres/slots?date=2025-01-01` (past) returns HTTP 400
- [x] Creating a test event manually in your Google Calendar for a Monday
  ```
  09:00–10:00 causes the slots endpoint to return that hour's slots as missing
  ```
- [x] KV cache is used on second call: add a `console.log` before the token
  ```
  fetch and confirm it only fires once in two rapid requests (`wrangler dev` logs)
  ```

---

## Session 3 — Booking endpoint and D1 write

### Context to load into Cursor

```
workers/booking/src/index.js
workers/booking/src/calendar.js
workers/booking/src/config.js
workers/booking/migrations/0001_init.sql
docs/booking-widget-build.md
```

Also tell Cursor:

> `env.DB` is a Cloudflare D1 binding. Use `env.DB.prepare(sql).bind(...).run()`
> for writes, `.first()` for single-row reads.
> Generate IDs with a simple nanoid-style function — no npm package needed;
> use `crypto.randomUUID()` which is available in Workers.

### Tasks

**3.1 — Create `workers/booking/src/db.js`**

```js
// Inserts a confirmed booking row (the atomic slot lock). Returns { id }.
// If the slot is already taken, the UNIQUE partial index throws — catch the
// error, detect the constraint (message contains "UNIQUE"), and re-throw a
// typed error the handler maps to 409, e.g. throw new SlotTakenError().
// Generate id with crypto.randomUUID(). googleEventId is null at insert time
// and filled in by updateBookingEvent after the calendar call succeeds.
export async function insertBooking(db, { slug, slotStart, slotEnd, name, email, phone, note }) { ... }

// Sets google_event_id on an existing row after the event is created.
export async function updateBookingEvent(db, id, googleEventId) { ... }

// Marks a row failed (frees the slot via the partial unique index) when the
// calendar call fails after the row was inserted.
export async function markBookingFailed(db, id) { ... }

// Returns the booking row for a given slug + slot_start, or null. Diagnostics
// only — the UNIQUE insert, not this read, is the race guard.
export async function findBookingBySlot(db, slug, slotStart) { ... }

// Counts confirmed bookings for an email in a trailing window (abuse guard).
export async function countRecentBookingsByEmail(db, slug, email, sinceIso) { ... }
```

**3.2 — Add `POST /hetyres/book` to `workers/booking/src/index.js`**

Request body (JSON):

```json
{
  "slot": "2026-06-23T08:30:00",
  "name": "Joe Smith",
  "email": "joe@example.com",
  "phone": "07700900000",
  "note": "2 × 205/55 R16"
}
```

Handler logic (in this exact order — order matters for race safety):

1. Parse and validate body: all required fields present; `email` matches a basic
  email regex; `name`/`phone` non-empty and within length caps (name ≤ 80,
   note ≤ 500 — reject longer to prevent abuse); slot is a valid datetime; slot
   is in the future **with at least a minimum lead time** (see `minLeadMinutes`
   in config — default 60, so nobody books a slot starting in 5 minutes).
2. **Server-side slot legitimacy check.** Do NOT trust that the posted slot is a
  real offered slot. Re-derive the available slots for that date the same way
   the `/slots` endpoint does (`getWorkingSlots` + `getBusyPeriods` +
   `filterAvailableSlots`) and assert the posted slot is a member of that set.
   This single check covers: within working hours, on a 30-min boundary, not a
   Sunday, and not overlapping an existing calendar event. If not a member →
   `409 slot_taken` (it was either never valid or just got taken).
3. **Insert the D1 row first — this is the atomic lock.** Call `insertBooking`
  with `status='confirmed'`. If it throws a UNIQUE constraint error, another
   request already holds this slot → return `409 slot_taken`. Do this BEFORE
   touching Google so the DB is the single source of truth for "who got the slot".
4. Call `createCalendarEvent` → get back `googleEventId`.
  - If it fails, roll back: set the row's `status='failed'` (frees the slot via
   the partial unique index) and return `502 calendar_error`.
5. Update the row with `google_event_id`.
6. `ctx.waitUntil(...)` the confirmation email (wired in Session 4).
7. Return `HTTP 200` with `{ ok: true, name, slotStart, slotEnd }`.

Error responses:

- Validation failure → `400 { ok: false, error: "..." }`
- Slot not available / lost the race → `409 { ok: false, error: "slot_taken" }`
- Google API failure → `502 { ok: false, error: "calendar_error" }`

> **Why insert-first?** The freebusy check only protects against events the
> business creates directly in their own calendar. It cannot protect against two
> simultaneous booking requests for the same slot — both could read "free" before
> either writes. The UNIQUE index on `(slug, slot_start) WHERE status='confirmed'`
> makes the D1 insert the real mutual-exclusion lock. Whichever request inserts
> first wins; the loser gets a constraint error and a clean 409.

**3.2b — Lightweight abuse guards** (this endpoint is public and writes to a real
calendar — without guards, one script can fill every slot for 60 days):

- **Honeypot:** the UI form (Session 5) includes a hidden `company` field that real
users never fill. If `body.company` is non-empty → return a fake `200 { ok: true }`
(let the bot think it worked) and create nothing.
- **Per-email cap:** before inserting, call `countRecentBookingsByEmail` for the
trailing 24h. If ≥ 3 → `429 { ok: false, error: "too_many" }`.
- **Per-IP rate limit (KV):** key `rl:{ip}` (from `request.headers.get('CF-Connecting-IP')`),
increment with a 60-second TTL; if > 5 booking POSTs in 60s → `429`.

Keep these simple — they are not bulletproof, just enough to stop casual abuse of
a public endpoint. Tighten in Phase 2 (e.g. Cloudflare Turnstile) if it becomes a
real problem.

**3.3 — Handle CORS preflight** for the POST endpoint:
Add a handler for `OPTIONS /hetyres/book` that returns 204 with:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

### Gate 3 — criteria to pass before Session 4

- [x] `POST /hetyres/book` with a valid free slot returns `{ ok: true }` and a
  ```
  new event appears in your Google Calendar
  ```
- [x] The event in Google Calendar has the visitor's email as an attendee
  ```
  (with `sendUpdates: "none"`, Google does NOT email them — our own
  confirmation email from Session 4 is the single customer-facing message)
  ```
- [x] `POST /hetyres/book` with the same slot a second time returns `409`
- [x] `POST /hetyres/book` with a missing `email` field returns `400`
- [x] `POST /hetyres/book` with a past slot returns `400`
- [x] D1 local: `npx wrangler d1 execute bookings --local --command "SELECT * FROM bookings"` shows the test row
- [ ] D1 remote: same command without `--local` shows the row (deploy first:
  ```
  `npx wrangler deploy`)
  ```

---

## Session 4 — Confirmation email

### Context to load into Cursor

```
workers/booking/src/index.js
workers/booking/src/db.js
api/_lib/email.js                        ← existing email helper — read this for SMTP pattern
docs/booking-widget-build.md
```

Also tell Cursor:

> The existing `api/_lib/email.js` uses Nodemailer with Google Workspace SMTP
> (`smtp.gmail.com`, port 587, STARTTLS). Replicate that pattern — do NOT use
> a different email provider. In a Cloudflare Worker, Nodemailer cannot be used
> directly (no Node.js TCP). Instead, POST to the existing Vercel helper at
> `https://neobookworm.uk/api/notify-booking` which will be created in this
> session as a thin Vercel route that calls Nodemailer.

### Tasks

**4.1 — Create Vercel route `api/notify-booking.js`**

This is a thin Vercel serverless function. It:

- Accepts `POST` with JSON body `{ to, name, slotStart, slotEnd, businessName }`
- Validates the `NOTIFY_BOOKING_SECRET` header matches `process.env.NOTIFY_BOOKING_SECRET`
- Renders a plain-text email body (see template below)
- Sends via Nodemailer using `process.env.GW_SMTP_USER` / `process.env.GW_SMTP_PASS`
(same credentials as `api/_lib/email.js`)
- Returns `{ ok: true }` or `{ ok: false, error }`

Confirmation email template:

```
Subject: Your booking is confirmed — [Day D Month] at [H:MM am/pm]

Hi [Name],

Your booking is confirmed:

  [Day, D Month YYYY]
  [H:MM am/pm] — [H:MM am/pm] (30 minutes)

If you need to change anything, reply to this email.

— [businessName]
```

Format the date/time in `Europe/London` locale (use `Intl.DateTimeFormat`).

**4.2 — Add `NOTIFY_BOOKING_SECRET` to Vercel environment variables**
(set in Vercel dashboard → Settings → Environment Variables)

**4.3 — Create `workers/booking/src/email.js`**

```js
// Calls the Vercel notify-booking route. Fire-and-forget via ctx.waitUntil.
// Does not throw — logs error to console if the Vercel call fails.
export async function sendConfirmationEmail(env, { to, name, slotStart, slotEnd, businessName }) { ... }
```

Uses `fetch('https://neobookworm.uk/api/notify-booking', { method: 'POST', ... })`.
Includes `X-Notify-Secret: env.NOTIFY_BOOKING_SECRET` header.

**4.4 — Wire email into the POST `/hetyres/book` handler** in `index.js`

After step 5 (insertBooking), add:

```js
ctx.waitUntil(sendConfirmationEmail(env, { to: email, name, slotStart, slotEnd, businessName: config.displayName }));
```

Using `ctx.waitUntil` means the email send does not block the response.

**4.5 — Add `NOTIFY_BOOKING_SECRET` as a Worker secret**

```bash
npx wrangler secret put NOTIFY_BOOKING_SECRET
```

Use the same value as the Vercel env var.

### Gate 4 — criteria to pass before Session 5

- [x] After a successful `POST /hetyres/book`, a confirmation email arrives in the
  ```
  `to` address inbox within 60 seconds
  ```
- [x] Email subject line matches the template (correct date formatting)
- [x] `POST /hetyres/book` response time is not delayed by the email send
  (a booking makes two synchronous Google Calendar API calls before responding,
  so expect roughly 1–3s total — that is normal; the email is fired via
  `ctx.waitUntil` *after* the response and must not add to that time)
- [x] A POST with an invalid `NOTIFY_BOOKING_SECRET` returns 401 from the Vercel route
- [x] Vercel function logs (Vercel dashboard → Functions tab) show the send

---

## Session 5 — Booking UI

### Context to load into Cursor

```
workers/booking/src/index.js
workers/booking/src/config.js
docs/booking-widget-build.md
```

Also tell Cursor:

> The UI is an HTML page served by the Worker at GET /hetyres.
> It will be loaded inside an  on client sites.
> Design system: navy #0f1f3d background, amber #f5a623 accent, white text,
> DM Sans font (self-hosted on neobookworm.uk — load from /fonts/dm-sans-400.woff2
> etc via a  to [https://neobookworm.uk/fonts.css](https://neobookworm.uk/fonts.css)).
> No JS frameworks. Vanilla JS only.
> The iframe is typically 100% wide, 70vh tall on desktop.
> The page must work well at 320px width (mobile).
> On successful booking, fire: window.parent.postMessage('booking-confirmed', '*')

### Tasks

**5.1 — Create `workers/booking/src/ui.js*`*

Export a single function:

```js
export function renderBookingPage(config, slug) {
  return `<!DOCTYPE html>...`;
}
```

The HTML page has two views, toggled by JS (no page reload):

**View A — Date + time picker**

Top: short heading "Book a slot at [config.displayName]"

Calendar strip: show the next 14 days as day-of-week + date buttons
(e.g. "Mon 23 Jun"). Sundays are always disabled. All other days are
initially enabled; after slots load, days with zero slots are disabled.

On page load, auto-fetch slots for today (if working day) or tomorrow.

When a day button is clicked:

- `GET /[slug]/slots?date=YYYY-MM-DD`
- Show a loading state while fetching
- Render time slot buttons (e.g. "08:30", "09:00") in a grid below
- If `slots` array is empty, show "No slots available — try another day"

When a time slot button is clicked:

- Highlight it as selected
- Show a "Continue →" button

**View B — Your details form**

Show selected date + time at the top as a summary (e.g. "Monday 23 June at 08:30").
Back button returns to View A with the same day still selected.

Fields:

- Name (text, required)
- Email (email, required)
- Phone (tel, required)
- Note (textarea, optional, placeholder "e.g. tyre size, vehicle reg")
- **Honeypot:** a `company` text input hidden via CSS (`position:absolute;left:-9999px`),
`tabindex="-1"`, `autocomplete="off"`. Real users never see or fill it; bots do.
Include its value in the POST body — the server (3.2b) silently rejects if filled.
- Submit button "Confirm booking"

On submit:

- Disable the submit button immediately (prevent double-submit)
- Show a spinner
- `POST /[slug]/book` with JSON body
- On `{ ok: true }`: fire `window.parent.postMessage('booking-confirmed', '*')`
then replace the form with a brief "Booking confirmed — check your email" message
- On `{ ok: false, error: 'slot_taken' }`: show "Sorry, that slot was just taken.
Picking another..." then auto-navigate back to View A for the same date
- On other error: show "Something went wrong — please try again" and re-enable submit

**5.2 — Update `GET /hetyres` route in `index.js`**

```js
import { renderBookingPage } from './ui.js';
import { getConfig } from './config.js';

// In the fetch handler:
if (pathname === `/${slug}` && method === 'GET') {
  const config = getConfig(slug);
  if (!config) return new Response('Not found', { status: 404 });
  return new Response(renderBookingPage(config, slug), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
```

**5.3 — Style requirements**

- Navy background throughout (matches NeoBookworm iframe embed context)
- Selected day button and selected time button use amber `#f5a623` fill
- Disabled day buttons are visibly muted (opacity 0.35)
- Form inputs: white background, 1px navy border, dark text
- Submit button: amber fill, navy text, disabled state visibly greyed
- No external CSS or JS dependencies — everything inline in the `<style>` block

### Gate 5 — criteria to pass before Session 6

- [x] `GET /hetyres` in a browser renders the booking page without console errors
- [x] Clicking a day loads real slots from the `/slots` endpoint (visible in
  ```
  browser DevTools Network tab)
  ```
- [x] Clicking a slot and submitting the details form creates a real Google
  ```
  Calendar event and sends a confirmation email
  ```
- [x] Submitting the form twice rapidly does NOT create duplicate bookings
  ```
  (the 409 path returns the user to date selection)
  ```
- [ ] On mobile (375px wide) the date strip scrolls horizontally, the time
  ```
  buttons are at least 44px tap targets, form inputs are full-width
  ```
- [ ] `window.parent.postMessage('booking-confirmed', '*')` fires on success —
  ```
  verify by opening the URL directly and adding a listener in the console:
  `window.addEventListener('message', e => console.log(e.data))`
  then completing a booking
  ```

---

## Session 6 — Deployment and smoke test

### Context to load into Cursor

```
workers/booking/wrangler.toml
docs/booking-widget-build.md
```

Also tell Cursor:

> This is a deployment and verification session — no new features.
> The production URL for the Worker is
> `https://neobookworm-booking.nickbarrett.workers.dev` — use this throughout.
> `booking.neobookworm.uk` is deferred until DNS is moved to Cloudflare (see
> note below).

### Note on `booking.neobookworm.uk`

The custom domain requires `neobookworm.uk` nameservers to be managed by
Cloudflare. They are currently at Krystal, so Cloudflare cannot issue a
certificate or route requests for the subdomain. The CNAME record added in
Krystal resolves correctly but there is nothing on the Cloudflare side to
receive the requests.

**For Phase 1, use the `workers.dev` URL throughout** — it is fully functional
and there is no user-facing difference. Moving DNS to Cloudflare is a separate
task tracked in the outstanding items table in CLAUDE.md; once done, add
`routes = [{ pattern = "booking.neobookworm.uk", custom_domain = true }]` to
`wrangler.toml` and redeploy.

### Tasks

**6.1 — Deploy the Worker**

```bash
cd workers/booking
npx wrangler deploy
```

Confirm the Worker responds at:
```
https://neobookworm-booking.nickbarrett.workers.dev/hetyres/slots?date=YYYY-MM-DD
```

**6.2 — Apply D1 migration to remote**

```bash
npx wrangler d1 migrations apply bookings --remote
```

**6.3 — Create a test embed page** at `booking-test.html` in the root of
NeoBookworm.uk (not linked from nav — for testing only, delete after
Session 6 is complete):

```html
<!DOCTYPE html>
<html>
<head><title>Booking test</title></head>
<body style="margin:0;background:#111">
  <iframe
    src="https://neobookworm-booking.nickbarrett.workers.dev/hetyres"
    style="width:100%;height:70vh;border:0;display:block"
    title="Booking test">
  </iframe>
  <script>
    window.addEventListener('message', function(e) {
      if (/booking|confirmed/i.test(String(e.data))) {
        document.body.innerHTML = '<h1 style="color:white;padding:2rem">postMessage received ✓</h1>';
      }
    });
  </script>
</body>
</html>
```

Deploy to Vercel and open `https://neobookworm.uk/booking-test.html`.

### Gate 6 — production smoke test (all must pass)

- [ ] `https://neobookworm-booking.nickbarrett.workers.dev/hetyres` loads the booking UI
- [ ] `https://neobookworm-booking.nickbarrett.workers.dev/hetyres/slots?date=YYYY-MM-DD`
      returns real slot data (use a valid upcoming weekday)
- [ ] A complete booking via the production URL creates a Google Calendar event
      and sends a confirmation email to the address entered
- [ ] The test embed page at `neobookworm.uk/booking-test.html` shows the
      postMessage received message after a booking
- [ ] The D1 `bookings` table (remote) has the test booking row:
      `npx wrangler d1 execute bookings --remote --command "SELECT * FROM bookings ORDER BY created_at DESC LIMIT 5"`
- [ ] Delete `booking-test.html` from the repo and redeploy

---

## Phase 1 complete — what you have

At the end of Session 6 you have:

- A live booking widget at `https://neobookworm-booking.nickbarrett.workers.dev/hetyres`
- It reads real calendar availability from your Google Calendar
- Bookings create calendar events and send confirmation emails
- It embeds in any site as a single `<iframe src="...">`
- Every booking is recorded in D1
- Custom domain `booking.neobookworm.uk` ready to activate once DNS moves to Cloudflare

---

## Roadmap beyond Phase 1 (not in scope now)

Ordered roughly by value-to-effort. Each is a self-contained increment that
keeps the Phase 1 architecture intact. Don't build any of these until Phase 1 is
proven in production with a real HE Tyres booking.

### Phase 2 — Make it real for one paying client

1. **Cancellation & reschedule.** Add a signed token to the confirmation email
  (`/[slug]/manage/:token`). Cancel sets `status='cancelled'` (frees the slot via
   the partial index) and deletes the Google event. Reschedule = cancel + rebook
   in one flow. This is the #1 thing customers expect and Koalendar provides it.
2. `**.ics` attachment** on the confirmation email so the customer gets a tappable
  "add to calendar" entry without us sending a cold Google invite. Closes the gap
   left by `sendUpdates: "none"`.
3. **Business-side notification.** A short email/Push to Nick (or the client) on
  each new booking, separate from the calendar entry — so they don't have to be
   watching the calendar. Reuse the `api/notify-booking` route with a second
   recipient.
4. **Two-way sync hardening.** If the business deletes/moves the event in Google,
  the slot should free up. A scheduled Worker (cron, every 15 min) reconciles
   `confirmed` D1 rows against Google event state — mark missing events
   `cancelled`. (You already run this cron pattern in `workers/landing-enquiry`.)

### Phase 3 — Multi-client product

1. **Config in D1.** Move `SLUG_CONFIG` to a `booking_pages` table (slug,
  display_name, calendar_id, working_hours JSON, slot_duration, lead/advance,
   buffers, blackout dates). `getConfig` becomes a cached D1 read. This is the
   unlock that lets you onboard a new client without a code deploy.
2. **Per-client Google connection.** OAuth flow so each client connects *their
  own* Google account (store their refresh token per `booking_pages` row,
   encrypted). Removes you as the calendar owner / single point of failure.
3. **Buffers, lead time, blackout dates, holidays** as per-client config —
  e.g. 15-min buffer between jobs, "closed bank holidays", annual-leave blocks.
4. **Multiple appointment types** with different durations/prices (e.g. "tyre
  fitting 30m" vs "full geometry 90m") — a `services` concept the customer
   picks before the calendar.

### Phase 4 — Capacity, payments, dashboard

1. **Multiple resources / parallel capacity.** HE Tyres' two bays = two
  simultaneous bookings per slot. Generalise the unique index to
   `(slug, slot_start, resource_index)` and config `capacity: 2`. The slots
   endpoint counts confirmed bookings per slot against capacity.
2. **Deposits / payment.** Optional Stripe deposit to cut no-shows — you already
  have Stripe in the onboarding pipeline. Hold the slot `pending` until payment,
    expire after N minutes if unpaid.
3. **Reminder emails/SMS.** Cron-driven reminder 24h before (email is free; SMS
  via a provider if clients want it — no-shows are the tyre trade's real cost).
4. **Bookings in the existing dashboard.** A "Bookings" view in `dashboard.html`
  reading the `bookings` D1 — list/upcoming/cancel, per client. Ties this into
    the tooling you already maintain rather than a separate admin.

### Cross-cutting (worth keeping in mind from the start)

- **Accessibility** — the date/time picker must be keyboard-navigable and
screen-reader labelled; it's an interactive control, not just content. Hold it
to the same bar as the rest of the site (CLAUDE.md targets accessibility 100).
- **GDPR / retention** — bookings hold name/email/phone. Decide a retention window
(e.g. purge `cancelled`/past rows after 12 months via the reconcile cron) and
note it in the client's privacy policy.
- **Observability** — log booking failures (calendar_error, invalid_grant) somewhere
you'll actually see them. An `invalid_grant` is the canary for the refresh-token
expiry trap — alert on it.

---

## Appendix — useful test commands

```bash
# Check D1 bookings (local)
npx wrangler d1 execute bookings --local --command "SELECT * FROM bookings ORDER BY created_at DESC LIMIT 10"

# Check D1 bookings (remote/production)
npx wrangler d1 execute bookings --remote --command "SELECT * FROM bookings ORDER BY created_at DESC LIMIT 10"

# Delete a test booking (local)
npx wrangler d1 execute bookings --local --command "DELETE FROM bookings WHERE id='xxx'"

# Tail Worker logs (production)
npx wrangler tail neobookworm-booking

# Test slots endpoint locally
curl "http://localhost:8787/hetyres/slots?date=$(date -I)"

# Test book endpoint locally
curl -X POST http://localhost:8787/hetyres/book \
  -H "Content-Type: application/json" \
  -d '{"slot":"2026-06-23T09:00:00","name":"Test User","email":"test@example.com","phone":"07700900000","note":"test booking"}'
```

