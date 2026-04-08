// POST JSON { photos: [{ name, mimeType }], logo?: { name, mimeType } }
// Returns presigned PUT URLs for direct browser upload to R2 (bypasses Vercel 4.5 MB limit).

const intake = require('./intake-shared.js');

function parseJsonBody(req) {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(b)) {
    try {
      return JSON.parse(b.toString('utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

module.exports = async (req, res) => {
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
};
