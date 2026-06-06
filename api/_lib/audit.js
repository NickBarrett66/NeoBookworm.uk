'use strict';

// Site audit helper — NeoBookworm J2 (free site review) pipeline.
//
// Called by:
//   api/run-site-audit.js   — standalone Vercel route (Worker-triggered or manual curl)
//   api/dashboard.js        — client_audit_run action (dashboard button)
//
// Modes (via opts):
//   testMode: true   — skips Claude entirely, returns TEST_FIXTURE. Zero API cost.
//                      Also auto-activates when business_name contains "test".
//   dryRun:   true   — calls Claude for real, returns result in response,
//                      does NOT write to D1 and does NOT email Nick.
//   (default)        — calls Claude, stores in D1, emails Nick.
//
// Required Vercel env vars:
//   ANTHROPIC_API_KEY   — Anthropic API key (claude-sonnet-4-6)
//   GW_SMTP_USER        — nick@neobookworm.uk (Google Workspace SMTP user)
//   GW_SMTP_PASS        — Google Workspace app-specific password
//   CF_API_TOKEN        — Cloudflare API token with D1:Edit (shared with d1.js)

const { queryD1, enquiriesDb } = require('./d1');

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

const TEST_FIXTURE = `[TEST MODE — Claude was not called. This is a fixture to verify the pipeline.]

What's working:
- Clear phone number above the fold — easy for mobile visitors to tap
- Services are listed with enough detail that Google can index them properly
- A handful of genuine customer photos break up the text

What I'd change:
- The homepage loads in around 4 seconds on a phone because the hero image hasn't been compressed — a quick run through TinyPNG would cut that to under 2
- There's no mention of which areas are covered; a prospect in a neighbouring town can't tell if you serve them
- The contact form asks for too many fields; most people give up on anything over name, number, message
- Google can't read the services list because it's inside a graphic file rather than text

Quick wins:
- Add a short area sentence near the top: "Covering [Town], [Town] and surrounding areas"
- Compress the hero image (TinyPNG is free and takes 30 seconds)

Verdict: Worth a rebuild. The structure isn't the problem — the bones are fine — but the execution is dragging it back on mobile speed and on Google's ability to read it. Not an emergency if the phone's still ringing, but a clean build would outperform this on both counts.`;

// ---------------------------------------------------------------------------
// HTML → plain text
// ---------------------------------------------------------------------------

/**
 * Extract a text hint from an <img> tag's attributes.
 * Returns e.g. "[Image: Kitchen repaint]" or "[Image: gallery-thumb.jpg]".
 */
function imgHint(tag) {
  const alt = (tag.match(/\balt=["']([^"']+)["']/i) || [])[1];
  if (alt && alt.trim()) return `[Image: ${alt.trim()}]`;
  const src = (tag.match(/\bsrc=["']([^"']+)["']/i) || [])[1];
  if (src) {
    const file = src.split('/').pop().split('?')[0];
    if (file) return `[Image: ${file}]`;
  }
  return '';
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    // Convert <img> tags to readable hints before stripping so Claude knows images exist
    .replace(/<img\b[^>]*>/gi, tag => ' ' + imgHint(tag) + ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000); // reduced per-page limit when crawling multiple pages
}

// Keywords that identify worthwhile sub-pages to include in the audit.
// Matched case-insensitively against the URL path.
const KEY_PAGE_PATTERNS = [
  /galler/i, /portfolio/i, /work/i, /projects/i,
  /service/i, /about/i, /contact/i, /testimonial/i, /review/i,
];

/**
 * Extract unique internal links from raw HTML, limited to the same origin.
 * Returns absolute URL strings.
 */
function extractInternalLinks(html, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const seen = new Set();
  const links = [];
  const re = /href=["']([^"'#?]+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const abs = new URL(m[1], baseUrl).href;
      if (abs.startsWith(origin) && !seen.has(abs) && abs !== baseUrl) {
        seen.add(abs);
        links.push(abs);
      }
    } catch { /* skip malformed hrefs */ }
  }
  return links;
}

/**
 * Pick up to maxPages sub-pages worth fetching, prioritising key-page patterns.
 */
function selectSubPages(links, maxPages = 4) {
  const scored = links.map(url => {
    const path = new URL(url).pathname.toLowerCase();
    const score = KEY_PAGE_PATTERNS.findIndex(p => p.test(path));
    return { url, score: score === -1 ? 999 : score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, maxPages).map(s => s.url);
}

// ---------------------------------------------------------------------------
// Page fetch (single)
// ---------------------------------------------------------------------------

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NeoBookwormBot/1.0; +https://neobookworm.uk)' },
    });
    clearTimeout(timer);
    if (!resp.ok) return { html: '', error: `HTTP ${resp.status}` };
    return { html: await resp.text() };
  } catch (err) {
    clearTimeout(timer);
    const msg = err.name === 'AbortError' ? 'timed out' : err.message;
    return { html: '', error: msg };
  }
}

// ---------------------------------------------------------------------------
// Multi-page crawl
// ---------------------------------------------------------------------------

/**
 * Fetch the homepage plus up to 4 key sub-pages.
 * Returns a combined plain-text string labelled by page, capped at ~16 000 chars.
 */
async function fetchSiteText(rootUrl) {
  const { html: homeHtml, error: homeError } = await fetchHtml(rootUrl);

  if (homeError && !homeHtml) {
    return { text: `[Could not fetch ${rootUrl}: ${homeError}]` };
  }

  const pages = [{ url: rootUrl, label: 'Homepage', html: homeHtml }];

  // Discover and fetch sub-pages in parallel
  const subUrls = selectSubPages(extractInternalLinks(homeHtml, rootUrl));
  const subResults = await Promise.all(subUrls.map(url => fetchHtml(url).then(r => ({ url, ...r }))));
  for (const { url, html } of subResults) {
    if (html) {
      const path = new URL(url).pathname || '/';
      pages.push({ url, label: path, html });
    }
  }

  const combined = pages
    .map(p => `--- ${p.label} (${p.url}) ---\n${stripHtml(p.html)}`)
    .join('\n\n')
    .slice(0, 16000);

  return { text: combined, pageCount: pages.length };
}

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

async function callClaude({ business, url, pageText, pageCount = 1 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are helping Nick Barrett, who runs NeoBookworm.uk — a web design service for UK tradespeople at £49.99. Nick will review your output before sending it to the prospect.

Write in Nick's voice: plain English, direct, no jargon, no sales pressure. If the site is genuinely fine, say so. If not, be specific about what's wrong and what would fix it.

Produce a plaintext review (no markdown headers, no asterisks — use dashes for lists). Aim for 300–400 words. Cover:
1. What's working (1–3 things genuinely worth keeping)
2. What you'd change (2–4 specific, reasoned points)
3. One or two quick wins — changes that would make a real difference now without a full rebuild
4. Verdict: rebuild from scratch or just tweak? Be honest and specific.

The prospect will read this on their private portal page. It should feel like honest advice from a professional peer, not a pitch to sell them a new site.

Important note about the page content you are given: images cannot be visually rendered in this process. Instead, each image on the page is represented as a text placeholder like [Image: filename.jpg] or [Image: alt text]. These placeholders confirm the image EXISTS on the page — treat them as real images that a visitor would see. Do not suggest images are missing or broken just because you cannot see them visually.`;

  const userPrompt = `Business: ${business}
Website: ${url}
Pages crawled: ${pageCount}

Page content (extracted text — ${pageCount > 1 ? 'homepage + key sub-pages' : 'homepage only'}):
${pageText}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return message.content[0].text;
}

// ---------------------------------------------------------------------------
// Nick notification
// ---------------------------------------------------------------------------

async function notifyNick({ slug, business, url }) {
  const nodemailer = require('nodemailer');
  const user = process.env.GW_SMTP_USER;
  const pass = process.env.GW_SMTP_PASS;
  if (!user || !pass) {
    console.warn('[audit] GW_SMTP_USER/PASS not set — skipping Nick notification');
    return;
  }
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass },
  });
  await transport.sendMail({
    from: `"NeoBookworm" <${user}>`,
    to: user,
    subject: `Site review ready — ${business}`,
    text: [
      `Site review ready for ${business} (${url}).`,
      '',
      `Open the dashboard to review, edit, and send:`,
      `https://neobookworm.uk/dashboard.html#clients`,
      '',
      `Slug: ${slug}`,
    ].join('\n'),
  });
}

// ---------------------------------------------------------------------------
// runSiteAudit — main export
// ---------------------------------------------------------------------------

/**
 * Run a site audit for a J2 client.
 *
 * @param {string} slug
 * @param {{ dryRun?: boolean, testMode?: boolean }} opts
 * @returns {Promise<{ ok: boolean, review?: string, test_mode?: boolean, dry_run?: boolean, error?: string }>}
 */
async function runSiteAudit(slug, { dryRun = false, testMode = false } = {}) {
  const rows = await queryD1(
    enquiriesDb(),
    'SELECT business_name, contact_name, current_url, journey FROM clients WHERE slug = ? LIMIT 1',
    [slug]
  );
  if (!rows.length) return { ok: false, error: 'Client not found' };
  const client = rows[0];

  if (client.journey !== 'J2') {
    return { ok: false, error: `Journey is ${client.journey} — audit only applies to J2 (site review) clients` };
  }

  const url = (client.current_url || '').trim();
  if (!url) return { ok: false, error: 'No current_url set for this client' };

  const business = (client.business_name || client.contact_name || 'this business').trim();

  // Auto-enable test mode when business name contains the literal marker *Test*
  const isTest = testMode || /\*[Tt]est\*/.test(business);
  if (isTest) {
    return { ok: true, review: TEST_FIXTURE, test_mode: true };
  }

  const { text: pageText, pageCount } = await fetchSiteText(url);

  let review;
  try {
    review = await callClaude({ business, url, pageText, pageCount });
  } catch (err) {
    return { ok: false, error: `Claude API error: ${err.message}` };
  }

  if (dryRun) {
    return { ok: true, review, dry_run: true };
  }

  // Store in D1
  try {
    await queryD1(
      enquiriesDb(),
      'UPDATE clients SET site_review_content = ? WHERE slug = ?',
      [review, slug]
    );
  } catch (err) {
    console.error('[audit] D1 store failed:', err.message);
    // Return the review anyway — dashboard still shows it via the response
  }

  // Notify Nick
  try {
    await notifyNick({ slug, business, url });
  } catch (err) {
    console.error('[audit] Nick notification failed:', err.message);
  }

  return { ok: true, review };
}

module.exports = { runSiteAudit };
