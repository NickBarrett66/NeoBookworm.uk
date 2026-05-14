/**
 * Background sync for landing-enquiry Worker (Phase 2).
 *
 * Called via ctx.waitUntil() after D1 insert succeeds — runs in background,
 * never changes the HTTP response.
 *
 * Steps:
 *   1. Load the full D1 row by id (parse payload_json for field data)
 *   2. Create Notion row → update D1 notion_status/notion_page_id/notion_error/notion_attempts
 *   3. POST to Vercel /api/notify-landing-enquiry → update D1 email_status/email_error/email_attempts
 *
 * Exported:
 *   syncEnquiry(env, id) → Promise<void>   (never throws — all errors caught internally)
 */

import { createLandingEnquiryRecord } from './notion.js';
import { sendNotifyEmail }            from './email.js';

// ── D1 helpers ────────────────────────────────────────────────────────────────

async function updateD1(db, id, cols) {
  const keys   = Object.keys(cols);
  const values = Object.values(cols);
  if (!keys.length) return;
  const setClauses = keys.map((k) => `${k} = ?`).join(', ');
  await db
    .prepare(`UPDATE landing_enquiries SET ${setClauses} WHERE id = ?`)
    .bind(...values, id)
    .run();
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {{ DB: D1Database, NOTION_API_KEY?: string, NOTIFY_SECRET?: string }} env
 * @param {string} id  — UUID of the landing_enquiries row
 */
export async function syncEnquiry(env, id) {
  // ── 1. Load row from D1 ────────────────────────────────────────────────────
  let row;
  try {
    row = await env.DB
      .prepare('SELECT * FROM landing_enquiries WHERE id = ?')
      .bind(id)
      .first();
  } catch (err) {
    console.error(`[sync] D1 SELECT failed for ${id}:`, err.message);
    return;
  }

  if (!row) {
    console.error(`[sync] Row not found in D1: ${id}`);
    return;
  }

  // Parse payload_json to get field data (same source used by Phase 3 retry cron).
  let payload;
  try {
    payload = JSON.parse(row.payload_json || '{}');
  } catch {
    payload = {};
  }

  const fields = {
    fullName:    row.full_name   || payload.fullName    || '',
    bizName:     row.biz_name    || payload.bizName     || '',
    email:       row.email       || payload.email       || '',
    startOption: row.start_option|| payload.startOption || '',
    source:      row.source      || payload.source      || '',
    currentUrl:  row.current_url || payload.currentUrl  || '',
    details:     row.details     || payload.details     || '',
  };

  // ── 2. Notion ──────────────────────────────────────────────────────────────
  // Skip if this leg already succeeded (safe on both first-run and retry).
  let notionPageId = row.notion_page_id || null;

  if (row.notion_status === 'ok' || row.notion_status === 'skipped') {
    console.log(`[sync] Notion already ${row.notion_status} for ${id} — skipping`);
  } else if (!env.NOTION_API_KEY) {
    console.warn('[sync] NOTION_API_KEY not set — skipping Notion');
    await updateD1(env.DB, id, {
      notion_status: 'skipped',
      notion_attempts: (row.notion_attempts || 0) + 1,
    }).catch((e) => console.error('[sync] D1 update (notion skipped) failed:', e.message));
  } else {
    try {
      const page = await createLandingEnquiryRecord(fields, env.NOTION_API_KEY);
      notionPageId = page && page.id;
      await updateD1(env.DB, id, {
        notion_status:   'ok',
        notion_page_id:  notionPageId || null,
        notion_error:    null,
        notion_attempts: (row.notion_attempts || 0) + 1,
      });
      console.log(`[sync] Notion ok for ${id}, page ${notionPageId}`);
    } catch (err) {
      const errMsg = (err.message || String(err)).slice(0, 500);
      console.error(`[sync] Notion failed for ${id}:`, errMsg);
      await updateD1(env.DB, id, {
        notion_status:   'failed',
        notion_error:    errMsg,
        notion_attempts: (row.notion_attempts || 0) + 1,
      }).catch((e) => console.error('[sync] D1 update (notion failed) failed:', e.message));
    }
  }

  // ── 3. Email (via Vercel notify endpoint) ──────────────────────────────────
  // Skip if this leg already succeeded or was intentionally skipped.
  if (row.email_status === 'ok' || row.email_status === 'skipped') {
    console.log(`[sync] Email already ${row.email_status} for ${id} — skipping`);
    return;
  }

  if (!env.NOTIFY_SECRET) {
    console.warn('[sync] NOTIFY_SECRET not set on Worker — skipping email');
    await updateD1(env.DB, id, {
      email_status: 'skipped',
    }).catch((e) => console.error('[sync] D1 update (email skipped) failed:', e.message));
    return;
  }

  try {
    await sendNotifyEmail(fields, notionPageId, env);
    await updateD1(env.DB, id, {
      email_status:   'ok',
      email_error:    null,
      email_attempts: (row.email_attempts || 0) + 1,
    });
    console.log(`[sync] Email ok for ${id}`);
  } catch (err) {
    const errMsg = (err.message || String(err)).slice(0, 500);
    console.error(`[sync] Email failed for ${id}:`, errMsg);
    await updateD1(env.DB, id, {
      email_status:   'failed',
      email_error:    errMsg,
      email_attempts: (row.email_attempts || 0) + 1,
    }).catch((e) => console.error('[sync] D1 update (email failed) failed:', e.message));
  }
}
