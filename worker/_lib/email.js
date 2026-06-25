// Email helper — Worker ES module version.
// Does NOT use nodemailer. Calls the Vercel SMTP bridge via fetch().
//
// Required Worker env vars:
//   VERCEL_BRIDGE_URL  — https://bridge.neobookworm.uk (no trailing slash)
//   BRIDGE_SECRET      — shared secret; must match BRIDGE_SECRET on the Vercel bridge

async function _callBridge(env, payload) {
  const url = `${env.VERCEL_BRIDGE_URL}/api/send-email`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.BRIDGE_SECRET}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { ok: false, error: `Bridge fetch failed: ${err.message}` };
  }
  if (!res.ok) return { ok: false, error: `Bridge HTTP ${res.status}` };
  try {
    return await res.json();
  } catch {
    return { ok: false, error: 'Bridge returned non-JSON response' };
  }
}

/**
 * Render a template by ID and send via the Vercel SMTP bridge.
 * Mirrors api/_lib/email.js sendTemplated — same return shape { ok, error? }.
 */
export async function sendTemplated(env, { slug, templateId, vars, to }) {
  return _callBridge(env, { slug, templateId, vars, to });
}

/**
 * Send a pre-rendered subject+body via the Vercel SMTP bridge (manual mode).
 * Used for ad-hoc notifications (audit Nick alert, intake notification).
 */
export async function sendRendered(env, { slug, templateId, subject, body, to }) {
  return _callBridge(env, {
    slug,
    templateId: templateId || 'manual',
    subject,
    body,
    to,
  });
}
