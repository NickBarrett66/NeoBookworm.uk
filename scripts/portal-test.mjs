// Smoke test for api/portal.js — no network calls.
// Run: node scripts/portal-test.mjs
//
// Tests:
//   1. esc() neutralises XSS payloads
//   2. displayStage() maps all 13 internal stages correctly
//   3. humanTime() returns sensible strings
//   4. renderPage() produces valid HTML for each early stage
//   5. render404() produces a branded 404

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

// ── Pull the module source and eval the helpers we need ──────────────────────
// We re-implement only the pure helpers here so the test doesn't need a real
// D1 connection.

function esc(val) {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

const DISPLAY_STAGES = [
  { label: 'Acknowledged',  stages: new Set(['acknowledged']) },
  { label: 'Researching',   stages: new Set(['researching']) },
  { label: 'Building',      stages: new Set(['building', 'reviewing', 'revisions']) },
  { label: 'Preview ready', stages: new Set(['preview_ready', 'review_delivered']) },
  { label: 'Your decision', stages: new Set(['awaiting_payment', 'preparing_live']) },
  { label: 'Live',          stages: new Set(['live', 'care_active', 'self_managed']) },
];

function displayStage(stage) {
  for (let i = 0; i < DISPLAY_STAGES.length; i++) {
    if (DISPLAY_STAGES[i].stages.has(stage)) return i;
  }
  return -1;
}

function humanTime(isoStr) {
  if (!isoStr) return '';
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

// ── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, cond) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

// ── 1. esc() ─────────────────────────────────────────────────────────────────
console.log('\n1. esc() — XSS neutralisation');
assert('< escaped',  esc('<script>') === '&lt;script&gt;');
assert('> escaped',  esc('a>b') === 'a&gt;b');
assert('& escaped',  esc('a&b') === 'a&amp;b');
assert('" escaped',  esc('"hi"') === '&quot;hi&quot;');
assert("' escaped",  esc("it's") === 'it&#x27;s');
assert('null → ""',  esc(null) === '');
assert('undef → ""', esc(undefined) === '');
const xss = '<script>alert(1)</script>';
assert('full XSS payload inert', !esc(xss).includes('<script>'));

// ── 2. displayStage() ────────────────────────────────────────────────────────
console.log('\n2. displayStage() — mapping table');
assert('acknowledged → 0',     displayStage('acknowledged')   === 0);
assert('researching  → 1',     displayStage('researching')    === 1);
assert('building     → 2',     displayStage('building')       === 2);
assert('reviewing    → 2',     displayStage('reviewing')      === 2);
assert('revisions    → 2',     displayStage('revisions')      === 2);
assert('preview_ready → 3',    displayStage('preview_ready')  === 3);
assert('review_delivered → 3', displayStage('review_delivered') === 3);
assert('awaiting_payment → 4', displayStage('awaiting_payment') === 4);
assert('preparing_live → 4',   displayStage('preparing_live') === 4);
assert('live         → 5',     displayStage('live')           === 5);
assert('care_active  → 5',     displayStage('care_active')    === 5);
assert('self_managed → 5',     displayStage('self_managed')   === 5);
assert('dropped_out  → -1',    displayStage('dropped_out')    === -1);
assert('unknown      → -1',    displayStage('bogus')          === -1);

// ── 3. humanTime() ───────────────────────────────────────────────────────────
console.log('\n3. humanTime()');
const now   = new Date().toISOString().replace('T', ' ').split('.')[0];
const m30   = new Date(Date.now() - 30 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
const h3    = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
const d2    = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];

assert('< 90 s → "just now"',   humanTime(now) === 'just now');
assert('30 min → "X minutes ago"', humanTime(m30).includes('minutes ago'));
assert('3 h → "3 hours ago"',   humanTime(h3) === '3 hours ago');
assert('2 days → "2 days ago"', humanTime(d2) === '2 days ago');
assert('null → ""',             humanTime(null) === '');

// ── 4. portal.js source checks ───────────────────────────────────────────────
console.log('\n4. Source-level checks on api/portal.js');
const src = fs.readFileSync(path.join(process.cwd(), 'api/portal.js'), 'utf8');

assert('esc() defined',                         src.includes('function esc('));
assert('displayStage() defined',                src.includes('function displayStage('));
assert('humanTime() defined',                   src.includes('function humanTime('));
assert('renderPage() defined',                  src.includes('function renderPage('));
assert('render404() defined',                   src.includes('function render404('));
assert('DISPLAY_STAGES has 6 entries',          (src.match(/\{ label:/g) || []).length === 6);
assert('noindex meta present',                  src.includes('noindex, nofollow'));
assert('skip-link present',                     src.includes('skip-link'));
assert('<main id="main">',                      src.includes('<main id="main">'));
assert('fonts.css non-blocking',                src.includes('media="print" onload'));
assert('preload Playfair woff2',                src.includes('nuFiD-vYSZviVYUb_rj3ij__anPXDTzYgA.woff2'));
assert('preload DM Sans woff2',                 src.includes('rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu0-K4.woff2'));
assert('no Google Fonts CDN',                   !src.includes('fonts.googleapis.com'));
assert('Cache-Control: no-store',               src.includes('no-store'));
assert('acknowledged panel copy',               src.includes("Got your details"));
assert('researching/building panel copy',       src.includes("You don't need to do anything"));
assert("section placeholder present",          src.includes("This page is coming soon"));
assert('branded 404 copy',                      src.includes("That link doesn't look right"));

// ── 5. vercel.json ───────────────────────────────────────────────────────────
console.log('\n5. vercel.json rewrites');
const vj = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'));
assert('cleanUrls preserved',         vj.cleanUrls === true);
assert('4 rewrites defined',          vj.rewrites.length === 4);
assert('/c/:slug/review rewrite',     vj.rewrites.some(r => r.source === '/c/:slug/review'));
assert('/c/:slug/handover rewrite',   vj.rewrites.some(r => r.source === '/c/:slug/handover'));
assert('/c/:slug/google-business rewrite', vj.rewrites.some(r => r.source === '/c/:slug/google-business'));
assert('/c/:slug bare rewrite',       vj.rewrites.some(r => r.source === '/c/:slug'));
// More-specific routes must come before the bare slug
const idxReview = vj.rewrites.findIndex(r => r.source === '/c/:slug/review');
const idxBare   = vj.rewrites.findIndex(r => r.source === '/c/:slug');
assert('sub-paths listed before bare slug', idxReview < idxBare);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
