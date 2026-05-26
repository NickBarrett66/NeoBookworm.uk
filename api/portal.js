// Client portal — NeoBookworm onboarding.
//
// Public GET /c/{slug}/ (rewritten by vercel.json) renders a branded,
// read-only progress page for a client.  No auth — the slug IS the
// access credential.  Action buttons (POST handlers) are added in S8.
//
// Sub-paths for later sessions:
//   /c/{slug}/review          → section=review
//   /c/{slug}/handover        → section=handover
//   /c/{slug}/google-business → section=google-business
//
// Required env var (shared with d1.js):
//   CF_API_TOKEN  — Cloudflare API token with D1:read permission

'use strict';

const { queryD1, enquiriesDb } = require('./_lib/d1');

// ---------------------------------------------------------------------------
// Security helper — escape every piece of client data before inserting into HTML
// ---------------------------------------------------------------------------

function esc(val) {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ---------------------------------------------------------------------------
// Stage helpers
// ---------------------------------------------------------------------------

// Internal stages → display strip entries.
// Source of truth: V3 scope decisions § display mapping.
const DISPLAY_STAGES = [
  { label: 'Acknowledged',  stages: new Set(['acknowledged']) },
  { label: 'Researching',   stages: new Set(['researching']) },
  { label: 'Building',      stages: new Set(['building', 'reviewing', 'revisions']) },
  { label: 'Preview ready', stages: new Set(['preview_ready', 'review_delivered']) },
  { label: 'Your decision', stages: new Set(['awaiting_payment', 'preparing_live']) },
  { label: 'Live',          stages: new Set(['live', 'care_active', 'self_managed']) },
];

/**
 * Returns the 0-based strip index for a given internal stage.
 * Returns -1 for `dropped_out` and any unknown stage (no strip highlight).
 */
function displayStage(stage) {
  for (let i = 0; i < DISPLAY_STAGES.length; i++) {
    if (DISPLAY_STAGES[i].stages.has(stage)) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/**
 * Convert a D1 `datetime('now')` string (UTC, "YYYY-MM-DD HH:MM:SS" or ISO)
 * into a human-readable relative time string.
 */
function humanTime(isoStr) {
  if (!isoStr) return '';
  // Normalise: D1 stores without a T; treat as UTC.
  const normalised = isoStr.includes('T') ? isoStr : isoStr.replace(' ', 'T') + 'Z';
  const diffMs = Date.now() - new Date(normalised).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 90)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)} minutes ago`;
  if (s < 7200)  return '1 hour ago';
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

/**
 * Format an ISO date / "YYYY-MM-DD" string as a long UK date, e.g.
 * "Tuesday 3 June".  Falls back to the raw string on error.
 */
function formatDeliverBy(isoStr) {
  if (!isoStr) return null;
  try {
    const norm = isoStr.length <= 10
      ? isoStr + 'T00:00:00Z'
      : (isoStr.includes('T') ? isoStr : isoStr.replace(' ', 'T') + 'Z');
    return new Date(norm).toLocaleDateString('en-GB', {
      weekday: 'long',
      day:     'numeric',
      month:   'long',
      timeZone: 'Europe/London',
    });
  } catch {
    return isoStr;
  }
}

// ---------------------------------------------------------------------------
// Shared CSS (inlined — no external stylesheet for the portal itself)
// ---------------------------------------------------------------------------

const PAGE_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --navy:        #0f1f3d;
  --navy-mid:    #1a3260;
  --navy-card:   #162650;
  --amber:       #f5a623;
  --amber-dark:  #d4891a;
  --white:       #ffffff;
  --muted:       rgba(255,255,255,0.58);
  --border:      rgba(245,166,35,0.18);
  --border-sub:  rgba(255,255,255,0.07);
  --serif:       'Playfair Display', Georgia, serif;
  --sans:        'DM Sans', system-ui, sans-serif;
}

html { scroll-behavior: smooth; }

body {
  font-family: var(--sans);
  background: var(--navy);
  color: var(--white);
  -webkit-font-smoothing: antialiased;
  min-height: 100dvh;
  line-height: 1.6;
  overflow-x: hidden;
}

a { color: var(--amber); text-decoration: none; }
a:hover, a:focus-visible { color: var(--amber-dark); text-decoration: underline; }
a:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; border-radius: 2px; }

/* ── Skip link ── */
.skip-link {
  position: absolute;
  top: -3rem; left: 1rem;
  background: var(--amber);
  color: var(--navy);
  padding: 0.5rem 1rem;
  border-radius: 0 0 6px 6px;
  font-weight: 700;
  font-size: 0.875rem;
  z-index: 9999;
  transition: top 0.15s;
}
.skip-link:focus { top: 0; color: var(--navy); text-decoration: none; }

/* ── Header ── */
.portal-header {
  background: rgba(15,31,61,0.97);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  padding: 0.9rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.portal-logo {
  font-family: var(--serif);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--white);
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;
}
.portal-logo span { color: var(--amber); }
.portal-greeting {
  font-size: 0.875rem;
  color: var(--muted);
  margin-left: auto;
  text-align: right;
  line-height: 1.3;
}
.portal-greeting strong { color: var(--white); font-weight: 500; }

/* ── Progress strip ── */
.progress-strip {
  background: var(--navy-mid);
  border-bottom: 1px solid var(--border);
  padding: 0 0.5rem;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.progress-strip::-webkit-scrollbar { display: none; }

.steps {
  display: flex;
  list-style: none;
  gap: 0;
  min-width: max-content;
  padding: 0.65rem 0.25rem;
}
.step {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  font-size: 0.775rem;
  color: var(--muted);
  white-space: nowrap;
}
.step + .step::before {
  content: '›';
  margin-right: 0.25rem;
  color: rgba(255,255,255,0.2);
  font-size: 1rem;
}
.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 50%;
  font-size: 0.7rem;
  font-weight: 700;
  background: var(--navy);
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.step--done { color: rgba(255,255,255,0.65); }
.step--done .step-num { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.2); }
.step--active { color: var(--amber); font-weight: 600; }
.step--active .step-num {
  background: var(--amber);
  border-color: var(--amber);
  color: var(--navy);
}

/* ── Main content ── */
main {
  max-width: 640px;
  margin: 0 auto;
  padding: 1.75rem 1.25rem 4rem;
}

/* ── Active panel ── */
.panel {
  background: var(--navy-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem 1.375rem;
  margin-bottom: 2rem;
}
.panel-stage-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--amber);
  font-weight: 700;
  margin-bottom: 0.8rem;
}
.panel-lead {
  font-family: var(--serif);
  font-size: 1.2rem;
  line-height: 1.35;
  margin-bottom: 0.75rem;
  color: var(--white);
}
.panel-content p {
  font-size: 0.95rem;
  margin-bottom: 0.55rem;
  color: rgba(255,255,255,0.85);
}
.panel-content p:last-child { margin-bottom: 0; }
.panel-deliver {
  margin-top: 0.6rem;
  padding: 0.55rem 0.9rem;
  background: rgba(245,166,35,0.08);
  border-left: 3px solid var(--amber);
  border-radius: 0 6px 6px 0;
  font-size: 0.875rem;
  color: rgba(255,255,255,0.9);
}
.panel-placeholder { color: var(--muted); }

/* ── Section headings ── */
.section-heading {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  color: rgba(255,255,255,0.4);
  margin-bottom: 0.65rem;
}

/* ── Useful links ── */
.useful-links { margin-bottom: 2rem; }
.useful-links ul { list-style: none; display: flex; flex-direction: column; gap: 0.45rem; }
.useful-links li a {
  display: block;
  padding: 0.7rem 0.95rem;
  background: var(--navy-card);
  border: 1px solid var(--border-sub);
  border-radius: 8px;
  font-size: 0.875rem;
  color: var(--amber);
  transition: background 0.15s, border-color 0.15s;
  min-height: 44px;
  display: flex;
  align-items: center;
}
.useful-links li a:hover { background: var(--navy-mid); border-color: var(--border); text-decoration: none; }

/* ── Conversation history ── */
.history { margin-bottom: 2rem; }
.history ul { list-style: none; display: flex; flex-direction: column; }
.history li {
  font-size: 0.85rem;
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--border-sub);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.history li:first-child { border-top: 1px solid var(--border-sub); }
.email-subject { color: var(--white); font-size: 0.85rem; flex: 1; min-width: 0; }
.email-time    { color: var(--muted); font-size: 0.78rem; white-space: nowrap; flex-shrink: 0; }
.email-failed  { color: #f87171; margin-left: 0.25rem; }
.no-emails     { color: var(--muted); font-size: 0.875rem; }

/* ── Footer ── */
.portal-footer {
  text-align: center;
  padding: 1.25rem 1.25rem 2rem;
  font-size: 0.8rem;
  color: var(--muted);
  border-top: 1px solid var(--border-sub);
}
.portal-footer a { color: var(--amber); }

/* ── 404 ── */
.not-found {
  text-align: center;
  padding: 3.5rem 1rem;
}
.not-found h1 {
  font-family: var(--serif);
  font-size: 1.6rem;
  margin-bottom: 0.9rem;
  line-height: 1.3;
}
.not-found p {
  color: var(--muted);
  font-size: 0.95rem;
  margin-bottom: 0.75rem;
}
.not-found p:last-child { margin-bottom: 0; }

/* ── Responsive ── */
@media (max-width: 420px) {
  .portal-greeting { display: none; }
  .panel { padding: 1.25rem 1.1rem; }
}
`;

// ---------------------------------------------------------------------------
// HTML building blocks
// ---------------------------------------------------------------------------

function renderHead({ title }) {
  return `<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="preload" href="/fonts/nuFiD-vYSZviVYUb_rj3ij__anPXDTzYgA.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu0-K4.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/fonts.css" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="/fonts.css"></noscript>
  <style>${PAGE_CSS}</style>
</head>`;
}

function renderProgressStrip(stage) {
  const activeIdx = displayStage(stage);
  const items = DISPLAY_STAGES.map((ds, i) => {
    let cls = 'step';
    if (i === activeIdx)  cls += ' step--active';
    else if (i < activeIdx) cls += ' step--done';
    const ariaCurrent = i === activeIdx ? ' aria-current="step"' : '';
    return (
      `<li class="${cls}"${ariaCurrent}>` +
      `<span class="step-num" aria-hidden="true">${i + 1}</span>` +
      `<span class="step-label">${esc(ds.label)}</span>` +
      `</li>`
    );
  }).join('');

  return `<nav class="progress-strip" aria-label="Your progress">
  <ol class="steps">${items}</ol>
</nav>`;
}

function renderActivePanel(client) {
  const name  = esc(client.contact_name  || 'there');
  const biz   = esc(client.business_name || 'your site');
  const stage = client.stage;
  const deliverBy = client.next_action_by ? formatDeliverBy(client.next_action_by) : null;

  const stripIdx  = displayStage(stage);
  const stageLabel = stripIdx >= 0 ? DISPLAY_STAGES[stripIdx].label : '';

  let content;

  if (stage === 'acknowledged') {
    content = `
    <p class="panel-lead">Got your details, ${name} —</p>
    <p>I'll be in touch within one working day.</p>
    ${deliverBy
      ? `<p class="panel-deliver">Your first deliverable will be ready by <strong>${esc(deliverBy)}</strong>.</p>`
      : ''}`;

  } else if (['researching', 'building', 'reviewing', 'revisions'].includes(stage)) {
    const verb = stage === 'researching' ? 'Researching' : 'Building';
    content = `
    <p class="panel-lead">${verb}: ${biz}'s website.</p>
    ${deliverBy
      ? `<p>Estimated delivery: <strong>${esc(deliverBy)}</strong>.</p>`
      : ''}
    <p>You don't need to do anything right now.</p>
    <p>If you have work photos or anything else you'd like included, reply to any of my emails with them.</p>`;

  } else if (stage === 'dropped_out') {
    const previewUrl = client.preview_url ? esc(client.preview_url) : null;
    content = `
    <p class="panel-lead">You decided to leave it for now — no problem.</p>
    ${previewUrl
      ? `<p>If you change your mind, <a href="${previewUrl}" target="_blank" rel="noopener">your preview</a> is still there.</p>`
      : ''}
    <p>If you ever want to pick this back up, <a href="mailto:nick@neobookworm.uk">drop me a line</a>.</p>`;

  } else {
    // All other stages: S7 placeholder
    content = `
    <p>We're working on this part of your portal — check back soon.</p>
    <p>If you have any questions in the meantime, <a href="mailto:nick@neobookworm.uk">drop me a line</a>.</p>`;
  }

  return `<section class="panel" aria-labelledby="panel-heading">
  <p class="panel-stage-label" id="panel-heading">${esc(stageLabel || 'Your journey')}</p>
  <div class="panel-content">${content}
  </div>
</section>`;
}

function renderSectionPanel(section) {
  // Section-specific pages (review, handover, google-business) are built in S7.
  const labels = {
    review:           'Site review',
    handover:         'Handover guide',
    'google-business': 'Google Business',
  };
  const label = labels[section] || section;
  return `<section class="panel" aria-label="${esc(label)}">
  <p class="panel-stage-label">${esc(label)}</p>
  <div class="panel-content panel-placeholder">
    <p>This page is coming soon. If you need anything now, <a href="mailto:nick@neobookworm.uk">drop me a line</a>.</p>
  </div>
</section>`;
}

function renderUsefulLinks(stage) {
  let links;
  if (['acknowledged', 'researching'].includes(stage)) {
    links = [
      { href: 'https://neobookworm.uk/guides/what-goes-on-a-trades-website.html', label: 'What goes on a trades website' },
      { href: 'https://neobookworm.uk/guides/work-photos-guide.html',             label: 'How to take good work photos' },
      { href: 'https://neobookworm.uk/guides/local-search-guide.html',            label: 'How to appear in Google search' },
    ];
  } else if (['building', 'reviewing', 'revisions'].includes(stage)) {
    links = [
      { href: 'https://neobookworm.uk/guides/work-photos-guide.html',             label: 'How to take good work photos' },
      { href: 'https://neobookworm.uk/guides/requesting-changes.html',            label: 'How to request changes to your site' },
      { href: 'https://neobookworm.uk/guides/local-search-guide.html',            label: 'How to appear in Google search' },
    ];
  } else {
    links = [
      { href: 'https://neobookworm.uk/guides.html', label: 'All guides' },
    ];
  }

  const items = links.map(l =>
    `<li><a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)} →</a></li>`
  ).join('');

  return `<section class="useful-links" aria-label="Useful guides">
  <h2 class="section-heading">Useful reading</h2>
  <ul>${items}</ul>
</section>`;
}

function renderHistory(emailLog) {
  if (!emailLog || emailLog.length === 0) {
    return `<section class="history" aria-label="Emails sent">
  <h2 class="section-heading">Emails I've sent you</h2>
  <p class="no-emails">No emails sent yet.</p>
</section>`;
  }

  const items = emailLog.map(row => {
    const failTag = row.status === 'failed'
      ? ` <span class="email-failed" aria-label="send failed">(send failed)</span>`
      : '';
    return (
      `<li>` +
      `<span class="email-subject">${esc(row.subject)}</span>` +
      `<span class="email-time">${esc(humanTime(row.sent_at))}${failTag}</span>` +
      `</li>`
    );
  }).join('');

  return `<section class="history" aria-label="Emails sent">
  <h2 class="section-heading">Emails I've sent you</h2>
  <ul>${items}</ul>
</section>`;
}

// ---------------------------------------------------------------------------
// Full page renderers
// ---------------------------------------------------------------------------

function renderPage({ client, emailLog, section }) {
  const biz  = esc(client.business_name || 'your site');
  const name = esc(client.contact_name  || 'there');
  const stage = client.stage;

  // Sub-section pages (review, handover, google-business) get their own panel.
  const KNOWN_SECTIONS = new Set(['review', 'handover', 'google-business']);
  const isSection = section && KNOWN_SECTIONS.has(section);

  // dropped_out has no strip
  const showStrip = displayStage(stage) >= 0;

  const head    = renderHead({ title: `${biz} — NeoBookworm` });
  const strip   = showStrip ? renderProgressStrip(stage) : '';
  const panel   = isSection ? renderSectionPanel(section) : renderActivePanel(client);
  const links   = renderUsefulLinks(stage);
  const history = renderHistory(emailLog);

  return `<!DOCTYPE html>
<html lang="en">
${head}
<body>
  <a class="skip-link" href="#main">Skip to content</a>

  <header class="portal-header">
    <a href="https://neobookworm.uk" class="portal-logo">Neo<span>Bookworm</span></a>
    <p class="portal-greeting">Hi <strong>${name}</strong> from <strong>${biz}</strong></p>
  </header>

  ${strip}

  <main id="main">
    ${panel}
    ${links}
    ${history}
  </main>

  <footer class="portal-footer">
    Need to reach Nick? <a href="mailto:nick@neobookworm.uk">nick@neobookworm.uk</a> — replies within one working day.
  </footer>
</body>
</html>`;
}

function render404() {
  const head = renderHead({ title: 'Page not found — NeoBookworm' });
  return `<!DOCTYPE html>
<html lang="en">
${head}
<body>
  <a class="skip-link" href="#main">Skip to content</a>

  <header class="portal-header">
    <a href="https://neobookworm.uk" class="portal-logo">Neo<span>Bookworm</span></a>
  </header>

  <main id="main">
    <div class="not-found">
      <h1>That link doesn't look right.</h1>
      <p>The portal link in your email should work — copy and paste it rather than typing it.</p>
      <p>If you're still stuck, drop me a line:</p>
      <p><a href="mailto:nick@neobookworm.uk">nick@neobookworm.uk</a></p>
    </div>
  </main>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Vercel serverless handler
// ---------------------------------------------------------------------------

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).setHeader('Allow', 'GET').end('Method Not Allowed');
    return;
  }

  const slug    = ((req.query.slug    || '') + '').trim().toLowerCase();
  const section = ((req.query.section || '') + '').trim().toLowerCase();

  if (!slug) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(404).send(render404());
    return;
  }

  // ── Look up client ──
  let client;
  try {
    const rows = await queryD1(
      enquiriesDb(),
      'SELECT slug, business_name, contact_name, stage, next_action_by, preview_url, live_url FROM clients WHERE slug = ? LIMIT 1',
      [slug]
    );
    client = rows[0] || null;
  } catch (err) {
    console.error('[portal] D1 clients query failed:', err.message);
    res.status(500).end('Service unavailable — please try again shortly.');
    return;
  }

  if (!client) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(404).send(render404());
    return;
  }

  // ── Email history (non-fatal if D1 errors) ──
  let emailLog = [];
  try {
    emailLog = await queryD1(
      enquiriesDb(),
      'SELECT subject, sent_at, status FROM email_log WHERE slug = ? ORDER BY sent_at DESC LIMIT 20',
      [slug]
    );
  } catch (err) {
    console.error('[portal] D1 email_log query failed:', err.message);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(renderPage({ client, emailLog, section }));
};
