# Site brief — Smart Tyres Gloucester

TyreTrust mailshot pre-build (Tier 1). Build this **as HE Tyres' own website was built** —
a real trading business's site, presented as live, no pricing table, no "switch to us" pitch,
no demo banner. **Do not build this on the plumbers/gas-boiler landing-page pattern**
(hero → four situations → cost comparison → FAQ → lead form) — that pattern is for *cold
outreach pages that sell NeoBookworm to a stranger*. This page sells nothing. It's a tyre
shop's front door, and the only "ask" on it is to book a fitting or ring up. The site brief
below is the HE Tyres section list, not the plumbers.html one.

Reference build: `he-tyres/index.html`. Copy its section order, its component patterns
(button-triggered `<dialog>` service modals, trust strip, browser-chrome-free real site feel),
its fonts (`he-tyres/fonts/` + `he-tyres/fonts.css`), and its restraint — HE Tyres has zero
sales copy on it. Nobody visiting a tyre shop's website should feel pitched to.

---

## Business facts (verified via search, not fabricated)

| | |
|---|---|
| Name | Smart Tyres Gloucester (trades as, per Facebook: "Smart Tyres" / listed elsewhere as "Smart Tyres Gloucester Part Worn & New") |
| Address | Unit 1, 28 Hempsted Lane, Hempsted, Gloucester GL2 5JA |
| Phone | 01452 690710 |
| Google rating | 4.9★ from 168 reviews |
| Facebook | Active page, 98% recommend from 30 reviews |
| Positioning (their own words, from Facebook post) | "Part worn & new tyres from £25 — over 1000 part worn tyres in stock" |
| Review themes | Speed ("new tyres on in under 20 minutes"), a torque wrench specifically mentioned and appreciated, friendly/knowledgeable staff, competitive pricing, good value |
| Owner/staff names | **Not known — do not invent.** No named individual surfaced in research. See "Open items" below. |
| Trading history | Not confirmed via search. Do not claim "X years" — leave any longevity claim out unless confirmed. |

Everything on the finished site must trace back to one of these facts, a photo Nick takes on
site, or a plain statement of what tyre fitting involves generically (fitting, balancing,
part-worn + new, TPMS if confirmed available). **No fabricated reviews, no invented "20 years
trading," no made-up staff names or photos** — the entire TyreTrust pitch to prospects is
"I built you a real one," and a site full of invented detail is the one thing that could be
caught and would undo that trust in one look.

---

## What NOT to do (the plumbers-pattern mistakes to avoid)

The plumbers/gas-boiler/painter-decorator landing pages (`plumbers.html`,
`gas-boiler.html` etc.) are **cold-outreach sales pages** — they exist to persuade a stranger
to buy a website from Nick. Their DNA (situational hook cards, cost-comparison tables, FAQ
objection-handling, a lead capture form as the entire final section, "About Nick" personal
story) is wrong here. Specifically avoid:

- **No pricing/cost-comparison table.** Smart Tyres doesn't sell websites, it sells tyres.
- **No "four situations you might be in" hook cards.** That's a device for persuading a
  *prospect of NeoBookworm*, not a device for a tyre shop's own visitors.
- **No FAQ about switching providers, ownership, or cancellation.** Those questions belong
  to the TyreTrust landing page, not to Smart Tyres' own site.
- **No lead-capture form as the climax of the page.** The climax of a tyre shop's website is
  "call us" or "book a fitting" — a phone number and a calendar, not a form asking for name/
  business/email.
- **No "About Nick" section, obviously** — there is no Nick on this site at all.
- **No demo banner, no NeoBookworm branding anywhere.** This is presented exactly as HE Tyres'
  own site is: as if it belongs to Smart Tyres and always has.

---

## Section-by-section brief (mirrors he-tyres/index.html)

### 1. Hero
- Eyebrow: `Mobile & depot tyre fitting · Gloucester` (confirm mobile-vs-depot-only before
  writing — Facebook post suggests a fixed unit with stock, not confirmed mobile-only or both;
  default to depot-only framing unless mobile is confirmed, per the honesty rule above)
- H1: something plain and confident, not clever. Reference pattern only, not copy verbatim:
  *"Tyres done right — at a price that makes sense."* Adapt once mobile/depot status confirmed.
- Sub: one or two sentences, plain English, no jargon. Can reference part-worn + new stock
  honestly — that's a real, confirmed differentiator.
- CTAs: `📞 Call 01452 690710` (primary), `💬 Get a quote` (secondary) — **no "Book fitting"
  CTA unless/until an actual booking widget is provisioned for this tenant** (unlike HE Tyres,
  Smart Tyres has no `workers/booking` tenant yet — that's a build decision, see Open items).

### 2. Trust strip
Facts only, from the table above:
`⭐ 4.9 stars, 168 reviews` · `🛞 Over 1,000 part-worn tyres in stock` · `💷 New tyres from £25`
Do not add anything unconfirmed (no "TPMS specialists," no brand-stockist claims) — HE Tyres
earned its trust-strip claims from Nick's own knowledge of that business; here, only use what's
verified above.

### 3. Services — button-triggered modal cards (`data-modal` pattern from he-tyres)
Realistic card set for this business, built from confirmed facts + generic-but-true tyre
fitting knowledge (do not invent specifics per card beyond what's generically true of the trade):
- **Part-worn tyres** (featured/most-popular tag — this is their stated differentiator)
  "From £25. Fully inspected before they go on your car."
- **New tyres**
- **Tyre fitting & balancing** (generic, safe to state — it's what a tyre shop does)
- **TPMS** — only include if confirmed by a follow-up call/visit; otherwise drop this card
  rather than guess.

### 4. Brands / stock band
Skip or soften — HE Tyres names Continental & Bridgestone because that's confirmed fact about
their stock. No brand list is confirmed for Smart Tyres. If kept, frame around the *part-worn
+ new* mix rather than named brands: "A big range, checked properly before it goes on your car."

### 5. "Watch the work" / openness section
HE Tyres' lounge/coffee section works because Nick personally experienced it. **Do not invent
an equivalent experience for Smart Tyres** — either drop this section entirely, or replace
with a plain, honest line about workshop location/access once confirmed on a visit.

### 6. Booking
Omit, unless a `workers/booking` tenant is provisioned for this business before build (see
Open items — this is a real infrastructure decision, not just copy).

### 7. Gallery
Real photos only — bay, stock, forecourt, van if mobile confirmed. **Do not use stock photography
or the HE Tyres gallery images.** If no photos exist yet, use a small honest set of placeholder
tiles clearly marked for Nick to replace on a site visit, same convention used on `meridian-heating`
(`<!-- MIDJOURNEY SLOT -->`-style comment, but here it should be `<!-- PHOTO NEEDED: [description] -->`
since these should be real photos, not AI-generated).

### 8. Team
**Skip entirely if no names are known.** Do not invent an owner name or a caricature/photo
placeholder the way HE Tyres has "Meet Emma & Howie" — that section only works because those
are real people who agreed to be pictured. A tyre shop with an unnamed "the team" section reads
worse than no section at all.

### 9. Reviews
Pull 2–3 real review *themes* (speed, torque wrench, value) into short honest paraphrase —
not invented quotes attributed to named people. If exact review text can be sourced (Facebook/
Google, publicly visible), quote it directly with attribution as it appears publicly; otherwise
state the aggregate fact only: "4.9 stars from 168 reviews on Google."

### 10. Coverage / find-us
Address + a simple embedded map (Leaflet, same pattern as HE Tyres) to Hempsted Lane. No claimed
mobile radius unless mobile fitting is confirmed.

### 11. FAQ
Trade-generic, honest questions only — opening hours, part-worn tyre safety/inspection process,
whether they take walk-ins vs. booking. **Not** the TyreTrust/NeoBookworm FAQ set (cancellation,
switching, ownership) — wrong page for those questions entirely.

### 12. Contact
Phone-first (`tel:01452690710`), plus a simple enquiry form for anything else — mirrors HE Tyres'
`#contact` form pattern (name/phone/email/message, honeypot field, no tracking of "source"
campaign params — this isn't a lead-gen page).

---

## Design system
Reuse repo `/fonts.css` (self-hosted Playfair Display + DM Sans) unless a distinct pairing suits
the brand better once real photos are seen — HE Tyres deliberately used its own font pairing
(Fraunces + IBM Plex Sans + DM Sans) picked from their signage; if Smart Tyres has visible
signage/branding in any photo, colour-pick from that rather than defaulting to NeoBookworm navy/amber.
Accreditation badges: **do not add generic badges** (Gas Safe etc. don't apply) — only
`nb-insured` if confirmed, and only real ones if any trade body membership is confirmed.

---

## Open items before/during build

1. **Owner/staff names and a photo opportunity** — needs a phone call or a site visit. Without
   this, sections 8 (Team) is dropped and section 9 (Reviews) stays aggregate-only.
2. **Mobile vs. depot-only** — confirm before writing the hero. Affects CTA set and coverage section.
3. **TPMS / other services beyond tyres** — confirm before adding a service card for it.
4. **Photos** — none exist yet. Either a Nick site visit, or placeholder tiles marked for
   later replacement (never stock photography, never AI-generated for a real trading business).
5. **Booking widget** — a real decision, not a copy decision. If Nick wants this prospect to
   see booking working on their own site (not just the TyreTrust demo), a `workers/booking`
   tenant needs provisioning (`SLUG_CONFIG` entry, Google Calendar connection, migration if
   using `demoMode` initially). Recommend **starting without booking** — phone-first, like most
   real independent tyre shops — and offering booking as the upsell once they're a paying
   customer, matching the actual TyreTrust pricing model (Site first, Booking Engine second).
6. **Domain/URL for the pre-build** — decide whether this lives at
   `neobookworm.uk/smart-tyres-gloucester/` (matches the existing demo-site hosting pattern)
   before the letter is printed, since the QR-personalised banner and the letter's "I already
   built it" line need a working link on day one.
