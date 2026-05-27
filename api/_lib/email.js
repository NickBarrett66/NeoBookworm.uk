// Transactional email helper — NeoBookworm onboarding.
//
// Single send path for every templated onboarding email.
// Uses Google Workspace SMTP (smtp.gmail.com:587) — separate transport from
// the iCloud config in api/contact.js which is for public enquiry forms.
//
// Required Vercel env vars:
//   GW_SMTP_USER  — nick@neobookworm.uk
//   GW_SMTP_PASS  — Google Workspace app-specific password
//   CF_API_TOKEN  — Cloudflare API token (for D1 email_log writes, shared with d1.js)
//
// Usage:
//   const { sendTemplated } = require('./_lib/email');
//   const result = await sendTemplated({ slug, templateId, vars, to });
//   // result: { ok: true } | { ok: false, error: string }

'use strict';

const { renderTemplate } = require('./templates');
const { queryD1, enquiriesDb } = require('./d1');

// Lazy-initialised transport — created once per process/function-instance lifetime.
let _transport = null;

function _getTransport() {
  if (_transport) return _transport;

  const nodemailer = require('nodemailer');

  const user = process.env.GW_SMTP_USER;
  const pass = process.env.GW_SMTP_PASS;

  if (!user || !pass) {
    throw new Error('GW_SMTP_USER and GW_SMTP_PASS must be set in Vercel env vars');
  }

  _transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // STARTTLS
    auth: { user, pass },
  });

  return _transport;
}

async function _logEmail({ slug, templateId, subject, body = null, to, status, error = null }) {
  try {
    await queryD1(
      enquiriesDb(),
      `INSERT INTO email_log (slug, template, subject, body, recipient, status, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [slug, templateId, subject, body, to, status, error]
    );
  } catch (err) {
    // Log write failures to console but never surface them to the caller.
    console.error('[email.js] email_log INSERT failed:', err.message);
  }
}

/**
 * Render a template and send it via Google Workspace SMTP, then write an
 * email_log row.
 *
 * renderTemplate() throws immediately on bad id/vars — those are programmer
 * errors and should propagate. SMTP failures are caught, logged as 'failed',
 * and returned as { ok: false, error } without throwing.
 *
 * @param {object} opts
 * @param {string} opts.slug        Client slug written to email_log.
 * @param {string} opts.templateId  Template id, e.g. 'J1-E1'.
 * @param {object} opts.vars        Template variables (validated by renderTemplate).
 * @param {string} opts.to          Recipient email address.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendTemplated({ slug, templateId, vars, to }) {
  const { subject, body } = renderTemplate(templateId, vars);

  const from = process.env.GW_SMTP_USER || 'nick@neobookworm.uk';

  try {
    const transporter = _getTransport();

    await transporter.sendMail({
      from: `"Nick at NeoBookworm" <${from}>`,
      replyTo: from,
      to,
      subject,
      text: body,
    });

    await _logEmail({ slug, templateId, subject, body, to, status: 'sent' });

    return { ok: true };
  } catch (err) {
    const message = err.message || String(err);
    console.error(`[email.js] sendTemplated failed (${templateId} → ${to}):`, message);

    await _logEmail({ slug, templateId, subject, body, to, status: 'failed', error: message });

    return { ok: false, error: message };
  }
}

module.exports = { sendTemplated };
