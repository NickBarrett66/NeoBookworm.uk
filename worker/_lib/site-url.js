// Site URL helpers — Worker ES module version.
// Pure logic: no env dependency. Direct ESM conversion of api/_lib/site-url.js.

export function resolveSiteUrl(primary, domainFallback) {
  let raw = primary != null ? String(primary).trim() : '';
  if (!raw && domainFallback != null) {
    raw = String(domainFallback).trim();
  }
  if (!raw) return '';

  if (/^https?:\/\//i.test(raw)) return raw;

  if (raw.startsWith('//')) return `https:${raw}`;

  if (raw.startsWith('/')) {
    return `https://neobookworm.uk${raw}`;
  }

  return `https://${raw.replace(/^\/+/, '')}`;
}

export function resolveLiveSiteUrl(liveUrl, domain) {
  const liveRaw   = liveUrl != null ? String(liveUrl).trim() : '';
  const domainRaw = domain  != null ? String(domain).trim()  : '';

  if (liveRaw && domainRaw && /neobookworm\.uk/i.test(liveRaw)) {
    return resolveSiteUrl(null, domainRaw);
  }

  return resolveSiteUrl(liveUrl, domain);
}

export function normalizeStoredUrl(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return resolveSiteUrl(trimmed) || null;
}
