/**
 * Booking confirmation email — calls the Vercel notify-booking route.
 *
 * Workers cannot open TCP connections to SMTP ports. Fire-and-forget via
 * ctx.waitUntil in the book handler. Does not throw — logs errors instead.
 */

const NOTIFY_URL = 'https://neobookworm.uk/api/notify-booking';

/**
 * @param {{ NOTIFY_BOOKING_SECRET?: string }} env
 * @param {{ to: string, name: string, slotStart: string, slotEnd: string, businessName: string }} booking
 */
export async function sendConfirmationEmail(env, { to, name, slotStart, slotEnd, businessName }) {
  const secret = env.NOTIFY_BOOKING_SECRET;
  if (!secret) {
    console.warn('[email] NOTIFY_BOOKING_SECRET not set — skipping confirmation email');
    return;
  }

  try {
    const res = await fetch(NOTIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Notify-Secret': secret,
      },
      body: JSON.stringify({ to, name, slotStart, slotEnd, businessName }),
    });

    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, 500);
      console.error(`[email] notify-booking returned ${res.status}:`, text);
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      console.error('[email] notify-booking failed:', data.error || 'unknown error');
      return;
    }

    console.log('[email] confirmation email queued for', to);
  } catch (err) {
    console.error('[email] notify-booking fetch error:', err.message || err);
  }
}
