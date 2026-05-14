// POST JSON { fullName, bizName, email, startOption, details, source, currentUrl? }
//
// Lightweight enquiry endpoint for trade landing pages (e.g. /plumbers).
// No photo uploads or session handling — contrast with intake-finalize.js.
//
// Steps:
//   1. Validate required fields (fullName, bizName, email)
//   2. Create a row in the Client Sites Notion database (same as intake-finalize.js)
//   3. Send a notification email to Nick via SMTP
//   4. Return { ok: true }
//
// Required env vars (same as contact.js / intake):
//   NOTION_API_KEY   — Notion internal integration secret
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
// Optional:
//   TO_EMAIL         — defaults to neobookworm@icloud.com
//
// Notion: Client Sites database (see intake-shared.js DATABASE_ID).
// Populated columns: Business Name, Full name, Client Email, Trade Category, Status,
// Additional notes (source, start option, current URL, free-text details).

const intake = require('./intake-shared.js');

// ─── Body parsing (mirrors intake-finalize.js for Vercel compatibility) ────────

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

// ─── Email notification ────────────────────────────────────────────────────────

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
    `Name:          ${fields.fullName || ''}`,
    `Business:      ${fields.bizName  || ''}`,
    `Email:         ${fields.email    || ''}`,
    `Current URL:   ${fields.currentUrl || '(not provided)'}`,
    `Start option:  ${fields.startOption || '(not set)'}`,
    `Source:        ${fields.source   || '(not set)'}`,
    ...(notionUrl ? ['', `Notion record: ${notionUrl}`] : []),
    '',
    'Notes / details:',
    fields.details || '(none)',
    '',
    '---------------------------------------',
    `Sent via neobookworm.uk/${(fields.source || 'landing').replace('-landing', '')}`,
  ].join('\n');

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('[landing-enquiry] SMTP not configured — would have sent:\n' + emailBody);
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

  console.log('[landing-enquiry] notification email sent to', toEmail);
}

// ─── Handler ───────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = parseJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { fullName, bizName, email, startOption, details, source, currentUrl } = body;

  if (!fullName || !String(fullName).trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (!bizName || !String(bizName).trim()) {
    return res.status(400).json({ error: 'Business name is required.' });
  }
  if (!email || !String(email).trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const fields = {
    fullName:    String(fullName).trim(),
    bizName:     String(bizName).trim(),
    email:       String(email).trim(),
    startOption: startOption ? String(startOption).trim() : '',
    details:     details     ? String(details).trim()     : '',
    source:      source      ? String(source).trim()      : 'landing',
    currentUrl:  currentUrl  ? String(currentUrl).trim()  : '',
  };

  let notionPageId = null;
  try {
    const page = await intake.createLandingEnquiryRecord(fields);
    notionPageId = page && page.id;
  } catch (notionErr) {
    console.error('[landing-enquiry] Notion error (continuing):', notionErr.message);
  }

  try {
    await sendNotification(fields, notionPageId);
  } catch (mailErr) {
    console.error('[landing-enquiry] Email error (continuing):', mailErr.message);
  }

  return res.status(200).json({ ok: true });
};
