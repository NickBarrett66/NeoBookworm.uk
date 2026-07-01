# Migrating the SMTP bridge off Vercel → Gmail API

**Status:** Plan only — not yet implemented. Written 1 Jul 2026.
**Goal:** Remove the dependency on the Vercel SMTP bridge (`api/send-email.js` at
`bridge.neobookworm.uk`) by sending onboarding email directly from the Cloudflare
Worker over the **Gmail HTTP API**, keeping the same `nick@neobookworm.uk` identity
and deliverability. For the wider topology see the infrastructure reference at
`D:\Dropbox\01 Information\Claude\neobookworm-infrastructure.docx`.

---

## Why the bridge exists

Cloudflare Workers cannot open raw TCP SMTP connections (ports 587/465), so today the
Worker `fetch()`-POSTs to a thin Vercel function that does the actual Nodemailer SMTP
send through Google Workspace. To retire Vercel we need an **HTTP-based** send path
from the Worker. The Gmail REST API is exactly that — and since we already pay for
Google Workspace, it costs nothing extra and changes nothing about deliverability.

## Scope — what's in play

The bridge serves **five** Vercel endpoints, not one:

| Endpoint | Purpose | Transport | Replaced by this plan? |
|---|---|---|---|
| `/api/send-email` | Onboarding email (templates) — used by everything via `worker/_lib/email.js` | Google Workspace SMTP | **Phase 1 — yes** |
| `/api/contact` | Contact form | **iCloud** SMTP (different identity) | Phase 2 |
| `/api/he-tyres-enquiry` | HE Tyres enquiry | (forwarder) | Phase 2 |
| `/api/notify-booking` | Booking notification | (forwarder) | Phase 2 |
| `/api/notify-landing-enquiry` | Landing enquiry notify | (forwarder) | Phase 2 |

- **Phase 1 (core):** rewrite `worker/_lib/email.js` to render + send + log *inside the
  Worker* via the Gmail API. All six onboarding call-sites (`dashboard`,
  `portal-action`, `acknowledge`, `audit`, `intake-shared`, and the dashboard
  "Send template" path) already go through that one file, so this single change
  migrates **all onboarding email** off Vercel at once. After it, `/api/send-email`
  on Vercel is dead code.
- **Phase 2 (optional, to delete Vercel entirely):** migrate the four forwarder routes
  and repoint the `.co.uk` redirect (see [Phase 2](#part-6--full-vercel-retirement-phase-2-optional)).

**Deliverability is unchanged** — still sending as `nick@neobookworm.uk` through
Google, so the existing SPF / DKIM (`google._domainkey`) / DMARC keep passing.
**No DNS changes.**

---

## Auth approach — OAuth2 refresh token (recommended)

A single stored refresh token for `nick@neobookworm.uk` with the `gmail.send` scope.
The Worker exchanges it for a 1-hour access token (cached in the existing
`SUMMARY_CACHE` KV) and calls the Gmail REST API.

> **Critical:** choose **User type = Internal** on the OAuth consent screen (available
> because `neobookworm.uk` is a Workspace org). Internal apps need no Google
> verification **and their refresh tokens don't expire**. "External / Testing" refresh
> tokens silently die after 7 days — a classic trap.

**Alternative:** a service account with domain-wide delegation avoids storing a
refresh token, but needs Workspace-admin DWD setup and RS256 JWT signing in the
Worker. More moving parts; only worth it if a stored refresh token is unacceptable.

---

## Part 1 — One-time Google setup (browser, ~20 min)

Account/console actions (must be done by Nick):

1. **Google Cloud Console** → create a project (e.g. "NeoBookworm Mail"), signed in as
   `nick@neobookworm.uk`.
2. **APIs & Services → Library →** enable **Gmail API**.
3. **OAuth consent screen** → **User type: Internal** → app name + support email →
   Save. Add scope `https://www.googleapis.com/auth/gmail.send`.
4. **Credentials → Create credentials → OAuth client ID → Application type: Desktop
   app.** Copy the **Client ID** and **Client secret**.
5. **Mint a refresh token** via the OAuth 2.0 Playground:
   - Open <https://developers.google.com/oauthplayground> → gear icon (top right) →
     tick **"Use your own OAuth credentials"** → paste Client ID + Secret.
   - Left panel: enter scope `https://www.googleapis.com/auth/gmail.send` →
     **Authorize APIs** → sign in as `nick@neobookworm.uk` → allow.
   - **Exchange authorization code for tokens** → copy the **refresh token**.

## Part 2 — Worker secrets

```bash
npx wrangler secret put GMAIL_CLIENT_ID --name neobookworm-uk
npx wrangler secret put GMAIL_CLIENT_SECRET --name neobookworm-uk
npx wrangler secret put GMAIL_REFRESH_TOKEN --name neobookworm-uk
```

The `SUMMARY_CACHE` KV is already bound in `wrangler.toml`, so token caching needs no
new config.

## Part 3 — Code changes (two files)

### New file `worker/_lib/gmail.js`

```js
// Gmail API sender — replaces the Vercel SMTP bridge. HTTP-only, Worker-safe.
// Secrets: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
// Optional KV: SUMMARY_CACHE (caches the 1-hour access token)
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL  = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const FROM      = '"Nick at NeoBookworm" <nick@neobookworm.uk>';
const REPLY_TO  = 'nick@neobookworm.uk';

async function getAccessToken(env) {
  if (env.SUMMARY_CACHE) {
    const cached = await env.SUMMARY_CACHE.get('gmail_access_token');
    if (cached) return cached;
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
    }),
  });
  if (!res.ok) throw new Error(`Gmail token HTTP ${res.status}: ${await res.text()}`);
  const { access_token, expires_in } = await res.json();
  if (env.SUMMARY_CACHE && access_token) {
    await env.SUMMARY_CACHE.put('gmail_access_token', access_token,
      { expirationTtl: Math.max(60, (expires_in || 3600) - 120) });
  }
  return access_token;
}

function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildMime({ to, subject, body }) {
  // Keep subjects ASCII; RFC 2047-encode if you ever need non-ASCII.
  const headers = [
    `From: ${FROM}`, `To: ${to}`, `Reply-To: ${REPLY_TO}`,
    `Subject: ${subject}`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
  ].join('\r\n');
  return b64url(new TextEncoder().encode(`${headers}\r\n\r\n${body}`));
}

export async function sendViaGmail(env, { to, subject, body }) {
  const token = await getAccessToken(env);
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: buildMime({ to, subject, body }) }),
  });
  if (!res.ok) throw new Error(`Gmail send HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}
```

### Rewrite `worker/_lib/email.js`

Keeps the exact same exported signatures (`sendTemplated`, `sendRendered`), so all six
callers work unchanged — it just sends locally instead of POSTing the bridge.

```js
import { renderTemplate } from './templates.js';
import { queryD1, enquiriesDb } from './d1.js';
import { sendViaGmail } from './gmail.js';

async function logEmail(env, { slug, templateId, subject, body = null, to, status, error = null }) {
  try {
    await queryD1(env, enquiriesDb(env),
      `INSERT INTO email_log (slug, template, subject, body, recipient, status, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [slug, templateId, subject, body, to, status, error]);
  } catch (err) { console.error('[email] email_log INSERT failed:', err.message); }
}

async function send(env, { slug, templateId, subject, body, to }) {
  try {
    await sendViaGmail(env, { to, subject, body });
    await logEmail(env, { slug, templateId, subject, body, to, status: 'sent' });
    return { ok: true };
  } catch (err) {
    const message = err.message || String(err);
    console.error(`[email] send failed (${templateId} → ${to}):`, message);
    await logEmail(env, { slug, templateId, subject, body, to, status: 'failed', error: message });
    return { ok: false, error: message };
  }
}

export async function sendTemplated(env, { slug, templateId, vars, to }) {
  let subject, body;
  try { ({ subject, body } = renderTemplate(templateId, vars || {})); }
  catch (err) { return { ok: false, error: err.message }; }
  return send(env, { slug, templateId, subject, body, to });
}

export async function sendRendered(env, { slug, templateId, subject, body, to }) {
  if (!subject || !body) return { ok: false, error: 'subject and body required' };
  return send(env, { slug, templateId: templateId || 'manual', subject, body, to });
}
```

That's the whole Phase 1 change. `VERCEL_BRIDGE_URL` / `BRIDGE_SECRET` become unused by
this path.

> **Keep the two template files in sync.** `worker/_lib/templates.js` (used here) and
> `api/_lib/templates.js` (Vercel) must stay identical — see the infrastructure doc §6.4.

## Part 4 — Testing

1. **Validate the credentials off to the side first** (pure HTTP, no Worker) — a
   throwaway local Node script that does the token exchange + one
   `users/me/messages/send` to your own address. If that lands, the creds are good.
2. **Local Worker run:** put the three secrets in `.dev.vars`, `npx wrangler dev`, and
   trigger a send (e.g. the dashboard "Send template" against a test client pointed at
   your own email).
3. **Deploy** (`git push origin main` → CI, or `npx wrangler deploy`) and send one real
   onboarding email to **your own** Gmail *and* a non-Google address.
4. **Verify headers** on the received mail: `DKIM=pass`, `SPF=pass`, `DMARC=pass`,
   signed by `neobookworm.uk` — identical to today, confirms no regression.
5. Check the row landed in `email_log` with `status='sent'`.

## Part 5 — Rollback (instant, low-risk)

- **Leave the Vercel bridge deployed and untouched** throughout. The only change is
  `worker/_lib/email.js`.
- To revert: `git revert <sha> && git push origin main` (or `npx wrangler rollback`).
  Sends immediately flow back through the bridge — nothing else to undo.
- Only delete the Vercel project after Phase 2 and a few weeks of clean running.

## Part 6 — Full Vercel retirement (Phase 2, optional)

To actually remove Vercel you'd also:

- Rewrite the four forwarder routes (`worker/routes/contact.js`,
  `he-tyres-enquiry.js`, `notify-booking.js`, `notify-landing-enquiry.js`) to build
  their message and call `sendViaGmail` directly instead of `fetch`-ing the bridge.
  **Decision needed:** the contact form currently sends with an iCloud identity —
  switching it to Gmail makes it send as `nick@` / Google. Almost certainly fine
  (better SPF alignment), but it's a visible change.
- Repoint or drop the `.co.uk` apex (currently Vercel → 307 redirect to `.uk`). Move
  that redirect onto a Cloudflare rule instead.
- Then remove the Vercel project and the now-unused `BRIDGE_SECRET` /
  `VERCEL_BRIDGE_URL` secrets (Worker + Vercel).

---

## Cost & limits

- **£0.** Gmail API sending is included in Workspace. Workspace accounts can send
  ~**2,000 messages/day**; onboarding volume is a tiny fraction of that.
- KV reads/writes for token caching are within the free allowance.

## Gotchas

- **Internal consent screen** (not External/Testing) or the refresh token dies in 7 days.
- Refresh token also breaks if Nick's password/2FA is reset → re-mint via the Playground
  and `wrangler secret put` again.
- You can only send as the authorised user (`nick@`). Gmail API **cannot** send as
  `neobookworm@icloud.com`, so a pure-Gmail Phase 2 moves the contact form's identity
  to Google.
- Keep subjects ASCII (the templates are) — otherwise add RFC 2047 encoding to
  `buildMime`.
