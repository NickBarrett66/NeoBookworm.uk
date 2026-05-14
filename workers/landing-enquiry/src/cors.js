/**
 * CORS helpers for the landing-enquiry Worker.
 *
 * Allowed origins:
 *   - https://neobookworm.uk
 *   - https://www.neobookworm.uk
 *   - Any localhost or 127.0.0.1 port (for local dev / wrangler dev)
 */

const ALLOWED_ORIGINS = [
  'https://neobookworm.uk',
  'https://www.neobookworm.uk',
];

/**
 * Returns true if the Origin header is permitted.
 * @param {string|null} origin
 */
export function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.startsWith('http://localhost:')) return true;
  if (origin.startsWith('http://127.0.0.1:')) return true;
  return false;
}

/**
 * Builds the CORS response headers for a given origin.
 * Returns an empty object if the origin is not permitted (no CORS headers set).
 * @param {string|null} origin
 * @returns {Record<string, string>}
 */
export function corsHeaders(origin) {
  if (!isAllowedOrigin(origin)) return {};
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
    'Vary':                         'Origin',
  };
}

/**
 * Responds to a CORS preflight OPTIONS request.
 * @param {string|null} origin
 * @returns {Response}
 */
export function handleOptions(origin) {
  const headers = corsHeaders(origin);
  if (Object.keys(headers).length === 0) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers });
}
