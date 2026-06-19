import {
  getBusyPeriods,
  getWorkingSlots,
  filterAvailableSlots,
  wallSlotsToLabels,
  createCalendarEvent,
  londonWallToInstant,
} from './calendar.js';
import { getConfig } from './config.js';
import {
  insertBooking,
  updateBookingEvent,
  markBookingFailed,
  countRecentBookingsByEmail,
  SlotTakenError,
} from './db.js';
import { sendConfirmationEmail } from './email.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const BOOK_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_SLOT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function getTodayLondon() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const p = dtf.formatToParts(end).reduce((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

function sqliteSince24h() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

function validateDateParam(date, config) {
  if (!date) {
    return { error: 'Missing date parameter', status: 400 };
  }
  if (!ISO_DATE_RE.test(date)) {
    return { error: 'Invalid date format — use YYYY-MM-DD', status: 400 };
  }

  const today = getTodayLondon();
  if (date < today) {
    return { error: 'Date is in the past', status: 400 };
  }

  const maxDate = addDays(today, config.maxAdvanceDays);
  if (date > maxDate) {
    return { error: `Date is more than ${config.maxAdvanceDays} days ahead`, status: 400 };
  }

  return null;
}

function validateBookingBody(body, config) {
  const { slot, name, email, phone, note } = body;

  if (!slot || !name || !email || !phone) {
    return { error: 'Missing required fields' };
  }

  if (typeof slot !== 'string' || !ISO_SLOT_RE.test(slot)) {
    return { error: 'Invalid slot format' };
  }

  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 80) {
    return { error: 'Invalid name' };
  }

  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return { error: 'Invalid email' };
  }

  if (typeof phone !== 'string' || phone.trim().length === 0 || phone.length > 30) {
    return { error: 'Invalid phone' };
  }

  if (note != null && (typeof note !== 'string' || note.length > 500)) {
    return { error: 'Note is too long' };
  }

  const slotDate = slot.slice(0, 10);
  const dateError = validateDateParam(slotDate, config);
  if (dateError) {
    return { error: dateError.error === 'Date is in the past' ? 'Slot is in the past' : dateError.error };
  }

  const slotInstant = londonWallToInstant(slot, config.timezone);
  const minStart = Date.now() + config.minLeadMinutes * 60_000;
  if (slotInstant.getTime() < minStart) {
    return { error: 'Slot is too soon' };
  }

  return {
    slot,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    note: note?.trim() || null,
    slotDate,
  };
}

async function checkIpRateLimit(env, ip) {
  if (!ip) return false;

  const key = `rl:${ip}`;
  const current = parseInt((await env.TOKEN_CACHE.get(key)) || '0', 10);
  const next = current + 1;
  await env.TOKEN_CACHE.put(key, String(next), { expirationTtl: 60 });
  return next > 5;
}

async function isSlotAvailable(env, slot, config) {
  const slotDate = slot.slice(0, 10);
  const workingSlots = getWorkingSlots(slotDate, config);
  if (workingSlots.length === 0) {
    return false;
  }

  const busyPeriods = await getBusyPeriods(env, slotDate, config);
  const availableWall = filterAvailableSlots(workingSlots, busyPeriods, config);
  return availableWall.includes(slot);
}

async function handleSlots(slug, url, env) {
  const config = getConfig(slug);
  if (!config) {
    return jsonResponse({ error: 'Unknown booking slug' }, 404);
  }

  const date = url.searchParams.get('date');
  const validationError = validateDateParam(date, config);
  if (validationError) {
    return jsonResponse({ error: validationError.error }, validationError.status);
  }

  const workingSlots = getWorkingSlots(date, config);
  if (workingSlots.length === 0) {
    return jsonResponse({ date, slots: [] });
  }

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
  const config = getConfig(slug);
  if (!config) {
    return jsonResponse({ ok: false, error: 'Unknown booking slug' }, 404);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  if (body.company) {
    return jsonResponse({ ok: true });
  }

  const ip = req.headers.get('CF-Connecting-IP');
  if (await checkIpRateLimit(env, ip)) {
    return jsonResponse({ ok: false, error: 'too_many' }, 429);
  }

  const validated = validateBookingBody(body, config);
  if (validated.error) {
    return jsonResponse({ ok: false, error: validated.error }, 400);
  }

  const { slot, name, email, phone, note } = validated;
  const slotStart = slot;
  const slotEnd = wallEndFromStart(slotStart, config.slotDuration, config.timezone);

  try {
    const available = await isSlotAvailable(env, slotStart, config);
    if (!available) {
      return jsonResponse({ ok: false, error: 'slot_taken' }, 409);
    }
  } catch (err) {
    console.error('[booking] slot availability check error:', err);
    return jsonResponse({ ok: false, error: 'calendar_error' }, 502);
  }

  const recentCount = await countRecentBookingsByEmail(env.DB, slug, email, sqliteSince24h());
  if (recentCount >= 3) {
    return jsonResponse({ ok: false, error: 'too_many' }, 429);
  }

  let bookingId;
  try {
    ({ id: bookingId } = await insertBooking(env.DB, {
      slug,
      slotStart,
      slotEnd,
      name,
      email,
      phone,
      note,
    }));
  } catch (err) {
    if (err instanceof SlotTakenError) {
      return jsonResponse({ ok: false, error: 'slot_taken' }, 409);
    }
    console.error('[booking] insert error:', err);
    throw err;
  }

  let googleEvent;
  try {
    googleEvent = await createCalendarEvent(
      env,
      { slotStart, slotEnd, name, email, phone, note },
      config,
    );
  } catch (err) {
    console.error('[booking] calendar create error:', err);
    await markBookingFailed(env.DB, bookingId);
    return jsonResponse({ ok: false, error: 'calendar_error' }, 502);
  }

  await updateBookingEvent(env.DB, bookingId, googleEvent.id);

  ctx.waitUntil(
    sendConfirmationEmail(env, {
      to: email,
      name,
      slotStart,
      slotEnd,
      businessName: config.displayName,
    }),
  );

  return jsonResponse({ ok: true, name, slotStart, slotEnd });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

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

    if (req.method === 'POST' && bookMatch) {
      return handleBook(bookMatch[1], req, env, ctx);
    }

    const slotsMatch = url.pathname.match(/^\/([^/]+)\/slots$/);
    if (req.method === 'GET' && slotsMatch) {
      return handleSlots(slotsMatch[1], url, env);
    }

    return new Response(`NeoBookworm Booking — ${url.pathname}`, {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
