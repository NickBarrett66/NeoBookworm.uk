// api/vdg-lookup.js
// VDG proxy for reg-test.html — VehicleDetails (make/model/colour) + TyreDetails.
// Set VDG_API_KEY in Vercel env vars (trial key from panel.vehicledataglobal.com).

const { lookupVehicleAndTyres } = require('./_lib/vdg');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.VDG_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'VDG_API_KEY not configured',
      detail: 'Add your Vehicle Data Global API key to Vercel environment variables.',
    });
  }

  const reg = (req.method === 'POST' ? req.body?.reg : req.query?.reg) || '';
  const result = await lookupVehicleAndTyres(apiKey, reg);

  if (!result.ok) {
    return res.status(result.status).json(result);
  }

  return res.status(200).json(result);
};
