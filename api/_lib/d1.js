// Shared D1 helper for Vercel serverless functions.
//
// Single source of truth for:
//   - the Cloudflare account id
//   - the two D1 database ids (prospects, enquiries)
//   - the `queryD1(dbId, sql, params)` function that proxies a query to
//     the Cloudflare REST API and returns the result rows
//
// Originally inlined in api/dashboard.js; extracted in Session 0 of the
// onboarding build plan so new functions (portal, onboarding-intake,
// stripe-webhook, cron-nudge) can import one battle-tested copy.
//
// Required env var:
//   CF_API_TOKEN       — Cloudflare API token with D1:Edit permission
// Optional (sensible production defaults if unset):
//   CF_ACCOUNT_ID      — defaults to the NeoBookworm Cloudflare account
//   D1_PROSPECTS_ID    — defaults to neobookworm-prospects DB id
//   D1_ENQUIRIES_ID    — defaults to neobookworm-enquiries DB id

const CF_ACCOUNT_ID_DEFAULT   = '4f0a019a24cacd090cf6b3c3cf31c732';
const D1_PROSPECTS_ID_DEFAULT = '0ae32598-1680-4995-a010-96b647eacabd';
const D1_ENQUIRIES_ID_DEFAULT = '771b3047-f977-485e-9cfb-736815931998';

function accountId()   { return process.env.CF_ACCOUNT_ID   || CF_ACCOUNT_ID_DEFAULT; }
function prospectsDb() { return process.env.D1_PROSPECTS_ID || D1_PROSPECTS_ID_DEFAULT; }
function enquiriesDb() { return process.env.D1_ENQUIRIES_ID || D1_ENQUIRIES_ID_DEFAULT; }

async function queryD1(dbId, sql, params = []) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId()}/d1/database/${dbId}/query`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.CF_API_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.errors?.[0]?.message || 'D1 query failed');
  }
  return data.result[0].results;
}

module.exports = {
  queryD1,
  prospectsDb,
  enquiriesDb,
  accountId,
};
