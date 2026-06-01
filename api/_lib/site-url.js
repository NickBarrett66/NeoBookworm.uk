'use strict';

/**
 * Turn a stored site URL or bare domain into an absolute https URL for href attributes.
 * Returns '' when nothing usable is provided.
 */
function resolveSiteUrl(primary, domainFallback) {
  let raw = primary != null ? String(primary).trim() : '';
  if (!raw && domainFallback != null) {
    raw = String(domainFallback).trim();
  }
  if (!raw) return '';

  if (/^https?:\/\//i.test(raw)) return raw;

  if (raw.startsWith('//')) return `https:${raw}`;

  // Path-only value (e.g. /he-tyres/) — resolve against the marketing host.
  if (raw.startsWith('/')) {
    return `https://neobookworm.uk${raw}`;
  }

  return `https://${raw.replace(/^\/+/, '')}`;
}

/**
 * Resolve the production URL shown once a site is live.
 * If live_url still points at a NeoBookworm preview path, prefer the client's domain.
 */
function resolveLiveSiteUrl(liveUrl, domain) {
  const liveRaw = liveUrl != null ? String(liveUrl).trim() : '';
  const domainRaw = domain != null ? String(domain).trim() : '';

  if (liveRaw && domainRaw && /neobookworm\.uk/i.test(liveRaw)) {
    return resolveSiteUrl(null, domainRaw);
  }

  return resolveSiteUrl(liveUrl, domain);
}

/** Normalize a URL field before storing in D1. Returns null for empty input. */
function normalizeStoredUrl(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return resolveSiteUrl(trimmed) || null;
}

module.exports = { resolveSiteUrl, resolveLiveSiteUrl, normalizeStoredUrl };
