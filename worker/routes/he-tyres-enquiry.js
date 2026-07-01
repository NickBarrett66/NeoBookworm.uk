// HEtyres enquiry + address lookup — /api/he-tyres-enquiry
//
//   POST { action: 'address-lookup', postcode: 'SN1 2BL' }  → Postcoder proxy
//   POST { name, phone, enquiry_type, ... }                 → form enquiry
//
// Secrets: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
//          POSTCODER_API_KEY (address lookup)
// Optional: HE_TYRES_TO_EMAIL — defaults to nickbarrett@me.com

import { sendViaGmail } from '../_lib/gmail.js';

const ALLOWED_ORIGINS = [
  'https://neobookworm.uk',
  'https://www.neobookworm.uk',
  'https://hetyres.co.uk',
  'https://www.hetyres.co.uk',
];

const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i;
const DEFAULT_TO = 'nickbarrett@me.com';

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

function json(data, status, origin, methods = 'POST, OPTIONS') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin, methods) },
  });
}

function gmailConfigured(env) {
  return !!(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN);
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

async function handleEnquiry(request, env, data) {
  const origin = request.headers.get('origin') || null;

  if (data.website) return json({ ok: true }, 200, origin); // honeypot

  const enquiryType = str(data.enquiry_type);
  const name  = str(data.name);
  const phone = str(data.phone);
  const email = str(data.email);

  if (!name || !phone) return json({ error: 'Name and phone number are required.' }, 400, origin);
  if (email && !isValidEmail(email)) return json({ error: 'Please enter a valid email address or leave it blank.' }, 400, origin);

  let emailBody, subject;

  if (enquiryType === 'mobile') {
    const postcode = str(data.postcode);
    if (!postcode) return json({ error: 'Postcode is required for mobile fitting.' }, 400, origin);
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
    if (!message) return json({ error: 'Please tell us what you need.' }, 400, origin);
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

  const toEmail = env.HE_TYRES_TO_EMAIL || DEFAULT_TO;

  if (!gmailConfigured(env)) {
    console.log('Gmail not configured. Would have sent to', toEmail, ':\n' + emailBody);
    return json({ ok: true, note: 'SMTP not configured — logged only' }, 200, origin);
  }

  try {
    await sendViaGmail(env, {
      to: toEmail,
      fromName: 'HEtyres Enquiry',
      replyTo: email || null,
      subject,
      body: emailBody,
    });

    // Customer confirmation — only for mobile fitting when they provided an email.
    if (email && enquiryType === 'mobile') {
      try {
        await sendViaGmail(env, {
          to: email,
          fromName: 'HEtyres',
          replyTo: toEmail,
          subject: "We've got your mobile fitting enquiry — HEtyres",
          body: buildCustomerConfirmEmail({
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

    return json({ ok: true }, 200, origin);
  } catch (err) {
    console.error('HEtyres enquiry email error:', err);
    return json({ error: 'Failed to send. Please call 01793 876 969 instead.' }, 500, origin);
  }
}

async function handleAddressLookup(request, env, body) {
  const origin = request.headers.get('origin') || null;

  const postcode = ((body && body.postcode) || '').trim();
  if (!UK_POSTCODE_RE.test(postcode)) return json({ error: 'Invalid postcode' }, 400, origin);

  const key = env.POSTCODER_API_KEY;
  if (!key) return json({ error: 'Address lookup not configured' }, 500, origin);

  try {
    const pc = encodeURIComponent(postcode.toUpperCase());
    const upstream = await fetch(`https://ws.postcoder.com/pcw/${encodeURIComponent(key)}/address/uk/${pc}?format=json&lines=3`);
    const data = await upstream.json().catch(() => null);

    if (!upstream.ok || !Array.isArray(data)) {
      if (upstream.status === 404) return json({ addresses: [] }, 200, origin);
      console.error('[he-tyres-address-lookup] postcoder error:', upstream.status, JSON.stringify(data || '').slice(0, 200));
      return json({ error: 'lookup_failed' }, 502, origin);
    }

    const addresses = data.map(a => ({
      line1:    a.addressline1 || '',
      line2:    [a.addressline2, a.addressline3].filter(Boolean).join(', '),
      town:     a.posttown || '',
      county:   a.county || '',
      postcode: a.postcode || postcode.toUpperCase(),
      summary:  a.summaryline || [a.addressline1, a.addressline2, a.posttown, a.postcode].filter(Boolean).join(', '),
    }));

    return json({ addresses }, 200, origin);
  } catch (err) {
    console.error('[he-tyres-address-lookup] error:', err);
    return json({ error: 'lookup_failed' }, 502, origin);
  }
}

export async function handle(request, env) {
  const origin = request.headers.get('origin') || null;

  if (request.method === 'OPTIONS') {
    if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(origin, 'POST, OPTIONS') });
  }
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405, origin);

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body' }, 400, origin); }
  if (!data) return json({ error: 'Invalid request body' }, 400, origin);

  if (data.action === 'address-lookup') return handleAddressLookup(request, env, data);
  return handleEnquiry(request, env, data);
}
