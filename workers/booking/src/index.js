import {
  getBusyPeriods,
  getWorkingSlots,
  filterAvailableSlots,
  wallSlotsToLabels,
} from './calendar.js';
import { getConfig } from './config.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
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
