import { londonWallToInstant, getBusyPeriods, getWorkingSlots } from './calendar.js';
import { resolvePostcodeBand } from './geo.js';

const DOW_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function getDayOfWeek(isoDate, timeZone) {
  const noon = londonWallToInstant(`${isoDate}T12:00:00`, timeZone);
  const dayName = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(noon);
  return DOW_MAP[dayName];
}

export const MOBILE_FIT_MINUTES = 45;
export const MOBILE_SAFETY_MARGIN_MINUTES = 15;

export function computeBlockLengthMinutes(travelEachWayMin) {
  return travelEachWayMin * 2 + MOBILE_FIT_MINUTES + MOBILE_SAFETY_MARGIN_MINUTES;
}

/** AM / PM window bounds for a working day (London wall instants). */
export function getWindowBounds(isoDate, windowId, config) {
  const timeZone = config.timezone;
  const dayOfWeek = getDayOfWeek(isoDate, timeZone);
  const hours = config.workingHours[dayOfWeek];
  if (!hours) return null;

  const dayOpen = londonWallToInstant(`${isoDate}T${hours.open}:00`, timeZone);
  const dayClose = londonWallToInstant(`${isoDate}T${hours.close}:00`, timeZone);

  const lb = config.lunchBreak;
  const lunchStart = lb?.start
    ? londonWallToInstant(`${isoDate}T${lb.start}:00`, timeZone)
    : londonWallToInstant(`${isoDate}T12:00:00`, timeZone);
  const lunchEnd = lb?.end
    ? londonWallToInstant(`${isoDate}T${lb.end}:00`, timeZone)
    : lunchStart;

  if (windowId === 'am') {
    return { start: dayOpen, end: lunchStart };
  }
  if (windowId === 'pm') {
    return { start: lunchEnd, end: dayClose };
  }
  return null;
}

function padBusyPeriods(busyPeriods, bufferMs) {
  return busyPeriods
    .map((b) => ({
      start: b.start.getTime() - bufferMs,
      end: b.end.getTime() + bufferMs,
    }))
    .sort((a, b) => a.start - b.start);
}

/** Contiguous free gaps within [rangeStart, rangeEnd] that are at least blockMs long. */
export function findGapsInRange(rangeStartMs, rangeEndMs, busyPeriods, bufferMs, blockMs, minStartMs) {
  const padded = padBusyPeriods(busyPeriods, bufferMs);
  const gaps = [];
  let cursor = Math.max(rangeStartMs, minStartMs);

  for (const busy of padded) {
    if (busy.end <= cursor) continue;
    if (busy.start >= rangeEndMs) break;
    const gapEnd = Math.min(busy.start, rangeEndMs);
    if (gapEnd - cursor >= blockMs) {
      gaps.push({ start: cursor, end: gapEnd });
    }
    cursor = Math.max(cursor, busy.end);
  }

  if (rangeEndMs - cursor >= blockMs) {
    gaps.push({ start: cursor, end: rangeEndMs });
  }

  return gaps;
}

function windowHasGap(bounds, busyPeriods, config, blockMs, nowMs) {
  if (!bounds || bounds.end.getTime() <= bounds.start.getTime()) return false;
  const bufferMs = (config.bufferMinutes || 0) * 60_000;
  const minStartMs = nowMs + (config.minLeadMinutes || 0) * 60_000;
  const gaps = findGapsInRange(
    bounds.start.getTime(),
    bounds.end.getTime(),
    busyPeriods,
    bufferMs,
    blockMs,
    minStartMs,
  );
  return gaps.length > 0;
}

export const ARRIVAL_WINDOWS = [
  { id: 'am', label: 'Morning' },
  { id: 'pm', label: 'Afternoon' },
];

/**
 * First fitting gap inside a window — used when placing a pending block.
 * @returns {{ slotStart: string, slotEnd: string } | null}
 */
export function placeBlockInWindow(isoDate, windowId, busyPeriods, config, blockMinutes, nowMs = Date.now()) {
  const bounds = getWindowBounds(isoDate, windowId, config);
  if (!bounds) return null;

  const timeZone = config.timezone;
  const blockMs = blockMinutes * 60_000;
  const bufferMs = (config.bufferMinutes || 0) * 60_000;
  const minStartMs = nowMs + (config.minLeadMinutes || 0) * 60_000;

  const gaps = findGapsInRange(
    bounds.start.getTime(),
    bounds.end.getTime(),
    busyPeriods,
    bufferMs,
    blockMs,
    minStartMs,
  );
  if (!gaps.length) return null;

  const gap = gaps[0];
  const slotStartInstant = new Date(gap.start);
  const slotEndInstant = new Date(gap.start + blockMs);

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

  function toWall(instant) {
    const p = dtf.formatToParts(instant).reduce((a, x) => ((a[x.type] = x.value), a), {});
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  }

  return { slotStart: toWall(slotStartInstant), slotEnd: toWall(slotEndInstant) };
}

export function formatArrivalWindowLabel(isoDate, windowId, timeZone = 'Europe/London') {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const dateStr = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(dt);
  const part = windowId === 'am' ? 'morning' : 'afternoon';
  return `${dateStr} ${part}`;
}

/**
 * Resolve band + list available arrival windows for a date/postcode.
 */
export async function getMobileWindowsForDay(env, isoDate, postcode, config) {
  const bandResult = await resolvePostcodeBand(postcode);
  if (!bandResult.inArea) return { inArea: false };

  const workingSlots = getWorkingSlots(isoDate, config);
  if (!workingSlots.length) {
    return {
      inArea: true,
      band: bandResult.band,
      travelEachWayMin: bandResult.travelEachWayMin,
      distanceMiles: bandResult.distanceMiles,
      blockMinutes: computeBlockLengthMinutes(bandResult.travelEachWayMin),
      date: isoDate,
      windows: ARRIVAL_WINDOWS.map((w) => ({ ...w, available: false })),
    };
  }

  const busyPeriods = await getBusyPeriods(env, isoDate, config);
  const blockMs = computeBlockLengthMinutes(bandResult.travelEachWayMin) * 60_000;
  const nowMs = Date.now();

  const windows = ARRIVAL_WINDOWS.map((w) => {
    const bounds = getWindowBounds(isoDate, w.id, config);
    return {
      id: w.id,
      label: w.label,
      available: windowHasGap(bounds, busyPeriods, config, blockMs, nowMs),
    };
  });

  return {
    inArea: true,
    band: bandResult.band,
    travelEachWayMin: bandResult.travelEachWayMin,
    distanceMiles: bandResult.distanceMiles,
    blockMinutes: computeBlockLengthMinutes(bandResult.travelEachWayMin),
    date: isoDate,
    windows,
  };
}

/**
 * Re-derive and validate a window server-side; returns slot placement or error.
 */
export async function validateAndPlaceMobileWindow(env, isoDate, windowId, postcode, config) {
  const bandResult = await resolvePostcodeBand(postcode);
  if (!bandResult.inArea) return { error: 'out_of_area' };

  if (!ARRIVAL_WINDOWS.some((w) => w.id === windowId)) return { error: 'invalid_window' };

  const windowsData = await getMobileWindowsForDay(env, isoDate, postcode, config);
  const chosen = windowsData.windows?.find((w) => w.id === windowId);
  if (!chosen?.available) return { error: 'window_unavailable' };

  const busyPeriods = await getBusyPeriods(env, isoDate, config);
  const blockMinutes = computeBlockLengthMinutes(bandResult.travelEachWayMin);
  const placement = placeBlockInWindow(isoDate, windowId, busyPeriods, config, blockMinutes);
  if (!placement) return { error: 'window_unavailable' };

  return {
    band: bandResult.band,
    travelEachWayMin: bandResult.travelEachWayMin,
    blockMinutes,
    arrivalWindow: windowId,
    ...placement,
  };
}
