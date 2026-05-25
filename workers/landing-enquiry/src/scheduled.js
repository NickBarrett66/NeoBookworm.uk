// Scheduled handler for landing-enquiry Worker.
//
// Two cron expressions are configured in wrangler.toml [triggers]:
//   every 15 min  — retry cron: pick up rows where the email leg failed and try again
//   0 8 * * *     — daily digest (08:00 UTC = 08:00 GMT / 09:00 BST):
//                   email Nick a list of all rows still failing after retries
//
// Notion is retired (Session 0). The retry and digest queries no longer
// consider `notion_status` — only `email_status`. Older rows that have
// `notion_status='failed'` are inert: nothing reads or writes that column
// from this Worker any more.
//
// Both crons call syncEnquiry() from sync.js — no duplicated email logic.

import { syncEnquiry } from './sync.js';

// Rows to retry: email leg failed and under the attempt cap, within the last 7 days.
const RETRY_SQL = `
  SELECT id, email_status, email_attempts
  FROM   landing_enquiries
  WHERE  email_status = 'failed'
    AND  email_attempts < 5
    AND  created_at > datetime('now', '-7 days')
  ORDER  BY created_at ASC
  LIMIT  20
`;

// All rows still in a failed state (no age limit — we must not silently drop old failures).
const DIGEST_SQL = `
  SELECT id, created_at, email, biz_name, source,
         email_status, email_error
  FROM   landing_enquiries
  WHERE  email_status = 'failed'
  ORDER  BY created_at ASC
`;

// ── Exported entry point ───────────────────────────────────────────────────────

/**
 * @param {ScheduledEvent} event
 * @param {{ DB: D1Database, NOTIFY_SECRET?: string }} env
 */
export async function handleScheduled(event, env) {
  const cron = event.cron;

  if (cron === '*/15 * * * *') {
    await runRetry(env);
  } else if (cron === '0 8 * * *') {
    await runDigest(env);
  } else {
    console.warn(`[scheduled] Unknown cron expression: "${cron}" — no action taken`);
  }
}

// ── Retry cron ────────────────────────────────────────────────────────────────

async function runRetry(env) {
  console.log('[retry] Querying for failed rows…');

  let rows;
  try {
    const result = await env.DB.prepare(RETRY_SQL).all();
    rows = result.results ?? [];
  } catch (err) {
    console.error('[retry] D1 query failed:', err.message);
    return;
  }

  console.log(`[retry] ${rows.length} row(s) eligible for retry`);

  for (const row of rows) {
    console.log(
      `[retry] id=${row.id}  email=${row.email_status}(${row.email_attempts})`,
    );
    // syncEnquiry loads the full row from D1 and skips the email leg if already ok/skipped.
    await syncEnquiry(env, row.id);
  }

  console.log('[retry] Done');
}

// ── Daily digest ──────────────────────────────────────────────────────────────

async function runDigest(env) {
  console.log('[digest] Checking for unresolved failed rows…');

  if (!env.NOTIFY_SECRET) {
    console.warn('[digest] NOTIFY_SECRET not set — digest email skipped');
    return;
  }

  let rows;
  try {
    const result = await env.DB.prepare(DIGEST_SQL).all();
    rows = result.results ?? [];
  } catch (err) {
    console.error('[digest] D1 query failed:', err.message);
    return;
  }

  if (!rows.length) {
    console.log('[digest] No failed rows — no email sent');
    return;
  }

  console.log(`[digest] ${rows.length} unresolved row(s) — posting digest to notify endpoint`);

  const digestRows = rows.map((r) => ({
    id:            r.id,
    created_at:    r.created_at,
    email:         r.email,
    biz_name:      r.biz_name,
    source:        r.source,
    email_status:  r.email_status,
    email_error:   r.email_error ?? null,
  }));

  try {
    const res = await fetch('https://neobookworm.uk/api/notify-landing-enquiry', {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'X-Notify-Secret': env.NOTIFY_SECRET,
      },
      body: JSON.stringify({ type: 'digest', rows: digestRows }),
    });

    if (res.ok) {
      console.log('[digest] Digest email sent successfully');
    } else {
      const text = await res.text().catch(() => '');
      console.error(`[digest] Notify endpoint returned ${res.status}: ${text}`);
    }
  } catch (err) {
    console.error('[digest] POST to notify endpoint failed:', err.message);
  }
}
