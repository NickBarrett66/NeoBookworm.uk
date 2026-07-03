import { formatArrivalWindowLabel } from './mobile.js';

export const PREP_STATUSES = ['new', 'stock_checked', 'ordered', 'ready'];

export const PREP_LABELS = {
  new: 'New',
  stock_checked: 'Stock checked',
  ordered: 'Ordered',
  ready: 'Ready',
};

export const PREP_ADVANCE_LABELS = {
  new: 'Check stock',
  stock_checked: 'Mark ordered',
  ordered: 'Mark ready',
  ready: 'Ready',
};

export const PREP_NEXT = {
  new: 'stock_checked',
  stock_checked: 'ordered',
  ordered: 'ready',
  ready: null,
};

export const PREP_PREV = {
  new: null,
  stock_checked: 'new',
  ordered: 'stock_checked',
  ready: 'ordered',
};

export function isValidPrepStatus(value) {
  return typeof value === 'string' && PREP_STATUSES.includes(value);
}

export const WORKBENCH_HEADERS_HTML = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

export const WORKBENCH_HEADERS_JSON = {
  'Content-Type': 'application/json',
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

/** Constant-time compare of the workbench bearer key against tenant config. */
export function verifyWorkbenchKey(config, key) {
  if (!config?.workbenchEnabled) return false;
  const token = config.workbenchToken;
  if (!token || typeof token !== 'string' || token.length < 32) return false;
  if (!key || typeof key !== 'string' || key.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ key.charCodeAt(i);
  }
  return diff === 0;
}

function fmtWallTime(wall) {
  const timePart = (wall || '').split('T')[1] || '';
  const [hh, mm] = timePart.split(':');
  const h = parseInt(hh, 10);
  if (Number.isNaN(h)) return timePart.slice(0, 5);
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 || 12;
  return `${h12}:${mm}${ampm}`;
}

function fmtShortDate(isoDate, timeZone = 'Europe/London') {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone,
  }).format(dt);
}

function mapsQuery(address, postcode) {
  const parts = [address, postcode].filter(Boolean).join(', ');
  return parts ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts)}` : null;
}

function telHref(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : null;
}

/**
 * Normalise a D1 booking row into a display/JSON-friendly object.
 * @param {object} row — raw bookings row
 * @param {object} opts — { timezone, showDate }
 */
export function formatWorkbenchBooking(row, { timezone = 'Europe/London', showDate = false } = {}) {
  const isoDate = (row.slot_start || '').slice(0, 10);
  const isMobile = row.type === 'mobile';
  const isPending = row.status === 'pending';

  let timeLabel;
  if (isMobile && row.arrival_window) {
    timeLabel = formatArrivalWindowLabel(isoDate, row.arrival_window, timezone);
  } else if (showDate && isoDate) {
    timeLabel = `${fmtShortDate(isoDate, timezone)} · ${fmtWallTime(row.slot_start)}`;
  } else {
    timeLabel = fmtWallTime(row.slot_start);
  }

  const mapsUrl = isMobile ? mapsQuery(row.address, row.postcode) : null;

  const prepStatus = row.prep_status || 'new';

  return {
    id: row.id,
    timeLabel,
    type: isMobile ? 'mobile' : 'depot',
    typeLabel: isMobile ? 'Mobile' : 'Depot',
    isPending,
    name: row.name || '',
    reg: row.reg || null,
    phone: row.phone || '',
    telHref: telHref(row.phone),
    email: row.email || '',
    address: row.address || null,
    postcode: row.postcode || null,
    mapsUrl,
    band: row.band || null,
    note: row.note || null,
    slotDate: isoDate,
    prepStatus,
    prepLabel: PREP_LABELS[prepStatus] || PREP_LABELS.new,
    advancePrepLabel: PREP_ADVANCE_LABELS[prepStatus] || PREP_ADVANCE_LABELS.new,
    nextPrepStatus: PREP_NEXT[prepStatus] ?? null,
    prevPrepStatus: PREP_PREV[prepStatus] ?? null,
    internalNote: row.internal_note || null,
    isReady: prepStatus === 'ready',
  };
}

/** Section heading with optional not-ready count (Today / Tomorrow). */
export function workbenchSectionTitle(title, bookings, { showReadyCount = false } = {}) {
  if (!showReadyCount || !bookings?.length) return title;
  const notReady = bookings.filter((b) => b.prepStatus !== 'ready').length;
  if (!notReady) return title;
  return `${title} · ${notReady} of ${bookings.length} not ready`;
}

/** Group raw rows into pending / today / tomorrow / upcoming (days 2–7). */
export function groupWorkbenchBookings(rows, todayLondon, timezone = 'Europe/London') {
  const tomorrow = addDaysIso(todayLondon, 1);
  const endDate = addDaysIso(todayLondon, 7);

  const pending = [];
  const today = [];
  const tomorrowRows = [];
  const upcoming = [];

  for (const row of rows) {
    if (row.status === 'pending') {
      pending.push(formatWorkbenchBooking(row, { timezone }));
      continue;
    }
    if (row.status !== 'confirmed') continue;
    const d = (row.slot_start || '').slice(0, 10);
    if (d === todayLondon) {
      today.push(formatWorkbenchBooking(row, { timezone }));
    } else if (d === tomorrow) {
      tomorrowRows.push(formatWorkbenchBooking(row, { timezone }));
    } else if (d > tomorrow && d <= endDate) {
      upcoming.push(formatWorkbenchBooking(row, { timezone, showDate: true }));
    }
  }

  return { pending, today, tomorrow: tomorrowRows, upcoming };
}

export function addDaysIso(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
