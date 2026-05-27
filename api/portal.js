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
  { label: 'Got it',                     stages: new Set(['acknowledged']) },
  { label: 'Looking into your business', stages: new Set(['researching']) },
  { label: 'Building your site',         stages: new Set(['building', 'reviewing', 'revisions']) },
  { label: 'Ready to view',              stages: new Set(['preview_ready', 'review_delivered']) },
  { label: 'Over to you',                stages: new Set(['awaiting_payment', 'preparing_live']) },
  { label: 'You\'re live',               stages: new Set(['live', 'care_active', 'self_managed']) },
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

function workingDaysFromNow(targetIso) {
  if (!targetIso) return null;
  const norm = targetIso.length <= 10
    ? targetIso + 'T00:00:00Z'
    : (targetIso.includes('T') ? targetIso : targetIso.replace(' ', 'T') + 'Z');
  const target = new Date(norm);
  const now = new Date();
  let count = 0;
  const d = new Date(now);
  while (d < target) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count > 0 ? count : null;
}

function ensureWorkingDay(isoStr) {
  if (!isoStr) return isoStr;
  const norm = isoStr.length <= 10
    ? isoStr + 'T00:00:00Z'
    : (isoStr.includes('T') ? isoStr : isoStr.replace(' ', 'T') + 'Z');
  const d = new Date(norm);
  const dow = d.getUTCDay();
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1); // Sunday → Monday
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2); // Saturday → Monday
  return d.toISOString().slice(0, 10);
}

const EMAIL_DISPLAY_LABELS = {
  'J1-E1':          'Confirmation — I\'ve got your details',
  'J1-E2':          'Personal note from Nick',
  'J1-E3':          'Halfway update — build in progress',
  'J1-E4':          'Your preview is ready',
  'J2-E1':          'Confirmation — reviewing your site',
  'J2-E2':          'Your site review is ready',
  'J2-Branch-A':    'Next steps — building a new one',
  'J2-Branch-B':    'Thanks and all the best',
  'J3-E1':          'Confirmation — building your replacement',
  'J3-E2':          'Personal note from Nick',
  'J3-E3':          'Halfway update — build in progress',
  'J3-E4':          'Your replacement site is ready',
  'J4-E1':          'Confirmation — got your full brief',
  'J4-E2':          'Personal note from Nick',
  'J4-E3':          'Halfway update — build in progress',
  'J4-E4':          'Your site is ready',
  'J5-E1-quick':    'Confirmation — got your message',
  'J5-E1-booking':  'Confirmation — call booked',
  'C1':             'Got your changes — working on them',
  'C2':             'Changes done — have another look',
  'C3':             'Going live — payment details',
  'C4':             'All the best',
  'C5':             'Payment received — going live soon',
  'Post-1':         'Your site is live!',
  'Post-2':         'Quick check — everything working',
  'Post-3-care':    'Care plan confirmed',
  'Post-3-self':    'Your login credentials',
  'Post-4':         'Week one check-in',
  'Post-5':         'Google Business — worth doing now',
  'Post-6':         'One month in',
  'Ongoing-1':      'Quarterly check-in',
  'Ongoing-2-care': 'Domain renewal heads-up',
  'Ongoing-2-self': 'Domain renewal reminder',
  'Ongoing-3':      'Happy anniversary',
};

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
  display: flex;
  align-items: center;
  gap: 0.6rem;
  text-decoration: none;
  flex-shrink: 0;
}
.portal-logo-img {
  width: 36px;
  height: 36px;
  object-fit: contain;
  display: block;
  flex-shrink: 0;
}
.logo-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.portal-logo-wordmark {
  font-family: var(--serif);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--white);
  letter-spacing: -0.01em;
  line-height: 1;
}
.portal-logo-wordmark span {
  color: var(--amber);
}
.portal-logo-tagline {
  font-family: var(--sans);
  font-size: 0.6rem;
  font-weight: 400;
  letter-spacing: 0.05em;
  color: rgba(255,255,255,0.38);
  line-height: 1;
}

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
.step-tick {
  font-size: 0.85rem;
  color: rgba(255,255,255,0.5);
  flex-shrink: 0;
}
.step-dot {
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
  flex-shrink: 0;
}
.step--active .step-dot {
  background: var(--amber);
  box-shadow: 0 0 6px rgba(245,166,35,0.4);
}
.step--done { color: rgba(255,255,255,0.45); }
.step--done .step-tick { color: rgba(255,255,255,0.45); }
.step--active { color: var(--amber); font-weight: 600; }
.step--future { color: rgba(255,255,255,0.25); }

@media (max-width: 420px) {
  .progress-strip .steps { display: none; }
  .progress-strip .mobile-step { display: flex; }
}
.mobile-step {
  display: none;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0.75rem;
  font-size: 0.85rem;
  color: var(--amber);
  font-weight: 600;
}
.mobile-step .step-dot {
  background: var(--amber);
  box-shadow: 0 0 6px rgba(245,166,35,0.4);
}
.mobile-step-count {
  color: var(--muted);
  font-weight: 400;
  font-size: 0.78rem;
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
.panel-status {
  font-size: 1rem;
  color: rgba(255,255,255,0.85);
  margin-bottom: 0.75rem;
  line-height: 1.5;
}
.panel-content p {
  font-size: 0.95rem;
  margin-bottom: 0.55rem;
  color: rgba(255,255,255,0.85);
}
.panel-content p:last-child { margin-bottom: 0; }
.panel-deliver {
  margin: 0.75rem 0;
  padding: 0.7rem 1rem;
  background: rgba(245,166,35,0.08);
  border-left: 3px solid var(--amber);
  border-radius: 0 6px 6px 0;
}
.panel-deliver-date {
  font-size: 1.05rem;
  color: var(--white);
}
.panel-deliver-date strong {
  color: var(--amber);
  font-weight: 700;
}
.panel-deliver-sub {
  font-size: 0.78rem;
  color: var(--muted);
  margin-top: 0.15rem;
}

.panel-preview-link {
  margin: 0.75rem 0;
}
.panel-preview-link a {
  display: inline-block;
  padding: 0.75rem 1.5rem;
  background: var(--amber);
  color: var(--navy);
  font-weight: 700;
  font-size: 1rem;
  border-radius: 8px;
  text-decoration: none;
  transition: background 0.15s;
}
.panel-preview-link a:hover {
  background: var(--amber-dark);
  color: var(--navy);
  text-decoration: none;
}

.panel-turn {
  margin-top: 0.75rem;
  margin-bottom: 0.75rem;
}
.panel-turn-indicator {
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.turn-dot {
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.turn-dot--nick { background: #60a5fa; }
.turn-dot--you  { background: var(--amber); }

.panel-actions {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-sub);
}
.panel-actions-lead {
  font-size: 0.85rem;
  color: var(--muted);
  margin-bottom: 0.35rem;
}
.panel-actions ul {
  list-style: none;
  padding: 0;
  margin: 0 0 0.35rem 0;
}
.panel-actions li {
  font-size: 0.85rem;
  padding: 0.2rem 0;
}
.panel-actions li::before {
  content: '→ ';
  color: var(--muted);
}
.panel-actions-reassure {
  font-size: 0.8rem;
  color: var(--muted);
  font-style: italic;
  margin-top: 0.25rem;
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
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
}
.useful-links li a:hover { background: var(--navy-mid); border-color: var(--border); text-decoration: none; }
.link-label {
  font-size: 0.875rem;
  color: var(--amber);
}
.link-hook {
  font-size: 0.75rem;
  color: var(--muted);
  font-style: italic;
}

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
    if (i === activeIdx) cls += ' step--active';
    else if (i < activeIdx) cls += ' step--done';
    else cls += ' step--future';

    if (i < activeIdx) {
      return (
        `<li class="${cls}" aria-label="${esc(ds.label)} — complete">` +
        `<span class="step-tick" aria-hidden="true">✓</span>` +
        `<span class="step-label">${esc(ds.label)}</span>` +
        `</li>`
      );
    }

    if (i === activeIdx) {
      return (
        `<li class="${cls}" aria-current="step">` +
        `<span class="step-dot" aria-hidden="true"></span>` +
        `<span class="step-label">${esc(ds.label)}</span>` +
        `</li>`
      );
    }

    return (
      `<li class="${cls}">` +
      `<span class="step-dot" aria-hidden="true"></span>` +
      `<span class="step-label">${esc(ds.label)}</span>` +
      `</li>`
    );
  }).join('');

  const activeLabel = activeIdx >= 0 ? DISPLAY_STAGES[activeIdx].label : '';
  const mobile = activeIdx >= 0
    ? `<div class="mobile-step">` +
      `<span class="step-dot" aria-hidden="true"></span>` +
      `<span>${esc(activeLabel)}</span>` +
      `<span class="mobile-step-count">· Step ${activeIdx + 1} of ${DISPLAY_STAGES.length}</span>` +
      `</div>`
    : '';

  return `<nav class="progress-strip" aria-label="Your progress">
  <ol class="steps">${items}</ol>
  ${mobile}
</nav>`;
}

function renderActivePanel(client) {
  const contactNameRaw = (client.contact_name || '').trim();
  const firstNameRaw = contactNameRaw ? contactNameRaw.split(/\s+/)[0] : 'there';
  const name = esc(firstNameRaw);

  const bizRaw = (client.business_name || '').trim();
  const biz = esc(bizRaw || 'your business');

  const stage = client.stage;
  const deliverByIso = client.next_action_by ? ensureWorkingDay(client.next_action_by) : null;
  const deliverBy = deliverByIso ? formatDeliverBy(deliverByIso) : null;

  const stripIdx  = displayStage(stage);
  const stageLabel = stripIdx >= 0 ? DISPLAY_STAGES[stripIdx].label : '';

  let content;

  if (stage === 'acknowledged') {
    const lead = `Hi ${name} — here's where things stand with ${biz}.`;
    const zone1 = `<p class="panel-lead">${lead}</p>` +
      `<p class="panel-status">I've got your details. I'll be in touch within one working day.</p>`;

    const wdLeft = deliverByIso ? workingDaysFromNow(deliverByIso) : null;
    const subText = wdLeft ? `${wdLeft} working day${wdLeft === 1 ? '' : 's'} from now` : '';
    const zone2 = deliverBy
      ? `<div class="panel-deliver">` +
        `<p class="panel-deliver-date">Your first deliverable will be ready by <strong>${esc(deliverBy)}</strong>.</p>` +
        (subText ? `<p class="panel-deliver-sub">${esc(subText)}</p>` : '') +
        `</div>`
      : '';

    const zone3 = `<div class="panel-turn">` +
      `<p class="panel-turn-indicator panel-turn--nick">` +
      `<span class="turn-dot turn-dot--nick" aria-hidden="true"></span>` +
      `Waiting on Nick — I'll be in touch within one working day. Nothing for you to do.` +
      `</p>` +
      `</div>`;

    content = zone1 + zone2 + zone3;

  } else if (stage === 'researching') {
    const lead = `Hi ${name} — here's where things stand with ${biz}.`;
    const zone1 = `<p class="panel-lead">${lead}</p>` +
      `<p class="panel-status">I'm looking into your business — your Google profile, reviews, the kind of work you do. Then I'll build you a first version.</p>`;

    const wdLeft = deliverByIso ? workingDaysFromNow(deliverByIso) : null;
    const subText = wdLeft ? `${wdLeft} working day${wdLeft === 1 ? '' : 's'} from now` : '';
    const zone2 = deliverBy
      ? `<div class="panel-deliver">` +
        `<p class="panel-deliver-date">Your preview will be ready by <strong>${esc(deliverBy)}</strong>.</p>` +
        (subText ? `<p class="panel-deliver-sub">${esc(subText)}</p>` : '') +
        `</div>`
      : '';

    const zone3 = `<div class="panel-turn">` +
      `<p class="panel-turn-indicator panel-turn--nick">` +
      `<span class="turn-dot turn-dot--nick" aria-hidden="true"></span>` +
      `Waiting on Nick — nothing for you to do.` +
      `</p>` +
      `</div>` +
      `<div class="panel-actions">` +
      `<p class="panel-actions-lead">While you wait, you can:</p>` +
      `<ul>` +
      `<li><a href="mailto:nick@neobookworm.uk?subject=${encodeURIComponent('Photos for ' + (bizRaw || 'your business'))}">Send me work photos</a></li>` +
      `<li><a href="mailto:nick@neobookworm.uk?subject=${encodeURIComponent('Note about ' + (bizRaw || 'your business'))}">Tell me anything else about your business</a></li>` +
      `</ul>` +
      `<p class="panel-actions-reassure">Or do nothing — I've got what I need.</p>` +
      `</div>`;

    content = zone1 + zone2 + zone3;

  } else if (stage === 'building' || stage === 'reviewing') {
    const lead = `Hi ${name} — here's where things stand with ${biz}.`;
    const zone1 = `<p class="panel-lead">${lead}</p>` +
      `<p class="panel-status">Your site is being built${deliverBy ? `. On track for ${esc(deliverBy)}.` : '.'}</p>`;

    const wdLeft = deliverByIso ? workingDaysFromNow(deliverByIso) : null;
    const subText = wdLeft ? `${wdLeft} working day${wdLeft === 1 ? '' : 's'} from now` : '';
    const zone2 = deliverBy
      ? `<div class="panel-deliver">` +
        `<p class="panel-deliver-date">Your preview will be ready by <strong>${esc(deliverBy)}</strong>.</p>` +
        (subText ? `<p class="panel-deliver-sub">${esc(subText)}</p>` : '') +
        `</div>`
      : '';

    const zone3 = `<div class="panel-turn">` +
      `<p class="panel-turn-indicator panel-turn--nick">` +
      `<span class="turn-dot turn-dot--nick" aria-hidden="true"></span>` +
      `Waiting on Nick — your site is in progress.` +
      `</p>` +
      `</div>` +
      `<div class="panel-actions">` +
      `<p class="panel-actions-lead">While you wait, you can:</p>` +
      `<ul>` +
      `<li><a href="mailto:nick@neobookworm.uk?subject=${encodeURIComponent('Photos for ' + (bizRaw || 'your business'))}">Send me work photos</a></li>` +
      `<li><a href="mailto:nick@neobookworm.uk?subject=${encodeURIComponent('Note about ' + (bizRaw || 'your business'))}">Tell me anything else about your business</a></li>` +
      `</ul>` +
      `<p class="panel-actions-reassure">Or do nothing.</p>` +
      `</div>`;

    content = zone1 + zone2 + zone3;

  } else if (stage === 'revisions') {
    const lead = `Hi ${name} — here's where things stand with ${biz}.`;
    const revCount = client.revision_count ? Number(client.revision_count) : null;
    const safeCount = (revCount && Number.isFinite(revCount) && revCount > 0) ? revCount : null;
    const zone1 = `<p class="panel-lead">${lead}</p>` +
      `<p class="panel-status">Working on your changes${safeCount ? ` — round ${esc(safeCount)}` : ''}.</p>`;

    const wdLeft = deliverByIso ? workingDaysFromNow(deliverByIso) : null;
    const subText = wdLeft ? `${wdLeft} working day${wdLeft === 1 ? '' : 's'} from now` : '';
    const zone2 = deliverBy
      ? `<div class="panel-deliver">` +
        `<p class="panel-deliver-date">Updated version back to you by <strong>${esc(deliverBy)}</strong>.</p>` +
        (subText ? `<p class="panel-deliver-sub">${esc(subText)}</p>` : '') +
        `</div>`
      : '';

    const zone3 = `<div class="panel-turn">` +
      `<p class="panel-turn-indicator panel-turn--nick">` +
      `<span class="turn-dot turn-dot--nick" aria-hidden="true"></span>` +
      `Waiting on Nick — I'm making your changes.` +
      `</p>` +
      `</div>`;

    content = zone1 + zone2 + zone3;

  } else if (stage === 'preview_ready' || stage === 'review_delivered') {
    const lead = `Hi ${name} — here's where things stand with ${biz}.`;
    const status = stage === 'review_delivered' ? 'Your review is ready.' : 'Your site is ready to view.';
    const zone1 = `<p class="panel-lead">${lead}</p>` +
      `<p class="panel-status">${esc(status)}</p>`;

    const previewUrl = client.preview_url ? String(client.preview_url).trim() : '';
    const zone2 = previewUrl
      ? `<div class="panel-preview-link">` +
        `<a href="${esc(previewUrl)}" target="_blank" rel="noopener">View your site →</a>` +
        `</div>`
      : `<div class="panel-deliver">` +
        `<p class="panel-deliver-date">Your preview link is on its way.</p>` +
        `<p class="panel-deliver-sub">If you need it urgently, email me and I’ll resend it.</p>` +
        `</div>`;

    const zone3 = `<div class="panel-turn">` +
      `<p class="panel-turn-indicator panel-turn--you">` +
      `<span class="turn-dot turn-dot--you" aria-hidden="true"></span>` +
      `Over to you — take a look and let me know what you think.` +
      `</p>` +
      `</div>` +
      `<div class="panel-actions">` +
      `<p class="panel-actions-lead">What would you like to do?</p>` +
      `<ul>` +
      `<li><a href="#" aria-disabled="true" onclick="return false">Looks good — go live (coming soon)</a></li>` +
      `<li><a href="#" aria-disabled="true" onclick="return false">I’d like a few changes (coming soon)</a></li>` +
      `<li><a href="#" aria-disabled="true" onclick="return false">Not for me — close it down (coming soon)</a></li>` +
      `</ul>` +
      `</div>`;

    content = zone1 + zone2 + zone3;

  } else if (stage === 'awaiting_payment') {
    const lead = `Hi ${name} — here's where things stand with ${biz}.`;
    const zone1 = `<p class="panel-lead">${lead}</p>` +
      `<p class="panel-status">You're going ahead — brilliant.</p>`;

    const zone2 = `<div class="panel-preview-link">` +
      `<a href="#" aria-disabled="true" onclick="return false">Pay invoice (coming soon)</a>` +
      `</div>`;

    const zone3 = `<div class="panel-turn">` +
      `<p class="panel-turn-indicator panel-turn--you">` +
      `<span class="turn-dot turn-dot--you" aria-hidden="true"></span>` +
      `Over to you — pay when you're ready.` +
      `</p>` +
      `</div>` +
      `<div class="panel-actions">` +
      `<p class="panel-actions-lead">Need the payment link?</p>` +
      `<ul>` +
      `<li><a href="#" aria-disabled="true" onclick="return false">Open Stripe checkout (coming soon)</a></li>` +
      `</ul>` +
      `</div>`;

    content = zone1 + zone2 + zone3;

  } else if (stage === 'preparing_live') {
    const lead = `Hi ${name} — here's where things stand with ${biz}.`;
    const zone1 = `<p class="panel-lead">${lead}</p>` +
      `<p class="panel-status">Payment received. Getting the technical bits ready.</p>`;

    const wdLeft = deliverByIso ? workingDaysFromNow(deliverByIso) : null;
    const subText = wdLeft ? `${wdLeft} working day${wdLeft === 1 ? '' : 's'} from now` : '';
    const zone2 = deliverBy
      ? `<div class="panel-deliver">` +
        `<p class="panel-deliver-date">Going live by <strong>${esc(deliverBy)}</strong>.</p>` +
        (subText ? `<p class="panel-deliver-sub">${esc(subText)}</p>` : '') +
        `</div>`
      : '';

    const zone3 = `<div class="panel-turn">` +
      `<p class="panel-turn-indicator panel-turn--nick">` +
      `<span class="turn-dot turn-dot--nick" aria-hidden="true"></span>` +
      `Waiting on Nick — domain, SSL, final checks.` +
      `</p>` +
      `</div>`;

    content = zone1 + zone2 + zone3;

  } else if (stage === 'live' || stage === 'care_active' || stage === 'self_managed') {
    const lead = `Hi ${name} — here's where things stand with ${biz}.`;
    const liveUrl = client.live_url ? String(client.live_url).trim() : '';
    const zone1 = `<p class="panel-lead">${lead}</p>` +
      `<p class="panel-status">${biz} is live.</p>`;

    const zone2 = liveUrl
      ? `<div class="panel-preview-link">` +
        `<a href="${esc(liveUrl)}" target="_blank" rel="noopener">Visit your website →</a>` +
        `</div>`
      : '';

    const zone3 = `<div class="panel-actions">` +
      `<p class="panel-actions-lead">Good to know:</p>` +
      `<ul>` +
      `<li><a href="https://neobookworm.uk/guides/website-handover.html" target="_blank" rel="noopener">Handover guide</a></li>` +
      `<li><a href="https://neobookworm.uk/guides/local-search-guide.html" target="_blank" rel="noopener">Google Business guide</a></li>` +
      `<li><a href="https://neobookworm.uk/guides/requesting-changes.html" target="_blank" rel="noopener">Request a change</a></li>` +
      `</ul>` +
      `</div>`;

    content = zone1 + zone2 + zone3;

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
    <p class="panel-lead">Hi ${name} — here's where things stand with ${biz}.</p>
    <p class="panel-status">We're working on this part of your portal — check back soon.</p>
    <div class="panel-turn">
      <p class="panel-turn-indicator panel-turn--nick">
        <span class="turn-dot turn-dot--nick" aria-hidden="true"></span>
        Waiting on Nick — nothing for you to do.
      </p>
    </div>
    <div class="panel-actions">
      <p class="panel-actions-lead">Need anything?</p>
      <ul>
        <li><a href="mailto:nick@neobookworm.uk">Email me</a></li>
      </ul>
    </div>`;
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
  const links = [
    {
      href: 'https://neobookworm.uk/guides/what-goes-on-a-trades-website.html',
      label: 'What goes on a trades website',
      hook: 'The 5 pages that bring in the most enquiries',
    },
    {
      href: 'https://neobookworm.uk/guides/work-photos-guide.html',
      label: 'How to take good work photos',
      hook: 'Better photos = better first impression (takes 2 minutes)',
    },
    {
      href: 'https://neobookworm.uk/guides/local-search-guide.html',
      label: 'How to appear in Google search',
      hook: 'What I build in, and what you can do yourself',
    },
  ];

  const items = links.map(l =>
    `<li>` +
      `<a href="${esc(l.href)}" target="_blank" rel="noopener">` +
        `<span class="link-label">${esc(l.label)} →</span>` +
        `<span class="link-hook">${esc(l.hook || '')}</span>` +
      `</a>` +
    `</li>`
  ).join('');

  return `<section class="useful-links" aria-label="Useful guides">
  <h2 class="section-heading">Good to know</h2>
  <ul>${items}</ul>
</section>`;
}

function renderHistory(emailLog) {
  if (!emailLog || emailLog.length === 0) {
    return `<section class="history" aria-label="Messages sent">
  <h2 class="section-heading">Messages I've sent you</h2>
  <p class="no-emails">No emails sent yet.</p>
</section>`;
  }

  const items = emailLog.map(row => {
    const displayLabel = EMAIL_DISPLAY_LABELS[row.template] || row.subject;
    const failTag = row.status === 'failed'
      ? ` <span class="email-failed" aria-label="send failed">(send failed)</span>`
      : '';
    return (
      `<li>` +
      `<span class="email-subject">${esc(displayLabel)}</span>` +
      `<span class="email-time">${esc(humanTime(row.sent_at))}${failTag}</span>` +
      `</li>`
    );
  }).join('');

  return `<section class="history" aria-label="Messages sent">
  <h2 class="section-heading">Messages I've sent you</h2>
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
    <a href="https://neobookworm.uk" class="portal-logo">
      <img src="/logo-160.webp"
           srcset="/logo-80.webp 80w, /logo-160.webp 160w"
           sizes="80px"
           alt="NeoBookworm.uk logo"
           class="portal-logo-img"
           width="1024" height="1024">
      <span class="logo-stack">
        <span class="portal-logo-wordmark">Neo<span>Bookworm.uk</span></span>
        <span class="portal-logo-tagline">websites, done properly</span>
      </span>
    </a>
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
      'SELECT template, subject, sent_at, status FROM email_log WHERE slug = ? ORDER BY sent_at DESC LIMIT 20',
      [slug]
    );
  } catch (err) {
    console.error('[portal] D1 email_log query failed:', err.message);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(renderPage({ client, emailLog, section }));
};
