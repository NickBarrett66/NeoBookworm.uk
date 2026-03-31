// Netlify serverless function — receives intake form POST and creates a row
// in the Notion "Client Sites" database.
//
// Required environment variable: NOTION_API_KEY

const DATABASE_ID = '4b45078a341941bcb5877e52f3d27c6c';
const NOTION_VERSION = '2022-06-28';

// Map form trade values → Notion select options
const TRADE_MAP = {
  'Plumber':                    'Plumber',
  'Electrician':                'Electrician',
  'Painter and Decorator':      'Painter / Decorator',
  'Painter / Decorator':        'Painter / Decorator',
  'Roofer':                     'Roofer',
  'Kitchen Fitter':             'Kitchen Fitter',
  'Bathroom Fitter':            'Bathroom Fitter',
  'Landscaper / Gardener':      'Landscaper',
  'Landscaper':                 'Landscaper',
  'Carpenter / Joiner':         'Carpenter / Joiner',
  'Builder / General Contractor': 'Builder',
  'Builder':                    'Builder',
  'Other':                      'Other',
  // Trades in form but not in Notion → 'Other'
  // Plasterer, Heating Engineer / Gas Safe, Tiler, Flooring Specialist, Handyman
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    console.error('NOTION_API_KEY environment variable is not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error' }),
    };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid request body' }),
    };
  }

  const tradeName = TRADE_MAP[data.trade] || 'Other';

  // Combine services list and any extra notes into the Notes field
  const notes = [data.services, data.extra]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join('\n\n---\n\n')
    .slice(0, 2000); // Notion rich_text has a 2000-char limit per block

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
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION,
      },
      body: JSON.stringify(notionBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Notion API error:', res.status, errText);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to create Notion record' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('Unexpected error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Unexpected server error' }),
    };
  }
};
