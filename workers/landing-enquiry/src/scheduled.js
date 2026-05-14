// Scheduled handler for landing-enquiry Worker (Phase 3).
//
// Two cron expressions are configured in wrangler.toml [triggers]:
//   every 15 min  — retry cron: pick up rows where a sync leg failed and attempt again
//   0 8 * * *     — daily digest (08:00 UTC = 08:00 GMT / 09:00 BST):
//                   email Nick a list of all rows still failing after retries
//
// Both crons call syncEnquiry() from sync.js — no duplicated Notion/email logic.

import { syncEnquiry } from './sync.js';

// Rows to retry: either leg failed and under the attempt cap, within the last 7 days.
const RETRY_SQL = `
  SELECT id, notion_status, notion_attempts, email_status, email_attempts
  FROM   landing_enquiries
  WHERE  (
           (notion_status = 'failed' AND notion_attempts < 5)
           OR
           (email_status  = 'failed' AND email_attempts  < 5)
         )
    AND  created_at > datetime('now', '-7 days')
  ORDER  BY created_at ASC
  LIMIT  20
`;

// All rows still in a failed state (no age limit — we must not silently drop old failures).
const DIGEST_SQL = `
  SELECT id, created_at, email, biz_name, source,
         notion_status, email_status, notion_error, email_error
  FROM   landing_enquiries
  WHERE  notion_status = 'failed'
    OR   email_status  = 'failed'
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
    // Unknown schedule — log and exit cleanly.
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
      `[retry] id=${row.id}  notion=${row.notion_status}(${row.notion_attempts})  email=${row.email_status}(${row.email_attempts})`,
    );
    // syncEnquiry loads the full row from D1 and skips any leg that is already ok/skipped.
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
    // No failures — stay silent (do not send an email).
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
    notion_status: r.notion_status,
    email_status:  r.email_status,
    notion_error:  r.notion_error  ?? null,
    email_error:   r.email_error   ?? null,
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
