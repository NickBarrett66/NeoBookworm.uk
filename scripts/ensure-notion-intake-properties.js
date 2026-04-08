/**
 * One-off: PATCH the Client Sites database to add intake properties that are missing.
 * Requires NOTION_API_KEY (internal integration secret) and integration access to the DB.
 *
 * Run from repo root:
 *   $env:NOTION_API_KEY="secret_..."; node scripts/ensure-notion-intake-properties.js
 *   node --env-file=.env.local scripts/ensure-notion-intake-properties.js
 *
 * Does not remove or rename existing columns. If a property name already exists, it is skipped.
 * After success, verify in Notion: Trade Category select options should include all trades you use.
 *
 * Docs: https://developers.notion.com/reference/update-a-database
 */

'use strict';

const NOTION_VERSION = '2022-06-28';
const DATABASE_ID = process.env.NOTION_DATABASE_ID || '4b45078a341941bcb5877e52f3d27c6c';

/** Property definitions to merge in (only missing keys are sent). */
const INTAKE_PROPERTIES = {
  'Full name': { rich_text: {} },
  Area: { rich_text: {} },
  'Years trading': { number: {} },
  Accreditations: { rich_text: {} },
  'Free quotes': {
    select: {
      options: [{ name: 'Yes', color: 'green' }, { name: 'No', color: 'red' }],
    },
  },
  'Emergency callouts': {
    select: {
      options: [{ name: 'Yes', color: 'green' }, { name: 'No', color: 'red' }],
    },
  },
  'Work exclusions': { rich_text: {} },
  About: { rich_text: {} },
  'Team size': { rich_text: {} },
  'Ideal work': { rich_text: {} },
  'Colour preferences': { rich_text: {} },
  'Website style': { rich_text: {} },
  'Inspiration URL': { url: {} },
  Testimonials: { rich_text: {} },
  'Google Business profile': {
    select: {
      options: [
        { name: 'Yes', color: 'green' },
        { name: 'No', color: 'red' },
        { name: 'Unsure', color: 'gray' },
      ],
    },
  },
  'Trust marks': { rich_text: {} },
  'Domain status': {
    select: {
      options: [
        { name: 'Yes', color: 'green' },
        { name: 'No', color: 'red' },
        { name: 'Unsure', color: 'gray' },
      ],
    },
  },
  'Domain name': { rich_text: {} },
  'Contact methods': { rich_text: {} },
  'Working hours': { rich_text: {} },
  'Additional notes': { rich_text: {} },
  'Work photos': { files: {} },
};

async function main() {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    console.error('Set NOTION_API_KEY');
    process.exit(1);
  }

  const getRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}`, {
    headers: {
      Authorization:    `Bearer ${apiKey.trim()}`,
      'Notion-Version': NOTION_VERSION,
    },
  });

  if (!getRes.ok) {
    console.error('GET database failed:', getRes.status, await getRes.text());
    process.exit(2);
  }

  const db = await getRes.json();
  const existingNames = new Set(Object.keys(db.properties || {}));

  const toAdd = {};
  for (const [name, def] of Object.entries(INTAKE_PROPERTIES)) {
    if (!existingNames.has(name)) {
      toAdd[name] = def;
    }
  }

  if (!Object.keys(toAdd).length) {
    console.log('All intake properties already present on database. Nothing to PATCH.');
    return;
  }

  console.log('Adding properties:', Object.keys(toAdd).join(', '));

  const patchRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}`, {
    method: 'PATCH',
    headers: {
      Authorization:     `Bearer ${apiKey.trim()}`,
      'Content-Type':    'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify({ properties: toAdd }),
  });

  if (!patchRes.ok) {
    console.error('PATCH database failed:', patchRes.status, await patchRes.text());
    process.exit(3);
  }

  console.log('Database updated. In Notion, confirm Trade Category options match your intake trades.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
