# Cursor prompt — build the two electrician landing pages

Paste everything below into Cursor (with the repo open). It creates two new pages by
cloning the existing, proven plumber landing pages and swapping in electrician copy.
**Reuse is the goal — do not redesign anything.** Only change what this brief lists.

---

## TASK

Create two new files at the repo root by **duplicating** the existing plumber pages,
then applying the changes in this brief:

1. `electricians.html`  ← duplicate of `plumbers.html` (the **no-website** page)
2. `electricians-switch.html`  ← duplicate of `plumbers-switch.html` (the **has-website / switch** page)

Work on one file at a time. Copy the source file verbatim first, then make only the
edits described. When in doubt, leave it exactly as the plumber page has it.

---

## HARD RULES (apply to both files)

- **Do not touch** any CSS, `<style>` blocks, fonts/preloads, the form JavaScript, the
  Cloudflare Worker endpoint URL (`https://neobookworm-landing-enquiry.nickbarrett.workers.dev`),
  the accordion/modal/Leaflet/CookieConsent logic, the header, or the footer.
- **Do not change the pricing** anywhere: £49.99 build, £9.99/mo, and the
  Wix/agency cost-comparison figures all stay exactly as written.
- **Do NOT add either page to `sitemap.xml`.** These stay out of the sitemap until go-live
  (same as the plumber pages today).
- **No statistics or search-volume figures.** Do not invent or add any "X searches a month"
  numbers. The "Why it matters" copy below is deliberately qualitative — keep it that way.
- **British English throughout.** Keep the existing plain, direct landing-page voice.
- **Keep all customer-facing copy nationwide** — never assume the electrician is in Wiltshire
  or Swindon. (The demo *example* content and the "About Nick / Swindon" section may keep
  their existing Wiltshire/Swindon wording — that's real and stays.)
- Preserve all accessibility attributes, `id`s, `aria-*`, skip link, `<main id="main">`,
  heading order, and image `width`/`height` attributes.

---

## GLOBAL FIND-AND-REPLACE GLOSSARY (both files)

Apply these as careful, context-aware replacements (respect capitalisation and plurals):

| Find | Replace with |
|---|---|
| plumber / plumbers | electrician / electricians |
| plumbing business | electrical business |
| plumbing work / plumbing | electrical work / electrical |
| plumber near me | electrician near me |
| Hartley Plumbing | Swift Electrical |
| `hartley-plumbing-njb-demo.netlify.app` | `swift-electrical-njb-demo.netlify.app` |
| `Images/demo-hartley-plumbing.jpg` | `Images/demo-swift-electricals.png` |
| `Images/demo-hartley-plumbing-680.webp` | `Images/demo-swift-electricals-680.webp` |
| Gas Safe number | registration number |
| Gas Safe (as a trust badge / registration) | NICEIC, NAPIT or ELECSA registration (see card + modal rewrites) |
| form `source: 'plumbers-landing'` | `source: 'electricians-landing'` |
| form `source: 'plumbers-switch-landing'` | `source: 'electricians-switch-landing'` |
| intake redirect `&ref=plumbers` | `&ref=electricians` |
| intake redirect `&ref=plumbers-switch` | `&ref=electricians-switch` |
| canonical/OG `…/plumbers` | `…/electricians` |
| canonical/OG `…/plumbers-switch` | `…/electricians-switch` |

**Accreditation — important nuance:** the prospect list is a mix of NICEIC, NAPIT and
ELECSA registered electricians (plus Part P). Never hard-code "NICEIC" as if it's the only
scheme. Use the neutral wording given in the card and modal rewrites below.

**Emergency/example swaps** (replace plumbing scenarios with electrical ones wherever they
appear in prose): a burst pipe / leak / boiler / radiator / hot water cylinder → a tripping
fuseboard / lost power to half the house / a burning smell from a socket / a dead consumer unit.

**Demo image dimensions:** the Swift Electrical screenshot files are
`Images/demo-swift-electricals.png`, `Images/demo-swift-electricals.webp`, and
`Images/demo-swift-electricals-680.webp`. Check the actual intrinsic pixel dimensions of the
file and set the `<img>` `width`/`height` attributes to match (the plumber values may be wrong
for this image — correct them so there's no layout shift). Demo alt text:
`Swift Electrical — example electrician website built by NeoBookworm`.

---

# PART A — `electricians.html` (no-website page)

Duplicate `plumbers.html`, apply the glossary above, then make these specific edits.

### A1. Meta block (the `TRADE-SPECIFIC: Meta` comment near the top)
```html
<title>Websites for UK Electricians — £49.99 Fixed | NeoBookworm</title>
<meta name="description" content="I build £49.99 websites for UK electricians. You see your site before paying — walk away owing nothing if it's not right.">
<link rel="canonical" href="https://neobookworm.uk/electricians">
<meta property="og:url" content="https://neobookworm.uk/electricians">
<meta property="og:title" content="Websites for UK Electricians — £49.99 Fixed | NeoBookworm">
<meta property="og:description" content="A website built specifically for your electrical business. See it before you pay anything. Walk away if it's not right.">
```
Leave `og:image`, dimensions, favicons, twitter card unchanged.

### A2. Structured data (the `TRADE-SPECIFIC: Structured data` JSON-LD block)
- `"serviceType": "Website design for electricians"`
- `"audience"` → `"audienceType": "Electricians"`
- offer `"description": "Fixed-price website build for UK electrical businesses"`

### A3. Hero
- Eyebrow → `For electricians without a website`
- **Keep the `<h1>` exactly as is** ("Word of mouth brings you the customers who know you. *A website brings you the ones who don't.*") — it's trade-neutral and works as-is.
- Replace the `hero-sub` paragraph with:
> Most electrical work comes through referrals — and that's a great place to be. But the bigger jobs — a rewire, a new consumer unit, an EV charger, a landlord's safety certificate — usually start with someone searching online and weighing up who looks credible. I build sites that put you in front of them. You see yours before you pay anything — if it's not right, walk away owing nothing.
- Hero demo mock: swap to the Swift Electrical demo (URL, image files, alt, dimensions per the glossary).

### A4. How it works — step 2
Change "…for your plumbing business" → "…for your electrical business". Leave the rest.

### A5. Why It Matters (full rewrite of the `TRADE-SPECIFIC` why section)
Heading:
> When the power goes, people call fast. When it's a bigger job, they *compare first.*

Body (replace the why-content paragraphs and list with this — **no numbers**):
> Some electrical calls are urgent — a tripping fuseboard, lost power to half the house, a burning smell from a socket. People grab their phone and ring whoever looks most credible.
>
> But a lot of an electrician's best work isn't an emergency at all. A full rewire, a new consumer unit, an EV charger on the drive, solar and battery storage, a landlord's EICR safety certificate — these are planned, researched decisions. People weigh up two or three electricians online before they spend that kind of money.
>
> Your site only has to do a few things well:
> - **Make it easy to act.** Clear phone number, clear contact option, and no fiddly layout on mobile.
> - **Show you're qualified.** Your NICEIC, NAPIT or ELECSA registration, Part P, where you cover, and the kind of work you actually do.
> - **Back it up with proof.** A few job photos and reviews so they feel confident choosing you.
>
> That's how you win both the urgent call-outs and the bigger, better-paid jobs — without paying commission or competing in a quote race.
>
> An electrician in your area with a website and a Google listing starts picking up work they couldn't reach before: the homeowner planning an EV charger, the landlord who needs certificates across a portfolio, the family getting an extension rewired.
>
> Unlike a Checkatrade profile or Facebook page, the website is yours — no algorithm change or annual price hike can take it away from you.

### A6. "Built for electricians" — the six feature cards
- Eyebrow → `Built for electricians`
- **Card 1** (the `gasSafeCard` — keep the id/aria as-is so the modal still wires up):
  - Title: `Your registration, front and centre`
  - Body: `Whether you're with NICEIC, NAPIT or ELECSA, your registration number goes on every page — linked to the official register so customers can verify it in one click. Part P too, if it applies.`
- **Card 3** (services): `Written around how you actually work — not a generic list copied from a template. Domestic all-rounder, EV and renewables specialist, or commercial and landlord work — customers know you're right for them before they call.`
- **Card 5** (tap to call): `Most people searching for an electrician are on their mobile. Your number needs to be one tap — not buried in small print they have to scroll three pages to find.`
- Cards 2, 4, 6: just apply the glossary (plumber→electrician); copy otherwise unchanged.

### A7. The six feature modals (bottom of the page)
- **Gas Safe badge modal** → registration modal. Keep its `id`/trigger wiring. New copy:
  - Heading: `Your registration, verified in one click.`
  - Body: `Your NICEIC, NAPIT or ELECSA registration number goes on every page — not buried in small print, but displayed as a proper badge, linked live to the official register. A customer who wants to check you're qualified can do it in seconds, before they even pick up the phone. Most Wix and template sites don't do this.`
  - Footer line: `Tell me your registration number in the form below and I'll link it straight to the register. Checkatrade reviews can go on too if you have them.`
- **Services modal** demo content: replace the plumbing example services (boiler service, hot-water-cylinder emergency note, etc.) with electrician equivalents — e.g. *Consumer unit (fuseboard) upgrades*, *EV charger installation*, *EICR safety certificates for landlords*, *Full & partial rewires*. Replace any emergency note with an electrical one, e.g. `Fuseboard tripping and won't reset? I keep common parts in the van to get your power back fast.`
- All other modals: apply the glossary; swap the demo link/business name to Swift Electrical.

### A8. FAQ (keep all 10 items; edit only where trade-specific)
- **faq-1** (word of mouth): keep, but broaden the examples to electrician ones — e.g. "…the homeowner planning an EV charger, the landlord who's never used you before, the emergency caller who needs someone right now."
- **faq-3** (Checkatrade): apply glossary (plumbers→electricians); keep all the £ figures.
- **faq-4** (Google): "plumber near me" → "electrician near me"; "plumbers" → "electricians".
- **faq-6** (Google Business listing): "your Gas Safe number" → "your registration number".
- Other FAQs: glossary only.

### A9. Form
- Textarea placeholder → `e.g. I'm an NICEIC electrician based in Bristol, mostly do rewires, consumer unit upgrades and EV chargers. Trying to get more work in the BS postcode areas.`
- Form `source` value → `electricians-landing`.
- Intake redirect ref → `electricians`.
- Leave the business-name input placeholder generic or change `Hart Plumbing Ltd` → `Hart Electrical Ltd`; email placeholder similarly. (Cosmetic — keep consistent.)

---

# PART B — `electricians-switch.html` (has-website / switch page)

Duplicate `plumbers-switch.html`, apply the glossary, then these edits. This page weaves
plumber/Gas Safe references through the prose, so read each section and swap thoroughly.

### B1. Meta block
```html
<title>Switch Your Electrician Website — See It Before You Pay | NeoBookworm</title>
<meta name="description" content="Already have an electrician website? I'll review it free and build a faster replacement you only pay for if it's better. You keep your domain. No contract.">
<link rel="canonical" href="https://neobookworm.uk/electricians-switch">
<meta property="og:url" content="https://neobookworm.uk/electricians-switch">
<meta property="og:title" content="Switch Your Electrician Website — See It Before You Pay | NeoBookworm">
<meta property="og:description" content="A faster website for your electrical business — see it before you pay, keep your domain, no contract.">
```

### B2. Structured data
- `"identifier": "electricians-switch-landing"`
- `"serviceType"` → website rebuild for electricians (e.g. `"Website design for electricians"`)
- description → `"Website rebuild with preview-before-pay model for UK electrical businesses switching provider"`

### B3. Hero
- Eyebrow → `For electricians who already have a website`
- `<h1>` → `You've already taken the website step. <em>Most electricians haven't.</em>`
- `hero-sub` → replace "shows your Gas Safe number properly" with "shows your registration number properly", and "searching for a plumber in your area" → "searching for an electrician in your area". Keep the rest of the structure.
- Hero demo mock → Swift Electrical (URL/image/alt/dimensions per glossary).

### B4. "Four reasons electricians look at switching"
- Heading: `Four reasons electricians <em>look at switching.</em>`
- Card 4 ("It's real, but something's off"): "your Gas Safe number isn't visible" → "your registration number isn't visible". Keep the free-site-review CTA.
- Cards 1–3: glossary only (these are about domains/Wix/agencies — largely trade-neutral).

### B5. "What you'd be switching to" (six demo cards + speed comparison)
- Card 1 (`gasSafeCard`): Title `Your registration, front and centre`; body `Your NICEIC, NAPIT or ELECSA registration number goes on every page — linked to the official register so customers can verify it in one click. Most Wix and template sites don't do this properly.`
- Card 5 (tap to call): "searching for a plumber" → "searching for an electrician".
- Speed-compare label: "Typical Wix / page-builder **electrician** site — mobile (20–40 is common)".
- Speed note: "Wix and Squarespace **electrician** sites".

### B6. Honesty block ("When you probably shouldn't switch")
- "This page is for **plumbers** whose site…" → "…**electricians** whose site…"
- Bullet: "no Gas Safe number, no working contact form" → "no registration number, no working contact form".

### B7. Cost comparison
- Leave **all numbers exactly as they are** (£49.99/£9.99, £15–20, £40–250+, year 1/3 break-even). No trade words to change here beyond the glossary.

### B8. How switching works (steps) & About Nick
- Steps: glossary only.
- About Nick: leave unchanged (it's real and trade-neutral).

### B9. FAQ (keep all 9 items)
- **faq-3** ("Can you use my existing photos and content?"): "Send me anything you have: work photos, services list, Gas Safe number…" → "…registration number…".
- All other FAQs are about ranking/domain/agency/contract and are trade-neutral — glossary only.

### B10. Six feature modals
- Same registration-modal rewrite as A7 (heading, body, footer).
- Services modal: same electrician service examples as A7.
- All modals: swap demo link/business name to Swift Electrical.

### B11. Form
- Textarea placeholder → `e.g. Currently on Wix, want to keep my domain at GoDaddy, NICEIC registered — whatever helps me get started.`
- Form `source` value → `electricians-switch-landing`.
- Intake redirect ref → `electricians-switch`.
- Keep the "Recommended" pill on Option 1 and all option wiring as-is.

---

## AFTER BUILDING — self-check both pages

- [ ] No remaining instances of "plumber", "plumbing", "Gas Safe", "Hartley", or
      `hartley-plumbing` anywhere (search both files).
- [ ] No invented statistics or "searches per month" numbers anywhere.
- [ ] Pricing untouched (£49.99 / £9.99 and the cost table figures).
- [ ] Demo links point to `swift-electrical-njb-demo.netlify.app` and images to
      `demo-swift-electricals*`; `<img>` width/height match the real file dimensions.
- [ ] Form `source` values and intake `ref` params are the electrician versions.
- [ ] Canonical + OG URLs are `/electricians` and `/electricians-switch`.
- [ ] Neither page added to `sitemap.xml`.
- [ ] Both pass a quick Lighthouse mobile check (accessibility 100, no layout shift from the demo image).
- [ ] Run both pages in a browser: open the registration modal, the services modal, the
      area map, the FAQ accordion, and submit each form option once to confirm wiring.
```
