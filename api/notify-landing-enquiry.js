// POST JSON { fullName, bizName, email, startOption, source, currentUrl, details, notionPageId }
//
// Thin notification endpoint called by the landing-enquiry Cloudflare Worker after a
// successful D1 insert. Sends a notification email to Nick via iCloud SMTP.
//
// Cloudflare Workers cannot open TCP connections to SMTP ports, so SMTP stays here on Vercel.
//
// Security: request must include header X-Notify-Secret matching NOTIFY_SECRET env var.
//
// Required env vars:
//   NOTIFY_SECRET  — shared secret (must match wrangler secret NOTIFY_SECRET on Worker)
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
// Optional:
//   TO_EMAIL       — defaults to neobookworm@icloud.com

// ─── Body parsing ──────────────────────────────────────────────────────────────

function parseJsonBody(req) {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch { return null; }
  }
  if (Buffer.isBuffer(b)) {
    try { return JSON.parse(b.toString('utf8')); } catch { return null; }
  }
  return null;
}

// ─── Email ─────────────────────────────────────────────────────────────────────

async function sendNotification(fields, notionPageId) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const toEmail  = process.env.TO_EMAIL || 'neobookworm@icloud.com';

  const notionUrl = notionPageId
    ? `https://www.notion.so/${notionPageId.replace(/-/g, '')}`
    : null;

  const emailBody = [
    'New landing page enquiry — NeoBookworm',
    '=======================================',
    `Name:          ${fields.fullName    || ''}`,
    `Business:      ${fields.bizName     || ''}`,
    `Email:         ${fields.email       || ''}`,
    `Current URL:   ${fields.currentUrl  || '(not provided)'}`,
    `Start option:  ${fields.startOption || '(not set)'}`,
    `Source:        ${fields.source      || '(not set)'}`,
    ...(notionUrl ? ['', `Notion record: ${notionUrl}`] : []),
    '',
    'Notes / details:',
    fields.details || '(none)',
    '',
    '---------------------------------------',
    `Sent via neobookworm.uk/${(fields.source || 'landing').replace('-landing', '')}`,
  ].join('\n');

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('[notify-landing-enquiry] SMTP not configured — would have sent:\n' + emailBody);
    return;
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host:   smtpHost,
    port:   smtpPort,
    secure: smtpPort === 465,
    auth:   { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from:    `"NeoBookworm Enquiry" <${smtpUser}>`,
    to:      toEmail,
    replyTo: fields.email,
    subject: `New enquiry — ${fields.bizName || fields.fullName || 'landing page'}`,
    text:    emailBody,
  });

  console.log('[notify-landing-enquiry] notification email sent to', toEmail);
}

// ─── Handler ───────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // ── Authenticate ──────────────────────────────────────────────────────────
  const notifySecret = process.env.NOTIFY_SECRET;
  if (!notifySecret) {
    console.error('[notify-landing-enquiry] NOTIFY_SECRET env var not set');
    return res.status(500).json({ error: 'Notify endpoint not configured.' });
  }

  const providedSecret = req.headers['x-notify-secret'];
  if (!providedSecret || providedSecret !== notifySecret) {
    console.warn('[notify-landing-enquiry] Invalid or missing X-Notify-Secret');
    return res.status(401).json({ error: 'Unauthorised.' });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = parseJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { fullName, bizName, email, startOption, source, currentUrl, details, notionPageId } = body;

  const fields = {
    fullName:    fullName    ? String(fullName).trim()    : '',
    bizName:     bizName     ? String(bizName).trim()     : '',
    email:       email       ? String(email).trim()       : '',
    startOption: startOption ? String(startOption).trim() : '',
    source:      source      ? String(source).trim()      : 'landing',
    currentUrl:  currentUrl  ? String(currentUrl).trim()  : '',
    details:     details     ? String(details).trim()     : '',
  };

  // ── Send notification ─────────────────────────────────────────────────────
  try {
    await sendNotification(fields, notionPageId || null);
  } catch (mailErr) {
    console.error('[notify-landing-enquiry] Email error:', mailErr.message);
    return res.status(500).json({ error: 'Failed to send notification email.' });
  }

  return res.status(200).json({ ok: true });
};
