// Admin capability keys for management links embedded in Howie's calendar events.
//
// A booking's manage_token already authorises cancel/reschedule for that one
// booking. The admin key is an HMAC of the manage_token keyed by ADMIN_SECRET —
// it grants the STAFF-only extras (bypass the customer cancellation cutoff, staff
// copy) without putting the master ADMIN_SECRET into calendar data. The HMAC is
// one-way, so a leaked calendar link cannot be reversed into the secret, and a
// customer who only has their own plain manage link cannot forge the admin key.

const enc = new TextEncoder();

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Returns the admin key for a manage token, or null if no secret configured. */
export async function makeAdminKey(env, manageToken) {
  if (!env?.ADMIN_SECRET || !manageToken) return null;
  return hmacHex(env.ADMIN_SECRET, `admin:${manageToken}`);
}

/** Constant-time-ish verify of an admin key against a manage token. */
export async function verifyAdminKey(env, manageToken, key) {
  if (!env?.ADMIN_SECRET || !manageToken || !key) return false;
  const expected = await hmacHex(env.ADMIN_SECRET, `admin:${manageToken}`);
  if (expected.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ key.charCodeAt(i);
  }
  return diff === 0;
}
