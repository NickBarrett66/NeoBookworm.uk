// Booking Worker proxy — Worker ES module version.
// Passes env instead of reading process.env.

const WORKER_URL_DEFAULT = 'https://neobookworm-booking.nickbarrett.workers.dev';

function workerUrl(env) {
  return (env.BOOKING_WORKER_URL || WORKER_URL_DEFAULT).replace(/\/$/, '');
}

/** Call the booking Worker admin API. Returns { status, data }. Never throws on HTTP errors. */
export async function bookingAdmin(env, path, { method = 'GET', body } = {}) {
  const secret = env.BOOKING_ADMIN_SECRET;
  if (!secret) throw new Error('BOOKING_ADMIN_SECRET not configured');

  const res = await fetch(`${workerUrl(env)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const snippet = text.slice(0, 120).replace(/\s+/g, ' ').trim();
    data = { ok: false, error: `Booking API returned non-JSON (${res.status}): ${snippet || '<empty>'} — is the Worker deployed with the /admin routes?` };
  }
  return { status: res.status, data };
}
