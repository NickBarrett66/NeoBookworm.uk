// Shared intake logic — Worker ES module version.
// Changes from api/_lib/intake-shared.js:
//   - All process.env.X replaced with env.X (env passed as first arg to every function)
//   - parseMultipart / readRawMultipartBody OMITTED — Busboy is Node.js stream-based and
//     not compatible with the Workers runtime. The intake route handler parses bodies with
//     request.json() / request.formData() directly.
//   - sendIntakeNotificationEmail uses the SMTP bridge (sendRendered) instead of nodemailer
//   - Notion calls are skipped gracefully when env.NOTION_API_KEY is not set (Notion retired)
//   - Buffer imported from node:buffer; crypto from node:crypto (nodejs_compat required)

import { Buffer }     from 'node:buffer';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { sendRendered } from './email.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DATABASE_ID    = '4b45078a341941bcb5877e52f3d27c6c';
export const NOTION_VERSION = '2022-06-28';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_DIRECT = 20;
export const ALLOWED_TYPES  = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif', 'image/svg+xml', 'application/pdf',
];

export const TRADE_MAP = {
  'Plumber':                      'Plumber',
  'Electrician':                  'Electrician',
  'Painter and Decorator':        'Painter / Decorator',
  'Painter / Decorator':          'Painter / Decorator',
  'Roofer':                       'Roofer',
  'Plasterer':                    'Plasterer',
  'Kitchen Fitter':               'Kitchen Fitter',
  'Bathroom Fitter':              'Bathroom Fitter',
  'Landscaper / Gardener':        'Landscaper',
  'Landscaper':                   'Landscaper',
  'Carpenter / Joiner':           'Carpenter / Joiner',
  'Builder / General Contractor': 'Builder',
  'Builder':                      'Builder',
  'Heating Engineer / Gas Safe':  'Heating Engineer',
  'Tiler':                        'Tiler',
  'Flooring Specialist':          'Flooring Specialist',
  'Handyman':                     'Handyman',
  'Other':                        'Other',
};

export const NOTION_PROP = {
  businessName:       'Business Name',
  fullName:           'Full name',
  clientEmail:        'Client Email',
  phone:              'Phone',
  tradeCategory:      'Trade Category',
  status:             'Status',
  area:               'Area',
  yearsTrading:       'Years trading',
  services:           'Services',
  accreditations:     'Accreditations',
  freeQuotes:         'Free quotes',
  emergencyCallouts:  'Emergency callouts',
  workExclusions:     'Work exclusions',
  about:              'About',
  teamSize:           'Team size',
  idealWork:          'Ideal work',
  colourPreferences:  'Colour preferences',
  websiteStyle:       'Website style',
  inspirationUrl:     'Inspiration URL',
  testimonials:       'Testimonials',
  googleBusiness:     'Google Business profile',
  trustMarks:         'Trust marks',
  domainStatus:       'Domain status',
  domainName:         'Domain name',
  contactMethods:     'Contact methods',
  workingHours:       'Working hours',
  additionalNotes:    'Additional notes',
  workPhotos:         'Work photos',
  logoUrl:            'Logo URL',
};

// ---------------------------------------------------------------------------
// R2 client (lazy singleton, keyed on first env seen)
// ---------------------------------------------------------------------------

let _s3 = null;

function getR2Endpoint(env) {
  const explicit = (env.R2_ENDPOINT || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;
  const accountId = (env.R2_ACCOUNT_ID || '').trim();
  if (!accountId) return '';
  const j = (env.R2_JURISDICTION || 'default').toLowerCase();
  if (j === 'eu')      return `https://${accountId}.eu.r2.cloudflarestorage.com`;
  if (j === 'fedramp') return `https://${accountId}.fedramp.r2.cloudflarestorage.com`;
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function warnIfR2EndpointWrong(endpoint) {
  const e = (endpoint || '').toLowerCase();
  if (!e) return;
  if (e.includes('.r2.dev')) {
    console.warn('[intake] R2: R2_ENDPOINT must be the S3 API host (….r2.cloudflarestorage.com), not the public r2.dev URL.');
  } else if (!e.includes('r2.cloudflarestorage.com')) {
    console.warn('[intake] R2: R2_ENDPOINT should be https://<ACCOUNT_ID>.r2.cloudflarestorage.com');
  }
}

export function getS3(env) {
  if (!_s3) {
    const endpoint = getR2Endpoint(env);
    if (!endpoint) throw new Error('R2 endpoint missing: set R2_ENDPOINT or R2_ACCOUNT_ID');
    warnIfR2EndpointWrong(endpoint);

    const region        = (env.R2_REGION || 'auto').trim();
    const forcePathStyle = env.R2_FORCE_PATH_STYLE === '1';

    _s3 = new S3Client({
      region,
      endpoint,
      forcePathStyle,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId:     (env.R2_ACCESS_KEY_ID     || '').trim(),
        secretAccessKey: (env.R2_SECRET_ACCESS_KEY || '').trim(),
      },
    });
  }
  return _s3;
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

export function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

function sniffImageMime(buf) {
  if (!buf || buf.length < 3) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.length >= 12 && buf.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii');
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
  }
  return null;
}

export function sniffMime(buf) {
  const img = sniffImageMime(buf);
  if (img) return img;
  if (buf && buf.length >= 5 && buf.slice(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buf && buf.length >= 3) {
    const head = buf.toString('utf8', 0, Math.min(buf.length, 256)).trimStart();
    if (head.startsWith('<svg') || head.startsWith('<?xml')) return 'image/svg+xml';
  }
  return null;
}

export function extForMime(mime) {
  const m = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
    'image/svg+xml': 'svg', 'application/pdf': 'pdf',
  };
  return m[mime] || 'bin';
}

export async function uploadToR2(env, fileBuffer, originalName, mimeType, folder) {
  if (!fileBuffer || fileBuffer.length === 0) return null;

  const r2Missing = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'].filter(
    k => !env[k] || !String(env[k]).trim()
  );
  if (r2Missing.length) throw new Error(`R2 configuration missing: ${r2Missing.join(', ')}`);
  if (!getR2Endpoint(env)) throw new Error('R2 endpoint missing: set R2_ENDPOINT or R2_ACCOUNT_ID');

  if (fileBuffer.length > MAX_FILE_BYTES) throw new Error(`File "${originalName}" exceeds 10 MB limit`);

  let ct = (mimeType || '').toLowerCase().split(';')[0].trim() || 'application/octet-stream';
  if (!ALLOWED_TYPES.includes(ct)) {
    const sniffed = sniffMime(fileBuffer);
    if (sniffed && ALLOWED_TYPES.includes(sniffed)) ct = sniffed;
  }
  if (!ALLOWED_TYPES.includes(ct)) throw new Error(`File type "${mimeType}" is not allowed`);

  const timestamp = Date.now();
  const safe      = safeFilename(originalName);
  const key       = `${folder}/${timestamp}-${safe}`;

  await getS3(env).send(new PutObjectCommand({
    Bucket:      (env.R2_BUCKET_NAME || '').trim(),
    Key:         key,
    Body:        fileBuffer,
    ContentType: ct,
  }));

  return `${env.R2_PUBLIC_URL}/${key}`;
}

export function logR2UploadFailure(label, uploadErr) {
  const meta = uploadErr.$metadata || {};
  console.warn(
    `[intake] ${label} upload skipped:`, uploadErr.message, uploadErr.name || '',
    meta.httpStatusCode != null ? `HTTP ${meta.httpStatusCode}` : '',
    meta.requestId ? `req ${meta.requestId}` : '',
  );
}

// ---------------------------------------------------------------------------
// Direct upload session (presigned PUT)
// ---------------------------------------------------------------------------

const PRESIGN_EXPIRES_SEC = 60 * 60;
const SESSION_TTL_SEC     = 60 * 60;

function getIntakeSessionSecret(env) {
  return (env.INTAKE_UPLOAD_SECRET || '').trim();
}

function normalizeMime(m) {
  return (m || '').toString().toLowerCase().split(';')[0].trim();
}

function inferMimeFromFilename(name) {
  const n = (name || '').toLowerCase();
  if (/\.jpe?g$/i.test(n)) return 'image/jpeg';
  if (/\.png$/i.test(n))   return 'image/png';
  if (/\.webp$/i.test(n))  return 'image/webp';
  if (/\.gif$/i.test(n))   return 'image/gif';
  if (/\.heic$/i.test(n))  return 'image/heic';
  if (/\.heif$/i.test(n))  return 'image/heif';
  if (/\.svg$/i.test(n))   return 'image/svg+xml';
  if (/\.pdf$/i.test(n))   return 'application/pdf';
  return null;
}

function validateFileMetaForSession(name, mimeType) {
  const declared = normalizeMime(mimeType);
  if (!name || !String(name).trim()) throw new Error('Each file must have a name');
  let resolved = declared;
  if (!ALLOWED_TYPES.includes(resolved)) {
    const inferred = inferMimeFromFilename(name);
    if (inferred) resolved = inferred;
  }
  if (!ALLOWED_TYPES.includes(resolved)) {
    throw new Error(`File type not allowed: ${declared || '(empty)'}. Use JPG, PNG, WebP, GIF, HEIC, SVG, or PDF.`);
  }
  return resolved;
}

function publicUrlForKey(env, key) {
  const base = (env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  return `${base}/${key}`;
}

function photoKeySegment(index, name, mime) {
  const base    = safeFilename(String(name)) || 'photo';
  const ext     = extForMime(mime);
  const withExt = /\.[a-z0-9]{1,8}$/i.test(base) ? base : `${base}.${ext}`;
  return `${index}-${withExt}`;
}

function logoKeySegment(name, mime) {
  const base    = safeFilename(String(name)) || 'logo';
  const ext     = extForMime(mime);
  const withExt = /\.[a-z0-9]{1,8}$/i.test(base) ? base : `${base}.${ext}`;
  return `0-${withExt}`;
}

function signIntakeSession(env, { uploadId, expiresAt, photoCount, keys }) {
  const secret = getIntakeSessionSecret(env);
  const msg    = `v1|${uploadId}|${expiresAt}|${photoCount}|${keys.join('\n')}`;
  return createHmac('sha256', secret).update(msg, 'utf8').digest('hex');
}

function verifyIntakeSessionSig(env, session) {
  const { uploadId, expiresAt, photoCount, keys, signature } = session;
  const expected = signIntakeSession(env, { uploadId, expiresAt, photoCount, keys });
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from((signature || '').trim(), 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function assertR2ConfigPresent(env) {
  const r2Missing = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'].filter(
    k => !env[k] || !String(env[k]).trim()
  );
  if (r2Missing.length) throw new Error(`R2 configuration missing: ${r2Missing.join(', ')}`);
  if (!getR2Endpoint(env)) throw new Error('R2 endpoint missing: set R2_ENDPOINT or R2_ACCOUNT_ID');
}

async function presignPutForIntake(env, key, contentType) {
  const cmd = new PutObjectCommand({
    Bucket:      (env.R2_BUCKET_NAME || '').trim(),
    Key:         key,
    ContentType: contentType,
  });
  return getSignedUrl(getS3(env), cmd, { expiresIn: PRESIGN_EXPIRES_SEC });
}

function submittedMarkerKey(uploadId) {
  return `intake/${uploadId}/_submitted.json`;
}

async function headObjectMeta(env, key) {
  const out = await getS3(env).send(new HeadObjectCommand({
    Bucket: (env.R2_BUCKET_NAME || '').trim(),
    Key:    key,
  }));
  return {
    contentLength: out.ContentLength != null ? Number(out.ContentLength) : 0,
    contentType:   (out.ContentType || '').split(';')[0].trim().toLowerCase(),
  };
}

function isR2NotFound(err) {
  const code   = err && (err.name || err.Code || err.code);
  const status = err && err.$metadata && err.$metadata.httpStatusCode;
  return code === 'NotFound' || status === 404;
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

function urlsFromSessionKeys(env, keys, photoCount) {
  const photoUrls = keys.slice(0, photoCount).map(k => publicUrlForKey(env, k));
  const logoUrl   = keys.length > photoCount ? publicUrlForKey(env, keys[photoCount]) : null;
  return { photoUrls, logoUrl };
}

export function extractFinalizeFields(body) {
  const o = body && typeof body === 'object' ? body : {};
  return {
    fullName:       o.fullName,
    bizName:        o.bizName,
    trade:          o.trade,
    phone:          o.phone,
    email:          o.email,
    area:           o.area,
    years:          o.years,
    services:       o.services,
    accreditations: o.accreditations,
    freeQuotes:     o.freeQuotes,
    emergency:      o.emergency,
    exclusions:     o.exclusions,
    story:          o.story,
    teamSize:       o.teamSize,
    idealWork:      o.idealWork,
    colourPref:     o.colourPref,
    websiteStyle:   o.websiteStyle,
    siteInspo:      o.siteInspo,
    testimonials:   o.testimonials,
    googleBiz:      o.googleBiz,
    trustmarks:     o.trustmarks,
    domainStatus:   o.domainStatus,
    domainName:     o.domainName,
    contactMethods: o.contactMethods,
    hours:          o.hours,
    extra:          o.extra,
  };
}

// ---------------------------------------------------------------------------
// D1 helpers
// ---------------------------------------------------------------------------

const CF_ACCOUNT_ID_DEFAULT   = '4f0a019a24cacd090cf6b3c3cf31c732';
const D1_PROSPECTS_ID_DEFAULT = '0ae32598-1680-4995-a010-96b647eacabd';
const D1_ENQUIRIES_ID_DEFAULT = '771b3047-f977-485e-9cfb-736815931998';

async function d1Query(env, dbId, sql, params) {
  const accountId = env.CF_ACCOUNT_ID || CF_ACCOUNT_ID_DEFAULT;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.errors?.[0]?.message || 'D1 query failed');
  return data.result[0].results;
}

async function updateProspectToHotLead(env, email) {
  if (!env.CF_API_TOKEN) {
    console.warn('[intake] CF_API_TOKEN not set — D1 Hot Lead update skipped');
    return 0;
  }
  const dbId = env.D1_PROSPECTS_ID || D1_PROSPECTS_ID_DEFAULT;
  const rows = await d1Query(env, dbId, "UPDATE prospects SET status = 'Hot Lead' WHERE email_address = ?", [email]);
  return rows?.meta?.changes ?? 0;
}

async function insertIntakeToD1(env, uploadId, fields, photoUrls, logoUrl) {
  if (!env.CF_API_TOKEN) {
    console.warn('[intake] CF_API_TOKEN not set — D1 intake_submissions insert skipped');
    return;
  }
  const dbId = env.D1_ENQUIRIES_ID || D1_ENQUIRIES_ID_DEFAULT;

  const yearsRaw = parseInt(String(fields.years || '').trim(), 10);
  const years    = Number.isFinite(yearsRaw) && yearsRaw >= 0 && yearsRaw <= 120 ? yearsRaw : null;

  await d1Query(env, dbId,
    `INSERT INTO intake_submissions
       (id, business_name, trade_category, full_name, email, phone, area,
        services, accreditations, work_exclusions, about, team_size, ideal_work,
        colour_preferences, website_style, testimonials, trust_marks, domain_name,
        contact_methods, working_hours, free_quotes, emergency_callouts,
        google_business, domain_status, inspiration_url, years_trading,
        additional_notes, photo_urls, logo_url)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      uploadId,
      (fields.bizName        || '').toString().trim() || null,
      (fields.trade          || '').toString().trim() || null,
      (fields.fullName       || '').toString().trim() || null,
      (fields.email          || '').toString().trim() || null,
      (fields.phone          || '').toString().trim() || null,
      (fields.area           || '').toString().trim() || null,
      (fields.services       || '').toString().trim() || null,
      (fields.accreditations || '').toString().trim() || null,
      (fields.exclusions     || '').toString().trim() || null,
      (fields.story          || '').toString().trim() || null,
      (fields.teamSize       || '').toString().trim() || null,
      (fields.idealWork      || '').toString().trim() || null,
      (fields.colourPref     || '').toString().trim() || null,
      (fields.websiteStyle   || '').toString().trim() || null,
      (fields.testimonials   || '').toString().trim() || null,
      (fields.trustmarks     || '').toString().trim() || null,
      (fields.domainName     || '').toString().trim() || null,
      (fields.contactMethods || '').toString().trim() || null,
      (fields.hours          || '').toString().trim() || null,
      (fields.freeQuotes     || '').toString().trim() || null,
      (fields.emergency      || '').toString().trim() || null,
      (fields.googleBiz      || '').toString().trim() || null,
      (fields.domainStatus   || '').toString().trim() || null,
      (fields.siteInspo      || '').toString().trim() || null,
      years,
      (fields.extra          || '').toString().trim() || null,
      JSON.stringify(photoUrls || []),
      logoUrl || null,
    ]
  );
  console.log('[intake] D1 intake_submissions row inserted:', uploadId);
}

// ---------------------------------------------------------------------------
// Notion helpers (optional — skipped when NOTION_API_KEY not set)
// ---------------------------------------------------------------------------

async function notionFetchWithRetry(url, init, label, maxAttempts = 4) {
  let lastStatus = 0;
  let lastText   = '';
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (netErr) {
      if (attempt === maxAttempts - 1) throw netErr;
      await new Promise(r => setTimeout(r, Math.min(3500, 400 * Math.pow(2, attempt))));
      continue;
    }
    if (res.ok) return res;
    lastText   = await res.text();
    lastStatus = res.status;
    const transient = [429, 502, 503, 504].includes(res.status) ||
      (res.status === 500 && /PgPool|overloaded|timeout/i.test(lastText));
    if (!transient || attempt === maxAttempts - 1) {
      const err = new Error(`Notion ${label} failed: ${lastStatus}`);
      err.notionStatus = lastStatus;
      err.notionBody   = lastText;
      throw err;
    }
    await new Promise(r => setTimeout(r, Math.min(5000, 350 * Math.pow(2, attempt))));
  }
  const err = new Error(`Notion ${label} failed after ${maxAttempts} attempts`);
  err.notionStatus = lastStatus;
  throw err;
}

function richText(value) {
  const str = (value || '').toString().trim().slice(0, 2000);
  if (!str) return null;
  return { rich_text: [{ text: { content: str } }] };
}

function assignNotionRichText(props, propName, value) {
  const rt = richText(value);
  if (rt) props[propName] = rt;
}

function notionSelectYesNo(raw) {
  const v = (raw || '').toString().trim().toLowerCase();
  if (v === 'yes') return { select: { name: 'Yes' } };
  if (v === 'no')  return { select: { name: 'No'  } };
  return null;
}

function notionSelectTri(raw) {
  const v = (raw || '').toString().trim().toLowerCase();
  if (v === 'yes')   return { select: { name: 'Yes'   } };
  if (v === 'no')    return { select: { name: 'No'    } };
  if (v === 'unsure') return { select: { name: 'Unsure' } };
  return null;
}

function notionYearsNumber(raw) {
  const n = parseInt(String(raw || '').trim(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 120) return null;
  return { number: n };
}

function notionUrl(value) {
  const str = (value || '').toString().trim();
  return str ? { url: str } : null;
}

function notionWorkPhotosFiles(urls) {
  if (!urls || !urls.length) return null;
  return {
    files: urls.slice(0, 40).map((url, i) => {
      let name = `work-${i + 1}`;
      try {
        const part = url.split('?')[0].split('/').pop();
        if (part && part.length < 120) name = part.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || name;
      } catch { /* ignore */ }
      return { type: 'external', name, external: { url } };
    }),
  };
}

async function createNotionRecord(env, fields, photoUrls, logoUrl) {
  const apiKey = env.NOTION_API_KEY;
  if (!apiKey) {
    console.warn('[intake] NOTION_API_KEY not set — Notion record skipped (Notion retired)');
    return null;
  }

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

  assignNotionRichText(props, NOTION_PROP.fullName,          fields.fullName);
  assignNotionRichText(props, NOTION_PROP.area,              fields.area);
  assignNotionRichText(props, NOTION_PROP.services,          fields.services);
  assignNotionRichText(props, NOTION_PROP.accreditations,    fields.accreditations);
  assignNotionRichText(props, NOTION_PROP.workExclusions,    fields.exclusions);
  assignNotionRichText(props, NOTION_PROP.about,             fields.story);
  assignNotionRichText(props, NOTION_PROP.teamSize,          fields.teamSize);
  assignNotionRichText(props, NOTION_PROP.idealWork,         fields.idealWork);
  assignNotionRichText(props, NOTION_PROP.colourPreferences, fields.colourPref);
  assignNotionRichText(props, NOTION_PROP.websiteStyle,      fields.websiteStyle);
  assignNotionRichText(props, NOTION_PROP.testimonials,      fields.testimonials);
  assignNotionRichText(props, NOTION_PROP.trustMarks,        fields.trustmarks);
  assignNotionRichText(props, NOTION_PROP.domainName,        fields.domainName);
  assignNotionRichText(props, NOTION_PROP.contactMethods,    fields.contactMethods);
  assignNotionRichText(props, NOTION_PROP.workingHours,      fields.hours);
  assignNotionRichText(props, NOTION_PROP.additionalNotes,   fields.extra);

  const y  = notionYearsNumber(fields.years);
  if (y)  props[NOTION_PROP.yearsTrading] = y;
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

  Object.keys(props).forEach(k => { if (props[k] == null) delete props[k]; });

  const response = await notionFetchWithRetry(
    'https://api.notion.com/v1/pages',
    {
      method: 'POST',
      headers: {
        Authorization:    `Bearer ${apiKey}`,
        'Content-Type':   'application/json',
        'Notion-Version': NOTION_VERSION,
      },
      body: JSON.stringify({ parent: { database_id: DATABASE_ID }, properties: props }),
    },
    'createPage'
  );

  const page = await response.json();
  console.log('[intake] Notion row created:', page.id);
  return page;
}

// ---------------------------------------------------------------------------
// Email notification via SMTP bridge
// ---------------------------------------------------------------------------

export async function sendIntakeNotificationEmail(env, fields, photoUrls, logoUrl, notionPageId) {
  const toEmail  = env.TO_EMAIL || 'neobookworm@icloud.com';
  const notionPageUrl = notionPageId
    ? `https://www.notion.so/${notionPageId.toString().replace(/-/g, '').trim()}`
    : null;

  const lines = [
    'New intake form submission — NeoBookworm',
    '========================================',
    ...(notionPageUrl ? [`Notion record: ${notionPageUrl}`, ''] : []),
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

  // Use uploadId as pseudo-slug for the email_log row (slug doesn't exist yet at this point)
  const pseudoSlug = fields.uploadId || 'intake-notification';

  try {
    await sendRendered(env, {
      slug:       pseudoSlug,
      templateId: 'manual',
      subject:    `New intake — ${fields.bizName || fields.fullName || 'client'}`,
      body:       emailBody,
      to:         toEmail,
    });
    console.log('[intake] notification email sent to', toEmail);
  } catch (err) {
    console.error('[intake] Email error (intake row saved):', err.message);
  }
}

async function putSubmittedMarker(env, uploadId, notionPageId) {
  const key  = submittedMarkerKey(uploadId);
  const body = Buffer.from(JSON.stringify({ at: Date.now(), notionPageId: notionPageId || null }), 'utf8');
  await getS3(env).send(new PutObjectCommand({
    Bucket:      (env.R2_BUCKET_NAME || '').trim(),
    Key:         key,
    Body:        body,
    ContentType: 'application/json',
  }));
}

// ---------------------------------------------------------------------------
// buildIntakeDirectUploadSession
// ---------------------------------------------------------------------------

export async function buildIntakeDirectUploadSession(env, input) {
  assertR2ConfigPresent(env);
  const secret = getIntakeSessionSecret(env);
  if (!secret) throw new Error('INTAKE_UPLOAD_SECRET is required for upload sessions');

  const photos = Array.isArray(input.photos) ? input.photos : [];
  const logo   = input.logo && typeof input.logo === 'object' ? input.logo : null;

  if (photos.length > MAX_PHOTOS_DIRECT) throw new Error(`Too many photos (max ${MAX_PHOTOS_DIRECT})`);

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

  const uploadId  = randomBytes(16).toString('hex');
  const prefix    = `intake/${uploadId}`;
  const keys      = [];
  const uploads   = [];
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;

  for (let i = 0; i < normalizedPhotos.length; i++) {
    const p   = normalizedPhotos[i];
    const key = `${prefix}/photos/${photoKeySegment(i, p.name, p.mimeType)}`;
    keys.push(key);
    const putUrl = await presignPutForIntake(env, key, p.mimeType);
    uploads.push({ key, putUrl, contentType: p.mimeType, publicUrl: publicUrlForKey(env, key) });
  }

  let logoUpload = null;
  if (normalizedLogo) {
    const key = `${prefix}/logo/${logoKeySegment(normalizedLogo.name, normalizedLogo.mimeType)}`;
    keys.push(key);
    const putUrl = await presignPutForIntake(env, key, normalizedLogo.mimeType);
    logoUpload = { key, putUrl, contentType: normalizedLogo.mimeType, publicUrl: publicUrlForKey(env, key) };
  }

  const photoCount = normalizedPhotos.length;
  const signature  = signIntakeSession(env, { uploadId, expiresAt, photoCount, keys });
  const session    = { uploadId, expiresAt, photoCount, keys, signature };

  console.log('[intake] direct session:', uploadId, '| photos:', photoCount, '| logo:', !!logoUpload);
  return { session, uploads, logo: logoUpload };
}

// ---------------------------------------------------------------------------
// finalizeIntakeDirectUpload
// ---------------------------------------------------------------------------

export async function finalizeIntakeDirectUpload(env, body) {
  assertR2ConfigPresent(env);

  const session = body && body.session;
  if (!session || typeof session !== 'object') throw new Error('Missing session');

  const { uploadId, expiresAt, photoCount, keys, signature } = session;
  if (!uploadId || !expiresAt || typeof photoCount !== 'number' || !Array.isArray(keys) || !signature) {
    throw new Error('Invalid session payload');
  }
  if (Math.floor(Date.now() / 1000) > expiresAt) {
    throw new Error('Session expired — please refresh the page and submit again');
  }
  if (!verifyIntakeSessionSig(env, session)) throw new Error('Invalid session signature');
  if (photoCount < 0 || photoCount > MAX_PHOTOS_DIRECT) throw new Error('Invalid photo count');
  if (!keysMatchLayout(keys, photoCount)) throw new Error('Session keys do not match photo/logo layout');

  // Idempotency check
  const lockKey = submittedMarkerKey(uploadId);
  try {
    await getS3(env).send(new HeadObjectCommand({ Bucket: (env.R2_BUCKET_NAME || '').trim(), Key: lockKey }));
    console.log('[intake] finalize duplicate for', uploadId);
    const { photoUrls, logoUrl } = urlsFromSessionKeys(env, keys, photoCount);
    return { duplicate: true, photoUrls, logoUrl };
  } catch (e) {
    if (!isR2NotFound(e)) throw e;
  }

  // Verify uploads
  for (const key of keys) {
    let meta;
    try {
      meta = await headObjectMeta(env, key);
    } catch (e) {
      if (isR2NotFound(e)) throw new Error('One or more files did not finish uploading. Please try again.');
      throw e;
    }
    if (!meta.contentLength || meta.contentLength <= 0) throw new Error('Empty upload — please re-select your files and try again.');
    if (meta.contentLength > MAX_FILE_BYTES) throw new Error('Uploaded file exceeds 10 MB limit');
  }

  const fields = extractFinalizeFields(body);
  if (!fields.bizName && !fields.email) throw new Error('Missing required fields');

  const { photoUrls, logoUrl } = urlsFromSessionKeys(env, keys, photoCount);
  console.log('[intake] finalize for', uploadId, '| photos:', photoUrls.length, '| logo:', !!logoUrl);

  // Hot lead
  if (fields.email) {
    try {
      const changed = await updateProspectToHotLead(env, fields.email.trim());
      console.log('[intake] D1 Hot Lead update: rows affected =', changed);
    } catch (d1Err) {
      console.error('[intake] D1 Hot Lead update error:', d1Err.message);
    }
  }

  // D1 intake row
  try {
    await insertIntakeToD1(env, uploadId, fields, photoUrls, logoUrl);
  } catch (d1IntakeErr) {
    console.error('[intake] D1 intake_submissions insert error (continuing):', d1IntakeErr.message);
  }

  // Notion (optional — skipped when NOTION_API_KEY not set)
  let page = null;
  try {
    page = await createNotionRecord(env, fields, photoUrls, logoUrl);
  } catch (notionErr) {
    console.error('[intake] Notion error (D1 row saved):', notionErr.message);
  }

  // Email notification
  try {
    await sendIntakeNotificationEmail(env, { ...fields, uploadId }, photoUrls, logoUrl, page && page.id);
  } catch (mailErr) {
    console.error('[intake] Email error (intake row saved):', mailErr.message);
  }

  // Idempotency marker
  try {
    await putSubmittedMarker(env, uploadId, page && page.id);
  } catch (markErr) {
    console.error('[intake] could not write submitted marker (row exists):', markErr.message);
  }

  return { duplicate: false, page, photoUrls, logoUrl };
}
