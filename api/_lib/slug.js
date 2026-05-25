// Slug generation for the `clients` table in neobookworm-enquiries.
//
// Added in Session 1 of docs/neobookworm-onboarding-build-plan-v3.md.
//
// Slug shape:  {slugified-business}-{5-char-token}
//   fallback:  {slugified-name}-{5-char-token}
//      last:   client-{8-char-token}
//
// Lowercase ASCII only. Non-alphanumeric runs collapse to single hyphens.
// Diacritics are stripped (NFD normalise + remove combining marks).
// The slugified prefix is capped at 40 chars so portal URLs stay tidy.
//
// The random alphabet drops `i l o 0 1` so a slug spoken on the phone is
// unambiguous.
//
// generateSlug() queries the live `clients` table to skip collisions. It
// tries up to 15 candidates total (5 business + 5 name + 5 client-X). If
// every one collides we throw — better than silently demoting a real
// prospect to a random `client-…` name. The caller (promoteToClient) treats
// this as a hard error.

const crypto = require('crypto');

const { queryD1, enquiriesDb } = require('./d1');

const TOKEN_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const PREFIX_MAX_LEN = 40;
const RETRIES_PER_PREFIX = 5;

function slugify(input) {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return trimmed.slice(0, PREFIX_MAX_LEN).replace(/-+$/g, '');
}

function randomToken(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

async function isSlugTaken(slug, queryFn, dbId) {
  const rows = await queryFn(
    dbId,
    'SELECT 1 AS one FROM clients WHERE slug = ? LIMIT 1',
    [slug]
  );
  return rows.length > 0;
}

// generateSlug(business, name, queryFn?, dbId?)
//
// `queryFn` and `dbId` default to the shared d1 helpers; callers in tests
// or other databases can inject their own.
async function generateSlug(business, name, queryFn = queryD1, dbId = enquiriesDb()) {
  const businessSlug = slugify(business);
  const nameSlug = slugify(name);

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
    if (!(await isSlugTaken(candidate, queryFn, dbId))) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to generate unique client slug after ${candidates.length} attempts ` +
    `(business="${business || ''}", name="${name || ''}")`
  );
}

module.exports = {
  slugify,
  generateSlug,
  randomToken,
  TOKEN_ALPHABET,
};
