---
name: neobookworm-campaign-setup
description: "Sets up a NeoBookworm cold-email campaign end-to-end: queries D1 for qualifying Ltd-company prospects by trade and campaign type, drafts three personalised emails per prospect (with Email 2 and 3 embargoed for delayed sending), presents a review table and sample emails for approval, then creates the campaign row and populates the outbox — all before anything goes live. Use this skill whenever Nick says 'set up a campaign', 'create a campaign', 'prepare emails for [trade]', 'run a campaign for [trade]', or mentions a trade alongside words like 'email', 'outreach', 'prospects', or 'send' in a NeoBookworm context. Trigger even if Nick only partially describes the parameters — the skill will ask for the rest."
---

# NeoBookworm Campaign Setup

## Overview

Sets up a cold-email campaign for a specific trade. Queries D1 for qualifying prospects, drafts three personalised emails per prospect pointing to a trade landing page, presents them for approval, and only then creates the campaign and outbox rows. Nothing is written to D1 until Nick explicitly approves.

Each prospect receives a **three-email sequence** over 12 days:
- **Email 1 — Day 0:** Sends immediately (or on embargo date). Personalised intro and primary hook.
- **Email 2 — Day 5:** A different angle (social proof / risk-reversal). Shorter and punchier.
- **Email 3 — Day 12:** Soft close — explicitly the last contact. Very short, no hard sell.

Emails 2 and 3 are written and loaded to the outbox at the same time as Email 1, but embargoed via `scheduled_not_before` so the sender script holds them until the right date.

## Core model: what the emails are selling

Emails link to a **trade-specific landing page** (e.g. `neobookworm.uk/plumbers`) — not a bespoke demo built for each prospect. The landing page shows example sites and explains the service. The primary hook in every email is:

> **"You don't pay until you're happy with it."**

This is the single biggest differentiator and must appear in every email. Pricing is stated clearly: **£199 fixed build, £9.99/month hosting**.

---

## Step 1 — Gather parameters

Collect the following. Ask for anything missing:

| Parameter | Description | Default |
|---|---|---|
| `trade` | Trade category exactly as it appears in D1 (e.g. `Plumber`, `Electrician`) | — required |
| `campaign_type` | `no-website` or `has-website` | `no-website` |
| `campaign_id` | Unique slug, e.g. `plumbers-2026-05` | Suggest `[trade-slug]-[YYYY-MM]` |
| `landing_page` | Full URL for the CTA in emails | `neobookworm.uk/plumbers` for no-website; `neobookworm.uk/plumbers-switch` for has-website |
| `priority` | Integer 1–10 (higher = sent sooner) | `5` |
| `embargo_date` | ISO date — Email 1 not sent before this date (optional) | none |
| `notes` | Free-text notes stored on the campaign row (optional) | none |

Confirm all parameters with Nick before proceeding.

---

## Step 2 — Query D1 for prospects

Use `Cloudflare Developer Platform:d1_database_query`:
- database_id: `0ae32598-1680-4995-a010-96b647eacabd`
- account: `4f0a019a24cacd090cf6b3c3cf31c732`

**For `no-website` campaigns:**
```sql
SELECT notion_id, business_name, contact_name, email_address, town,
       trade_category, review_count, years_on_checkatrade,
       company_type, notes, research_summary
FROM prospects
WHERE status = 'Researched'
  AND trade_category = ?
  AND do_not_contact = 0
  AND email_address IS NOT NULL
  AND email_address != ''
  AND company_type = 'ltd'
ORDER BY review_count DESC
```

**For `has-website` campaigns:**
```sql
SELECT notion_id, business_name, contact_name, email_address, town,
       trade_category, review_count, years_on_checkatrade,
       website_url, website_sub_segment, company_type, notes, research_summary
FROM prospects
WHERE status = 'Researched with website'
  AND trade_category = ?
  AND do_not_contact = 0
  AND email_address IS NOT NULL
  AND email_address != ''
  AND company_type = 'ltd'
ORDER BY review_count DESC
```

Report the prospect count to Nick. If zero, stop and explain — likely a trade name spelling issue or wrong status. Check exact `trade_category` values in D1 if needed.

---

## Step 2a — Data quality flags (first-run checklist)

Before segmenting, scan all returned records and flag any issues to Nick:

| Issue | Action |
|-------|--------|
| `research_summary` is a placeholder ("I'd be happy to help but I need the location...") | Mark as **Skip — incomplete research**. Do not draft. |
| `town` is null | Note it in the review table. Extract from research_summary if possible. |
| `has_website = 1` on a no-website campaign | Mark as **Skip — has website** (or suggest has-website campaign instead) |
| `email_address` is a free generic account (hotmail, gmail, yahoo) | Flag as **⚠️ deliverability risk** in review table — include but highlight |
| `company_type` is not `ltd` | Exclude silently (SQL filter handles this, but report the count excluded) |
| `years_on_checkatrade` is null for most/all records | Note this — years will be estimated from research_summary incorporation dates |

**`has-website` campaigns only — audit gate:**

Count how many returned records have `website_sub_segment` null OR `research_summary` that does NOT begin with `WEBSITE AUDIT —`.

| Unaudited record count | Action |
|------------------------|--------|
| **Zero** | All records audited — proceed normally |
| **1–3 records** | Flag to Nick. Offer to proceed without them or audit them now before continuing. |
| **4 or more** | **Stop.** Tell Nick: "Most of these prospects haven't been through the website audit yet — their research_summary describes why they need a website, not what's wrong with the one they have. Run `neobookworm-website-audit` for [trade] first, then come back to this." Do not draft emails against unaudited has-website records. |

The audit gate exists because unaudited `research_summary` fields for has-website prospects were written for the no-website pitch. Drafting from them produces emails that imply the prospect doesn't have a website — which immediately destroys credibility.

Summarise flags to Nick before presenting the full review table.

---

## Step 3 — Segment each prospect

For each viable prospect, assign a segment:

**No-website campaigns:**

| Segment | Criteria |
|---------|----------|
| A — Established | 15+ reviews AND estimated 7+ years trading |
| B — Growth Phase | 5–15 reviews OR 0–7 years trading (not Established) |
| D — New Entrant | Under 5 reviews AND under 2 years trading |

**Has-website campaigns:**

Read `website_sub_segment` from D1 (populated by `neobookworm-website-audit`). Map directly to email segment:

| `website_sub_segment` value | Email segment | Primary hook |
|-----------------------------|---------------|--------------|
| `Parked/Dead` | C1 — Dead Domain | Loss-aversion: "Your old domain now shows a parking page when people search you." Treat like no-website but with the ghost of the previous site as the opening. |
| `DIY Template` | C2 — DIY Template | Cost + ownership: "You're paying monthly for something you built. £199 once, you own it, £9.99/month to host. Don't pay until it's better than what you've got." |
| `Agency-managed` | C3 — Agency | Independence: no lock-in, no contract, you keep your domain. Softest tone — there is likely an existing third-party relationship. Lowest priority; do not lead on price. |
| `Functional but weak` | C4 — Weak Site | One specific factual observation from the audit `Problem:` line, stated without judgement. No opinion words ("dated", "unprofessional"). |
| `Out of scope` | — | **Skip — do not email.** Site is adequate; no pitch angle. |
| null / not set | — | **Skip — not audited.** Flag in data quality summary; do not draft. |

For has-website campaigns, the review-count segments (A/B/D) still inform tone and personalisation within each C sub-segment — an established C1 prospect with 200 reviews gets a different opening than a C1 prospect with 5 — but the `website_sub_segment` is the primary axis that determines the email angle.

If `years_on_checkatrade` is null, estimate years from incorporation date in `research_summary`. Note the estimate in the review table.

---

## Step 4 — Read reference files before drafting

**Always read both files before drafting any emails:**
- `/mnt/skills/user/neobookworm-email-templates/SKILL.md` — segment angles, email structures, word counts, tone constraints, and subject line rules for every segment (A, B, C1–C4, D). Use `view` to read.
- `C:\Users\Nick\Dropbox\00 Neobookworm\NeoBookworm.uk\docs\neobookworms-voice.md` — voice principles (non-negotiable copy constraints that apply to all outreach). Read via `Filesystem:read_file`.

These define the psychological approach, structure, and constraints for each segment.

---

## Step 5 — Draft all three emails per prospect

Draft Email 1, Email 2, and Email 3 for every viable prospect. Each email has a distinct job and its own word-count target.

### Sequence timing

| Email | Send timing | `scheduled_not_before` value |
|-------|-------------|------------------------------|
| E1 | Immediately / embargo date | `embargo_date` or `NULL` |
| E2 | Day 5 | `embargo_date + 5 days` |
| E3 | Day 12 | `embargo_date + 12 days` |

If no embargo date is set, E1 has `scheduled_not_before = NULL` (send as soon as approved), E2 = today + 5 days, E3 = today + 12 days. Calculate these dates at the time of writing to D1.

### Local search volume lookup (do this before drafting Email 1)

For each prospect, query D1 for a pre-computed local monthly estimate:

```sql
SELECT monthly_estimate
FROM area_trade_volume
WHERE trade_category = '[trade_category]'
  AND town = '[town]';
```

Only use the figure if `monthly_estimate >= 80`. If no row returns, or the figure is below the threshold, skip — use a different hook from `research_summary` instead. Store each result against the prospect in your working notes before drafting.

Framing rule: always prefix with "around". One sentence, demand-they're-invisible-to framing:
> "Around 510 people a month search for a plumber in Swindon — right now your business isn't what they find."

These figures are conservative — actual volume may be higher. Full methodology: `docs/search-volume-methodology.md`.

---

### Email 1 — Personalised intro

**Job:** Make them curious enough to click the landing page. One hook, one link, one risk-reversal.

**Structure:**
1. Opening — specific personalisation from research_summary. Never generic. References a real detail: review count, years, named service, coverage area, accreditation, niche.
   - *Has-website campaigns:* **affirm first.** Open by acknowledging they already have a site — the `-switch` page hero does exactly this ("You've already taken the website step. Most [trade]s haven't."), and the email must match it. The audit block at the top of `research_summary` gives the site state and pitch angle. Personalisation hooks (owner name, review count, accreditations, coverage area) come from the original business research below the `---ORIGINAL RESEARCH---` separator. Read both parts.
2. One argument — single most compelling point for their segment. No lists.
   - *Has-website campaigns:* the argument is grounded in the `Problem:` line from the audit block — one concrete, verifiable fact about their specific site. Never a generic claim about websites. **State it softly, after the affirmation — never as the opening blow.** Frame it as something a customer might notice, not a fault.
3. Landing page link — `neobookworm.uk/plumbers` (or the campaign landing_page). Plain raw URL, on its own line, colon at end of preceding sentence.
   - *Has-website campaigns:* the lead-in into the link must use **"here's the standard I build to:"** or **"examples of what I build for [trade]s:"** — never "here's what a rebuilt/updated/new site looks like." See the **Email ↔ landing-page seam** section of `neobookworm-email-templates/SKILL.md`.
4. Risk reversal — "you don't pay until you're happy with it" or equivalent. Mandatory.
   - *Has-website campaigns:* frame as "don't pay until it's better than what you've got."
5. Pricing — "£199 fixed, £9.99/month after that." One sentence, matter-of-fact. **Email 1 only.**
6. Autonomy-preserving close — easy to say no without losing face.
7. Sign-off: `Nick | NeoBookworm.uk`
8. PECR footer (verbatim — see below)

**Word count (body only, excluding footer):** 80–120 words

### Email 2 — Different angle (Day 5)

**Job:** Re-engage with a fresh perspective. Assume they saw Email 1 but didn't click. Don't repeat the same argument.

**Angle shift rules:**
- If E1 led on **price** → E2 leads on **risk-reversal / no-pay-until-happy** (make the guarantee the centrepiece, not a footnote)
- If E1 led on **no-website gap** → E2 leads on **a specific example** ("A [trade] in [nearby town] now gets enquiries through their site every week" — keep it plausible and general, not fabricated)
- If E1 led on **site problem** (has-website) → E2 leads on **ownership / independence** ("You keep your domain. No contract. Cancel any time.")

**Structure:**
1. Brief re-opener — acknowledge they may have seen the last email; don't be apologetic about it
2. New single argument — the angle shift above
3. Landing page link — same URL as E1, plain raw URL
4. Risk reversal — mandatory but can be briefer than E1 ("Still no payment until you're happy")
5. No pricing in E2
6. Short close
7. Sign-off: `Nick | NeoBookworm.uk`
8. PECR footer

**Word count (body only, excluding footer):** 60–90 words

### Email 3 — Soft close (Day 12)

**Job:** Give them one last, low-pressure chance. The explicit "last email" framing paradoxically increases replies. No hard sell whatsoever.

**Structure:**
1. Acknowledge it's the last email — explicitly. ("This is the last time I'll be in touch about this.")
2. One-line summary of the offer — don't re-explain; they've seen it
3. Landing page link — plain raw URL
4. Single graceful exit line — make it easy to say no AND easy to say yes
5. Sign-off: `Nick | NeoBookworm.uk`
6. PECR footer

**Word count (body only, excluding footer):** 50–70 words. Shorter is better for E3.

### Shared rules for all three emails

**Banned words/phrases (all emails):**
❌ SEO, digital presence, online visibility, modern, professional, marketing, brand, solution
❌ "We" or "our team" — always "I"
❌ Imply the prospect is failing, behind, or missing out
❌ Multiple CTAs — the landing page link is the ONLY CTA
❌ Mention competitors (except Email 3 Segment A — factual, brief)
❌ The word "demo" in any form — "a demo I built for you", "here's a demo site for you to look at", "your demo". The demo-first model is retired; the landing page shows trade examples, not a bespoke build. If a draft reverts to demo language it has drifted to the old model — rewrite it.
❌ *(Has-website only)* Any link lead-in implying their site is being replaced — "a rebuilt site", "an updated site", "your new site", "what your site could be". Use "here's the standard I build to:" instead.
❌ *(Has-website only)* Opening on criticism of their existing site — affirm first, mention any gap softly

**Landing page URL rule:** Always plain raw URL. Never Markdown link syntax — `[text](href)` silently truncates UTM parameters at the first `&`.

### PECR footer — verbatim, every email

```
---
To opt out of further emails from NeoBookworm, simply reply with the word UNSUBSCRIBE.
NeoBookworm.uk | Nick Barrett | Swindon
You are receiving this email because your company appears on a public business directory and we believe you may benefit from our services (UK GDPR Art. 6(1)(f) — Legitimate Interests).
Privacy policy: neobookworm.uk/privacy.html
```

---

## Step 6 — Present for approval (STOP HERE)

Present a data quality summary, then the review table, then sample emails.

**Data quality summary** — list of skipped records and flags before the review table.

**Review table** — one row per viable prospect, showing subject lines for all three emails:

*No-website campaigns:*

| # | Business | Town | Segment | Reviews | Yrs* | Flag | E1 Subject | E2 Subject | E3 Subject |
|---|---------|------|---------|---------|------|------|------------|------------|------------|
| 1 | Acme Plumbing | Swindon | B — Growth | 12 | ~5 | | Built this for Acme Plumbing | One thing I didn't mention | Last one from me |
| 2 | Bob's Heating | — | A — Est. | 87 | ~11 | ⚠️ gmail | Bob's Heating — worth 30 seconds | The part that surprises most people | That's it from me, Bob |

*Has-website campaigns (add Sub-segment column):*

| # | Business | Town | Sub-segment | Reviews | Yrs* | Flag | E1 Subject | E2 Subject | E3 Subject |
|---|---------|------|-------------|---------|------|------|------------|------------|------------|
| 1 | Bubble Plumbing | Bristol | C2 — DIY Template | 10 | ~4 | ⚠️ gmail | Bubble Plumbing — paying for Wix? | You'd own this one outright | Last one from me |

*Yrs = estimated from research_summary if years_on_checkatrade is null — note this clearly.

**Full email bodies shown:**
- All three emails (E1, E2, E3) for the **first prospect** as examples
- Nick can ask to see full E2/E3 for any other prospect before approving

Tell Nick: "Here are [N] prospects with a 3-email sequence ready — [M] skipped with reasons above. Full emails shown for [Business Name]. Let me know if anything needs changing, or say 'go ahead' and I'll create the campaign."

**Do not proceed to Step 7 until Nick explicitly approves.**

---

## Step 7 — Create campaign and populate outbox

Only execute after Nick says "go ahead", "looks good", "approve", or similar.

### 7a — Check campaign ID doesn't already exist

```sql
SELECT id FROM campaigns WHERE id = ?
```

If a row exists, tell Nick and stop. Do not overwrite.

### 7b — Insert campaign row

```sql
INSERT INTO campaigns
  (id, trade, landing_page, status, priority, notes, count_total, count_sent)
VALUES
  (?, ?, ?, 'draft', ?, ?, ?, 0)
```

Parameters: `campaign_id`, `trade`, `landing_page`, `priority`, `notes`, `prospect_count × 3`

Note: `count_total` reflects the total outbox rows — three per prospect.

### 7c — Populate the outbox (direct D1)

**Do not use the dashboard API for this step.** `POST https://neobookworm.uk/api/dashboard` requires a `DASHBOARD_SECRET` Bearer token stored as a Vercel environment variable. It is not available in `.env.local` and cannot be retrieved without a separate Vercel CLI call. Every attempt via the API will return 401.

Use direct D1 writes instead. The Cloudflare MCP tool (`d1_database_query`) already has D1:Edit access via the same Cloudflare account used to query prospects.

Insert **three rows per prospect** — E1, E2, and E3. Use a deterministic ID scheme:
- `{short-campaign-slug}-{notion_id}-e1`
- `{short-campaign-slug}-{notion_id}-e2`
- `{short-campaign-slug}-{notion_id}-e3`

This keeps rows idempotent if the step is re-run.

```sql
INSERT OR IGNORE INTO outbox
  (id, campaign_id, notion_id, business_name, email, subject, body, scheduled_not_before)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

**`scheduled_not_before` values:**

Calculate dates at the time of writing. If `embargo_date` is set, use it as the base date for E1. If not set, use today's date as the base.

| Email | `scheduled_not_before` |
|-------|------------------------|
| E1 | `embargo_date` or `NULL` (send as soon as approved) |
| E2 | base date + 5 days (ISO format: `YYYY-MM-DD`) |
| E3 | base date + 12 days (ISO format: `YYYY-MM-DD`) |

The `approved` column defaults to 0 — Nick approves rows via the Dashboard before the sender picks them up.

### 7d — Update count_total

```sql
UPDATE campaigns SET count_total = ? WHERE id = ?
```

Parameters: total number of outbox rows inserted (prospects × 3), `campaign_id`.

### 7e — Mark prospects as In Campaign

Update the status of every prospect just added to the outbox. Use a single `IN` clause with all their `notion_id` values:

```sql
UPDATE prospects
SET status = 'In Campaign'
WHERE notion_id IN (?, ?, ...)
```

This prevents the same prospects from being picked up by a future campaign query (which filters on `status = 'Researched'` or `status = 'Researched with website'`). Run this immediately after Step 7d — before confirming to Nick.

Report the row count updated. If it doesn't match the prospect count, flag the discrepancy.

### 7f — Confirm to Nick

Report:
- Campaign ID and status (`draft`)
- Number of prospects in sequence
- Total outbox rows created (prospects × 3)
- Embargo dates: E1 sends from [date], E2 from [date], E3 from [date]
- Number skipped (and brief reason)
- Next steps: Dashboard → Campaigns → Activate, then approve individual rows before sending

---

## Safety rules

- Never write to D1 or call the API before Step 6 approval. If in doubt, ask.
- Stop and report if prospect count is 0 — do not proceed with an empty campaign.
- Stop and report if D1 MCP is unavailable — do not fabricate prospect data.
- Do not email sole traders — `company_type = 'ltd'` filter is mandatory. If Nick asks to include sole traders, explain the PECR legal basis difference and ask him to confirm explicitly.
- Always flag data quality issues before drafting — never silently skip records without telling Nick.
- All three emails for a prospect use the same `email_address` — never split a sequence across different addresses for the same prospect.
- If a prospect opts out (UNSUBSCRIBE reply) after E1 is sent, E2 and E3 must be manually removed from the outbox via the Dashboard before their embargo dates are reached.

---

## Presenting updated reference files

When any reference file is updated during a session (e.g. `neobookworm-email-templates/SKILL.md`), always present it for download using this standard process:

1. **YAML frontmatter first** — every skill file must start with a `---` frontmatter block. Before presenting, confirm the file starts with:
   ```yaml
   ---
   name: skill-name-in-kebab-case
   description: "One-sentence description of what the file contains and when to use it."
   ---
   ```
   If the frontmatter is missing, add it before presenting. Never present a skill file without it.

2. Copy the updated file to `/mnt/user-data/outputs/SKILL.md` (always this exact name — it triggers the "Save skill" button in the UI)
3. Call `present_files` with that path
4. Tell Nick which Dropbox path to save it back to

```bash
# Standard pattern:
cp /home/claude/updated-file.md /mnt/user-data/outputs/SKILL.md
# then present_files(["/mnt/user-data/outputs/SKILL.md"])
```

This applies to any skill or reference doc edited during a campaign setup session. Never present updated reference files under their original filename — the SKILL.md name is what triggers the save button.
