# Post-migration test checklist

**Context:** Vercel retirement Stages 1–4 completed 1–2 Jul 2026. All email now
sent via Gmail API from the Cloudflare Worker. `.co.uk` redirect now on Cloudflare.
Run these checks before proceeding to Stage 5 (Vercel teardown).

---

## 1. Domain & redirect

| # | Test | How | Expected |
|---|---|---|---|
| 1.1 | `.co.uk` redirects to `.uk` | Visit `http://neobookworm.co.uk` in browser | 301 → lands on `https://neobookworm.uk` |
| 1.2 | `www.co.uk` redirects | Visit `http://www.neobookworm.co.uk` | 301 → lands on `https://neobookworm.uk` |
| 1.3 | Main site loads | Visit `https://neobookworm.uk` | Home page loads, no console errors |
| 1.4 | HTTPS on `.uk` | Check padlock in browser | Valid certificate, no mixed-content warnings |

---

## 2. Contact form (`/contact.html`)

| # | Test | How | Expected |
|---|---|---|---|
| 2.1 | Send a message | Fill in name, email, message → Submit | Success message shown in-page |
| 2.2 | Email received | Check `nick@neobookworm.uk` inbox | Email arrives from `nick@neobookworm.uk`, subject contains sender's name or message |
| 2.3 | DKIM/SPF/DMARC | View full headers of received email | `dkim=pass`, `spf=pass`, `dmarc=pass` |
| 2.4 | Reply-To is correct | Hit Reply on the received email | Reply addresses the sender, not `nick@` |

---

## 3. Onboarding email (dashboard → Send template)

| # | Test | How | Expected |
|---|---|---|---|
| 3.1 | Send a template | Dashboard → Clients → test client → Send template → pick J1-E1 → Send | Success confirmation in dashboard |
| 3.2 | Email received | Check `nick@neobookworm.uk` inbox | Email arrives, subject renders correctly (no garbled characters) |
| 3.3 | Body stored in D1 | `SELECT * FROM email_log WHERE id = (SELECT MAX(id) FROM email_log);` on `neobookworm-enquiries` | Row present, `status = 'sent'`, `body` populated |
| 3.4 | Send to non-Google address | Repeat 3.1–3.3 with a non-Gmail recipient | Email arrives at non-Google inbox without issue |
| 3.5 | DKIM/SPF/DMARC | View full headers | `dkim=pass`, `spf=pass`, `dmarc=pass`, sent via `gmailapi.google.com` |

---

## 4. Intake form (`/intake-form.html`)

| # | Test | How | Expected |
|---|---|---|---|
| 4.1 | Form loads | Visit `https://neobookworm.uk/intake-form.html` | Form renders, no console errors |
| 4.2 | Full submission with photos | Fill in all fields, attach 2–3 photos and a logo → Submit | Success message shown |
| 4.3 | Notification email received | Check `nick@neobookworm.uk` | Intake notification arrives with all fields |
| 4.4 | Photo links viewable | Click photo URLs in the notification email | Photos load in browser (R2 public URL works) |
| 4.5 | D1 row created | Query `intake_submissions` in `neobookworm-enquiries` | New row present with correct upload ID |

---

## 5. Landing enquiry (plumbers form)

| # | Test | How | Expected |
|---|---|---|---|
| 5.1 | Option 1 — "Let's talk" | Visit `https://neobookworm.uk/plumbers.html` → Option 1 → Submit | Thank-you message shown in-place |
| 5.2 | Notification email received | Check `nick@neobookworm.uk` | Notification arrives promptly |
| 5.3 | D1 row created | Query `landing_enquiries` in `neobookworm-enquiries` | New row with correct source and email |
| 5.4 | Option 2 — "I'm interested" | Repeat with Option 2 | Same as 5.1–5.3 |

---

## 6. HE Tyres enquiry (`/he-tyres/`)

| # | Test | How | Expected |
|---|---|---|---|
| 6.1 | Mobile enquiry form | Visit `https://neobookworm.uk/he-tyres/` → fill mobile enquiry form → Submit | Success message shown |
| 6.2 | Notification email received | Check `nick@neobookworm.uk` | Notification arrives from `nick@neobookworm.uk` |
| 6.3 | Honeypot field ignored | Submit with `website` field populated (dev tools) | Silent success — no email sent, no error |
| 6.4 | Other enquiry path | Use the "other enquiry" form path if present | Success + notification email |

---

## 7. Booking widget

| # | Test | How | Expected |
|---|---|---|---|
| 7.1 | Widget loads on contact page | Visit `https://neobookworm.uk/contact.html` → scroll to booking section | Widget renders without errors |
| 7.2 | Book a slot | Pick a date/time, fill in details → Submit | Confirmation shown to user |
| 7.3 | Booking notification email | Check `nick@neobookworm.uk` | Notification arrives with booking details |
| 7.4 | Calendar invite | Check Google Calendar for `nick@neobookworm.uk` | Event appears at correct time |

---

## 8. Portal (`/c/:slug/`)

| # | Test | How | Expected |
|---|---|---|---|
| 8.1 | Portal loads | Visit a known client portal URL | Branded portal page loads, progress strip visible |
| 8.2 | Email history visible | Expand email history section | Sent emails listed, expandable to read body |
| 8.3 | Action buttons (if preview stage) | Click Approve / Request changes | Correct stage transition, email sent |

---

## 9. Email authentication (spot check)

Run this on one email from each of the main paths (onboarding, contact, HE Tyres):

- Open the email in Gmail or Apple Mail
- View full headers
- Confirm all three pass:
  - `dkim=pass header.d=neobookworm.uk`
  - `spf=pass`
  - `dmarc=pass`
- Confirm `Received:` shows `gmailapi.google.com with HTTPREST` (not SMTP bridge)

---

## 10. Verify Vercel bridge is no longer used

| # | Test | How | Expected |
|---|---|---|---|
| 10.1 | Bridge endpoint returns 405 | `Invoke-WebRequest -Uri https://bridge.neobookworm.uk/api/send-email -Method GET -ErrorAction SilentlyContinue` | 405 Method Not Allowed (still exists but nothing calls it) |
| 10.2 | No traffic in Vercel logs | Check Vercel dashboard → Functions tab → `send-email` | Zero invocations since Stage 1 deploy date (1 Jul 2026) |

---

## When all checks pass

- Note the date all checks passed
- Wait 7 days of clean running
- Then proceed to **Stage 5 — Vercel teardown**:
  1. Disconnect Vercel GitHub integration first
  2. Remove `api/` directory from repo
  3. Delete `BRIDGE_SECRET` and `VERCEL_BRIDGE_URL` Worker secrets
  4. Delete the Vercel project
  5. Delete `scripts/send-test-email.mjs` if still present
