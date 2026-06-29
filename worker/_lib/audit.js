// Site audit helper — Worker ES module version.
// Uses top-level Anthropic import (nodejs_compat required).
// Nick notification goes via the SMTP bridge (sendRendered) instead of nodemailer.

import Anthropic from '@anthropic-ai/sdk';
import { queryD1, enquiriesDb } from './d1.js';
import { sendRendered } from './email.js';

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
    .replace(/<img\b[^>]*>/gi, tag => ' ' + imgHint(tag) + ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

const KEY_PAGE_PATTERNS = [
  /galler/i, /portfolio/i, /work/i, /projects/i,
  /service/i, /about/i, /contact/i, /testimonial/i, /review/i,
];

function extractInternalLinks(html, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const seen   = new Set();
  const links  = [];
  const re     = /href=["']([^"'#?]+)/gi;
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

function selectSubPages(links, maxPages = 4) {
  const scored = links.map(url => {
    const path  = new URL(url).pathname.toLowerCase();
    const score = KEY_PAGE_PATTERNS.findIndex(p => p.test(path));
    return { url, score: score === -1 ? 999 : score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, maxPages).map(s => s.url);
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(url, {
      signal:  controller.signal,
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

async function fetchSiteText(rootUrl) {
  const { html: homeHtml, error: homeError } = await fetchHtml(rootUrl);

  if (homeError && !homeHtml) {
    return { text: `[Could not fetch ${rootUrl}: ${homeError}]` };
  }

  const pages = [{ url: rootUrl, label: 'Homepage', html: homeHtml }];

  const subUrls    = selectSubPages(extractInternalLinks(homeHtml, rootUrl));
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

async function callClaude(env, { business, url, pageText, pageCount = 1 }) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are helping Nick Barrett, who runs NeoBookworm.uk — a web design service for UK tradespeople at £299.99. Nick will review your output before sending it to the prospect.

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
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userPrompt }],
  });

  return message.content[0].text;
}

// ---------------------------------------------------------------------------
// Nick notification — via SMTP bridge (not nodemailer)
// ---------------------------------------------------------------------------

async function notifyNick(env, { slug, business, url }) {
  const to = env.GW_SMTP_USER || 'nick@neobookworm.uk';
  const subject = `Site review ready — ${business}`;
  const body = [
    `Site review ready for ${business} (${url}).`,
    '',
    'Open the dashboard to review, edit, and send:',
    'https://neobookworm.uk/dashboard.html#clients',
    '',
    `Slug: ${slug}`,
  ].join('\n');

  try {
    await sendRendered(env, { slug, templateId: 'manual', subject, body, to });
  } catch (err) {
    console.error('[audit] Nick notification failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// runSiteAudit — main export
// ---------------------------------------------------------------------------

export async function runSiteAudit(env, slug, { dryRun = false, testMode = false } = {}) {
  const rows = await queryD1(
    env,
    enquiriesDb(env),
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

  const isTest = testMode || /\*[Tt]est\*/.test(business);
  if (isTest) {
    return { ok: true, review: TEST_FIXTURE, test_mode: true };
  }

  const { text: pageText, pageCount } = await fetchSiteText(url);

  let review;
  try {
    review = await callClaude(env, { business, url, pageText, pageCount });
  } catch (err) {
    return { ok: false, error: `Claude API error: ${err.message}` };
  }

  if (dryRun) {
    return { ok: true, review, dry_run: true };
  }

  try {
    await queryD1(
      env,
      enquiriesDb(env),
      'UPDATE clients SET site_review_content = ? WHERE slug = ?',
      [review, slug]
    );
  } catch (err) {
    console.error('[audit] D1 store failed:', err.message);
  }

  await notifyNick(env, { slug, business, url });

  return { ok: true, review };
}
