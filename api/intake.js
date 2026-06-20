// Combined intake function — dispatches three former endpoints by ?action=:
//
//   ?action=upload-session  (was api/intake-upload-session.js)
//       POST JSON { photos: [{ name, mimeType }], logo?: { name, mimeType } }
//       Returns presigned PUT URLs for direct browser upload to R2.
//
//   ?action=finalize        (was api/intake-finalize.js)
//       POST JSON { session, ...field names } — verifies R2 objects, creates row.
//
//   ?action=onboarding      (was api/onboarding-intake.js)
//       POST JSON { source_type, source_id } — auth-gated; promotes inbound
//       enquiry to a client and sends the first-acknowledgement email.
//
// These were merged into one file to stay under Vercel's Hobby plan 12-function
// limit. The original URLs (/api/intake-upload-session, /api/intake-finalize,
// /api/onboarding-intake) are preserved via rewrites in vercel.json, so the
// frontend and the landing-enquiry Worker need no changes.

'use strict';

const intake = require('./_lib/intake-shared.js');
const { promoteToClient }     = require('./_lib/promote');
const { sendAcknowledgement } = require('./_lib/acknowledge');

// Only these source types are auto-promoted. contact and prospect require the
// dashboard operator to choose a journey explicitly.
const AUTO_SOURCE_TYPES = new Set(['landing_enquiry', 'intake']);

function parseJsonBody(req) {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch { return null; }
  }
  if (Buffer.isBuffer(b)) {
    try { return JSON.parse(b.toString('utf8')); } catch { return null; }
  }
  return null;
}

// ── action=upload-session ────────────────────────────────────────────────────
async function handleUploadSession(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const body = parseJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  try {
    const out = await intake.buildIntakeDirectUploadSession({
      photos: body.photos,
      logo:   body.logo,
    });
    return res.status(200).json(out);
  } catch (err) {
    console.error('[intake] upload-session error:', err);
    const msg = (err && err.message) || 'Server error';
    const status = /missing|required|not allowed|Too many|Invalid/i.test(msg) ? 400 : 500;
    return res.status(status).json({ error: msg });
  }
}

// ── action=finalize ──────────────────────────────────────────────────────────
async function handleFinalize(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const body = parseJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  try {
    const result = await intake.finalizeIntakeDirectUpload(body);
    if (result.duplicate) {
      return res.status(200).json({
        success:    true,
        duplicate:  true,
        photoCount: result.photoUrls.length,
        logoUrl:    result.logoUrl || null,
        message:    'Intake was already submitted',
      });
    }
    return res.status(200).json({
      success:    true,
      duplicate:  false,
      photoCount: result.photoUrls.length,
      logoUrl:    result.logoUrl || null,
      message:    'Intake form received successfully',
    });
  } catch (err) {
    console.error('[intake] finalize error:', err);
    const msg = (err && err.message) || 'Server error';
    let status = 500;
    if (/Missing|Invalid|expired|signature|layout|required|Empty|exceeds|finish uploading/i.test(msg)) {
      status = 400;
    }
    if (/NOTION_API_KEY|R2 configuration|endpoint missing/i.test(msg)) {
      status = 500;
    }
    return res.status(status).json({ error: msg });
  }
}

// ── action=onboarding ────────────────────────────────────────────────────────
async function handleOnboarding(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Auth
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

  const body = parseJsonBody(req);
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

  if (!AUTO_SOURCE_TYPES.has(source_type)) {
    return res.status(422).json({
      ok:    false,
      error: `source_type "${source_type}" must be promoted manually from the dashboard (journey required)`,
    });
  }

  // Promote
  let slug, created, journey;
  try {
    ({ slug, created, journey } = await promoteToClient({ source_type, source_id }));
  } catch (err) {
    console.error('[onboarding-intake] promoteToClient failed:', err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }

  if (!created) {
    console.log(`[onboarding-intake] already promoted: ${source_type}/${source_id} → ${slug}`);
    return res.status(200).json({ ok: true, slug, acknowledged: false, reason: 'already_promoted' });
  }

  // Acknowledge
  let acknowledged = false;
  let reason       = null;
  let ackError     = null;

  try {
    const ack = await sendAcknowledgement(slug);
    acknowledged = ack.acknowledged || false;
    reason       = ack.reason       || null;
    ackError     = ack.error        || null;
  } catch (err) {
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
}

module.exports = async (req, res) => {
  const action = (req.query && req.query.action) || '';
  switch (action) {
    case 'upload-session': return handleUploadSession(req, res);
    case 'finalize':       return handleFinalize(req, res);
    case 'onboarding':     return handleOnboarding(req, res);
    default:
      return res.status(400).json({ error: `Unknown or missing intake action: "${action}"` });
  }
};
