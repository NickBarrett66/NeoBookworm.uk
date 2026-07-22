# Retiring Vercel completely — full runbook

**Status:** Stages 1–4 complete and verified live in production (22 Jul 2026) — all five email endpoints send via the Gmail API from the Cloudflare Worker, and the `.co.uk` redirect no longer touches Vercel. **Stage 5b/5c also done (22 Jul 2026):** `api/` and `vercel.json` deleted, `VERCEL_BRIDGE_URL`/`BRIDGE_SECRET` Worker secrets removed. One deviation from the original plan: `api/vdg-lookup.js` + `api/_lib/vdg.js` (the VDG tyre-lookup used by `reg-test.html` for the TyreTrust mailshot) turned out to have **no** Cloudflare equivalent, unlike the plan's assumption that everything except the five email endpoints was already a dormant duplicate — ported to `worker/_lib/vdg.js` + `worker/routes/vdg-lookup.js` before deleting `api/`, so the feature wasn't lost. **Still open (manual, dashboard-only):** set `VDG_API_KEY` as a Worker secret (the old Vercel value couldn't be pulled programmatically — `vercel env pull` returned every value blank for this project/account, a CLI quirk, not evidence the key itself is empty); Stage 5a (remove the `bridge` DNS record); Stage 5d (disconnect + delete the `neo-bookworm-uk` Vercel project). Written 1 Jul 2026.
**Goal:** Remove the last dependencies on Vercel so `neobookworm.uk` and all of its
email run entirely on Cloudflare + Google Workspace. Email moves from SMTP (via the
Vercel bridge) to the **Gmail HTTP API**, sending as `nick@neobookworm.uk`.

**Decision already made:** the three notifications that currently send from
`neobookworm@icloud.com` will switch to sending as `nick@neobookworm.uk`. That is only
a historical quirk and is fine to change.

---

## How this document is organised

The work is split into **six stages**, each sized to fit one Cursor / Claude Code
session (or one sitting of manual work). Every stage has:

- **Type** — 🖐️ Manual (you, in a browser/terminal) or 🤖 AI-assisted (a coding session).
- **Goal** — what "done" looks like.
- **Context to load** — for AI stages, the exact files to open / @-mention so the
  assistant has what it needs and nothing it doesn't.
- **Kickoff prompt** — copy-paste to start the session.
- **Manual tasks** — click-by-click where relevant.
- **Test & verify** — how to prove it worked before moving on.
- **Rollback** — how to undo.

**Golden rule:** do the stages **in order**, and **leave the Vercel bridge fully
deployed** until Stage 6. Until then every change falls back to the bridge, so nothing
is irreversible.

| Stage | Type | What it does |
|---|---|---|
| 0 | 🖐️ Manual | Google Cloud project + Gmail API credentials + Worker secrets |
| 1 | 🤖 AI | Gmail sender helper + onboarding email (the core) |
| 2 | 🤖 AI | Migrate `contact` + `notify-landing-enquiry` (notifications to you) |
| 3 | 🤖 AI | Migrate `he-tyres-enquiry` + `notify-booking` (customer-facing) |
| 4 | 🖐️ Manual | Move the `.co.uk` redirect off Vercel |
| 5 | 🤖 AI + 🖐️ Manual | Teardown: delete `api/`, remove secrets, delete Vercel project |

At the end of Stages 1–3 the Vercel `api/send-email` and the four forwarders are no
longer used. Stage 4 removes the `.co.uk` link. Stage 5 deletes everything.

---

## What still ties you to Vercel (the full list)

Only **five email endpoints** and **one redirect**. Everything else on Vercel
(`dashboard`, `intake`, `portal`, `portal-action`, `booking-asset`, `reg-lookup`,
`vdg-lookup`) is a **dormant duplicate** already served live by the Cloudflare Worker —
those need no migration, they are simply deleted with the project in Stage 5.

| Endpoint | Currently sends as | Becomes |
|---|---|---|
| `api/send-email` | Gmail `nick@` (SMTP) | Gmail API `nick@` |
| `api/notify-booking` | Gmail `nick@` (SMTP) | Gmail API `nick@` |
| `api/contact` | iCloud `neobookworm@icloud.com` | Gmail API `nick@` |
| `api/he-tyres-enquiry` | iCloud | Gmail API `nick@` |
| `api/notify-landing-enquiry` | iCloud | Gmail API `nick@` |
| `.co.uk` apex → Vercel 307 | Vercel | Cloudflare redirect / Krystal forwarding |

> **No frontend changes needed.** Every browser still POSTs to `neobookworm.uk/api/...`;
> those URLs already hit the Cloudflare Worker. We are only changing what the Worker
> does internally (send directly instead of forwarding to Vercel).

---

# Stage 0 — Google Cloud & Gmail credentials  🖐️ Manual

**Goal:** produce three secret values — `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
`GMAIL_REFRESH_TOKEN` — and load them into the Cloudflare Worker. Nothing in the repo
changes in this stage. Do this first; every later stage depends on it.

This is the fiddliest manual stage, so it is written out in full. Expect ~20–30 minutes.

### 0.1  Create a Google Cloud project

1. Go to **https://console.cloud.google.com** and sign in as **nick@neobookworm.uk**
   (top-right avatar — make sure it is the Workspace account, *not* a personal Gmail).
2. In the top bar, click the **project dropdown** (says "Select a project") →
   **New Project**.
3. Name it `NeoBookworm Mail`. Leave "Location" as **No organization** if that is the
   only option, or your `neobookworm.uk` org if shown. Click **Create**.
4. Wait for the notification, then make sure the project dropdown now shows
   **NeoBookworm Mail** (select it if not).

### 0.2  Enable the Gmail API

1. Left menu (☰) → **APIs & Services → Library**.
2. Search **Gmail API** → click it → **Enable**.
3. Wait until it shows as enabled (you land on the Gmail API "Overview" page).

### 0.3  Configure the OAuth consent screen — **Internal** (important)

> ⚠️ **UI note (checked 1 Jul 2026):** Google renamed and reorganised this. There is no
> longer an "OAuth consent screen" menu item — it now lives under **APIs & Services →
> Google Auth Platform**, split into three tabs: **Branding**, **Audience**, **Clients**.
> The steps below reflect the new flow.

1. Left menu (☰) → **APIs & Services → Google Auth Platform**.
2. If you see **"Google Auth Platform not configured yet"**, click **Get Started**.
3. **App Information:** App name `NeoBookworm Mail`, User support email = your address →
   **Next**.
4. **Audience:** choose **Internal** → **Next**.
   - ⚠️ **This must be Internal.** Internal apps need no Google review, and — critically
     — their refresh tokens **never expire**. If you pick **External** (whose only
     non-published state is "Testing"), the refresh token silently dies after **7 days**
     and email stops. If **Internal** is greyed out / not offered, you are signed into
     the wrong (non-Workspace) account — go back to 0.1.
5. **Contact Information:** your email → **Next** → agree to the policy → **Create**.
6. *(Optional for Internal, but tidy)* Go to the **Data Access** tab → **Add or remove
   scopes** → filter `gmail.send` → tick **`.../auth/gmail.send`** → **Update → Save**.
   The Playground in 0.5 will request this scope at run time regardless, so this step is
   not strictly required for an Internal app — but it documents intent.

### 0.4  Create the OAuth client — **Web application** type

> Use **Web application** (not "Desktop"). The Playground requires a registered redirect
> URI, which the Desktop client type does not let you set.

1. **Google Auth Platform → Clients** tab → **Create client** (or **APIs & Services →
   Credentials → Create credentials → OAuth client ID** — both reach the same place).
2. **Application type: Web application**. Name: `NeoBookworm Mail Client`.
3. Under **Authorised redirect URIs → Add URI**, paste **exactly** (no trailing slash):
   `https://developers.google.com/oauthplayground`
4. **Create**.
5. A dialog shows **Client ID** and **Client secret**. Copy both into a scratch note —
   you need them in the next step and in 0.6. (You can re-open them any time from the
   **Clients** tab.)

### 0.5  Mint the refresh token (OAuth 2.0 Playground)

1. Go to **https://developers.google.com/oauthplayground**.
2. Click the **gear icon** (⚙, top-right) and set, in this panel:
   - ✅ **Use your own OAuth credentials** → paste your **Client ID** and **Client
     secret** from 0.4.
   - ✅ **Access type: Offline** (this is what makes Google return a refresh token).
   - ✅ **Force prompt: Consent screen** (forces a *fresh* refresh token every time, so
     you don't get an access-token-only response).
   - Close the panel.
3. In the **left "Step 1" box**, in the **"Input your own scopes"** field, enter exactly:
   `https://www.googleapis.com/auth/gmail.send`
4. Click **Authorise APIs**. A Google sign-in opens → choose **nick@neobookworm.uk** →
   you may see "Google hasn't verified this app" because it's your own Internal app —
   click **Continue** → **Allow**.
5. You return to the Playground on **Step 2**. Click **Exchange authorisation code for
   tokens**.
6. In the response panel you will see a **Refresh token** (starts with `1//`). **Copy
   it.** This is `GMAIL_REFRESH_TOKEN`.
   - If you only see an access token and no refresh token, you missed **Access type:
     Offline** / **Force prompt** in step 2 — set both and redo from 0.5.
   - The refresh token is shown **once**. If you lose it, just redo 0.5 to mint a new one
     (old ones keep working until explicitly revoked).

You now have all three values:
- `GMAIL_CLIENT_ID` (ends in `.apps.googleusercontent.com`)
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN` (starts `1//`)

### 0.6  Load the secrets into the Worker

In a terminal at the repo root (`C:\Users\Nick\Dropbox\00 Neobookworm\NeoBookworm.uk`),
run each command and paste the value when prompted:

```bash
npx wrangler secret put GMAIL_CLIENT_ID --name neobookworm-uk
npx wrangler secret put GMAIL_CLIENT_SECRET --name neobookworm-uk
npx wrangler secret put GMAIL_REFRESH_TOKEN --name neobookworm-uk
```

Confirm they're stored (values are not shown, only names):

```bash
npx wrangler secret list --name neobookworm-uk
```

You should see `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` in the list.

> These are **runtime Worker secrets** read by the deployed Worker — they are *not* build
> secrets, so the GitHub Actions CI deploy is unaffected and needs no change. (For local
> `wrangler dev` testing, put the same three values in a `.dev.vars` file at the repo
> root — never commit it.)

### 0.7  (Optional but recommended) prove the credentials work before any code

Save this as `scratch-gmail-test.mjs` **outside** the repo, fill in the three values,
and run `node scratch-gmail-test.mjs your.other.address@example.com`. If a plain-text
email arrives, your credentials are correct and Stage 1 will "just work".

```js
const CLIENT_ID = '...', CLIENT_SECRET = '...', REFRESH_TOKEN = '...';
const to = process.argv[2];
const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'refresh_token', client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, refresh_token: REFRESH_TOKEN }),
})).json();
const raw = Buffer.from(
  `From: "Nick at NeoBookworm" <nick@neobookworm.uk>\r\nTo: ${to}\r\n` +
  `Subject: Gmail API test\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n` +
  `It works.`).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
  method: 'POST', headers: { Authorization: `Bearer ${tok.access_token}`,
  'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) });
console.log(r.status, await r.text());
```

**Delete this scratch file afterwards — it contains your secrets.**

### Stage 0 rollback
Nothing to roll back — no code or DNS changed. If you mis-created anything, delete the
Google Cloud project and start over; the Worker secrets can be overwritten by re-running
0.6.

---

# Stage 1 — Gmail sender + onboarding email  🤖 AI session

**Goal:** add a reusable Gmail sender and rewrite `worker/_lib/email.js` so all
template/onboarding email is sent directly from the Worker via the Gmail API. The bridge
stays in place untouched as a fallback.

### Context to load
Open / @-mention these so the assistant has the full picture:
- `docs/gmail-api-bridge-migration.md` (the detailed Phase-1 spec — the code is in here)
- `worker/_lib/email.js` (the file being rewritten)
- `worker/_lib/d1.js` (for the `queryD1` / `enquiriesDb` signatures)
- `worker/_lib/templates.js` (renderTemplate — confirm it's the local renderer)
- `wrangler.toml` (to confirm the `SUMMARY_CACHE` KV binding + secrets)
- One caller for context, e.g. `worker/_lib/acknowledge.js`

### Kickoff prompt
```
Implement Phase 1 of docs/gmail-api-bridge-migration.md on a new branch
called gmail-phase-1. Create worker/_lib/gmail.js exactly as specified and
rewrite worker/_lib/email.js to render + send + log locally via the Gmail API,
keeping the exact same exported function signatures (sendTemplated, sendRendered)
so all existing callers work unchanged. Do NOT touch the Vercel api/ files or
the four forwarder routes in this stage — the bridge must remain as a fallback.
Do not deploy; stop after the code compiles so I can review the diff.
```

### Manual tasks
- **Prerequisite:** Stage 0 complete (the three `GMAIL_*` secrets are set).
- **Review the diff**, then deploy:
  ```bash
  git checkout gmail-phase-1
  npx wrangler deploy          # or merge to main and let CI deploy
  ```

### Test & verify
1. From the **dashboard**, use **Send template** against a test client whose email is
   **your own** address. Send one to a Gmail address and one to a non-Google address.
2. In Gmail, open the received email → **⋮ → Show original**. Confirm
   **SPF: PASS, DKIM: PASS, DMARC: PASS**, signed by `neobookworm.uk`. (Identical to
   before — this proves deliverability didn't regress.)
3. Check the D1 `email_log` has a new row with `status = 'sent'`:
   ```bash
   npx wrangler d1 execute neobookworm-enquiries --remote \
     --command="SELECT template, recipient, status, created_at FROM email_log ORDER BY created_at DESC LIMIT 5;"
   ```
4. Let real onboarding emails flow for a few days and watch for `status='failed'` rows.

### Rollback
`git revert` the merge (or `npx wrangler rollback`). Sends fall straight back through the
bridge. Nothing else to undo.

---

# Stage 2 — Migrate `contact` + `notify-landing-enquiry`  🤖 AI session

**Goal:** move the two "notify Nick" endpoints off the bridge. Both currently send from
iCloud; they will now send as `nick@neobookworm.uk` via the Gmail sender built in Stage 1.
These go to your own inbox, so the identity change is invisible in practice.

### Context to load
- `worker/_lib/gmail.js` (the sender from Stage 1)
- `worker/routes/contact.js` (thin forwarder — to be replaced)
- `api/contact.js` (**the real logic lives here** — field parsing, validation, body build)
- `worker/routes/notify-landing-enquiry.js` (thin forwarder)
- `api/notify-landing-enquiry.js` (the real logic + the digest function)
- `worker/index.js` (to confirm how these routes are dispatched)

### Kickoff prompt
```
On a branch gmail-phase-2, port the logic from api/contact.js and
api/notify-landing-enquiry.js into their Cloudflare worker routes
(worker/routes/contact.js and worker/routes/notify-landing-enquiry.js), replacing
the fetch-to-bridge forwarding. Reuse worker/_lib/gmail.js (sendViaGmail) instead of
nodemailer. Preserve exactly: recipient (TO_EMAIL, default neobookworm@icloud.com),
replyTo = the enquirer's email, subject lines, and body content. The only intended
behaviour change is the From address moving from neobookworm@icloud.com to
nick@neobookworm.uk. Keep the browser-facing request/response shape identical so no
frontend change is needed. Leave the Vercel api/ files in place for now. Don't deploy;
stop at a reviewable diff.
```

### Manual tasks
- **Set the recipient env var on the Worker.** `TO_EMAIL` currently lives on **Vercel**,
  not Cloudflare — the ported code needs it or it will fall back to the hardcoded default
  `neobookworm@icloud.com`. To keep it explicit (and out of git), set it as a Worker
  secret:
  ```bash
  npx wrangler secret put TO_EMAIL --name neobookworm-uk    # e.g. neobookworm@icloud.com
  ```
- Review the diff — check the recipient and `replyTo` are preserved (so replies still go
  to the enquirer, not to you).
- Deploy (`wrangler deploy` or merge to main for CI).

### Test & verify
1. Submit the **contact form** on `neobookworm.uk/contact` with a test message. Confirm:
   the enquiry lands in your inbox; **From** is now `nick@neobookworm.uk`; hitting
   **Reply** addresses the test enquirer.
2. Trigger a **landing-page enquiry** (e.g. submit `plumbers.html`'s form). Confirm the
   alert email arrives.
3. Check `email_log` / server logs for errors:
   ```bash
   npx wrangler tail neobookworm-uk
   ```

### Rollback
`git revert` + redeploy → the routes go back to forwarding to the bridge.

---

# Stage 3 — Migrate `he-tyres-enquiry` + `notify-booking`  🤖 AI session

**Goal:** move the two customer-facing / multi-recipient endpoints. `notify-booking`
already uses the `nick@` identity (no change); `he-tyres-enquiry` moves from iCloud to
`nick@` and also sends a **customer confirmation** email.

### Context to load
- `worker/_lib/gmail.js`
- `worker/routes/he-tyres-enquiry.js` + `api/he-tyres-enquiry.js` (business email **and**
  the customer confirmation email)
- `worker/routes/notify-booking.js` + `api/notify-booking.js` (confirmation /
  cancellation / business-notification renderers, multiple recipients)
- `workers/booking/src/email.js` (the caller that POSTs to `/api/notify-booking`, to
  confirm the payload shape)

### Kickoff prompt
```
On a branch gmail-phase-3, port api/he-tyres-enquiry.js and api/notify-booking.js
into their worker routes (worker/routes/he-tyres-enquiry.js and
worker/routes/notify-booking.js), replacing the bridge forwarding with
worker/_lib/gmail.js. Preserve all recipients, subjects, reply-to values and the
multi-email behaviour (he-tyres sends a business email plus a customer confirmation;
notify-booking sends confirmation/cancellation to the customer and a notification to
the business). The only intended change is From moving to nick@neobookworm.uk (keep the
existing display names, e.g. "HEtyres" and the tenant business name). PRESERVE the spam
honeypot in he-tyres (the early `if (data.website) return ok` check) and any other
validation. Keep request/response shapes identical. Leave Vercel api/ in place. Don't
deploy; stop at a diff.
```

### Manual tasks
- **Set the recipient env vars on the Worker** (currently Vercel-only; otherwise the code
  falls back to defaults `nickbarrett@me.com` / `neobookworm@icloud.com`):
  ```bash
  npx wrangler secret put HE_TYRES_TO_EMAIL --name neobookworm-uk   # e.g. nickbarrett@me.com
  # TO_EMAIL was already set in Stage 2; notify-booking's business notification uses
  # HE_TYRES_TO_EMAIL || TO_EMAIL, so both being present is correct.
  ```
- Review carefully — check the honeypot is preserved. This stage has the only
  externally-visible change (the HE Tyres customer confirmation now comes from
  `nick@neobookworm.uk` with display name "HEtyres"). Confirm you're happy with that.
- Deploy.

### Test & verify
1. Submit an **HE Tyres mobile-fit enquiry** (on the HE Tyres page) with your own email
   as the customer. Confirm **both** emails arrive: the business notification to you, and
   the customer confirmation to the test address.
2. Make a **test booking** through the booking widget. Confirm the customer confirmation
   and the business notification both arrive; then cancel it and confirm the cancellation
   email.
3. `npx wrangler tail neobookworm-uk` while testing to catch any send errors.

### Rollback
`git revert` + redeploy.

> **Checkpoint:** after Stage 3 is deployed and stable for a week or two, **nothing in
> production calls the Vercel bridge for email any more.** Confirm with:
> ```bash
> grep -rn "VERCEL_BRIDGE_URL" worker/ | grep -v node_modules
> ```
> This should now return **no results** (all forwarders replaced). Only then proceed.

---

# Stage 4 — Move the `.co.uk` redirect off Vercel  🖐️ Manual

**Goal:** `neobookworm.co.uk` currently points at Vercel (`216.198.79.1`) which
307-redirects to `.uk`. Remove that so nothing points at Vercel. Two options — **Option A
is less work**; pick one.

Background facts (verified 1 Jul 2026):
- `.co.uk` DNS is hosted at **Krystal Kloud** (nameservers `ns1–ns4.kloudns.co.uk`).
- `.uk` DNS is on **Cloudflare**.

### Option A (recommended) — keep `.co.uk` at Krystal, use Krystal's URL forwarding
1. Log in to your **Krystal** account → **https://my.krystal.uk** (or the Krystal
   control panel where the domain lives).
2. Find **neobookworm.co.uk** → open its **DNS / Zone** management (kloudns).
3. **Delete the apex `A` record** that points to `216.198.79.1` (Vercel), and any `www`
   record that points to Vercel.
4. Look for a **"URL forwarding" / "Web forwarding" / "Redirect"** feature in the Krystal
   panel. Create a forward: **`neobookworm.co.uk` and `www.neobookworm.co.uk` →
   `https://neobookworm.uk`**, type **301 (permanent)**.
   - If Krystal does **not** offer URL forwarding, use **Option B** instead.

### Option B — move `.co.uk` to Cloudflare and use a Redirect Rule
> ⚠️ **Disable DNSSEC first.** If `neobookworm.co.uk` has DNSSEC enabled at Krystal, you
> **must turn it off** (in the Krystal domain panel) and wait for it to clear **before**
> changing nameservers — otherwise the domain can go unreachable during the move. Check
> the Krystal domain settings for a "DNSSEC" toggle; if it's off already, skip this.

1. In **Cloudflare dashboard → Domains → Onboard a domain** (formerly "Add a site") →
   enter `neobookworm.co.uk` → choose the **Free** plan → Cloudflare scans and shows the
   assigned **two nameservers** (e.g. `xxx.ns.cloudflare.com`). Copy them.
2. In **Krystal** (the **registrar** panel for the domain, not the DNS zone), change the
   domain's **nameservers** to the two Cloudflare ones. Save.
3. Wait for propagation (Cloudflare emails you when the zone is "Active" — usually
   1–24 h; can be up to 48 h).
4. In Cloudflare, once active: **Rules → Redirect Rules → Create rule**:
   - When incoming requests match: **Hostname** `equals` `neobookworm.co.uk` **OR**
     `www.neobookworm.co.uk`.
   - Then: **Static redirect** → URL `https://neobookworm.uk` → **301 permanent** →
     preserve path/query if you wish. Deploy.
5. Add one DNS record so the hostname resolves to Cloudflare's edge: a **proxied**
   (orange-cloud) `A` record for `@` → `192.0.2.1` (any placeholder; the redirect rule
   runs at the edge before it's used), and the same for `www`. (Cloudflare's redirect
   rules require the hostname to be proxied.)

### Remove the domains from Vercel
6. **Vercel dashboard → project `neo-bookworm-uk` → Settings → Domains.** Remove
   `neobookworm.co.uk` and `www.neobookworm.co.uk`.

### Test & verify
```bash
curl -sI https://neobookworm.co.uk | grep -iE "^location|^server"
```
Expect a **301** to `https://neobookworm.uk/` and a **Server that is not Vercel**
(Cloudflare, or Krystal's forwarder). Open `http://neobookworm.co.uk` and
`http://www.neobookworm.co.uk` in a browser and confirm both land on `neobookworm.uk`.

### Rollback
Re-add the Vercel `A` record (`216.198.79.1`) at Krystal (Option A) or re-point
nameservers back to Krystal (Option B), and re-add the domains in Vercel. Keep a
screenshot of the original Krystal zone before you change anything.

---

# Stage 5 — Teardown  🤖 AI (repo) + 🖐️ Manual (dashboards)

**Goal:** delete the now-unused code, remove secrets, and delete the Vercel project.
Do this only after Stages 1–4 have been stable in production for a couple of weeks.

### 5a — Remove the bridge DNS record  🖐️ Manual
1. **Cloudflare dashboard → neobookworm.uk → DNS → Records.**
2. Find the record for **`bridge`** (a CNAME/A pointing at Vercel) → **Delete**.
3. Verify it's gone: `curl -sI https://bridge.neobookworm.uk` should now fail to resolve
   or not return a Vercel response.

### 5b — Repo cleanup  🤖 AI session

> ⚠️ **Sequencing:** do step 1 of **5d (disconnect Vercel's GitHub integration)** *before*
> you merge this cleanup. Otherwise the push that deletes `api/` + `vercel.json` triggers
> one last Vercel build against a now-empty project, which may error. Disconnect first,
> then delete the code.

**Context to load:** `vercel.json`, the `api/` directory listing, `worker/index.js`
(to confirm nothing imports from `api/`), `package.json`.

**Kickoff prompt:**
```
On a branch retire-vercel, remove the Vercel deployment from this repo now that all
email is handled natively by the Cloudflare Worker. Delete the entire api/ directory
and vercel.json. First verify nothing under worker/ or workers/ imports from api/ or
references VERCEL_BRIDGE_URL/BRIDGE_SECRET, and show me that check before deleting.
Then remove the now-dead worker secrets from documentation and update CLAUDE.md +
docs to reflect that Vercel is retired and email uses the Gmail API. Also update or
remove any helper scripts that posted to the bridge (e.g. scripts/send-test-email.mjs)
so they use the Gmail path or are deleted. Don't delete anything the Cloudflare Worker
still depends on. Stop at a reviewable diff.
```

### 5c — Remove dead secrets  🖐️ Manual
After the code no longer references them:
```bash
npx wrangler secret delete VERCEL_BRIDGE_URL --name neobookworm-uk
npx wrangler secret delete BRIDGE_SECRET --name neobookworm-uk
```
(The old iCloud `SMTP_*` and `GW_SMTP_*` were Vercel env vars — they disappear when the
Vercel project is deleted in 5d, so nothing to do on the Cloudflare side.)

### 5d — Delete the Vercel project  🖐️ Manual
1. **Vercel dashboard → project `neo-bookworm-uk` → Settings → Git** →
   **Disconnect** the GitHub repo. (Do this first — stops further auto-deploys.)
2. Confirm the site + all email still work for a day (you're now fully on Cloudflare).
3. **Settings → (bottom) → Delete Project.** Type the project name to confirm.
   - Prefer to keep it a while? Just leaving it Disconnected is enough — it will never
     redeploy. Delete only when you're certain.

### Test & verify (final)
- Full smoke test of every email path: onboarding template, contact form, landing
  enquiry, HE Tyres enquiry (+ customer confirmation), a booking (+ cancellation).
- `curl -sI https://neobookworm.uk` → `Server: cloudflare`.
- `curl -sI https://neobookworm.co.uk` → 301 to `.uk`, not Vercel.
- `grep -rn "vercel\|VERCEL_BRIDGE\|bridge.neobookworm" worker/ workers/ | grep -v node_modules`
  → no live references.

### Rollback
Until 5d, everything is reversible: re-add secrets and `git revert` the repo cleanup to
restore the bridge. After the Vercel project is **deleted**, rollback means re-creating
it from the repo history (`api/` + `vercel.json`) and re-adding its env vars — so keep
that commit reachable and don't delete the project until you're confident.

---

## Effort summary

| Stage | Type | Rough time |
|---|---|---|
| 0 | Manual | 20–30 min |
| 1 | AI + review + test | 1–2 h incl. testing |
| 2 | AI + review + test | 1 h |
| 3 | AI + review + test | 1–1.5 h |
| 4 | Manual (+ DNS propagation) | 20 min + wait |
| 5 | AI + manual | 30–45 min (after a soak period) |

**Total hands-on:** roughly half a day to a day, spread across sessions with soak time
between Stage 3 and Stage 5. The Gmail API and all sending are **£0** at your volume
(within the Workspace ~2,000 messages/day limit).

## Cross-references
- Phase 1 code detail: `docs/gmail-api-bridge-migration.md`
- Wider topology: the infrastructure reference doc (in the Company Information / Docs folder).
