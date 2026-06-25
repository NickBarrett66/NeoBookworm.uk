// Slug generation — Worker ES module version.
// Uses node:crypto (requires nodejs_compat flag in wrangler.toml).

import { randomBytes } from 'node:crypto';
import { queryD1, enquiriesDb } from './d1.js';

const TOKEN_ALPHABET  = 'abcdefghjkmnpqrstuvwxyz23456789';
const PREFIX_MAX_LEN  = 40;
const RETRIES_PER_PREFIX = 5;

export function slugify(input) {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return trimmed.slice(0, PREFIX_MAX_LEN).replace(/-+$/g, '');
}

export function randomToken(length) {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

async function isSlugTaken(env, slug) {
  const rows = await queryD1(
    env,
    enquiriesDb(env),
    'SELECT 1 AS one FROM clients WHERE slug = ? LIMIT 1',
    [slug]
  );
  return rows.length > 0;
}

export async function generateSlug(env, business, name) {
  const businessSlug = slugify(business);
  const nameSlug     = slugify(name);

  const candidates = [];
  if (businessSlug) {
    for (let i = 0; i < RETRIES_PER_PREFIX; i++) {
      candidates.push(`${businessSlug}-${randomToken(5)}`);
    }
  }
  if (nameSlug && nameSlug !== businessSlug) {
    for (let i = 0; i < RETRIES_PER_PREFIX; i++) {
      candidates.push(`${nameSlug}-${randomToken(5)}`);
    }
  }
  for (let i = 0; i < RETRIES_PER_PREFIX; i++) {
    candidates.push(`client-${randomToken(8)}`);
  }

  for (const candidate of candidates) {
    if (!(await isSlugTaken(env, candidate))) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to generate unique client slug after ${candidates.length} attempts ` +
    `(business="${business || ''}", name="${name || ''}")`
  );
}

export { TOKEN_ALPHABET };
