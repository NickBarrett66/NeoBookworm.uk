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

function str(v) { return String(v || '').trim(); }

function buildMobileEmail({ name, phone, email, postcode, reg, vehicle_make, vehicle_model, vehicle_year, vehicle_colour, tyre_size, tyre_count, timing, mobile_message }) {
  const vehicleLine = (vehicle_make || vehicle_model)
    ? [vehicle_make, vehicle_model, vehicle_year, vehicle_colour].filter(Boolean).join(' ')
    : reg ? '(not looked up)' : '(not provided)';

  return [
    'New MOBILE FITTING enquiry — HEtyres',
    '======================================',
    `Name:          ${name}`,
    `Phone:         ${phone}`,
    `Email:         ${email || '(not provided)'}`,
    '',
    'FITTING DETAILS',
    `Postcode:      ${postcode}`,
    `Registration:  ${reg || '(not provided)'}`,
    `Vehicle:       ${vehicleLine}`,
    `Tyre size:     ${tyre_size || '(not provided)'}`,
    `Tyres needed:  ${tyre_count || '(not selected)'}`,
    `Timing:        ${timing || '(not selected)'}`,
    '',
    mobile_message ? `Notes:\n${mobile_message}` : 'Notes: (none)',
    '',
    '--------------------------------',
    'Sent via the mobile fitting enquiry form on the HEtyres site',
  ].join('\n');
}

function buildGeneralEmail({ name, phone, email, vehicle, message }) {
  return [
    'New GENERAL enquiry — HEtyres',
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
    'Sent via the general enquiry form on the HEtyres site',
  ].join('\n');
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

  const enquiryType = str(data.enquiry_type);
  const name  = str(data.name);
  const phone = str(data.phone);
  const email = str(data.email);

  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone number are required.' });
  }

  if (email && !isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address or leave it blank.' });
  }

  let emailBody, subject;

  if (enquiryType === 'mobile') {
    const postcode = str(data.postcode);
    if (!postcode) {
      return res.status(400).json({ error: 'Postcode is required for mobile fitting.' });
    }
    emailBody = buildMobileEmail({
      name, phone, email,
      postcode,
      reg:            str(data.reg),
      vehicle_make:   str(data.vehicle_make),
      vehicle_model:  str(data.vehicle_model),
      vehicle_year:   str(data.vehicle_year),
      vehicle_colour: str(data.vehicle_colour),
      tyre_size:      str(data.tyre_size),
      tyre_count:     str(data.tyre_count),
      timing:         str(data.timing),
      mobile_message: str(data.mobile_message),
    });
    const reg = str(data.reg);
    subject = `HEtyres MOBILE FIT — ${name}${reg ? ' — ' + reg : ''} — ${postcode}`;
  } else {
    const message = str(data.message);
    if (!message) {
      return res.status(400).json({ error: 'Please tell us what you need.' });
    }
    emailBody = buildGeneralEmail({
      name, phone, email,
      vehicle: str(data.vehicle),
      message,
    });
    subject = `HEtyres enquiry from ${name}${data.vehicle ? ' — ' + str(data.vehicle) : ''}`;
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const toEmail  = process.env.HE_TYRES_TO_EMAIL || 'nickbarrett@me.com';

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
      subject,
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
