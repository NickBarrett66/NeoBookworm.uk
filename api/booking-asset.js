// Upload a branding asset (logo, later gallery/content images) for a booking
// tenant. Called by the dashboard Bookings tab when Nick picks a file.
//
// Flow: dashboard reads the file as base64 → POSTs here → we upload to R2 via the
// shared uploadToR2 helper → return the public URL → dashboard stores that URL in
// the tenant config (tenant_save). The booking Worker only ever stores/serves the
// URL string — this keeps the image field type identical to any future content
// image, which is the seed of the client-CMS direction.
//
// Auth: Authorization: Bearer <DASHBOARD_SECRET> (same as the dashboard).
//
// Body (JSON): { slug, filename, contentType, dataBase64 }
// Returns: { ok: true, url } | { ok: false, error }

const { uploadToR2 } = require('./_lib/intake-shared');

const MAX_BASE64_BYTES = 3 * 1024 * 1024; // ~2.2 MB decoded — plenty for a logo

function parseBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  try { return JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : b); } catch { return null; }
}

function safeSlugSegment(slug) {
  const s = String(slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  return s || 'misc';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const secret = process.env.DASHBOARD_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== secret) return res.status(401).json({ ok: false, error: 'Unauthorised' });
  }

  const body = parseBody(req);
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'Invalid JSON body' });

  const { slug, filename, contentType, dataBase64 } = body;
  if (!dataBase64 || !filename) return res.status(400).json({ ok: false, error: 'filename and dataBase64 required' });
  if (typeof dataBase64 !== 'string' || dataBase64.length > MAX_BASE64_BYTES * 1.4) {
    return res.status(413).json({ ok: false, error: 'Image is too large (max ~2 MB)' });
  }

  let buffer;
  try {
    buffer = Buffer.from(dataBase64, 'base64');
  } catch {
    return res.status(400).json({ ok: false, error: 'Could not decode image data' });
  }
  if (!buffer.length) return res.status(400).json({ ok: false, error: 'Empty file' });

  try {
    const url = await uploadToR2(buffer, filename, contentType, `booking-assets/${safeSlugSegment(slug)}`);
    return res.status(200).json({ ok: true, url });
  } catch (err) {
    console.error('[booking-asset]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
