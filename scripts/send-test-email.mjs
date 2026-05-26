// Fire one real J1-E1 send to a +test alias.
//
// Reads credentials from env: GW_SMTP_USER, GW_SMTP_PASS, CF_API_TOKEN.
// All three must be set in your shell before running.
//
// Usage:
//   $env:GW_SMTP_USER="nick@neobookworm.uk"; $env:GW_SMTP_PASS="..."; $env:CF_API_TOKEN="..."
//   node scripts/send-test-email.mjs
//   node scripts/send-test-email.mjs nick+test@neobookworm.uk
//
// A successful run prints "✓ Sent" and writes an email_log row with status='sent'.
// A forced SMTP failure (e.g. wrong password) prints the error and exits 1
// without throwing — check D1 email_log for status='failed' row.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { sendTemplated } = require('../api/_lib/email.js');

const to = process.argv[2] || 'nick+test@neobookworm.uk';

const vars = {
  name: 'Tom',
  business: 'Hart Plumbing',
  deliver_by: 'Tuesday 3 June',
  portal_url: 'https://neobookworm.uk/c/hart-plumbing-test/',
};

console.log(`Sending J1-E1 → ${to} …`);

const result = await sendTemplated({
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
