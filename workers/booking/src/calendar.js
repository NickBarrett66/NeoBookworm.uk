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

  return slots;
}

export function filterAvailableSlots(workingSlots, busyPeriods, config = SLUG_CONFIG.hetyres) {
  const timeZone = config.timezone;
  return workingSlots
    .filter(
      (slot) =>
        !busyPeriods.some(
          (busy) => slot.start < busy.end && slot.end > busy.start,
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

export async function createCalendarEvent(
  env,
  { slotStart, slotEnd, name, email, phone, note },
  config = SLUG_CONFIG.hetyres,
) {
  const calendarId = calendarIdFor(env, config);
  const token = await getAccessToken(env);

  const summary = `Booking: ${name}`;
  const description = [
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    note ? `Note: ${note}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary,
        description,
        start: { dateTime: slotStart, timeZone: config.timezone },
        end: { dateTime: slotEnd, timeZone: config.timezone },
        attendees: [{ email }],
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar event create failed: ${res.status} ${text}`);
  }

  return res.json();
}
