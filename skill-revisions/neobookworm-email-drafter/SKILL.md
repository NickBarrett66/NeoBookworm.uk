---
name: neobookworm-email-drafter
description: "Drafts outreach email copy for NeoBookworm prospects sending them to a landing page that shows example sites and persuades them to sign up. The key hook is 'you don't pay until you're happy'. Use this skill whenever Nick provides a D1 record ID or business name and wants to produce email copy — for initial outreach, follow-ups, or any email in the NeoBookworm pipeline. Also triggers when Nick says 'draft the email for', 'write the outreach for', 'create a follow-up for', or 'generate email variants for'. Always use this skill for NeoBookworm email production — it ensures brand voice consistency, objection-aware copy, and proper record-keeping."
---

# NeoBookworm Email Drafter

Produces two brand-consistent, objection-aware email variants for a NeoBookworm prospect, then saves the chosen variant as a record in the Notion Email Outreach database.

## Core model: what the email is selling

Emails do NOT reference a bespoke demo site built for the prospect. Instead:
- The CTA is a landing page URL (e.g. `neobookworm.uk/plumbers`) that shows **example sites** and explains the service
- The primary hook is **"you don't pay until you're happy with it"** — this eliminates risk and is the single biggest differentiator
- Pricing is stated clearly: **£199 fixed build, £9.99/month hosting**
- The email's job is to get them curious enough to click the landing page — not to sell the whole service in the email

**Always read both reference files before drafting:**
- `C:\Users\Nick\Dropbox\00 Neobookworm\NeoBookworm.uk\docs\neobookworms-voice.md` — tone principles, vocabulary rules, what to avoid
- The **`neobookworm-email-templates` skill (`SKILL.md`)** — the single source of truth for segment-by-segment structure, psychological approach, word counts, the Segment C sub-segments (C1–C4), pricing framing, the banned link lead-ins, and the **Email ↔ landing-page seam** mapping. (The old `docs/Email Templates.md` is deprecated — it now just points here. Do not draft from it.)

---

## ⚠️ Contact Cap — Non-Negotiable

| Business type | Max emails | Legal basis |
|---------------|-----------|-------------|
| Ltd company   | **3 total** (Email 1 + Follow-up 1 + Follow-up 2) | PECR |
| Sole trader   | **Do not email** — flag for postal outreach via Stannp instead |

Check `company_type` before drafting. Never draft any email for a sole trader.

---

## Step 1: Fetch the Prospect Record

Query D1 using `Cloudflare Developer Platform:d1_database_query`:
- database_id: `0ae32598-1680-4995-a010-96b647eacabd`
- account: `4f0a019a24cacd090cf6b3c3cf31c732`

```sql
SELECT notion_id, business_name, trade_category, town, prospect_segment,
       research_summary, email_campaign_id, business_type, company_type,
       status, has_website, website_url, contact_name, email_address,
       notes, agent_log
FROM prospects
WHERE notion_id = '{id}';
```

Or by name:
```sql
SELECT notion_id, business_name, trade_category, town, prospect_segment,
       research_summary, email_campaign_id, business_type, company_type,
       status, has_website, website_url, contact_name, email_address,
       notes, agent_log
FROM prospects
WHERE business_name LIKE '%{search term}%'
LIMIT 5;
```

**Key fields:**

| Field | Column | Notes |
|-------|--------|-------|
| Contact first name | `contact_name` | Use only if populated; otherwise omit salutation |
| Business name | `business_name` | |
| Trade category | `trade_category` | Drives landing page URL and segment logic |
| Town | `town` | May be null — fall back to research_summary |
| Segment | `prospect_segment` | A/B/C/D — if null, assign based on review_count + years logic |
| Research summary | `research_summary` | Essential for personalisation — check it's not a placeholder |
| Company type | `company_type` | Must be `ltd` — never email sole traders |
| Email | `email_address` | Check it's not a generic hotmail/gmail if possible |
| Has website | `has_website` | 1 = has website (may be Segment C candidate) |
| Status | `status` | Determines which email in sequence to draft |

---

## Step 2: Data quality checks — flag before drafting

Before drafting, flag any of the following to Nick:

| Issue | What to flag |
|-------|-------------|
| `research_summary` is a placeholder | Looks like "I'd be happy to help but I need the location..." — do not draft, tell Nick |
| `town` is null | Note it — use town from research summary if available, otherwise omit location references |
| `email_address` is a generic free account (hotmail, gmail, yahoo) | Flag — deliverability risk, may not reach a business inbox |
| `has_website = 1` but campaign is no-website | Flag — prospect may be better suited to has-website campaign |
| `company_type` is not `ltd` | Stop — do not draft, flag for postal outreach |
| `prospect_segment` is null | Assign segment yourself using review_count and years_on_checkatrade from research summary, then confirm with Nick |

---

## Step 3: Determine Email Type

| Prospect Status | Email to draft |
|----------------|----------------|
| `Researched` or `New` | Email 1 — Initial Outreach |
| `Emailed` | Follow-up 1 |
| `Followed up` | Follow-up 2 (check contact cap — Ltd only) |

---

## Step 4: Identify Segment and Load Strategy

Refer to the **`neobookworm-email-templates` skill** for the full psychological approach, structure, example, and "what NOT to write" for each segment. Summary:

| Segment | Profile | Primary objection | Email angle |
|---------|---------|-------------------|-------------|
| **A — Established** | 15+ reviews, 7+ yrs | "Don't need it — fully booked" | Referral amplification: happy customers can't send a link |
| **B — Growth Phase** | 5–15 reviews, 2–7 yrs | "Haven't got round to it" | Landing page: see examples of what I build, no effort required |
| **C — Has website** | Has a live/lapsed site | "Already got one" | **Affirm first, gap softly.** Splits into C1–C4 (see below) |
| **D — New Entrant** | 0–5 reviews, under 2 yrs | "Too early / can't afford" | Credibility infrastructure: look established from day one |

**Segment C is not one segment — it has four sub-segments** (set by `neobookworm-website-audit` in `website_sub_segment`). Read the templates skill for the full angle on each; never collapse them into a generic "bad website" pitch:

| Sub-segment | Site state | Angle |
|---|---|---|
| **C1 — Dead Domain** | Domain lapsed, parking page | They had one before; getting it back, less effort than first time |
| **C2 — DIY Template** | Wix/GoDaddy/Squarespace | Cost + ownership — never criticise the look |
| **C3 — Agency-managed** | Built by a third party | Softest pitch; domain-ownership question only; do not criticise the agency |
| **C4 — Functional but Weak** | Real site, one concrete gap | The single audit `Problem:` line, stated softly as a customer-experience note |

**For every C sub-segment: affirm the prospect's existing site first, mention any gap softly, and frame the link as "here's the standard I build to:" — never "here's what a rebuilt/updated site looks like."** Has-website prospects go to the `-switch` landing page (e.g. `neobookworm.uk/plumbers-switch`).

---

## Step 5: Draft Two Variants

Variants must be **strategically distinct** — different psychological angle, not just different tone.

### The email's job

The email does not sell the website. It sells the click. The landing page does the rest.

Structure for Email 1:
1. Opening — specific personalisation from research_summary (never generic)
2. One argument — the single most compelling reason to click, for this segment
3. Landing page link — prominently, on its own line
4. Risk reversal — "you don't pay until you're happy with it" or equivalent
5. Pricing — £199 fixed, £9.99/month (one sentence, matter-of-fact). Use the templates skill's pricing framing — by default name the offer (the site shows £299; because they've come across it directly, it's £199). Never imply the price is time-limited.
6. Autonomy-preserving close — easy to say no without losing face
7. Sign-off and footer

### Landing page URL

Use the `landing_page` value from the campaign parameters (e.g. `neobookworm.uk/plumbers`). This is NOT a bespoke demo URL — it is the trade-specific landing page that shows **example sites I've built for other tradespeople in this trade**.

Do NOT write the URL as a Markdown hyperlink — paste it as a plain raw URL on its own line.

### ⚠️ Landing page framing — critical in follow-ups

In follow-up emails, never write phrases like:
- ❌ "The site for [Business Name] is still live"
- ❌ "Your site is still there"
- ❌ "The demo I built for you is still up"
- ❌ "here's a demo site for you to look at" / any use of the word "demo" — that model is retired

These imply a bespoke site exists for this prospect, which is false. The landing page shows examples of what I build generally. Correct framing:
- ✅ "If you want to see examples of what I build: [URL]"
- ✅ "The page is still there if you want a look: [URL]"
- ✅ "Examples of what I build for [trade]s: [URL]"
- ✅ *(has-website)* "Here's the standard I build to: [URL]"

**Has-website only — never imply their site needs rebuilding.** Banned link lead-ins: "a rebuilt site", "an updated site", "your new site", "what your site could be". These presume their site is inadequate at the moment you hand them the link — the exact failure to avoid. The `-switch` page affirms them ("You've already taken the website step"); the email must match that tone.

### Universal hard rules

**Must include:**
- ✅ Opening personalised to this prospect from research_summary — never generic
- ✅ One argument only — no lists, no multiple benefit claims
- ✅ Landing page URL on its own line, plain text (no Markdown link syntax)
- ✅ Risk reversal explicit — "you don't pay until you're happy" or equivalent
- ✅ Pricing stated clearly — £199 fixed, £9.99/month. Never "from" or "around"
- ✅ Autonomy-preserving close in every email
- ✅ Sign-off: `Nick | NeoBookworm.uk` — nothing else
- ✅ First-person singular throughout — "I build," never "we"
- ✅ PECR footer verbatim (see below)

**Never include:**
- ❌ SEO, digital presence, online visibility, responsive design, CMS, conversion rate, marketing, brand
- ❌ Multiple CTAs — the landing page link is the only CTA
- ❌ Bullet lists inside the email body — prose only
- ❌ "We" or "our team"
- ❌ Generic openers: "I hope this finds you well", "My name is Nick"
- ❌ Competitors (except Email 3, Segment A, factual and brief)
- ❌ Any language implying a bespoke site or demo was built for this specific prospect
- ❌ Phrases like "the demo I built for you", "the site for [Business Name] is still live", or "your site" used to mean a site *I* made — there is no bespoke build. (For has-website prospects, referring to *their own existing* site is fine and expected — e.g. "you've already got a site up.")
- ❌ **Spam trigger words — never use any of the following in subject lines or email body:**
  - *Retail/commercial:* as seen on, order, order status, buy, clearance, buy direct, free gift card, discount
  - *Personal/dating:* meet singles, hot men, hot women, easy date, score tonight, dear friend, beloved, urgent, desperate, please help
  - *Get rich quick:* additional income, double your income, earn x per week, home based, income from home, urgent proposal, opportunity, make $, potential earnings, earn extra cash, extra income, home based business, make money, online degree, university diplomas, work from home, you're a winner, online biz opportunity
  - *Financial schemes:* invoice, PayPal, Visa, Mastercard, FedEx, $$$, beneficiary, cash, claims, quote, save big money, one hundred percent free, collect your prize, check or money order, stock alert, social security number, unsecured debt, cash bonus, refinance, investment, mortgage, million dollars
  - *Marketing:* lead generation, search engine optimization, web traffic, email harvest, increase sales, internet marketing, marketing solutions, month trial offer, increase traffic, direct marketing, sign up free today
  - *Pharmaceutical:* cure baldness, Viagra, lose weight, online pharmacy, stop snoring, removes wrinkles, reverses aging, perform in bed

### Follow-up angle switches (per segment)

Follow-up 1 always switches angle from Email 1. See the `neobookworm-email-templates` skill for prescribed angles:
- Segment A → ownership/dependency (Checkatrade price hikes)
- Segment B → Checkatrade cost comparison
- Segment C → performance data (PageSpeed or mobile issue)
- Segment D → no-risk + cost anchor

Follow-up 2 (Ltd only):
- Segment A → competitor awareness / local search volume (only email where this is appropriate)
- Segment B → simple breakup, leave door open, link to landing page as "examples of what I build"
- Segment C → easy transition / content migration angle
- Segment D → future-focus, reviews growing over time

### Word count targets (body only, excluding sign-off and footer)

- Email 1: 80–120 words (varies by segment — see the `neobookworm-email-templates` skill)
- Follow-up 1: 70–100 words
- Follow-up 2: 40–70 words

### Format for each variant

```
**Variant [A/B] — [3-word strategic label]**

Subject: [subject line]

[Hi [First name],  — only if contact_name is populated]

[Opening line — specific personalisation from research_summary. One or two sentences.]

[Argument paragraph — single point, prose only.]

[Sentence leading into landing page link, ending with a colon or natural lead-in:]

neobookworm.uk/plumbers

[Risk reversal sentence — "you don't pay until you're happy with it" or equivalent.]

[Pricing sentence — "A full 5-page site is £199 fixed, £9.99/month after that." Email 1 only.]

[Autonomy-preserving close — one short sentence.]

Nick | NeoBookworm.uk

---
To opt out of further emails from NeoBookworm, simply reply with the word UNSUBSCRIBE.
NeoBookworm.uk | Nick Barrett | Swindon
You are receiving this email because your company appears on a public business directory and we believe you may benefit from our services (UK GDPR Art. 6(1)(f) — Legitimate Interests).
Privacy policy: neobookworm.uk/privacy.html
```

For the **final email in the sequence**, add this line immediately before the `---` separator:
```
This is my final email to you on this — I won't be in touch again after this.
```

---

## Step 6: Local Search Volume

Look up a pre-computed monthly estimate for this prospect's trade and town from D1:

```sql
SELECT monthly_estimate
FROM area_trade_volume
WHERE trade_category = '[trade_category]'
  AND town = '[town]';
```

- database_id: `0ae32598-1680-4995-a010-96b647eacabd`

**Threshold:** only use the figure if `monthly_estimate >= 80`. Below that (Kitchen Fitter, Bathroom Fitter, Gas Engineer, Tiler, Commercial Cleaner in smaller towns), skip the line — "around 30 a month" is not a convincing hook.

**If no row returns** (town not in `location_catchment`, or trade not in `trade_search_volume`): skip the line silently and use a different argument instead.

**When to use it:**
- **Email 1, no-website prospects (Segments A, B, D):** works as the primary argument — demand exists locally and they're invisible to it.
- **Email 2, has-website prospects:** works as a follow-up hook after Email 1 established the site gap.
- Never force it in if a stronger personalised hook exists from `research_summary`.

**Framing rules:**
- Always prefix with "around" — never a bare number
- One sentence only — the argument, not a paragraph
- Frame as demand they're invisible to, not as a promise of leads

**Example lines:**
> "Around 510 people a month search for a plumber in Swindon — right now your business isn't what they find."

> "There are around 200 searches a month for a roofer in Salisbury, and without a website none of them can find you."

> "Around 360 people a month search for an electrician in Swindon — that's real demand going elsewhere."

**These figures are conservative** — actual volume may be higher, particularly in towns with a large rural catchment. If challenged: *"If anything, the real number is likely higher — these are calculated from Google's national data and tend to understate for market towns."* Full methodology and challenge-response text: `docs/search-volume-methodology.md`.

---

## Step 7: Present Drafts to Nick

Show both variants clearly with strategic label. Ask Nick to choose one. Do not save to Notion until he confirms.

---

## Step 8: Save to Notion Email Outreach Database

**Database collection ID:** `ca8a715a-2412-497b-a152-1979a03d2df6`

Use `Notion:notion-create-pages` with parent `data_source_id`.

### 8a — Properties

| Property | Value |
|----------|-------|
| `Name` | `[Business Name] — [Email Type] — [YYYY-MM-DD]` |
| `Subject Line` | Subject line from chosen variant |
| `Variant` | `"A"` or `"B"` |
| `Email Type` | `"Initial Outreach"`, `"Follow-up 1"`, or `"Follow-up 2"` |
| `Status` | `"Draft"` |
| `To Email` | `email_address` from D1 |
| `Notes` | Segment, strategic angle chosen, reason (1–2 sentences) |

### 8b — Page content (the copyable email)

After creating the page, use `Notion:notion-update-page` with `replace_content` to write the full email as page content. This preserves paragraph breaks.

Format:
```
**From:** neobookworm@icloud.com
**To:** [prospect email]
**Subject:** [subject line]

---

[Full email body as drafted — each paragraph separated by a blank line]

Nick | NeoBookworm.uk

---
To opt out of further emails from NeoBookworm, simply reply with the word UNSUBSCRIBE.
NeoBookworm.uk | Nick Barrett | Swindon
You are receiving this email because your company appears on a public business directory and we believe you may benefit from our services (UK GDPR Art. 6(1)(f) — Legitimate Interests).
Privacy policy: neobookworm.uk/privacy.html
```

⚠️ Do NOT use Markdown link syntax for the landing page URL. Plain raw URL only — `[text](href)` silently truncates UTM parameters.

---

## Quality Checklist (run before presenting drafts)

- [ ] Both reference files read
- [ ] Contact cap checked — company_type is `ltd`
- [ ] research_summary is not a placeholder
- [ ] Data quality flags raised if applicable
- [ ] Opening line is specific to this prospect
- [ ] Landing page URL is plain raw text, on its own line
- [ ] Landing page framed as "examples of what I build" — NOT as a bespoke site for this prospect
- [ ] No "demo" anywhere; no "the demo I built for you", "[Business] site is still live"; no "your site" meaning a site I made (referring to a has-website prospect's own existing site is fine)
- [ ] Has-website: opens by affirming their existing site; no "rebuilt/updated/new site" link lead-in; uses "here's the standard I build to:"
- [ ] Risk reversal explicit
- [ ] Pricing stated (Email 1 only)
- [ ] Correct word count for segment and email number
- [ ] No banned words or jargon
- [ ] One CTA only — the landing page link
- [ ] Variants are strategically different
- [ ] Sign-off is exactly: `Nick | NeoBookworm.uk`
- [ ] PECR footer included verbatim
- [ ] Final email in sequence includes "This is my final email..." line

---

## Step 9: Set Follow-up Dates

Once Nick confirms an email is sent, update D1:

```sql
UPDATE prospects
SET status = 'Emailed',
    last_email_sent = '{YYYY-MM-DD}',
    date_first_contacted = '{YYYY-MM-DD}'  -- Email 1 only
WHERE notion_id = '{notion_id}';
```

Create Google Calendar follow-up events:
- **Title:** `📧 Follow-up due — [Business Name] ([Follow-up 1/2])`
- **Date:** Follow-up due (Email 1 → +6 days; Follow-up 1 → +12 days)
- **Time:** 08:00, 0 minutes duration
- **Description:** Subject line sent + D1 `notion_id`