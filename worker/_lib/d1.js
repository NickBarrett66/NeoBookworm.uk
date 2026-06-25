// D1 helper — Worker ES module version.
// env is the Worker fetch() env arg, not process.env.

const CF_ACCOUNT_ID_DEFAULT   = '4f0a019a24cacd090cf6b3c3cf31c732';
const D1_PROSPECTS_ID_DEFAULT = '0ae32598-1680-4995-a010-96b647eacabd';
const D1_ENQUIRIES_ID_DEFAULT = '771b3047-f977-485e-9cfb-736815931998';

export function accountId(env)   { return env.CF_ACCOUNT_ID   || CF_ACCOUNT_ID_DEFAULT; }
export function prospectsDb(env) { return env.D1_PROSPECTS_ID || D1_PROSPECTS_ID_DEFAULT; }
export function enquiriesDb(env) { return env.D1_ENQUIRIES_ID || D1_ENQUIRIES_ID_DEFAULT; }

export async function queryD1(env, dbId, sql, params = []) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId(env)}/d1/database/${dbId}/query`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.CF_API_TOKEN}`,
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
