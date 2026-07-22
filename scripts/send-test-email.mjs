// Fire one real J1-E1 send to a +test alias.
//
// Reads credentials from env: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,
// GMAIL_REFRESH_TOKEN, CF_API_TOKEN. All four must be set in your shell
// before running (same values as the neobookworm-uk Worker secrets — see
// `npx wrangler secret list --name neobookworm-uk`, or re-mint the Gmail
// values per docs/gmail-api-bridge-migration.md if you don't have them).
//
// Usage:
//   $env:GMAIL_CLIENT_ID="..."; $env:GMAIL_CLIENT_SECRET="..."; $env:GMAIL_REFRESH_TOKEN="..."; $env:CF_API_TOKEN="..."
//   node scripts/send-test-email.mjs
//   node scripts/send-test-email.mjs nick+test@neobookworm.uk
//
// A successful run prints "✓ Sent" and writes an email_log row with status='sent'.
// A forced send failure (e.g. wrong/expired refresh token) prints the error
// and exits 1 without throwing — check D1 email_log for a status='failed' row.

import { sendTemplated } from '../worker/_lib/email.js';

const env = {
  GMAIL_CLIENT_ID:     process.env.GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN,
  CF_API_TOKEN:        process.env.CF_API_TOKEN,
};

for (const [key, value] of Object.entries(env)) {
  if (!value) {
    console.error(`Set ${key} in the environment (same value as the neobookworm-uk Worker secret).`);
    process.exit(1);
  }
}

const to = process.argv[2] || 'nick+test@neobookworm.uk';

const vars = {
  name: 'Tom',
  business: 'Hart Plumbing',
  deliver_by: 'Tuesday 3 June',
  portal_url: 'https://neobookworm.uk/c/hart-plumbing-test/',
};

console.log(`Sending J1-E1 → ${to} …`);

const result = await sendTemplated(env, {
  slug: 'hart-plumbing-test',
  templateId: 'J1-E1',
  vars,
  to,
});

if (result.ok) {
  console.log('✓ Sent. Check inbox and query D1 email_log to confirm the row:');
  console.log("  SELECT * FROM email_log WHERE slug='hart-plumbing-test' ORDER BY id DESC LIMIT 1;");
} else {
  console.error('✗ Failed:', result.error);
  console.log('A status=\'failed\' row has been written to email_log anyway.');
  process.exit(1);
}
