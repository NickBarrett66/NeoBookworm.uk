# NeoBookworm — Onboarding email template catalogue

Reference for every transactional email template registered in
`api/_lib/templates.js`. This is a derived document — the canonical
content source is [`neobookworm-onboarding-playbook.md`](./neobookworm-onboarding-playbook.md).
The canonical *build* source is [`neobookworm-onboarding-build-plan-v3.md`](./neobookworm-onboarding-build-plan-v3.md).

**Last updated:** Session 2 (25 May 2026).

---

## Conventions

| Concept | Rule |
|---|---|
| Variable syntax | `{name}` — single braces, lowercase + underscores |
| Unknown variable key | `renderTemplate` throws |
| Missing required variable | `renderTemplate` throws |
| Unknown template ID | `renderTemplate` throws |
| Subject threading | One subject per client for the lifetime of the relationship (Gmail threads automatically) |
| Default subject | `{business} — NeoBookworm.uk — Websites, done properly` |
| Sign-off | `Websites, done properly` / `nick@neobookworm.uk` (one blank line above; no P.S.) |
| Format | Plain text only |
| Stub templates | Body is `[STUB: <id> — template body not yet implemented]`; `TEMPLATES[id].stub === true` |

---

## ALLOWED_VARS — full allowlist

All valid `{placeholder}` names. Supplying any other key to `renderTemplate` throws.

| Variable | Description |
|---|---|
| `name` | Prospect's first name |
| `business` | Business name |
| `trade` | Singular noun (plumber, electrician) |
| `trade_business` | Adjective + business (plumbing business) |
| `portal_url` | `https://neobookworm.uk/c/{slug}/` |
| `preview_url` | Live preview URL (Netlify draft) |
| `live_url` | Final production URL |
| `current_url` | Their existing site (switch journeys only) |
| `deliver_by` | Promised delivery date, format "Tuesday 4 June" |
| `deliver_by_switch` | Delivery date for a switch/rebuild (typically 10 working days) |
| `go_live_date` | Target go-live date after payment |
| `renewal_date` | Domain renewal date |
| `date` | Generic date (call date, charge date) |
| `domain` | Their confirmed domain name |
| `suggested_domain` | Domain Nick suggests they register |
| `hosting_provider` | e.g. `Netlify` or `Cloudflare Pages` (stored per client in D1) |
| `hosting_url` | e.g. `app.netlify.com` or `pages.cloudflare.com` |
| `client_email` | Email used for their hosting / domain / GitHub accounts |
| `ots_hosting` | OneTimeSecret URL for hosting password |
| `ots_domain` | OneTimeSecret URL for domain (Krystal) password |
| `ots_github` | OneTimeSecret URL for GitHub password |
| `stripe_link` | Stripe payment link |
| `revisions_count` | Running count of revision rounds |
| `google_review_url` | Link to NeoBookworm's Google review form |

> **`{ots_netlify}` is retired.** Use `{ots_hosting}` with `{hosting_provider}` / `{hosting_url}`.

---

## Template catalogue

### Key

| Column | Meaning |
|---|---|
| **Status** | `✓ live` = verbatim playbook body implemented; `stub` = body is a placeholder |
| **Trigger** | When this email is sent |
| **Required vars** | Must be supplied or `renderTemplate` throws |

---

### J1 — Free preview

Entry: plumbers.html / electricians.html, `start_option = leave_it_with_me` or `tell_more`.
Promise: Preview within 7 working days.

| ID | Status | Trigger | Required vars |
|---|---|---|---|
| `J1-E1` | ✓ live | Automated — within 30 s of form submission | `name` `business` `deliver_by` `portal_url` |
| `J1-E2` | stub | Manual — within 1 working day of acknowledgement | `name` `business` |
| `J1-E3` | ✓ live | Automated — working day 4 after acknowledgement | `name` `business` `deliver_by` `portal_url` |
| `J1-E4` | ✓ live | Manual — when build is done | `name` `business` `preview_url` `portal_url` |

**J1-E1 body summary:** "Got it — thanks for filling that in. Here's what I'm doing
next: I'll look at your Google profile, Checkatrade, Facebook, etc., then build a
first version. Link by {deliver_by}. Portal at {portal_url}."

**J1-E2 notes (manual):** Must mention one specific observation about their business.
Two sentences on what was found, one sentence on the build approach. Never skip.

**J1-E3 body summary:** Halfway update. Still on track for {deliver_by}. Drop photos
on portal if they have any.

**J1-E4 body summary:** Preview ready at {preview_url}. Open on phone first. Three
portal options: love it / changes / not for me. No deadline.

---

### J2 — Free site review

Entry: plumbers-switch.html / electricians-switch.html, `start_option = review_site_first`.
Promise: Honest review within 2 working days. The review is the product — no selling.

| ID | Status | Trigger | Required vars |
|---|---|---|---|
| `J2-E1` | ✓ live | Automated — within 30 s of form submission | `name` `business` `current_url` `deliver_by` `portal_url` |
| `J2-E2` | stub | Manual — when review is done | `name` `business` `portal_url` |
| `J2-Branch-A` | stub | Manual — they want a rebuild, not just fixes | `name` `business` `deliver_by_switch` |
| `J2-Branch-B` | ✓ live | Manual — kind close (they're done) | `name` `business` |

**J2-E1 body summary:** "Got it — you'd like me to take an honest look at {current_url}.
Review by {deliver_by}: what's working, what I'd change, one or two specific fixes,
honest call on rebuild vs. tweak. No sales pitch. Portal at {portal_url}."

**J2-E2 notes (manual):** Deliver review as a portal page at `{portal_url}/review/`
(preferred) or PDF attachment. Email contains three-bullet highlights + link.

**J2-Branch-A notes:** NeoBookworm builds from scratch — "just the fixes" means a
replacement, not patching their current site. This email explains that honestly.
`{deliver_by_switch}` = 10 working days (the J3 window).

**J2-Branch-B body summary:** "No problem at all. Hope the review's useful.
If you ever change your mind, you know where I am."

Portal stage on J2-Branch-B send: `dropped_out`. No further automated emails.

---

### J3 — Ready to switch

Entry: switch pages, `start_option = ready_to_switch`.
Promise: Replacement built from existing content, preview within 10 working days.

| ID | Status | Trigger | Required vars |
|---|---|---|---|
| `J3-E1` | ✓ live | Automated — within 30 s of form submission | `name` `business` `current_url` `deliver_by` `portal_url` |
| `J3-E2` | stub | Manual — within 1 working day | `name` `business` `current_url` |
| `J3-E3` | ✓ live | Automated — day 5 after acknowledgement | `name` `business` `deliver_by` `portal_url` |
| `J3-E4` | ✓ live | Manual — when build is done | `name` `business` `preview_url` `current_url` `portal_url` |

**J3-E1 body summary:** "Got it — replacement for {current_url}. I'll pull services,
area, photos, accreditations from your current site and build from scratch. Preview
by {deliver_by}. Your current site stays live until you decide. Portal at {portal_url}."

**J3-E4 body summary:** Preview at {preview_url}. Current site still at {current_url}
until they decide. Compare on phone. Three portal options: go ahead / changes /
stick with what I've got.

---

### J4 — Full intake form

Entry: intake-form.html (any source).
Promise: Preview within 7 working days. Faster start because the brief is detailed.

| ID | Status | Trigger | Required vars |
|---|---|---|---|
| `J4-E1` | ✓ live | Automated — within 30 s of intake submission | `name` `business` `deliver_by` `portal_url` |
| `J4-E2` | stub | Manual — within 1 working day | `name` `business` |
| `J4-E3` | ✓ live | Automated — day 4 (identical to J1-E3) | `name` `business` `deliver_by` `portal_url` |
| `J4-E4` | ✓ live | Manual — when build is done | `name` `business` `preview_url` `portal_url` |

**J4-E1 body summary:** "Thanks for filling that in properly — I've got everything.
Preview by {deliver_by}. Portal at {portal_url}. The more detail they put in, the
closer the first version."

**J4-E2 notes (manual):** Confirm receipt of files. Ask exactly one follow-up
question (if you genuinely have one). Don't manufacture a question.

**J4-E4 body summary:** Same structure as J1-E4 but opens with "Because you gave me
a proper brief, I've built this close to what I think you'll want."

---

### J5 — Discovery

Entry: contact.html quick message, Koalendar booking, or cold email reply.
Two automated variants for the initial acknowledgement.

| ID | Status | Trigger | Required vars |
|---|---|---|---|
| `J5-E1-quick` | ✓ live | Automated — on quick-message form submit | `name` `business` `portal_url` |
| `J5-E1-booking` | ✓ live | Automated — immediately after Koalendar booking | `name` `business` `date` `portal_url` |

**J5-E1-quick body summary:** "Got your message — thanks. Back to you within 1
working day. Your prospect page is at {portal_url}."

**J5-E1-booking body summary:** "Looking forward to our call on {date}. Portal at
{portal_url}. Quick question before we talk: what's the one thing you'd most like
the website to do?"

**Cold email reply:** No automated template — always reply personally.
Add portal paragraph on second reply, not the first.

---

### Convergence — post-decision emails (all journeys)

| ID | Status | Trigger | Required vars |
|---|---|---|---|
| `C1` | ✓ live | Automated — on "A few changes please" portal button | `name` `business` `deliver_by` `portal_url` |
| `C2` | ✓ live | Manual — when each revision round is done | `name` `business` `revisions_count` `preview_url` `portal_url` |
| `C3` | stub | Manual — "Love it, let's go live" + domain variants | `name` `business` `stripe_link` `portal_url` |
| `C4` | ✓ live | Automated — "Not for me, thanks" portal button | `name` `business` `preview_url` |
| `C5` | stub | Automated — Stripe webhook (payment received) | `name` `business` `portal_url` |

**C1 body summary:** "Got your changes — thanks. Updated version by {deliver_by}.
Portal updated: {portal_url}."

**C2 body summary:** "Round {revisions_count} done. Preview at {preview_url}.
Bulleted change list. Same three options on portal."

**C3 notes (stub):** Three domain variants (domain confirmed / not yet registered /
still unresolved). Select the right variant and delete the others before sending.
Payment is £199. Portal stage: `awaiting_payment`.

**C4 body summary:** "No problem — thanks for looking. Preview stays up a month at
{preview_url}. All the best with {business}."

**C5 notes (stub):** Three domain variants matching C3. Payment confirmed. Portal
stage: `preparing_live`.

---

### Post-launch

| ID | Status | Trigger | Required vars |
|---|---|---|---|
| `Post-1` | ✓ live | Automated — when D1 stage set to `live` | `name` `business` `live_url` `portal_url` |
| `Post-2` | ✓ live | Manual — same day as Post-1 | `name` `business` |
| `Post-3-care` | ✓ live | Manual — after client chooses care plan | `name` `business` `date` |
| `Post-3-self` | ✓ live | Manual — after client chooses self-managed | `name` `business` `hosting_provider` `hosting_url` `client_email` `ots_hosting` `ots_domain` `ots_github` `portal_url` |
| `Post-4` | ✓ live | Automated — 7 days after live | `name` `business` |
| `Post-5` | ✓ live | Automated — 14 days after live | `name` `business` `live_url` `portal_url` |
| `Post-6` | ✓ live | Automated — 30 days after live | `name` `business` `google_review_url` |

**Post-1 body summary:** Site live at {live_url}. Forms tested. Handover doc at
{portal_url}/handover/. Care plan or self-managed — read doc and reply.

**Post-2 body summary:** "Just spent ten minutes testing everything on my own phone.
All good. Anything funny in the next few days, drop me a line."

**Post-3-care body summary:** Care plan confirmed. First £9.99 on {date}. No action
needed. Small changes included; bigger changes quoted first.

**Post-3-self notes:** This email uses the **exception subject** (`{business} —
credentials to keep safe`) to create a new thread, so the credentials don't get
buried in years of history. OneTimeSecret links expire in 7 days; each opens once
only. Variables `hosting_provider` / `hosting_url` come from D1 — not hardcoded
to Netlify. Uses `{ots_hosting}` (not the retired `{ots_netlify}`).

**Post-4 body summary:** One-week check-in. Three optional questions: anything
broken, anything to change, any new photos? No reply needed if everything's fine.

**Post-5 body summary:** Google Business Profile nudge. Add {live_url} to profile
(30 seconds). Step-by-step at {portal_url}/google-business/.

**Post-6 body summary:** One-month prompt for a Google review. {google_review_url}.
Low pressure — one ask, no follow-up.

---

### Care plan ongoing

| ID | Status | Trigger | Required vars |
|---|---|---|---|
| `Ongoing-1` | ✓ live | Automated — every 90 days (care plan only) | `name` `business` |
| `Ongoing-2-care` | ✓ live | Automated — 30 days before domain renewal (care plan) | `name` `business` `renewal_date` `portal_url` |
| `Ongoing-2-self` | ✓ live | Automated — 30 days before domain renewal (self-managed) | `name` `business` `renewal_date` |
| `Ongoing-3` | ✓ live | Automated — 365 days after live | `name` `business` |

**Ongoing-1 body summary:** "Quarterly check-in. Anything to change? If nothing,
no need to reply."

**Ongoing-2-care body summary:** Domain renews on {renewal_date} — covered by care
plan, no action needed. If card changed, check Stripe at {portal_url}.

**Ongoing-2-self body summary:** Domain renews on {renewal_date} — self-managed, you
need to renew it yourself. Krystal will email reminders. Offer to move to care plan.

**Ongoing-3 body summary:** "It's been a year since {business} went live. Thanks for
being one of the first. If it's working, I'd love a note back."

---

## Usage example

```js
const { renderTemplate } = require('./api/_lib/templates');

const { subject, body } = renderTemplate('J1-E1', {
  name:       'Tom',
  business:   'Hart Plumbing',
  deliver_by: 'Tuesday 4 June',
  portal_url: 'https://neobookworm.uk/c/hart-plumbing-3f9k2/',
});

// subject → "Hart Plumbing — your NeoBookworm website"
// body    → plain-text email body, verbatim from playbook
```

## Error handling

```js
// Unknown template ID
renderTemplate('MADE_UP', vars);
// → throws: Error: Unknown template id: "MADE_UP"

// Unknown variable key
renderTemplate('J1-E1', { name: 'Tom', business: 'B', deliver_by: 'x', portal_url: 'y', invented: 'z' });
// → throws: Error: Unknown variable: "{invented}" is not in ALLOWED_VARS

// Missing required variable
renderTemplate('J1-E1', { name: 'Tom', business: 'B', deliver_by: 'x' }); // portal_url missing
// → throws: Error: Missing required variable: "{portal_url}" for template "J1-E1"
```

## Adding a new template (checklist)

1. Add any new `{placeholder}` names to `ALLOWED_VARS` in `templates.js`.
2. Add the template entry to `TEMPLATES` with `subject`, `body`, `required`.
3. If the subject is not the default, update `SUBJECTS` entry comment.
4. Add a test case to `templates.test.mjs` (at minimum: renders correctly + missing required var throws).
5. Update the catalogue table in this file.
6. Update the Definition of done checkbox in `neobookworm-onboarding-build-plan-v3.md`.

## Stub templates (S2 — not yet implemented)

These IDs are registered so callers don't get an "unknown id" error, but their
bodies are placeholders. They will be implemented in the sessions that send them.

`J1-E2`, `J2-E2`, `J2-Branch-A`, `J3-E2`, `J4-E2`, `C3`, `C5`

Detect a stub at runtime: `TEMPLATES[id].stub === true`.
