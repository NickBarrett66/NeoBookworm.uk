// Thin proxy to the booking Worker's authenticated tenant-config admin API.
//
// The booking Worker owns tenant config (its own D1 + KV cache). The dashboard
// must not write that D1 directly — only the Worker can bust its KV cache on
// write. So dashboard tenant actions call these endpoints server-side, keeping
// the Worker admin secret out of the browser.
//
// Required env var:
//   BOOKING_ADMIN_SECRET — matches the Worker's ADMIN_SECRET
// Optional:
//   BOOKING_WORKER_URL   — defaults to the production workers.dev URL

const WORKER_URL_DEFAULT = 'https://neobookworm-booking.nickbarrett.workers.dev';

function workerUrl() {
  return (process.env.BOOKING_WORKER_URL || WORKER_URL_DEFAULT).replace(/\/$/, '');
}

/** Call the Worker admin API. Returns { status, data }. Never throws on HTTP errors. */
async function bookingAdmin(path, { method = 'GET', body } = {}) {
  const secret = process.env.BOOKING_ADMIN_SECRET;
  if (!secret) throw new Error('BOOKING_ADMIN_SECRET not configured');

  const res = await fetch(`${workerUrl()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // Non-JSON body (e.g. the Worker's plain-text catch-all when /admin routes
    // aren't deployed). Surface a snippet so the cause is obvious.
    const snippet = text.slice(0, 120).replace(/\s+/g, ' ').trim();
    data = { ok: false, error: `Booking API returned non-JSON (${res.status}): ${snippet || '<empty>'} — is the Worker deployed with the /admin routes?` };
  }
  return { status: res.status, data };
}

module.exports = { bookingAdmin };
