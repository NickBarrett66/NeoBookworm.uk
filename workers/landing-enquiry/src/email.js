/**
 * Email notification for landing-enquiry Worker.
 *
 * Workers cannot open TCP connections to SMTP ports (587, 465).
 * Instead, POST to the thin Vercel function /api/notify-landing-enquiry
 * which uses iCloud SMTP via Nodemailer.
 *
 * Exported:
 *   sendNotifyEmail(fields, env) → { ok: true } | throws
 */

/**
 * POST to https://neobookworm.uk/api/notify-landing-enquiry.
 *
 * @param {object} fields  — { fullName, bizName, email, startOption, source, currentUrl, details }
 * @param {{ NOTIFY_SECRET?: string }} env — Worker bindings/secrets
 */
export async function sendNotifyEmail(fields, env) {
  const secret = env.NOTIFY_SECRET;
  if (!secret) {
    console.warn('[email] NOTIFY_SECRET not set on Worker — skipping email notification');
    return { skipped: true };
  }

  const payload = {
    fullName:    fields.fullName    || '',
    bizName:     fields.bizName     || '',
    email:       fields.email       || '',
    startOption: fields.startOption || '',
    source:      fields.source      || '',
    currentUrl:  fields.currentUrl  || '',
    details:     fields.details     || '',
  };

  const res = await fetch('https://neobookworm.uk/api/notify-landing-enquiry', {
    method: 'POST',
    headers: {
      'Content-Type':   'application/json',
      'X-Notify-Secret': secret,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 500);
    const err = new Error(`notify-landing-enquiry returned ${res.status}`);
    err.httpStatus = res.status;
    err.responseBody = text;
    throw err;
  }

  console.log('[email] notify-landing-enquiry responded 200 ok');
  return { ok: true };
}
