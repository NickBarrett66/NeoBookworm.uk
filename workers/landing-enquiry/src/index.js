/**
 * Cloudflare Worker: landing-enquiry
 *
 * Validates the payload, inserts a row into D1, returns { ok: true, id }
 * immediately, then runs the email notification in the background via
 * ctx.waitUntil(). Notion is retired (Session 0): the Worker no longer
 * writes to Notion. The `landing_enquiries.notion_*` columns remain in the
 * schema as vestigial history; new rows leave them NULL.
 *
 * Bindings required:
 *   DB            — D1 database (neobookworm-enquiries)
 * Secrets (set via `wrangler secret put`):
 *   NOTIFY_SECRET — shared secret for /api/notify-landing-enquiry on Vercel
 */

import { corsHeaders, handleOptions, isAllowedOrigin } from './cors.js';
import { validateBody }    from './validate.js';
import { syncEnquiry }     from './sync.js';
import { handleScheduled } from './scheduled.js';

export default {
  /**
   * @param {Request} request
   * @param {{ DB: D1Database, NOTIFY_SECRET?: string }} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return handleOptions(origin);
    }

    // ── Method guard ────────────────────────────────────────────────────────
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed.' }, origin);
    }

    // ── Parse body ──────────────────────────────────────────────────────────
    let rawBody;
    try {
      rawBody = await request.json();
    } catch {
      return jsonResponse(400, { error: 'Could not parse request body as JSON.' }, origin);
    }

    // ── Validate ─────────────────────────────────────────────────────────────
    const validation = validateBody(rawBody);
    if (!validation.ok) {
      return jsonResponse(400, { error: validation.error }, origin);
    }

    const { fields } = validation;

    // ── Build record ─────────────────────────────────────────────────────────
    const id         = crypto.randomUUID();
    const createdAt  = new Date().toISOString();
    const payloadJson = JSON.stringify(rawBody);

    // ── Insert into D1 ───────────────────────────────────────────────────────
    try {
      await env.DB
        .prepare(`
          INSERT INTO landing_enquiries
            (id, created_at, full_name, biz_name, email, start_option,
             source, details, current_url, payload_json)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          id,
          createdAt,
          fields.fullName,
          fields.bizName,
          fields.email,
          fields.startOption,
          fields.source,
          fields.details,
          fields.currentUrl,
          payloadJson,
        )
        .run();
    } catch (err) {
      console.error('[landing-enquiry] D1 insert error:', err.message);
      return jsonResponse(500, { error: 'Could not save enquiry.' }, origin);
    }

    console.log(`[landing-enquiry] D1 saved: ${id}`);

    // ── Background sync (email only) — must not delay the HTTP response ──
    ctx.waitUntil(syncEnquiry(env, id));

    return jsonResponse(200, { ok: true, id }, origin);
  },

  // Cron triggers — expressions defined in wrangler.toml [triggers].
  // Retry cron runs every 15 min; daily digest runs at 08:00 UTC.
  /**
   * @param {ScheduledEvent} event
   * @param {{ DB: D1Database, NOTIFY_SECRET?: string }} env
   * @param {ExecutionContext} ctx
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(event, env));
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a JSON Response with the correct Content-Type and CORS headers.
 * @param {number} status
 * @param {object} body
 * @param {string|null} origin
 */
function jsonResponse(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}
