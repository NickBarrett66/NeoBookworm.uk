---
name: neobookworm-email-templates
description: "Defines the structure, tone, angle, and constraints for all NeoBookworm cold-email sequences across every segment (A, B, C1–C4, D). Covers initial outreach, follow-ups, and final emails for both no-website and has-website campaigns. All prospects are Ltd companies — sole trader variants have been removed. Includes pricing context (£199 direct-approach rate vs £299 public price) and universal rules. Read this file before drafting any NeoBookworm outreach email."
---

This file defines the email templates for all NeoBookworm cold-email campaigns. It covers all four segments (A, B, C, D) with initial emails and follow-ups. All prospects targeted are Ltd companies — sole trader variants have been removed.

All templates are written as **guidance for Claude**, not to be pasted verbatim. Claude fills in the personalisation blanks from the prospect's research_summary and D1 fields. What these templates define is the **structure, tone, angle, and constraints** for each segment.

## How to read this document

For each segment you'll find:

- **Profile** — who this person is
- **Primary objection** — what's stopping them
- **Psychological approach** — what actually shifts this objection
- **Email 1** — the initial outreach
- **Email 2** — the follow-up (Day 5)
- **Email 3** — the final follow-up (Day 12)
- **What NOT to do** — specific mistakes to avoid in this segment
- **Claude brief** — a compact PROFILE/APPROACH/NEVER/ALWAYS/TONE/LENGTH reference for drafting

---

## Critical context — source and URL model

**Prospect source is a variable, not a constant.** Prospects may be discovered via any platform: Checkatrade, Rated People, TrustATrader, Google Business Profile, Facebook, Companies House, or others. Templates never hardcode "Checkatrade" as the source. The actual platform is inserted at personalisation time as `[platform]`. If a specific data point (review count, rating, years trading) is available from that platform, use it; if not, draw on whatever public information is in the research_summary. The tone of the source reference should match the platform — "your Checkatrade profile" reads naturally; "your Companies House filing" would not.

**No bespoke demo is pre-built for Segments A, B, and D.** Prospects without a website are directed to a trade-specific landing page (e.g. `neobookworm.uk/plumbers`) that shows examples of what can be built and includes a lead capture form. Never frame this link as "a demo I built for you." Frame it as: "here's an example of the kind of site I build for [trade]s:" or "examples of what I build for [trade]s:" followed by the plain URL on its own line. Segment C (has-website) prospects are directed to the `-switch` variant (e.g. `neobookworm.uk/plumbers-switch`).

**The risk reversal carries more weight without a pre-built demo.** In the original demo-first model, the bespoke site did the heavy lifting (reciprocity, endowment effect, effort eliminated). Without it, "you don't pay until you're happy with it" must appear in Email 1 for all no-website segments — not just in follow-ups.

**The word "demo" is retired — do not reintroduce it.** The earlier model sent a bespoke demo built for each prospect; that model no longer exists. Never write "here's a demo site for you to look at," "the demo I built for you," "your demo," or any phrasing that implies a site was made specifically for this prospect. The much older objections-research document (`docs/NeoBookworm-Objections-Research.md`) is written entirely around that retired demo-first model — read it for the *psychology* of each objection, but ignore every piece of its example copy, all of which says "I've mocked one up for you" / "here's yours." If a draft starts to sound like that, it has drifted to the old model — rewrite it.

**Has-website (Segment C): never imply their site needs rebuilding at the point of the link.** This is the single most common failure for has-website emails. Phrases like "here's what a rebuilt site would look like," "what an updated site looks like," "your new site," or "what your site could be" presume the prospect's existing site is inadequate — exactly at the moment you hand them the link. That breaks voice principle #1 (aspirational, never critical) and triggers the sunk-cost defence in someone who paid for what they have. The `-switch` landing page itself never says "rebuild" — it affirms the prospect ("You've already taken the website step. Most plumbers haven't.") and calls the examples "the standard I build to." The email must match that register. **Affirm first, mention any gap softly, then frame the link positively.** Approved link lead-ins for Segment C: "here's the standard I build to:" / "examples of what I build for [trade]s:" / "here's what I build, if it's ever useful:". See the **Email ↔ landing-page seam** section near the end of this file for the exact lead-in to use per campaign.

---

## Pricing context — direct-approach offer

**The website (neobookworm.uk) shows £299.** The £199 price in these emails is a direct-approach rate offered exclusively to prospects contacted by email — it is not advertised publicly and does not appear on the landing page.

This is a genuine exclusive, not a coupon-style discount. The framing options:

**Option B — name the offer explicitly (DEFAULT for all segments except A and C3):**
> The site shows £299 — because you've come across this directly, it's £199.

Use this in Email 1 for Segments B, C1, C2, C4, and D. It is the standard framing — the price difference is a genuine exclusive and should always be explained. Never use it in Segment A (too salesy for that audience) or Segment C3 Agency (wrong register entirely).

**Option A — state it plainly without explanation (fallback only):**
> It's £199 for a full 5-page site, £9.99/month after that.

Use this only when the email is genuinely full and adding the £299 explanation would tip it over the word count target. This should be the exception, not the rule. If in doubt, use Option B.

**Option C — anchor it against the public price in a follow-up:**
> For context: the public rate is £299 — I offer £199 to people I contact directly, because there's no middleman.

Use this sparingly — E2 only, for Segment B or D, where the prospect hasn't responded and a concrete new reason to engage is needed.

**Rules:**
- Never imply the offer expires or is time-limited unless Nick explicitly sets a deadline — false urgency damages trust
- Never use the word "discount" — it cheapens the service and implies the £299 is the real price paid by suckers
- The £9.99/month hosting is the same regardless — never vary it
- If a prospect replies asking whether the £199 is correct, confirm it and explain it's the direct-approach rate

---

# Segment A — The Established Operator

## Profile

15+ reviews, 7+ years trading, review velocity steady or declining. Often 40–60 years old. Word of mouth is their entire business model and they're proud of it. Probably fully booked.

## Primary objection

"I don't need it — I'm fully booked through reputation." Secondary: deep distrust of salespeople and web agencies.

## Psychological approach

This is an **identity objection**. You cannot argue against their success — they've earned it. The only viable approach is to affirm their identity first, then reframe the website as serving that identity rather than threatening it.

The specific reframes that work for Segment A:

- **Referral amplification**: their existing customers want to recommend them but have nothing to send. A website is for their advocates, not for strangers.
- **Ownership vs dependency**: dependency on any third-party platform is a genuine vulnerability. Price increases are real. Frame the website as an asset they own — not a platform they rent. If the prospect is on Checkatrade specifically, name it; otherwise keep the framing generic.
- **Future-proofing**: not implying work will dry up, but acknowledging that having an owned digital asset is sensible for any business.

Critically: **never mention getting more work, being busier, or reaching new customers**. These all imply they're not already successful, which is identity-threatening.

**Autonomy preservation is essential** for this segment. Every email must make it easy to say no without losing face. Phrases like "just worth having" or "no pitch here" reduce reactance significantly.

## Email 1 — Initial Outreach

**Subject line options** (Claude picks the most fitting):

- `[Business name] — worth 30 seconds`
- `Thought you'd want to see this`
- `Your [trade] online — a thought`

**Structure:**

1. Open by validating their track record with a specific detail (review count, years, a tagline — drawn from the research_summary or whatever source the prospect was found through)
2. Make one clear, specific point — not a list of benefits
3. Show the landing page link with zero-friction framing
4. Risk reversal — "you don't pay until you're happy with it" (must appear in Email 1)
5. Autonomy-preserving close
6. Compliance footer

**Example output (Claude should produce something like this, not copy it verbatim):**

> Hi [Name],
> 

> 
> 

> [X] reviews and [Y] years — that kind of reputation doesn't happen by accident. [Specific personalisation from research — tagline, niche detail, coverage area, something that shows you read their profile].
> 

> 
> 

> The one thing those [X] happy customers can't do right now is send anyone a link. When someone in [coverage area] wants to pass your name on, there's nothing to point them to.
>
> Here's an example of the kind of site I build for [trade]s:
>
> neobookworm.uk/[trade]
>
> You don't pay until you're happy with it.
> 

> 
> 

> Worth a look, or not — no pressure either way.
> 

> 
> 

**Word count target:** 80–100 words (body only, excluding footer).

> Nick | [NeoBookworm.uk](http://NeoBookworm.uk)
> 

**What NOT to write:**

- ❌ "You could be getting more enquiries online"
- ❌ "A website will help you grow your business"
- ❌ "Your competitors have websites" *(never mention competitors in email 1)*
- ❌ "In today's digital world..." *(generic, triggers spam filters and eye-rolls)*
- ❌ Any mention of SEO, Google rankings, or digital marketing
- ❌ Asking them to book a call or fill in a form

## Email 2 — Follow-up

**Timing:** 5–7 days after Email 1.

**Angle:** Switch from the referral angle to the **ownership/dependency angle**. They may have seen Email 1 and not responded — a new angle gives them a fresh reason to engage rather than restating the first point.

**Checkatrade variant** (use when the prospect is a Checkatrade member): mention Checkatrade price increases (40–50% year-on-year) and frame the website as an asset they own versus a platform they rent.

**Generic variant** (use when the prospect is not on Checkatrade, or their platform is unknown): frame around directory sites and lead platforms as rented shopfronts — the prospect pays monthly for visibility someone else controls. A website is the only bit of the internet they actually own.

**Example output:**

> Hi [Name],
>
> Just following up in case my last email got buried.
>
> One thing worth knowing: lead generation platforms raise prices every year, and the visibility they give you can change overnight. A website costs less than one year's platform fees and you own it outright. No algorithm, no annual price hike, no sharing leads with other [trade]s.
>
> [Checkatrade variant: "Checkatrade raised prices significantly again this year — tradespeople are reporting increases of 40–50%. A website costs less than one year's Checkatrade subscription and you own it outright."]
>
> Examples are still here: neobookworm.uk/[trade]
>
> Nick | [NeoBookworm.uk](http://NeoBookworm.uk)

**Word count target:** 70–90 words.

## Email 3 — Final follow-up

**Timing:** 10–14 days after Email 2.

**Angle:** Competitor awareness — the only email where it's appropriate to gently mention that others in their trade are already online. Must be framed as a factual observation, not a threat.

**Example output:**

> Hi [Name],
> 

> 
> 

> Last message from me.
> 

> 
> 

> For context: around [local search volume] people search Google for a [trade] in Swindon every month. Right now all of those searches are going to your competitors who have websites. That's not a criticism — it's just worth knowing.
> 

> 
> 

> The examples page is still there if the timing ever feels right: neobookworm.uk/[trade]
> 

> 
> 

> Nick | [NeoBookworm.uk](http://NeoBookworm.uk)
> 

**Word count target:** 50–70 words. Short, factual, no pressure.

---

# Segment B — The Growth-Phase Operator

## Profile

5–15 reviews, 2–7 years trading, review velocity steady or increasing. Actively building their reputation. May have Facebook but no website. Any directory platform or lead site is a stepping stone for them, not their identity.

## Primary objection

"Haven't got round to it" and/or "too busy right now." Secondary: mild cost sensitivity.

## Psychological approach

This is **the highest-conversion segment**. The objection is not philosophical — they're not opposed to a website, they just haven't prioritised it. The demo-first approach directly eliminates both barriers: they don't need to find time (it's already built) and they don't need to risk money (they see it before paying).

The tone should be **excited and opportunity-framing** — not hushed deference like Segment A. These people are building something and the email should match that energy.

The **specific niche or differentiator** from their research is the most powerful hook. Claude should always reference something specific from their profile in the opening line — never start with a generic observation.

## Email 1 — Initial Outreach

**Subject line options:**

- `[Business Name] — took 30 seconds to look at this`
- `Your [trade] site — have a look`
- `[Business Name] — something that might interest you`

**Structure:**

1. Open with a specific, genuine observation from their profile (niche, service, area, something that shows you read it — drawn from the research_summary or source platform)
2. Show the landing page link — frame it as examples of what can be built, not a pre-built demo
3. Remove risk in one line: "you don't pay until you're happy with it"
4. Ultra-low-friction close
5. Compliance footer

**Example output:**

> Hi [Name],
> 

> 
> 

> I came across [Business Name] — [specific personalisation detail from research: their niche, a service they call out, their coverage area, something specific]. That kind of thing is exactly what makes a decent website — it gives people a reason to call you specifically, not just whoever comes up first.
> 

> 
> 

> Here's an example of the kind of site I'd build for [Business Name]:
>
> neobookworm.uk/[trade]
> 

> 
> 

> If you like it, a full 5-page site is £199 fixed, £9.99/month after that, and I handle everything. No deposit — you only pay once you're happy with it.
> 

> 
> 

> Worth 30 seconds?
> 

> 
> 

> Nick | [NeoBookworm.uk](http://NeoBookworm.uk)
> 

**Word count target:** 90–110 words.

**What NOT to write:**

- ❌ "In today's digital world..."
- ❌ "You need a website to compete"
- ❌ "Did you know [X]% of people search online?" *(in email 1 — save stats for follow-up)*
- ❌ A list of website features or benefits
- ❌ Anything about SEO

## Email 2 — Follow-up

**Timing:** 5–7 days after Email 1.

**Angle:** Switch from the examples-page angle to the **platform cost comparison** angle — the most effective rational argument for this segment.

**Checkatrade variant** (use when the prospect is a Checkatrade member): most tradespeople in Wiltshire are paying £800–£1,500 a year for Checkatrade. This site costs £199 once, then £9.99/month — and unlike Checkatrade, they own it.

**Generic variant** (use when the prospect is not on Checkatrade, or their platform is unknown): frame around whatever platform they were found on (Rated People, TrustATrader, Facebook ads, etc.), or use "lead generation platforms" generically. The key point is ownership: they're paying indefinitely for visibility on someone else's platform.

Optionally include a local search volume data point if it's strong enough to be credible for their trade (use the Local search volume table at the end of this document).

**Example output:**

> Hi [Name],
>
> Quick follow-up — examples of what I build are here: neobookworm.uk/[trade]
>
> One thing worth knowing: most tradespeople pay hundreds of pounds a year for lead generation platforms. This site costs £199 once, then £9.99 a month — and unlike any platform, you own it. No price hikes, no shared leads, no algorithm deciding how visible you are.
>
> [Checkatrade variant: "Most tradespeople in Wiltshire are paying £800–£1,500 a year for Checkatrade. This site costs £199 once, then £9.99 a month — and unlike Checkatrade, you own it."]
>
> [Optional: Around [X] people search Google for a [trade] in Swindon every month. Right now that's not finding you.]
>
> Nick | [NeoBookworm.uk](http://NeoBookworm.uk)

**Word count target:** 80–100 words.

## Email 3 — Final follow-up

**Timing:** 10–14 days after Email 2.

**Angle:** Simple direct breakup that leaves the door open.

**Example output:**

> Hi [Name],
> 

> 
> 

> Last one from me. The examples page is still there if you ever want to see the kind of site I'd build:
>
> neobookworm.uk/[trade]
> 

> 
> 

> If the timing isn't right, totally fine. It'll be there if you ever want it.
> 

> 
> 

> Nick | [NeoBookworm.uk](http://NeoBookworm.uk)
> 

**Word count target:** 40–60 words. Pure breakup — no new arguments.

---

# Segment C — Has-Website Prospects

Segment C covers all `has-website` campaign prospects. It splits into four sub-segments based on the `website_sub_segment` field populated by `neobookworm-website-audit`. Each sub-segment has a distinct profile, objection, and email angle.

**Important — landing page vs demo URL:** Has-website campaigns point to a trade landing page (e.g. `neobookworm.uk/plumbers-switch`), not a bespoke demo built for this prospect. The landing page shows example sites and explains the switch process. Never frame the link as "a demo I built for you" — it is a page showing what I build for others. Approved link lead-ins: "here's the standard I build to:" / "examples of what I build for [trade]s:" / "here's what I build, if it's ever useful:" — followed by the plain URL on its own line. **Banned link lead-ins** (they presume their site is inadequate): "here's what a rebuilt site would look like", "what an updated one looks like", "your new site", "what your site could be".

**Affirm first, gap softly — the C-segment opening order.** The `-switch` landing page leads by affirming the prospect ("You've already taken the website step. Most [trade]s haven't."). Every Segment C email must open in that spirit: acknowledge what they've already got before mentioning any gap. Where the sub-segment has a concrete factual observation (a parking page, a Wix fee, a missing Gas Safe number), state it *softly and without judgement* and only after the affirmation — never as the opening blow. The aim is "one professional pointing something out to another," not "your site is wrong."

**Risk reversal for all C sub-segments:** The standard "you don't pay until you're happy with it" framing is even stronger here — reframe it as: *"you don't pay until it's better than what you've got."* The prospect has something to compare against. This removes the only real objection.

**Review-count modifiers:** The C sub-segment determines the email angle. The A/B/D review-count logic still informs tone and personalisation within each sub-segment — an established C2 prospect with 80 reviews gets a different opening than a C2 with 8 — but the website state drives the argument.

---

## Segment C1 — Dead Domain

### Profile

Had a website; the domain has lapsed. Now serves a registrar parking page or fails to load entirely. They once valued having a site, paid for one, and lost it — usually through inattention rather than a deliberate decision. The parking page is actively damaging: anyone who searches their name or types the old URL sees a placeholder instead of a business.

### Primary objection

"I had one and it wasn't worth the hassle" or simply haven't noticed / haven't got round to sorting it. Loss-aversion is the lever — they already know what it's like to have a site.

### Psychological approach

**Lead with the damage, not the opportunity.** The parking page is a concrete, verifiable, existing problem — not a theoretical future benefit. They don't need convincing that websites have value; they already demonstrated that when they built the first one. The argument is: you're losing something you used to have, and fixing it is less effort than you think.

The tone should be matter-of-fact, not alarming. State the fact ("your old domain now shows a parking page"), then move immediately to the solution. Do not dwell on the negative.

Do not frame this as "you need a new website" — frame it as "you need your old one back, but better."

### Email 1 — Initial Outreach

**Subject line options:**
- `[Business Name] — your old site`
- `[Business Name] — noticed your domain`
- `Quick thing about [businessname.co.uk]`

**Structure:**
1. Affirm first — they had a site once, so they already know its value
2. State the parking-page fact softly — one sentence, no judgement
3. Reassure it's less effort than the first time, then the landing page link — "here's the standard I build to:"
4. Risk reversal: "don't pay until it's better than what you had"
5. Pricing — one sentence
6. Autonomy-preserving close
7. Sign-off and footer

**Example output:**

> Hi [Name],
>
> You had a site once, so you already know what it does for a business when someone looks you up. The only snag: your old domain, [domain], now shows a registrar parking page — so anyone who types it in lands on a dead end.
>
> Getting it back is less effort than the first time round. Here's the standard I build to:
>
> neobookworm.uk/plumbers-switch
>
> You don't pay until it's better than what you had. Full 5-page site is £199 fixed, £9.99/month after that.
>
> Worth a look, or not — no pressure either way.
>
> Nick | NeoBookworm.uk

**Word count target:** 85–105 words.

**What NOT to write:**
- ❌ "You need a website" — they know; they had one
- ❌ "In today's digital world..." — generic, eye-rolling
- ❌ Implying they were negligent for letting it lapse
- ❌ Multiple problems — the parking page is enough

### Email 2 — Follow-up

**Timing:** 5–7 days after Email 1.

**Angle:** Switch to the **ownership and continuity** angle. The first site lapsed because it was tied to a hosting contract they forgot about or stopped paying. This one is set-and-forget: £9.99/month, no annual renewal trap, no domain expiry surprises.

**Example output:**

> Hi [Name],
>
> Quick follow-up — examples of what I build are here if you want a look:
>
> neobookworm.uk/plumbers-switch
>
> One thing worth knowing: the main reason domains lapse is annual renewal reminders getting buried. My hosting is a flat £9.99/month — no yearly renewal, no surprise expiry. Once it's live, it stays live.
>
> Nick | NeoBookworm.uk

**Word count target:** 70–90 words.

### Email 3 — Final follow-up

**Timing:** 10–14 days after Email 2.

**Angle:** Short breakup. Leave the door open. No new arguments.

**Example output:**

> Hi [Name],
>
> Last one from me. If you ever want to get something live again, I'm easy to find — just reply.
>
> neobookworm.uk/plumbers-switch
>
> Nick | NeoBookworm.uk

**Word count target:** 30–45 words.

---

## Segment C2 — DIY Template

### Profile

Has a live website on Wix, GoDaddy, Squarespace, or Google Sites — built by the owner, typically carrying platform branding ("Create your own website — try Wix"). Currently paying a monthly or annual platform fee for a site they built themselves at some point and may not have touched since. The platform is making money from them monthly; they are not getting full value.

### Primary objection

"I've already got one and it works fine." The sunk cost of their own time building it, plus the inertia of a working (if mediocre) solution. Mild pride of ownership.

### Psychological approach

**Lead with cost and control, not quality.** Criticising the site's appearance triggers the sunk-cost defence immediately. Instead, make it a purely economic and ownership argument: they are renting someone else's platform indefinitely, paying monthly for something they built, with Wix/GoDaddy branding on it. The switch is financially rational regardless of aesthetics.

The "you don't pay until it's better than what you've got" framing is strongest here — the prospect can do a direct side-by-side comparison between their Wix site and the landing page examples.

Do not mention SEO, rankings, or design quality. The argument is ownership and cost only.

### Email 1 — Initial Outreach

**Subject line options:**
- `[Business Name] — paying for Wix?`
- `[Business Name] — own your site outright`
- `Quick thing about your website`

**Structure:**
1. Affirm first — they've already got a working site up, which puts them ahead of most
2. State the platform fact softly, then the ownership argument — £199 once vs paying Wix forever, no branding
3. Landing page link
4. Risk reversal: "don't pay until it's better than what you've got"
5. Pricing — one sentence
6. Autonomy-preserving close
7. Sign-off and footer

**Example output:**

> Hi [Name],
>
> You've already got a site up and running, which puts you ahead of most [trade]s. Yours is on Wix, which means a monthly fee to them for a site that carries their branding. That's fine — but there's an alternative: for £199 I build a clean 5-page site you own outright, no platform fee, £9.99/month to host.
>
> Examples of what I build for plumbers:
>
> neobookworm.uk/plumbers-switch
>
> You don't pay until it's better than what you've got — so there's nothing to lose in having a look.
>
> Worth a glance?
>
> Nick | NeoBookworm.uk

**Word count target:** 90–110 words.

**What NOT to write:**
- ❌ "Your Wix site looks basic/unprofessional" — opinion, triggers defensiveness
- ❌ Anything about SEO, rankings, or Google
- ❌ "You need a proper website" — condescending
- ❌ Multiple arguments — cost and ownership is the single point

### Email 2 — Follow-up

**Timing:** 5–7 days after Email 1.

**Angle:** Switch to the **long-term cost comparison**. Calculate what they're paying Wix/GoDaddy annually vs the total cost of NeoBookworm over the same period. Make the maths concrete.

**Example output:**

> Hi [Name],
>
> Following up — examples are still here:
>
> neobookworm.uk/plumbers-switch
>
> Quick comparison: Wix's standard plan runs around £150–£200/year. In three years that's £450–£600, and you still don't own anything. NeoBookworm is £199 once, then £120/year hosting — and after year one you're saving money every year on a site you actually own.
>
> Nick | NeoBookworm.uk

**Word count target:** 75–95 words.

**Note:** Adjust the Wix/GoDaddy cost figure if the prospect's platform is different — GoDaddy runs higher (£200–£300/year), Squarespace higher still (£150–£250/year). Use whichever platform was identified in the audit.

### Email 3 — Final follow-up

**Timing:** 10–14 days after Email 2.

**Angle:** Simple breakup. One sentence on the ownership point. Leave the door open.

**Example output:**

> Hi [Name],
>
> Last one from me. The examples page is still there if you ever want to compare:
>
> neobookworm.uk/plumbers-switch
>
> Nick | NeoBookworm.uk

**Word count target:** 25–40 words.

---

## Segment C3 — Agency-managed

### Profile

Has a live website with evidence of a third-party agency in the relationship — agency footer credit, agency email infrastructure (SPF records), or a clearly custom-built site they wouldn't have built themselves. They have an existing professional relationship with someone who manages their web presence. May be on a monthly retainer or have a support contract.

### Primary objection

"My website guy sorts all that." They have a trusted third party — a relationship NeoBookworm is intruding on. This is the most resistant segment because the objection is personal, not logical.

### Psychological approach

**This is the softest pitch in the entire portfolio.** Do not lead with cost, do not criticise the agency's work, do not imply the relationship is a bad one. The argument is purely about ownership and independence: whatever they paid the agency for, the prospect should own the domain and the site assets outright — and if they do, great; if they don't, that's worth knowing.

**The tone must be entirely non-adversarial.** There is a real person or business on the other side of this relationship. The email should feel like useful information, not a sales pitch. If they're happy with their agency, the correct outcome is no reply — and that's fine.

**Priority note:** This sub-segment has the lowest expected conversion rate. Do not invest more email-drafting effort in Segment C3 than C1/C2/C4. Keep it short.

### Email 1 — Initial Outreach

**Subject line options:**
- `[Business Name] — one thing worth knowing`
- `Quick question about your site`
- `[Business Name] — do you own your domain?`

**Structure:**
1. One neutral observation — acknowledge they have a site, no criticism
2. The single ownership question: do they own the domain outright?
3. Landing page link — framed as "what I build, in case it's ever useful"
4. Risk reversal: brief
5. Autonomy-preserving close — this must be the most prominent it is in any sub-segment
6. Sign-off and footer

**Example output:**

> Hi [Name],
>
> I noticed you have a website — looks like someone built it for you, which is good. One thing worth checking if you haven't: make sure the domain is registered in your name, not the agency's. It's worth knowing who owns it.
>
> For context, I build sites for [trade]s — here's what they look like if it's ever useful:
>
> neobookworm.uk/plumbers-switch
>
> If you're sorted, completely ignore this.
>
> Nick | NeoBookworm.uk

**Word count target:** 75–95 words.

**What NOT to write:**
- ❌ Any criticism of their current site or agency
- ❌ Cost comparisons — not the right angle here
- ❌ Urgency or pressure — this prospect is the least likely to respond quickly
- ❌ "You're locked in" — too adversarial
- ❌ Multiple points — the domain ownership question is the only one

### Email 2 — Follow-up

**Timing:** 5–7 days after Email 1.

**Angle:** Switch to **independence and no lock-in**. Short and informational. Do not press.

**Example output:**

> Hi [Name],
>
> Quick follow-up. The main thing I'd want you to know: every site I build, the client owns the domain, the files, and the hosting account outright — no lock-in, no ongoing contract. If you ever want to move it, you can.
>
> Examples here if useful: neobookworm.uk/plumbers-switch
>
> Nick | NeoBookworm.uk

**Word count target:** 55–75 words.

### Email 3 — Final follow-up

**Timing:** 10–14 days after Email 2.

**Angle:** Minimal. Leave the door open. Nothing more.

**Example output:**

> Hi [Name],
>
> Last one. If you ever want a second option, I'm easy to find.
>
> Nick | NeoBookworm.uk

**Word count target:** 20–30 words.

---

## Segment C4 — Functional but Weak

### Profile

Has a live website on a real domain, no obvious platform branding, appears to have been built with some care — but has one concrete, verifiable flaw identified in the audit (no Gas Safe number, no contact form, no SSL, no mobile viewport, empty copyright year, etc.). The site is real but has a specific gap that a potential customer would notice.

### Primary objection

"It works fine for me." They don't see the gap because they're not approaching the site as a customer would. They need to see the specific problem from the outside.

### Psychological approach

**Lead with the one audit finding, stated as a customer experience fact.** Not "your site is missing X" — that's a technical critique they'll dismiss. Instead: "someone searching for you at 9pm on their phone can't find a way to contact you." Frame the problem in terms of a lost job or missed call, not a technical deficiency.

The `Problem:` line from the audit block in `research_summary` is the opening. Use it verbatim or very close to it. Do not add extra problems. Do not editorialize.

The risk reversal is the strongest it has been since the prospect has a working site to compare against: "you don't pay until it's better than what you've got."

### Email 1 — Initial Outreach

**Subject line options:**
- `[Business Name] — one thing I noticed`
- `[Business Name] — quick thing about your site`
- `[specific issue, e.g. "your Gas Safe number"]`

**Structure:**
1. Affirm first — they've done the hard bit; they have a site and the work on it looks good
2. State the single audit gap *softly*, as a customer-experience note — one sentence, no judgement
3. "Easy to put right", then the landing page link — "here's the standard I build to:"
4. Risk reversal: "don't pay until it's better than what you've got"
5. Pricing — one sentence
6. Autonomy-preserving close
7. Sign-off and footer

**Example output (no Gas Safe number):**

> Hi [Name],
>
> You've already done the hard bit — you've got a site, and the work on it looks good. One small thing a customer might notice: your Gas Safe registration number isn't on there, and it's one of the first things a homeowner checks before calling a gas engineer they don't know.
>
> Easy to put right. Here's the standard I build to:
>
> neobookworm.uk/plumbers-switch
>
> You don't pay until it's better than what you've got. The site shows £299 — because you've come across this directly, it's £199. £9.99/month after that.
>
> Worth a look, or not — up to you.
>
> Nick | NeoBookworm.uk

**Word count target:** 90–110 words.

**What NOT to write:**
- ❌ "Your website looks outdated/unprofessional" — opinion
- ❌ Listing multiple problems — one only
- ❌ "Nobody's going to contact you with a site like that" — too harsh
- ❌ Generic website pitch — it must be grounded in the specific audit finding

### Email 2 — Follow-up

**Timing:** 5–7 days after Email 1.

**Angle:** Switch to a **concrete performance signal** — PageSpeed score, mobile test result, or a second specific gap found in the audit (if one exists). Slightly more technical, because they've shown they're tech-adjacent by having a built site.

**Example output:**

> Hi [Name],
>
> Following up — examples are still here:
>
> neobookworm.uk/plumbers-switch
>
> One concrete thing worth knowing: your site scores around [X]/100 on Google's mobile speed test, and Google uses that as a ranking signal in local search. The sites I build score well into the 90s — same trade, same job, just quicker to load.
>
> If not the right time, no problem.
>
> Nick | NeoBookworm.uk

**Word count target:** 65–85 words.

**Note:** If no PageSpeed score is available, fall back to a second specific observation from the audit, or use the mobile-responsiveness point. Do not invent a score.

### Email 3 — Final follow-up

**Timing:** 10–14 days after Email 2.

**Angle:** Easy transition. The fear for this segment is effort — "going through it all again." Emphasise that content migration is included and turnaround is fast.

**Example output:**

> Hi [Name],
>
> Last one from me. The main thing: switching doesn't mean starting over. I take what's on your current site, fix the gaps, and build the new one around your existing content. Usually a one-week turnaround.
>
> neobookworm.uk/plumbers-switch
>
> Nick | NeoBookworm.uk

**Word count target:** 45–65 words.

# Segment D — The New Entrant

## Profile

0–5 reviews, under 2 years trading. Brand new to running their own business. Cash-aware and time-stretched, but crucially: haven't yet formed the "word of mouth is enough" identity that makes Segments A and B harder. More open-minded than any other segment.

## Primary objection

"Too early / can't afford it right now." They're focused on getting through the first year, not investing in marketing.

## Psychological approach

The key insight: **credibility is a more powerful hook than visibility for new entrants**. They don't yet have enough word-of-mouth momentum to worry about amplifying it. What they need is to *look established* — to appear on Google and seem professional when a potential first customer searches their name after a recommendation.

The tone should be **warm and peer-to-peer** — acknowledging that starting out is tough without being patronising. This segment responds to encouragement, not urgency.

**Never:** imply they're struggling, mention competitors, talk about growth or scaling, or use business-development language. These all feel overwhelming to someone in their first two years.

The **cost framing** is important for this segment. £199 should be anchored against something tangible from their world — not web agency prices (they don't have context for that), but a single job's materials or a month's van insurance.

## Email 1 — Initial Outreach

**Subject line options:**

- `Starting out as a [trade] — this might help`
- `[Business Name] site — have a look`
- `[Business Name] — worth a look`

**Structure:**

1. Open with a warm, genuine acknowledgement that they're new and building something — not as a weakness, as a positive (draw on the research_summary or whatever platform or source they were found through, without assuming Checkatrade)
2. Frame the website as credibility infrastructure — it makes you look like someone who's been doing this for years
3. Show the landing page link — frame it as examples of what can be built
4. Risk reversal: "you don't pay until you're happy with it" (must appear in Email 1)
5. Make the cost feel accessible — anchor it simply, don't oversell
6. Autonomy-preserving close
7. Compliance footer

**Example output:**

> Hi [Name],
> 

> 
> 

> I came across [Business Name] — good to see you building up your reputation. Starting out in the [trade] trade takes time to get going, and one of the fastest ways to look established is to have a professional website. When someone searches your name after a recommendation, a good site tells them you're the real thing.
> 

> 
> 

> Here's an example of the kind of site I'd build for [Business Name]:
>
> neobookworm.uk/[trade]
> 

> 
> 

> It's £199 for a full 5-page site, £9.99/month after that. You only pay once you're happy with it. Costs less than a week's materials on most jobs.
> 

> 
> 

> Worth a look?
> 

> 
> 

> Nick | [NeoBookworm.uk](http://NeoBookworm.uk)
> 

**Word count target:** 100–120 words. Slightly longer than other segments because new entrants need a bit more context.

**What NOT to write:**

- ❌ "You're missing out on a lot of work" *(scary for someone just starting)*
- ❌ "Your competitors already have websites" *(discouraging)*
- ❌ "Grow your business" *(corporate language, feels distant)*
- ❌ Mentioning SEO, rankings, or digital strategy
- ❌ Implying they need saving or that any platform they're on isn't enough

## Email 2 — Follow-up

**Timing:** 5–7 days after Email 1.

**Angle:** The cost anchor — make the £199 feel proportionate by comparing it to something concrete and trade-relevant. Also lean on the no-risk model.

**Example output:**

> Hi [Name],
>
> Quick follow-up — examples of what I build are here: neobookworm.uk/[trade]
>
> The main thing I'd want you to know: you don't pay a penny until you're happy with it. So there's no risk in having a look and deciding later. At £199, it costs roughly the same as a couple of days of materials on a typical job — and it works for you 24 hours a day after that.
>
> Nick | [NeoBookworm.uk](http://NeoBookworm.uk)

**Word count target:** 80–100 words.

## Email 3 — Final follow-up

**Timing:** 10–14 days after Email 2.

**Angle:** Future-focus — the site will be more valuable in 6 months than it is today. Low-pressure, leave the door open.

**Example output:**

> Hi [Name],
> 

> 
> 

> Last one from me. The examples page is still there — no rush on it: neobookworm.uk/[trade]
> 

> 
> 

> As [Business Name] grows and you get more reviews, a website becomes more and more useful. If you ever want to revisit it, just reply.
> 

> 
> 

> Nick | [NeoBookworm.uk](http://NeoBookworm.uk)
> 

**Word count target:** 40–60 words.

---

---

# Claude briefs — quick-reference per segment

Use these when drafting emails. Each brief is a compact version of the full segment guidance above — PROFILE, APPROACH, NEVER, ALWAYS, TONE, and LENGTH in one place.

---

## Segment A — Established Operator

**PROFILE:** Long-established (15+ reviews or equivalent signals, 7+ years trading), likely fully booked through word of mouth. Found via [platform] — use the actual source when personalising, do not assume Checkatrade.
**APPROACH:** Affirm their success first using a SPECIFIC detail from the research (review count, years trading, a tagline, something that shows you read their profile). Then make ONE point: their happy customers want to recommend them but have nowhere to send people. Frame the website as serving their existing reputation, not replacing it. Include risk reversal in Email 1. Never use Option B pricing — state the price plainly (Option A).
**NEVER say:** 'more enquiries', 'grow your business', 'competitors', 'SEO', 'digital marketing', 'in today's world'. Never frame the landing page as a demo built for them.
**ALWAYS include:** The trade landing page URL (neobookworm.uk/[trade]) framed as 'examples of what I build for [trade]s'. Risk reversal in Email 1. Autonomy-preserving close.
**TONE:** Respectful peer-to-peer. Understated. Not salesy.
**LENGTH:** E1: 80–100 words. E2: 70–90 words. E3: 50–70 words.

---

## Segment B — Growth Phase Operator

**PROFILE:** Building their business (5–15 reviews or equivalent signals, 2–7 years trading). May have Facebook but no website. Found via [platform] — use the actual source when personalising.
**APPROACH:** Open with a SPECIFIC observation from their research (a niche they mention, a service they emphasise, their coverage area). Direct and energetic. Show the trade landing page as examples of what can be built. Remove risk with the satisfaction-first payment model. Use Option B pricing.
**NEVER say:** 'you need a website', generic digital statistics, anything about SEO. Never frame the landing page as a demo built for them.
**ALWAYS include:** The trade landing page URL framed as 'here's an example of the kind of site I'd build for [Business Name]'. 'You only pay once you're happy with it.' Option B pricing line.
**TONE:** Direct, warm, opportunity-framing. Slightly energetic.
**LENGTH:** E1: 90–110 words. E2: 80–100 words. E3: 40–60 words.

---

## Segment C1 — Dead Domain

**PROFILE:** Had a website; domain has lapsed. Now shows a registrar parking page. Already demonstrated they value having a site.
**APPROACH:** State the parking page fact plainly — one sentence, no judgement. Acknowledge they've done this before. Frame the fix as getting it back, not starting fresh. Use Option B pricing.
**NEVER say:** 'you need a website', imply negligence, or list multiple problems.
**ALWAYS include:** The specific domain and what it shows. Risk reversal as 'don't pay until it's better than what you had.' Option B pricing line. Landing page URL.
**TONE:** Matter-of-fact. Informational. No alarm.
**LENGTH:** E1: 85–105 words. E2: 70–90 words. E3: 30–45 words.

---

## Segment C2 — DIY Template

**PROFILE:** Live site on Wix, GoDaddy, Squarespace, or Google Sites. Built by the owner. Paying a monthly/annual platform fee.
**APPROACH:** Lead with cost and control — not quality. Make it a purely economic and ownership argument. They are renting a platform indefinitely for something they built. Use Option B pricing.
**NEVER say:** 'your Wix site looks basic', anything about SEO or rankings, 'you need a proper website'.
**ALWAYS include:** The specific platform identified in the audit. Long-term cost comparison in E2. Risk reversal as 'don't pay until it's better than what you've got.' Option B pricing line. Landing page URL.
**TONE:** Economic, factual, peer-to-peer.
**LENGTH:** E1: 90–110 words. E2: 75–95 words. E3: 25–40 words.

---

## Segment C3 — Agency-managed

**PROFILE:** Live site with evidence of a third-party agency. May be on a retainer or support contract. Has an existing relationship with someone who manages their web presence.
**APPROACH:** Softest pitch in the portfolio. Do not criticise the agency or the site. Lead with the domain ownership question. Frame as useful information, not a sales pitch. Use Option A pricing only — Option B feels salesy at this register.
**NEVER say:** Anything critical of their agency or site, cost comparisons, 'you're locked in', anything urgent.
**ALWAYS include:** The ownership/independence angle. A prominent autonomy-preserving close. Landing page URL framed as 'in case it's ever useful'.
**TONE:** Entirely non-adversarial. Informational.
**LENGTH:** E1: 75–95 words. E2: 55–75 words. E3: 20–30 words.

---

## Segment C4 — Functional but Weak

**PROFILE:** Live site on a real domain, built with some care, but with one concrete verifiable flaw from the audit (no Gas Safe number, no contact form, no SSL, no mobile viewport, etc.).
**APPROACH:** Lead with the ONE audit Problem: line, stated as a customer experience observation — not a technical critique. Frame in terms of a lost job or missed call. Use the exact Problem: wording from research_summary. Use Option B pricing.
**NEVER say:** 'your site looks outdated/unprofessional', list multiple problems, invent a PageSpeed score.
**ALWAYS include:** The specific audit finding, verbatim or very close. Risk reversal as 'don't pay until it's better than what you've got.' Option B pricing line. Content migration angle in E3 (switching doesn't mean starting over). Landing page URL.
**TONE:** Technical but accessible. Specific and factual.
**LENGTH:** E1: 90–110 words. E2: 65–85 words. E3: 45–65 words.

---

## Segment D — New Entrant

**PROFILE:** New tradesperson (0–5 reviews or equivalent signals, under 2 years trading). Cash-aware, time-stretched, open-minded. Found via [platform] — use the actual source when personalising, do not assume Checkatrade.
**APPROACH:** Open with a warm acknowledgement that they're new and building something — positive, not sympathetic. Frame the website as credibility infrastructure — it makes them look established when someone searches their name. Cost anchor: compare £199 to something trade-relevant. Use Option B pricing.
**NEVER say:** 'you're missing out', 'competitors', 'grow your business', anything about SEO or rankings. Never frame the landing page as a demo built for them.
**ALWAYS include:** The trade landing page URL framed as 'here's an example of the kind of site I'd build'. Risk reversal in Email 1. A trade-relevant cost anchor. Option B pricing line.
**TONE:** Warm, encouraging, peer-to-peer. Not corporate.
**LENGTH:** E1: 100–120 words. E2: 80–100 words. E3: 40–60 words.

---

## Universal rules for ALL emails and ALL segments

These apply regardless of segment. Claude must follow all of them:

1. **Open with personalisation** — the first sentence must reference something specific from the prospect's research_summary or D1 data. Never open with 'I hope this finds you well', 'My name is Nick', or any generic opener.
2. **One argument per email** — never list multiple reasons or benefits. Pick the single most compelling point and make it well.
3. **One URL appears once, prominently** — the landing page URL (or `-switch` variant for has-website segments) appears once per email, not buried and not repeated. Never frame it as "the demo I built for you" or "a demo site for you to look at" — there is no bespoke demo; it is a page showing examples of what I build. For Segment C (has-website), the link lead-in must never imply their site is being replaced: banned lead-ins include "a rebuilt site", "an updated site", "your new site", "what your site could be". Use "here's the standard I build to:" or "examples of what I build for [trade]s:" instead.
4. **No jargon** — no 'SEO', 'digital presence', 'online visibility', 'responsive design', 'CMS', 'conversion rate'. Plain English throughout.
5. **No calls to action other than 'look at the examples page'** — no 'book a call', 'reply to discuss', 'fill in the form'. One CTA only.
6. **Pricing mentioned clearly** — £199 fixed, £9.99/month. Never 'starting from' or 'typically around'. The fixed price is a feature, not something to hide. The website shows £299 — £199 is the direct-approach rate for prospects contacted by email. See **Pricing context — direct-approach offer** above for when and how to name this explicitly. Never use the word "discount".
7. **Autonomy-preserving close** — every email needs a low-pressure way to say no. The closer the email is to the contact cap, the more prominent this must be.
8. **Compliance footer** — appended in code, not written by Claude. Use the short PECR/Ltd variant. Never write the footer as part of the email body.
9. **Sign-off** — always 'Nick | [NeoBookworm.uk](http://NeoBookworm.uk)'. Nothing else.
10. **Never mention the word 'marketing'** — tradespeople associate this with desperation and pushy salespeople.
11. **Never use spam trigger words** — the following words and phrases are banned from all subject lines and email body copy, without exception. They damage deliverability regardless of context:
    - *Retail/commercial:* as seen on, order, order status, buy, clearance, buy direct, free gift card, discount
    - *Personal/dating:* meet singles, hot men, hot women, easy date, score tonight, dear friend, beloved, urgent, desperate, please help
    - *Get rich quick:* additional income, double your income, earn x per week, home based, income from home, urgent proposal, opportunity, make $, potential earnings, earn extra cash, extra income, home based business, make money, online degree, university diplomas, work from home, you're a winner, online biz opportunity
    - *Financial schemes:* invoice, PayPal, Visa, Mastercard, FedEx, $$$, beneficiary, cash, claims, quote, save big money, one hundred percent free, collect your prize, check or money order, stock alert, social security number, unsecured debt, cash bonus, refinance, investment, mortgage, million dollars
    - *Marketing:* lead generation, search engine optimization, web traffic, email harvest, increase sales, internet marketing, marketing solutions, month trial offer, increase traffic, direct marketing, sign up free today
    - *Pharmaceutical:* cure baldness, Viagra, lose weight, online pharmacy, stop snoring, removes wrinkles, reverses aging, perform in bed

---

## Email ↔ landing-page seam

The email and the page it links to must read as one continuous thought. When the prospect clicks, the page's hero should feel like the next line of the email — same register, same promise, no jolt. Match the email's closing lead-in and overall tone to the destination page below. (All trades follow the same two-page structure — `/[trade]` and `/[trade]-switch` — so this mapping holds for every campaign.)

**No-website campaigns → `neobookworm.uk/[trade]`**
- Page eyebrow: "For [trade]s without a website"
- Page hero: *"Word of mouth brings you the customers who know you. A website brings you the ones who don't."*
- This is the referral-amplification frame — it affirms word of mouth, then adds to it. The Segment A and B openings ("your happy customers can't send anyone a link") lead straight into this hero. Keep that thread.
- Approved link lead-in: **"here's an example of the kind of site I build for [trade]s:"**

**Has-website campaigns → `neobookworm.uk/[trade]-switch`**
- Page eyebrow: "For [trade]s who already have a website"
- Page hero: *"You've already taken the website step. Most [trade]s haven't."* — affirming, never critical.
- Key section heading: *"The standard I build to — interactive demos, not promises."* The page also includes an honest *"When you probably shouldn't switch"* section and a plain cost comparison. It does **not** tell anyone their site needs rebuilding — so neither should the email.
- Because the page opens by affirming the prospect, the email must too. An email that opens by criticising their site collides with a page that congratulates them for having one. Affirm first, gap softly.
- Approved link lead-in: **"here's the standard I build to:"** (echoes the page's own section heading, so arrival is seamless).

If a future trade landing page changes its hero or section wording, update this section so the email lead-ins still echo the page.

---

## Local search volume reference

Use when drafting E2 and E3 follow-ups — include the relevant figure for the prospect's trade as a single data point, used once. Do not include in Email 1.

| Trade | Monthly local searches (Swindon area) |
|---|---|
| Plumber | around 170 |
| Electrician | around 140 |
| Kitchen Fitter | around 20 |
| Bathroom Fitter | around 30 |
| Landscaper | around 35 |
| Driveway Contractor | around 50 |
| Roofer | around 65 |
| Plasterer | around 40 |
| Painter & Decorator | around 75 |
| Loft Conversion Specialist | around 170 |
| Carpenter | around 40 |
| Gas Engineer | around 50 |

> ⚠️ Verify these figures in Google Keyword Planner before launch. See Local Search Volume Data page for details.

---

*Templates updated: 21 May 2026 — has-website (Segment C) reworked to "affirm first, gap softly": every C example now opens by acknowledging the prospect's existing site before any gap is mentioned; "rebuilt site / updated one / your new site" link lead-ins banned and replaced with "here's the standard I build to:" (echoing the -switch page); explicit "demo is retired" guidance added so drafts stop reverting to demo-first language; new "Email ↔ landing-page seam" section added mapping each campaign to its destination page's hero/section wording. Previous update: 20 May 2026. Simplified for direct Claude use: sole trader variants removed throughout (all prospects are Ltd); all Agent 2/3/6 references removed; Agent 3/6 JS prompt blocks converted to plain Claude briefs and moved inline; Email 2/3 headings cleaned up; E2 farewell language removed (E3 is the final contact); universal rule 8 simplified to PECR/Ltd footer only; local search volume converted from JS object to plain reference table. Previous update: 20 May 2026 — Option B pricing made default for all segments except A and C3. Previous update: 20 May 2026 — pricing context added, £199 direct-approach rate documented.*