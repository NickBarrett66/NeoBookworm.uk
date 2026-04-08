// POST JSON { session, ...same field names as multipart intake }
// Verifies R2 objects exist, creates Notion row, writes idempotency marker.

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
    if (
      /Missing|Invalid|expired|signature|layout|required|Empty|exceeds|finish uploading/i.test(msg)
    ) {
      status = 400;
    }
    if (/NOTION_API_KEY|R2 configuration|endpoint missing/i.test(msg)) {
      status = 500;
    }
    return res.status(status).json({ error: msg });
  }
};
