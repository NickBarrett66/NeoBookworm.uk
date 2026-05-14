// Netlify/Vercel serverless — multipart intake (files proxied through the function).
// For large batches of photos use the web form's direct R2 flow instead:
//   POST /api/intake-upload-session → PUTs to R2 → POST /api/intake-finalize
//
// See api/intake-shared.js for env vars and Notion property names.

const intake = require('./intake-shared.js');

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    console.error('NOTION_API_KEY is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const contentType = req.headers['content-type'] || '';
    let fields = {};
    let photoFiles = [];
    let logoFile   = null;

    if (contentType.includes('multipart/form-data')) {
      const parsed = await intake.parseMultipart(req);
      fields     = parsed.fields;
      photoFiles = parsed.files['photos'] || parsed.files['f_photos'] || [];
      const logoArr = parsed.files['logo'] || parsed.files['f_logo'] || [];
      logoFile   = logoArr[0] || null;
      console.log('[intake] parsed fields:', Object.keys(fields));
      console.log('[intake] photo files:', photoFiles.length, '| logo:', !!logoFile);
    } else if (contentType.includes('application/json')) {
      fields = typeof req.body === 'object' && req.body && !Buffer.isBuffer(req.body) ? req.body : {};
    } else {
      return res.status(415).json({ error: 'Unsupported Content-Type' });
    }

    if (!fields.bizName && !fields.email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const safeBiz  = intake.safeFilename((fields.bizName || 'client').toLowerCase());
    const folder   = `clients/${safeBiz}`;
    const photoUrls = [];

    for (const file of photoFiles) {
      try {
        const url = await intake.uploadToR2(file.buffer, file.filename, file.mimeType, `${folder}/photos`);
        if (url) photoUrls.push(url);
      } catch (uploadErr) {
        intake.logR2UploadFailure('Photo', uploadErr);
      }
    }
    console.log('[intake] R2 photo URLs:', photoUrls);

    let logoUrl = null;
    if (logoFile) {
      try {
        logoUrl = await intake.uploadToR2(logoFile.buffer, logoFile.filename, logoFile.mimeType, `${folder}/logo`);
      } catch (uploadErr) {
        intake.logR2UploadFailure('Logo', uploadErr);
      }
    }
    console.log('[intake] R2 logo URL:', logoUrl);

    await intake.createNotionRecord(fields, photoUrls, logoUrl);

    try {
      await intake.sendIntakeNotificationEmail(fields, photoUrls, logoUrl);
    } catch (mailErr) {
      console.error('[intake] Email error (Notion row saved):', mailErr.message);
    }

    return res.status(200).json({
      success:    true,
      photoCount: photoUrls.length,
      logoUrl:    logoUrl || null,
      message:    'Intake form received successfully',
    });
  } catch (err) {
    console.error('submit-intake error:', err);
    return res.status(500).json({ error: 'Unexpected server error', detail: err.message });
  }
};

handler.config = { api: { bodyParser: false } };

/** @internal Local verification: `node scripts/verify-intake-multipart.js` */
handler._test = { parseMultipart: intake.parseMultipart, sniffMime: intake.sniffMime };

module.exports = handler;
