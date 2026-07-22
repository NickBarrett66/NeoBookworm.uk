// VDG proxy for reg-test.html — VehicleDetails (make/model/colour) + TyreDetails.
// Ported from api/vdg-lookup.js (Vercel) — Worker ES module version.
// Set VDG_API_KEY as a Worker secret (trial key from panel.vehicledataglobal.com):
//   npx wrangler secret put VDG_API_KEY --name neobookworm-uk

import { lookupVehicleAndTyres } from '../_lib/vdg.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export async function handle(request, env, ctx, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const apiKey = env.VDG_API_KEY;
  if (!apiKey) {
    return json({
      error: 'VDG_API_KEY not configured',
      detail: 'Add the Vehicle Data Global API key as a Worker secret (wrangler secret put VDG_API_KEY).',
    }, 500);
  }

  let reg = '';
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      reg = body?.reg || '';
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
  } else {
    reg = url.searchParams.get('reg') || '';
  }

  const result = await lookupVehicleAndTyres(apiKey, reg);
  return json(result, result.status || (result.ok ? 200 : 400));
}
