// POST /api/onboarding-intake
//
// Vercel serverless function — Session 6 of docs/neobookworm-onboarding-build-plan-v3.md.
//
// Auto-promotes J1–J4 inbound enquiries (landing_enquiry, intake) to clients
// and sends the journey-appropriate first-acknowledgement email.
//
// Called by the landing-enquiry Cloudflare Worker in ctx.waitUntil() after
// every successful D1 insert. The enquiry is already in D1 before this call
// is made: if this call fails, the enquiry is visible in the dashboard and
// can be promoted manually with no data loss.
//
// Also callable manually via curl for testing; use a real landing_enquiries or
// intake_submissions id.
//
// Auth:
//   Authorization: Bearer <ONBOARDING_INTAKE_SECRET>
//   Set ONBOARDING_INTAKE_SECRET in Vercel env vars **and** as a Worker secret:
//     wrangler secret put ONBOARDING_INTAKE_SECRET
//
// Request body:
//   { "source_type": "landing_enquiry" | "intake", "source_id": "<uuid>" }
//
// Response:
//   200 { ok: true, slug, acknowledged: true|false, reason?, error? }
//   400 bad input or promote error
//   401 bad or missing secret
//   422 source_type requires manual promote (contact/prospect)
//   500 CF_API_TOKEN not configured
//
// Idempotent: second call with the same source returns already_promoted; second
// call after acknowledgement returns already_acknowledged.
//
// Required env vars (Vercel):
//   CF_API_TOKEN             — Cloudflare API token with D1:Edit permission
//   GW_SMTP_USER / GW_SMTP_PASS — Google Workspace SMTP (for sendTemplated)
//   ONBOARDING_INTAKE_SECRET — shared secret

'use strict';

const { promoteToClient }    = require('./_lib/promote');
const { sendAcknowledgement } = require('./_lib/acknowledge');

// Only these source types are auto-promoted. contact and prospect require the
// dashboard operator to choose a journey explicitly.
const AUTO_SOURCE_TYPES = new Set(['landing_enquiry', 'intake']);

function parseBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  try { return JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : b); } catch { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = process.env.ONBOARDING_INTAKE_SECRET;
  if (secret) {
    const auth  = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== secret) {
      return res.status(401).json({ error: 'Unauthorised' });
    }
  }

  if (!process.env.CF_API_TOKEN) {
    return res.status(500).json({ error: 'CF_API_TOKEN not configured' });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = parseBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { source_type, source_id } = body;

  if (!source_type || typeof source_type !== 'string') {
    return res.status(400).json({ error: 'source_type required' });
  }
  if (!source_id || typeof source_id !== 'string') {
    return res.status(400).json({ error: 'source_id required' });
  }

  // ── Guard: only auto-promote inbound form submissions ────────────────────
  if (!AUTO_SOURCE_TYPES.has(source_type)) {
    return res.status(422).json({
      ok:    false,
      error: `source_type "${source_type}" must be promoted manually from the dashboard (journey required)`,
    });
  }

  // ── Promote ───────────────────────────────────────────────────────────────
  let slug, created, journey;
  try {
    ({ slug, created, journey } = await promoteToClient({ source_type, source_id }));
  } catch (err) {
    console.error('[onboarding-intake] promoteToClient failed:', err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }

  if (!created) {
    // Already promoted by a previous call — idempotent path.
    console.log(`[onboarding-intake] already promoted: ${source_type}/${source_id} → ${slug}`);
    return res.status(200).json({ ok: true, slug, acknowledged: false, reason: 'already_promoted' });
  }

  // ── Acknowledge ───────────────────────────────────────────────────────────
  let acknowledged = false;
  let reason       = null;
  let ackError     = null;

  try {
    const ack = await sendAcknowledgement(slug);
    acknowledged = ack.acknowledged || false;
    reason       = ack.reason       || null;
    ackError     = ack.error        || null;
  } catch (err) {
    // Unexpected error in acknowledge — log but still return 200 (promote succeeded).
    console.error(`[onboarding-intake] sendAcknowledgement threw for ${slug}:`, err.message);
    ackError = err.message;
  }

  if (acknowledged) {
    console.log(`[onboarding-intake] promoted + acknowledged: ${source_type}/${source_id} → ${slug}`);
  } else {
    console.warn(`[onboarding-intake] promoted but not acknowledged: ${slug} reason=${reason} error=${ackError}`);
  }

  return res.status(200).json({
    ok:           true,
    slug,
    journey:      journey  || null,
    acknowledged,
    reason:       reason   || null,
    error:        ackError || null,
  });
};
