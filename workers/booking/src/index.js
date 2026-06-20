import {
  getBusyPeriods,
  getWorkingSlots,
  filterAvailableSlots,
  wallSlotsToLabels,
  createCalendarEvent,
  deleteCalendarEvent,
  londonWallToInstant,
  getAvailableDaysInMonth,
} from './calendar.js';
import { getConfig } from './config.js'; // async — always await getConfig(slug, env)
import {
  insertBooking,
  updateBookingEvent,
  markBookingFailed,
  cancelBooking,
  getBookingByToken,
  countRecentBookingsByEmail,
  SlotTakenError,
} from './db.js';
import { sendConfirmationEmail, sendCancellationEmail, sendBusinessNotificationEmail } from './email.js';
import { renderBookingPage, renderManagePage } from './ui.js';
import {
  handleAdminTenantList,
  handleAdminTenantGet,
  handleAdminTenantPut,
  handleAdminOptions,
} from './admin.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const BOOK_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ISO_DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH_RE = /^\d{4}-\d{2}$/;
const ISO_SLOT_RE  = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const EMAIL_RE     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function htmlResponse(html) {
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function getTodayLondon() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function wallEndFromStart(slotStart, durationMinutes, timeZone) {
  const instant = londonWallToInstant(slotStart, timeZone);
  const end = new Date(instant.getTime() + durationMinutes * 60_000);
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p = dtf.formatToParts(end).reduce((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

function sqliteSince24h() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

function manageUrl(req, slug, token) {
  const { origin } = new URL(req.url);
  return `${origin}/${slug}/manage?token=${token}`;
}

function validateDateParam(date, config) {
  if (!date) return { error: 'Missing date parameter', status: 400 };
  if (!ISO_DATE_RE.test(date)) return { error: 'Invalid date format — use YYYY-MM-DD', status: 400 };
  const today = getTodayLondon();
  if (date < today) return { error: 'Date is in the past', status: 400 };
  const maxDate = addDays(today, config.maxAdvanceDays);
  if (date > maxDate) return { error: `Date is more than ${config.maxAdvanceDays} days ahead`, status: 400 };
  return null;
}

function validateBookingBody(body, config) {
  const { slot, name, email, phone, note, reg, vehicleSummary } = body;
  if (!slot || !name || !email || !phone) return { error: 'Missing required fields' };
  if (typeof slot !== 'string' || !ISO_SLOT_RE.test(slot)) return { error: 'Invalid slot format' };
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 80) return { error: 'Invalid name' };
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) return { error: 'Invalid email' };
  if (typeof phone !== 'string' || phone.trim().length === 0 || phone.length > 30) return { error: 'Invalid phone' };
  if (note != null && (typeof note !== 'string' || note.length > 500)) return { error: 'Note is too long' };
  const slotDate = slot.slice(0, 10);
  const dateError = validateDateParam(slotDate, config);
  if (dateError) return { error: dateError.error === 'Date is in the past' ? 'Slot is in the past' : dateError.error };
  const slotInstant = londonWallToInstant(slot, config.timezone);
  if (slotInstant.getTime() < Date.now() + config.minLeadMinutes * 60_000) return { error: 'Slot is too soon' };
  const cleanReg = reg ? String(reg).trim().toUpperCase().replace(/\s+/g, '').slice(0, 10) : null;
  const cleanVehicleSummary = vehicleSummary ? String(vehicleSummary).slice(0, 200) : null;
  return { slot, name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), note: note?.trim() || null, slotDate, reg: cleanReg, vehicleSummary: cleanVehicleSummary };
}

async function checkIpRateLimit(env, ip) {
  if (!ip) return false;
  const key = `rl:${ip}`;
  const current = parseInt((await env.TOKEN_CACHE.get(key)) || '0', 10);
  const next = current + 1;
  await env.TOKEN_CACHE.put(key, String(next), { expirationTtl: 60 });
  return next > 10;
}

async function isSlotAvailable(env, slot, config) {
  const slotDate = slot.slice(0, 10);
  const workingSlots = getWorkingSlots(slotDate, config);
  if (workingSlots.length === 0) return false;
  const busyPeriods = await getBusyPeriods(env, slotDate, config);
  const availableWall = filterAvailableSlots(workingSlots, busyPeriods, config);
  return availableWall.includes(slot);
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleMonth(slug, url, env) {
  const config = await getConfig(slug, env);
  if (!config) return jsonResponse({ error: 'Unknown booking slug' }, 404);
  const month = url.searchParams.get('month');
  if (!month || !ISO_MONTH_RE.test(month)) return jsonResponse({ error: 'Missing or invalid month — use YYYY-MM' }, 400);
  try {
    const available = await getAvailableDaysInMonth(env, month, config);
    return jsonResponse({ month, available });
  } catch (err) {
    console.error('[booking] month error:', err);
    return jsonResponse({ error: 'Unable to fetch availability' }, 502);
  }
}

async function handleSlots(slug, url, env) {
  const config = await getConfig(slug, env);
  if (!config) return jsonResponse({ error: 'Unknown booking slug' }, 404);
  const date = url.searchParams.get('date');
  const validationError = validateDateParam(date, config);
  if (validationError) return jsonResponse({ error: validationError.error }, validationError.status);
  const workingSlots = getWorkingSlots(date, config);
  if (workingSlots.length === 0) return jsonResponse({ date, slots: [] });
  try {
    const busyPeriods = await getBusyPeriods(env, date, config);
    const availableWall = filterAvailableSlots(workingSlots, busyPeriods, config);
    const slots = wallSlotsToLabels(availableWall, config.timezone);
    return jsonResponse({ date, slots });
  } catch (err) {
    console.error('[booking] slots error:', err);
    return jsonResponse({ error: 'Unable to fetch availability' }, 502);
  }
}

async function handleBook(slug, req, env, ctx) {
  const config = await getConfig(slug, env);
  if (!config) return jsonResponse({ ok: false, error: 'Unknown booking slug' }, 404);

  let body;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400); }

  if (body.company) return jsonResponse({ ok: true });

  const ip = req.headers.get('CF-Connecting-IP');
  if (await checkIpRateLimit(env, ip)) return jsonResponse({ ok: false, error: 'too_many' }, 429);

  const validated = validateBookingBody(body, config);
  if (validated.error) return jsonResponse({ ok: false, error: validated.error }, 400);

  const { slot, name, email, phone, note, reg, vehicleSummary } = validated;
  const slotStart = slot;
  const slotEnd = wallEndFromStart(slotStart, config.slotDuration, config.timezone);

  try {
    const available = await isSlotAvailable(env, slotStart, config);
    if (!available) return jsonResponse({ ok: false, error: 'slot_taken' }, 409);
  } catch (err) {
    console.error('[booking] slot availability check error:', err);
    return jsonResponse({ ok: false, error: 'calendar_error' }, 502);
  }

  const recentCount = await countRecentBookingsByEmail(env.DB, slug, email, sqliteSince24h());
  if (recentCount >= 3) return jsonResponse({ ok: false, error: 'too_many' }, 429);

  let bookingId, manageToken;
  try {
    ({ id: bookingId, manageToken } = await insertBooking(env.DB, { slug, slotStart, slotEnd, name, email, phone, note, reg, vehicleSummary }));
  } catch (err) {
    if (err instanceof SlotTakenError) return jsonResponse({ ok: false, error: 'slot_taken' }, 409);
    console.error('[booking] insert error:', err);
    throw err;
  }

  let googleEvent;
  try {
    googleEvent = await createCalendarEvent(env, { slotStart, slotEnd, name, email, phone, note, reg, vehicleSummary }, config);
  } catch (err) {
    console.error('[booking] calendar create error:', err);
    await markBookingFailed(env.DB, bookingId);
    return jsonResponse({ ok: false, error: 'calendar_error' }, 502);
  }

  await updateBookingEvent(env.DB, bookingId, googleEvent.id);

  const mUrl = manageUrl(req, slug, manageToken);
  ctx.waitUntil(
    sendConfirmationEmail(env, { to: email, name, slotStart, slotEnd, businessName: config.displayName, manageUrl: mUrl }),
  );
  ctx.waitUntil(
    sendBusinessNotificationEmail(env, { name, email, phone, slotStart, slotEnd, businessName: config.displayName, reg, vehicleSummary }),
  );

  return jsonResponse({ ok: true, name, slotStart, slotEnd });
}

async function handleManage(slug, url, env) {
  const config = await getConfig(slug, env);
  if (!config) return new Response('Not found', { status: 404 });

  const token = url.searchParams.get('token');
  if (!token) return htmlResponse(renderManagePage(null, 'invalid', config, slug));

  const booking = await getBookingByToken(env.DB, token);
  return htmlResponse(renderManagePage(booking || null, booking ? 'found' : 'not_found', config, slug));
}

async function handleCancel(slug, req, env, ctx) {
  const config = await getConfig(slug, env);
  if (!config) return jsonResponse({ ok: false, error: 'Unknown slug' }, 404);

  let body;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400); }

  const { token } = body;
  if (!token) return jsonResponse({ ok: false, error: 'Missing token' }, 400);

  const booking = await getBookingByToken(env.DB, token);
  if (!booking || booking.slug !== slug) return jsonResponse({ ok: false, error: 'not_found' }, 404);
  if (booking.status === 'cancelled') return jsonResponse({ ok: false, error: 'already_cancelled' }, 409);

  const cutoffMin = config.cancellationCutoffMinutes ?? config.minLeadMinutes;
  const slotInstant = londonWallToInstant(booking.slot_start, config.timezone);
  if (slotInstant.getTime() < Date.now()) return jsonResponse({ ok: false, error: 'already_past' }, 409);
  if (slotInstant.getTime() <= Date.now() + cutoffMin * 60_000) {
    return jsonResponse({ ok: false, error: 'too_late' }, 409);
  }

  await cancelBooking(env.DB, booking.id);

  if (booking.google_event_id) {
    ctx.waitUntil(
      deleteCalendarEvent(env, booking.google_event_id, config)
        .catch((err) => console.error('[booking] calendar delete error:', err)),
    );
  }

  ctx.waitUntil(
    sendCancellationEmail(env, {
      to: booking.email,
      name: booking.name,
      slotStart: booking.slot_start,
      businessName: config.displayName,
    }),
  );

  return jsonResponse({ ok: true });
}

async function handleReschedule(slug, req, env, ctx) {
  const config = await getConfig(slug, env);
  if (!config) return jsonResponse({ ok: false, error: 'Unknown slug' }, 404);

  let body;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400); }

  const { token, slot } = body;
  if (!token || !slot) return jsonResponse({ ok: false, error: 'Missing token or slot' }, 400);
  if (!ISO_SLOT_RE.test(slot)) return jsonResponse({ ok: false, error: 'Invalid slot format' }, 400);

  const booking = await getBookingByToken(env.DB, token);
  if (!booking || booking.slug !== slug) return jsonResponse({ ok: false, error: 'not_found' }, 404);
  if (booking.status === 'cancelled') return jsonResponse({ ok: false, error: 'already_cancelled' }, 409);

  // The existing booking must still be inside its change window (cancellation cutoff).
  const cutoffMin = config.cancellationCutoffMinutes ?? config.minLeadMinutes;
  const oldSlotInstant = londonWallToInstant(booking.slot_start, config.timezone);
  if (oldSlotInstant.getTime() <= Date.now() + cutoffMin * 60_000) {
    return jsonResponse({ ok: false, error: 'too_late' }, 409);
  }

  const slotDate = slot.slice(0, 10);
  const dateError = validateDateParam(slotDate, config);
  if (dateError) return jsonResponse({ ok: false, error: dateError.error }, dateError.status);

  const newSlotInstant = londonWallToInstant(slot, config.timezone);
  if (newSlotInstant.getTime() < Date.now() + config.minLeadMinutes * 60_000) {
    return jsonResponse({ ok: false, error: 'Slot is too soon' }, 400);
  }

  try {
    const available = await isSlotAvailable(env, slot, config);
    if (!available) return jsonResponse({ ok: false, error: 'slot_taken' }, 409);
  } catch (err) {
    console.error('[booking] reschedule availability check error:', err);
    return jsonResponse({ ok: false, error: 'calendar_error' }, 502);
  }

  const slotEnd = wallEndFromStart(slot, config.slotDuration, config.timezone);

  let newBookingId, newManageToken;
  try {
    ({ id: newBookingId, manageToken: newManageToken } = await insertBooking(env.DB, {
      slug,
      slotStart: slot,
      slotEnd,
      name: booking.name,
      email: booking.email,
      phone: booking.phone,
      note: booking.note,
      reg: booking.reg,
      vehicleSummary: booking.vehicle_summary,
    }));
  } catch (err) {
    if (err instanceof SlotTakenError) return jsonResponse({ ok: false, error: 'slot_taken' }, 409);
    console.error('[booking] reschedule insert error:', err);
    throw err;
  }

  // Cancel old booking and delete its calendar event
  await cancelBooking(env.DB, booking.id);
  if (booking.google_event_id) {
    ctx.waitUntil(
      deleteCalendarEvent(env, booking.google_event_id, config)
        .catch((err) => console.error('[booking] old event delete error:', err)),
    );
  }

  // Create new calendar event
  let googleEvent;
  try {
    googleEvent = await createCalendarEvent(
      env,
      { slotStart: slot, slotEnd, name: booking.name, email: booking.email, phone: booking.phone, note: booking.note, reg: booking.reg, vehicleSummary: booking.vehicle_summary },
      config,
    );
  } catch (err) {
    console.error('[booking] reschedule calendar create error:', err);
    await markBookingFailed(env.DB, newBookingId);
    return jsonResponse({ ok: false, error: 'calendar_error' }, 502);
  }

  await updateBookingEvent(env.DB, newBookingId, googleEvent.id);

  const mUrl = manageUrl(req, slug, newManageToken);
  ctx.waitUntil(
    sendConfirmationEmail(env, {
      to: booking.email,
      name: booking.name,
      slotStart: slot,
      slotEnd,
      businessName: config.displayName,
      manageUrl: mUrl,
      isReschedule: true,
    }),
  );

  return jsonResponse({ ok: true, slotStart: slot, slotEnd });
}

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // ── Admin tenant-config API (auth via ADMIN_SECRET; see admin.js) ──────────
    if (url.pathname.startsWith('/admin/')) {
      if (req.method === 'OPTIONS') return handleAdminOptions();
      if (req.method === 'GET' && url.pathname === '/admin/tenants') {
        return handleAdminTenantList(req, env);
      }
      const tenantMatch = url.pathname.match(/^\/admin\/tenant\/([^/]+)$/);
      if (tenantMatch) {
        const tslug = tenantMatch[1];
        if (req.method === 'GET') return handleAdminTenantGet(tslug, req, env);
        if (req.method === 'PUT') return handleAdminTenantPut(tslug, req, env);
      }
      return new Response(JSON.stringify({ ok: false, error: 'Not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const bookMatch = url.pathname.match(/^\/([^/]+)\/book$/);
    if (bookMatch && req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: BOOK_CORS_HEADERS });
    }

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (req.method === 'POST' && bookMatch) return handleBook(bookMatch[1], req, env, ctx);

    const cancelMatch = url.pathname.match(/^\/([^/]+)\/cancel$/);
    if (req.method === 'POST' && cancelMatch) return handleCancel(cancelMatch[1], req, env, ctx);

    const rescheduleMatch = url.pathname.match(/^\/([^/]+)\/reschedule$/);
    if (req.method === 'POST' && rescheduleMatch) return handleReschedule(rescheduleMatch[1], req, env, ctx);

    const manageMatch = url.pathname.match(/^\/([^/]+)\/manage$/);
    if (req.method === 'GET' && manageMatch) return handleManage(manageMatch[1], url, env);

    const monthMatch = url.pathname.match(/^\/([^/]+)\/month$/);
    if (req.method === 'GET' && monthMatch) return handleMonth(monthMatch[1], url, env);

    const slotsMatch = url.pathname.match(/^\/([^/]+)\/slots$/);
    if (req.method === 'GET' && slotsMatch) return handleSlots(slotsMatch[1], url, env);

    if (req.method === 'GET' && url.pathname === '/favicon.ico') {
      return Response.redirect('https://neobookworm.uk/favicon.ico', 302);
    }

    const pageMatch = url.pathname.match(/^\/([^/]+)$/);
    if (req.method === 'GET' && pageMatch) {
      const slug = pageMatch[1];
      const config = await getConfig(slug, env);
      if (!config) return new Response('Not found', { status: 404 });
      const rescheduleToken = url.searchParams.get('reschedule') || null;
      return htmlResponse(renderBookingPage(config, slug, rescheduleToken));
    }

    return new Response(`NeoBookworm Booking — ${url.pathname}`, {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
