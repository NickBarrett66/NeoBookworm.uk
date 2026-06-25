'use strict';

// SMTP bridge endpoint — called by the Cloudflare Worker's route handlers.
//
// POST /api/send-email
//   Authorization: Bearer <BRIDGE_SECRET>
//   Content-Type: application/json
//
// Body (template mode):
//   { slug, templateId, vars, to }
//
// Body (manual mode):
//   { slug, templateId: 'manual', subject, body, to }
//
// Returns { ok: true } or { ok: false, error: string }. Never throws.
//
// Required Vercel env vars:
//   BRIDGE_SECRET   — shared secret with the Cloudflare Worker
//   GW_SMTP_USER    — nick@neobookworm.uk
//   GW_SMTP_PASS    — Google Workspace app-specific password
//   CF_API_TOKEN    — Cloudflare API token (D1 email_log writes)

const { renderTemplate } = require('./_lib/templates');
const { queryD1, enquiriesDb } = require('./_lib/d1');

// Lazy-initialised GW SMTP transport.
let _transport = null;

function _getTransport() {
  if (_transport) return _transport;
  const nodemailer = require('nodemailer');
  const user = process.env.GW_SMTP_USER;
  const pass = process.env.GW_SMTP_PASS;
  if (!user || !pass) throw new Error('GW_SMTP_USER and GW_SMTP_PASS must be set');
  _transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
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
    console.error('[send-email.js] email_log INSERT failed:', err.message);
  }
}

module.exports = async function handler(req, res) {
  // Method guard
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Auth
  const expectedSecret = process.env.BRIDGE_SECRET;
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!expectedSecret || !token || token !== expectedSecret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const { slug, templateId, vars, to, subject: manualSubject, body: manualBody } = req.body || {};

  // Basic input validation
  if (!slug || !templateId || !to) {
    return res.status(400).json({ ok: false, error: 'slug, templateId, and to are required' });
  }

  let subject, body;

  if (templateId === 'manual') {
    // Manual mode — caller supplies pre-rendered subject + body
    if (!manualSubject || !manualBody) {
      return res.status(400).json({ ok: false, error: 'subject and body are required for manual templateId' });
    }
    subject = manualSubject;
    body = manualBody;
  } else {
    // Template mode — renderTemplate throws on bad id/vars (programmer error → 400)
    try {
      ({ subject, body } = renderTemplate(templateId, vars || {}));
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  }

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
    return res.status(200).json({ ok: true });
  } catch (err) {
    const message = err.message || String(err);
    console.error(`[send-email.js] send failed (${templateId} → ${to}):`, message);
    await _logEmail({ slug, templateId, subject, body, to, status: 'failed', error: message });
    return res.status(200).json({ ok: false, error: message });
  }
};
