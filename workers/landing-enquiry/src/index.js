/**
 * Cloudflare Worker: landing-enquiry
 *
 * Phase 1 — validates the payload, inserts a row into D1, returns { ok: true, id }.
 * Notion and email are intentionally NOT called in this phase.
 *
 * Bindings required:
 *   DB  — D1 database (neobookworm-enquiries)
 */

import { corsHeaders, handleOptions, isAllowedOrigin } from './cors.js';
import { validateBody } from './validate.js';

export default {
  /**
   * @param {Request} request
   * @param {{ DB: D1Database }} env
   */
  async fetch(request, env) {
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

    return jsonResponse(200, { ok: true, id }, origin);
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
