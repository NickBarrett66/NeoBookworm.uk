// Booking email sender — /api/notify-booking
// Called by the booking Worker with X-Notify-Secret.
//
// Secrets: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, NOTIFY_BOOKING_SECRET
// Optional: HE_TYRES_TO_EMAIL, TO_EMAIL (business_notification recipient)

import { sendViaGmail } from '../_lib/gmail.js';

const TIMEZONE = 'Europe/London';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

const LOCATION_LABELS = { in_person: 'In person', phone: 'Phone call', video: 'Video call' };

function renderBusinessNotificationEmail({ name, email, phone, slotStart, slotEnd, businessName, reg, vehicleSummary, address, postcode, customAnswers, locationType }) {
  const { dateLine, timeRange, subjectDay, startTime } = formatTimes(slotStart, slotEnd);
  const subject = `New booking — ${subjectDay} at ${startTime}${reg ? ' — ' + reg : ''}`;
  const lines = [
    `New booking at ${businessName}`,
    '',
    `  ${dateLine}`,
    `  ${timeRange}`,
    locationType && LOCATION_LABELS[locationType] ? `  ${LOCATION_LABELS[locationType]}` : null,
    '',
    `Customer: ${name}`,
    `Email:    ${email}`,
    phone ? `Phone:    ${phone}` : null,
  ];
  if (reg) {
    lines.push('');
    lines.push(`Reg:      ${reg}`);
    if (vehicleSummary) lines.push(`Vehicle:  ${vehicleSummary}`);
  }
  if (address || postcode) {
    lines.push('');
    if (address) lines.push(`Address:  ${address}`);
    if (postcode) lines.push(`Postcode: ${postcode}`);
  }
  if (Array.isArray(customAnswers) && customAnswers.length) {
    lines.push('');
    for (const a of customAnswers) lines.push(`${a.label}: ${a.value}`);
  }
  return { subject, body: lines.filter((l) => l !== null).join('\n') };
}

function renderMobileHoldingEmail({ name, arrivalLabel, businessName }) {
  const subject = `Mobile fitting request received — ${arrivalLabel}`;
  const body = [
    `Hi ${name},`,
    '',
    `Thanks — we've received your mobile fitting request for ${arrivalLabel}.`,
    '',
    "Howie will confirm your visit shortly. You'll get another email once it's firmed up.",
    '',
    'If you need to reach us sooner, call 01793 876 969.',
    '',
    `— ${businessName}`,
  ].join('\n');
  return { subject, body };
}

function renderMobileConfirmRequestEmail({
  name, email, phone, slotStart, slotEnd, businessName, reg, vehicleSummary,
  address, postcode, arrivalLabel, confirmUrl,
}) {
  const { dateLine, timeRange } = formatTimes(slotStart, slotEnd);
  const subject = `Confirm mobile request — ${arrivalLabel}${reg ? ' — ' + reg : ''}`;
  const lines = [
    `New mobile fitting request at ${businessName}`,
    '',
    `Requested window: ${arrivalLabel}`,
    `Reserved block:   ${dateLine}, ${timeRange}`,
    '',
    `Customer: ${name}`,
    `Email:    ${email}`,
    phone ? `Phone:    ${phone}` : null,
  ];
  if (reg) {
    lines.push('');
    lines.push(`Reg:      ${reg}`);
    if (vehicleSummary) lines.push(`Vehicle:  ${vehicleSummary}`);
  }
  if (address || postcode) {
    lines.push('');
    if (address) lines.push(`Address:  ${address}`);
    if (postcode) lines.push(`Postcode: ${postcode}`);
  }
  lines.push('');
  lines.push('Confirm this visit (sends the customer their firm confirmation):');
  lines.push(`  ${confirmUrl}`);
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

async function sendEmail(env, { to, subject, body, businessName }) {
  await sendViaGmail(env, {
    to,
    fromName: businessName,
    replyTo: 'nick@neobookworm.uk',
    subject,
    body,
  });
  console.log('[notify-booking]', subject, '→', to);
}

export async function handle(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200 });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method Not Allowed' }, 405);

  const notifySecret = env.NOTIFY_BOOKING_SECRET;
  if (!notifySecret) {
    console.error('[notify-booking] NOTIFY_BOOKING_SECRET not set');
    return json({ ok: false, error: 'Notify endpoint not configured.' }, 500);
  }

  if (request.headers.get('x-notify-secret') !== notifySecret) {
    console.warn('[notify-booking] Invalid or missing X-Notify-Secret');
    return json({ ok: false, error: 'Unauthorised.' }, 401);
  }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON body' }, 400); }
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'Invalid JSON body' }, 400);

  const type = body.type || 'confirmation';

  try {
    if (type === 'cancellation') {
      const { to, name, slotStart, businessName } = body;
      if (!to || !name || !slotStart || !businessName) return json({ ok: false, error: 'Missing fields' }, 400);
      const { subject, body: text } = renderCancellationEmail({ name, slotStart: String(slotStart), businessName: String(businessName) });
      await sendEmail(env, { to: String(to), subject, body: text, businessName: String(businessName) });
    } else if (type === 'business_notification') {
      const { name, email: custEmail, phone, slotStart, slotEnd, businessName, reg, vehicleSummary, address, postcode, customAnswers, locationType } = body;
      if (!name || !custEmail || !slotStart || !slotEnd || !businessName) return json({ ok: false, error: 'Missing fields' }, 400);
      const to = env.HE_TYRES_TO_EMAIL || env.TO_EMAIL;
      if (!to) return json({ ok: false, error: 'No business notification email configured' }, 500);
      const { subject, body: text } = renderBusinessNotificationEmail({
        name: String(name), email: String(custEmail), phone: phone ? String(phone) : null,
        slotStart: String(slotStart), slotEnd: String(slotEnd), businessName: String(businessName),
        reg: reg ? String(reg) : null, vehicleSummary: vehicleSummary ? String(vehicleSummary) : null,
        address: address ? String(address) : null, postcode: postcode ? String(postcode) : null,
        customAnswers: Array.isArray(customAnswers) ? customAnswers : null,
        locationType: locationType ? String(locationType) : null,
      });
      await sendEmail(env, { to, subject, body: text, businessName: String(businessName) });
    } else if (type === 'mobile_holding') {
      const { to, name, arrivalLabel, businessName } = body;
      if (!to || !name || !arrivalLabel || !businessName) return json({ ok: false, error: 'Missing fields' }, 400);
      const { subject, body: text } = renderMobileHoldingEmail({
        name: String(name), arrivalLabel: String(arrivalLabel), businessName: String(businessName),
      });
      await sendEmail(env, { to: String(to), subject, body: text, businessName: String(businessName) });
    } else if (type === 'mobile_confirm_request') {
      const {
        name, email, phone, slotStart, slotEnd, businessName, reg, vehicleSummary,
        address, postcode, arrivalLabel, confirmUrl,
      } = body;
      if (!name || !email || !slotStart || !slotEnd || !businessName || !arrivalLabel || !confirmUrl) {
        return json({ ok: false, error: 'Missing fields' }, 400);
      }
      const to = env.HE_TYRES_TO_EMAIL || env.TO_EMAIL;
      if (!to) return json({ ok: false, error: 'No business notification email configured' }, 500);
      const { subject, body: text } = renderMobileConfirmRequestEmail({
        name: String(name), email: String(email), phone: phone ? String(phone) : null,
        slotStart: String(slotStart), slotEnd: String(slotEnd), businessName: String(businessName),
        reg: reg ? String(reg) : null, vehicleSummary: vehicleSummary ? String(vehicleSummary) : null,
        address: address ? String(address) : null, postcode: postcode ? String(postcode) : null,
        arrivalLabel: String(arrivalLabel), confirmUrl: String(confirmUrl),
      });
      await sendEmail(env, { to, subject, body: text, businessName: String(businessName) });
    } else {
      const { to, name, slotStart, slotEnd, businessName, manageUrl, isReschedule } = body;
      if (!to || !name || !slotStart || !slotEnd || !businessName) return json({ ok: false, error: 'Missing fields' }, 400);
      const { subject, body: text } = renderConfirmationEmail({
        name: String(name), slotStart: String(slotStart), slotEnd: String(slotEnd),
        businessName: String(businessName), manageUrl: manageUrl ? String(manageUrl) : null,
        isReschedule: Boolean(isReschedule),
      });
      await sendEmail(env, { to: String(to), subject, body: text, businessName: String(businessName) });
    }
    return json({ ok: true });
  } catch (err) {
    console.error('[notify-booking] error:', err.message || err);
    return json({ ok: false, error: err.message || String(err) }, 500);
  }
}
