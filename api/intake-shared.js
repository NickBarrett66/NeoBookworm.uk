// Shared intake logic: multipart parse, R2 uploads, Notion row creation, and
// direct-to-R2 presigned-URL flow (bypasses Vercel's 4.5 MB function body limit).
//
// Used by api/submit-intake.js, api/intake-upload-session.js, api/intake-finalize.js
//
// Notion columns must match NOTION_PROP. Add missing properties with:
//   node scripts/ensure-notion-intake-properties.js  (requires NOTION_API_KEY)
//
// Required env: NOTION_API_KEY, R2_*, as in submit-intake.
// Direct-upload signing: set INTAKE_UPLOAD_SECRET (recommended). If omitted, NOTION_API_KEY
// is used as the HMAC secret (works but couples concerns).
//
// R2 CORS (browser must PUT to r2.cloudflarestorage.com): allow your site origin,
// methods PUT and HEAD, headers Content-Type, Content-Length.
//
// @aws-sdk/client-s3 ≥3.729: checksum options WHEN_REQUIRED (see getS3()).

const crypto = require('crypto');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
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

// Notion "Client Sites" property names — must match database columns (see scripts/ensure-notion-intake-properties.js).
const NOTION_PROP = {
  businessName:        'Business Name',
  fullName:            'Full name',
  clientEmail:         'Client Email',
  phone:               'Phone',
  tradeCategory:       'Trade Category',
  status:              'Status',
  area:                'Area',
  yearsTrading:        'Years trading',
  services:            'Services',
  accreditations:      'Accreditations',
  freeQuotes:          'Free quotes',
  emergencyCallouts:   'Emergency callouts',
  workExclusions:      'Work exclusions',
  about:               'About',
  teamSize:            'Team size',
  idealWork:           'Ideal work',
  colourPreferences:   'Colour preferences',
  websiteStyle:        'Website style',
  inspirationUrl:      'Inspiration URL',
  testimonials:        'Testimonials',
  googleBusiness:      'Google Business profile',
  trustMarks:          'Trust marks',
  domainStatus:        'Domain status',
  domainName:          'Domain name',
  contactMethods:      'Contact methods',
  workingHours:        'Working hours',
  additionalNotes:     'Additional notes',
  workPhotos:          'Work photos',
  logoUrl:             'Logo URL',
};

const MAX_FILES_PER_PAGE = 40;

function assignNotionRichText(props, propName, value) {
  const rt = richText(value);
  if (rt) props[propName] = rt;
}

function notionSelectYesNo(raw) {
  const v = (raw || '').toString().trim().toLowerCase();
  if (v === 'yes') return { select: { name: 'Yes' } };
  if (v === 'no') return { select: { name: 'No' } };
  return null;
}

function notionSelectTri(raw) {
  const v = (raw || '').toString().trim().toLowerCase();
  if (v === 'yes') return { select: { name: 'Yes' } };
  if (v === 'no') return { select: { name: 'No' } };
  if (v === 'unsure') return { select: { name: 'Unsure' } };
  return null;
}

function notionYearsNumber(raw) {
  const n = parseInt(String(raw || '').trim(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 120) return null;
  return { number: n };
}

/** Build Notion Files property from public R2 URLs. */
function notionWorkPhotosFiles(urls) {
  if (!urls || !urls.length) return null;
  const slice = urls.slice(0, MAX_FILES_PER_PAGE);
  const files = slice.map((url, i) => {
    let name = `work-${i + 1}`;
    try {
      const pathPart = url.split('?')[0].split('/').pop();
      if (pathPart && pathPart.length < 120) {
        name = pathPart.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || name;
      }
    } catch { /* ignore */ }
    return { type: 'external', name, external: { url } };
  });
  return { files };
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

  const props = {
    [NOTION_PROP.businessName]:  { title: [{ text: { content: (fields.bizName || 'Unknown').toString().trim().slice(0, 2000) } }] },
    [NOTION_PROP.tradeCategory]: { select: { name: tradeName } },
    [NOTION_PROP.status]:        { select: { name: 'Pending Launch' } },
  };

  const emailTrim = (fields.email || '').trim();
  if (emailTrim) props[NOTION_PROP.clientEmail] = { email: emailTrim };

  const phoneTrim = (fields.phone || '').trim();
  if (phoneTrim) props[NOTION_PROP.phone] = { phone_number: phoneTrim };

  assignNotionRichText(props, NOTION_PROP.fullName, fields.fullName);
  assignNotionRichText(props, NOTION_PROP.area, fields.area);
  assignNotionRichText(props, NOTION_PROP.services, fields.services);
  assignNotionRichText(props, NOTION_PROP.accreditations, fields.accreditations);
  assignNotionRichText(props, NOTION_PROP.workExclusions, fields.exclusions);
  assignNotionRichText(props, NOTION_PROP.about, fields.story);
  assignNotionRichText(props, NOTION_PROP.teamSize, fields.teamSize);
  assignNotionRichText(props, NOTION_PROP.idealWork, fields.idealWork);
  assignNotionRichText(props, NOTION_PROP.colourPreferences, fields.colourPref);
  assignNotionRichText(props, NOTION_PROP.websiteStyle, fields.websiteStyle);
  assignNotionRichText(props, NOTION_PROP.testimonials, fields.testimonials);
  assignNotionRichText(props, NOTION_PROP.trustMarks, fields.trustmarks);
  assignNotionRichText(props, NOTION_PROP.domainName, fields.domainName);
  assignNotionRichText(props, NOTION_PROP.contactMethods, fields.contactMethods);
  assignNotionRichText(props, NOTION_PROP.workingHours, fields.hours);
  assignNotionRichText(props, NOTION_PROP.additionalNotes, fields.extra);

  const y = notionYearsNumber(fields.years);
  if (y) props[NOTION_PROP.yearsTrading] = y;

  const fq = notionSelectYesNo(fields.freeQuotes);
  if (fq) props[NOTION_PROP.freeQuotes] = fq;

  const em = notionSelectYesNo(fields.emergency);
  if (em) props[NOTION_PROP.emergencyCallouts] = em;

  const gb = notionSelectTri(fields.googleBiz);
  if (gb) props[NOTION_PROP.googleBusiness] = gb;

  const ds = notionSelectTri(fields.domainStatus);
  if (ds) props[NOTION_PROP.domainStatus] = ds;

  const inspo = notionUrl(fields.siteInspo);
  if (inspo) props[NOTION_PROP.inspirationUrl] = inspo;

  if (logoUrl) props[NOTION_PROP.logoUrl] = notionUrl(logoUrl);

  const workFiles = notionWorkPhotosFiles(photoUrls);
  if (workFiles) props[NOTION_PROP.workPhotos] = workFiles;

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
      '[intake] Notion: link fallback also failed. Row still has structured properties; check Work photos (files) / Logo URL for R2 links.',
      linkErr.message,
    );
  }

  return page;
}

// ─── Direct-to-R2 session (presigned PUT) ─────────────────────────────────────

const MAX_PHOTOS_DIRECT     = 20;
const PRESIGN_EXPIRES_SEC   = 60 * 60; // 1 h — keep in sync with session signature TTL
const SESSION_TTL_SEC       = 60 * 60;

function getIntakeSessionSecret() {
  const s = (process.env.INTAKE_UPLOAD_SECRET || process.env.NOTION_API_KEY || '').trim();
  return s;
}

function normalizeMime(m) {
  return (m || '').toString().toLowerCase().split(';')[0].trim();
}

function validateFileMetaForSession(name, mimeType) {
  const mime = normalizeMime(mimeType);
  if (!name || !String(name).trim()) {
    throw new Error('Each file must have a name');
  }
  if (!ALLOWED_TYPES.includes(mime)) {
    throw new Error(`File type not allowed: ${mime || '(empty)'}`);
  }
  return mime;
}

function publicUrlForKey(key) {
  const base = (process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  return `${base}/${key}`;
}

function photoKeySegment(index, name, mime) {
  const base = safeFilename(String(name)) || 'photo';
  const ext  = extForMime(mime);
  const withExt = /\.[a-z0-9]{1,8}$/i.test(base) ? base : `${base}.${ext}`;
  return `${index}-${withExt}`;
}

function logoKeySegment(name, mime) {
  const base = safeFilename(String(name)) || 'logo';
  const ext  = extForMime(mime);
  const withExt = /\.[a-z0-9]{1,8}$/i.test(base) ? base : `${base}.${ext}`;
  return `0-${withExt}`;
}

function signIntakeSession({ uploadId, expiresAt, photoCount, keys }) {
  const secret = getIntakeSessionSecret();
  const msg    = `v1|${uploadId}|${expiresAt}|${photoCount}|${keys.join('\n')}`;
  return crypto.createHmac('sha256', secret).update(msg, 'utf8').digest('hex');
}

function verifyIntakeSessionSig(session) {
  const { uploadId, expiresAt, photoCount, keys, signature } = session;
  const expected = signIntakeSession({ uploadId, expiresAt, photoCount, keys });
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from((signature || '').trim(), 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function assertR2ConfigPresent() {
  const r2Missing = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'].filter(
    (k) => !process.env[k] || !String(process.env[k]).trim(),
  );
  if (r2Missing.length) {
    throw new Error(`R2 configuration missing on server: ${r2Missing.join(', ')}`);
  }
  if (!getR2Endpoint()) {
    throw new Error('R2 endpoint missing: set R2_ENDPOINT or R2_ACCOUNT_ID');
  }
}

async function presignPutForIntake(key, contentType) {
  const cmd = new PutObjectCommand({
    Bucket:      (process.env.R2_BUCKET_NAME || '').trim(),
    Key:         key,
    ContentType: contentType,
  });
  return getSignedUrl(getS3(), cmd, { expiresIn: PRESIGN_EXPIRES_SEC });
}

function submittedMarkerKey(uploadId) {
  return `intake/${uploadId}/_submitted.json`;
}

async function headObjectMeta(key) {
  const out = await getS3().send(new HeadObjectCommand({
    Bucket: (process.env.R2_BUCKET_NAME || '').trim(),
    Key:    key,
  }));
  return {
    contentLength: out.ContentLength != null ? Number(out.ContentLength) : 0,
    contentType:   (out.ContentType || '').split(';')[0].trim().toLowerCase(),
  };
}

function isR2NotFound(err) {
  const code = err && (err.name || err.Code || err.code);
  const status = err && err.$metadata && err.$metadata.httpStatusCode;
  return code === 'NotFound' || status === 404;
}

/**
 * Build presigned PUT URLs for each file. Returns session blob the client must send back on finalize.
 */
async function buildIntakeDirectUploadSession(input) {
  assertR2ConfigPresent();
  const secret = getIntakeSessionSecret();
  if (!secret) {
    throw new Error('INTAKE_UPLOAD_SECRET or NOTION_API_KEY is required for upload sessions');
  }

  const photos = Array.isArray(input.photos) ? input.photos : [];
  const logo   = input.logo && typeof input.logo === 'object' ? input.logo : null;

  if (photos.length > MAX_PHOTOS_DIRECT) {
    throw new Error(`Too many photos (max ${MAX_PHOTOS_DIRECT})`);
  }

  const normalizedPhotos = [];
  for (const p of photos) {
    const mime = validateFileMetaForSession(p.name, p.mimeType);
    normalizedPhotos.push({ name: p.name, mimeType: mime });
  }
  let normalizedLogo = null;
  if (logo) {
    const mime = validateFileMetaForSession(logo.name, logo.mimeType);
    normalizedLogo = { name: logo.name, mimeType: mime };
  }

  const uploadId  = crypto.randomBytes(16).toString('hex');
  const prefix    = `intake/${uploadId}`;
  const keys      = [];
  const uploads   = [];
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;

  for (let i = 0; i < normalizedPhotos.length; i++) {
    const p   = normalizedPhotos[i];
    const key = `${prefix}/photos/${photoKeySegment(i, p.name, p.mimeType)}`;
    keys.push(key);
    const putUrl = await presignPutForIntake(key, p.mimeType);
    uploads.push({
      key,
      putUrl,
      contentType: p.mimeType,
      publicUrl:   publicUrlForKey(key),
    });
  }

  let logoUpload = null;
  if (normalizedLogo) {
    const key = `${prefix}/logo/${logoKeySegment(normalizedLogo.name, normalizedLogo.mimeType)}`;
    keys.push(key);
    const putUrl = await presignPutForIntake(key, normalizedLogo.mimeType);
    logoUpload = {
      key,
      putUrl,
      contentType: normalizedLogo.mimeType,
      publicUrl:   publicUrlForKey(key),
    };
  }

  const photoCount = normalizedPhotos.length;
  const signature  = signIntakeSession({ uploadId, expiresAt, photoCount, keys });

  const session = {
    uploadId,
    expiresAt,
    photoCount,
    keys,
    signature,
  };

  console.log('[intake] direct session:', uploadId, '| photos:', photoCount, '| logo:', !!logoUpload);

  return { session, uploads, logo: logoUpload };
}

function keysMatchLayout(keys, photoCount) {
  if (keys.length !== photoCount && keys.length !== photoCount + 1) return false;
  for (let i = 0; i < photoCount; i++) {
    if (!keys[i] || !keys[i].includes('/photos/')) return false;
  }
  if (keys.length > photoCount) {
    if (!keys[photoCount] || !keys[photoCount].includes('/logo/')) return false;
  }
  return true;
}

function urlsFromSessionKeys(keys, photoCount) {
  const photoUrls = keys.slice(0, photoCount).map(publicUrlForKey);
  const logoUrl   = keys.length > photoCount ? publicUrlForKey(keys[photoCount]) : null;
  return { photoUrls, logoUrl };
}

function extractFinalizeFields(body) {
  const o = body && typeof body === 'object' ? body : {};
  return {
    fullName:        o.fullName,
    bizName:         o.bizName,
    trade:           o.trade,
    phone:           o.phone,
    email:           o.email,
    area:            o.area,
    years:           o.years,
    services:        o.services,
    accreditations:  o.accreditations,
    freeQuotes:      o.freeQuotes,
    emergency:       o.emergency,
    exclusions:      o.exclusions,
    story:           o.story,
    teamSize:        o.teamSize,
    idealWork:       o.idealWork,
    colourPref:      o.colourPref,
    websiteStyle:    o.websiteStyle,
    siteInspo:       o.siteInspo,
    testimonials:    o.testimonials,
    googleBiz:       o.googleBiz,
    trustmarks:      o.trustmarks,
    domainStatus:    o.domainStatus,
    domainName:      o.domainName,
    contactMethods:  o.contactMethods,
    hours:           o.hours,
    extra:           o.extra,
  };
}

// ─── Email notification (same SMTP env as contact.js / landing-enquiry.js) ───

/** Public Notion page URL from API page id (UUID with or without dashes). */
function notionPageUrl(pageId) {
  const id = (pageId || '').toString().replace(/-/g, '').trim();
  return id ? `https://www.notion.so/${id}` : null;
}

async function sendIntakeNotificationEmail(fields, photoUrls, logoUrl, notionPageId) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const toEmail  = process.env.TO_EMAIL || 'neobookworm@icloud.com';

  const notionUrl = notionPageUrl(notionPageId);

  const lines = [
    'New intake form submission — NeoBookworm',
    '========================================',
    ...(notionUrl ? [`Notion record: ${notionUrl}`, ''] : []),
    `Name:     ${fields.fullName || ''}`,
    `Business: ${fields.bizName  || ''}`,
    `Trade:    ${fields.trade    || ''}`,
    `Email:    ${fields.email    || ''}`,
    `Phone:    ${fields.phone    || ''}`,
    `Area:     ${fields.area     || ''}`,
    '',
    'Services:',
    fields.services || '(not provided)',
    '',
    'About:',
    (fields.story || '(not provided)').toString().slice(0, 1500),
    '',
    `Photos uploaded: ${(photoUrls && photoUrls.length) || 0}`,
    logoUrl ? `Logo: ${logoUrl}` : 'Logo: (none)',
    '',
    '----------------------------------------',
    'Submitted via neobookworm.uk/intake-form.html',
  ];
  if (photoUrls && photoUrls.length) {
    lines.push('', 'Photo URLs:');
    for (let i = 0; i < photoUrls.length; i++) {
      lines.push(`  ${i + 1}. ${photoUrls[i]}`);
    }
  }

  const emailBody = lines.join('\n');

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('[intake] SMTP not configured — would have sent:\n' + emailBody);
    return;
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host:   smtpHost,
    port:   smtpPort,
    secure: smtpPort === 465,
    auth:   { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from:    `"NeoBookworm Intake" <${smtpUser}>`,
    to:      toEmail,
    replyTo: (fields.email || '').trim() || undefined,
    subject: `New intake — ${fields.bizName || fields.fullName || 'client'}`,
    text:    emailBody,
  });

  console.log('[intake] notification email sent to', toEmail);
}

async function putSubmittedMarker(uploadId, notionPageId) {
  const key  = submittedMarkerKey(uploadId);
  const body = JSON.stringify({ at: Date.now(), notionPageId: notionPageId || null });
  await getS3().send(new PutObjectCommand({
    Bucket:      (process.env.R2_BUCKET_NAME || '').trim(),
    Key:         key,
    Body:        Buffer.from(body, 'utf8'),
    ContentType: 'application/json',
  }));
}

/**
 * Verify uploads, create Notion row, write idempotency marker. Returns { duplicate?, page?, photoUrls, logoUrl }.
 */
async function finalizeIntakeDirectUpload(body) {
  assertR2ConfigPresent();
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    throw new Error('NOTION_API_KEY is not set');
  }

  const session = body && body.session;
  if (!session || typeof session !== 'object') {
    throw new Error('Missing session');
  }
  const { uploadId, expiresAt, photoCount, keys, signature } = session;
  if (!uploadId || !expiresAt || typeof photoCount !== 'number' || !Array.isArray(keys) || !signature) {
    throw new Error('Invalid session payload');
  }
  if (Math.floor(Date.now() / 1000) > expiresAt) {
    throw new Error('Session expired — please refresh the page and submit again');
  }
  if (!verifyIntakeSessionSig(session)) {
    throw new Error('Invalid session signature');
  }
  if (photoCount < 0 || photoCount > MAX_PHOTOS_DIRECT) {
    throw new Error('Invalid photo count');
  }
  if (!keysMatchLayout(keys, photoCount)) {
    throw new Error('Session keys do not match photo/logo layout');
  }

  const lockKey = submittedMarkerKey(uploadId);
  try {
    await getS3().send(new HeadObjectCommand({
      Bucket: (process.env.R2_BUCKET_NAME || '').trim(),
      Key:    lockKey,
    }));
    console.log('[intake] finalize duplicate for', uploadId);
    const { photoUrls, logoUrl } = urlsFromSessionKeys(keys, photoCount);
    return { duplicate: true, photoUrls, logoUrl };
  } catch (e) {
    if (!isR2NotFound(e)) throw e;
  }

  for (const key of keys) {
    let meta;
    try {
      meta = await headObjectMeta(key);
    } catch (e) {
      if (isR2NotFound(e)) {
        throw new Error('One or more files did not finish uploading. Please try again.');
      }
      throw e;
    }
    if (!meta.contentLength || meta.contentLength <= 0) {
      throw new Error('Empty upload — please re-select your files and try again.');
    }
    if (meta.contentLength > MAX_FILE_BYTES) {
      throw new Error('Uploaded file exceeds 10 MB limit');
    }
  }

  const fields = extractFinalizeFields(body);
  if (!fields.bizName && !fields.email) {
    throw new Error('Missing required fields');
  }

  const { photoUrls, logoUrl } = urlsFromSessionKeys(keys, photoCount);
  console.log('[intake] finalize Notion for', uploadId, '| photos:', photoUrls.length, '| logo:', !!logoUrl);

  const page = await createNotionRecord(fields, photoUrls, logoUrl);

  try {
    await sendIntakeNotificationEmail(fields, photoUrls, logoUrl, page && page.id);
  } catch (mailErr) {
    console.error('[intake] Email error (Notion row saved):', mailErr.message);
  }

  try {
    await putSubmittedMarker(uploadId, page && page.id);
  } catch (markErr) {
    console.error('[intake] could not write submitted marker (Notion row exists):', markErr.message);
  }

  return { duplicate: false, page, photoUrls, logoUrl };
}

module.exports = {
  DATABASE_ID,
  NOTION_PROP,
  TRADE_MAP,
  MAX_FILE_BYTES,
  MAX_PHOTOS_DIRECT,
  ALLOWED_TYPES,
  getS3,
  getR2Endpoint,
  safeFilename,
  extForMime,
  sniffMime,
  parseMultipart,
  readRawMultipartBody,
  uploadToR2,
  logR2UploadFailure,
  createNotionRecord,
  buildIntakeDirectUploadSession,
  finalizeIntakeDirectUpload,
  sendIntakeNotificationEmail,
};
