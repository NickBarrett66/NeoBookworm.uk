// POST JSON { fullName, bizName, email, startOption, details, source, currentUrl? }
//
// Lightweight enquiry endpoint for trade landing pages (e.g. /plumbers).
// No photo uploads or session handling — contrast with intake-finalize.js.
//
// Steps:
//   1. Validate required fields (fullName, bizName, email)
//   2. Create a record in the NeoBookworm Prospects Notion database
//   3. Send a notification email to Nick via SMTP
//   4. Return { ok: true }
//
// Required env vars (same as contact.js):
//   NOTION_API_KEY   — Notion internal integration secret
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
// Optional:
//   TO_EMAIL         — defaults to neobookworm@icloud.com
//
// Notion database: NeoBookworm Prospects (id: 7787183058744a398644b2e6d511b8d6)
// Properties used:
//   Name (title)           — prospect's full name
//   Business Name (text)   — trading name
//   Email (email)          — contact email
//   Start Option (select)  — leave_it_with_me | tell_more | review_site_first | ready_to_switch | intake_form (etc.)
//   Notes (text)           — details / textarea + optional "Current website:" line from currentUrl
//   Source (select)        — e.g. plumbers-landing | plumbers-switch-landing
//
// If any property doesn't yet exist in the Prospects database, the Notion API
// will return a 400 error for that property. The endpoint catches Notion errors
// gracefully so a misconfigured database never blocks a real enquiry — the
// email notification will still reach Nick. Add missing properties via the
// Notion UI (or scripts/ensure-notion-prospects-properties.js when created).

const PROSPECTS_DB_ID  = '7787183058744a398644b2e6d511b8d6';
const NOTION_VERSION   = '2022-06-28';

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

// ─── Notion helpers ────────────────────────────────────────────────────────────

function richText(value) {
  const str = (value || '').toString().trim().slice(0, 2000);
  if (!str) return null;
  return { rich_text: [{ text: { content: str } }] };
}

function combineNotes(details, currentUrl) {
  const chunks = [];
  const u = (currentUrl || '').toString().trim();
  if (u) chunks.push(`Current website: ${u}`);
  const d = (details || '').toString().trim();
  if (d) chunks.push(d);
  return chunks.join('\n\n');
}

async function createProspectRecord(fields) {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    console.warn('[landing-enquiry] NOTION_API_KEY not set — record not saved to Notion');
    return null;
  }

  const props = {
    'Name': {
      title: [{ text: { content: (fields.fullName || 'Unknown').toString().trim().slice(0, 2000) } }],
    },
  };

  const bizRt = richText(fields.bizName);
  if (bizRt) props['Business Name'] = bizRt;

  const emailTrim = (fields.email || '').trim();
  if (emailTrim) props['Email'] = { email: emailTrim };

  const startOpt = (fields.startOption || '').toString().trim().slice(0, 100);
  if (startOpt) props['Start Option'] = { select: { name: startOpt } };

  const notesCombined = combineNotes(fields.details, fields.currentUrl);
  const notesRt = richText(notesCombined);
  if (notesRt) props['Notes'] = notesRt;

  const src = (fields.source || '').toString().trim().slice(0, 100);
  if (src) props['Source'] = { select: { name: src } };

  const body = JSON.stringify({
    parent:     { database_id: PROSPECTS_DB_ID },
    properties: props,
  });

  const res = await fetch('https://api.notion.com/v1/pages', {
    method:  'POST',
    headers: {
      Authorization:    `Bearer ${apiKey}`,
      'Content-Type':   'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Notion createPage failed: ${res.status} — ${text.slice(0, 300)}`);
  }

  const page = await res.json();
  console.log('[landing-enquiry] Notion record created:', page.id);
  return page;
}

// ─── Email notification ────────────────────────────────────────────────────────

async function sendNotification(fields) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const toEmail  = process.env.TO_EMAIL || 'neobookworm@icloud.com';

  const emailBody = [
    'New landing page enquiry — NeoBookworm',
    '=======================================',
    `Name:          ${fields.fullName || ''}`,
    `Business:      ${fields.bizName  || ''}`,
    `Email:         ${fields.email    || ''}`,
    `Current URL:   ${fields.currentUrl || '(not provided)'}`,
    `Start option:  ${fields.startOption || '(not set)'}`,
    `Source:        ${fields.source   || '(not set)'}`,
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

  // Create Notion record (best-effort: log but don't fail the request)
  try {
    await createProspectRecord(fields);
  } catch (notionErr) {
    console.error('[landing-enquiry] Notion error (continuing):', notionErr.message);
  }

  // Send email notification (best-effort)
  try {
    await sendNotification(fields);
  } catch (mailErr) {
    console.error('[landing-enquiry] Email error (continuing):', mailErr.message);
  }

  return res.status(200).json({ ok: true });
};
