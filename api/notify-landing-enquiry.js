// Two call patterns:
//
// 1. Single enquiry (Phase 2 — existing behaviour):
//    POST JSON { fullName, bizName, email, startOption, source, currentUrl, details, notionPageId }
//    → sends a notification email for one new enquiry.
//
// 2. Daily digest (Phase 3):
//    POST JSON { type: "digest", rows: [ { id, created_at, email, biz_name, source,
//                                          notion_status, email_status, notion_error, email_error }, … ] }
//    → sends one summary email listing all rows still failing after retries.
//    → if rows is empty or omitted, returns 200 without sending.
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

// ─── Digest email ──────────────────────────────────────────────────────────────

async function sendDigest(rows) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const toEmail  = process.env.TO_EMAIL || 'neobookworm@icloud.com';

  const lines = [
    'NeoBookworm — landing enquiries needing attention',
    '==================================================',
    `${rows.length} row(s) with a failed sync leg as of ${new Date().toUTCString()}`,
    '',
  ];

  rows.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.biz_name || r.email || r.id}`);
    lines.push(`   ID:         ${r.id}`);
    lines.push(`   Created:    ${r.created_at}`);
    lines.push(`   Email:      ${r.email || '(none)'}`);
    lines.push(`   Source:     ${r.source || '(none)'}`);
    // Notion is retired (Session 0). Older payloads may still include notion_status
    // — render that line only if the field is present.
    if (r.notion_status) {
      lines.push(`   Notion:     ${r.notion_status}${r.notion_error ? ` — ${r.notion_error}` : ''}`);
    }
    lines.push(`   Email leg:  ${r.email_status}${r.email_error  ? ` — ${r.email_error}`  : ''}`);
    lines.push('');
  });

  lines.push('---------------------------------------');
  lines.push('Use the wrangler command in the Worker README to query D1 directly.');

  const emailBody = lines.join('\n');

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('[notify-landing-enquiry] SMTP not configured — digest would have sent:\n' + emailBody);
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
    subject: 'NeoBookworm: landing enquiries needing attention',
    text:    emailBody,
  });

  console.log('[notify-landing-enquiry] digest email sent to', toEmail, `(${rows.length} rows)`);
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

  // ── Route: digest vs single enquiry ──────────────────────────────────────
  if (body.type === 'digest') {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) {
      // Nothing to report — return 200 silently.
      return res.status(200).json({ ok: true, sent: false });
    }
    try {
      await sendDigest(rows);
    } catch (mailErr) {
      console.error('[notify-landing-enquiry] Digest email error:', mailErr.message);
      return res.status(500).json({ error: 'Failed to send digest email.' });
    }
    return res.status(200).json({ ok: true, sent: true, count: rows.length });
  }

  // ── Single enquiry notification (Phase 2 behaviour) ───────────────────────
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

  try {
    await sendNotification(fields, notionPageId || null);
  } catch (mailErr) {
    console.error('[notify-landing-enquiry] Email error:', mailErr.message);
    return res.status(500).json({ error: 'Failed to send notification email.' });
  }

  return res.status(200).json({ ok: true });
};
