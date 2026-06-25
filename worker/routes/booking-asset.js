// Booking tenant branding asset upload — Worker ES module version.
// Auth: Authorization: Bearer <DASHBOARD_SECRET>
// Body (JSON): { slug, filename, contentType, dataBase64 }
// Returns: { ok: true, url } | { ok: false, error }

import { Buffer }     from 'node:buffer';
import { uploadToR2 } from '../_lib/intake-shared.js';

const MAX_BASE64_BYTES = 3 * 1024 * 1024; // ~2.2 MB decoded

function safeSlugSegment(slug) {
  const s = String(slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  return s || 'misc';
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function handle(request, env, ctx, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method Not Allowed' }, 405);
  }

  const secret = env.DASHBOARD_SECRET;
  if (secret) {
    const auth  = request.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== secret) return json({ ok: false, error: 'Unauthorised' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  if (!body || typeof body !== 'object') return json({ ok: false, error: 'Invalid JSON body' }, 400);

  const { slug, filename, contentType, dataBase64 } = body;
  if (!dataBase64 || !filename) return json({ ok: false, error: 'filename and dataBase64 required' }, 400);
  if (typeof dataBase64 !== 'string' || dataBase64.length > MAX_BASE64_BYTES * 1.4) {
    return json({ ok: false, error: 'Image is too large (max ~2 MB)' }, 413);
  }

  let buffer;
  try {
    buffer = Buffer.from(dataBase64, 'base64');
  } catch {
    return json({ ok: false, error: 'Could not decode image data' }, 400);
  }
  if (!buffer.length) return json({ ok: false, error: 'Empty file' }, 400);

  try {
    const uploadUrl = await uploadToR2(env, buffer, filename, contentType, `booking-assets/${safeSlugSegment(slug)}`);
    return json({ ok: true, url: uploadUrl });
  } catch (err) {
    console.error('[booking-asset]', err.message);
    return json({ ok: false, error: err.message }, 500);
  }
}
