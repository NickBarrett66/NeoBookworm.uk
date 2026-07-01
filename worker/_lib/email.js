import { renderTemplate } from './templates.js';
import { queryD1, enquiriesDb } from './d1.js';
import { sendViaGmail } from './gmail.js';

async function logEmail(env, { slug, templateId, subject, body = null, to, status, error = null }) {
  try {
    await queryD1(env, enquiriesDb(env),
      `INSERT INTO email_log (slug, template, subject, body, recipient, status, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [slug, templateId, subject, body, to, status, error]);
  } catch (err) { console.error('[email] email_log INSERT failed:', err.message); }
}

async function send(env, { slug, templateId, subject, body, to }) {
  try {
    await sendViaGmail(env, { to, subject, body });
    await logEmail(env, { slug, templateId, subject, body, to, status: 'sent' });
    return { ok: true };
  } catch (err) {
    const message = err.message || String(err);
    console.error(`[email] send failed (${templateId} → ${to}):`, message);
    await logEmail(env, { slug, templateId, subject, body, to, status: 'failed', error: message });
    return { ok: false, error: message };
  }
}

export async function sendTemplated(env, { slug, templateId, vars, to }) {
  let subject, body;
  try { ({ subject, body } = renderTemplate(templateId, vars || {})); }
  catch (err) { return { ok: false, error: err.message }; }
  return send(env, { slug, templateId, subject, body, to });
}

export async function sendRendered(env, { slug, templateId, subject, body, to }) {
  if (!subject || !body) return { ok: false, error: 'subject and body required' };
  return send(env, { slug, templateId: templateId || 'manual', subject, body, to });
}
