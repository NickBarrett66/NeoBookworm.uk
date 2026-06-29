// Shared D1 + KV helper for Vercel serverless functions.
//
// Single source of truth for:
//   - the Cloudflare account id
//   - the two D1 database ids (prospects, enquiries)
//   - the `queryD1(dbId, sql, params)` function that proxies a query to
//     the Cloudflare REST API and returns the result rows
//   - `kvGet(key)` / `kvSet(key, value, ttlSeconds)` for the KV REST API
//
// Originally inlined in api/dashboard.js; extracted in Session 0 of the
// onboarding build plan so new functions (portal, onboarding-intake,
// stripe-webhook, cron-nudge) can import one battle-tested copy.
//
// Required env var:
//   CF_API_TOKEN       — Cloudflare API token with D1:Edit + KV:Edit permission
// Optional (sensible production defaults if unset):
//   CF_ACCOUNT_ID      — defaults to the NeoBookworm Cloudflare account
//   D1_PROSPECTS_ID    — defaults to neobookworm-prospects DB id
//   D1_ENQUIRIES_ID    — defaults to neobookworm-enquiries DB id
//   KV_SUMMARY_CACHE_ID — KV namespace for dashboard summary cache (DASHBOARD_SUMMARY_CACHE)

const CF_ACCOUNT_ID_DEFAULT   = '4f0a019a24cacd090cf6b3c3cf31c732';
const D1_PROSPECTS_ID_DEFAULT = '0ae32598-1680-4995-a010-96b647eacabd';
const D1_ENQUIRIES_ID_DEFAULT = '771b3047-f977-485e-9cfb-736815931998';
const KV_SUMMARY_CACHE_ID_DEFAULT = '6fdba13203444cbebf4ca88e21c3e620';

function accountId()      { return process.env.CF_ACCOUNT_ID       || CF_ACCOUNT_ID_DEFAULT; }
function prospectsDb()    { return process.env.D1_PROSPECTS_ID     || D1_PROSPECTS_ID_DEFAULT; }
function enquiriesDb()    { return process.env.D1_ENQUIRIES_ID     || D1_ENQUIRIES_ID_DEFAULT; }
function kvSummaryCacheId() { return process.env.KV_SUMMARY_CACHE_ID || KV_SUMMARY_CACHE_ID_DEFAULT; }

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

// KV REST API helpers — used for caching expensive D1 queries.
// Both functions swallow errors silently so a KV outage never breaks the caller.

async function kvGet(key) {
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId()}/storage/kv/namespaces/${kvSummaryCacheId()}/values/${encodeURIComponent(key)}`,
      { headers: { 'Authorization': `Bearer ${process.env.CF_API_TOKEN}` } }
    );
    if (!res.ok) return null;
    const text = await res.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function kvSet(key, value, ttlSeconds = 300) {
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId()}/storage/kv/namespaces/${kvSummaryCacheId()}/values/${encodeURIComponent(key)}?expiration_ttl=${ttlSeconds}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${process.env.CF_API_TOKEN}`,
          'Content-Type':  'text/plain',
        },
        body: JSON.stringify(value),
      }
    );
    await res.text(); // drain body so Node doesn't close the connection early
  } catch {
    // Cache write failure is non-fatal — caller returns fresh D1 data
  }
}

module.exports = {
  queryD1,
  kvGet,
  kvSet,
  prospectsDb,
  enquiriesDb,
  accountId,
};
