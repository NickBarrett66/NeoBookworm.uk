'use strict';

// Booking email sender — thin Vercel route called by the booking Worker.
// Cloudflare Workers cannot open TCP connections to SMTP ports.
// Security: X-Notify-Secret header must match NOTIFY_BOOKING_SECRET env var.
//
// Required env vars:
//   NOTIFY_BOOKING_SECRET  shared secret (must match Worker secret)
//   GW_SMTP_USER           nick@neobookworm.uk
//   GW_SMTP_PASS           Google Workspace app-specific password

const TIMEZONE = 'Europe/London';

function parseJsonBody(req) {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') { try { return JSON.parse(b); } catch { return null; } }
  if (Buffer.isBuffer(b)) { try { return JSON.parse(b.toString('utf8')); } catch { return null; } }
  return null;
}

function tzOffsetMs(instant, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' });
  const tzName = dtf.formatToParts(instant).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const match = tzName.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (parseInt(match[2], 10) * 60 + (match[3] ? parseInt(match[3], 10) : 0)) * 60_000;
}

function londonWallToInstant(wall) {
  const guess = new Date(`${wall}Z`);
  return new Date(guess.getTime() - tzOffsetMs(guess, TIMEZONE));
}

function formatTimes(slotStart, slotEnd) {
  const start = londonWallToInstant(slotStart);
  const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit', hour12: true });
  const dateLine = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(start);
  const startTime = timeFmt.format(start);
  const subjectDay = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, weekday: 'long', day: 'numeric', month: 'long' }).format(start);

  if (slotEnd) {
    const end = londonWallToInstant(slotEnd);
    const endTime = timeFmt.format(end);
    const durationMins = Math.round((end.getTime() - start.getTime()) / 60_000);
    return { dateLine, timeRange: `${startTime} — ${endTime} (${durationMins} minutes)`, subjectDay, startTime };
  }
  return { dateLine, timeRange: startTime, subjectDay, startTime };
}

function renderConfirmationEmail({ name, slotStart, slotEnd, businessName, manageUrl, isReschedule }) {
  const { dateLine, timeRange, subjectDay, startTime } = formatTimes(slotStart, slotEnd);
  const action = isReschedule ? 'rescheduled' : 'confirmed';
  const subject = `Your booking is ${action} — ${subjectDay} at ${startTime}`;

  const lines = [
    `Hi ${name},`,
    '',
    isReschedule
      ? 'Your booking has been rescheduled:'
      : 'Your booking is confirmed:',
    '',
    `  ${dateLine}`,
    `  ${timeRange}`,
  ];

  if (manageUrl) {
    lines.push('');
    lines.push('Need to change or cancel?');
    lines.push(`  ${manageUrl}`);
  }

  lines.push('', `— ${businessName}`);
  return { subject, body: lines.join('\n') };
}

function renderCancellationEmail({ name, slotStart, businessName }) {
  const { dateLine, timeRange, subjectDay, startTime } = formatTimes(slotStart, null);
  const subject = `Booking cancelled — ${subjectDay} at ${startTime}`;

  const body = [
    `Hi ${name},`,
    '',
    'Your booking has been cancelled:',
    '',
    `  ${dateLine}`,
    `  ${timeRange}`,
    '',
    'If you would like to book another slot, visit:',
    `  https://neobookworm-booking.nickbarrett.workers.dev/${businessName.toLowerCase().replace(/\s+/g, '')}`,
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
  if (!user || !pass) throw new Error('GW_SMTP_USER and GW_SMTP_PASS must be set');
  _transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user, pass } });
  return _transport;
}

async function sendEmail({ to, from, subject, body, businessName }) {
  const transporter = getTransport();
  await transporter.sendMail({ from: `"${businessName}" <${from}>`, replyTo: from, to, subject, text: body });
  console.log('[notify-booking]', subject, '→', to);
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const notifySecret = process.env.NOTIFY_BOOKING_SECRET;
  if (!notifySecret) {
    console.error('[notify-booking] NOTIFY_BOOKING_SECRET not set');
    return res.status(500).json({ ok: false, error: 'Notify endpoint not configured.' });
  }

  if (req.headers['x-notify-secret'] !== notifySecret) {
    console.warn('[notify-booking] Invalid or missing X-Notify-Secret');
    return res.status(401).json({ ok: false, error: 'Unauthorised.' });
  }

  const body = parseJsonBody(req);
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'Invalid JSON body' });

  const from = process.env.GW_SMTP_USER || 'nick@neobookworm.uk';
  const type = body.type || 'confirmation';

  try {
    if (type === 'cancellation') {
      const { to, name, slotStart, businessName } = body;
      if (!to || !name || !slotStart || !businessName) return res.status(400).json({ ok: false, error: 'Missing fields' });
      const { subject, body: text } = renderCancellationEmail({ name, slotStart: String(slotStart), businessName: String(businessName) });
      await sendEmail({ to: String(to), from, subject, body: text, businessName: String(businessName) });
    } else {
      const { to, name, slotStart, slotEnd, businessName, manageUrl, isReschedule } = body;
      if (!to || !name || !slotStart || !slotEnd || !businessName) return res.status(400).json({ ok: false, error: 'Missing fields' });
      const { subject, body: text } = renderConfirmationEmail({
        name: String(name), slotStart: String(slotStart), slotEnd: String(slotEnd),
        businessName: String(businessName), manageUrl: manageUrl ? String(manageUrl) : null,
        isReschedule: Boolean(isReschedule),
      });
      await sendEmail({ to: String(to), from, subject, body: text, businessName: String(businessName) });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[notify-booking] error:', err.message || err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
};
