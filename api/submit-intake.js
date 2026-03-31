// Vercel serverless function — receives intake form POST and creates a row
// in the Notion "Client Sites" database.
//
// Required environment variable: NOTION_API_KEY

const DATABASE_ID = '4b45078a341941bcb5877e52f3d27c6c';
const NOTION_VERSION = '2022-06-28';

const TRADE_MAP = {
  'Plumber':                      'Plumber',
  'Electrician':                  'Electrician',
  'Painter and Decorator':        'Painter / Decorator',
  'Painter / Decorator':          'Painter / Decorator',
  'Roofer':                       'Roofer',
  'Kitchen Fitter':               'Kitchen Fitter',
  'Bathroom Fitter':              'Bathroom Fitter',
  'Landscaper / Gardener':        'Landscaper',
  'Landscaper':                   'Landscaper',
  'Carpenter / Joiner':           'Carpenter / Joiner',
  'Builder / General Contractor': 'Builder',
  'Builder':                      'Builder',
  'Other':                        'Other',
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    console.error('NOTION_API_KEY environment variable is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Vercel automatically parses JSON bodies when Content-Type is application/json
  const data = req.body;
  if (!data) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const tradeName = TRADE_MAP[data.trade] || 'Other';

  const notes = [data.services, data.extra]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join('\n\n---\n\n')
    .slice(0, 2000);

  const notionBody = {
    parent: { database_id: DATABASE_ID },
    properties: {
      'Business Name': {
        title: [{ text: { content: data.bizName || 'Unknown' } }],
      },
      'Client Email': {
        email: data.email || null,
      },
      'Phone': {
        phone_number: data.phone || null,
      },
      'Trade Category': {
        select: { name: tradeName },
      },
      'Status': {
        select: { name: 'Pending Launch' },
      },
      ...(notes
        ? { 'Notes': { rich_text: [{ text: { content: notes } }] } }
        : {}),
    },
  };

  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION,
      },
      body: JSON.stringify(notionBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Notion API error:', response.status, errText);
      return res.status(500).json({ error: 'Failed to create Notion record' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
};
