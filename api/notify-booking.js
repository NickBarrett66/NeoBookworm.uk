// Booking confirmation email — thin Vercel route called by the booking Worker.
//
// Cloudflare Workers cannot open TCP connections to SMTP ports, so Nodemailer
// stays here on Vercel using the same Google Workspace transport as api/_lib/email.js.
//
// Security: request must include header X-Notify-Secret matching NOTIFY_BOOKING_SECRET.
//
// Required env vars:
//   NOTIFY_BOOKING_SECRET — shared secret (must match Worker NOTIFY_BOOKING_SECRET)
//   GW_SMTP_USER          — nick@neobookworm.uk
//   GW_SMTP_PASS          — Google Workspace app-specific password

'use strict';

const TIMEZONE = 'Europe/London';

function parseJsonBody(req) {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(b)) {
    try {
      return JSON.parse(b.toString('utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

function tzOffsetMs(instant, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  });
  const parts = dtf.formatToParts(instant);
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const match = tzName.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const mins = match[3] ? parseInt(match[3], 10) : 0;
  return sign * (hours * 60 + mins) * 60 * 1000;
}

function londonWallToInstant(wall) {
  const guess = new Date(`${wall}Z`);
  return new Date(guess.getTime() - tzOffsetMs(guess, TIMEZONE));
}

function formatBookingTimes(slotStart, slotEnd) {
  const startInstant = londonWallToInstant(slotStart);
  const endInstant = londonWallToInstant(slotEnd);

  const subjectDay = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(startInstant);

  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const subjectTime = timeFmt.format(startInstant);
  const dateLine = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(startInstant);
  const startTime = timeFmt.format(startInstant);
  const endTime = timeFmt.format(endInstant);
  const durationMins = Math.round((endInstant.getTime() - startInstant.getTime()) / 60_000);

  return {
    subject: `Your booking is confirmed — ${subjectDay} at ${subjectTime}`,
    dateLine,
    timeRange: `${startTime} — ${endTime} (${durationMins} minutes)`,
  };
}

function renderConfirmationEmail({ name, slotStart, slotEnd, businessName }) {
  const { subject, dateLine, timeRange } = formatBookingTimes(slotStart, slotEnd);

  const body = [
    `Hi ${name},`,
    '',
    'Your booking is confirmed:',
    '',
    `  ${dateLine}`,
    `  ${timeRange}`,
    '',
    'If you need to change anything, reply to this email.',
    '',
    `— ${businessName}`,
  ].join('\n');

  return { subject, body };
}

let _transport = null;

function getTransport() {
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
    secure: false,
    auth: { user, pass },
  });

  return _transport;
}

async function sendConfirmationEmail({ to, name, slotStart, slotEnd, businessName }) {
  const from = process.env.GW_SMTP_USER || 'nick@neobookworm.uk';
  const { subject, body } = renderConfirmationEmail({ name, slotStart, slotEnd, businessName });

  const transporter = getTransport();
  await transporter.sendMail({
    from: `"${businessName}" <${from}>`,
    replyTo: from,
    to,
    subject,
    text: body,
  });

  console.log('[notify-booking] confirmation email sent to', to);
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const notifySecret = process.env.NOTIFY_BOOKING_SECRET;
  if (!notifySecret) {
    console.error('[notify-booking] NOTIFY_BOOKING_SECRET env var not set');
    return res.status(500).json({ ok: false, error: 'Notify endpoint not configured.' });
  }

  const providedSecret = req.headers['x-notify-secret'];
  if (!providedSecret || providedSecret !== notifySecret) {
    console.warn('[notify-booking] Invalid or missing X-Notify-Secret');
    return res.status(401).json({ ok: false, error: 'Unauthorised.' });
  }

  const body = parseJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const to = body.to ? String(body.to).trim() : '';
  const name = body.name ? String(body.name).trim() : '';
  const slotStart = body.slotStart ? String(body.slotStart).trim() : '';
  const slotEnd = body.slotEnd ? String(body.slotEnd).trim() : '';
  const businessName = body.businessName ? String(body.businessName).trim() : '';

  if (!to || !name || !slotStart || !slotEnd || !businessName) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }

  try {
    await sendConfirmationEmail({ to, name, slotStart, slotEnd, businessName });
    return res.status(200).json({ ok: true });
  } catch (err) {
    const message = err.message || String(err);
    console.error('[notify-booking] Email error:', message);
    return res.status(500).json({ ok: false, error: message });
  }
};
