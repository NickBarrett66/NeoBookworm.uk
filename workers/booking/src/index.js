import {
  getBusyPeriods,
  getWorkingSlots,
  filterAvailableSlots,
  wallSlotsToLabels,
  createCalendarEvent,
  createPendingMobileEvent,
  confirmMobileCalendarEvent,
  deleteCalendarEvent,
  londonWallToInstant,
  getAvailableDaysInMonth,
} from './calendar.js';
import { getConfig } from './config.js'; // async — always await getConfig(slug, env)
import {
  insertBooking,
  insertMobileBooking,
  updateBookingEvent,
  markBookingFailed,
  cancelBooking,
  getBookingByToken,
  getBookingByConfirmToken,
  getBookingById,
  confirmMobileBooking,
  countRecentBookingsByEmail,
  getWorkbenchBookings,
  updateBookingPrep,
  SlotTakenError,
} from './db.js';
import {
  sendConfirmationEmail,
  sendCancellationEmail,
  sendBusinessNotificationEmail,
  sendMobileHoldingEmail,
  sendMobileConfirmRequestEmail,
  sendMobileDeclineEmail,
} from './email.js';
import { renderBookingPage, renderManagePage, renderConfirmPage, renderWorkbenchPage, renderWorkbenchRefusalPage } from './ui.js';
import { getMobileWindowsForDay, validateAndPlaceMobileWindow, formatArrivalWindowLabel } from './mobile.js';
import { travelMinForBand } from './geo.js';
import { makeAdminKey, verifyAdminKey } from './signing.js';
import {
  handleAdminTenantList,
  handleAdminTenantGet,
  handleAdminTenantPut,
  handleAdminOptions,
} from './admin.js';
import {
  verifyWorkbenchKey,
  groupWorkbenchBookings,
  addDaysIso,
  formatWorkbenchBooking,
  isValidPrepStatus,
  WORKBENCH_HEADERS_HTML,
  WORKBENCH_HEADERS_JSON,
} from './workbench.js';

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
const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function htmlResponse(html) {
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function workbenchRefusal() {
  return new Response(renderWorkbenchRefusalPage(), { headers: WORKBENCH_HEADERS_HTML });
}

async function enrichWorkbenchBooking(booking, slug, req, env) {
  if (!booking.manageToken) return booking;
  const adminKey = await makeAdminKey(env, booking.manageToken);
  const amendUrl = await adminManageUrl(req, env, slug, booking.manageToken);
  return { ...booking, adminKey, amendUrl };
}

async function enrichWorkbenchGroup(bookings, slug, req, env) {
  return Promise.all(bookings.map((b) => enrichWorkbenchBooking(b, slug, req, env)));
}

async function enrichWorkbenchData(data, slug, req, env) {
  return {
    pending: await enrichWorkbenchGroup(data.pending, slug, req, env),
    today: await enrichWorkbenchGroup(data.today, slug, req, env),
    tomorrow: await enrichWorkbenchGroup(data.tomorrow, slug, req, env),
    upcoming: await enrichWorkbenchGroup(data.upcoming, slug, req, env),
  };
}

async function loadWorkbenchData(slug, env, req) {
  const config = await getConfig(slug, env);
  if (!config) return null;
  const today = getTodayLondon();
  const endDate = addDaysIso(today, 7);
  const rows = await getWorkbenchBookings(env.DB, slug, today, endDate);
  const grouped = groupWorkbenchBookings(rows, today, config.timezone || 'Europe/London');
  const enriched = await enrichWorkbenchData(grouped, slug, req, env);
  return { config, data: { ...enriched, updatedAt: new Date().toISOString() } };
}

async function handleWorkbenchPage(slug, url, env, req) {
  const key = url.searchParams.get('key') || '';
  const config = await getConfig(slug, env);
  if (!config || !verifyWorkbenchKey(config, key)) return workbenchRefusal();
  const loaded = await loadWorkbenchData(slug, env, req);
  if (!loaded) return workbenchRefusal();
  return new Response(
    renderWorkbenchPage(loaded.config, slug, key, loaded.data),
    { headers: WORKBENCH_HEADERS_HTML },
  );
}

async function handleWorkbenchData(slug, url, env, req) {
  const key = url.searchParams.get('key') || '';
  const config = await getConfig(slug, env);
  if (!config || !verifyWorkbenchKey(config, key)) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
      status: 403,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }
  const loaded = await loadWorkbenchData(slug, env, req);
  if (!loaded) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
      status: 403,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }
  return new Response(JSON.stringify({ ok: true, ...loaded.data }), {
    headers: WORKBENCH_HEADERS_JSON,
  });
}

async function handleWorkbenchPrep(slug, req, env) {
  const config = await getConfig(slug, env);
  if (!config) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
      status: 403,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
      status: 400,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  const { key, bookingId, prepStatus, internalNote } = body || {};
  if (!verifyWorkbenchKey(config, key || '')) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
      status: 403,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  if (!bookingId || typeof bookingId !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'missing_booking_id' }), {
      status: 400,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  if (prepStatus === undefined && internalNote === undefined) {
    return new Response(JSON.stringify({ ok: false, error: 'nothing_to_update' }), {
      status: 400,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  if (prepStatus !== undefined && !isValidPrepStatus(prepStatus)) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_prep_status' }), {
      status: 400,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  if (internalNote !== undefined && internalNote !== null && typeof internalNote !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_internal_note' }), {
      status: 400,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  if (typeof internalNote === 'string' && internalNote.length > 500) {
    return new Response(JSON.stringify({ ok: false, error: 'internal_note_too_long' }), {
      status: 400,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  const updated = await updateBookingPrep(env.DB, {
    slug,
    bookingId,
    prepStatus,
    internalNote,
  });

  if (!updated) {
    return new Response(JSON.stringify({ ok: false, error: 'not_found' }), {
      status: 404,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    booking: await enrichWorkbenchBooking(
      formatWorkbenchBooking(updated, { timezone: config.timezone || 'Europe/London' }),
      slug,
      req,
      env,
    ),
  }), {
    headers: WORKBENCH_HEADERS_JSON,
  });
}

async function handleWorkbenchConfirm(slug, req, env, ctx) {
  const config = await getConfig(slug, env);
  if (!config) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
      status: 403,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
      status: 400,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  const { key, bookingId, action } = body || {};
  if (!verifyWorkbenchKey(config, key || '')) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
      status: 403,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  if (!bookingId || typeof bookingId !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'missing_booking_id' }), {
      status: 400,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  if (action !== 'confirm' && action !== 'decline') {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_action' }), {
      status: 400,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  const booking = await getBookingById(env.DB, bookingId, slug);
  if (!booking) {
    return new Response(JSON.stringify({ ok: false, error: 'not_found' }), {
      status: 404,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  if (booking.type !== 'mobile') {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_booking' }), {
      status: 400,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  if (action === 'decline' && booking.status === 'confirmed') {
    return new Response(JSON.stringify({ ok: false, error: 'already_confirmed' }), {
      status: 409,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  if (action === 'confirm' && booking.status === 'cancelled') {
    return new Response(JSON.stringify({ ok: false, error: 'already_declined' }), {
      status: 409,
      headers: WORKBENCH_HEADERS_JSON,
    });
  }

  const outcome = action === 'confirm'
    ? await confirmPendingBooking(booking, slug, config, req, env, ctx)
    : await declinePendingBooking(booking, slug, config, req, env, ctx);

  return new Response(JSON.stringify({ ok: true, outcome }), {
    headers: WORKBENCH_HEADERS_JSON,
  });
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

function confirmUrl(req, slug, token) {
  const { origin } = new URL(req.url);
  return `${origin}/${slug}/confirm/${token}`;
}

function manageUrl(req, slug, token) {
  const { origin } = new URL(req.url);
  return `${origin}/${slug}/manage?token=${token}`;
}

/**
 * Staff (Howie) management link for embedding in the calendar event — the same
 * manage page but signed with an admin key so it bypasses the customer
 * cancellation cutoff. Falls back to the plain manage URL if no ADMIN_SECRET.
 */
async function adminManageUrl(req, env, slug, token) {
  const key = await makeAdminKey(env, token);
  const base = manageUrl(req, slug, token);
  return key ? `${base}&k=${key}` : base;
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

export function validateBookingBody(body, config) {
  const { slot, name, email, phone, note, reg, vehicleSummary, address, postcode, customAnswers } = body;
  if (!slot || !name || !email) return { error: 'Missing required fields' };
  if (typeof slot !== 'string' || !ISO_SLOT_RE.test(slot)) return { error: 'Invalid slot format' };
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 80) return { error: 'Invalid name' };
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) return { error: 'Invalid email' };

  // Phone — per-tenant enabled/required (Phase 4)
  const phoneEnabled = config.phoneEnabled !== false;
  const phoneRequired = phoneEnabled && config.phoneRequired !== false;
  let cleanPhone = null;
  if (phoneEnabled && phone != null && phone !== '') {
    if (typeof phone !== 'string' || phone.length > 30) return { error: 'Invalid phone' };
    cleanPhone = phone.trim();
  }
  if (phoneRequired && !cleanPhone) return { error: 'Phone number is required' };

  // Note — per-tenant enabled/required
  const noteEnabled = config.noteEnabled !== false;
  const noteRequired = noteEnabled && config.noteRequired === true;
  let cleanNote = null;
  if (noteEnabled && note != null && note !== '') {
    if (typeof note !== 'string' || note.length > 500) return { error: 'Note is too long' };
    cleanNote = note.trim();
  }
  if (noteRequired && !cleanNote) return { error: 'Note is required' };

  // Address + postcode — per-tenant enabled/required
  const addressEnabled = config.addressEnabled === true;
  const addressRequired = addressEnabled && config.addressRequired === true;
  let cleanAddress = null;
  let cleanPostcode = null;
  if (addressEnabled) {
    if (address != null && address !== '') {
      if (typeof address !== 'string' || address.length > 300) return { error: 'Address is too long' };
      cleanAddress = address.trim();
    }
    if (postcode != null && postcode !== '') {
      if (typeof postcode !== 'string' || postcode.length > 12 || !UK_POSTCODE_RE.test(postcode.trim())) {
        return { error: 'Please enter a valid UK postcode' };
      }
      cleanPostcode = postcode.trim().toUpperCase();
    }
    if (addressRequired && (!cleanAddress || !cleanPostcode)) return { error: 'Address and postcode are required' };
  }

  // Custom questions — validated against the tenant's configured questions
  const questions = Array.isArray(config.customQuestions) ? config.customQuestions : [];
  const cleanAnswers = [];
  if (questions.length) {
    const provided = customAnswers && typeof customAnswers === 'object' ? customAnswers : {};
    for (const q of questions) {
      const raw = provided[q.id];
      if (q.type === 'checkbox') {
        const checked = raw === true || raw === 'true' || raw === 1 || raw === '1' || raw === 'on';
        if (q.required && !checked) return { error: `"${q.label}" is required` };
        cleanAnswers.push({ label: q.label, value: checked ? 'Yes' : 'No' });
      } else {
        let val = raw == null ? '' : String(raw).trim();
        if (val.length > 500) val = val.slice(0, 500);
        if (q.type === 'select' && val && Array.isArray(q.options) && !q.options.includes(val)) {
          return { error: `Invalid choice for "${q.label}"` };
        }
        if (q.required && !val) return { error: `"${q.label}" is required` };
        if (val) cleanAnswers.push({ label: q.label, value: val });
      }
    }
  }

  const slotDate = slot.slice(0, 10);
  const dateError = validateDateParam(slotDate, config);
  if (dateError) return { error: dateError.error === 'Date is in the past' ? 'Slot is in the past' : dateError.error };
  const slotInstant = londonWallToInstant(slot, config.timezone);
  if (slotInstant.getTime() < Date.now() + config.minLeadMinutes * 60_000) return { error: 'Slot is too soon' };
  const cleanReg = reg ? String(reg).trim().toUpperCase().replace(/\s+/g, '').slice(0, 10) : null;
  const cleanVehicleSummary = vehicleSummary ? String(vehicleSummary).slice(0, 200) : null;
  return {
    slot, name: name.trim(), email: email.trim().toLowerCase(), phone: cleanPhone, note: cleanNote, slotDate,
    reg: cleanReg, vehicleSummary: cleanVehicleSummary,
    address: cleanAddress, postcode: cleanPostcode, customAnswers: cleanAnswers,
  };
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

// Full house-level address finder — proxies Postcoder so the API key (which sits
// in the request URL path) stays server-side. Gated to tenants on
// addressLookup:'full' and rate-limited to protect paid credits.
async function handleAddressLookup(slug, url, req, env) {
  const config = await getConfig(slug, env);
  if (!config) return jsonResponse({ error: 'Unknown booking slug' }, 404);
  if (!config.addressEnabled || config.addressLookup !== 'full') {
    return jsonResponse({ error: 'Address lookup not enabled' }, 400);
  }
  const key = env.POSTCODER_API_KEY;
  if (!key) return jsonResponse({ error: 'Address lookup not configured' }, 500);

  const postcode = (url.searchParams.get('postcode') || '').trim();
  if (!UK_POSTCODE_RE.test(postcode)) return jsonResponse({ error: 'Invalid postcode' }, 400);

  const ip = req.headers.get('CF-Connecting-IP');
  if (await checkIpRateLimit(env, ip)) return jsonResponse({ error: 'too_many' }, 429);

  try {
    const pc = encodeURIComponent(postcode.toUpperCase());
    const endpoint = `https://ws.postcoder.com/pcw/${encodeURIComponent(key)}/address/uk/${pc}?format=json&lines=3`;
    const res = await fetch(endpoint);
    const data = await res.json().catch(() => null);
    // Postcoder returns a bare JSON array of addresses on success.
    if (!res.ok || !Array.isArray(data)) {
      // A 404 / non-array for a valid-format postcode usually means "no matches".
      if (res.status === 404) return jsonResponse({ addresses: [] });
      console.error('[booking] postcoder error:', res.status, JSON.stringify(data).slice(0, 200));
      return jsonResponse({ error: 'lookup_failed' }, 502);
    }
    const addresses = data.map((a) => {
      const lines = [a.addressline1, a.addressline2, a.addressline3].filter(Boolean);
      return {
        line1: a.addressline1 || lines[0] || '',
        line2: [a.addressline2, a.addressline3].filter(Boolean).join(', '),
        town: a.posttown || '',
        postcode: a.postcode || postcode.toUpperCase(),
        summary: a.summaryline || [...lines, a.posttown, a.postcode].filter(Boolean).join(', '),
      };
    });
    return jsonResponse({ addresses });
  } catch (err) {
    console.error('[booking] address lookup error:', err);
    return jsonResponse({ error: 'lookup_failed' }, 502);
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

  const { slot, name, email, phone, note, reg, vehicleSummary, address, postcode, customAnswers } = validated;
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
    ({ id: bookingId, manageToken } = await insertBooking(env.DB, { slug, slotStart, slotEnd, name, email, phone, note, reg, vehicleSummary, address, postcode, customAnswers }));
  } catch (err) {
    if (err instanceof SlotTakenError) return jsonResponse({ ok: false, error: 'slot_taken' }, 409);
    console.error('[booking] insert error:', err);
    throw err;
  }

  const adminUrl = await adminManageUrl(req, env, slug, manageToken);
  let googleEvent;
  try {
    googleEvent = await createCalendarEvent(env, { slotStart, slotEnd, name, email, phone, note, reg, vehicleSummary, address, postcode, customAnswers, manageUrl: adminUrl }, config);
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
    sendBusinessNotificationEmail(env, { name, email, phone, slotStart, slotEnd, businessName: config.displayName, reg, vehicleSummary, address, postcode, customAnswers, locationType: config.locationType, manageUrl: adminUrl }),
  );

  return jsonResponse({ ok: true, name, slotStart, slotEnd });
}

async function handleManage(slug, url, env) {
  const config = await getConfig(slug, env);
  if (!config) return new Response('Not found', { status: 404 });

  const token = url.searchParams.get('token');
  if (!token) return htmlResponse(renderManagePage(null, 'invalid', config, slug));

  const adminKey = url.searchParams.get('k');
  const isAdmin = await verifyAdminKey(env, token, adminKey);

  const booking = await getBookingByToken(env.DB, token);
  return htmlResponse(
    renderManagePage(booking || null, booking ? 'found' : 'not_found', config, slug, {
      isAdmin,
      adminKey: isAdmin ? adminKey : null,
    }),
  );
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

  // Staff (admin-signed) links bypass the customer cancellation cutoff.
  const isAdmin = await verifyAdminKey(env, token, body.adminKey);
  if (!isAdmin) {
    const cutoffMin = config.cancellationCutoffMinutes ?? config.minLeadMinutes;
    const slotInstant = londonWallToInstant(booking.slot_start, config.timezone);
    if (slotInstant.getTime() < Date.now()) return jsonResponse({ ok: false, error: 'already_past' }, 409);
    if (slotInstant.getTime() <= Date.now() + cutoffMin * 60_000) {
      return jsonResponse({ ok: false, error: 'too_late' }, 409);
    }
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

  // Staff (admin-signed) links bypass the customer change-window cutoff.
  const isAdmin = await verifyAdminKey(env, token, body.adminKey);
  if (!isAdmin) {
    const cutoffMin = config.cancellationCutoffMinutes ?? config.minLeadMinutes;
    const oldSlotInstant = londonWallToInstant(booking.slot_start, config.timezone);
    if (oldSlotInstant.getTime() <= Date.now() + cutoffMin * 60_000) {
      return jsonResponse({ ok: false, error: 'too_late' }, 409);
    }
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

  let oldCustomAnswers = null;
  if (booking.custom_answers) {
    try { oldCustomAnswers = JSON.parse(booking.custom_answers); } catch { oldCustomAnswers = null; }
  }

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
      address: booking.address,
      postcode: booking.postcode,
      customAnswers: oldCustomAnswers,
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
  const newAdminUrl = await adminManageUrl(req, env, slug, newManageToken);
  let googleEvent;
  try {
    googleEvent = await createCalendarEvent(
      env,
      { slotStart: slot, slotEnd, name: booking.name, email: booking.email, phone: booking.phone, note: booking.note, reg: booking.reg, vehicleSummary: booking.vehicle_summary, address: booking.address, postcode: booking.postcode, customAnswers: oldCustomAnswers, manageUrl: newAdminUrl },
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

async function handleMobileWindows(slug, url, env) {
  const config = await getConfig(slug, env);
  if (!config) return jsonResponse({ error: 'Unknown booking slug' }, 404);
  if (!config.mobileBooking) return jsonResponse({ error: 'Mobile booking not enabled' }, 400);

  const date = url.searchParams.get('date');
  const postcode = (url.searchParams.get('postcode') || '').trim();
  const validationError = validateDateParam(date, config);
  if (validationError) return jsonResponse({ error: validationError.error }, validationError.status);
  if (!postcode || !UK_POSTCODE_RE.test(postcode)) {
    return jsonResponse({ error: 'Invalid postcode' }, 400);
  }

  try {
    const result = await getMobileWindowsForDay(env, date, postcode, config);
    return jsonResponse(result);
  } catch (err) {
    console.error('[booking] mobile-windows error:', err);
    return jsonResponse({ error: 'Unable to fetch mobile windows' }, 502);
  }
}

function validateMobileRequestBody(body) {
  const {
    date, arrivalWindow, postcode, name, email, phone, note, reg, vehicleSummary, address,
  } = body;

  if (!date || !arrivalWindow || !postcode || !name || !email || !phone || !address) {
    return { error: 'Missing required fields' };
  }
  if (!ISO_DATE_RE.test(date)) return { error: 'Invalid date format' };
  if (!['am', 'pm'].includes(arrivalWindow)) return { error: 'Invalid arrival window' };
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 80) return { error: 'Invalid name' };
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) return { error: 'Invalid email' };
  if (typeof phone !== 'string' || phone.trim().length === 0 || phone.length > 30) return { error: 'Invalid phone' };
  if (typeof address !== 'string' || address.trim().length === 0 || address.length > 300) {
    return { error: 'Address is required' };
  }
  if (typeof postcode !== 'string' || postcode.length > 12 || !UK_POSTCODE_RE.test(postcode.trim())) {
    return { error: 'Please enter a valid UK postcode' };
  }
  if (note != null && note !== '' && (typeof note !== 'string' || note.length > 500)) {
    return { error: 'Note is too long' };
  }

  const cleanReg = reg ? String(reg).trim().toUpperCase().replace(/\s+/g, '').slice(0, 10) : null;
  const cleanVehicleSummary = vehicleSummary ? String(vehicleSummary).slice(0, 200) : null;

  return {
    date,
    arrivalWindow,
    postcode: postcode.trim().toUpperCase(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    note: note ? String(note).trim() : null,
    reg: cleanReg,
    vehicleSummary: cleanVehicleSummary,
    address: address.trim(),
  };
}

async function handleMobileRequest(slug, req, env, ctx) {
  const config = await getConfig(slug, env);
  if (!config) return jsonResponse({ ok: false, error: 'Unknown booking slug' }, 404);
  if (!config.mobileBooking) return jsonResponse({ ok: false, error: 'Mobile booking not enabled' }, 400);

  let body;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400); }

  if (body.company) return jsonResponse({ ok: true });

  const ip = req.headers.get('CF-Connecting-IP');
  if (await checkIpRateLimit(env, ip)) return jsonResponse({ ok: false, error: 'too_many' }, 429);

  const validated = validateMobileRequestBody(body);
  if (validated.error) return jsonResponse({ ok: false, error: validated.error }, 400);

  const dateError = validateDateParam(validated.date, config);
  if (dateError) return jsonResponse({ ok: false, error: dateError.error }, dateError.status);

  const {
    date, arrivalWindow, postcode, name, email, phone, note, reg, vehicleSummary, address,
  } = validated;

  let placement;
  try {
    placement = await validateAndPlaceMobileWindow(env, date, arrivalWindow, postcode, config);
  } catch (err) {
    console.error('[booking] mobile placement error:', err);
    return jsonResponse({ ok: false, error: 'calendar_error' }, 502);
  }

  if (placement.error === 'out_of_area') return jsonResponse({ ok: false, error: 'out_of_area' }, 400);
  if (placement.error) return jsonResponse({ ok: false, error: 'window_unavailable' }, 409);

  const { slotStart, slotEnd, band, travelEachWayMin } = placement;

  const recentCount = await countRecentBookingsByEmail(env.DB, slug, email, sqliteSince24h());
  if (recentCount >= 3) return jsonResponse({ ok: false, error: 'too_many' }, 429);

  const confirmToken = crypto.randomUUID();
  let bookingId, manageToken;
  try {
    ({ id: bookingId, manageToken } = await insertMobileBooking(env.DB, {
      slug,
      slotStart,
      slotEnd,
      name,
      email,
      phone,
      note,
      reg,
      vehicleSummary,
      address,
      postcode,
      band,
      arrivalWindow,
      confirmToken,
    }));
  } catch (err) {
    console.error('[booking] mobile insert error:', err);
    throw err;
  }

  const adminUrl = await adminManageUrl(req, env, slug, manageToken);
  let googleEvent;
  try {
    googleEvent = await createPendingMobileEvent(env, {
      slotStart, slotEnd, name, email, phone, note, reg, vehicleSummary, address, postcode,
      arrivalWindow, travelEachWayMin, manageUrl: adminUrl,
    }, config);
  } catch (err) {
    console.error('[booking] pending calendar create error:', err);
    await markBookingFailed(env.DB, bookingId);
    return jsonResponse({ ok: false, error: 'calendar_error' }, 502);
  }

  await updateBookingEvent(env.DB, bookingId, googleEvent.id);

  const arrivalLabel = formatArrivalWindowLabel(date, arrivalWindow, config.timezone);
  const cUrl = confirmUrl(req, slug, confirmToken);

  ctx.waitUntil(
    sendMobileHoldingEmail(env, { to: email, name, arrivalLabel, businessName: config.displayName }),
  );
  ctx.waitUntil(
    sendMobileConfirmRequestEmail(env, {
      name, email, phone, slotStart, slotEnd, businessName: config.displayName,
      reg, vehicleSummary, address, postcode, arrivalLabel, confirmUrl: cUrl, manageUrl: adminUrl,
    }),
  );

  return jsonResponse({ ok: true, name, arrivalLabel, date, arrivalWindow });
}

/**
 * Core confirm logic — shared by the email link and the workbench.
 * @returns {'confirmed' | 'already_confirmed' | 'invalid'}
 */
async function confirmPendingBooking(booking, slug, config, req, env, ctx) {
  if (booking.status === 'confirmed') return 'already_confirmed';
  if (booking.status !== 'pending') return 'invalid';

  await confirmMobileBooking(env.DB, booking.id);

  if (booking.google_event_id) {
    try {
      const adminUrl = await adminManageUrl(req, env, slug, booking.manage_token);
      await confirmMobileCalendarEvent(
        env,
        booking.google_event_id,
        {
          slotStart: booking.slot_start,
          slotEnd: booking.slot_end,
          name: booking.name,
          email: booking.email,
          phone: booking.phone,
          note: booking.note,
          reg: booking.reg,
          vehicleSummary: booking.vehicle_summary,
          address: booking.address,
          postcode: booking.postcode,
          arrivalWindow: booking.arrival_window,
          travelEachWayMin: travelMinForBand(booking.band),
          manageUrl: adminUrl,
          createdAt: booking.created_at,
        },
        config,
      );
    } catch (err) {
      console.error('[booking] confirm calendar update error:', err);
    }
  }

  const mUrl = manageUrl(req, slug, booking.manage_token);
  ctx.waitUntil(
    sendConfirmationEmail(env, {
      to: booking.email,
      name: booking.name,
      slotStart: booking.slot_start,
      slotEnd: booking.slot_end,
      businessName: config.displayName,
      manageUrl: mUrl,
    }),
  );

  return 'confirmed';
}

/**
 * Decline a pending mobile request — cancel row, free calendar, notify customer.
 * @returns {'declined' | 'already_declined' | 'invalid'}
 */
async function declinePendingBooking(booking, slug, config, req, env, ctx) {
  if (booking.status === 'cancelled') return 'already_declined';
  if (booking.status === 'confirmed') return 'invalid';
  if (booking.status !== 'pending') return 'invalid';

  await cancelBooking(env.DB, booking.id);

  if (booking.google_event_id) {
    ctx.waitUntil(
      deleteCalendarEvent(env, booking.google_event_id, config)
        .catch((err) => console.error('[booking] decline calendar delete error:', err)),
    );
  }

  const isoDate = (booking.slot_start || '').slice(0, 10);
  const arrivalLabel = booking.arrival_window
    ? formatArrivalWindowLabel(isoDate, booking.arrival_window, config.timezone || 'Europe/London')
    : null;
  const { origin } = new URL(req.url);
  const bookingUrl = `${origin}/${slug}`;

  ctx.waitUntil(
    sendMobileDeclineEmail(env, {
      to: booking.email,
      name: booking.name,
      arrivalLabel,
      businessName: config.displayName,
      bookingUrl,
    }),
  );

  return 'declined';
}

async function handleConfirm(slug, token, req, env, ctx) {
  const config = await getConfig(slug, env);
  if (!config) return new Response('Not found', { status: 404 });

  const booking = await getBookingByConfirmToken(env.DB, token);
  if (!booking || booking.slug !== slug) {
    return htmlResponse(renderConfirmPage(null, 'not_found', config));
  }

  const outcome = await confirmPendingBooking(booking, slug, config, req, env, ctx);

  if (outcome === 'already_confirmed') {
    return htmlResponse(renderConfirmPage(booking, 'already_confirmed', config));
  }
  if (outcome === 'invalid') {
    return htmlResponse(renderConfirmPage(booking, 'invalid', config));
  }
  return htmlResponse(renderConfirmPage(booking, 'confirmed', config));
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

    const addressMatch = url.pathname.match(/^\/([^/]+)\/address-lookup$/);
    if (req.method === 'GET' && addressMatch) return handleAddressLookup(addressMatch[1], url, req, env);

    const mobileWindowsMatch = url.pathname.match(/^\/([^/]+)\/mobile-windows$/);
    if (req.method === 'GET' && mobileWindowsMatch) return handleMobileWindows(mobileWindowsMatch[1], url, env);

    const mobileRequestMatch = url.pathname.match(/^\/([^/]+)\/mobile-request$/);
    if (req.method === 'POST' && mobileRequestMatch) return handleMobileRequest(mobileRequestMatch[1], req, env, ctx);

    const confirmMatch = url.pathname.match(/^\/([^/]+)\/confirm\/([^/]+)$/);
    if (req.method === 'GET' && confirmMatch) return handleConfirm(confirmMatch[1], confirmMatch[2], req, env, ctx);

    const workbenchDataMatch = url.pathname.match(/^\/([^/]+)\/workbench\/data$/);
    if (req.method === 'GET' && workbenchDataMatch) return handleWorkbenchData(workbenchDataMatch[1], url, env, req);

    const workbenchPrepMatch = url.pathname.match(/^\/([^/]+)\/workbench\/prep$/);
    if (req.method === 'POST' && workbenchPrepMatch) return handleWorkbenchPrep(workbenchPrepMatch[1], req, env);

    const workbenchConfirmMatch = url.pathname.match(/^\/([^/]+)\/workbench\/confirm$/);
    if (req.method === 'POST' && workbenchConfirmMatch) {
      return handleWorkbenchConfirm(workbenchConfirmMatch[1], req, env, ctx);
    }

    const workbenchMatch = url.pathname.match(/^\/([^/]+)\/workbench$/);
    if (req.method === 'GET' && workbenchMatch) return handleWorkbenchPage(workbenchMatch[1], url, env, req);

    if (req.method === 'GET' && url.pathname === '/favicon.ico') {
      return Response.redirect('https://neobookworm.uk/favicon.ico', 302);
    }

    const pageMatch = url.pathname.match(/^\/([^/]+)$/);
    if (req.method === 'GET' && pageMatch) {
      const slug = pageMatch[1];
      const config = await getConfig(slug, env);
      if (!config) return new Response('Not found', { status: 404 });
      const rescheduleToken = url.searchParams.get('reschedule') || null;
      // Admin key carried through so a staff-initiated reschedule bypasses the cutoff.
      let adminKey = url.searchParams.get('k') || null;
      if (adminKey && !(await verifyAdminKey(env, rescheduleToken, adminKey))) adminKey = null;
      return htmlResponse(renderBookingPage(config, slug, rescheduleToken, adminKey));
    }

    return new Response(`NeoBookworm Booking — ${url.pathname}`, {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
