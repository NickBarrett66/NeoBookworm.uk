// Netlify/Vercel serverless function — receives intake form POST,
// uploads images to Cloudflare R2, and creates a row in the Notion
// "Client Sites" database.
//
// Required environment variables:
//   NOTION_API_KEY
//   NOTION_MAX_ATTEMPTS   optional, 1–10 (default 4) — retries on 429/503/etc.
//   R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY  (dashboard: Storage & databases → R2 →
//                        Overview → Manage (API Tokens) → Create Account or User API token —
//                        see https://developers.cloudflare.com/r2/get-started/s3/ )
//   R2_BUCKET_NAME
//   R2_PUBLIC_URL        (public bucket URL base, no trailing slash)
// Plus either:
//   R2_ENDPOINT          S3 API host only: https://<account_id>.r2.cloudflarestorage.com
//                        (NOT your public https://pub-….r2.dev URL — that causes HTTP 401)
// or:
//   R2_ACCOUNT_ID        when R2_ENDPOINT is omitted we build the default endpoint
//
// Optional:
//   R2_REGION            Cloudflare routing hint: auto (default), wnam, enam, weur, eeur, apac
//   R2_FORCE_PATH_STYLE  set to "1" if uploads still fail (virtual-host vs path-style)
//
// EU jurisdictional buckets need: R2_JURISDICTION=eu and endpoint
//   https://<account_id>.eu.r2.cloudflarestorage.com  (or set R2_ENDPOINT to that host).
//
// @aws-sdk/client-s3 ≥3.729 defaults to checksum headers R2 does not support — we set
// requestChecksumCalculation / responseChecksumValidation to WHEN_REQUIRED (see getS3()).

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const Busboy = require('busboy');

const DATABASE_ID    = '4b45078a341941bcb5877e52f3d27c6c';
const NOTION_VERSION = '2022-06-28';
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const ALLOWED_TYPES  = ['image/jpeg', 'image/png', 'image/webp', 'image/gif',
                        'image/heic', 'image/heif',
                        'image/svg+xml', 'application/pdf'];

const TRADE_MAP = {
  'Plumber':                         'Plumber',
  'Electrician':                     'Electrician',
  'Painter and Decorator':           'Painter / Decorator',
  'Painter / Decorator':             'Painter / Decorator',
  'Roofer':                          'Roofer',
  'Plasterer':                       'Plasterer',
  'Kitchen Fitter':                  'Kitchen Fitter',
  'Bathroom Fitter':                 'Bathroom Fitter',
  'Landscaper / Gardener':           'Landscaper',
  'Landscaper':                      'Landscaper',
  'Carpenter / Joiner':              'Carpenter / Joiner',
  'Builder / General Contractor':    'Builder',
  'Builder':                         'Builder',
  'Heating Engineer / Gas Safe':     'Heating Engineer',
  'Tiler':                           'Tiler',
  'Flooring Specialist':             'Flooring Specialist',
  'Handyman':                        'Handyman',
  'Other':                           'Other',
};

// ─── R2 client (lazy singleton) ───────────────────────────────────────────────

function getR2Endpoint() {
  const explicit = (process.env.R2_ENDPOINT || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
  if (!accountId) return '';
  const j = (process.env.R2_JURISDICTION || 'default').toLowerCase();
  if (j === 'eu') {
    return `https://${accountId}.eu.r2.cloudflarestorage.com`;
  }
  if (j === 'fedramp') {
    return `https://${accountId}.fedramp.r2.cloudflarestorage.com`;
  }
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function warnIfR2EndpointWrong(endpoint) {
  const e = (endpoint || '').toLowerCase();
  if (!e) return;
  if (e.includes('.r2.dev')) {
    console.warn(
      '[intake] R2: R2_ENDPOINT must be the S3 API host (….r2.cloudflarestorage.com), not the public r2.dev URL. Fix env vars or uploads will return 401.',
    );
  } else if (!e.includes('r2.cloudflarestorage.com')) {
    console.warn(
      '[intake] R2: R2_ENDPOINT should be https://<ACCOUNT_ID>.r2.cloudflarestorage.com (see Cloudflare R2 S3 API).',
    );
  }
}

let _s3;
function getS3() {
  if (!_s3) {
    const endpoint = getR2Endpoint();
    if (!endpoint) {
      throw new Error('R2 endpoint missing: set R2_ENDPOINT or R2_ACCOUNT_ID');
    }
    warnIfR2EndpointWrong(endpoint);

    const region = (process.env.R2_REGION || 'auto').trim();
    const forcePathStyle = process.env.R2_FORCE_PATH_STYLE === '1';

    _s3 = new S3Client({
      // Must be a Cloudflare R2 region (auto, wnam, weur, …), not an AWS region, or SigV4 can 401.
      region,
      endpoint,
      forcePathStyle,
      // Default in @aws-sdk/client-s3 ≥3.729 sends x-amz-checksum-* on PutObject; R2 returns
      // errors that often surface as "Unauthorized". Cloudflare recommends WHEN_REQUIRED.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId:     (process.env.R2_ACCESS_KEY_ID || '').trim(),
        secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || '').trim(),
      },
    });

    try {
      console.log(
        '[intake] R2 S3 client:',
        new URL(endpoint).hostname,
        '| region',
        region,
        '| pathStyle',
        forcePathStyle,
      );
    } catch {
      console.log('[intake] R2 S3 client init | region', region, '| pathStyle', forcePathStyle);
    }
  }
  return _s3;
}

function logR2UploadFailure(label, uploadErr) {
  const meta = uploadErr.$metadata || {};
  console.warn(
    `[intake] ${label} upload skipped:`,
    uploadErr.message,
    uploadErr.name || '',
    meta.httpStatusCode != null ? `HTTP ${meta.httpStatusCode}` : '',
    meta.requestId ? `req ${meta.requestId}` : '',
  );
  const msg = `${uploadErr.message || ''} ${uploadErr.name || ''}`;
  if (/Unauthorized|InvalidAccessKey|SignatureDoesNotMatch|403|401|NotImplemented|501/i.test(msg)) {
    console.warn(
      '[intake] R2 troubleshooting: (1) R2_ENDPOINT must be https://<ACCOUNT_ID>.r2.cloudflarestorage.com — never the public pub-….r2.dev URL. (2) Credentials from Storage & databases → R2 → Overview → Manage (API Tokens); permission Object Read & Write scoped to this bucket (not the global Cloudflare API token). (3) Try R2_REGION=weur or eeur in EU. (4) Try R2_FORCE_PATH_STYLE=1. Trim secrets in Vercel.',
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sanitise a filename so it's safe for R2 keys */
function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

/** Infer image MIME from magic bytes (mobile uploads often send octet-stream or wrong type). */
function sniffImageMime(buf) {
  if (!buf || buf.length < 3) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  if (buf.length >= 12 && buf.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii');
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
      return 'image/heic';
    }
  }
  return null;
}

/** PDF / SVG / images — for unnamed uploads and type correction. */
function sniffMime(buf) {
  const img = sniffImageMime(buf);
  if (img) return img;
  if (buf && buf.length >= 5 && buf.slice(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  if (buf && buf.length >= 3) {
    const head = buf.toString('utf8', 0, Math.min(buf.length, 256)).trimStart();
    if (head.startsWith('<svg') || head.startsWith('<?xml')) return 'image/svg+xml';
  }
  return null;
}

function extForMime(mime) {
  const m = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
  };
  return m[mime] || 'bin';
}

/**
 * Upload a single file (Buffer) to R2.
 * Returns the public URL string, or null if no file supplied.
 */
async function uploadToR2(fileBuffer, originalName, mimeType, folder) {
  if (!fileBuffer || fileBuffer.length === 0) return null;

  const r2Missing = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'].filter(
    (k) => !process.env[k] || !String(process.env[k]).trim(),
  );
  if (r2Missing.length) {
    throw new Error(`R2 configuration missing on server: ${r2Missing.join(', ')}`);
  }
  if (!getR2Endpoint()) {
    throw new Error('R2 endpoint missing: set R2_ENDPOINT or R2_ACCOUNT_ID');
  }

  if (fileBuffer.length > MAX_FILE_BYTES) {
    throw new Error(`File "${originalName}" exceeds 10 MB limit`);
  }

  let ct = (mimeType || '').toLowerCase().split(';')[0].trim() || 'application/octet-stream';
  if (!ALLOWED_TYPES.includes(ct)) {
    const sniffed = sniffMime(fileBuffer);
    if (sniffed && ALLOWED_TYPES.includes(sniffed)) ct = sniffed;
  }
  if (!ALLOWED_TYPES.includes(ct)) {
    throw new Error(`File type "${mimeType}" is not allowed`);
  }

  const timestamp = Date.now();
  const safe      = safeFilename(originalName);
  const key       = `${folder}/${timestamp}-${safe}`;

  await getS3().send(new PutObjectCommand({
    Bucket:      (process.env.R2_BUCKET_NAME || '').trim(),
    Key:         key,
    Body:        fileBuffer,
    ContentType: ct,
  }));

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

/**
 * Parse multipart/form-data using busboy.
 *
 * Vercel's Node.js runtime may pre-consume req as a stream, so we handle
 * two cases:
 *   1. req.body is already a Buffer (body pre-read by the runtime)
 *   2. req is still a readable stream (we collect it ourselves)
 *
 * Returns { fields: {}, files: { fieldName: { buffer, filename, mimeType }[] } }
 */
async function readRawMultipartBody(req) {
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch {
    return Buffer.alloc(0);
  }
}

async function parseMultipart(req) {
  const contentType = req.headers['content-type'] || '';

  // Read the stream first. On Vercel, accessing req.body before the stream can
  // leave multipart payloads empty or mis-handled; fall back to req.body if needed.
  let rawBody;
  try {
    rawBody = await readRawMultipartBody(req);
  } catch {
    rawBody = Buffer.alloc(0);
  }
  if (!rawBody.length) {
    if (req.body instanceof Buffer) {
      rawBody = req.body;
    } else if (typeof req.body === 'string') {
      rawBody = Buffer.from(req.body, 'binary');
    }
  }

  const fields = {};
  const files  = {};

  await new Promise((resolve, reject) => {
    const bb = Busboy({ headers: { 'content-type': contentType } });
    const filePromises = [];

    bb.on('field', (name, value) => {
      fields[name] = value;
    });

    bb.on('file', (name, stream, info) => {
      let { filename, mimeType } = info;
      const chunks = [];
      const p = new Promise((res, rej) => {
        stream.on('data', (d) => chunks.push(d));
        stream.on('end', () => {
          const buffer = Buffer.concat(chunks);
          if (!buffer.length) {
            res();
            return;
          }
          const guessed = sniffMime(buffer);
          const safeName = (filename && String(filename).trim())
            ? filename
            : `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${
              guessed ? extForMime(guessed) : 'bin'
            }`;
          let mime = (mimeType || '').toLowerCase().split(';')[0].trim();
          if (!mime || mime === 'application/octet-stream') {
            if (guessed) mime = guessed;
            else if (!mime) mime = 'application/octet-stream';
          }
          if (!files[name]) files[name] = [];
          files[name].push({ buffer, filename: safeName, mimeType: mime });
          res();
        });
        stream.on('error', rej);
      });
      filePromises.push(p);
    });

    bb.on('finish', () => {
      Promise.all(filePromises).then(resolve, reject);
    });
    bb.on('error', reject);

    bb.end(rawBody);
  });

  return { fields, files };
}

// ─── Notion helper ────────────────────────────────────────────────────────────

function getNotionMaxAttempts() {
  const n = parseInt(process.env.NOTION_MAX_ATTEMPTS || '', 10);
  if (Number.isFinite(n) && n >= 1 && n <= 10) return n;
  return 4;
}

/**
 * Notion intermittently returns 502/503/504 (e.g. PgPoolWaitConnectionTimeout).
 * Short retries with backoff usually succeed without user intervention.
 */
async function notionFetchWithRetry(url, init, label) {
  const maxAttempts = getNotionMaxAttempts();
  let lastStatus = 0;
  let lastText = '';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (netErr) {
      if (attempt === maxAttempts - 1) throw netErr;
      const waitMs = Math.min(3500, 400 * Math.pow(2, attempt));
      console.warn(
        `[intake] Notion ${label} network error (attempt ${attempt + 1}/${maxAttempts}):`,
        netErr.message,
        `retry in ${waitMs}ms`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (res.ok) return res;

    lastText = await res.text();
    lastStatus = res.status;

    const transient =
      res.status === 429 ||
      res.status === 502 ||
      res.status === 503 ||
      res.status === 504 ||
      (res.status === 500 &&
        /service_unavailable|temporarily unavailable|try again|timeout|PgPool|overloaded/i.test(lastText));

    if (!transient || attempt === maxAttempts - 1) {
      console.error(`[intake] Notion ${label} failed:`, lastStatus, lastText);
      if (lastStatus === 401) {
        console.error(
          '[intake] Notion 401: NOTION_API_KEY is invalid, revoked, or not the integration "Internal Integration Secret" from Notion → Settings → Integrations → your integration. Database must be shared with that integration.',
        );
      }
      const err = new Error(`Notion ${label} failed: ${lastStatus}`);
      err.notionStatus = lastStatus;
      err.notionBody = lastText;
      throw err;
    }

    const ra = res.headers.get('retry-after');
    let waitMs = ra != null ? parseInt(ra, 10) * 1000 : NaN;
    if (!Number.isFinite(waitMs) || waitMs < 0) {
      waitMs = Math.min(5000, 350 * Math.pow(2, attempt)) + Math.floor(Math.random() * 300);
    }
    console.warn(
      `[intake] Notion ${label} HTTP ${lastStatus} (transient), retry ${attempt + 2}/${maxAttempts} in ${waitMs}ms`,
    );
    await new Promise((r) => setTimeout(r, waitMs));
  }

  const err = new Error(`Notion ${label} failed after ${maxAttempts} attempts`);
  err.notionStatus = lastStatus;
  err.notionBody = lastText;
  throw err;
}

function richText(value) {
  const str = (value || '').toString().trim().slice(0, 2000);
  if (!str) return null;
  return { rich_text: [{ text: { content: str } }] };
}

function notionUrl(value) {
  const str = (value || '').toString().trim();
  return str ? { url: str } : null;
}

/** Notion can embed these as image blocks; HEIC/PDF etc. get a link paragraph instead. */
function notionEmbeddableImageUrl(url) {
  const path = (url || '').split('?')[0].toLowerCase();
  return /\.(jpe?g|png|gif|webp|svg)$/.test(path);
}

function paragraphLinkBlock(url, label) {
  const text = label ? `${label}: ${url}` : url;
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: text, link: { url } } }],
    },
  };
}

function externalImageBlock(url) {
  return {
    object: 'block',
    type: 'image',
    image: {
      caption: [],
      type: 'external',
      external: { url },
    },
  };
}

/** Page body: embedded images (Notion must be able to fetch each URL). */
function buildNotionEmbeddedImageChildren(photoUrls, logoUrl) {
  const children = [];
  if (photoUrls.length) {
    children.push({
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [{ type: 'text', text: { content: `Work photos (${photoUrls.length})` } }],
      },
    });
    for (const url of photoUrls) {
      if (notionEmbeddableImageUrl(url)) {
        children.push(externalImageBlock(url));
      } else {
        children.push(paragraphLinkBlock(url, 'Download / open'));
      }
    }
  }
  if (logoUrl) {
    children.push({
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [{ type: 'text', text: { content: 'Logo' } }],
      },
    });
    if (notionEmbeddableImageUrl(logoUrl)) {
      children.push(externalImageBlock(logoUrl));
    } else {
      children.push(paragraphLinkBlock(logoUrl, null));
    }
  }
  return children;
}

/**
 * Same files as clickable links only — Notion accepts these even when it cannot
 * embed the URL as an image (common with some R2 / CDN setups).
 */
function buildNotionLinkOnlyChildren(photoUrls, logoUrl) {
  const children = [];
  if (photoUrls.length) {
    children.push({
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [
          { type: 'text', text: { content: `Work photo links (${photoUrls.length})` } },
        ],
      },
    });
    for (let i = 0; i < photoUrls.length; i++) {
      children.push(paragraphLinkBlock(photoUrls[i], `Photo ${i + 1}`));
    }
  }
  if (logoUrl) {
    children.push({
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [{ type: 'text', text: { content: 'Logo' } }],
      },
    });
    children.push(paragraphLinkBlock(logoUrl, 'Logo file'));
  }
  return children;
}

const APPEND_BLOCKS_BATCH = 90;

async function appendNotionBlockChildren(pageId, blocks, apiKey) {
  for (let i = 0; i < blocks.length; i += APPEND_BLOCKS_BATCH) {
    const chunk = blocks.slice(i, i + APPEND_BLOCKS_BATCH);
    await notionFetchWithRetry(
      `https://api.notion.com/v1/blocks/${pageId}/children`,
      {
        method: 'PATCH',
        headers: {
          Authorization:    `Bearer ${apiKey}`,
          'Content-Type':   'application/json',
          'Notion-Version': NOTION_VERSION,
        },
        body: JSON.stringify({ children: chunk }),
      },
      `appendBlocks[${i}]`,
    );
  }
}

async function createNotionRecord(fields, photoUrls, logoUrl) {
  const apiKey    = process.env.NOTION_API_KEY;
  const tradeName = TRADE_MAP[fields.trade] || 'Other';

  const notes = [fields.services, fields.extra]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join('\n\n---\n\n')
    .slice(0, 2000);

  // Build the full intake snapshot as a rich-text "Brief" field
  const brief = [
    fields.story        && `**About:** ${fields.story}`,
    fields.area         && `**Area:** ${fields.area}`,
    fields.years        && `**Years trading:** ${fields.years}`,
    fields.accreditations && `**Accreditations:** ${fields.accreditations}`,
    fields.freeQuotes   && `**Free quotes:** ${fields.freeQuotes}`,
    fields.emergency    && `**Emergency callouts:** ${fields.emergency}`,
    fields.exclusions   && `**Exclusions:** ${fields.exclusions}`,
    fields.teamSize     && `**Team:** ${fields.teamSize}`,
    fields.idealWork    && `**Ideal work:** ${fields.idealWork}`,
    fields.websiteStyle && `**Website style:** ${fields.websiteStyle}`,
    fields.colourPref   && `**Colours:** ${fields.colourPref}`,
    fields.siteInspo    && `**Inspiration URL:** ${fields.siteInspo}`,
    fields.testimonials && `**Testimonials:** ${fields.testimonials}`,
    fields.googleBiz    && `**Google Business:** ${fields.googleBiz}`,
    fields.trustmarks   && `**Trust marks:** ${fields.trustmarks}`,
    fields.domainStatus && `**Domain status:** ${fields.domainStatus}`,
    fields.domainName   && `**Domain:** ${fields.domainName}`,
    fields.contactMethods && `**Contact methods:** ${fields.contactMethods}`,
    fields.hours        && `**Hours:** ${fields.hours}`,
    photoUrls.length    && `**Work photos:** ${photoUrls.length} file(s) uploaded — open this row as a page to see embedded images (JPEG/PNG/WebP/GIF/SVG).`,
    logoUrl             && `**Logo:** ${logoUrl}`,
  ].filter(Boolean).join('\n\n').slice(0, 2000);

  // Build services text for the dedicated Services field
  const servicesText = (fields.services || '').trim().slice(0, 2000);

  const props = {
    'Business Name':  { title: [{ text: { content: fields.bizName || 'Unknown' } }] },
    'Client Email':   { email: fields.email || null },
    'Phone':          { phone_number: fields.phone || null },
    'Trade Category': { select: { name: tradeName } },
    'Status':         { select: { name: 'Pending Launch' } },
  };

  if (notes)        props['Notes']       = richText(notes);
  if (brief)        props['Brief']       = richText(brief);
  if (servicesText) props['Services']    = richText(servicesText);
  if (logoUrl)      props['Logo URL']    = notionUrl(logoUrl);
  if (photoUrls.length) {
    // Store first photo URL in the dedicated field; rest live in Brief
    props['Work Photos'] = notionUrl(photoUrls[0]);
  }

  // Remove undefined entries
  Object.keys(props).forEach((k) => {
    if (props[k] === undefined || props[k] === null) delete props[k];
  });

  // Page body: second API call after row exists. createPage can succeed while append fails.
  const childrenEmbedded = buildNotionEmbeddedImageChildren(photoUrls, logoUrl);
  const childrenLinks    = buildNotionLinkOnlyChildren(photoUrls, logoUrl);

  const body = {
    parent:     { database_id: DATABASE_ID },
    properties: props,
  };

  const response = await notionFetchWithRetry(
    'https://api.notion.com/v1/pages',
    {
      method: 'POST',
      headers: {
        Authorization:    `Bearer ${apiKey}`,
        'Content-Type':   'application/json',
        'Notion-Version': NOTION_VERSION,
      },
      body: JSON.stringify(body),
    },
    'createPage',
  );

  const page = await response.json();
  console.log('[intake] Notion database row created (page id):', page.id);

  if (!childrenEmbedded.length) {
    return page;
  }

  try {
    await appendNotionBlockChildren(page.id, childrenEmbedded, apiKey);
    console.log(
      '[intake] Notion page body: appended',
      childrenEmbedded.length,
      'blocks (embedded images) for',
      page.id,
    );
    return page;
  } catch (embedErr) {
    console.error(
      '[intake] Notion: row is saved; embedding images in page body failed (Notion may not be able to load the file URL).',
      embedErr.message,
    );
  }

  if (!childrenLinks.length) {
    return page;
  }

  try {
    await appendNotionBlockChildren(page.id, childrenLinks, apiKey);
    console.log(
      '[intake] Notion page body: appended',
      childrenLinks.length,
      'blocks (clickable links only — open page to access files) for',
      page.id,
    );
  } catch (linkErr) {
    console.error(
      '[intake] Notion: link fallback also failed. Row still has text properties; check Work Photos / Logo URL columns for R2 links.',
      linkErr.message,
    );
  }

  return page;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    console.error('NOTION_API_KEY is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const contentType = req.headers['content-type'] || '';
    let fields = {};
    let photoFiles = [];
    let logoFile   = null;

    if (contentType.includes('multipart/form-data')) {
      // ── Multipart: parse fields + files ──────────────────────────────────
      const parsed = await parseMultipart(req);
      fields     = parsed.fields;
      photoFiles = parsed.files['photos'] || parsed.files['f_photos'] || [];
      const logoArr = parsed.files['logo'] || parsed.files['f_logo'] || [];
      logoFile   = logoArr[0] || null;
      console.log('[intake] parsed fields:', Object.keys(fields));
      console.log('[intake] photo files:', photoFiles.length, '| logo:', !!logoFile);

    } else if (contentType.includes('application/json')) {
      // ── JSON-only fallback (backwards-compatible with old form) ───────────
      fields = req.body || {};

    } else {
      return res.status(415).json({ error: 'Unsupported Content-Type' });
    }

    if (!fields.bizName && !fields.email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // ── Upload photos to R2 ───────────────────────────────────────────────
    const safeBiz  = safeFilename((fields.bizName || 'client').toLowerCase());
    const folder   = `clients/${safeBiz}`;
    const photoUrls = [];

    for (const file of photoFiles) {
      try {
        const url = await uploadToR2(file.buffer, file.filename, file.mimeType, `${folder}/photos`);
        if (url) photoUrls.push(url);
      } catch (uploadErr) {
        logR2UploadFailure('Photo', uploadErr);
      }
    }
    console.log('[intake] R2 photo URLs:', photoUrls);

    let logoUrl = null;
    if (logoFile) {
      try {
        logoUrl = await uploadToR2(logoFile.buffer, logoFile.filename, logoFile.mimeType, `${folder}/logo`);
      } catch (uploadErr) {
        logR2UploadFailure('Logo', uploadErr);
      }
    }
    console.log('[intake] R2 logo URL:', logoUrl);

    // ── Create Notion record ──────────────────────────────────────────────
    await createNotionRecord(fields, photoUrls, logoUrl);

    return res.status(200).json({
      success:    true,
      photoCount: photoUrls.length,
      logoUrl:    logoUrl || null,
      message:    'Intake form received successfully',
    });

  } catch (err) {
    console.error('submit-intake error:', err);
    return res.status(500).json({ error: 'Unexpected server error', detail: err.message });
  }
};

// Tell Vercel NOT to pre-parse the body — we need the raw multipart stream
handler.config = { api: { bodyParser: false } };

/** @internal Local verification: `node scripts/verify-intake-multipart.js` */
handler._test = { parseMultipart, sniffMime };

module.exports = handler;
