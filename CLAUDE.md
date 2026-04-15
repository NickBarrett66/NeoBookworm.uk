# NeoBookworm.uk — Claude Code Instructions

This is the NeoBookworm.uk project — a web design business that builds sites for
local tradespeople at a fixed price of £299. This file tells Claude Code how the
project is structured and what conventions to follow when building or editing files.

---

## Project structure

```
NeoBookworm.uk/
├── index.html              # Home page
├── how-it-works.html       # Process page
├── pricing.html            # Pricing page
├── examples.html           # Demo site showcase
├── about.html              # About page
├── contact.html            # Contact page
├── privacy.html            # Privacy policy
├── terms.html              # Terms of service
├── WEBSITE-REFERENCE.md    # Implementation & troubleshooting reference
├── intake-form.html        # Client onboarding form - replaced Tally form
├── nav-mobile.css          # Hamburger + full-screen menu (≤768px) for main site nav
├── nav-mobile.js           # Moves #primary-nav under <body> on mobile (WebKit fixed-position quirk)
├── header.html             # Shared header partial
├── include-header.js       # JS to inject shared header
├── accreditations/
│   └── accreditation-badges.html   # Badge snippet library (see below)
├── Images/                 # Site images
├── netlify/                # Netlify function configs
├── netlify.toml            # Netlify build config
└── .claude/
    └── settings.local.json # Claude Code permissions
```

**Implementation and troubleshooting:** for a full map of pages, APIs, environment variables, and incident diagnostics, see [WEBSITE-REFERENCE.md](WEBSITE-REFERENCE.md).

---

## Design system

**Colours**
- Navy (primary background): `#0f1f3d`
- Amber (accent): `#f5a623`
- Amber hover: `#d4891a`
- White text on dark: `#ffffff`
- Body text on light: `#1a1a1a`

**Fonts**
- Headings: Playfair Display (serif)
- Body / UI: DM Sans (sans-serif)
- Both loaded via Google Fonts on every page

**Tone**
- Plain English throughout — no jargon
- "Appear in Google search lists" / "appear higher in Google search lists" — not "SEO" or "get found on Google"
- "Keep your site live" not "hosting"
- Contact is email-only — no phone numbers on NeoBookworm.uk itself

---

## Accreditation badges

A ready-made badge component library is at:
```
accreditations/accreditation-badges.html
```

When building any client demo site that needs accreditation badges, read this file
first and copy the CSS block (everything between the two
`BADGE CSS — COPY EVERYTHING BELOW THIS LINE` and `END OF CLIENT-SITE CSS` comments)
into the client site's `<style>` block.

Then use the HTML snippets from the same file for whichever badges apply to that trade.

**Badge class reference**

| Class | Badge | Used for |
|---|---|---|
| `nb-badge nb-gassafe` | Gas Safe Register | Plumbers, heating engineers |
| `nb-badge nb-niceic` | NICEIC | Electricians |
| `nb-badge nb-partp` | Part P | Electricians |
| `nb-badge nb-trustmark` | TrustMark | Any trade |
| `nb-badge nb-fensa` | FENSA | Window/door installers |
| `nb-badge nb-checkatrade` | Checkatrade | Any trade with reviews |
| `nb-badge nb-which` | Which? Trusted Trader | Any trade |
| `nb-badge nb-chas` | CHAS | Heating, roofing contractors |
| `nb-insured` | Fully Insured | Any trade |

**Dark background variant**
Add class `dk` to any badge element when placing it on the navy `#0f1f3d` background:
```html
<div class="nb-badge nb-gassafe dk">...</div>
<div class="nb-insured dk">...</div>
```

**Placeholder values to swap for real clients**
- Gas Safe reg number: replace `000000` with client's actual 6-digit number
- Checkatrade score: replace `4.9 · 94 reviews` with client's real figures
- On demo sites, leave placeholders as-is — they are clearly fictional

---

## Client demo sites

Eight demo trade sites are being built. Each is a standalone HTML/CSS/JS site
deployed to Netlify. The sites are:

| Site | Trade | Notes |
|---|---|---|
| Swift Electrical | Electrician | NICEIC + Part P badges |
| Hartley Plumbing | Plumber | Gas Safe badge, giant phone number hero |
| Sarah Brooks Decorating | Painter/decorator | Warm, portfolio-led |
| Green Acre Landscapes | Landscaper | Organic, earthy |
| Apex Roofing | Roofer | Bold, problem-first |
| Hartwood Joinery | Carpenter | Heritage, craft-led |
| Wiltshire Pest Control | Pest control | — |
| Clean Sweep Window Cleaning | Window cleaning | — |

Each demo site should:
- Include a demo banner at the top: "This is a free demo site built for [Business Name].
  Like what you see? Get your own → neobookworm.uk"
- Include trade-appropriate accreditation badges from the badge library above
- Use fictional but believable Wiltshire business details (Swindon, Marlborough,
  Royal Wootton Bassett, Chippenham, Calne, Devizes)
- Include a static contact form that shows a success message on submit (no real backend)
- Be deployable to Netlify as a static site

---

## Deployment

Sites are deployed via the Netlify CLI. The permitted deploy command is:
```
netlify deploy
```

NeoBookworm.uk itself is deployed to Vercel (production site: neobookworm.uk).
Client demo sites are deployed as separate Netlify sites.

---

## What to avoid

- Do not add phone numbers to NeoBookworm.uk pages — contact from Nick is email only
- Do not use jargon in copy (SEO, hosting, SSL, etc.) — always use plain English equivalents
- Do not use real accreditation logos — use the CSS badge components from the badge library
- Do not modify `.env` or `.claude/settings.local.json`
- Do not create accounts or change sharing/access permissions

---

## Build status

**Important:** After completing any meaningful work in a session — building a demo site,
deploying a file, making significant edits — update the relevant row(s) in the tables
below before finishing. This file is the only persistent record of what has been done,
so keeping it current is essential. Do not wait to be asked.

### NeoBookworm.uk (main site)

| Page | Status | Notes |
|---|---|---|
| index.html | Complete | Accreditation badges + example thumbs; aftercare copy aligned with client handover (self-managed: Netlify basic + annual web address renewal). Site-wide header/footer link order standardised (nav: Home → How it works → Pricing → Examples → About → Contact; footer: Privacy → Terms → Contact). |
| how-it-works.html | Complete | Stage 1: £299 scoped in sub-box; aftercare matches handover (renewal in £19.99; self-managed Netlify + renewal). |
| pricing.html | Complete | FAQ + aftercare cards aligned with handover (four inclusions in £19.99; Netlify transfer on cancel; ad-hoc £25/hr FAQ). |
| examples.html | Complete | Header/nav aligned with Home / How it works / Pricing (fixed bar, typography, CTA). Complete — accreditation badges upgraded; Hartley Plumbing card uses same browser-frame + JPG crop as index; real Midjourney images not yet integrated |
| about.html | Complete | Header/nav aligned with Home / How it works / Pricing. Monthly maintenance shown as £19.99 (optional). |
| contact.html | Complete | Header/nav aligned with Home / How it works / Pricing. Complete — intake form kept; simple email form added; Netlify function created; SMTP env vars needed in Netlify dashboard |
| privacy.html | Complete | Footer highlights Privacy on this page. |
| terms.html | Complete | Same header/footer as rest of site (nav + mobile menu); footer highlights Terms on this page. |
| intake-form.html | Complete | Submit path: `POST /api/intake-upload-session` (JSON) → browser **PUT** to R2 (presigned) → `POST /api/intake-finalize` — avoids Vercel 4.5 MB limit. Set **INTAKE_UPLOAD_SECRET** in Vercel; configure **R2 bucket CORS** (PUT/HEAD, `Content-Type`, site origin). Legacy `POST /api/submit-intake` (multipart) still available for small uploads. Same Notion/R2 pipeline as before. |

### Demo sites

| Site | HTML built | Images | Badges | Deployed | Netlify URL |
|---|---|---|---|---|---|
| Swift Electrical | No | No | No | No | — |
| Hartley Plumbing | No | No | No | No | — |
| Sarah Brooks Decorating | No | No | No | No | — |
| Green Acre Landscapes | No | No | No | No | — |
| Apex Roofing | No | No | No | No | — |
| Hartwood Joinery | No | No | No | No | — |
| Wiltshire Pest Control | No | No | No | No | — |
| Clean Sweep Window Cleaning | No | No | No | No | — |

### Outstanding items

| Item | Priority | Notes |
|---|---|---|
| Contact form provider | High | Tally dropped — replacement intake-form.html |
| SMTP env vars for contact form | High | Set TO_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in Netlify dashboard to activate email sending (Brevo recommended) |
| Demo site Midjourney images | High | Desktop required; 8 hero images + full sets per site |
| Demo site builds | High | All 8 sites to build and deploy |
| Examples page image integration | Medium | Swap CSS previews for real images once generated |
| End-to-end pipeline test | Medium | Stripe Customer Portal, Netlify deploy, handover docs |
| Intake → R2 uploads (Vercel) | High | `neo-bookworm-uk`: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL + R2_ENDPOINT **or** R2_ACCOUNT_ID; EU buckets need `R2_JURISDICTION=eu` or `.eu.r2.cloudflarestorage.com`; `@aws-sdk/client-s3` ≥3.729 needs checksum options (implemented in getS3) |
