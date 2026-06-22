# NeoBookworm — Go-Live Checklist

## First-Time Production Setup (run once)

These steps set up the full staging + production infrastructure from scratch.
They do not need to be repeated for routine changes.

### Step 1 — Provision staging resources

```bat
scripts\setup-staging.bat
```

This creates:

- D1 database `bookings-staging`
- D1 database `neobookworm-enquiries-staging`
- KV namespace `TOKEN_CACHE-staging`

Follow the prompts: copy each printed ID into the matching placeholder in the
relevant `wrangler.toml` file before pressing Enter to continue.

Placeholders to fill in `workers/booking/wrangler.toml`:

```toml
[env.staging]
...
database_id = "PASTE_BOOKINGS_STAGING_DATABASE_ID_HERE"
...
id = "PASTE_TOKEN_CACHE_STAGING_KV_ID_HERE"
```

Placeholder to fill in `workers/landing-enquiry/wrangler.toml`:

```toml
[env.staging]
...
database_id  = "PASTE_ENQUIRIES_STAGING_DATABASE_ID_HERE"
```

- [x] IDs pasted into both wrangler.toml files
- [x] Commit the updated wrangler.toml files to Git

### Step 2 — Apply migrations to staging

```bat
scripts\run-migrations.bat staging
```

- [x] Migrations applied successfully to both staging databases

### Step 3 — Set Vercel environment variables

In the **Vercel dashboard → Project Settings → Environment Variables**, set:


| Variable             | Environment | Value                                                         |
| -------------------- | ----------- | ------------------------------------------------------------- |
| `BOOKING_WORKER_URL` | Preview     | `https://neobookworm-booking-staging.nickbarrett.workers.dev` |
| `BOOKING_WORKER_URL` | Production  | `https://neobookworm-booking.nickbarrett.workers.dev`         |


The `BOOKING_WORKER_URL` variable is read by `api/_lib/booking.js`. When unset
it falls back to the production Workers URL, so the Production entry is optional
but recommended for explicitness.

There is no equivalent variable for the landing-enquiry Worker — its URL is
hardcoded in the frontend HTML pages. If you add a staging landing page in
future, add a `LANDING_ENQUIRY_WORKER_URL` variable using the same pattern.

- [x] `BOOKING_WORKER_URL` set for Preview environment
- [x] `BOOKING_WORKER_URL` set for Production environment (optional but explicit)

### Step 4 — Set Worker secrets for staging

Staging Workers need the same secrets as production. Set each secret:

```bat
REM From workers\booking\
npx wrangler secret put ADMIN_SECRET --env staging
npx wrangler secret put GOOGLE_CLIENT_ID --env staging
npx wrangler secret put GOOGLE_CLIENT_SECRET --env staging
npx wrangler secret put GOOGLE_REFRESH_TOKEN --env staging
npx wrangler secret put GW_SMTP_USER --env staging
npx wrangler secret put GW_SMTP_PASS --env staging

REM From workers\landing-enquiry\
npx wrangler secret put ONBOARDING_INTAKE_SECRET --env staging
npx wrangler secret put GW_SMTP_USER --env staging
npx wrangler secret put GW_SMTP_PASS --env staging
npx wrangler secret put ANTHROPIC_API_KEY --env staging
```

- [x] All secrets set for staging booking Worker
- [x] All secrets set for staging landing-enquiry Worker

### Step 5 — Deploy Workers to staging

```bat
scripts\deploy.bat staging
```

- [x] Both Workers deployed to staging successfully

### Step 6 — End-to-end test on staging

Use the staging Worker URLs directly, or push a feature branch and use the
Vercel preview URL (which points at staging via the `BOOKING_WORKER_URL` env var).

- [ ] Booking flow: create a test booking, confirm email arrives, check D1 row
- [ ] Landing enquiry form: submit a test enquiry, confirm email + D1 row
- [ ] Admin dashboard: check test data appears correctly

### Step 7 — Apply migrations to production

If this is a first-time setup, production migrations have not been run yet:

```bat
scripts\run-migrations.bat production
```

- [ ] Migrations applied to both production databases

### Step 8 — Deploy Workers to production

```bat
scripts\deploy.bat production
```

- [ ] Both Workers deployed to production
- [ ] Vercel main branch deployment is live (check Vercel dashboard)

### Step 9 — Smoke test production

- [ ] `https://neobookworm-booking.nickbarrett.workers.dev/<tenant>/slots` returns data
- [ ] `https://neobookworm-landing-enquiry.nickbarrett.workers.dev` responds
- [ ] Submit a real booking on `neobookworm.uk/contact` and confirm it arrives

---

## Ongoing Change Deployment

Follow this for every routine code change after the one-time setup above is done.

### For Cloudflare Worker changes

- [ ] Create a Git branch: `git checkout -b my-change`
- [ ] Make and commit the change
- [ ] Deploy to staging: `scripts\deploy.bat staging`
- [ ] Test manually against the staging Worker URL
- [ ] Push the branch → Vercel generates a preview URL (talks to staging Workers)
- [ ] Test the Vercel preview URL end-to-end
- [ ] Merge to `main` → Vercel auto-deploys the frontend to production
- [ ] Deploy Workers to production: `scripts\deploy.bat production`
- [ ] Smoke test production (booking, enquiry form)

### For D1 schema changes (new migration)

Before deploying a new migration, always test it on staging first:

- [ ] Add the migration file to the relevant `migrations/` folder
- [ ] Apply to staging: `scripts\run-migrations.bat staging`
- [ ] Verify schema change is correct in staging
- [ ] Deploy Worker to staging: `scripts\deploy.bat staging`
- [ ] Test end-to-end on staging
- [ ] Apply to production: `scripts\run-migrations.bat production`
- [ ] Deploy Worker to production: `scripts\deploy.bat production`

### For Vercel-only frontend changes

- [ ] Create a Git branch and commit changes
- [ ] Push the branch → Vercel preview URL auto-generated
- [ ] Test the preview URL
- [ ] Merge to `main` → Vercel auto-deploys
- [ ] Verify live site

No Worker deploy needed unless the frontend change depends on new Worker behaviour.

---

## Quick Reference — Worker URLs


| Worker          | Production                                                    | Staging                                                               |
| --------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| booking         | `https://neobookworm-booking.nickbarrett.workers.dev`         | `https://neobookworm-booking-staging.nickbarrett.workers.dev`         |
| landing-enquiry | `https://neobookworm-landing-enquiry.nickbarrett.workers.dev` | `https://neobookworm-landing-enquiry-staging.nickbarrett.workers.dev` |


## Quick Reference — Script Summary


| Script                                  | What it does                                |
| --------------------------------------- | ------------------------------------------- |
| `scripts\setup-staging.bat`             | One-time: creates staging D1 + KV resources |
| `scripts\run-migrations.bat staging`    | Apply D1 migrations to staging databases    |
| `scripts\run-migrations.bat production` | Apply D1 migrations to production databases |
| `scripts\deploy.bat staging`            | Deploy both Workers to staging              |
| `scripts\deploy.bat production`         | Deploy both Workers to production           |


