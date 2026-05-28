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

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
}

// ---------------------------------------------------------------------------
// Page fetch
// ---------------------------------------------------------------------------

async function fetchPageText(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NeoBookwormBot/1.0; +https://neobookworm.uk)' },
    });
    clearTimeout(timer);
    if (!resp.ok) {
      return { text: `[HTTP ${resp.status} — page could not be loaded]`, fetchError: `HTTP ${resp.status}` };
    }
    const html = await resp.text();
    return { text: stripHtml(html) };
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'request timed out after 10 seconds' : err.message;
    return { text: `[Could not fetch page: ${msg}]`, fetchError: msg };
  }
}

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

async function callClaude({ business, url, pageText }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are helping Nick Barrett, who runs NeoBookworm.uk — a web design service for UK tradespeople at £299. Nick will review your output before sending it to the prospect.

Write in Nick's voice: plain English, direct, no jargon, no sales pressure. If the site is genuinely fine, say so. If not, be specific about what's wrong and what would fix it.

Produce a plaintext review (no markdown headers, no asterisks — use dashes for lists). Aim for 300–400 words. Cover:
1. What's working (1–3 things genuinely worth keeping)
2. What you'd change (2–4 specific, reasoned points)
3. One or two quick wins — changes that would make a real difference now without a full rebuild
4. Verdict: rebuild from scratch or just tweak? Be honest and specific.

The prospect will read this on their private portal page. It should feel like honest advice from a professional peer, not a pitch to sell them a new site.`;

  const userPrompt = `Business: ${business}
Website: ${url}

Page content (extracted text):
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

  // Auto-enable test mode when business name contains "test"
  const isTest = testMode || /test/i.test(business);
  if (isTest) {
    return { ok: true, review: TEST_FIXTURE, test_mode: true };
  }

  const { text: pageText } = await fetchPageText(url);

  let review;
  try {
    review = await callClaude({ business, url, pageText });
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
