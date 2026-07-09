# NeoBookworm.uk — Claude Code Instructions

This is the NeoBookworm.uk project — a web design business that builds sites for
local tradespeople at a fixed price of £49.99. This file tells Claude Code how the
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
├── guides.html             # Guides index page
├── privacy.html            # Privacy policy
├── terms.html              # Terms of service
├── WEBSITE-REFERENCE.md    # Implementation & troubleshooting reference
├── api/                    # Vercel serverless routes (contact email, intake, …)
├── intake-form.html        # Client onboarding form - replaced Tally form
├── nav-mobile.css          # Hamburger + full-screen menu (≤768px) for main site nav
├── nav-mobile.js           # Moves #primary-nav under <body> on mobile (WebKit fixed-position quirk)
├── header.html             # Shared header partial
├── include-header.js       # JS to inject shared header
├── guides/                 # Individual guide articles (see Guides section below)
│   ├── cold-calls.html
│   ├── do-i-need-a-website.html
│   ├── how-fast-is-my-website.html
│   ├── local-search-guide.html
│   ├── requesting-changes.html
│   ├── seo-guide.html
│   ├── site-is-live.html
│   ├── website-handover.html
│   ├── website-running-costs.html
│   ├── what-goes-on-a-trades-website.html
│   └── work-photos-guide.html
├── accreditations/
│   └── accreditation-badges.html   # Badge snippet library (see below)
├── Images/                 # Site images
├── netlify/                # Netlify configs (client demos; optional / legacy here)
├── netlify.toml            # Netlify build config (demos; main marketing site is Vercel)
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
- Both loaded via Google Fonts on every page (non-blocking `rel="preload"` pattern used site-wide)

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
| `nb-badge nb-dulux` | Dulux Select Decorator | Painters/decorators |
| `nb-badge nb-pda` | Painting & Decorating Association | Painters/decorators |
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
| Ridgecoat Decorators | Painter/decorator | Warm, portfolio-led. **Built & hosted on neobookworm.uk** (`/ridgecoat-decorators/`) — replaces the originally-planned "Sarah Brooks Decorating" |
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

**NeoBookworm.uk (main marketing site)** is served in production by the **Cloudflare Worker `neobookworm-uk`** (custom domains `neobookworm.uk` + `www.neobookworm.uk`; DNS zone on Cloudflare, registration at Krystal — verified 30 Jun 2026). The Worker serves static assets from the repo root plus all live `/api/*` and `/c/:slug` routes, whose handlers live under **`worker/routes/`** (entry: `worker/index.js`, config: root `wrangler.toml`). Set Worker secrets via `wrangler secret put` (e.g. `CF_API_TOKEN`, `R2_*`, `BRIDGE_SECRET`, `VERCEL_BRIDGE_URL`, `DASHBOARD_SECRET`, `ANTHROPIC_API_KEY`).

> **Vercel is NOT retired — it has one deliberate job.** Cloudflare Workers cannot open TCP SMTP connections, so all outbound onboarding email is sent by a thin Vercel function `api/send-email.js`, reached privately at **`bridge.neobookworm.uk`** (an alias on the `neo-bookworm-uk` Vercel project, git-connected to `main`). The Worker's `worker/_lib/email.js` POSTs to `${VERCEL_BRIDGE_URL}/api/send-email` with `BRIDGE_SECRET`. The Vercel project still builds the **entire** `api/` tree, but in production only `/api/send-email` is actually reached — the rest of `api/*` are dormant duplicates of `worker/routes/*` (the `worker/routes/` copies are the live ones). When editing a live API handler, edit the `worker/routes/` version; the `api/` copy only matters for the SMTP bridge. Set SMTP/`TO_EMAIL` secrets in **Vercel → Settings → Environment Variables**; set everything else as Worker secrets.

### Email sending (Vercel functions)

All outbound email from Vercel serverless functions (`api/contact.js`, `api/landing-enquiry.js`) uses **iCloud SMTP via Nodemailer**. Credentials are stored as encrypted Vercel environment variables and are confirmed working in production. Do not change the provider or credentials.

| Vercel env var | Value |
|---|---|
| `SMTP_HOST` | `smtp.mail.me.com` |
| `SMTP_PORT` | `587` (STARTTLS; `465` triggers `secure: true`) |
| `SMTP_USER` | `neobookworm@icloud.com` |
| `SMTP_PASS` | iCloud app-specific password (not the Apple ID password) |
| `TO_EMAIL` | `neobookworm@icloud.com` |

**Important for Cloudflare Workers:** iCloud SMTP (and any SMTP) cannot be used directly in a Cloudflare Worker — Workers cannot open TCP connections to port 587 or 465. Any Worker that needs to send email must use an HTTP-based approach. The recommended pattern is to POST to a thin Vercel function (e.g. `/api/notify-landing-enquiry`) that performs the SMTP send using the existing iCloud credentials. This keeps a single email-sending path and avoids adding a new email provider.

**Client demo sites** are separate static sites, deployed as individual Netlify projects. The permitted deploy command for those demos is:
```
netlify deploy
```

---

## What to avoid

- Do not add phone numbers to NeoBookworm.uk pages — contact from Nick is email only
- Do not use jargon in copy (SEO, hosting, SSL, etc.) — always use plain English equivalents
- Do not use real accreditation logos — use the CSS badge components from the badge library
- Do not modify `.env` or `.claude/settings.local.json`
- Do not create accounts or change sharing/access permissions

---

## Performance and SEO standards

Every page built for NeoBookworm.uk or any client demo site must follow these
standards from the first build. Do not wait for a PageSpeed audit to apply them.

### Fonts

- **Never load fonts from Google Fonts CDN.** Always self-host using woff2 files
  in `/fonts/` and a shared `fonts.css` with `@font-face` rules.
- Use `font-display: swap` on every `@font-face` rule.
- **fonts.css should only contain fonts used on every page** (Playfair Display
  and DM Sans). Fonts used on specific pages only must live in separate files
  and be loaded only on those pages:
  - `fonts-bebas.css` — Bebas Neue, loaded only on `index.html`
  - `fonts-cormorant.css` — Cormorant Garamond, loaded only on `intake-form.html`
  - Follow this pattern for any future page-specific font.
- Load `fonts.css` and all font CSS files **non-blocking** using the
  `media="print"` pattern — they only contain `@font-face` declarations and
  must never block rendering:
  ```html
  <link rel="stylesheet" href="/fonts.css" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="/fonts.css"></noscript>
  ```
- Add `<link rel="preload">` tags for the most-used weights. Preload the
  upright heading weight and body weight on every page. Additionally preload
  any italic weight used **above the fold** on that specific page:
  ```html
  <link rel="preload" href="/fonts/[upright-heading].woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/[body].woff2" as="font" type="font/woff2" crossorigin>
  <!-- index.html only — italic Playfair used in h1 <em>: -->
  <link rel="preload" href="/fonts/[italic-heading].woff2" as="font" type="font/woff2" crossorigin>
  ```
- The correct order is: woff2 preload tags first, then the deferred font CSS links.
- Add `<link rel="preconnect">` tags only if a third-party font CDN is
  unavoidably used (it should not be).

### Images

- **Every `<img>` tag must have explicit `width` and `height` attributes**
  matching the image's natural pixel dimensions. This prevents CLS (layout
  shift) by letting the browser reserve space before the file loads.
  CSS controls display size — HTML attributes tell the browser the aspect ratio.
  Example: `<img src="hero.webp" alt="..." width="1200" height="673">`
- **Use `srcset` and `sizes` for any image displayed significantly smaller than
  its natural dimensions.** Generate resized variants using sharp at build time.
  Rule of thumb: if the displayed width is less than 70% of the source width,
  a smaller variant is needed. Key patterns:
  - Logo (40px display, 1024px source): serve 80w and 160w variants
    `srcset="logo-80.webp 80w, logo-160.webp 160w" sizes="80px"`
  - Hero (full-width): serve a 640w variant for mobile, full size for desktop
    `srcset="hero-640.webp 640w, hero-1200.webp 1200w" sizes="(max-width:900px) 100vw, 820px"`
  - Demo screenshots in a 4-col grid: serve a 680w variant
    `srcset="demo-680.webp 680w, demo-1024.webp 1024w" sizes="(max-width:640px) 100vw, (max-width:900px) 50vw, 258px"`
- Use **WebP format** for all images. Only use JPG/PNG if WebP is not available
  for a specific source image.
- Add `loading="lazy"` to every image that is not in the initial viewport
  (i.e. below the fold). Add `loading="eager"` to above-the-fold hero images.
- Add `decoding="async"` to non-critical images.

### CSS loading

- **nav-mobile.css** (and any other non-critical CSS) must load non-blocking:
  ```html
  <link rel="stylesheet" href="nav-mobile.css" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="nav-mobile.css"></noscript>
  ```
- Inline critical above-the-fold CSS in a `<style>` block in `<head>` where
  possible. Non-critical CSS loads deferred as above.

### JavaScript

- All `<script>` tags that are not render-critical must use `defer` or `async`.
- Any JS that reads layout geometry (`offsetWidth`, `getBoundingClientRect`,
  etc.) after modifying the DOM must wrap the read in `requestAnimationFrame`
  to avoid forced reflow.
- Scroll reveal and animation JS must use `IntersectionObserver` with a
  fallback — never `setInterval` or synchronous scroll listeners.
- **Never call `getBoundingClientRect()` inside a loop.** Batch-read all
  rects into an array first, then loop over the stored values:
  ```js
  const rects = reveals.map(el => el.getBoundingClientRect());
  reveals.forEach((el, i) => { if (rects[i].top < vh) ... });
  ```
- **Never call `querySelectorAll` inside an `IntersectionObserver` callback.**
  Pre-build any index or sibling maps once at setup time using a `Map`,
  then look up pre-computed values inside the callback.
- The standard scroll reveal pattern for all NeoBookworm pages is:
  1. `document.documentElement.classList.add('js-reveal')` to opt in
  2. Pre-build a `siblingIndex` Map keyed by element before observing
  3. `IntersectionObserver` with `threshold: 0.01, rootMargin: '0px 0px 150px 0px'`
  4. Stagger delay of `siblingIndex * 80ms` via `setTimeout`
  5. On first `requestAnimationFrame`, batch-read rects and immediately
     reveal anything already in viewport
  6. Fallback: add `visible` to all elements if `IntersectionObserver`
     is not supported

### DOM

- Aim for a DOM depth of under 32 levels in hand-written HTML. Avoid deeply
  nested wrapper elements.
- Total element count should be under 500 for a typical 5-page site.
  (Third-party scripts like Vercel Analytics may add depth beyond your control
  — that is acceptable and not flagged as an error.)

### Page landmark

Every page must have a `<main>` element wrapping all content between the closing
`</nav>` tag and the opening `<footer>` tag:

```html
</nav>
<main id="main">
  ... all page content ...
</main>
<footer>
```

This is required for two reasons:
1. **Accessibility** — screen readers and keyboard users rely on landmark regions
   to navigate. Missing `<main>` costs points on PageSpeed Insights accessibility.
2. **PageSpeed accessibility score** — the `<main>` landmark is one of the checks
   that prevents a perfect 100 score. With it present, 100 is achievable on every page.

Every page must also have a skip link as the **first child of `<body>`**:
```html
<a class="skip-link" href="#main">Skip to content</a>
```

The `id="main"` on the `<main>` element is the skip link target — always include it.

### Head tag checklist

Every page must include, in this order:

```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Page Title | NeoBookworm (or Client Name)</title>
<meta name="description" content="...">  <!-- 140–155 characters; end with a CTA -->
<link rel="canonical" href="https://...">
<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:url" content="https://...">
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:image" content="https://...">  <!-- 1200×630 -->
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<!-- Favicons -->
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<!-- Self-hosted fonts: preload critical woff2 files first, then load CSS non-blocking -->
<link rel="preload" href="/fonts/[heading-weight].woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/[body-weight].woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/fonts.css" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="/fonts.css"></noscript>
```

**Meta description rule:** always 140–155 characters. Over 155 characters gets
truncated by Google. Under 140 characters leaves ranking signals on the table.
Every meta description must end with a clear call to action.

### Structured data (JSON-LD)

- NeoBookworm.uk pages include `WebDesigner` schema in a `<script type="application/ld+json">` block.
- Client demo/live sites should include `LocalBusiness` schema with the
  client's trade type, name, address (Wiltshire), and URL.
- Do not use `telephone` in schema on NeoBookworm.uk pages (email-only policy).

### Robots and sitemap

- Every deployed site must have a `robots.txt` allowing all crawlers.
- Every deployed site must have a `sitemap.xml` listing all public pages with
  their canonical URLs. Update `sitemap.xml` whenever a new page is added.

### PageSpeed targets

All pages should achieve, when tested on PageSpeed Insights (pagespeed.web.dev):
- **Performance (mobile):** 80+
- **Performance (desktop):** 95+
- **Accessibility:** 100 — achievable on every page with correct landmarks, alt text, contrast, and labels
- **Best Practices:** 95+
- **SEO:** 100

Also run **Chrome Lighthouse** on every page before considering it complete, with
device set to **Mobile**. To run it: open the page in Chrome → right-click →
Inspect → Lighthouse tab → select Mobile → Analyse page load. The mobile Lighthouse
run checks responsive layout, tap target sizes, and font legibility — all factors
Google uses in mobile ranking. Note: Google's standalone Mobile-Friendly Test tool
was retired in December 2023; Lighthouse is Google's recommended replacement.

The SEO score of 100 is achievable on every page with correct meta tags,
canonical URLs, image alt text, and structured data — always target it.

---

## Build status

**Important:** After completing any meaningful work in a session — building a demo site,
deploying a file, making significant edits — update the relevant row(s) in the tables
below before finishing. This file is the only persistent record of what has been done,
so keeping it current is essential. Do not wait to be asked.

### NeoBookworm.uk (main site)

| Page | Status | Notes |
|---|---|---|
| index.html | Complete | Accreditation badges + example thumbs; aftercare copy aligned with client handover (self-managed: Netlify basic + annual web address renewal). Site-wide header/footer link order standardised (nav: Home → How it works → Pricing → Examples → About → Contact; footer: Privacy → Terms). Footer matches About page (inner max-width, muted copy/links, amber border and link hover, vertical sep between legal links). |
| how-it-works.html | Complete | Stage 1: £49.99 scoped in sub-box; aftercare matches handover (renewal in £9.99; self-managed Netlify + renewal). |
| pricing.html | Complete | FAQ + aftercare cards aligned with handover (four inclusions in £9.99; Netlify transfer on cancel; ad-hoc £25/hr FAQ). |
| examples.html | Complete | Header/nav aligned with Home / How it works / Pricing (fixed bar, typography, CTA). Complete — accreditation badges upgraded; Hartley Plumbing card uses same browser-frame + JPG crop as index; real Midjourney images not yet integrated. Footer matches About page. |
| about.html | Complete | Header/nav aligned with Home / How it works / Pricing. Monthly maintenance shown as £9.99 (optional). |
| contact.html | Complete | Skip link + `<main id="main">`. Header/nav aligned with Home / How it works / Pricing. Three contact paths in accordion (single open): lazy intake iframe, Koalendar booking link (opens new tab: `https://koalendar.com/e/meet-with-nick-barrett`), quick message via **Write a message** → **Send message**. Jump links + URL hash sync; click outside `#contact-options` collapses + clears hash; `noscript` hides expand buttons so forms stay usable without JS. Email POSTs to `api/contact.js`; set SMTP / `TO_EMAIL` in Vercel env vars |
| privacy.html | Complete | Footer highlights Privacy on this page. Nav matches main site; policy `ul`/`li` rules scoped to `.content` so `#primary-nav` is not given dash bullets. CookieConsent v3.1.0 self-hosted in `/vendor/cookieconsent/` with config in `cookieconsent-config.js`. GA4 `G-FM1VG68GKQ` is opt-in (analytics denied by default until visitor accepts). Privacy includes “Manage cookie preferences” link. **Legal review Jul 2026:** expanded to 11 sections — added "Information you give me directly" (forms/uploads) + "When someone books an appointment" (booking widget; client=controller/Nick=processor, DVLA+Postcoder look-ups); rewrote the old "never share under any circumstances" line into an honest **sub-processor list** (Cloudflare/Google/Vercel/Apple/Postcoder+DVLA/Stripe); named TyreTrust as a trading name; reconciled the phone line with the TyreTrust postal→phone follow-up (+CTPS screening note). |
| terms.html | Complete | Same header/footer as rest of site (nav + mobile menu); footer highlights Terms on this page. **Legal review Jul 2026:** now 10 sections — build section made price-agnostic (pay-what-you-think starter → fixed-price build, no hard-coded £299.99); care plan reframed as tiered "Monthly plans (from £9.99)"; new "Booking, reminders and look-ups" section (third-party reliance, usage allowance/overage, client=controller/Nick=processor); named TyreTrust as trading name. |
| guides.html | Complete | Expanded guides index. Two sections (prospect / client). "Start here" pinned hero card above Section 1. 11 new guide cards added (6 prospect, 5 client). One card renamed to customer-perspective framing. Contact email updated to nick@neobookworm.uk. Section 2 restructured into three sub-groups: "Start with your setup" (2 single-width card-pick cards), "For everyone" (8 universal guides), "If you're managing your own site" (handover + requesting-changes). Requesting Changes card badged "Self-manage" with explicit tagline. Sub-section paragraphs have no max-width. |
| guides/cold-calls.html | Complete | Client-facing guide: cold call protection at launch. Blue tag. Read-next + last-updated footer added. |
| guides/do-i-need-a-website.html | Complete | Prospect-facing guide: Facebook vs website comparison. Amber tag. Read-next + last-updated footer added. |
| guides/how-fast-is-my-website.html | Complete | PageSpeed + Lighthouse mobile test walkthrough. Score panel present but commented out pending real scores. Read-next + last-updated footer added. |
| guides/local-search-guide.html | Complete | Google Business profile + local search explained. Amber tag. Read-next + last-updated footer added. |
| guides/requesting-changes.html | Complete | Client-facing: how to request ad-hoc changes, access via Netlify collaborator invite, pricing table. Read-next + last-updated footer added. |
| guides/seo-guide.html | Complete | What NeoBookworm builds in for search visibility. Blue tag. New section added: "What you can do on top of what I've built in". Read-next + last-updated footer added. |
| guides/site-is-live.html | Complete | Post-launch checklist for clients. Read-next + last-updated footer added. |
| guides/website-handover.html | Complete | Self-manage handover guide for clients taking over Netlify hosting. Read-next + last-updated footer added. |
| guides/website-running-costs.html | Complete | Honest cost breakdown: domain, hosting, care plan. Read-next + last-updated footer added. |
| guides/what-goes-on-a-trades-website.html | Complete | Renamed to "The 5 Things Customers Check Before Calling a Tradesperson" (URL unchanged). Read-next + last-updated footer added. |
| guides/work-photos-guide.html | Complete | How to take and send good work photos. Read-next + last-updated footer added. |
| guides/why-trade-websites-look-the-same.html | Complete | NEW. Prospect-facing. Why templates cost you customers. Amber — Getting started. 4 min read. |
| guides/checkatrade-vs-google-vs-website.html | Complete | NEW. Prospect-facing. What the three channels do and which you need. Amber — Getting found. 5 min read. |
| guides/wix-squarespace-or-custom.html | Complete | NEW. Prospect-facing. Honest comparison of DIY builders vs custom build. Amber — Getting started. 5 min read. |
| guides/how-long-does-it-take.html | Complete | NEW. Prospect-facing. Timeline from first contact to going live. Amber — Process. 3 min read. |
| guides/domain-names-explained.html | Complete | NEW. Prospect-facing. .co.uk vs .uk vs .com — both UK endings endorsed equally. Amber — Getting started. 3 min read. |
| guides/cold-calls-prospect.html | Complete | NEW. Prospect-facing variant of cold calls guide — what happens at launch and how Krystal WHOIS privacy prevents it. Amber — What to expect. 4 min read. |
| guides/first-10-google-reviews.html | Complete | NEW. Client-facing. How to get to 10 Google reviews with a simple ask-after-every-job process. Blue — Reviews. 4 min read. |
| guides/bad-reviews.html | Complete | NEW. Client-facing. Calm public response process; what Google will and won't remove. Blue — Reviews. 4 min read. |
| guides/van-quotes-invoices.html | Complete | NEW. Client-facing. Where to put the web address offline for maximum traffic. Blue — Going live. 3 min read. |
| guides/yearly-checklist.html | Complete | NEW. Client-facing. Month/quarter/annual rhythm for keeping the site fresh; included monthly change framing. Blue — Keeping it fresh. 4 min read. |
| guides/cancelling.html | Complete | NEW. Client-facing. No exit fees, 1 month notice, files and domain transferred. Blue — Transparency. 3 min read. |
| guides/your-site-care-plan.html | Complete | NEW. Client-facing. Full handover guide for £9.99/month care plan clients. Blue — Start here. 5 min read. What's covered, change requests, portal, what's theirs to keep, cancellation. Read-next: site-is-live + requesting-changes. |
| guides/your-site-self-manage.html | Complete | NEW. Client-facing. Full handover guide for self-managed clients. Blue — Start here. 5 min read. Running costs, domain renewal, Option A (ask Nick) / Option B (DIY) changes, ad-hoc pricing table. Read-next: site-is-live + website-handover. |
| intake-form.html | Complete | Submit path: `POST /api/intake-upload-session` (JSON) → browser **PUT** to R2 (presigned) → `POST /api/intake-finalize` — avoids Vercel 4.5 MB limit. Set **INTAKE_UPLOAD_SECRET** in Vercel; configure **R2 bucket CORS** (PUT/HEAD, `Content-Type`, site origin). Legacy `POST /api/submit-intake` (multipart) still available for small uploads. Same Notion/R2 pipeline as before. **Function consolidation:** the three intake endpoints (`intake-upload-session`, `intake-finalize`, `onboarding-intake`) now live in a single `api/intake.js` dispatcher (branches on `?action=`) to stay under Vercel's Hobby-plan 12-function limit; original URLs preserved via `vercel.json` rewrites, so frontend + landing-enquiry Worker unchanged. |
| plumbers.html | Complete | v3 overhaul. Campaign landing page for UK plumber cold-email outreach. Minimal header (logo only → neobookworm.uk — no site nav). Minimal footer (copyright + Privacy / Terms / Contact only). Sections: Hero → How It Works → Why It Matters (plumber-specific prose) → What Your Site Includes (6-card grid) → Social Proof (placeholder testimonial) → Pricing → Unified form. Form: contact-style accordion (like `contact.html`) — three numbered option cards with kickers, jump nav, expand CTAs, and panels containing shared contact fields (name / business / email) plus path-specific content (`tell_more` textarea; full inquiry note + redirect). Options 1 & 2 POST to `https://neobookworm-landing-enquiry.nickbarrett.workers.dev` (Cloudflare Worker); option 3 redirects to `/intake-form.html?name=…&biz=…&email=…&ref=plumbers`. Options 1 & 2 show thank-you in-place. All HTML comments mark TRADE-SPECIFIC sections for future trade-page search-and-replace. Added image placeholders + responsive two-column wrappers for Hero / Why / Pricing, plus step icons above numbers. Hero reframed (word-of-mouth → vulnerability → risk-free offer); eyebrow “For plumbers without a website”. Hero right column: Hartley Plumbing browser mock + demo note + hero CTA to `#start` (“Give me some information and see what I can build you”) (was limited-availability aside); demo note top aligned with eyebrow text baseline stack in two-column layout; `hero-plumber.webp` removed from page. **Built for plumbers:** featured card “Your business, not a template” (`#customCard`) opens modal with `/plumber-avatar-optimized.mp4` (lazy `src` + `play()` on card tap/touchend for iOS Safari; no native controls), expanded copy, close / overlay / Escape; replaces “Looks right on any screen”. **May 2026 copy overhaul (objections research):** hero headline reframed to identity-affirming parallel structure; hero subhead trimmed; FAQ expanded from 5 to 10 questions (added: tried-before / vs-Checkatrade / Google ranking / ownership-cancel / not-another-agency); Why It Matters: 110,000 search-volume figure added, ownership-vs-renting sentence added; Pricing: Checkatrade anchor line added, scarcity copy softened (warning triangle removed, “Limited Availability” removed from meta title); About Nick copy rewritten to remove implicit judgment. Page is nationwide — copy does not assume Wiltshire prospects. |
| electricians-switch.html | Complete | Duplicate of plumbers-switch.html. Hero h1/eyebrow/sub updated for electricians; demo mock → Swift Electrical; four situations card 4 → registration number; six feature cards + speed compare updated; honesty block updated; services/Gas Safe modals rewritten with electrician content (NICEIC); photos modal: job gallery only (four `/Images/gallery/service-*.webp` tiles, electrician captions; before/after tab removed); call modal → Swift Electrical; form source=electricians-switch-landing, ref=electricians-switch, trade=Electrician. nb-niceic CSS added. Not in sitemap. |
| electricians.html | Complete | Duplicate of plumbers.html. Electrician copy throughout: hero, Why It Matters, six feature cards, services/Gas Safe modals rewritten for electricians (NICEIC/NAPIT/ELECSA), FAQ updated, form source=electricians-landing, ref=electricians. nb-niceic badge CSS added. Photos modal: job gallery only (four `/Images/gallery/service-*.webp` tiles; before/after tab removed). Not in sitemap. |
| plumbers-switch.html | Complete | Realigned to honest example-led model (May 2026). **May 2026 objections-research overhaul applied:** Hero headline reframed to identity-affirming (“You’ve already taken the website step. Most plumbers haven’t.”); free site review promoted as hero-dominant promise with eyebrow + price-note; scarcity copy softened (“building up examples”); Hartley Plumbing browser mock replaces generic hero image; scroll-hint points to value not disqualification. Section order: Hero → Four situations → What you’d be switching to → Honesty block (moved here, reformatted as bullet list) → Cost comparison → How switching works → About Nick → FAQ → Form. Four situations: Card 2 Wix price removed (deferred to cost table); Card 4 rerouted to free site review instead of implying rebuild. “What you’d be switching to” H2 reframed to “The standard I build to”; speed compare label softened to range (20–40 typical) + “test your own site” PageSpeed link. Cost table: agency retainer widened to £40–250+; footnote replaced with break-even summary (year 1/3 figures, ~2.5yr break-even). Steps: time-commitment italic line added per step. About Nick: final paragraph rewritten — “I’m new” admission moved to FAQ only. FAQ: expanded to 9 items, reordered strongest-first (Google ranking / domain / photos / agency / contract / better? / how long / domain handover / trust); 2 new items added (timeline, agency domain awkwardness). Form: “Recommended” amber pill on Option 1; amber border on option-review article; URL field hidden for Option 3 via JS (intake form asks for it separately). All 6 modal dialogs and modal JS intact. Leaflet area map. Form wiring preserved: source plumbers-switch-landing, Worker endpoint, ref=plumbers-switch intake redirect. Not in sitemap until go-live. |
| gas-boiler.html | Complete | Duplicate of plumbers.html for gas engineers / boiler installers (no-website). Canonical /gas-boiler. Nationwide copy. Hero reframed around considered high-value purchase (£2–4k boiler, homeowners research 2–3 installers). Why It Matters rewritten (100k+ search figure, ownership-not-renting). Six feature cards: Gas Safe treated as mandatory; **6th card "Your business, not a template" + avatar video REPLACED with manufacturer-accreditation card+modal** ("Accreditations that win the job" → #modal rewritten, video/`plumber-avatar-optimized.mp4` removed, JS simplified, `.mfr-badge` CSS added — badge names Worcester Bosch/Vaillant etc. are illustrative placeholders). Services modal: tabs relabelled Full service / Boiler specialist / Emergency; all-rounder categories → Gas Appliances, Landlord & Safety (CP12), Controls & Efficiency; emergency list → no heat/hot water, gas leak (0800 111 999), boiler leak, CO alarm, landlord cert. **Photos modal: job-gallery only (before/after tab + slider + JS removed)** — boiler-replacement.webp + 3 gradient placeholders (boiler service / heating system / smart controls). Hero mock = browser-frame showing the real `Images/demo-meridian-heating.webp` screenshot (srcset 680w/1024w), linking to the live Meridian Heating demo (`/meridian-heating/`, opens new tab). FAQ trade-updated. form source=gas-boiler-landing, trade="Gas engineer / boiler installer", ref=gas-boiler. Not in sitemap. |
| gas-boiler-switch.html | Complete | Duplicate of plumbers-switch.html for gas engineers / boiler installers (has-website). Canonical /gas-boiler-switch. Nationwide. Same trade rewrites as gas-boiler.html: hero ("Most installers haven't"), four situations, speed-compare label, honesty block, six cards incl. manufacturer-accreditation card+modal (avatar video removed, JS simplified, `.mfr-badge` CSS added), services modal categories, emergency list, photos modal job-gallery-only (BA slider+JS removed). Hero mock = browser-frame showing the real `Images/demo-meridian-heating.webp` screenshot (srcset 680w/1024w), linking to the live Meridian Heating demo (`/meridian-heating/`, opens new tab). form source=gas-boiler-switch-landing, trade="Gas engineer / boiler installer", ref=gas-boiler-switch. Worker endpoint preserved. Not in sitemap until go-live. |
| painter-decorator.html | Complete | Duplicate of gas-boiler.html for painters & decorators (no-website). Canonical /painter-decorator. Nationwide copy. Hero reframed around **showing your work** (gallery/portfolio is the hook, not accreditation): "Word of mouth brings you the customers who already know your work. A website shows it to everyone who doesn't." Why It Matters rewritten (3.2M/month UK searches, in-your-home trust, win-on-quality-not-price). Six feature cards: (1) "The badges homeowners trust" — Dulux Select + PDA + insured (was Gas Safe); (2) area (kept); (3) services — interior/exterior/wallpaper/spray/murals/Artex; (4) **"Before-and-after that does the selling"** (the lead decorator card, peek tiles use real `/ridgecoat-decorators/images/gallery-*.jpg`); (5) tap-to-call (reworded, send-a-photo quote); (6) **"The prep that justifies your price"** (manufacturer-accreditation card reframed to prep/coats/materials = win without price war; `.mfr-badge` pills → Full prep / Two coats / Dulux Trade). Services modal tabs: Full service / Specialist / Landlord & commercial (emergency panel reframed to end-of-tenancy/rental refresh/offices/HMO). Photos modal → before-and-after gallery (Ridgecoat photos). gasSafe modal → Dulux/PDA/insured accreditation. Prep modal reframed. `.nb-dulux` + `.nb-pda` badge CSS added inline. Hero mock = browser-frame of the real `Images/demo-ridgecoat-decorators.webp` (srcset 680w/1024w) linking to live `/ridgecoat-decorators/` demo. FAQ trade-updated. form source=painter-decorator-landing, trade="Painter / decorator", ref=painter-decorator. Not in sitemap. |
| painter-decorator-switch.html | Complete | Duplicate of gas-boiler-switch.html for painters & decorators (has-website). Canonical /painter-decorator-switch. Nationwide. Same decorator rewrites as painter-decorator.html: hero ("Most decorators haven't"), four situations (work-not-shown gap), speed-compare label ("decorating site"), honesty block, six cards incl. before-and-after lead card + prep-justifies-price card, services modal tabs (Full service / Specialist / Landlord & commercial), photos modal before-and-after gallery (Ridgecoat photos), gasSafe→Dulux/PDA accreditation modal, prep modal. `.nb-dulux`+`.nb-pda` CSS added. Hero mock = browser-frame of `Images/demo-ridgecoat-decorators.webp` linking to live `/ridgecoat-decorators/`. form source=painter-decorator-switch-landing, trade="Painter / decorator", ref=painter-decorator-switch. Worker endpoint preserved. Not in sitemap until go-live. **Note:** fixed a dropped `</textarea>` introduced during the build (had swallowed 4 modals); original gas-boiler-switch.html unaffected. |
| intake-form.html | Complete | URL parameter pre-filling added (`?name=`, `?biz=`, `?email=`) — used when plumbers landing page option 3 redirects here. |

### Demo sites

| Site | HTML built | Images | Badges | Deployed | Netlify URL |
|---|---|---|---|---|---|
| Swift Electrical | No | No | No | No | — |
| Hartley Plumbing | Yes (`demos/hartley-plumbing/` — 5 pages: index/about/services/gallery/contact) | Real photos in `demos/hartley-plumbing/images/` | Yes (CSS Gas Safe + Insured + Workmanship) | **Hosted on neobookworm.uk** (ported from Neobookworm Demos; self-hosted fonts Fraunces + IBM Plex Sans + DM Sans) | `/demos/hartley-plumbing` |
| Ridgecoat Decorators (painter/decorator) | Yes (`ridgecoat-decorators/` — 5 pages: index/about/services/gallery/contact) | Real photos in `ridgecoat-decorators/images/` | Yes (CSS CSCS + Insured) | **Hosted on neobookworm.uk** (ported from Netlify; self-hosted fonts Albert Sans + Bricolage Grotesque) | `/ridgecoat-decorators` |
| Green Acre Landscapes | No | No | No | No | — |
| Apex Roofing | No | No | No | No | — |
| Hartwood Joinery | No | No | No | No | — |
| Wiltshire Pest Control | No | No | No | No | — |
| Clean Sweep Window Cleaning | No | No | No | No | — |
| Meridian Heating (gas/boiler) | Yes (`meridian-heating/index.html`) | Partial — `boiler-replacement.webp` reused; 3 gallery tiles are gradient placeholders awaiting Midjourney | Yes (CSS Gas Safe + Insured) | **Hosted on neobookworm.uk** (not Netlify) | `/meridian-heating` |

### Real client pitch sites (not the 8 fictional demos)

| Site | HTML built | Images | Deployed | Notes |
|---|---|---|---|---|
| HE Tyres (HEtyres Swindon) | Yes (`he-tyres/index.html`) | Real photos in `he-tyres/images/` | No | Real pitch site for H E Tyres Ltd (CH 13659688), owners Emma & Howard. Brand colour-picked from their signage (navy `#1a2336` + orange `#ec7325` + silver; `[HEtyres]` bracket logo). Sections: hero → trust strip → services (native `<dialog>` modals) → premium brands → "Watch the work, coffee in hand" lounge/openness section → work gallery → Meet Emma & Howard (their Facebook caricatures) → reviews (3 real + 98%/62 badge) → 15-mile coverage → FAQ → contact (call-for-quote; mobile/other enquiry POSTs to `api/he-tyres-enquiry.js` → `HE_TYRES_TO_EMAIL` default `nickbarrett@me.com`, optional email for Reply-To). Koalendar depot booking embed. Mobile calendar full-screen overlay (≤900px). `AutomotiveBusiness` schema, scroll-reveal, mobile nav. Self-hosted fonts in `he-tyres/fonts/` + `he-tyres/fonts.css`. Image paths use `/he-tyres/images/` for preview on neobookworm.uk (switch to `/images/` when deploying he-tyres folder as site root on hetyres.co.uk). Pitch model: pay-what-you-think one-off + £9.99/mo. TODO: deploy to hetyres.co.uk. Added to Prospects DB (`manual-hetyres-13659688`). |

### TyreTrust direct-mail campaign (standalone brand — tyre fitters only)

| Item | Status | Notes |
|---|---|---|
| TyreTrust landing page | Complete | `tyretrust/index.html` — standalone brand ("websites built only for tyre fitters"). Hero embeds live `/he-tyres/` iframe in a browser frame; live booking demo wired to the real `hetyres` booking widget; **interactive** reg/tyre/postcode look-up demos (vanilla JS, illustrative data); reminder + reschedule phone mock; auto-review + live-Google-rating mock; tyre-management day-view; pricing "stack" (£9.99 core + £6.99 booking + à-la-carte); pay-what-you-think block; HE Tyres proof; email CTA to `nick@tyretrust.uk`. Navy/orange/trust-green palette, reuses repo `/fonts.css`. **Deployed to production 5 Jul 2026 at `https://neobookworm.uk/tyretrust/`** (via `neobookworm-uk` Worker static assets). Pricing uses a **3-tier Good/Better/Best model** (The Site £9.99 pay-what-you-think · The Booking Engine £149/£19.99 · The Full Bay £349/from £49.99, allowance baked in) — Proposal A land-and-expand; cold outreach stays the simple £9.99 wedge, tiers are the grow-path. Feature cards labelled by tier. **Close proposal**: `tyretrust/proposal.html` (branded, noindex, live at `/tyretrust/proposal`) rendered to private `docs/TyreTrust-Proposal.pdf` (2-page, Chrome headless `--print-to-pdf`; has `[ your tyre business ]`/`[ date ]` placeholders). Not yet on its own `tyretrust.uk` domain — canonical/og/email temporarily switched to `neobookworm.uk` / `nick@neobookworm.uk` (5 Jul 2026) so nothing points at a dead URL; revert to `tyretrust.uk` once that domain + mailbox exist. Campaign pack (2 letters, postcard, phone script, sequence, tiered pre-build plan) in [docs/tyretrust-campaign.md](docs/tyretrust-campaign.md). **Booking demo uses a dedicated `tyretrust-demo` tenant (deployed), not `hetyres`** — new `demoMode` flag in `workers/booking` (see booking-widget row) makes the demo cost-free and clutter-free. **Jul 2026 landing-page effectiveness overhaul (pre-mailshot):** (1) reg/tyre look-up demos made honest — clickable sample-plate chips (HE12 TYR etc.), redesigned result card (bold plate + make/model/trim/year/colour/fuel line, styled after the booking widget's real `.vehicle-card`), visible "sample data — real thing pulls from DVLA" note (previously fabricated plausible data for any real plate with no disclosure); (2) mailto-only final CTA replaced with a real lead form (name/business/town/depot-mobile/email) POSTing to the landing-enquiry Worker with `source=tyretrust-landing`, `startOption=leave_it_with_me` (J1) — submissions flow into the standard dashboard/onboarding pipeline; mailto kept as secondary. Phone/SMS channel deliberately deferred (Nick won't expose personal number; revisit dedicated virtual number if campaign scales); (3) **TyreTrust has its own GA4 property `G-84ZR6LQ0GQ`** — `js/analytics-consent.js` generalised to accept per-page `window.__NB_GA_ID` override (falls back to site-wide `G-FM1VG68GKQ`); page loads shared CookieConsent banner (TyreTrust-recoloured) + fires consent-gated `generate_lead` on form success; (4) **PWYT-for-all-tiers pricing** (Nick's call, first-few-customers offer): all three tiers now "To build: pay what you think it's worth" (was £149/£349 on T2/T3), standalone pay-what-you-think section deleted and merged into pricing intro with honest launch framing ("new builds move to fixed prices once first sites live" — forward-looking, no fake "normally £299" anchor), fake "Most popular" badge → honest "My pick for most fitters", added "Not sure? Start with The Site" softener; pricing section now `band-mist`; dead `.pwyt`/`.grows`/`.stack` CSS removed. Items 1–3 deployed + committed (`ebc855b`); item 4 pending deploy. Remaining from the same review (not yet done): move to `tyretrust.uk` domain before mailing, HE Tyres proof section (photo/quote/Google link), FAQ block, self-testimonial reframe, hero iframe → tap-to-load facade. **Full Bay restructured to a pay-as-you-go add-on (8 Jul 2026, pending deploy):** the pricing section is no longer a 3-tier Good/Better/Best row. It's now **two monthly plans** (The Site £9.99 · The Booking Engine £19.99, featured) in a centred 2-col `.plans` grid, followed by **The Full Bay as a distinct navy add-on band** (`.fullbay` / `.packs-2` CSS). Full Bay **explicitly bolts on to The Booking Engine** (£19.99/mo) — it's an upgrade layer, not a replacement or a peer tier. The Full Bay itself has **no monthly fee**: it's prepaid top-up "packs" with a balance-meter visual (`.pack`/`.pack-meter`). Two packs: **Customer look-ups** £74.99 to start = 150 validations that **last 12 months**, then top up £30 = 50 more (also 12-month validity); **Text reminders** (optional) £14.99 to start = 150 texts, then top up **£10 = 100**, and **texts never expire**. Both validity rules stated on the packs and restated in the `tiers-note`. "Your day, on one page — the job dashboard" moved from Full Bay → **The Booking Engine** (tier bullet + feature-card price-tag). The **"Auto review requests + live Google rating"** line and its whole feature card (⭐ rating-live mock) **deleted entirely**. Header reworded ("Pick a plan. Add the clever bit when you're ready"); intro no longer implies everything is monthly; PAYG note explains graceful fall-back (site keeps working when look-ups run out, plate typed by hand). Copy/layout only — the credit-metering/Stripe build is still the deferred "Full Bay prepaid credit system" item below, whose design was **corrected 8 Jul 2026 to match this page** (two separate prepaid pools, look-ups 12-month validity, SMS never expire, no monthly floor on Full Bay itself — it rides on the £19.99 Booking Engine). **Split into two pages (8 Jul 2026, deployed):** on Gemini feedback that the 3-tier pitch was too much for a cold mailshot, `tyretrust/index.html` (the canonical page the mailshot QR codes point to, `?p=` banner + `MAILSHOT` codes live here) is now **simplified to two plans only** — The Site + The Booking Engine. Removed entirely: the Full Bay pricing band, the three look-up demo feature cards (reg/tyre/address, incl. their vanilla-JS demo logic and dead CSS), and the SMS-reminder mention (Reminders card is now email-only, "Included in The Booking Engine"). "Who you'd be dealing with" and the cancellation FAQ reworded to drop references to "the rest of the kit"/DVLA/tyre-size services. The original full-feature page (Full Bay band + all three look-up demos intact) now lives at **`tyretrust/full/index.html`**, `noindex`ed and not linked from anywhere — held in reserve for a future second-touch/upsell campaign to the same mailshot list once they've seen the site + booking running; its lead form is tagged `source=tyretrust-landing-full` to separate it in the dashboard. **Booking-section restructure (9 Jul 2026, page done + verified; Worker/D1 deploy DONE — see booking-widget row):** reworked "The Booking Engine → Online booking" (the strongest section) on BOTH `tyretrust/index.html` and `tyretrust/full/index.html`. (1) The live-demo panel's dark header is now a real toggle `<button class="try-head">` (was a non-interactive `.head` bar that looked clickable but wasn't) with an amber "Tap to try it →" CTA that flips to "Close ✕"; opening lazy-loads the iframe and reveals a full-width "✕ Close the demo" button (previously there was **no way to close** the demo once opened, and the old `#bookOpen` "Open… ↓" button's down-arrow misleadingly pointed at the Reminders section). New `#bookToggle`/`#bookClose`/`#bookPanel` IIFE replaces the old one-way loader; `aria-expanded` wired. (2) Copy reframed around dual benefit via a `.who-cols` grid — "For your customer" (books in a minute any hour, depot or come-to-me, instant confirmation) vs "For you" (jobs land while hands full, booked times vanish, drops into calendar). Heading → "Online booking — depot or mobile, day or night". (3) The demo itself will show BOTH depot and mobile once the `0009` migration + Worker guard are deployed (see booking-widget row) — copy now explicitly invites trying depot then mobile. **The page git-push and the Worker/D1 deploy must ship together**, or the page advertises mobile while the live widget stays depot-only and the "back to HE Tyres" link stays broken. **The Site dual-benefit (9 Jul 2026, page only):** applied the same `.who-cols` "For your customer" / "For you" treatment to the **The Site** tier-block (was a single generic 3-bullet list). Customer side = discovery/convenience (found on Google for "tyres near me", brands/reviews/hours at a glance, tap-to-call/directions); fitter side = ownership/credibility/always-on (front door that proves you're the real deal, your own web address "not rented from a platform", works alongside your Facebook and keeps working 24/7). Intro line + `desc` reworded to position the site as working **alongside their Facebook** (they'll likely have one) — gain-framed, no criticism of Facebook or of not having a site (per the no-prospect-criticism rule). "See a live example" HE Tyres box left **unchanged** (Nick's call — no risk to HE Tyres). **Reminders dual-benefit + interactive email/reschedule mock (9 Jul 2026, page only):** applied the same `.who-cols` split to "Reminders & reschedule links" (customer = friendly reminder/self-serve change/seconds to rebook; fitter = fewer no-shows/gap-becomes-rebook/no phone calls). Also removed the `full/index.html`-only `<small>(email — text upgrade in The Full Bay)</small>` suffix on the h4 (Nick's call — that framing undercuts the Full Bay pitch on the page where Full Bay is actually sold), so both files now carry identical copy. **Replaced the old SMS-bubble mock (`.phone`/`.phone-screen`/`.bubble`, dead CSS removed) with a genuinely interactive, fully client-side simulation** of the real reminder email + manage-booking page, since Nick wanted the customer to be able to click the link and see something close to the real thing — but with zero chance of ever touching a live booking. New `.email-mock` renders as a real inbox message (avatar, from/subject/time header, plain-text-style body mirroring the actual confirmation-email template's format/sign-off in `worker/routes/notify-booking.js`, i.e. `Hi [name],` → slot details → "Need to change or cancel?" → link → `— [businessName]`) with a real "Manage this booking →" button. Clicking it reveals `.manage-mock` — a mini browser-chrome frame (reuses the site's existing `.browser-bar`/`.dot` classes, fake URL `hetyres.co.uk/manage`) containing a dark navy panel that visually mirrors the real `renderManagePage` in `workers/booking/src/ui.js` (booking-card + amber Reschedule button + outline Cancel button). Reschedule reveals 3 fake time chips; picking one updates the booking-card time in place and shows a green "✓ Rebooked — HE Tyres notified automatically. That slot's filled again instead of sitting empty" message, directly demonstrating the "cancellation becomes a rebook" value prop. Cancel shows a neutral "Cancelled — a confirmation would be sent by email" message. A "↺ Reset the demo" link (only shown after an action) replays the whole thing. **Everything is local DOM class-toggling — no `fetch`, no iframe, no real manage token, no calls to the booking Worker at all** — cannot write a row, send an email, or touch HE Tyres's real booking data under any circumstance. A muted disclosure line above the mock ("It's a safe mock-up: nothing here touches a real booking") matches the site's existing honesty-disclosure convention used elsewhere (reg/tyre look-up demos, booking-demo hint). **Two CSS specificity bugs found + fixed during build:** `.mm-reset{display:block;...}` and `.mm-actions{display:flex;...}` both declared their own `display` *after* the shared `.frame-hidden{display:none}` utility in source order, so at equal specificity the component's own rule silently won and the elements never actually hid (reset link showed immediately; Reschedule/Cancel buttons stayed visible alongside the new time chips). Fixed by dropping the redundant `display:block` from `.mm-reset` (unnecessary — it already sits on its own line after a block-level `<p>`) and adding a scoped `.mm-actions.frame-hidden{display:none}` override (higher specificity, doesn't touch the shared utility). Verified interactively end-to-end (open → reschedule → pick slot → success → reset; open → cancel) on both `index.html` and `full/index.html`, desktop + mobile (375px), no console errors. **Follow-up refinements (same day, per Nick's feedback):** (1) **Reschedule now embeds the real live `tyretrust-demo` booking iframe** (same one used in the Booking Engine demo above, `#remindRescheduleFrame`, lazy-loaded) instead of an invented 3-chip time picker — Nick's point was it should look exactly like the real booking flow, and now it *is* the real booking flow, not a facsimile. Detected as complete via the exact same signal the real widget already sends: `window.parent.postMessage('booking-confirmed','*')` (confirmed at `workers/booking/src/ui.js:2076` and `:2487`, fired on both depot and mobile booking success). The `message` listener is scoped with `event.source===rescheduleFrame.contentWindow` so the separate Booking Engine iframe higher up the page can't cross-trigger it — verified both the positive case (synthetic `MessageEvent` with matching `source` correctly reveals the "✓ Rebooked" success state) and the negative case (same message from the *other* iframe's `contentWindow` is correctly ignored) via `preview_eval`. Old `.mm-chip`/`.mm-chip-row` CSS removed as dead code. (2) Email timestamp badge changed **08:02 → 20:02** (a "the night before" reminder logically arrives in the evening, not 8am — Nick caught a copy/timing inconsistency). (3) **Date is now evergreen**, computed client-side instead of hardcoded: `nextWorkingDayLabel()` returns tomorrow's date, skipping to Monday if tomorrow is Sunday (HE Tyres is closed Sundays per its `workingHours` config), formatted via `toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})` to match the existing "Thursday, 10 July" style — written into both the email body and the manage-mock booking-card on load, and captured as `origSlot` *after* that computation so Reset restores the correct dynamic value, not a stale string. (4) Appointment time changed **10:15am → 10:30am** throughout (subject, email body, booking-card) — the unrelated "10:15" in the separate "Your day, on one page" job-board mock (different job, different section) was deliberately left untouched. Re-verified all four changes together in preview (date computes correctly relative to system date, iframe loads and shows the real depot/mobile chooser, no console errors) on both files. |
| TyreTrust real logo integration | Complete | 9 Jul 2026. Replaced the placeholder CSS/SVG shield-and-TT mark (`logo-shield.svg`) with the real logo assets (`tyretrust/images/logo-mark.png` 512×512 tyre-tread badge + `logo-full.png` 1375×768 badge+wordmark lockup) across `tyretrust/index.html`, `tyretrust/full/index.html`, and `tyretrust/proposal.html`. **Note: `logo-full.png` has a baked-in opaque brushed-metal presentation background (confirmed via pixel check — corners are alpha 255, not transparent) and is NOT usable directly as a web asset** — only `logo-mark.png` is truly transparent (corners alpha 0). All live placements use `logo-mark` + HTML/CSS wordmark text instead. Generated via a one-off sharp script (favicons/PNG kept opaque-safe, content images as WebP): `favicon.ico`/`favicon-32x32.png`/`favicon-16x16.png`/`apple-touch-icon.png` (apple icon flattened onto white per Apple convention) regenerated from `logo-mark.png` — same filenames, so no `<link>` tag changes needed; `logo-mark-120.webp` (header + footer + proposal letterhead), `logo-mark-160.webp` (proof-section stamp), `logo-mark-480.webp` (hero watermark, referenced via CSS `background`, not `<img>`). Four placements: (1) header brand mark — direct swap, same 40×40 slot; (2) footer — small 26×26 mark added next to the copyright line (`.foot-brand`); (3) "Who you'd be dealing with" proof section — mark used as a wax-seal-style stamp bottom-right of Nick's photo (`.photo-wrap`/`.proof-stamp`, shrinks on `max-width:480px`); (4) hero — large low-opacity (`.07`) mark bled off the top-left corner via `.hero::after` background, `pointer-events:none`, hidden below `max-width:640px`. `proposal.html` letterhead reverted to icon+text pattern (same as header) rather than the broken `logo-full` lockup. Pre-existing unused `logo-mark-160.png`/`logo-mark-80.png`/`logo-shield-160.png`/`logo-shield-80.png` PNGs left in place (harmless, superseded, not referenced). Verified in preview at desktop + mobile (375px) — no console errors, no broken images, watermark/stamp hide correctly on small screens. |
| TyreTrust QR personalisation | Complete | Built 8 Jul 2026 for the 29-fitter mailshot (source list: `Local-no-website-tyre-fitters.xlsx`, "Mailshot Summary" tab, on iCloud Drive — NOT the "Avon Summary" first tab, which is just a regional rollup). Each of the 29 prospects gets a unique slug code (e.g. `kingswood-tyre-service`) generated from its business name, giving a personal merge URL. `tyretrust/index.html` reads `?p=` client-side (`URLSearchParams`), looks it up in an inline `MAILSHOT` object keyed by code (`business`/`town`/`first`), and reveals an amber banner under the header: *"Thanks for stopping by — I'd love to build a website like this one for [Business] in [Town]"* (reworded from an earlier "here's what this could look like" draft, which implied a preview that doesn't exist — this is an honest offer to build, not a mockup). First names are blank for now (not known) — if a `first` is later filled in for a code, the banner upgrades to include it automatically, no rebuild needed. Falls back invisibly (banner stays `hidden`) for no `?p=` or an unrecognised code, so the plain page still works for any other visitor. **Stannp mechanics**: no per-letter QR image generation needed on our side — Stannp's template designer supports a QR element bound to a CSV merge-field column, so one upload + one template does the whole 29-letter run automatically. **Tracking (added 8 Jul 2026):** each Merge URL now also carries `utm_source=mailshot&utm_medium=direct-mail&utm_campaign=tyretrust-29&utm_content=<code>`, so GA4 (TyreTrust's own property `G-84ZR6LQ0GQ`) attributes scans per business via standard Acquisition reports, filtering `utm_campaign=tyretrust-29` and breaking down by `utm_content`. A supplementary `mailshot_view` custom event (params `mailshot_code`/`business`/`town`) also fires, matching the existing consent-gated pattern used by `generate_lead` elsewhere on the page — fixed a real timing bug where it referenced `window.gtag` before the deferred `cookieconsent-config.js` module had run (now waits for the `load` event); note this event still only fires reliably for visitors with already-stored analytics consent, so the UTM parameters are the primary/reliable tracking signal, not the custom event. Merge CSV ready at [docs/tyretrust-mailshot-codes.csv](docs/tyretrust-mailshot-codes.csv) (`Business Name, Address, Phone, Region, Code, Merge URL`) — upload as the Stannp data source and bind the QR element to the `Merge URL` column. Full send-out checklist: [docs/tyretrust-mailshot-sendout.md](docs/tyretrust-mailshot-sendout.md). Verified in preview: banner renders correctly for a known code, stays hidden for no param and for an unrecognised code, no console errors. |

### Outstanding items

| Item | Priority | Notes |
|---|---|---|
| Booking widget (Koalendar replacement) | Medium | Reusable appointment-booking iframe — Cloudflare Worker + D1 (`bookings` DB) + Google Calendar API + GW SMTP. **Phases 1, 2, 2.5, 3, 4 and 5 done.** Live tenants: `hetyres` (reg lookup on) and `neobookworm` (navy/amber, embedded on contact.html). Phase 3 = per-tenant branding (logo via R2 upload, intro line, success copy); logo upload endpoint `api/booking-asset.js` reuses the existing intake R2 env vars (no new R2 config/CORS). Phase 5 = scheduling depth (buffer between appointments, daily lunch break, cancellation cutoff) — all in `calendar.js` slot maths + cancel/reschedule gates; defaults preserve prior behaviour. Phase 4 = form flexibility (phone/note enable+required toggles, custom questions, location type in-person/phone/video, and `addressLookup`: free postcodes.io validate+show-area by default, opt-in `full` = Postcoder house-level finder via Worker route `/:slug/address-lookup`, key `POSTCODER_API_KEY` server-side, 2 credits/UK lookup) — booking form is now config-driven; **migration `0004_form.sql` adds `address`/`postcode`/`custom_answers` columns and MUST be applied before deploying the Phase 4 Worker.** Note: `bookings.phone` is NOT NULL so `insertBooking` binds `phone ?? ''` (phone can be disabled per tenant). Tenant config lives in D1 (`tenants` table) + KV cache, edited via the dashboard **Bookings** tab (schema-driven form; Worker owns config + busts KV on write — `workers/booking/src/schema.js` + `admin.js`, proxied by `api/_lib/booking.js`). New env vars: Worker secret `ADMIN_SECRET`, Vercel `BOOKING_ADMIN_SECRET` (+ optional `BOOKING_WORKER_URL`). Production URL: `https://neobookworm-booking.nickbarrett.workers.dev/<slug>`. `booking.neobookworm.uk` not yet activated — the DNS-move blocker is now cleared (zone moved to Cloudflare 30 Jun 2026); just needs the `custom_domain` route added + redeploy. **`full` address-lookup UX hardening (30 Jun 2026, `ui.js`):** fixed empty picker `<select>` always showing (`.field select{display:block}` was overriding the `hidden` attr — added `.address-picker[hidden]{display:none}`); added discoverability hint + postcode placeholder; finder now distinguishes a real service failure (502 out-of-credit / 429 rate-limit / 500 / network) from a genuine no-match — service failures show an amber "finder unavailable, type your address" message (was the misleading "No addresses found") and auto-focus/highlight the manual Address box. Deployed. **3 Jul 2026 (`calendar.js`/`index.js`):** confirmed the cancel/amend `manageUrl` link was already sent for depot bookings (same `handleBook` → `sendConfirmationEmail` path as mobile) — no gap existed there. Added a "Booked: [date, time]" line to the Google Calendar event description for all three event-creation paths (depot `createCalendarEvent`, pending mobile `createPendingMobileEvent`, confirmed mobile `confirmMobileCalendarEvent`) via new `bookedAtLabel()`/`parseSqliteUtc()` helpers; the confirmed-mobile event preserves the *original* request time (`bookings.created_at`, passed through `handleConfirm`) rather than the confirm-time. Deployed via `wrangler deploy`. **Follow-up same day:** the actual gap was the *business* notification email to Howie (`nick@neobookworm.uk` / `HE_TYRES_TO_EMAIL`, "New booking at HE Tyres") — it had no amend/cancel link at all (customer confirmation emails already had one). Added the admin `manageUrl` (bypasses the customer cancellation cutoff) to `renderBusinessNotificationEmail` (depot bookings) and `renderMobileConfirmRequestEmail` (mobile request-to-business email, alongside the existing confirm link) in `worker/routes/notify-booking.js`; threaded `manageUrl`/`adminUrl` through `workers/booking/src/email.js` and the `handleBook`/`handleMobileRequest` call sites in `index.js`. Requires deploying **both** `neobookworm-booking` (workers/booking) and `neobookworm-uk` (root) Workers — done. Remaining: Phases 3–7 (branding, form flexibility, scheduling depth, email/reminders, service types) + portal self-service. Full build doc: [docs/booking-widget-build.md](docs/booking-widget-build.md). **Unified depot + mobile booking design** (HE Tyres — one journey, depot instant-confirm vs mobile request-then-confirm, postcode distance-band travel margins, shared single-resource calendar): [docs/booking-mobile-integration.md](docs/booking-mobile-integration.md) — **sessions M1 + M2 built and live**; M3/M4 not yet built, and M3 is re-scoped to become a workbench feature rather than a standalone view. **Booking workbench design** (Emma & Howie's staff day view — token-link page on the booking Worker: Today/Tomorrow/week list with pending mobile requests pinned top; per-booking `prep_status` new→stock_checked→ordered→ready + private `internal_note` (new migration); inline confirm/decline + admin cancel/amend reusing existing paths; optional 7am digest cron; tenant-generic via `workbenchEnabled`/`workbenchToken` in schema.js; sessions W1–W3, planned 3 Jul 2026, not yet built): [docs/booking-workbench.md](docs/booking-workbench.md). Cross-doc build order: W1 → W2 (± M4 — both touch schema.js + dashboard Bookings tab) → W3 → M3-as-workbench-feature (optional, volume-driven). **`demoMode` tenant flag (Jul 2026):** a tenant whose config has `"demoMode":true` runs the whole booking flow with no side effects — `getBusyPeriods`/`getBusyPeriodsRange`/`createCalendarEvent`/`deleteCalendarEvent` short-circuit (never call Google), and `handleBook` returns success **before** any DB write, slot lock, or email. Registered in `config.js` `BOOLEAN_CONFIG_KEYS`. Used by the `tyretrust-demo` tenant (migration `0008_tyretrust_demo.sql`) powering the TyreTrust landing-page booking demo — reusable, zero-cost, zero-clutter. **`handleMobileRequest` demoMode guard + demo mobile enabled (9 Jul 2026, pending deploy):** `handleMobileRequest` previously had **no** demoMode short-circuit (only `handleBook` did), so enabling mobile on a demo tenant would have written a junk `bookings` row and sent holding + confirm-request emails. Added a guard right after validation (mirrors `handleBook`): `if (config.demoMode)` returns `{ ok, name, arrivalLabel, date, arrivalWindow }` before any placement/DB/calendar/email. Migration **`0009_tyretrust_demo_mobile.sql`** then sets `tyretrust-demo` to `mobileBooking:true` + `addressEnabled/addressRequired:true` (address stays **free** postcodes.io area mode — `addressLookup` left unset, NOT `full`, so no Postcoder credits) and **removes `homeUrl`** (was the dead `https://tyretrust.uk/`, which rendered a `target=_parent` "← Back to HE Tyres" success link that navigated the parent page to a dead URL — the landing page's "back to HE Tyres errors" bug; the widget's own "Book another slot" button remains for reset). Depot origin + distance bands are hardcoded in `geo.js` (Swindon SN5 7SW) so no per-tenant geo config is needed. **Deploy order matters: deploy the Worker FIRST (guard), THEN apply `0009` + bust KV `tenant:tyretrust-demo`** — otherwise a demo mobile booking between the two steps would leak a real row/email. **DEPLOYED 9 Jul 2026** — `wrangler deploy` (Worker, version `4b2095e1`), config applied via targeted `d1 execute` (NOT `migrations apply` — see below), KV busted with `--remote`. Verified live: widget renders depot/mobile chooser, `MOBILE_BOOKING=true`, biz-meta "Depot or mobile fitting", no back-link. **Two latent bugs found during this deploy — both important:** (1) **The live `tyretrust-demo` config had LOST `demoMode` entirely.** 0008 created it with `demoMode:true`, but the row was later re-saved through the dashboard, and `schema.js` has **no `demoMode` field**, so the dashboard save silently stripped it — un-protecting the demo (every completed demo booking was writing a real `bookings` row + firing the business-notification email). Found + re-set `demoMode:true` via `d1 execute` during this deploy. ⚠️ **Any future dashboard save on a demo tenant will strip `demoMode` again** — either add `demoMode` to `schema.js` (as a Nick-scoped field) or make the dashboard preserve unknown keys, otherwise demo tenants keep losing their protection. (2) **Migration-tracking mismatch:** `wrangler d1 migrations list bookings --remote` shows BOTH `0008` and `0009` as "to be applied" — 0008 was applied out-of-band, so the runner never recorded it. Running `migrations apply` would re-run 0008's `INSERT OR REPLACE` and wipe the live row's dashboard drift back to the minimal baseline. **Do not use the migrations runner for the booking DB; apply config changes with targeted `d1 execute` + KV bust.** **Cleanup still pending:** 3 junk depot rows (gibberish test data — `xdf`/`dfgdg`/`NIc`) accumulated on `tyretrust-demo` while `demoMode` was missing; harmless now (demoMode short-circuits availability) but should be cleared — `DELETE FROM bookings WHERE slug='tyretrust-demo'` (blocked by the auto-mode mass-delete guard; run manually). **Mobile confirm crash fix + calendar reverse-sync (6 Jul 2026):** (1) Confirming a pending mobile request whose slot was already held by a confirmed booking threw an unhandled 1101 (the `UPDATE … status='confirmed'` hit the `uniq_bookings_active_slot` partial index). `confirmMobileBooking` now catches the UNIQUE error → `SlotTakenError`; `confirmPendingBooking` returns a new `slot_taken` outcome; email-link + workbench confirm paths + `renderConfirmPage` show a friendly "slot no longer free" page instead of crashing. (2) **Reverse-sync (Google Calendar → D1):** deleting an event in Google Calendar previously left the D1 row `confirmed`, orphan-locking the slot. New `getCalendarEventStatus` (calendar.js: 404/410 or `status:'cancelled'` ⇒ gone; transient errors ⇒ unknown/no-op so a Google blip can't mass-cancel), `getActiveBookingsWithEvents`/`listTenantSlugs` (db.js), and `reconcileCalendar(env, slug?)` (index.js) cancel any active future booking whose event is gone. Runs from a **cron trigger `*/10 * * * *`** across all real tenants (skips `demoMode`), plus a manual **"Sync calendar" button** in the workbench (`POST /:slug/workbench/reconcile`, workbench-key auth). Cancels (not hard-deletes) to preserve history; only frees on a definitive "gone". v1 handles deletes only (not calendar-side time edits). Deployed to **both** prod (`neobookworm-booking`) and staging (`neobookworm-booking-staging`); verified live (fake-event row → freed). **Bench-mode workbench overhaul + walk-in bookings (9 Jul 2026, DEPLOYED to prod, version after `7ab131b7`):** the workbench (`GET /:slug/workbench`) was redesigned from the flat translucent-card list into "Bench mode" — a live day dashboard (live clock, 4 stat tiles Today/Not-ready/Mobile/Free-today, glassy status-edged cards, reg-as-numberplate, now-line, reg/name/phone search, free-bench-time chips). **Render architecture changed:** `renderWorkbenchPage` (`ui.js`) now emits a shell + inlined `window.__WB__` JSON boot blob and a single client-side renderer draws all cards (used for both first paint and the 5-min auto-refresh) — replacing the old duplicated server+client render helpers (those `renderWorkbench*Html` functions + the `workbenchSectionTitle` import were removed). Tests assert the new client-render contract, not pre-rendered markup. **New capabilities:** (1) **Add a phone/walk-in booking** — `POST /:slug/workbench/walkin` creates a `confirmed` depot booking with `source='walkin'`, blocks the Google Calendar slot via the existing `createCalendarEvent`, and sends **no** customer email unless `sendNotify`+email given ("pencil it in" mode; name defaults to "Phone booking"). Free slots for the picker come from `GET /:slug/workbench/slots?date=` (`computeFreeSlots` → same availability path as the public widget; **note `filterAvailableSlots` returns wall-clock STRINGS, not `{start}` objects** — a first cut used `s.start` and rendered "now" for every slot). (2) **Enhance + notify later** — `POST /:slug/workbench/details` edits a walk-in's name/email/phone/reg/note (guarded to `source='walkin'` so online bookings can't drift), PATCHes the calendar event summary/description off the placeholder via new `patchCalendarEventDetails` (`calendar.js`), and optional `sendNotify` sends the confirmation (idempotent via `notify_state`). Supports Nick's flow: Howie pencils in, Emma adds detail + sends. (3) **Mark done / no-show** — `POST /:slug/workbench/outcome` sets `outcome` `done`|`no_show`|null (dims the card, shows a tag). Migration **`0010_workbench_bench.sql`** adds `source` (default `online`), `outcome`, `notify_state` (default `none`) to `bookings` — all internal, never customer-facing; applied to prod + staging DBs via MCP `d1_database_query` (⚠️ `wrangler d1 execute --remote` HANGS in the Claude Code shell — use the Cloudflare D1 MCP tool instead). `createCalendarEvent` also hardened to omit the attendee + Email line when a walk-in has no email yet. All demo/walk-in paths short-circuit on `demoMode`. Verified live: page renders Bench mode, data endpoint returns new fields, walk-in/outcome/slots endpoints correctly auth/validate/return. |
| TyreTrust "The Full Bay" prepaid credit system | Medium (design agreed 7 Jul 2026; **MODEL CORRECTED 8 Jul 2026 to match the landing page — the numbers below are authoritative, ignore any earlier "£74.99/month" framing**; **build deferred, NOT on critical path for the 29-letter mailshot**) | **Problem:** a flat monthly Full Bay is loss-making at real volume. The look-up + SMS plumbing costs Nick real money per customer; HE Tyres (one bay) is projected at 200–400 customers/month, so any flat fee loses money at scale (the busier the client, the bigger the loss). **Model agreed (prepaid credits, NOT overage billing — avoids "surprise bills", gives positive cash flow, mirrors Nick's own supplier prepay).** ⚠️ **Full Bay is NOT its own subscription and has NO monthly fee of its own.** It is a **pay-as-you-go add-on that bolts on to The Booking Engine** — the only recurring charge a Full Bay customer pays is the **£19.99/mo Booking Engine**; everything below is prepaid top-ups on top of that. There are **TWO SEPARATE prepaid pools, sold and metered independently** (this is the key correction — do NOT bundle SMS into the look-up credit): **(1) Look-up credits** ("a customer looked after" — hides the reg/tyre/address plumbing): **£74.99 to start = 150 credits**, then top up **£30 = 50 credits** (min top-up). Effective ~50p/credit on the starter, 60p on top-ups. **Look-up credits EXPIRE 12 MONTHS from the date of purchase** (each block dated separately; draw down oldest-first / soonest-to-expire first). There is **NO monthly reset and NO monthly bundle** — buy 150, they simply last up to a year; a quiet month costs nothing. **(2) SMS/text credits** (separate pool): **£14.99 to start = 150 texts**, then top up **£10 = 100 texts** (min top-up). **SMS credits NEVER EXPIRE.** The £30/£10 top-up floors exist because Stripe's fixed ~20p + ~1.5% fee makes tiny top-ups loss-making (a single sub-£10 top-up loses money; the floors keep the fee ~2%). **Auto-top-up** (saved card, opt-out) buys the minimum block at a low-balance threshold so Nick isn't manually crediting at 8pm — applies to each pool independently. **Supplier inventory reality maps cleanly onto the two pools:** Nick's **look-up** supplier credits expire ~1 year (hence the 12-month customer validity — buy look-up blocks nearer just-in-time; at very low volume a block could partially expire before it's drawn down, a year is generous but watch low-volume clients); **SMS** supplier credits never expire (hence customer SMS never expires — safe to buy in bulk). **Must-have mechanics when built:** (1) **graceful fall-back at zero** — the site keeps working, the reg field just stops auto-filling (manual entry), SMS silently doesn't fire; the booking flow must never break; (2) auto-top-up as above; (3) a **credit ledger PER POOL** (every debit + top-up + expiry logged, with per-block expiry dates for look-ups) for trust/dispute resolution; (4) low-balance alert per pool; (5) **expiry handling for look-up blocks** (expire unused look-up credits at 12 months; SMS never expire). **Cheap interim build** (before full self-serve): two balances in D1 + read-only balances on the portal + top-up via the **existing manual Stripe payment links** (already used for build payments) + hand-credit the balance; upgrade to self-serve **Stripe Checkout + webhook + auto-top-up** only once volume justifies it. **Stack touch-points:** D1 (per-tenant, per-pool balance + ledger tables with block-level expiry on look-ups), the booking Worker meters the reg/tyre/address look-ups and SMS sends separately (already gated per tenant in `workers/booking`), Stripe Checkout + webhook, portal UI. **Page copy DONE (8 Jul 2026, pending deploy):** pricing section restructured — Full Bay is now a **navy pay-as-you-go add-on band** (not a 3rd tier), explicitly "bolts on to The Booking Engine (£19.99/mo)", with two meter "packs": Customer look-ups (£74.99 to start, 150, **last a full year**, then £30 for 50) and optional Text reminders (£14.99 to start, 150, then **£10 for 100**, **never expire**). Validity rules stated on the packs + restated in the note. Only the **credit-system build itself** (D1 two-pool ledger with look-up expiry, Stripe Checkout/webhook, auto-top-up, portal balances, graceful fall-back) remains — deferred, not on the mailshot critical path. |
| Move `neobookworm.uk` DNS to Cloudflare | **Done** | **DNS zone is now hosted at Cloudflare** (verified 30 Jun 2026: authoritative nameservers `adam.ns.cloudflare.com` / `sydney.ns.cloudflare.com`). Domain **registration stays at Krystal** — only the zone moved. The live site `neobookworm.uk` + `www` are now served by the **Cloudflare Worker `neobookworm-uk`** (custom domains attached in the Worker's Domains tab), not Vercel. Email records (MX/SPF/DKIM/DMARC → Google Workspace) carried over unchanged. Remaining follow-on: add `custom_domain = true` routes to `workers/booking/wrangler.toml` (`booking.neobookworm.uk`) and `workers/landing-enquiry/wrangler.toml` (`api.neobookworm.uk`) and redeploy — the DNS blocker for both is now cleared. |
| Contact form provider | High | Tally dropped — replacement intake-form.html |
| landing-enquiry Notion DB | Done | Phase 4 cutover complete 14 May 2026. Worker at `https://neobookworm-landing-enquiry.nickbarrett.workers.dev`. `plumbers.html` + `plumbers-switch.html` POST to Worker. `api/landing-enquiry.js` on Vercel returns `410 Gone`. D1 + email background sync + retry cron (*/15) + daily digest (08:00 UTC) all running. Custom domain `api.neobookworm.uk` not yet activated — DNS migration to Cloudflare is now complete (zone moved 30 Jun 2026), so the only remaining step is to uncomment the `custom_domain` route in `wrangler.toml` and redeploy. Worker `.workers.dev` URL remains the live POST target until then. See `workers/landing-enquiry/README.md`. |
| Notion retired | Done | Session 0, 25 May 2026. D1 is the single source of truth. The landing-enquiry Worker no longer writes Notion (`src/notion.js` deleted; retry + digest crons only watch `email_status`). `NOTION_API_KEY` is no longer read by any code path and can be removed with `wrangler secret delete NOTION_API_KEY`. `landing_enquiries.notion_*` and `intake_submissions.notion_page_id` are vestigial (don't write, don't drop yet). `prospects.notion_id` stays as the opaque PK. Skills that *read* `notion_id` as an opaque ID still work; nothing writes to Notion. See [docs/onboarding-architecture-decisions.md](docs/onboarding-architecture-decisions.md). |
| SMTP env vars for contact form | Done | iCloud SMTP confirmed working in production. Credentials set in Vercel env vars — see Email sending section above. |
| Onboarding email template module | Done | Session 2, 25 May 2026. `api/_lib/templates.js` exports `ALLOWED_VARS`, `TEMPLATES`, `SUBJECTS`, `renderTemplate(id, vars)`. All templates fully implemented — 7 stubs (`J1-E2`, `J2-E2`, `J2-Branch-A`, `J3-E2`, `J4-E2`, `C3`, `C5`) written with full body copy 27 May 2026. Sign-off updated across all templates to Regards / Nick / nick@neobookworm.uk / websites, done properly. Mid-sentence line wraps fixed in all new and existing templates. Strict allowlist — unknown id/var/missing required all throw. Reference: `docs/onboarding-email-templates.md`. |
| Transactional send helper | Done | Session 3, 25 May 2026. `api/_lib/email.js` exports `sendTemplated({ slug, templateId, vars, to })`. Renders via `templates.js`, sends via Google Workspace SMTP (`smtp.gmail.com`:587, `GW_SMTP_USER`/`GW_SMTP_PASS`, From-name "Nick at NeoBookworm"), writes `email_log` row (enquiries DB). Returns `{ ok, error? }`; failed sends log `status='failed'` and do not throw. Lazy-initialised transport — separate from iCloud config in `api/contact.js`. Test script: `node scripts/send-test-email.mjs [recipient]`. |
| Portal Vercel function (skeleton) | Done | Session 4, 26 May 2026. `api/portal.js` — GET handler, looks up client by slug via `_lib/d1.js`, renders branded page (tagged template literals + `esc()` helper, self-hosted fonts). Handles stages `acknowledged`/`researching`/`building` with stage-appropriate panels; `dropped_out` has its own panel; all other stages → friendly placeholder (S7). Unknown slug → branded 404. Header with greeting, 6-step progress strip via `displayStage(stage)` (V3 mapping table), active-stage panel with formatted `next_action_by` deliver-by, useful-links block, conversation-history from `email_log` in human time. `vercel.json` rewrites added: `/c/:slug` → `/api/portal`, plus `/review`, `/handover`, `/google-business` sub-paths with `section` param. `noindex, nofollow` meta tag on all portal pages. |
| Dashboard "Clients" tab | Done | Session 5, 26 May 2026. `api/dashboard.js` — GET `client_list` (filter by stage/search, sort, paginated; days-in-stage + last-email subqueries), GET `client_detail` (full row + email_log); POST `client_promote` (calls `_lib/promote.promoteToClient`), `client_set_stage` (updates stage + `stage_changed_at`), `client_send` (auto-fills vars from client record, calls `_lib/email.sendTemplated`), `client_set_fields` (preview_url, live_url, current_url, domain, domain_status, plan, next_action_by, notes, etc.). `dashboard.html` — 4th tab button; `isTabAtRoot`/`goToTabRoot`/back-button all extended for `clients`; list view reuses `.table-wrap`/`.filter-btn`/`.pagination`; stuck rows (active stage >14 days) highlighted red; detail view: inline stage management, site URL fields, plan+notes, send-template panel (template select + deliver_by override + extra_vars textarea → `client_send` → confirm dialog → reload), "Open portal ↗" link, collapsible iframe of `/c/{slug}/`, email history. "Send personal note" opens Gmail compose URL (no SMTP). **27 May 2026 additions:** template dropdown shows human-readable labels (`CLIENT_TEMPLATE_LABELS` map + stub guard warning); email history rows have ✕ delete button (calls `email_log_delete` action, cross-slug safety check, removes row from DOM on success). |
| Portal action buttons (preview stage) | Done | 27 May 2026. `api/portal-action.js` — POST `/c/:slug/action` handles `approve` (→ `awaiting_payment`, notifies Nick via email, C3 sent manually from dashboard with Stripe link), `changes` (→ `revisions`, inserts `change_requests` row, sends C1), `decline` (→ `dropped_out`, sends C4). 30-second debounce via `last_action_at` on `clients`. Migration `0004_change_requests.sql` adds `change_requests` table + `last_action_at` column. `portal.js` updated: CSS button/form/confirm styles; interactive panel with confirm dialogs for approve/decline, inline textarea for changes; vanilla JS IIFE. `dashboard.js` `client_detail` now returns `change_requests`; `dashboard.html` renders them per-round below email history. `vercel.json` rewrite added for `/c/:slug/action`. |
| Portal guide catalogue overhaul | Done | 27 May 2026. `api/portal.js` `GUIDE_CATALOGUE` expanded from 10 to 17 entries. `guidesForClient()` now sorts by stage relevance (newest-unlocked first) before slicing to 3 — fixes bug where post-launch guides were buried behind acknowledged-era guides. Stage timings corrected: `site-is-live` moved to `preparing_live`; `cold-calls` moved to `preview_ready`; 7 new guides added (`how-long-does-it-take`, `domain-names-explained`, `cold-calls-prospect`, `van-quotes-invoices`, `first-10-google-reviews`, `bad-reviews`, `yearly-checklist`, `cancelling`). `STAGE_UNLOCK_LABELS` constant added; locked guides on "See all" page now show "Unlocks: [label]". Hook copy rewritten to be client-contextual. Hardcoded live-stage links updated to post-launch priorities. |
| Email body storage + portal email viewer | Done | 27 May 2026. D1 migration `0003_email_log_body.sql` adds `body TEXT` column to `email_log`. `api/_lib/email.js` updated: `_logEmail` stores rendered body; both call sites (sent + failed) pass body. `api/portal.js`: email history rows are now `<details>/<summary>` expandable elements — clients tap to read full email text. Existing rows (body NULL) show graceful "not stored before May 2026" message. `api/dashboard.js`: `client_detail` query includes body; new `email_log_delete` action (cross-slug safety check). `dashboard.html`: delete ✕ button wired on each email row. |
| Acknowledgement automation | Done | Session 6, 26 May 2026. `api/onboarding-intake.js` (now merged into `api/intake.js` as `?action=onboarding`; URL `/api/onboarding-intake` preserved via `vercel.json` rewrite — gated by `ONBOARDING_INTAKE_SECRET`) — accepts `{ source_type, source_id }` for `landing_enquiry` and `intake` only, calls `promoteToClient` + `sendAcknowledgement`; returns 422 for contact/prospect (manual path). `api/_lib/acknowledge.js` (new) — shared helper: `sendAcknowledgement(slug)` reads client row, picks J1-E1/J2-E1/J3-E1/J4-E1/J5-E1-quick per journey, calculates `deliver_by` (5 working days, stored to `next_action_by`), guards J2/J3 against missing `current_url`, dedup-checks `email_log` for prior `%-E1%` sent rows. `workers/landing-enquiry/src/intake.js` (new) — fire-and-forget Worker helper that POSTs `{ source_type: 'landing_enquiry', source_id }` to Vercel after every D1 insert; uses `ONBOARDING_INTAKE_SECRET`. `workers/landing-enquiry/src/index.js` (edit) — adds `ctx.waitUntil(notifyOnboardingIntake(env, id))` after the existing `syncEnquiry` call. `api/dashboard.js` (edit) — `client_promote` action now calls `sendAcknowledgement` on first promotion (`created: true`); returns `{ acknowledged, ack_reason, ack_error }`. Templates were already complete. Set `ONBOARDING_INTAKE_SECRET` in Vercel **and** Worker: `wrangler secret put ONBOARDING_INTAKE_SECRET`. |
| Original-submission panel in Clients tab | Done | 30 May 2026. `api/dashboard.js` `client_detail` action now also fetches the raw inbound row that the client was promoted from (helper `fetchClientSourceRecord` — selects from `landing_enquiries` / `intake_submissions` / `contact_enquiries` / `prospects` based on `clients.source_type`); returns it as `source_record` + `source_type`. `dashboard.html` `renderClientDetail` renders an "Original submission" `<details>` panel between the action buttons and the portal preview — section-grouped fields per source type (Business / Services & accreditations / About & story / Brand & design / Contact & operations / Domain / Uploads for intake; smaller summaries for the others). Intake opens by default (most data, needed during build); others collapsed. Photo + logo URLs render as links — thumbnail upgrade tracked in Todoist as a separate task. Missing-row and source-fetch-error fallbacks render gracefully. |
| J2 automated site audit pipeline | Done | 29 May 2026. Full pipeline live and tested. `api/_lib/audit.js` — core logic: crawls homepage + up to 4 key sub-pages (gallery, services, about etc.), converts `<img>` tags to `[Image: ...]` hints, calls claude-sonnet-4-6, stores in `clients.site_review_content`, emails Nick. `api/run-site-audit.js` — standalone Vercel route (auth via `ONBOARDING_INTAKE_SECRET`). `workers/landing-enquiry/src/intake.js` — triggers audit automatically after J2 ack. `api/dashboard.js` — `client_audit_run` action + `site_review_content` in editable fields. `dashboard.html` — Site Audit panel on J2 clients: Re-run, Test run (fixture, no Claude call), editable textarea, Save, Send review (saves + sends J2-E2 + sets stage to review_delivered). `api/portal.js` — J2 acknowledged panel says "I'm going through your current site now"; review_delivered panel shows review content inline; action buttons reworded for review context. `api/_lib/acknowledge.js` — J2 now uses 1 working day (was 5); `next_action_by` stored as ISO date (was human-readable, which crashed portal). `@anthropic-ai/sdk` added to package.json. Migration `0006_site_review.sql` run. `ANTHROPIC_API_KEY` set in Vercel. CF Worker deployed. Test mode auto-activates when business name contains literal `*Test*`. |
| Demo site Midjourney images | High | Desktop required; 8 hero images + full sets per site |
| Meridian Heating gallery images | Medium | Demo built & live at `/meridian-heating/`. 3 gallery tiles are gradient placeholders marked `<!-- MIDJOURNEY SLOT 1/2/3 -->` (600×800): boiler service, full heating system, smart thermostat. Drop real/Midjourney photos into `meridian-heating/images/` and swap the `.gal-ph` divs for `<img>`. examples.html card now uses a real browser-frame screenshot (`Images/demo-meridian-heating.webp` 1024×654 + `-680.webp`, captured via Playwright from the live local site) matching Swift/Hartley — regenerate these if the demo's hero changes. |
| Demo site builds | High | All 8 sites to build and deploy |
| Examples page image integration | Medium | Swap CSS previews for real images once generated |
| End-to-end pipeline test | Medium | Stripe Customer Portal, Vercel production checks, Netlify demo deploys, handover docs |
| Intake → R2 uploads (Vercel) | High | `neo-bookworm-uk`: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL + R2_ENDPOINT **or** R2_ACCOUNT_ID; EU buckets need `R2_JURISDICTION=eu` or `.eu.r2.cloudflarestorage.com`; `@aws-sdk/client-s3` ≥3.729 needs checksum options (implemented in getS3) |
| CSS minification build pipeline | Low | PageSpeed flags ~3 KiB savings from unminified inline CSS. Vercel gzip/brotli compresses delivery but does NOT minify inline `<style>` blocks at source. Fix requires a proper build step (e.g. PostCSS + cssnano, or Vite). Not worth introducing a build pipeline for 3 KiB alone — revisit when demo site pipeline is being designed, as a build step will be natural at that point. Do not hand-minify CSS manually. |
