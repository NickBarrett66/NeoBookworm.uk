# NeoBookworm — Cloudflare Workers

Two Workers power the dynamic backend of NeoBookworm.uk.

---

## Workers at a glance

### `neobookworm-booking` (`workers/booking/`)

Appointment booking system. Handles slot availability, booking creation,
cancellation, rescheduling, and admin config. Tenants are configured via a
`tenants` table in D1; config is cached in KV.

**Bindings:** D1 (`DB` → `bookings`), KV (`TOKEN_CACHE`)  
**Production URL:** `https://neobookworm-booking.nickbarrett.workers.dev`  
**Staging URL:** `https://neobookworm-booking-staging.nickbarrett.workers.dev`

### `neobookworm-landing-enquiry` (`workers/landing-enquiry/`)

Receives form submissions from trade landing pages (plumbers, electricians, etc.),
writes to D1, emails Nick, and fires the onboarding-intake webhook on Vercel to
trigger acknowledgement emails. Has two cron jobs: a 15-min retry and an 08:00
daily digest.

**Bindings:** D1 (`DB` → `neobookworm-enquiries`)  
**Production URL:** `https://neobookworm-landing-enquiry.nickbarrett.workers.dev`  
**Staging URL:** `https://neobookworm-landing-enquiry-staging.nickbarrett.workers.dev`

---

## Deploying

### Deploy both Workers (recommended)

```bat
REM From repo root:
scripts\deploy.bat staging
scripts\deploy.bat production
```

### Deploy a single Worker manually

```bat
cd workers\booking
npx wrangler deploy                  # production
npx wrangler deploy --env staging    # staging

cd workers\landing-enquiry
npx wrangler deploy                  # production
npx wrangler deploy --env staging    # staging
```

---

## Running migrations

```bat
REM From repo root:
scripts\run-migrations.bat staging
scripts\run-migrations.bat production
```

Or per-Worker:

```bat
cd workers\booking
npx wrangler d1 migrations apply DB --remote                # production
npx wrangler d1 migrations apply DB --env staging --remote  # staging

cd workers\landing-enquiry
npx wrangler d1 migrations apply DB --remote
npx wrangler d1 migrations apply DB --env staging --remote
```

Migration files live in each Worker's `migrations/` folder. Always apply and
test on staging before applying to production.

---

## Adding a new tenant (booking system)

The booking Worker is multi-tenant. Each client gets a slug and their config
lives in the `tenants` D1 table (cached in KV).

1. Insert a row into `tenants` via the admin dashboard (Bookings tab → tenant
   config form), or directly via Wrangler:

```bash
npx wrangler d1 execute bookings --remote --command \
  "INSERT INTO tenants (slug, name, ...) VALUES ('mytenant', 'My Business', ...);"
```

2. The booking form is then live at:
   `https://neobookworm-booking.nickbarrett.workers.dev/mytenant`

3. To embed it on a client site, use an iframe:
```html
<iframe src="https://neobookworm-booking.nickbarrett.workers.dev/mytenant"
        width="100%" height="700" frameborder="0"></iframe>
```

4. To proxy it through `api/_lib/booking.js` on Vercel (for admin actions),
   ensure the `BOOKING_WORKER_URL` env var is set in Vercel dashboard.

**Current tenants:** `hetyres`, `neobookworm`

---

## Environment variable reference

### `workers/booking/` — secrets (set with `wrangler secret put`)

| Secret | Description |
|---|---|
| `ADMIN_SECRET` | Bearer token for admin API routes |
| `GOOGLE_CLIENT_ID` | OAuth2 client ID for Google Calendar |
| `GOOGLE_CLIENT_SECRET` | OAuth2 client secret |
| `GOOGLE_REFRESH_TOKEN` | Long-lived refresh token for calendar access |
| `GW_SMTP_USER` | Google Workspace SMTP username (nick@neobookworm.uk) |
| `GW_SMTP_PASS` | Google Workspace app password |

### `workers/booking/` — vars (in wrangler.toml)

| Var | Production | Staging |
|---|---|---|
| `ENVIRONMENT` | `"production"` | `"staging"` |

### `workers/landing-enquiry/` — secrets (set with `wrangler secret put`)

| Secret | Description |
|---|---|
| `ONBOARDING_INTAKE_SECRET` | Matches `ONBOARDING_INTAKE_SECRET` in Vercel — authenticates the Worker → Vercel webhook |
| `GW_SMTP_USER` | Google Workspace SMTP username |
| `GW_SMTP_PASS` | Google Workspace app password |
| `ANTHROPIC_API_KEY` | Claude API key for the J2 site audit |

### Vercel env vars that reference these Workers

| Vercel var | Environment | Value |
|---|---|---|
| `BOOKING_WORKER_URL` | Preview | staging Worker URL |
| `BOOKING_WORKER_URL` | Production | production Worker URL (or omit — defaults to production) |
| `ONBOARDING_INTAKE_SECRET` | All | Must match the Worker secret of the same name |

---

## First-time staging setup

See `docs/go-live-checklist.md` — First-Time Production Setup section.  
The short version: `scripts\setup-staging.bat` → paste IDs → `scripts\run-migrations.bat staging`.
