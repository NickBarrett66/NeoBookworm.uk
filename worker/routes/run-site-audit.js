// POST /api/run-site-audit
// Thin wrapper around worker/_lib/audit.js runSiteAudit.
// Auth: Authorization: Bearer <ONBOARDING_INTAKE_SECRET>

import { runSiteAudit } from '../_lib/audit.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handle(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const expected = env.ONBOARDING_INTAKE_SECRET;
  if (expected) {
    const auth  = request.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== expected) return json({ error: 'Unauthorised' }, 401);
  }

  if (!env.CF_API_TOKEN) return json({ error: 'CF_API_TOKEN not configured' }, 500);

  let body = {};
  try { body = await request.json(); } catch { /* empty body */ }

  const { slug, dry_run = false, test_mode = false } = body;
  if (!slug || typeof slug !== 'string') return json({ ok: false, error: 'slug required' }, 400);

  try {
    const result = await runSiteAudit(env, slug, { dryRun: Boolean(dry_run), testMode: Boolean(test_mode) });
    return json(result, result.ok ? 200 : 400);
  } catch (err) {
    console.error('[run-site-audit]', err.message);
    return json({ ok: false, error: err.message }, 500);
  }
}
