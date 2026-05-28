'use strict';

// POST /api/run-site-audit
//
// Triggers a Claude-powered site audit for a J2 client (free site review journey).
// Called automatically by the CF Worker after a J2 enquiry is acknowledged,
// and manually via the dashboard "Re-run audit" / "Test run" buttons.
//
// Auth:
//   Authorization: Bearer <ONBOARDING_INTAKE_SECRET>
//   (re-uses the same secret as /api/onboarding-intake to minimise env var sprawl)
//
// Request body:
//   { slug: string, dry_run?: boolean, test_mode?: boolean }
//
// Response:
//   200 { ok: true, review: string, test_mode?: true, dry_run?: true }
//   400 { ok: false, error: string }     — bad input or non-J2 client
//   401 { error: "Unauthorised" }
//   500 { ok: false, error: string }
//
// Modes:
//   test_mode: true  — returns fixture, no Claude call, no D1 write, no Nick email
//   dry_run:   true  — calls Claude, returns result, no D1 write, no Nick email
//   (default)        — calls Claude, stores review in D1, emails Nick
//
// test_mode also auto-activates when the client's business_name contains "test".

const { runSiteAudit } = require('./_lib/audit');

function parseBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  try { return JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : b); } catch { return {}; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Auth — same secret as onboarding-intake so the Worker needs only one secret
  const expected = process.env.ONBOARDING_INTAKE_SECRET;
  if (expected) {
    const auth  = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== expected) return res.status(401).json({ error: 'Unauthorised' });
  }

  if (!process.env.CF_API_TOKEN) {
    return res.status(500).json({ error: 'CF_API_TOKEN not configured' });
  }

  const body = parseBody(req);
  const { slug, dry_run = false, test_mode = false } = body;
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ ok: false, error: 'slug required' });
  }

  try {
    const result = await runSiteAudit(slug, { dryRun: Boolean(dry_run), testMode: Boolean(test_mode) });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error('[run-site-audit]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
