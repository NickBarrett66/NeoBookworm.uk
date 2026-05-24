# NeoBookworm — Onboarding Playbook v1.1

The complete end-to-end onboarding experience: every email, every journey, every portal stage, every nudge.

> **Implementation authority is [`neobookworm-onboarding-build-plan-v3.md`](./neobookworm-onboarding-build-plan-v3.md).** This playbook is the **content** source of truth — every email, the voice, the journey copy, the portal stage copy, the nudge schedule. Where the two documents differ on *how to build* (runtime, schema, timestamps), **v3 wins**. The "Implementation notes" section near the end of this playbook predates v3 and is partly superseded; specific stale spots are flagged inline below. See v3's "Playbook corrections" section for the full list.

**Saved at:** NeoBookworm.uk/docs

Designed for: one-person operation, busy tradesperson prospects, zero additional vendor cost. Runs on D1 + Cloudflare Workers + Google Workspace Gmail + OneTimeSecret (free tier) + Stripe.

---

## Contents

1. [Conventions](#conventions)
2. [The five journeys](#the-five-journeys)
3. [Email subject convention](#email-subject-convention)
4. [J1 — Free preview (no-website)](#j1--free-preview)
5. [J2 — Free site review (switch)](#j2--free-site-review)
6. [J3 — Ready to switch](#j3--ready-to-switch)
7. [J4 — Full intake form](#j4--full-intake-form)
8. [J5 — Discovery (quick message / call / cold email)](#j5--discovery)
9. [Convergence: shared post-decision emails (all journeys)](#convergence)
10. [Post-launch (all journeys)](#post-launch)
11. [Care plan ongoing](#care-plan-ongoing)
12. [The portal — stage-by-stage copy](#the-portal)
13. [The nudge schedule](#the-nudge-schedule)
14. [Implementation notes](#implementation-notes)

---

## Conventions

**Variable placeholders used in every template:**
- `{name}` — prospect's first name
- `{business}` — business name
- `{trade}` — singular noun (plumber, electrician)
- `{trade_business}` — adjective + business (plumbing business)
- `{portal_url}` — `https://neobookworm.uk/c/{slug}/`
- `{preview_url}` — live preview URL
- `{live_url}` — final production URL
- `{current_url}` — their existing site (switch journeys only)
- `{deliver_by}` — promised delivery date, format "Tuesday 4 June"
- `{ots_hosting}`, `{ots_domain}`, `{ots_github}` — OneTimeSecret URLs (self-managed handover only)
- `{hosting_provider}` — e.g. `Netlify` or `Cloudflare Pages` (stored per client in D1)
- `{hosting_url}` — e.g. `app.netlify.com` or `pages.cloudflare.com` (stored per client in D1)
- `{client_email}` — the email address used to set up their hosting/domain/GitHub accounts
- `{stripe_link}` — Stripe payment link
- `{revisions_count}` — running count of revision rounds

**Sign-off:** Every email ends:
```
Nick — NeoBookworm.uk
nick@neobookworm.uk
```

(One blank line above. No marketing P.S. unless explicitly noted. No social links. No banner image.)

**Format:** Plain text. One optional CTA button (rendered as a link in plain text, styled as a button if you want to send HTML via the Worker — but plain text reads fine and is faster on mobile.)

**Tone check before sending any email:** read it as Tom-the-plumber would. If it sounds like an agency, rewrite it. If it sounds like a friend who happens to do websites, ship it.

---

## The five journeys

| Journey | Entry point | Promise | Time to first deliverable |
|---|---|---|---|
| **J1** | "Free preview" on plumbers.html, electricians.html | First version, built from public info | 7 working days |
| **J2** | "Free site review" on -switch.html pages | Honest review of current site | 2 working days |
| **J3** | "Ready to switch" on -switch.html pages | Replacement built from existing content | 10 working days |
| **J4** | intake-form.html (any source) | First version, built from their detail | 7 working days |
| **J5** | Quick message / Koalendar / cold email | Personal reply, then routed | 1 working day to reply |

After the preview / review is delivered, all journeys converge onto the same revisions → payment → launch → post-launch flow.

---

## Email subject convention

Every email about a single prospect uses **one identical subject for the lifetime of the relationship**. Gmail threads them automatically. The body opens with what's new.

**Format:** `{business} — your NeoBookworm website`

Examples:
- `Hart Plumbing — your NeoBookworm website`
- `Sparks Electrical Ltd — your NeoBookworm website`

This subject is used for every single email from acknowledgement to renewal, no matter how many years later. The thread grows. The relationship feels continuous.

**Exceptions** (where a new thread is genuinely warranted — these are the only two):
- `{business} — invoice` (Stripe, automated, separate by Stripe's own logic)
- `{business} — credentials to keep safe` (the OneTimeSecret handover email — fresh thread so it doesn't get lost in years of history)

---

## J1 — Free preview

**Entry:** Form submission from plumbers.html or electricians.html, with `start_option = leave_it_with_me` or `tell_more`.
**D1 stage on creation:** `acknowledged`
**Promise:** Preview within 7 working days.

### J1-E1 — Acknowledgement (automated, sent within 30 seconds)

```
Subject: {business} — your NeoBookworm website

Hi {name},

Got it — thanks for filling that in. Here's what I'm doing next:

I'll spend the next few days looking at what's publicly out there about
{business} — your Google profile, anything on Checkatrade or Yell, your
Facebook page if you have one, the kind of work you're known for. Then
I'll build you a first version from what I find.

You'll have a link to view it by {deliver_by}.

I've also set up a page just for you where you can track where things
are, send me photos, or message me without digging through your inbox:

{portal_url}

Bookmark it on your phone — it's the easiest way to stay in the loop.

If anything urgent comes up before then, just reply to this email.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

**Portal stage on send:** `acknowledged` → automatically transitions to `researching` 24 hours later (or when you manually click "Start build" in your internal dashboard).

---

### J1-E2 — Personal "I'm human" note (manual, sent within one working day)

This is the most important email in the whole sequence. It's the one that tells Tom this isn't an agency or a bot. Send it within one working day of acknowledgement. It should mention one specific thing about his business that proves you actually looked.

**Template — fill in the bracketed parts:**

```
(Same thread.)

Hi {name},

Quick personal note now I've had a proper look — [one specific
observation about their business, two sentences max. Examples:
"your Google profile shows you doing a lot of bathroom work around
Marlborough" / "noticed you've got 47 five-star reviews on Checkatrade,
which is a lot of evidence I can use" / "saw you're Gas Safe 573421
and covering SN postcodes mostly"].

[One sentence on what that means for the site: "I'll lean into the
bathroom work and the local angle" / "those reviews are going on the
site front and centre" / "I'll build the area page around the SN
postcodes."]

No reply needed — just wanted you to know I've started.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

**Why this matters:** It's two short paragraphs. It costs you 5 minutes. It does more for trust than the next ten emails combined. **Never skip this step.**

---

### J1-E3 — Halfway progress (automated, sent on working day 4 after acknowledgement)

```
(Same thread.)

Hi {name},

Quick update — I'm about halfway through your site. Build's going well.
Still on track for {deliver_by}.

If you've got any work photos you want me to use, drop them on your
portal: {portal_url}

Otherwise, no action needed.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

---

### J1-E4 — Preview ready (manual, sent when build is done)

```
(Same thread.)

Hi {name},

Your site's ready to look at:

{preview_url}

A few things to know:

- Open it on your phone first. That's where 70% of your visitors will
  see it, so it's the view that matters most.
- This is the first version. It's a starting point, not the finished
  article. Tell me what's wrong and I'll fix it.
- Take your time. No deadline. I'll leave it up for at least a month.

When you're ready, your portal has buttons for each of the three things
you might want to do:

{portal_url}

  → "Love it, let's go live"
  → "A few changes please" (with a form to tell me what)
  → "Not for me, thanks" (no awkward conversation)

Have a look when you've got ten minutes.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

**Portal stage on send:** `preview_ready`. The portal page now shows the three big buttons.

---

## J2 — Free site review

**Entry:** Form submission from plumbers-switch.html or electricians-switch.html, with `start_option = review_site_first`.
**D1 stage on creation:** `acknowledged`
**Promise:** Honest review within 2 working days.

This journey is different from J1 in spirit. **The review is the product.** No selling. No "and by the way, I can build you a new one." If they want that, the review itself will plant the seed; chasing it kills the trust.

### J2-E1 — Acknowledgement (automated, within 30 seconds)

```
Subject: {business} — your NeoBookworm website

Hi {name},

Got it — you'd like me to take a look at {current_url} and tell you
honestly what I think.

I'll have the review back to you by {deliver_by}. It'll cover:

- What's working
- What I'd change if it were mine
- One or two specific fixes that would make a real difference
- An honest call on whether it's worth rebuilding or just tweaking

No sales pitch. If your site's fine as it is, I'll tell you that.

I've also set up a page for you so you can track this and anything that
follows: {portal_url}

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

**Portal stage on send:** `acknowledged` → `reviewing` after 24 hours or when you start the review.

---

### J2-E2 — Review delivered (manual, sent when review is done)

The review itself can be either:

- **A short PDF** (one or two pages) attached to the email and linked from the portal, OR
- **A page on the portal** under their slug, which is shareable

I'd recommend **the portal page approach** — it lives at `{portal_url}/review/` and is part of the experience. PDFs get lost in downloads. A page they can revisit (and that you can update) is better.

```
(Same thread.)

Hi {name},

Review's done. Read it here: {portal_url}/review/

Three quick highlights:

1. [Single biggest issue, plain English]
2. [Second biggest, plain English]
3. [One thing that's actually working well — start with the positive
   on the page itself]

The full thing's at the link above. No login, no sign-up — just bookmark
the page if you want to come back to it.

If anything in there isn't clear, just reply. I'm not going to chase
you on this — but if you want to talk through what a rebuild would look
like, the form on your portal will tell me.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

> **Canonical stage list:** the full set of 13 internal stages (including `review_delivered`, used here) is defined by the CHECK constraint in [v3 Session 1](./neobookworm-onboarding-build-plan-v3.md#session-1). The 6-stage progress strip is a display mapping over those 13 — see v3's "Playbook corrections" for the mapping table.

**Portal stage on send:** `reviewing` → `review_delivered`. The portal review page is live. The portal also now shows three options:
  - "I'd like you to build a new one" → triggers J2-Branch-A (leads to J3-style build)
  - "Thanks for the review, I'll take it from here" → kind close (J2-Branch-B)

---

### J2-Branch-A — They want the fixes only (no rebuild)

If they click "Just the fixes please" on the portal.

Important context: NeoBookworm builds from scratch — it doesn't adopt or patch existing third-party code. So "just the fixes" doesn't mean editing their current site; it means offering to build a new site that addresses the specific issues raised in the review. The email below is honest about this without making it sound like the harder option.

```
(Same thread.)

Hi {name},

Glad the review was useful.

A quick note on how I work: I build sites from scratch rather than
editing what's already there. It sounds like more, but in practice
it means the fixes aren't bodges — they're done properly from the
ground up, and you end up with something that'll last.

The good news is it doesn't take as long as you might think. Because
I've already done the review, I know exactly what needs changing.
A replacement site based on what you've already got would typically
be ready to look at within {deliver_by_switch} working days.

If you'd like me to put that together for you, just say the word.
Same deal as always — you see it before you pay a penny.

Either way, the review's yours to keep.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

Note: `{deliver_by_switch}` should be set to 10 working days from today (the J3 window), since this is effectively the same job as a ready-to-switch build. If they say yes, update their D1 journey to `J3` and pick up from J3-E2.

The portal option label should therefore read "I'd like you to build a new one" rather than "Just the fixes please" — more accurate to what actually happens.

---

### J2-Branch-B — Kind close (they're done)

```
(Same thread.)

Hi {name},

No problem at all. Hope the review's useful — feel free to send it to
your current site person if any of it lands.

If you ever change your mind, you know where I am. Otherwise, all the
best with {business}.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

**Portal stage:** `dropped_out`. No further automated emails ever. The portal page stays live for 30 days with a friendly "If you ever want to come back..." message, then is unpublished.

---

## J3 — Ready to switch

**Entry:** Form submission from a -switch.html page with `start_option = ready_to_switch`.
**D1 stage on creation:** `acknowledged`
**Promise:** Replacement built from existing content, preview within 10 working days.

### J3-E1 — Acknowledgement (automated, within 30 seconds)

```
Subject: {business} — your NeoBookworm website

Hi {name},

Got it — you'd like me to build the replacement for {current_url}.

Here's the plan:

I'll spend the next couple of days pulling the bits I need from your
current site — your services, area, photos, accreditations — then build
you a new one from scratch. You'll have a link to view it by
{deliver_by}.

You don't need to do anything in the meantime. If you've got better
photos than the ones on your current site, or anything else you want
me to use, drop them on your portal:

{portal_url}

Important: I won't touch your current site or your domain until you've
seen the new one and said yes. Nothing changes for you until you decide
it should.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

---

### J3-E2 — Personal "I'm human" note (manual, within one working day)

Same pattern as J1-E2 but oriented around the current site:

```
(Same thread.)

Hi {name},

Quick note now I've had a proper look at {current_url} — [one specific
observation. Examples: "your Gas Safe number isn't on the homepage,
which I'd want to fix straight off" / "your reviews page has some good
stuff I can pull through" / "noticed you're on Wix — switching is
clean, no domain disruption."]

[One sentence on approach: "I'll keep your existing structure roughly
the same so it feels familiar, just faster and cleaner" / "going to
rebuild the services page properly — yours is a bit hidden right now."]

No reply needed — just wanted you to know I've started.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

---

### J3-E3 — Halfway progress (automated, day 5)

Same as J1-E3 but with the 10-day window referenced.

```
(Same thread.)

Hi {name},

Quick update — about halfway through your new site. On track for
{deliver_by}.

If you've got any new work photos you want me to use, drop them on
your portal: {portal_url}

Otherwise, no action needed.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

---

### J3-E4 — Preview ready (manual)

Same as J1-E4 but with a switch-specific paragraph:

```
(Same thread.)

Hi {name},

Your replacement site's ready to look at:

{preview_url}

A few things to know:

- This isn't live yet. Your current site is still up at {current_url}
  and stays that way until you decide.
- Open the new one on your phone first — that's where most of your
  visitors will see it.
- Compare them side by side if you want. The PageSpeed score for the
  new one is in the review section on your portal.
- Take your time. No deadline.

When you're ready, your portal has three options:

{portal_url}

  → "Go ahead — switch me over"
  → "A few changes please"
  → "Stick with what I've got"

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

---

## J4 — Full intake form

**Entry:** intake-form.html submission (regardless of which page they came from).
**D1 stage on creation:** `acknowledged`
**Promise:** Preview within 7 working days. Faster start because the brief is detailed.

The intake form gives you photos, services, area, accreditations, brand notes, the lot. This prospect is the most invested at the moment of submission, and the acknowledgement needs to recognise that.

### J4-E1 — Acknowledgement (automated, within 30 seconds)

```
Subject: {business} — your NeoBookworm website

Hi {name},

Thanks for taking the time to fill that in properly — I've got
everything I need to make a strong start.

Here's what's next:

- I'll review everything you sent and ping you within one working day
  if I need to clarify anything
- I'll build your site from your brief
- You'll have a link to view it by {deliver_by}

Your portal — where you can track everything and add anything you
forgot to mention — is here:

{portal_url}

The more time you put in, the closer I'll get on the first version.
You've already put in more than most — good chance we'll need few or
no revisions.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

---

### J4-E2 — Personal note + any clarification question (manual, within one working day)

This one has a job to do: confirm receipt of files and ask any single follow-up question. Don't ask more than one — they've already filled in a form. If you genuinely have several, ask the most important and save the rest for after the preview.

```
(Same thread.)

Hi {name},

All your photos and the intake came through cleanly — thanks. Quick
read through and one observation: [specific observation, two sentences].

One question before I crack on: [single question, e.g. "you mentioned
you want more bathroom work — should I push that on the homepage above
the boiler/heating stuff, or balance them equally?"]

No rush — answer when you get a chance. I'll start the build now and
can adjust as I go once you reply.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

If you don't have a question, just confirm receipt and the start. Don't manufacture a question for the sake of one.

---

### J4-E3 — Halfway progress (automated, day 4)

Identical to J1-E3.

---

### J4-E4 — Preview ready (manual)

Unlike J1-E4, this version is written out in full — don't just reference J1-E4, because the opening paragraph needs to be different and there's no "same rule" shortcut that makes sense to the reader.

```
(Same thread.)

Hi {name},

Your site's ready to look at:

{preview_url}

Because you gave me a proper brief, I've built this close to what I
think you'll want. That said, the first version is always a starting
point — if anything's not right, just tell me and I'll fix it.

A few things to know:

- Open it on your phone first. That's where 70% of your visitors will
  see it, so it's the view that matters most.
- Take your time. No deadline. I'll leave it up for at least a month.

When you're ready, your portal has buttons for each of the three things
you might want to do:

{portal_url}

  → "Love it, let's go live"
  → "A few changes please" (with a form to tell me what)
  → "Not for me, thanks" (no awkward conversation)

Have a look when you've got ten minutes.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

---

## J5 — Discovery

**Entry:** Quick message form on contact.html, Koalendar booking, or cold email to nick@neobookworm.uk.
**D1 stage on creation:** `acknowledged` (route to J5)

This journey is unstructured by design. Most prospects in J5 will, after one or two emails, route into one of J1–J4. The job here is **triage**.

### J5-E1 — Acknowledgement

**Quick message form** (automated):

```
Subject: {business} — your NeoBookworm website

Hi {name},

Got your message — thanks.

I'll come back to you personally within one working day.

While you're here, your prospect page is at {portal_url} — bookmark
it on your phone. Anything we agree, anything you send me, anything
that's owed back to you, all lives there.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

**Koalendar booking** (handled by Koalendar's own confirmation — but immediately after the booking, send this from the Worker):

```
Subject: {business} — your NeoBookworm website

Hi {name},

Looking forward to our call on {date}.

So you don't have to dig out the link, I've put it on your prospect
page: {portal_url}

Quick question before we talk — what's the one thing about your
business you'd most like the website to do? No long answer needed
— a sentence is fine. I'll come to the call having thought about it.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

**Cold email reply** (manual, within one working day):

When someone emails you directly, reply personally. After your first reply, manually create their D1 row, generate a portal slug, and add this paragraph at the end:

```
[Your personal reply to their email.]

P.S. Once we've got a sense of what you're after, I'll set you up with
a page where you can track everything — saves digging through email.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

Don't send a portal URL on the first reply — it'd feel weirdly automated for what was a personal email. Send it on the second reply, once a real conversation is going.

---

### J5-E2 onwards — Routing

Once you understand what they need from the conversation, you manually update their D1 row to one of J1, J3, or J4 and they enter that journey's flow at the appropriate stage. The portal regenerates automatically.

---

# Convergence

All journeys eventually reach the same set of decisions. From here on, the templates are journey-agnostic.

## Convergence-1 — Revisions requested

Triggered when the prospect uses the "A few changes please" button on the portal, which posts to the Worker with their feedback.

**Auto-acknowledgement (within 30 seconds):**

```
(Same thread.)

Hi {name},

Got your changes — thanks for taking the time to write them out.

I'll have the updated version back to you by {deliver_by} (usually
2 working days for a round of revisions).

Your portal's been updated so you can see what stage we're at:
{portal_url}

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

**Portal stage:** `preview_ready` → `revisions`. The deliver-by date is calculated automatically (2 working days from now).

---

## Convergence-2 — Revisions ready

Manual send after each revision round:

```
(Same thread.)

Hi {name},

Round {revisions_count} of changes is done. Have another look:

{preview_url}

Changes I made this round:
- [Specific change 1]
- [Specific change 2]
- [etc.]

Same three options on your portal whenever you've had a look:
{portal_url}

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

**Portal stage:** back to `preview_ready`.

There's no automatic limit on revision rounds. In practice, most prospects need 1–3. If you hit round 5 with no convergence, the portal can show a soft message: *"It might be worth a quick call — sometimes it's easier than typing. Book in: [Koalendar link]"*. Don't email that — make it portal-only so it doesn't feel like pressure.

---

## Convergence-3 — They love it, ready to go live

Triggered when they click "Love it, let's go live" on the portal.

The domain paragraph varies based on what you already know from their intake data. Three variants are provided below — pick the right one and delete the others before sending.

```
(Same thread.)

Hi {name},

Brilliant — really glad you're happy with it.

Here's what happens next:

1. Payment. £199 to get the site live. Pay here whenever's convenient
   (it goes straight to me, no third party): {stripe_link}

2. The £9.99/month care plan. You can decide on this after launch if
   you'd rather — no rush. I'll explain both options in the launch
   email so you can see what each covers.

3. Domain.

   [VARIANT A — they provided their existing domain on the intake form:]
   You've already got {domain} — I'll use that. I'll handle the
   technical side of pointing it at the new site.

   [VARIANT B — they don't have a domain and didn't suggest one:]
   You don't have a domain yet. Based on your business and area, I'd
   suggest {suggested_domain} — I'll register it for you (typically
   £10–15 for the first year, then covered by the care plan if you're
   on it). If you'd prefer a different address, just say.

   [VARIANT C — they mentioned wanting a domain but didn't confirm one:]
   You mentioned wanting your own web address. I'd suggest
   {suggested_domain} — have a think and let me know what you'd prefer.
   I'll register whichever you go with.

4. Going live. Once payment's through and we've sorted the domain,
   I'll have you live within 2 working days.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

**Portal stage:** `preview_ready` → `awaiting_payment`. The portal now shows the Stripe link prominently and the four-step plan above as a visual checklist.

## Convergence-4 — Kind close (it's not for them)

Triggered when they click "Not for me, thanks" on the portal.

```
(Same thread.)

Hi {name},

No problem at all — thanks for taking the time to look.

If you change your mind, the preview will stay up for another month
at {preview_url}. After that I'll take it down.

If anyone you know is in the market for a website, you know where I am.

All the best with {business}.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

**Portal stage:** `dropped_out`. No further automated emails. Portal stays live for 30 days then unpublishes.

---

## Convergence-5 — Payment received (automated, triggered by Stripe webhook)

The domain situation should already be resolved or in progress from the Convergence-3 exchange. The Stripe webhook fires the base email automatically; you then add the correct domain paragraph manually before it sends — or if you've built the Worker to handle variants, it reads the `domain_status` field from D1.

Three variants for the domain paragraph — pick one:

```
(Same thread.)

Hi {name},

Payment's in — thank you.

Quick next steps:

[VARIANT A — domain confirmed, you already have access:]
- Domain: {domain} is sorted. I'll handle pointing it at the new site.
- Going live: aiming for {go_live_date} — I'll confirm when it's done.

[VARIANT B — domain agreed but not yet registered by Nick:]
- Domain: I'll register {suggested_domain} today and handle everything
  from there.
- Going live: aiming for {go_live_date} — I'll confirm when it's done.

[VARIANT C — domain still unresolved (use only if Convergence-3
   exchange left it open):]
- Domain: one thing still to confirm — reply with your preferred web
  address and whether you've already got it or want me to register it.
  Going live follows within 2 working days of that.

The care plan question can wait — I'll cover both options in the launch
email once the site's up. No rush.

Your portal's updated with where things stand: {portal_url}

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

**Portal stage:** `awaiting_payment` → `preparing_live`.

---

# Post-launch

The most under-loved part of most onboarding flows. This is where world-class shows up.

## Post-1 — Site is live (automated, triggered when you mark D1 stage as `live`)

```
(Same thread.)

Hi {name},

{business} is live: {live_url}

Couple of quick things:

1. I've already tested every page and every form on a phone. All
   working. If you find anything odd, just reply.

2. Your handover doc is on your portal:
   {portal_url}/handover/

   It explains what's been built, how it gets found on Google, what
   I'm doing to keep cold callers off your back, and (for the care
   plan) what's included.

3. The care plan question. You haven't picked yet, which is fine. The
   handover doc covers both options:
   - £9.99/month and I look after everything (hosting, security,
     domain renewal, small changes when you ask)
   - Or take it all over yourself and pay only your domain renewal
     (£10–15/year)

   Read the doc, reply with whichever you'd prefer. If you're not
   sure, I'd suggest starting on the care plan — easy to come off
   later, harder to come back on.

Welcome aboard.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

**Portal stage:** `preparing_live` → `live`. Handover doc is now live on the portal at `{portal_url}/handover/` (rendered HTML version of the docx, branded to NeoBookworm).

---

## Post-2 — Personal launch note (manual, same day as Post-1)

This is the launch-day equivalent of J1-E2. Two sentences. Threaded.

```
(Same thread.)

Hi {name},

Just spent ten minutes testing everything on my own phone — all
forms, all links, all numbers. All good.

Anything funny in the next few days, drop me a line.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

---

## Post-3 — Care plan or self-managed confirmation (manual, after they reply)

**If they choose care plan:**

```
(Same thread.)

Hi {name},

Care plan it is. Couple of things:

1. The first £9.99 charge will hit your card on {date}. After that
   it's the same date each month. You can cancel anytime from your
   Stripe customer portal — link's on your prospect page.

2. You don't need to do anything else. Your domain, your hosting,
   your security, your renewals — all on me.

3. Small content changes are included. If your phone number changes,
   you want to add a new service, swap out a photo, or tweak some
   wording — just email me and I'll usually have it done within a
   couple of working days. Bigger changes (new pages, a different look,
   extra features) are a conversation — I'll quote before touching
   anything.

You're all set.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

**If they choose self-managed** — this is the email that includes the OneTimeSecret links. Use a fresh subject (the only place we break threading).

`{hosting_provider}` and `{hosting_url}` are populated from D1 per client — currently either `Netlify` / `app.netlify.com` or `Cloudflare Pages` / `pages.cloudflare.com`. Update D1 when you move a client to a different platform; the email Worker reads from there. Changing provider names is a one-field update, not a code change.

```
Subject: {business} — credentials to keep safe

Hi {name},

You're going self-managed — fair enough. Here are the credentials
you'll need to keep the site running.

IMPORTANT: each link below can only be opened once, and they all
expire in 7 days. Open each one, copy the password into a password
manager (or write it down somewhere safe), then move on.

If a link's already been opened by the time you click, it means
either you've used it already or someone else has — let me know and
I'll generate fresh ones.

Your hosting ({hosting_provider}):
- Email: {client_email}
- Password: {ots_hosting}
- Login at: {hosting_url}

Your domain (Krystal):
- Email: {client_email}
- Password: {ots_domain}
- Login at: my.krystal.uk

Your site files (GitHub):
- Email: {client_email}
- Password: {ots_github}
- Login at: github.com

Your full handover doc — including the annual renewal reminders and
what to do if you need help — is on your portal:

{portal_url}/handover/

If you ever change your mind about going self-managed and want me to
take it back on, just email — no awkwardness.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

**Placeholder note:** the credential placeholder is `{ots_hosting}` (with `{hosting_provider}` / `{hosting_url}`), **not** `{ots_netlify}` — the provider is stored per client in D1, so it isn't hardcoded to Netlify. The Conventions list above already reflects this.

---

## Post-4 — Week one check-in (automated, 7 days after live)

```
(Same thread — back on the main one.)

Hi {name},

Quick check-in — site's been live a week.

Three quick questions, only if any of them apply:

- Anything broken or behaving oddly?
- Anything you'd change now you've lived with it for a few days?
- Got any new work photos worth adding?

If everything's fine, no need to reply. Just wanted to be sure.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

---

## Post-5 — Google Business Profile nudge (automated, 14 days after live)

The cheapest thing you can do for their visibility, and the one most likely to actually move the needle for a local trades site. Don't skip.

```
(Same thread.)

Hi {name},

One thing worth doing now the site's settled in: making sure your
Google Business Profile points at it.

If you've already got a profile, you just need to add the website
URL: {live_url}. Takes about 30 seconds.

If you haven't got one yet, that's where most of your local Google
visibility will come from — much more so than the website on its
own. There's a step-by-step walkthrough on your portal:

{portal_url}/google-business/

Don't put it off — a profile that's been live for six months ranks
better than one that's a week old, so the sooner you get it set up,
the better.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

The `/google-business/` page on the portal is a static walkthrough you write once and reuse for every client. You've already got `guides/local-search-guide.html` which can be the source.

---

## Post-6 — One month review prompt (automated, 30 days after live)

```
(Same thread.)

Hi {name},

A month in. If the site's been useful, a Google review would mean a
lot to me — it's how other tradespeople find out I exist.

Here's the link: {google_review_url}

No pressure. If the site hasn't done what you hoped, tell me that
instead and I'll see what I can fix.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

This is the only ask in the whole sequence. One time, one link, no follow-up if ignored. Voice principle: low pressure, high autonomy.

---

# Care plan ongoing

Active care plan clients get a small number of touchpoints per year. Self-managed clients get fewer.

## Ongoing-1 — Quarterly check-in (automated, every 90 days — care plan only)

```
(Same thread.)

Hi {name},

Quarterly check-in — quick one.

Anything you'd like changed on the site? Phone number changed,
services updated, a new photo gallery, a price tweak?

If nothing, no need to reply.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

---

## Ongoing-2 — Annual domain renewal heads-up (automated, 30 days before renewal)

**Care plan version:**

```
(Same thread.)

Hi {name},

Quick heads-up — your domain renews on {renewal_date}. It's covered
by your care plan, so I'll handle it on the day. No action needed
from you.

Separate point: if you've recently changed the card that your
£9.99/month care plan charges to, make sure the new one's active
in Stripe — link's on your portal at {portal_url}. Nothing to do
if the card's the same.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

**Self-managed version:**

```
(Same thread.)

Hi {name},

Quick heads-up — your domain renews on {renewal_date}. Since you're
on the self-managed plan, you'll need to renew it yourself.

Krystal will email you the reminder 30 and 7 days out. Check your
junk folder if you don't see it. Cost is usually £10–15.

If the site goes offline because the domain lapses, it can be
brought back — but it's a hassle. Worth setting a reminder now.

If you'd like me to take it back over (i.e. move to the care plan
at £9.99/month), just say — no awkwardness, takes 5 minutes.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

---

## Ongoing-3 — Annual "you're a year in" note (automated, 365 days after live)

```
(Same thread.)

Hi {name},

It's been a year today since {business} went live. Wanted to say
thanks for being one of the first.

If the site's been working well for you, I'd love a short note
back saying so — keeps me motivated. If it hasn't, tell me what's
not landing and I'll fix it.

Either way, thanks for the trust.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

Optional and warm. Anniversary touches go a long way in a low-touch business.

---

# The portal

The portal page lives at `https://neobookworm.uk/c/{slug}/`. It's served by a Cloudflare Worker that reads D1 on each request and renders a single HTML page styled to match the main NeoBookworm brand.

## Structure (top to bottom)

1. **Header bar** — NeoBookworm logo (small), no nav, "Hi {name} from {business}" greeting.
2. **Progress strip** — horizontal bar with all 6 stages (Acknowledged → Researching → Building → Preview ready → Your decision → Live), current stage highlighted in amber.
3. **The active panel** — the largest visual element. Changes per stage. See stage-by-stage copy below.
4. **Useful links** — 2–4 stage-appropriate links. Examples: "Send work photos", "Read about what goes on a trades website", "Book a call".
5. **Conversation history** — small section listing the emails Nick has sent ("Acknowledgement — sent 3 days ago", "Halfway update — sent 1 day ago"), each linked to its sent date. Doesn't show email bodies — that's what their inbox is for. This is for "where am I in this?" orientation.
6. **Contact footer** — "Need to reach Nick? nick@neobookworm.uk — replies within one working day."

The portal is **read-mostly** but has a few action buttons depending on stage. Those buttons POST back to the Worker, which updates D1, which changes the page.

---

## Stage-by-stage active panel copy

### `acknowledged`

```
Got your details, {name} —
I'll be in touch within one working day.

Your first deliverable: a [preview site / site review / replacement build]
will be ready by {deliver_by}.
```

Action buttons: none yet. Below: "While you're waiting, here are a few things you might find useful: [3 stage-relevant guide links]"

---

### `researching` / `building` / `reviewing`

```
Currently: building {business}'s website.
Estimated delivery: {deliver_by} ({n} working days from now).

You don't need to do anything. If you've got photos or anything else
you'd like included, send them below.
```

Action buttons: "Send work photos" (opens R2 upload form), "Send a note to Nick" (opens mailto)

---

### `preview_ready`

```
{business}'s site is ready: {preview_url}

Take a look on your phone first — that's where most of your
visitors will see it.
```

Three big action buttons:
1. **"Love it — let's go live"** (green) → triggers Convergence-3
2. **"A few changes please"** (amber) → opens a structured feedback form (see below)
3. **"Not for me, thanks"** (subtle, grey) → triggers Convergence-4

**The "few changes" form** is the most important UX detail in the whole flow. Don't ask for free-text feedback only — most tradespeople won't write a long email. Use a structured form:

```
What would you like changed?

[ ] Wrong photos / no photos
[ ] Wrong services listed
[ ] Wrong area / postcodes
[ ] Colours don't feel right
[ ] Phone number / contact details
[ ] Something I can't put my finger on
[ ] Other

Tell me more (optional):
[textarea]

[Send changes]
```

The checkboxes do the heavy lifting. The textarea is optional. When submitted, you get an email with the structured data, and the prospect gets Convergence-1.

---

### `revisions`

```
Working on your changes — back to you by {deliver_by}.

Round {n} of revisions. Most sites need 1–3 rounds before they're
just right.
```

No action buttons (waiting on you).

---

### `awaiting_payment`

```
You're going ahead — brilliant.

Pay £199 to get the site live: [Pay with Stripe →]

After payment:
✓ I'll sort the domain and hosting
✓ You'll be live within 2 working days
✓ I'll send you the handover doc on the day
```

Action button: prominent "Pay £199 with Stripe" linking to {stripe_link}.

---

### `preparing_live`

```
Payment received. Going live on {go_live_date}.

I'm getting the technical bits ready: domain pointed correctly,
SSL certificate, final QA checks, sitemap submitted to Google.

You don't need to do anything.
```

---

### `live`

```
{business} is live: {live_url}

Welcome aboard.
```

Below: prominent links to handover doc, Google Business guide, "Request a change" form.

---

### `care_active`

```
On the care plan — £9.99/month, all looked after.

Next billing date: {date}.
Need a change? [Request one →]
```

---

### `self_managed`

```
You're running it yourself. Site's at {live_url}.

Your accounts:
- Hosting (Netlify): app.netlify.com
- Domain (Krystal): my.krystal.uk
- Files (GitHub): github.com

If you ever want me to take it back on, [drop me a line].
```

(Note: the actual passwords are sent via OneTimeSecret, not stored on the portal. The portal just reminds them what accounts they have.)

---

### `dropped_out`

```
You decided to leave it for now — no problem.

If you change your mind, your preview's still up at {preview_url}
for the next {n} days.

If you ever want to pick this back up, [drop me a line].
```

This page stays live for 30 days then unpublishes.

---

# The nudge schedule

The nudge worker runs once per working day (suggest 10am UK time so emails land while tradespeople are between morning jobs). It looks at every prospect and decides whether to send a nudge based on stage, days-since-last-action, and `last_nudge_sent_at`.

**Cardinal rule: never more than one nudge per 3 working days.** If the worker decides a prospect needs a nudge but sent one less than 3 working days ago, skip.

| Stage | Days since stage_changed_at | Nudge |
|---|---|---|
| `preview_ready` | 4 working days | "Tom — anything I can change to help?" (gentle) |
| `preview_ready` | 8 working days | "Tom — want to chat about it? [Koalendar link]" |
| `preview_ready` | 14 working days | "Tom — final nudge. Should I leave it with you?" |
| `preview_ready` | 21 working days | Auto-close: mark as `dropped_out`, send Convergence-4-soft |
| `awaiting_payment` | 5 working days | "Tom — just a heads-up the Stripe link is still good when you're ready" |
| `awaiting_payment` | 14 working days | "Tom — anything blocking payment? Happy to call if it helps" |
| `awaiting_payment` | 30 working days | Personal email from Nick (no template — drops to your task list) |
| `live` | 30 days | Post-6 (review prompt) — runs once per client |

For all other stages, no automated nudge. Either you're driving the work, or you're waiting on something that has its own timer (revision delivery, etc).

**The 21-day auto-close on `preview_ready`** is the most important rule for protecting your time. Without it, dead prospects clog the pipeline forever. With it, the database stays clean and you can see real signal.

---

## Nudge templates

### Nudge-1 — preview_ready, day 4

```
(Same thread.)

Hi {name},

Just a gentle nudge — had a chance to look at the site yet?

If something's not right but you can't quite put a finger on it,
no worries — just say "it's not quite working for me" and I'll
come back with questions. Easier than typing a list.

Your preview's still here: {preview_url}
Portal: {portal_url}

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

---

### Nudge-2 — preview_ready, day 8

```
(Same thread.)

Hi {name},

Still on this — no pressure.

If it'd help to chat through it on a quick call rather than emailing,
book in here: koalendar.com/e/meet-with-nick-barrett

Otherwise the preview stays put: {preview_url}

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

---

### Nudge-3 — preview_ready, day 14

```
(Same thread.)

Hi {name},

Last nudge from me on this — I won't keep poking.

If you've decided it's not for you, just let me know (one word's
fine) and I'll close it off. If you'd like more time, also fine —
the preview will stay up for another two weeks.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

---

### Nudge-4 — preview_ready, day 21 (auto-close — soft Convergence-4)

```
(Same thread.)

Hi {name},

I'm going to close this off for now — saves clogging up both our
inboxes.

Your preview will stay up at {preview_url} for another two weeks
in case you want to come back to it.

If anything changes, you've got my email. No hard feelings, and
all the best with {business}.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

Portal automatically transitions to `dropped_out`.

---

### Nudge-5 — awaiting_payment, day 5

```
(Same thread.)

Hi {name},

Quick heads-up — the Stripe link from the other day is still good
whenever you're ready: {stripe_link}

No rush, just letting you know it's not going to expire.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

---

### Nudge-6 — awaiting_payment, day 14

```
(Same thread.)

Hi {name},

Two weeks since I sent through the payment link. Anything I can
help unblock?

If you'd rather pay by bank transfer or want to talk it through
on a quick call, just say.

Nick — NeoBookworm.uk
nick@neobookworm.uk
```

---

# Implementation notes

A few practical pointers for when you (or Cursor) build this.

## D1 schema

The schema in the architecture summary is the right starting point. Add an `email_log` table to record every send:

> **⚠ Superseded — do not build this version.** The canonical `email_log` lives in `neobookworm-enquiries`, is keyed by `slug` (not `prospect_id`), uses TEXT `sent_at` (not INTEGER), has `status`/`error` columns, and has **no** FK to `prospects`. See [v3 Session 1](./neobookworm-onboarding-build-plan-v3.md#session-1) for the schema to actually create. The block below is kept only to show the original intent.

```sql
CREATE TABLE email_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id TEXT NOT NULL,
  template    TEXT NOT NULL,    -- e.g. 'J1-E1', 'Nudge-3'
  sent_at     INTEGER NOT NULL,
  subject     TEXT NOT NULL,
  recipient   TEXT NOT NULL,
  FOREIGN KEY (prospect_id) REFERENCES prospects(id)
);
```

This is essential for:
- Showing the "conversation history" panel on the portal
- The nudge worker's "no more than one nudge per 3 days" check
- Your own debugging when something looks off

## Worker structure

> **⚠ Superseded.** In v3 the portal, the Stripe webhook, and the nudge cron are **Vercel functions** (`api/portal.js`, `api/stripe-webhook.js`, `api/cron-nudge.js`), not Cloudflare Workers — Workers can't do SMTP, and CLAUDE.md mandates "POST to a Vercel function" for email. The **only** Worker that stays a Worker is the existing `neobookworm-landing-enquiry`. Ignore the "three Workers" model below and build per [v3](./neobookworm-onboarding-build-plan-v3.md#architecture-at-a-glance).

Three Workers, all on the same D1 binding:

1. **`intake-worker`** — POST endpoint per form variant. Routes:
   - `POST /intake/preview` (J1)
   - `POST /intake/review` (J2)
   - `POST /intake/switch` (J3)
   - `POST /intake/full` (J4)
   - `POST /intake/quick` (J5 quick message)
   - `POST /intake/koalendar-webhook` (J5 booking — if you set up the webhook)
   - `POST /intake/portal-feedback` (preview revision requests)
   - `POST /intake/portal-decision` (love it / not for me clicks)
   - `POST /webhooks/stripe` (payment confirmed)

2. **`portal-worker`** — single GET endpoint at `/c/:slug/` that reads D1 and renders.

3. **`nudge-worker`** — cron-triggered. Runs once per working day at 10:00 UK time.

The Workers send mail via Gmail SMTP using the same Nodemailer pattern your contact form already uses. Reuse that code.

## OneTimeSecret integration

The free public service exposes a simple REST API. From your Worker:

```
POST https://onetimesecret.com/api/v1/share
  with body: secret=<password>&ttl=604800 (7 days)
  returns: { secret_key, ... }

The shareable link is: https://onetimesecret.com/secret/<secret_key>
```

No auth needed for free use. Generate one secret per credential at the moment the handover email is sent.

## Branding the handover doc on the portal

Your two .docx handover docs need to become rendered HTML on the portal at `/c/{slug}/handover/`. The Worker can either:
- Render a single template that takes `{plan}` as input and shows the right variant, OR
- Maintain two static handover HTML templates (care vs self-managed) and pick one based on D1

Either works. The second is simpler. The first scales better as the docs evolve.

The docx content already exists — it just needs a single CSS pass to bring it inline with the NeoBookworm brand (navy header, amber accent, Playfair headings, DM Sans body). One day's work.

## Stripe Customer Portal link on the live portal

For care plan clients, the portal should show a "Manage billing" button that opens their Stripe Customer Portal. The Stripe-hosted portal handles cancel, card update, etc. Don't try to replicate this yourself — Stripe's UI is good enough.

## Email-vs-portal: when to use which

Easy rule:
- **Email** for things they need to act on or know now: acknowledgement, preview ready, payment, launch.
- **Portal** for state, history, and reference: where they are, what's next, links to docs, archived emails.

Every email links to the portal. Every portal page has the contact email visible. The two reinforce each other.

## What to build first

If you can only build one thing this week, build the **intake-worker + portal-worker** end of the J1 journey. That gives you:
- A working acknowledgement email
- A working portal that updates as you change D1 by hand
- The mechanical proof that the whole concept works

Then add Workers and templates iteratively. Don't try to launch all 30 emails in v1 — get one journey working perfectly, then expand.

## Manual-first, automated-second

For your first 5 prospects, run the whole thing manually:
- Send acknowledgements from Gmail Templates
- Update D1 by hand to drive the portal
- Skip the nudge worker entirely (just check your dashboard once a day)

This will surface every flaw in the design before you've automated the flaws. Once you've done 5 prospects end-to-end and the templates feel right, automate. Don't automate the first one.

---

*End of playbook.*
