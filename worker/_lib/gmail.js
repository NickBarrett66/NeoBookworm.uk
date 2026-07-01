// Gmail API sender — replaces the Vercel SMTP bridge. HTTP-only, Worker-safe.
// Secrets: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
// Optional KV: SUMMARY_CACHE (caches the 1-hour access token)
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL  = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const FROM      = '"Nick at NeoBookworm" <nick@neobookworm.uk>';
const REPLY_TO  = 'nick@neobookworm.uk';

async function getAccessToken(env) {
  if (env.SUMMARY_CACHE) {
    const cached = await env.SUMMARY_CACHE.get('gmail_access_token');
    if (cached) return cached;
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
    }),
  });
  if (!res.ok) throw new Error(`Gmail token HTTP ${res.status}: ${await res.text()}`);
  const { access_token, expires_in } = await res.json();
  if (env.SUMMARY_CACHE && access_token) {
    await env.SUMMARY_CACHE.put('gmail_access_token', access_token,
      { expirationTtl: Math.max(60, (expires_in || 3600) - 120) });
  }
  return access_token;
}

function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeSubject(subject) {
  // RFC 2047 B-encoding — required whenever subject contains non-ASCII (e.g. em dashes).
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
}

function buildMime({ to, subject, body, replyTo }) {
  const headers = [
    `From: ${FROM}`, `To: ${to}`, `Reply-To: ${replyTo || REPLY_TO}`,
    `Subject: ${encodeSubject(subject)}`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
  ].join('\r\n');
  return b64url(new TextEncoder().encode(`${headers}\r\n\r\n${body}`));
}

export async function sendViaGmail(env, { to, subject, body, replyTo }) {
  const token = await getAccessToken(env);
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: buildMime({ to, subject, body, replyTo }) }),
  });
  if (!res.ok) throw new Error(`Gmail send HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}
