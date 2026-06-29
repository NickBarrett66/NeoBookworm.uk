// Combined intake handler — replaces three former Vercel endpoints.
// Routed by ?action= (or by alias path in worker/index.js):
//
//   upload-session  ← /api/intake-upload-session
//   finalize        ← /api/intake-finalize
//   onboarding      ← /api/onboarding-intake  (auth-gated)

import { buildIntakeDirectUploadSession, finalizeIntakeDirectUpload } from '../_lib/intake-shared.js';
import { promoteToClient }     from '../_lib/promote.js';
import { sendAcknowledgement } from '../_lib/acknowledge.js';

const AUTO_SOURCE_TYPES = new Set(['landing_enquiry', 'intake']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── action=upload-session ────────────────────────────────────────────────────

async function handleUploadSession(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'Invalid JSON body' }, 400);

  try {
    const out = await buildIntakeDirectUploadSession(env, { photos: body.photos, logo: body.logo });
    return json(out);
  } catch (err) {
    console.error('[intake] upload-session error:', err);
    const msg = (err && err.message) || 'Server error';
    const status = /missing|required|not allowed|Too many|Invalid/i.test(msg) ? 400 : 500;
    return json({ error: msg }, status);
  }
}

// ── action=finalize ──────────────────────────────────────────────────────────

async function handleFinalize(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'Invalid JSON body' }, 400);

  try {
    const result = await finalizeIntakeDirectUpload(env, body);
    if (result.duplicate) {
      return json({
        success:    true,
        duplicate:  true,
        photoCount: result.photoUrls.length,
        logoUrl:    result.logoUrl || null,
        message:    'Intake was already submitted',
      });
    }
    return json({
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
    if (/Missing|Invalid|expired|signature|layout|required|Empty|exceeds|finish uploading/i.test(msg)) status = 400;
    if (/NOTION_API_KEY|R2 configuration|endpoint missing/i.test(msg)) status = 500;
    return json({ error: msg }, status);
  }
}

// ── action=onboarding ────────────────────────────────────────────────────────

async function handleOnboarding(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const secret = env.ONBOARDING_INTAKE_SECRET;
  if (secret) {
    const auth  = request.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== secret) return json({ error: 'Unauthorised' }, 401);
  }

  if (!env.CF_API_TOKEN) return json({ error: 'CF_API_TOKEN not configured' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'Invalid JSON body' }, 400);

  const { source_type, source_id } = body;
  if (!source_type || typeof source_type !== 'string') return json({ error: 'source_type required' }, 400);
  if (!source_id   || typeof source_id   !== 'string') return json({ error: 'source_id required' }, 400);

  if (!AUTO_SOURCE_TYPES.has(source_type)) {
    return json({
      ok:    false,
      error: `source_type "${source_type}" must be promoted manually from the dashboard (journey required)`,
    }, 422);
  }

  let slug, created, journey;
  try {
    ({ slug, created, journey } = await promoteToClient(env, { source_type, source_id }));
  } catch (err) {
    console.error('[onboarding-intake] promoteToClient failed:', err.message);
    return json({ ok: false, error: err.message }, 400);
  }

  if (!created) {
    console.log(`[onboarding-intake] already promoted: ${source_type}/${source_id} → ${slug}`);
    return json({ ok: true, slug, acknowledged: false, reason: 'already_promoted' });
  }

  let acknowledged = false;
  let reason       = null;
  let ackError     = null;

  try {
    const ack = await sendAcknowledgement(env, slug);
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

  return json({
    ok:           true,
    slug,
    journey:      journey  || null,
    acknowledged,
    reason:       reason   || null,
    error:        ackError || null,
  });
}

// ── dispatcher ───────────────────────────────────────────────────────────────

export async function handle(request, env, ctx, url) {
  // Alias paths set action directly; /api/intake uses ?action=
  const aliasAction = url._aliasAction;
  const action = aliasAction || url.searchParams.get('action') || '';

  switch (action) {
    case 'upload-session': return handleUploadSession(request, env);
    case 'finalize':       return handleFinalize(request, env);
    case 'onboarding':     return handleOnboarding(request, env);
    default:
      return json({ error: `Unknown or missing intake action: "${action}"` }, 400);
  }
}
