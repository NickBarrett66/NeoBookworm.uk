import { SLUG_CONFIG } from './config.js';

const TOKEN_CACHE_KEY = 'gtoken';
const TOKEN_TTL_SECONDS = 3300;

const DOW_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Returns the UTC offset (ms) that `timeZone` had at the given instant.
function tzOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = dtf.formatToParts(date).reduce((a, x) => ((a[x.type] = x.value), a), {});
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - date.getTime();
}

// "2026-06-23T08:30:00" (London wall time) -> Date (correct UTC instant).
export function londonWallToInstant(wall, timeZone = 'Europe/London') {
  const guess = new Date(wall + 'Z');
  const offset = tzOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset);
}

function getTodayIso(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getDayOfWeek(isoDate, timeZone) {
  const noon = londonWallToInstant(`${isoDate}T12:00:00`, timeZone);
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(noon);
  return DOW_MAP[dayName];
}

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function instantToWallString(instant, timeZone) {
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
  const p = dtf.formatToParts(instant).reduce((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

function instantToTimeLabel(instant, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return dtf.format(instant);
}

function calendarIdFor(env, config) {
  return config?.calendarId ?? env.GOOGLE_CALENDAR_ID;
}

// "2026-06-23 08:30:00" (SQLite `datetime('now')`, UTC, no offset) -> Date.
function parseSqliteUtc(sqliteDatetime) {
  return new Date(sqliteDatetime.replace(' ', 'T') + 'Z');
}

function bookedAtLabel(instant, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return dtf.format(instant);
}

export async function getAccessToken(env) {
  const cached = await env.TOKEN_CACHE.get(TOKEN_CACHE_KEY, 'json');
  if (cached?.token && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  console.log('[booking] fetching new Google access token');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;
  await env.TOKEN_CACHE.put(
    TOKEN_CACHE_KEY,
    JSON.stringify({ token: data.access_token, expiresAt }),
    { expirationTtl: TOKEN_TTL_SECONDS },
  );
  return data.access_token;
}

export async function getBusyPeriods(env, isoDate, config = SLUG_CONFIG.hetyres) {
  const timeZone = config.timezone;
  const calendarId = calendarIdFor(env, config);
  const timeMin = londonWallToInstant(`${isoDate}T00:00:00`, timeZone).toISOString();
  const timeMax = londonWallToInstant(`${addDays(isoDate, 1)}T00:00:00`, timeZone).toISOString();

  const token = await getAccessToken(env);
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [{ id: calendarId }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google freeBusy failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const busy = data.calendars?.[calendarId]?.busy ?? [];
  return busy.map(({ start, end }) => ({
    start: new Date(start),
    end: new Date(end),
  }));
}

export function getWorkingSlots(isoDate, config = SLUG_CONFIG.hetyres) {
  const timeZone = config.timezone;
  const today = getTodayIso(timeZone);
  if (isoDate < today) return [];

  const dayOfWeek = getDayOfWeek(isoDate, timeZone);
  const hours = config.workingHours[dayOfWeek];
  if (!hours) return [];

  const { open, close } = hours;
  const durationMs = config.slotDuration * 60_000;
  const slots = [];
  let cursor = londonWallToInstant(`${isoDate}T${open}:00`, timeZone);
  const dayEnd = londonWallToInstant(`${isoDate}T${close}:00`, timeZone);

  while (cursor.getTime() + durationMs <= dayEnd.getTime()) {
    const end = new Date(cursor.getTime() + durationMs);
    slots.push({ start: new Date(cursor), end });
    cursor = end;
  }

  // Phase 5 — daily lunch/midday gap: drop any slot overlapping the break window.
  const lb = config.lunchBreak;
  if (lb && lb.start && lb.end) {
    const lunchStart = londonWallToInstant(`${isoDate}T${lb.start}:00`, timeZone).getTime();
    const lunchEnd = londonWallToInstant(`${isoDate}T${lb.end}:00`, timeZone).getTime();
    return slots.filter((s) => !(s.start.getTime() < lunchEnd && s.end.getTime() > lunchStart));
  }

  return slots;
}

export function filterAvailableSlots(
  workingSlots,
  busyPeriods,
  config = SLUG_CONFIG.hetyres,
  nowMs = Date.now(),
) {
  const timeZone = config.timezone;
  // Phase 5 — buffer between appointments: pad each busy period on both sides so
  // back-to-back bookings leave a gap. Applies to our own events and external
  // calendar events alike (both come through freebusy).
  const bufferMs = (config.bufferMinutes || 0) * 60_000;
  const minStartMs = nowMs + (config.minLeadMinutes || 0) * 60_000;
  return workingSlots
    .filter((slot) => slot.start.getTime() >= minStartMs)
    .filter(
      (slot) =>
        !busyPeriods.some(
          (busy) =>
            slot.start.getTime() < busy.end.getTime() + bufferMs &&
            slot.end.getTime() > busy.start.getTime() - bufferMs,
        ),
    )
    .map((slot) => instantToWallString(slot.start, timeZone));
}

export function wallSlotsToLabels(wallSlots, timeZone = 'Europe/London') {
  return wallSlots.map((wall) => {
    const instant = londonWallToInstant(wall, timeZone);
    return instantToTimeLabel(instant, timeZone);
  });
}

async function getBusyPeriodsRange(env, timeMin, timeMax, config) {
  const calendarId = calendarIdFor(env, config);
  const token = await getAccessToken(env);
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: calendarId }] }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google freeBusy failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  const busy = data.calendars?.[calendarId]?.busy ?? [];
  return busy.map(({ start, end }) => ({ start: new Date(start), end: new Date(end) }));
}

// Returns array of ISO date strings that have at least one available slot.
// Makes a single FreeBusy call for the whole month range.
export async function getAvailableDaysInMonth(env, month, config) {
  const [y, m] = month.split('-').map(Number);
  const timeZone = config.timezone;
  const today = getTodayIso(timeZone);
  const maxDate = addDays(today, config.maxAdvanceDays);

  const firstDay = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const rangeStart = firstDay > today ? firstDay : today;
  const rangeEnd = lastDay < maxDate ? lastDay : maxDate;
  if (rangeStart > rangeEnd) return [];

  const timeMin = londonWallToInstant(`${rangeStart}T00:00:00`, timeZone).toISOString();
  const timeMax = londonWallToInstant(`${addDays(rangeEnd, 1)}T00:00:00`, timeZone).toISOString();

  const busyPeriods = await getBusyPeriodsRange(env, timeMin, timeMax, config);

  const available = [];
  let cursor = rangeStart;
  while (cursor <= rangeEnd) {
    const workingSlots = getWorkingSlots(cursor, config);
    if (workingSlots.length > 0) {
      const dayStartMs = londonWallToInstant(`${cursor}T00:00:00`, timeZone).getTime();
      const dayEndMs = londonWallToInstant(`${addDays(cursor, 1)}T00:00:00`, timeZone).getTime();
      const dayBusy = busyPeriods.filter(
        (bp) => bp.start.getTime() < dayEndMs && bp.end.getTime() > dayStartMs,
      );
      const avail = filterAvailableSlots(workingSlots, dayBusy, config);
      if (avail.length > 0) available.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  return available;
}

export async function deleteCalendarEvent(env, eventId, config = SLUG_CONFIG.hetyres) {
  const calendarId = calendarIdFor(env, config);
  const token = await getAccessToken(env);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  // 404/410 means already gone — that's fine
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text();
    throw new Error(`Google Calendar event delete failed: ${res.status} ${text}`);
  }
}

export async function createCalendarEvent(
  env,
  { slotStart, slotEnd, name, email, phone, note, reg, vehicleSummary, address, postcode, customAnswers, manageUrl },
  config = SLUG_CONFIG.hetyres,
) {
  const calendarId = calendarIdFor(env, config);
  const token = await getAccessToken(env);

  const summary = reg ? `Booking: ${name} (${reg})` : `Booking: ${name}`;
  const description = [
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    reg ? `Reg: ${reg}` : null,
    vehicleSummary ? `Vehicle: ${vehicleSummary}` : null,
    address ? `Address: ${address}` : null,
    postcode ? `Postcode: ${postcode}` : null,
    note ? `Note: ${note}` : null,
    ...(Array.isArray(customAnswers) ? customAnswers.map((a) => `${a.label}: ${a.value}`) : []),
    `Booked: ${bookedAtLabel(new Date(), config.timezone)}`,
    manageUrl ? `\n⚙ Cancel / amend this booking: ${manageUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  // Location-type-aware event location field.
  const locationType = config.locationType || 'in_person';
  let eventLocation = null;
  if (locationType === 'phone') eventLocation = 'Phone call';
  else if (locationType === 'video') eventLocation = config.locationDetail || 'Video call';
  else eventLocation = config.locationDetail || address || null; // in_person

  const event = {
    summary,
    description,
    start: { dateTime: slotStart, timeZone: config.timezone },
    end: { dateTime: slotEnd, timeZone: config.timezone },
    attendees: [{ email }],
  };
  if (eventLocation) event.location = eventLocation;

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar event create failed: ${res.status} ${text}`);
  }

  return res.json();
}

// ── Mobile job timing breakdown (single-event, shown in Howie's calendar) ──────
const MOBILE_FIT_MINUTES_DEFAULT = 45;

function wallTimeLabel(wall) {
  const [, timePart] = wall.split('T');
  const [hh, mm] = timePart.split(':');
  const h = parseInt(hh, 10);
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 || 12;
  return `${h12}:${mm}${ampm}`;
}

function addMinutesToWall(wall, minutes) {
  const [datePart, timePart] = wall.split('T');
  const [h, m, s = '00'] = timePart.split(':');
  let total = parseInt(h, 10) * 60 + parseInt(m, 10) + minutes;
  total = ((total % 1440) + 1440) % 1440; // clamp within the day (safe in working hours)
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${datePart}T${hh}:${mm}:${s}`;
}

/**
 * Break a mobile job's single time block into its travel-out / fit / travel-back
 * legs. slotStart is when Howie leaves the depot; the customer fit starts after
 * the outbound travel, and the safety margin trails the return.
 */
function computeMobileTiming(slotStart, travelEachWayMin, fitMinutes = MOBILE_FIT_MINUTES_DEFAULT) {
  const fitStartWall = addMinutesToWall(slotStart, travelEachWayMin);
  const fitEndWall = addMinutesToWall(fitStartWall, fitMinutes);
  const backWall = addMinutesToWall(fitEndWall, travelEachWayMin);
  return {
    departLabel: wallTimeLabel(slotStart),
    fitStartLabel: wallTimeLabel(fitStartWall),
    fitEndLabel: wallTimeLabel(fitEndWall),
    backLabel: wallTimeLabel(backWall),
  };
}

function mobileTimingLines(t, travelEachWayMin) {
  return [
    'Timing (one job block):',
    `  • Depart depot: ${t.departLabel}`,
    `  • Fit at customer: ${t.fitStartLabel}–${t.fitEndLabel}`,
    `  • Back at depot: ${t.backLabel}`,
    `  (travel ~${travelEachWayMin} min each way; safety margin trails)`,
  ];
}

export async function createPendingMobileEvent(
  env,
  { slotStart, slotEnd, name, email, phone, note, reg, vehicleSummary, address, postcode, arrivalWindow, travelEachWayMin, fitMinutes, manageUrl },
  config = SLUG_CONFIG.hetyres,
) {
  const calendarId = calendarIdFor(env, config);
  const token = await getAccessToken(env);

  const windowLabel = arrivalWindow === 'am' ? 'morning' : 'afternoon';
  const timing = travelEachWayMin ? computeMobileTiming(slotStart, travelEachWayMin, fitMinutes) : null;
  const fitRange = timing ? `${timing.fitStartLabel}–${timing.fitEndLabel} ` : '';
  const summary = reg
    ? `PENDING — Mobile ${fitRange}(${windowLabel}): ${name} (${reg})`
    : `PENDING — Mobile ${fitRange}(${windowLabel}): ${name}`;
  const description = [
    'Status: PENDING — awaiting Howie confirmation',
    `Arrival window: ${windowLabel}`,
    ...(timing ? mobileTimingLines(timing, travelEachWayMin) : []),
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    reg ? `Reg: ${reg}` : null,
    vehicleSummary ? `Vehicle: ${vehicleSummary}` : null,
    address ? `Address: ${address}` : null,
    postcode ? `Postcode: ${postcode}` : null,
    note ? `Note: ${note}` : null,
    `Booked: ${bookedAtLabel(new Date(), config.timezone)}`,
    manageUrl ? `\n⚙ Cancel / amend this booking: ${manageUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const event = {
    summary,
    description,
    start: { dateTime: slotStart, timeZone: config.timezone },
    end: { dateTime: slotEnd, timeZone: config.timezone },
    colorId: '5',
    attendees: [{ email }],
  };
  if (address || postcode) {
    event.location = [address, postcode].filter(Boolean).join(', ');
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar pending event create failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function confirmMobileCalendarEvent(
  env,
  eventId,
  { slotStart, slotEnd, name, email, phone, note, reg, vehicleSummary, address, postcode, arrivalWindow, travelEachWayMin, fitMinutes, manageUrl, createdAt },
  config = SLUG_CONFIG.hetyres,
) {
  const calendarId = calendarIdFor(env, config);
  const token = await getAccessToken(env);

  const windowLabel = arrivalWindow === 'am' ? 'morning' : 'afternoon';
  const timing = travelEachWayMin ? computeMobileTiming(slotStart, travelEachWayMin, fitMinutes) : null;
  const fitRange = timing ? `${timing.fitStartLabel}–${timing.fitEndLabel} ` : '';
  const summary = reg
    ? `Mobile ${fitRange}(${windowLabel}): ${name} (${reg})`
    : `Mobile ${fitRange}(${windowLabel}): ${name}`;
  const description = [
    `Arrival window: ${windowLabel}`,
    ...(timing ? mobileTimingLines(timing, travelEachWayMin) : []),
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    reg ? `Reg: ${reg}` : null,
    vehicleSummary ? `Vehicle: ${vehicleSummary}` : null,
    address ? `Address: ${address}` : null,
    postcode ? `Postcode: ${postcode}` : null,
    note ? `Note: ${note}` : null,
    `Booked: ${bookedAtLabel(createdAt ? parseSqliteUtc(createdAt) : new Date(), config.timezone)}`,
    manageUrl ? `\n⚙ Cancel / amend this booking: ${manageUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const event = {
    summary,
    description,
    start: { dateTime: slotStart, timeZone: config.timezone },
    end: { dateTime: slotEnd, timeZone: config.timezone },
    colorId: '10',
    attendees: [{ email }],
  };
  if (address || postcode) {
    event.location = [address, postcode].filter(Boolean).join(', ');
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar event confirm update failed: ${res.status} ${text}`);
  }

  return res.json();
}
