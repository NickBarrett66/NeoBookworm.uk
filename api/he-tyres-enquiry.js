// Vercel serverless — HEtyres "Mobile fitting or other enquiry" form.
//
// Required env vars (same iCloud SMTP as api/contact.js):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
// Optional:
//   HE_TYRES_TO_EMAIL  — defaults to nickbarrett@me.com

const ALLOWED_ORIGINS = [
  'https://neobookworm.uk',
  'https://www.neobookworm.uk',
  'https://hetyres.co.uk',
  'https://www.hetyres.co.uk',
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.startsWith('http://localhost:')) return true;
  if (origin.startsWith('http://127.0.0.1:')) return true;
  return false;
}

function corsHeaders(origin) {
  if (!isAllowedOrigin(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function setCors(res, origin) {
  const headers = corsHeaders(origin);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
}

function parseBody(req) {
  const b = req.body;
  if (b == null) return null;
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch { return null; }
  }
  if (Buffer.isBuffer(b)) {
    try { return JSON.parse(b.toString('utf8')); } catch { return null; }
  }
  return null;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || null;
  setCors(res, origin);

  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(origin)) return res.status(403).end();
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const data = parseBody(req);
  if (!data) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  // Honeypot — bots only
  if (data.website) {
    return res.status(200).json({ ok: true });
  }

  const name = String(data.name || '').trim();
  const phone = String(data.phone || '').trim();
  const email = String(data.email || '').trim();
  const vehicle = String(data.vehicle || '').trim();
  const message = String(data.message || '').trim();

  if (!name || !phone || !message) {
    return res.status(400).json({ error: 'Name, phone number and message are required.' });
  }

  if (email && !isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address or leave it blank.' });
  }

  const emailBody = [
    'New enquiry — HEtyres website',
    '==============================',
    `Name:          ${name}`,
    `Phone:         ${phone}`,
    `Email:         ${email || '(not provided)'}`,
    `Vehicle type:  ${vehicle || '(not selected)'}`,
    '',
    'Message:',
    message,
    '',
    '--------------------------------',
    'Sent via the mobile / other enquiry form on the HEtyres site',
  ].join('\n');

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const toEmail = process.env.HE_TYRES_TO_EMAIL || 'nickbarrett@me.com';

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('SMTP not configured. Would have sent to', toEmail, ':\n' + emailBody);
    return res.status(200).json({ ok: true, note: 'SMTP not configured — logged only' });
  }

  try {
    const nodemailer = require('nodemailer');

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const mail = {
      from: `"HEtyres Enquiry" <${smtpUser}>`,
      to: toEmail,
      subject: `HEtyres enquiry from ${name}${vehicle ? ` — ${vehicle}` : ''}`,
      text: emailBody,
    };
    if (email) mail.replyTo = email;

    await transporter.sendMail(mail);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('HEtyres enquiry email error:', err);
    return res.status(500).json({ error: 'Failed to send. Please call 01793 876 969 instead.' });
  }
};
