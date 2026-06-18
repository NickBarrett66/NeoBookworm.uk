---
name: neobookworm-campaign-setup
description: "Sets up a NeoBookworm cold-email campaign end-to-end: queries D1 for qualifying Ltd-company prospects by trade and campaign type, drafts three personalised emails per prospect (with Email 2 and 3 embargoed for delayed sending), presents a review table and sample emails for approval, then creates the campaign row and populates the outbox — all before anything goes live. Supports single-trade runs and multi-trade batch runs across all trades that have a completed landing page, processing prospects in chunks of 25. Use this skill whenever Nick says 'set up a campaign', 'create a campaign', 'prepare emails for [trade]', 'run a campaign for [trade]', 'run the next batch', 'process the trades with landing pages', or mentions a trade alongside words like 'email', 'outreach', 'prospects', or 'send' in a NeoBookworm context. Trigger even if Nick only partially describes the parameters — the skill will ask for the rest."
---

# NeoBookworm Campaign Setup

## Overview

Sets up a cold-email campaign for one or more trades. Queries D1 for qualifying prospects, drafts three personalised emails per prospect pointing to a trade landing page, presents them for approval, and only then creates the campaign and outbox rows. Nothing is written to D1 until Nick explicitly approves.

Each prospect receives a **three-email sequence** over 12 days:
- **Email 1 — Day 0:** Sends immediately (or on embargo date). Personalised intro and primary hook.
- **Email 2 — Day 5:** A different angle (social proof / risk-reversal). Shorter and punchier.
- **Email 3 — Day 12:** Soft close — explicitly the last contact. Very short, no hard sell.

Emails 2 and 3 are written and loaded to the outbox at the same time as Email 1, but embargoed via `scheduled_not_before` so the sender script holds them until the right date.

## Two run modes

This skill runs in one of two modes. Detect which from Nick's request:

| Mode | Triggered by | Behaviour |
|------|--------------|-----------|
| **Single-trade** | Nick names one trade ("run a campaign for plumbers") | Process that one trade. Nick supplies the parameters as before. |
| **Multi-trade batch** | "process the trades with landing pages", "run the next batch across all trades", "do all the trades that are ready" | Read the `landing_pages` table, iterate over every trade with a live page, and process each one in turn — automatically choosing no-website / has-website based on which landing page URLs exist. |

In **both** modes, prospects are processed in **batches of 25 per trade per run** (see Step 0 and Step 2). This keeps each campaign reviewable and keeps daily send volume sane. Running the skill again picks up the next 25 for each trade, because the previous batch is marked `In Campaign` and falls out of the query.

---

## Step 0 — The `landing_pages` table (source of truth for what's ready)

The skill no longer relies on Nick typing a landing-page URL by hand. A D1 table records which trades have a completed landing page and the exact URL for each campaign type.

### Schema

```sql
CREATE TABLE IF NOT EXISTS landing_pages (
  trade            TEXT PRIMARY KEY,   -- must match prospects.trade_category exactly
  no_website_url   TEXT,               -- e.g. https://neobookworm.uk/plumbers   (NULL if not built)
  has_website_url  TEXT,               -- e.g. https://neobookworm.uk/plumbers-switch (NULL if not built)
  status           TEXT DEFAULT 'live',-- 'live' | 'draft' | 'paused'
  notes            TEXT,
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now'))
);
```

Create it once (idempotent) using `Cloudflare Developer Platform:d1_database_query` against database `0ae32598-1680-4995-a010-96b647eacabd`, account `4f0a019a24cacd090cf6b3c3cf31c732`. Running the `CREATE TABLE IF NOT EXISTS` is harmless if it already exists.

### Recording a completed landing page

When Nick says a landing page is done (e.g. "the electricians no-website page is live"), upsert a row:

```sql
INSERT INTO landing_pages (trade, no_website_url, has_website_url, status, notes)
VALUES (?, ?, ?, 'live', ?)
ON CONFLICT(trade) DO UPDATE SET
  no_website_url  = COALESCE(excluded.no_website_url,  landing_pages.no_website_url),
  has_website_url = COALESCE(excluded.has_website_url, landing_pages.has_website_url),
  status          = excluded.status,
  notes           = COALESCE(excluded.notes, landing_pages.notes),
  updated_at      = datetime('now');
```

`COALESCE` means you can set just the no-website URL today and add the has-website URL later without wiping the first.

### Reading what's ready (multi-trade mode)

```sql
SELECT trade, no_website_url, has_website_url
FROM landing_pages
WHERE status = 'live'
  AND (no_website_url IS NOT NULL OR has_website_url IS NOT NULL)
ORDER BY trade;
```

For each trade row, the skill runs **up to two sub-campaigns**:
- a **no-website** sub-campaign if `no_website_url IS NOT NULL`
- a **has-website** sub-campaign if `has_website_url IS NOT NULL`

A trade with only one URL set runs only that one campaign type. Never invent a URL — if a URL is NULL, that campaign type is simply skipped for that trade and reported as such.

---

## Step 1 — Gather / resolve parameters

### Single-trade mode

Collect the following. Ask for anything missing:

| Parameter | Description | Default |
|---|---|---|
| `trade` | Trade category exactly as it appears in D1 (e.g. `Plumber`, `Electrician`) | — required |
| `campaign_type` | `no-website` or `has-website` | look up in `landing_pages`; if both URLs exist, ask Nick which (or offer both) |
| `landing_page` | CTA URL | **looked up from `landing_pages`** — do not ask Nick to type it |
| `batch_size` | Prospects per run | `25` |
| `priority` | Integer 1–10 (higher = sent sooner) | `5` |
| `embargo_date` | ISO date — Email 1 not sent before this date (optional) | none |
| `notes` | Free-text notes stored on the campaign row (optional) | none |

If the named trade has no `landing_pages` row, stop and tell Nick: the landing page isn't recorded yet. Offer to add it with the upsert in Step 0.

### Multi-trade batch mode

No trade is named. Read the `landing_pages` table (Step 0 query), build the work list (one entry per trade × available campaign type), and confirm it with Nick before doing any drafting:

> "Found N trades with live landing pages. I'll process up to 25 prospects per trade per type: [Plumber — no-website + has-website], [Electrician — no-website only], … Each becomes its own campaign. Proceed?"

`batch_size` defaults to 25, `priority` to 5, no embargo, unless Nick overrides globally.

### `campaign_id` (both modes)

Generated automatically per sub-campaign — never reused across batches. Scheme:

```
{trade-slug}-{type}-{YYYY-MM-DD}-b{batch-number}
```

e.g. `plumber-nowebsite-2026-06-16-b1`, `plumber-haswebsite-2026-06-16-b1`. The batch number comes from Step 2's count of how many campaigns already exist for that trade+type (so a re-run the same day increments to `b2`).

Confirm the resolved parameters (or the full work list) with Nick before proceeding.

---

## Step 2 — Query D1 for prospects (batched, 25 at a time)

Use `Cloudflare Developer Platform:d1_database_query`:
- database_id: `0ae32598-1680-4995-a010-96b647eacabd`
- account: `4f0a019a24cacd090cf6b3c3cf31c732`

The query is run **once per trade per campaign type**. The `LIMIT` is the batch size (default 25). Because Step 7e marks each processed prospect as `In Campaign`, the same query on the next run naturally returns the *next* 25 — no offset bookkeeping needed.

**For a `no-website` sub-campaign:**
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
LIMIT 25;
```

**For a `has-website` sub-campaign:**
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
LIMIT 25;
```

**Batch-number lookup** (for the campaign_id slug), run per trade+type:
```sql
SELECT COUNT(*) AS prior FROM campaigns
WHERE id LIKE ? ;  -- e.g. 'plumber-nowebsite-%'
```
`batch_number = prior + 1`.

Report the prospect count per trade per type. If a query returns zero, **do not stop the whole run** in multi-trade mode — just report "Plumber / has-website: 0 ready, skipped" and move to the next. In single-trade mode, a zero count stops and explains (likely a trade-name spelling issue, wrong status, or the pool is exhausted).

---

## Step 2a — Data quality flags (per batch)

Before segmenting each batch, scan its records and flag issues to Nick:

| Issue | Action |
|-------|--------|
| `research_summary` is a placeholder ("I'd be happy to help but I need the location...") | Mark as **Skip — incomplete research**. Do not draft. |
| `town` is null | Note it in the review table. Extract from research_summary if possible. |
| `has_website = 1` on a no-website campaign | Mark as **Skip — has website** (belongs in the has-website pool) |
| `email_address` is a free generic account (hotmail, gmail, yahoo) | Flag as **⚠️ deliverability risk** in review table — include but highlight |
| `company_type` is not `ltd` | Exclude silently (SQL filter handles this, but report the count excluded) |
| `years_on_checkatrade` is null for most/all records | Note this — years will be estimated from research_summary incorporation dates |

**`has-website` sub-campaigns only — audit gate:**

Count how many returned records have `website_sub_segment` null OR `research_summary` that does NOT begin with `WEBSITE AUDIT —`.

| Unaudited record count | Action |
|------------------------|--------|
| **Zero** | All records audited — proceed normally |
| **1–3 records** | Flag to Nick. Offer to proceed without them or audit them now before continuing. |
| **4 or more** | **Stop this sub-campaign.** Tell Nick: "Most of the has-website [trade] prospects in this batch haven't been audited — run `neobookworm-website-audit` for [trade] first." In multi-trade mode, skip just this sub-campaign and continue with the rest. |

The audit gate exists because unaudited `research_summary` fields for has-website prospects were written for the no-website pitch. Drafting from them produces emails that imply the prospect doesn't have a website — which destroys credibility.

Summarise flags before presenting each batch's review table.

---

## Step 3 — Segment each prospect

For each viable prospect, assign a segment.

**No-website sub-campaigns:**

| Segment | Criteria |
|---------|----------|
| A — Established | 15+ reviews AND estimated 7+ years trading |
| B — Growth Phase | 5–15 reviews OR 0–7 years trading (not Established) |
| D — New Entrant | Under 5 reviews AND under 2 years trading |

**Has-website sub-campaigns:**

Read `website_sub_segment` from D1 (populated by `neobookworm-website-audit`). Map directly to email segment:

| `website_sub_segment` value | Email segment | Primary hook |
|-----------------------------|---------------|--------------|
| `Parked/Dead` | C1 — Dead Domain | They've had a site before, so they know its value; getting one live is quick and risk-free. **Never mention the lapse, parking page, or dead domain.** |
| `DIY Template` | C2 — DIY Template | Ownership as a positive alternative: a clean site you own outright, no platform fee. £199 once (or £49.99 founder rate + reason), £9.99/month, you don't pay until you're happy. **Never describe or knock their current site.** |
| `Agency-managed` | C3 — Agency | Independence: no lock-in, no contract, you keep your domain. Softest tone — likely an existing third-party relationship. Lowest priority; do not lead on price. Never criticise the agency or site. |
| `Functional but weak` | C4 — Weak Site | Sell the standard I build to in positive terms (fast, accreditations clear, easy to contact). **Never name the audit `Problem:` line or any fault — it's an internal signal only.** |
| `Out of scope` | — | **Skip — do not email.** Site is adequate; no pitch angle. |
| null / not set | — | **Skip — not audited.** Flag in data quality summary; do not draft. |

⛔ **CARDINAL RULE for all C sub-segments:** the email never mentions, describes, rates, or hints at anything about the prospect's existing site (or lack of one). The `website_sub_segment` and the audit `Problem:` line are **internal targeting/tone signals only** — they never become a sentence in the email. Affirm they have a site, sell the standard I build to, remove risk with pay-when-happy. (This rule replaces the old "affirm first, gap softly" model — see the CARDINAL RULE in `neobookworm-email-templates/SKILL.md`.)

For has-website sub-campaigns, the review-count segments (A/B/D) still inform tone and personalisation within each C sub-segment — an established C1 prospect with 200 reviews gets a warmer opening than one with 5 — but personalisation draws only on positive business facts, never on anything about their website.

If `years_on_checkatrade` is null, estimate years from incorporation date in `research_summary`. Note the estimate in the review table.

---

## Step 4 — Read reference files before drafting

**Always read both files before drafting any emails:**
- `/mnt/skills/user/neobookworm-email-templates/SKILL.md` — segment angles, email structures, word counts, tone constraints, and subject line rules for every segment (A, B, C1–C4, D). Use `view` to read.
- `C:\Users\Nick\Dropbox\00 Neobookworm\NeoBookworm.uk\docs\neobookworms-voice.md` — voice principles (non-negotiable copy constraints that apply to all outreach). Read via `Filesystem:read_file`.

Read these once at the start of the run — they apply to every batch and every trade.

---

## Step 5 — Draft all three emails per prospect

Draft Email 1, Email 2, and Email 3 for every viable prospect. Each email has a distinct job and its own word-count target. The `landing_page` used in every email is the URL resolved from the `landing_pages` table for **this trade and this campaign type** — never a hand-typed value, and never mixed between types.

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
   - *Has-website campaigns:* **affirm only.** Open by acknowledging they already have a site (a genuine positive — most don't) — the `-switch` page hero does exactly this ("You've already taken the website step. Most [trade]s haven't."), and the email must match it. Personalisation hooks (owner name, review count, accreditations, coverage area) come from the original business research below the `---ORIGINAL RESEARCH---` separator. **Do NOT use the audit block to describe their site** — it is an internal targeting/tone signal only (CARDINAL RULE).
2. One argument — single most compelling point for their segment. No lists.
   - *Has-website campaigns:* the argument is the **standard I build to**, framed positively (what every site I build includes — fast loading, accreditations clear, easy to contact, owned outright). **Never reference the `Problem:` line, any fault, or anything about their specific site** — that is the exact criticism the CARDINAL RULE forbids. Let the examples page do the comparing in their own head.
3. Landing page link — the resolved `landing_page` for this trade+type (e.g. `https://neobookworm.uk/plumbers`). Must include `https://` so email clients recognise it as a hyperlink. Plain raw URL, on its own line, colon at end of preceding sentence.
   - *Has-website campaigns:* the lead-in into the link must use **"here's the standard I build to:"** or **"examples of what I build for [trade]s:"** — never "here's what a rebuilt/updated/new site looks like." See the **Email ↔ landing-page seam** section of `neobookworm-email-templates/SKILL.md`.
4. Risk reversal — "you don't pay until you're happy with it." Mandatory.
   - *Has-website campaigns:* use the same line. Do **not** use "better than what you've got" — it implies theirs is worse, which is a comparison/criticism (CARDINAL RULE).
5. Pricing — "£199 fixed, £9.99/month after that." One sentence, matter-of-fact. **Email 1 only.** If founder rate active: "£49.99 [+ reason], £9.99/month after that." Confirm current phase with the `neobookworm-email-templates` skill.
6. Autonomy-preserving close — easy to say no without losing face.
7. Sign-off: `Nick | NeoBookworm.uk`
8. PECR footer (verbatim — see below)

**Word count (body only, excluding footer):** 80–120 words

### Email 2 — Different angle (Day 5)

**Job:** Re-engage with a fresh perspective. Assume they saw Email 1 but didn't click. Don't repeat the same argument.

**Angle shift rules:**
- If E1 led on **price** → E2 leads on **risk-reversal / no-pay-until-happy** (make the guarantee the centrepiece, not a footnote)
- If E1 led on **no-website gap** → E2 leads on **a specific example** ("A [trade] in [nearby town] now gets enquiries through their site every week" — keep it plausible and general, not fabricated)
- **Has-website** → E2 leads on **ownership / independence** ("You keep your domain. No contract. Cancel any time.") or the standard I build to, framed positively. Never reference their current site (CARDINAL RULE).

**Structure:**
1. Brief re-opener — acknowledge they may have seen the last email; don't be apologetic about it
2. New single argument — the angle shift above
3. Landing page link — same URL as E1, plain raw URL including `https://`
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
3. Landing page link — plain raw URL including `https://`
4. Single graceful exit line — make it easy to say no AND easy to say yes
5. Sign-off: `Nick | NeoBookworm.uk`
6. PECR footer

**Word count (body only, excluding footer):** 50–70 words. Shorter is better for E3.

### Shared rules for all three emails

**⛔ CARDINAL RULE — never criticise the prospect, however tangentially.**
No email states, implies, or "softly notes" anything negative about the prospect's current website, setup, or absence of one — no flaws, gaps, scores, parking pages, platforms, missing accreditations, or "one thing a customer might notice". The prospect should feel offered something good, never told they've got something bad. Sell what *I* build (the standard, ownership, pay-when-happy) — never by contrast with theirs. This overrides everything else. Read each email back as the recipient: if any sentence could make them feel judged or behind, rewrite it. (A real prospect called an earlier "factual" critique *"unhinged, untrue and frankly bullshit"* — hence this rule.)

**Banned words/phrases (all emails):**
❌ Any reference to a fault, gap, or detail of the prospect's existing site — CARDINAL RULE
❌ SEO, digital presence, online visibility, modern, professional, marketing, brand, solution
❌ "We" or "our team" — always "I"
❌ Imply the prospect is failing, behind, or missing out
❌ Multiple CTAs — the landing page link is the ONLY CTA
❌ Mention competitors (except Email 3 Segment A — factual, brief)
❌ The word "demo" in any form — "a demo I built for you", "here's a demo site for you to look at", "your demo". The demo-first model is retired; the landing page shows trade examples, not a bespoke build. If a draft reverts to demo language it has drifted to the old model — rewrite it.
❌ *(Has-website only)* Any link lead-in implying their site is being replaced — "a rebuilt site", "an updated site", "your new site", "what your site could be". Use "here's the standard I build to:" instead.
❌ *(Has-website only)* "better than what you've got" — implies theirs is worse. Use "you don't pay until you're happy with it."

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

Present results **per sub-campaign** (per trade per type). In multi-trade mode, present all sub-campaigns together in one review, clearly sectioned by trade and type, so Nick can approve the whole run or pick which sub-campaigns go ahead.

For each sub-campaign show: a data quality summary, then the review table, then sample emails.

**Data quality summary** — list of skipped records and flags before the review table.

**Review table** — one row per viable prospect, showing subject lines for all three emails:

*No-website sub-campaigns:*

| # | Business | Town | Segment | Reviews | Yrs* | Flag | E1 Subject | E2 Subject | E3 Subject |
|---|---------|------|---------|---------|------|------|------------|------------|------------|
| 1 | Acme Plumbing | Swindon | B — Growth | 12 | ~5 | | Built this for Acme Plumbing | One thing I didn't mention | Last one from me |
| 2 | Bob's Heating | — | A — Est. | 87 | ~11 | ⚠️ gmail | Bob's Heating — worth 30 seconds | The part that surprises most people | That's it from me, Bob |

*Has-website sub-campaigns (add Sub-segment column):*

| # | Business | Town | Sub-segment | Reviews | Yrs* | Flag | E1 Subject | E2 Subject | E3 Subject |
|---|---------|------|-------------|---------|------|------|------------|------------|------------|
| 1 | Bubble Plumbing | Bristol | C2 — DIY Template | 10 | ~4 | ⚠️ gmail | Bubble Plumbing — paying for Wix? | You'd own this one outright | Last one from me |

*Yrs = estimated from research_summary if years_on_checkatrade is null — note this clearly.

**Full email bodies shown:**
- All three emails (E1, E2, E3) for the **first prospect of each sub-campaign** as examples
- Nick can ask to see full E2/E3 for any other prospect before approving

Tell Nick, per run: "Here are [K] sub-campaigns across [J] trades — [N] prospects total, [M] skipped with reasons above. Each is capped at 25 prospects this batch. Full emails shown for the first prospect in each. Say 'go ahead' to create all, or name the ones you want."

**Do not proceed to Step 7 until Nick explicitly approves.** Nick may approve the whole run, or a subset of sub-campaigns — only create the ones he names.

---

## Step 7 — Create campaign and populate outbox

Only execute after Nick approves. In multi-trade mode, run Step 7 **once per approved sub-campaign**, in sequence. Treat each sub-campaign as fully independent — one failing or being skipped never blocks the others.

### 7a — Check campaign ID doesn't already exist

```sql
SELECT id FROM campaigns WHERE id = ?
```

If a row exists, tell Nick and skip that sub-campaign. Do not overwrite. (The `-b{n}` batch suffix should already prevent collisions.)

### 7b — Insert campaign row

```sql
INSERT INTO campaigns
  (id, trade, landing_page, status, priority, notes, count_total, count_sent)
VALUES
  (?, ?, ?, 'draft', ?, ?, ?, 0)
```

Parameters: `campaign_id`, `trade`, resolved `landing_page` for this type, `priority`, `notes`, `prospect_count × 3`

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

Update the status of every prospect just added to the outbox **for this sub-campaign**. Use a single `IN` clause with all their `notion_id` values:

```sql
UPDATE prospects
SET status = 'In Campaign'
WHERE notion_id IN (?, ?, ...)
```

This is also the batching mechanism: marking these 25 as `In Campaign` removes them from the `Researched` / `Researched with website` pool, so the next run of Step 2 returns the *next* 25 automatically. Run this immediately after Step 7d — before confirming to Nick.

Report the row count updated. If it doesn't match the prospect count, flag the discrepancy.

### 7f — Confirm to Nick

Report, per sub-campaign:
- Campaign ID and status (`draft`)
- Trade and campaign type
- Number of prospects in sequence (this batch)
- Total outbox rows created (prospects × 3)
- Embargo dates: E1 sends from [date], E2 from [date], E3 from [date]
- Number skipped (and brief reason)

Then a **run summary** across all sub-campaigns, and a note on remaining pool depth per trade so Nick knows whether another batch is worth running:

```sql
-- remaining no-website for this trade
SELECT COUNT(*) FROM prospects
WHERE status = 'Researched' AND trade_category = ?
  AND do_not_contact = 0 AND company_type = 'ltd'
  AND email_address IS NOT NULL AND email_address != '';
-- (and the 'Researched with website' equivalent for has-website)
```

Report e.g. "Plumber: 25 queued this batch, ~63 still in the Researched pool — run again tomorrow for the next 25." Next steps: Dashboard → Campaigns → Activate, then approve individual rows before sending.

---

## Safety rules

- Never write to D1 or call the API before Step 6 approval. If in doubt, ask.
- Stop and report if a single-trade prospect count is 0. In multi-trade mode, skip the empty sub-campaign and continue.
- Stop and report if D1 MCP is unavailable — do not fabricate prospect data.
- Never invent a landing page URL. If `landing_pages` has no live URL for a trade+type, that campaign type is skipped and reported — emails must never point at a page that doesn't exist.
- Do not email sole traders — `company_type = 'ltd'` filter is mandatory. If Nick asks to include sole traders, explain the PECR legal basis difference and ask him to confirm explicitly.
- Always flag data quality issues before drafting — never silently skip records without telling Nick.
- All three emails for a prospect use the same `email_address` — never split a sequence across different addresses for the same prospect.
- Never let the landing-page URL of one campaign type leak into the other — no-website prospects get the no-website URL, has-website prospects get the `-switch` URL.
- Respect the batch cap (25 by default) — do not process the entire pool in one run unless Nick explicitly raises `batch_size`.
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
