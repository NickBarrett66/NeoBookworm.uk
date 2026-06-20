// Authenticated tenant-config admin API.
//
// The booking Worker is the SINGLE OWNER of tenant config (the `tenants` D1 table
// + the `tenant:<slug>` KV cache). The Vercel dashboard never touches that D1
// directly — it calls these endpoints so that (a) every write is validated against
// the schema, and (b) the KV cache is busted on write. That keeps one owner and
// one cache-invalidation path.
//
// Auth: Authorization: Bearer <env.ADMIN_SECRET>.
//
// Routes (wired in index.js):
//   GET  /admin/tenants            → list tenants (+ schema for the editor)
//   GET  /admin/tenant/:slug       → one tenant's full config (+ schema)
//   PUT  /admin/tenant/:slug       → validate + merge + write + bust KV

import { SLUG_CONFIG } from './config.js';
import {
  schemaForScope, applyDefaults, validatePatch, validateFull, isValidSlug, CONFIG_SCHEMA,
} from './schema.js';

const ADMIN_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Content-Type': 'application/json',
};

function adminJson(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: ADMIN_CORS });
}

/** True if the request carries the correct admin bearer token. */
export function isAdmin(req, env) {
  if (!env.ADMIN_SECRET) return false; // fail closed if not configured
  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token.length > 0 && token === env.ADMIN_SECRET;
}

/** Authoritative read: D1 first, then hardcoded fallback. Skips the KV cache. */
async function loadStoredConfig(slug, env) {
  if (env?.DB) {
    try {
      const row = await env.DB.prepare('SELECT config_json FROM tenants WHERE slug = ?').bind(slug).first();
      if (row) return { config: JSON.parse(row.config_json), source: 'd1' };
    } catch (e) {
      console.warn('[admin] D1 read failed:', e.message);
    }
  }
  if (SLUG_CONFIG[slug]) return { config: SLUG_CONFIG[slug], source: 'fallback' };
  return { config: null, source: null };
}

export async function handleAdminTenantList(req, env) {
  if (!isAdmin(req, env)) return adminJson({ ok: false, error: 'Unauthorised' }, 401);

  const map = new Map();
  // Hardcoded fallbacks first, so D1 rows override them.
  for (const [slug, config] of Object.entries(SLUG_CONFIG)) {
    map.set(slug, { slug, displayName: config.displayName, source: 'fallback', updated_at: null });
  }
  if (env?.DB) {
    try {
      const { results } = await env.DB.prepare(
        'SELECT slug, config_json, updated_at FROM tenants ORDER BY slug',
      ).all();
      for (const row of results || []) {
        let displayName = row.slug;
        try { displayName = JSON.parse(row.config_json).displayName || row.slug; } catch { /* keep slug */ }
        map.set(row.slug, { slug: row.slug, displayName, source: 'd1', updated_at: row.updated_at });
      }
    } catch (e) {
      console.warn('[admin] D1 list failed:', e.message);
    }
  }

  const tenants = [...map.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  return adminJson({ ok: true, tenants, schema: schemaForScope('nick') });
}

export async function handleAdminTenantGet(slug, req, env) {
  if (!isAdmin(req, env)) return adminJson({ ok: false, error: 'Unauthorised' }, 401);
  if (!isValidSlug(slug)) return adminJson({ ok: false, error: 'Invalid slug' }, 400);

  const { config, source } = await loadStoredConfig(slug, env);
  return adminJson({
    ok: true,
    slug,
    exists: config != null,
    source,
    config: config || applyDefaults(),
    schema: schemaForScope('nick'),
  });
}

export async function handleAdminTenantPut(slug, req, env) {
  if (!isAdmin(req, env)) return adminJson({ ok: false, error: 'Unauthorised' }, 401);
  if (!isValidSlug(slug)) {
    return adminJson({ ok: false, error: 'Invalid slug — lowercase letters, numbers and dashes only' }, 400);
  }

  let body;
  try { body = await req.json(); } catch { return adminJson({ ok: false, error: 'Invalid JSON body' }, 400); }
  const incoming = body && typeof body === 'object' && body.config && typeof body.config === 'object'
    ? body.config
    : body;

  // 1. Validate the incoming changes against the (nick-scope) schema.
  const patchResult = validatePatch(incoming, 'nick');
  if (!patchResult.ok) return adminJson({ ok: false, error: patchResult.error }, 400);

  // 2. Merge over the existing config (or defaults for a brand-new tenant).
  const { config: existing } = await loadStoredConfig(slug, env);
  const base = existing || applyDefaults();
  const merged = { ...base, ...patchResult.patch };

  // 3. Validate the complete merged config so we never persist a broken page.
  const fullResult = validateFull(merged);
  if (!fullResult.ok) return adminJson({ ok: false, error: fullResult.error }, 400);

  const configJson = JSON.stringify(fullResult.config);

  // 4. Write to D1 (source of truth) …
  try {
    await env.DB.prepare(
      `INSERT INTO tenants (slug, config_json, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(slug) DO UPDATE SET config_json = excluded.config_json, updated_at = datetime('now')`,
    ).bind(slug, configJson).run();
  } catch (e) {
    console.error('[admin] D1 write failed:', e.message);
    return adminJson({ ok: false, error: 'Could not save config' }, 502);
  }

  // 5. … then bust the KV cache so the change is live immediately.
  if (env.TOKEN_CACHE) {
    await env.TOKEN_CACHE.delete(`tenant:${slug}`).catch((e) => console.warn('[admin] KV bust failed:', e.message));
  }

  return adminJson({ ok: true, slug, config: fullResult.config, created: !existing });
}

export function handleAdminOptions() {
  return new Response(null, { status: 204, headers: ADMIN_CORS });
}

export { CONFIG_SCHEMA };
