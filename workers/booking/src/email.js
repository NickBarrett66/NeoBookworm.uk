const NOTIFY_URL = 'https://neobookworm.uk/api/notify-booking';

async function postNotify(env, payload) {
  const secret = env.NOTIFY_BOOKING_SECRET;
  if (!secret) {
    console.warn('[email] NOTIFY_BOOKING_SECRET not set — skipping email');
    return;
  }
  try {
    const res = await fetch(NOTIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Notify-Secret': secret },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, 500);
      console.error(`[email] notify-booking returned ${res.status}:`, text);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!data.ok) console.error('[email] notify-booking failed:', data.error || 'unknown error');
    else console.log('[email] email queued for', payload.to);
  } catch (err) {
    console.error('[email] notify-booking fetch error:', err.message || err);
  }
}

export async function sendConfirmationEmail(env, { to, name, slotStart, slotEnd, businessName, manageUrl, isReschedule }) {
  await postNotify(env, { type: 'confirmation', to, name, slotStart, slotEnd, businessName, manageUrl, isReschedule });
}

export async function sendCancellationEmail(env, { to, name, slotStart, businessName }) {
  await postNotify(env, { type: 'cancellation', to, name, slotStart, businessName });
}

export async function sendBusinessNotificationEmail(env, { name, email, phone, slotStart, slotEnd, businessName, reg, vehicleSummary, address, postcode, customAnswers, locationType }) {
  await postNotify(env, { type: 'business_notification', name, email, phone, slotStart, slotEnd, businessName, reg, vehicleSummary, address, postcode, customAnswers, locationType });
}

export async function sendMobileHoldingEmail(env, { to, name, arrivalLabel, businessName }) {
  await postNotify(env, { type: 'mobile_holding', to, name, arrivalLabel, businessName });
}

export async function sendMobileConfirmRequestEmail(env, {
  name, email, phone, slotStart, slotEnd, businessName, reg, vehicleSummary,
  address, postcode, arrivalLabel, confirmUrl,
}) {
  await postNotify(env, {
    type: 'mobile_confirm_request',
    name, email, phone, slotStart, slotEnd, businessName, reg, vehicleSummary,
    address, postcode, arrivalLabel, confirmUrl,
  });
}
