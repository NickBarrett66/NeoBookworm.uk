// Vercel serverless — single HEtyres endpoint, dispatches on request body shape.
//
//   POST /api/he-tyres-enquiry  { action: 'address-lookup', postcode: 'SN1 2BL' }  → Postcoder proxy
//   POST /api/he-tyres-enquiry  { name, phone, enquiry_type, ... }                 → form enquiry
//
// Required env vars:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS   (iCloud SMTP)
//   POSTCODER_API_KEY                             (address lookup, 2 credits/UK lookup)
// Optional:
//   HE_TYRES_TO_EMAIL  — defaults to nickbarrett@me.com

const ALLOWED_ORIGINS = [
  'https://neobookworm.uk',
  'https://www.neobookworm.uk',
  'https://hetyres.co.uk',
  'https://www.hetyres.co.uk',
];

const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i;

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.startsWith('http://localhost:')) return true;
  if (origin.startsWith('http://127.0.0.1:')) return true;
  return false;
}

function corsHeaders(origin, methods) {
  if (!isAllowedOrigin(origin)) return {};
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
    Vary: 'Origin',
  };
}

function setCors(res, origin, methods) {
  Object.entries(corsHeaders(origin, methods)).forEach(([k, v]) => res.setHeader(k, v));
}

// ── Enquiry handler ────────────────────────────────────────────────────────────

function parseBody(req) {
  const b = req.body;
  if (b == null) return null;
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') { try { return JSON.parse(b); } catch { return null; } }
  if (Buffer.isBuffer(b))   { try { return JSON.parse(b.toString('utf8')); } catch { return null; } }
  return null;
}

function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function str(v) { return String(v || '').trim(); }

function buildCustomerConfirmEmail({ name, phone, postcode, fitting_address, reg, tyre_count, timing }) {
  const addressLine = fitting_address ? `${fitting_address}, ${postcode}` : postcode;
  return [
    `Hi ${name},`,
    '',
    `Thanks for getting in touch — we've got your mobile fitting enquiry and will call you on ${phone} to arrange a time that suits you.`,
    '',
    "Here's what we've noted:",
    `  Address:      ${addressLine}`,
    reg        ? `  Registration: ${reg}`        : null,
    tyre_count ? `  Tyres needed: ${tyre_count}` : null,
    timing     ? `  Timing:       ${timing}`      : null,
    '',
    'If anything looks wrong, just reply to this email and let us know.',
    '',
    'Thanks,',
    'HEtyres — Westmead Drive, Swindon',
    '01793 876 969',
  ].filter(l => l !== null).join('\n');
}

function buildMobileEmail({ name, phone, email, postcode, fitting_address, reg, vehicle_make, vehicle_model, vehicle_year, vehicle_colour, tyre_size, tyre_count, timing, mobile_message }) {
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
    `Address:       ${fitting_address || '(not provided)'}`,
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

function buildGeneralEmail({ name, phone, email, reg, vehicle_make, vehicle_model, vehicle_year, vehicle_colour, message }) {
  const vehicleLine = (vehicle_make || vehicle_model)
    ? [vehicle_make, vehicle_model, vehicle_year, vehicle_colour].filter(Boolean).join(' ')
    : reg ? '(not looked up)' : '(not provided)';

  return [
    'New GENERAL enquiry — HEtyres',
    '==============================',
    `Name:          ${name}`,
    `Phone:         ${phone}`,
    `Email:         ${email || '(not provided)'}`,
    `Registration:  ${reg || '(not provided)'}`,
    `Vehicle:       ${vehicleLine}`,
    '',
    'Message:',
    message,
    '',
    '--------------------------------',
    'Sent via the general enquiry form on the HEtyres site',
  ].join('\n');
}

async function handleEnquiry(req, res) {
  const origin = req.headers.origin || null;
  setCors(res, origin, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(origin)) return res.status(403).end();
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const data = parseBody(req);
  if (!data) return res.status(400).json({ error: 'Invalid request body' });
  if (data.website) return res.status(200).json({ ok: true }); // honeypot

  const enquiryType = str(data.enquiry_type);
  const name  = str(data.name);
  const phone = str(data.phone);
  const email = str(data.email);

  if (!name || !phone) return res.status(400).json({ error: 'Name and phone number are required.' });
  if (email && !isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address or leave it blank.' });

  let emailBody, subject;

  if (enquiryType === 'mobile') {
    const postcode = str(data.postcode);
    if (!postcode) return res.status(400).json({ error: 'Postcode is required for mobile fitting.' });
    emailBody = buildMobileEmail({
      name, phone, email,
      postcode,
      fitting_address: str(data.fitting_address),
      reg:             str(data.reg),
      vehicle_make:    str(data.vehicle_make),
      vehicle_model:   str(data.vehicle_model),
      vehicle_year:    str(data.vehicle_year),
      vehicle_colour:  str(data.vehicle_colour),
      tyre_size:       str(data.tyre_size),
      tyre_count:      str(data.tyre_count),
      timing:          str(data.timing),
      mobile_message:  str(data.mobile_message),
    });
    const reg = str(data.reg);
    subject = `HEtyres MOBILE FIT — ${name}${reg ? ' — ' + reg : ''} — ${postcode}`;
  } else {
    const message = str(data.message);
    if (!message) return res.status(400).json({ error: 'Please tell us what you need.' });
    const reg = str(data.reg);
    emailBody = buildGeneralEmail({
      name, phone, email, reg,
      vehicle_make:   str(data.vehicle_make),
      vehicle_model:  str(data.vehicle_model),
      vehicle_year:   str(data.vehicle_year),
      vehicle_colour: str(data.vehicle_colour),
      message,
    });
    subject = `HEtyres enquiry from ${name}${reg ? ' — ' + reg : ''}`;
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

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: smtpHost, port: smtpPort, secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  try {
    const mail = { from: `"HEtyres Enquiry" <${smtpUser}>`, to: toEmail, subject, text: emailBody };
    if (email) mail.replyTo = email;
    await transporter.sendMail(mail);

    // Customer confirmation — only for mobile fitting when they provided an email.
    if (email && enquiryType === 'mobile') {
      try {
        await transporter.sendMail({
          from:    `"HEtyres" <${smtpUser}>`,
          to:      email,
          replyTo: toEmail,
          subject: "We've got your mobile fitting enquiry — HEtyres",
          text:    buildCustomerConfirmEmail({
            name, phone,
            postcode:        str(data.postcode),
            fitting_address: str(data.fitting_address),
            reg:             str(data.reg),
            tyre_count:      str(data.tyre_count),
            timing:          str(data.timing),
          }),
        });
      } catch (err) {
        console.error('HEtyres customer confirmation error:', err);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('HEtyres enquiry email error:', err);
    return res.status(500).json({ error: 'Failed to send. Please call 01793 876 969 instead.' });
  }
}

// ── Address lookup handler ─────────────────────────────────────────────────────

async function handleAddressLookup(req, res, body) {
  const origin = req.headers.origin || null;
  setCors(res, origin, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const postcode = ((body && body.postcode) || '').trim();
  if (!UK_POSTCODE_RE.test(postcode)) return res.status(400).json({ error: 'Invalid postcode' });

  const key = process.env.POSTCODER_API_KEY;
  if (!key) return res.status(500).json({ error: 'Address lookup not configured' });

  try {
    const pc = encodeURIComponent(postcode.toUpperCase());
    const upstream = await fetch(`https://ws.postcoder.com/pcw/${encodeURIComponent(key)}/address/uk/${pc}?format=json&lines=3`);
    const data = await upstream.json().catch(() => null);

    if (!upstream.ok || !Array.isArray(data)) {
      if (upstream.status === 404) return res.status(200).json({ addresses: [] });
      console.error('[he-tyres-address-lookup] postcoder error:', upstream.status, JSON.stringify(data || '').slice(0, 200));
      return res.status(502).json({ error: 'lookup_failed' });
    }

    const addresses = data.map(a => ({
      line1:    a.addressline1 || '',
      line2:    [a.addressline2, a.addressline3].filter(Boolean).join(', '),
      town:     a.posttown || '',
      county:   a.county || '',
      postcode: a.postcode || postcode.toUpperCase(),
      summary:  a.summaryline || [a.addressline1, a.addressline2, a.posttown, a.postcode].filter(Boolean).join(', '),
    }));

    return res.status(200).json({ addresses });
  } catch (err) {
    console.error('[he-tyres-address-lookup] error:', err);
    return res.status(502).json({ error: 'lookup_failed' });
  }
}

// ── Dispatcher — route by presence of ?postcode= query param ─────────────────

// ── Dispatcher — both address-lookup and enquiry use POST, distinguished by body ─

module.exports = async (req, res) => {
  const body = parseBody(req);
  if (body && body.action === 'address-lookup') return handleAddressLookup(req, res, body);
  return handleEnquiry(req, res);
};
