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

**NeoBookworm.uk (main marketing site)** is deployed to **Vercel** (production: neobookworm.uk). Backend behaviour lives under `api/` as Vercel serverless routes (for example `api/contact.js` for the quick enquiry form, intake endpoints for onboarding). Set **`TO_EMAIL`**, SMTP, R2, and other secrets in the **Vercel project → Settings → Environment Variables**.

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
| how-it-works.html | Complete | Stage 1: £299 scoped in sub-box; aftercare matches handover (renewal in £9.99; self-managed Netlify + renewal). |
| pricing.html | Complete | FAQ + aftercare cards aligned with handover (four inclusions in £9.99; Netlify transfer on cancel; ad-hoc £25/hr FAQ). |
| examples.html | Complete | Header/nav aligned with Home / How it works / Pricing (fixed bar, typography, CTA). Complete — accreditation badges upgraded; Hartley Plumbing card uses same browser-frame + JPG crop as index; real Midjourney images not yet integrated. Footer matches About page. |
| about.html | Complete | Header/nav aligned with Home / How it works / Pricing. Monthly maintenance shown as £9.99 (optional). |
| contact.html | Complete | Skip link + `<main id="main">`. Header/nav aligned with Home / How it works / Pricing. Three contact paths in accordion (single open): lazy intake iframe, Koalendar booking link (opens new tab: `https://koalendar.com/e/meet-with-nick-barrett`), quick message via **Write a message** → **Send message**. Jump links + URL hash sync; click outside `#contact-options` collapses + clears hash; `noscript` hides expand buttons so forms stay usable without JS. Email POSTs to `api/contact.js`; set SMTP / `TO_EMAIL` in Vercel env vars |
| privacy.html | Complete | Footer highlights Privacy on this page. Nav matches main site; policy `ul`/`li` rules scoped to `.content` so `#primary-nav` is not given dash bullets. CookieConsent v3.1.0 self-hosted in `/vendor/cookieconsent/` with config in `cookieconsent-config.js`. GA4 `G-FM1VG68GKQ` is opt-in (analytics denied by default until visitor accepts). Privacy includes “Manage cookie preferences” link. |
| terms.html | Complete | Same header/footer as rest of site (nav + mobile menu); footer highlights Terms on this page. |
| guides.html | Complete | Guides index page. Nav includes Guides link. Self-contained CSS (no nav-mobile.css dependency). |
| guides/cold-calls.html | Complete | Client-facing guide: cold call protection at launch. Blue tag. |
| guides/do-i-need-a-website.html | Complete | Prospect-facing guide: Facebook vs website comparison. Amber tag. |
| guides/how-fast-is-my-website.html | Complete | PageSpeed + Lighthouse mobile test walkthrough. Score panel present but commented out pending real scores. |
| guides/local-search-guide.html | Complete | Google Business profile + local search explained. Amber tag. |
| guides/requesting-changes.html | Complete | Client-facing: how to request ad-hoc changes, access via Netlify collaborator invite, pricing table. |
| guides/seo-guide.html | Complete | What NeoBookworm builds in for search visibility. Blue tag. |
| guides/site-is-live.html | Complete | Post-launch checklist for clients. |
| guides/website-handover.html | Complete | Self-manage handover guide for clients taking over Netlify hosting. |
| guides/website-running-costs.html | Complete | Honest cost breakdown: domain, hosting, care plan. |
| guides/what-goes-on-a-trades-website.html | Complete | Content guide: what pages and copy a trades site needs. |
| guides/work-photos-guide.html | Complete | How to take and send good work photos. |
| intake-form.html | Complete | Submit path: `POST /api/intake-upload-session` (JSON) → browser **PUT** to R2 (presigned) → `POST /api/intake-finalize` — avoids Vercel 4.5 MB limit. Set **INTAKE_UPLOAD_SECRET** in Vercel; configure **R2 bucket CORS** (PUT/HEAD, `Content-Type`, site origin). Legacy `POST /api/submit-intake` (multipart) still available for small uploads. Same Notion/R2 pipeline as before. |
| plumbers.html | Complete | v3 overhaul. Campaign landing page for UK plumber cold-email outreach. Minimal header (logo only → neobookworm.uk — no site nav). Minimal footer (copyright + Privacy / Terms / Contact only). Sections: Hero → How It Works → Why It Matters (plumber-specific prose) → What Your Site Includes (6-card grid) → Social Proof (placeholder testimonial) → Pricing → Unified form. Form: contact-style accordion (like `contact.html`) — three numbered option cards with kickers, jump nav, expand CTAs, and panels containing shared contact fields (name / business / email) plus path-specific content (`tell_more` textarea; full inquiry note + redirect). Options 1 & 2 POST to `/api/landing-enquiry`; option 3 redirects to `/intake-form.html?name=…&biz=…&email=…&ref=plumbers`. Options 1 & 2 show thank-you in-place. All HTML comments mark TRADE-SPECIFIC sections for future trade-page search-and-replace. Added image placeholders + responsive two-column wrappers for Hero / Why / Pricing, plus step icons above numbers. Hero reframed (word-of-mouth → vulnerability → risk-free offer); eyebrow “For plumbers without a website”. Hero right column: Hartley Plumbing browser mock + demo note + hero CTA to `#start` (“Give me some information and see what I can build you”) (was limited-availability aside); demo note top aligned with eyebrow text baseline stack in two-column layout; `hero-plumber.webp` removed from page. **Built for plumbers:** featured card “Your business, not a template” (`#customCard`) opens modal with `/plumber-avatar-optimized.mp4` (lazy `src` + `play()` on card tap/touchend for iOS Safari; no native controls), expanded copy, close / overlay / Escape; replaces “Looks right on any screen”. |
| plumbers-switch.html | Complete | Sister landing page for plumbers who already have a website but may want to switch (slow / costly / hard to update). Same chrome as plumbers.html (`plumbers-switch.html`; canonical `/plumbers-switch`). Sections: Hero (`/Images/home-hero.webp`) → Self-check (5 questions) → What’s different (3 cards + illustrative PageSpeed compare) → Cost comparison table → How switching works (3 steps) → About Nick → FAQ → Form. Form: same contact-style accordion as `plumbers.html` (panels include optional `currentUrl`); paths `review_site_first` / `ready_to_switch` (textarea) / `intake_form` (`ref=plumbers-switch`). Source `plumbers-switch-landing`. Thank-you copy promises site review within one working day. Not in sitemap until go-live. |
| intake-form.html | Complete | URL parameter pre-filling added (`?name=`, `?biz=`, `?email=`) — used when plumbers landing page option 3 redirects here. |

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
| landing-enquiry Notion DB | Done | Phase 3 Worker (`workers/landing-enquiry`) deployed 14 May 2026. D1 insert + background Notion/email sync (Phase 2) + retry cron every 15 min + daily digest at 08:00 UTC (Phase 3). Both crons visible in Cloudflare dashboard. `api/notify-landing-enquiry.js` extended with `type:"digest"` path. Original `/api/landing-enquiry` on Vercel unchanged — still handles live traffic until Phase 4 cut-over. |
| SMTP env vars for contact form | Done | iCloud SMTP confirmed working in production. Credentials set in Vercel env vars — see Email sending section above. |
| Demo site Midjourney images | High | Desktop required; 8 hero images + full sets per site |
| Demo site builds | High | All 8 sites to build and deploy |
| Examples page image integration | Medium | Swap CSS previews for real images once generated |
| End-to-end pipeline test | Medium | Stripe Customer Portal, Vercel production checks, Netlify demo deploys, handover docs |
| Intake → R2 uploads (Vercel) | High | `neo-bookworm-uk`: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL + R2_ENDPOINT **or** R2_ACCOUNT_ID; EU buckets need `R2_JURISDICTION=eu` or `.eu.r2.cloudflarestorage.com`; `@aws-sdk/client-s3` ≥3.729 needs checksum options (implemented in getS3) |
| CSS minification build pipeline | Low | PageSpeed flags ~3 KiB savings from unminified inline CSS. Vercel gzip/brotli compresses delivery but does NOT minify inline `<style>` blocks at source. Fix requires a proper build step (e.g. PostCSS + cssnano, or Vite). Not worth introducing a build pipeline for 3 KiB alone — revisit when demo site pipeline is being designed, as a build step will be natural at that point. Do not hand-minify CSS manually. |
