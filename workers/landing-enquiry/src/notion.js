/**
 * Notion integration for landing-enquiry Worker (Phase 2).
 *
 * Ported from api/intake-shared.js — only the subset needed for landing enquiries.
 * Does NOT import Node-only modules (no process.env, no require).
 *
 * Exported:
 *   createLandingEnquiryRecord(fields, apiKey) → { id } | throws
 */

const DATABASE_ID    = '4b45078a341941bcb5877e52f3d27c6c';
const NOTION_VERSION = '2022-06-28';

// ── NOTION_PROP subset (only columns used for landing enquiries) ──────────────

const NOTION_PROP = {
  businessName:    'Business Name',
  fullName:        'Full name',
  clientEmail:     'Client Email',
  tradeCategory:   'Trade Category',
  status:          'Status',
  additionalNotes: 'Additional notes',
};

// ── Label maps (mirror intake-shared.js) ─────────────────────────────────────

const LANDING_START_OPTION_LABELS = {
  leave_it_with_me:  'Free preview',
  tell_more:         'Tell me more',
  review_site_first: 'Site review',
  ready_to_switch:   'Ready to switch',
};

const LANDING_SOURCE_LABELS = {
  'plumbers-landing':        'Plumbers landing',
  'plumbers-switch-landing': 'Plumbers switch landing',
};

function landingStartOptionLabel(raw) {
  const k = (raw || '').toString().trim();
  return LANDING_START_OPTION_LABELS[k] || k;
}

function landingSourceLabel(raw) {
  const k = (raw || '').toString().trim();
  return LANDING_SOURCE_LABELS[k] || k;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function richText(value) {
  const str = (value || '').toString().trim().slice(0, 2000);
  if (!str) return null;
  return { rich_text: [{ text: { content: str } }] };
}

function assignNotionRichText(props, propName, value) {
  const rt = richText(value);
  if (rt) props[propName] = rt;
}

export function buildLandingEnquiryNotes(fields) {
  const chunks = [];
  const src = landingSourceLabel(fields.source);
  if (src) chunks.push(`Source: ${src}`);
  const opt = landingStartOptionLabel(fields.startOption);
  if (opt) chunks.push(`Start option: ${opt}`);
  const u = (fields.currentUrl || '').toString().trim();
  if (u) chunks.push(`Current website: ${u}`);
  const d = (fields.details || '').toString().trim();
  if (d) chunks.push(d);
  return chunks.join('\n\n');
}

// ── Retry fetch (mirrors notionFetchWithRetry in intake-shared.js) ────────────

async function notionFetchWithRetry(url, init, label) {
  const maxAttempts = 3;
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
        `[notion] ${label} network error (attempt ${attempt + 1}/${maxAttempts}):`,
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
      console.error(`[notion] ${label} failed:`, lastStatus, lastText);
      if (lastStatus === 401) {
        console.error(
          '[notion] 401: NOTION_API_KEY is invalid, revoked, or the integration is not shared with the database.',
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
      `[notion] ${label} HTTP ${lastStatus} (transient), retry ${attempt + 2}/${maxAttempts} in ${waitMs}ms`,
    );
    await new Promise((r) => setTimeout(r, waitMs));
  }

  const err = new Error(`Notion ${label} failed after ${maxAttempts} attempts`);
  err.notionStatus = lastStatus;
  err.notionBody = lastText;
  throw err;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a Client Sites row for a landing page enquiry.
 *
 * @param {object} fields  — { fullName, bizName, email, startOption, source, currentUrl, details }
 * @param {string} apiKey  — Notion internal integration secret (from Worker env)
 * @returns {Promise<{id: string}>}  — Notion page object (at minimum contains .id)
 */
export async function createLandingEnquiryRecord(fields, apiKey) {
  const props = {
    [NOTION_PROP.businessName]:  { title: [{ text: { content: (fields.bizName || 'Unknown').toString().trim().slice(0, 2000) } }] },
    [NOTION_PROP.tradeCategory]: { select: { name: 'Plumber' } },
    [NOTION_PROP.status]:        { select: { name: 'Pending Launch' } },
  };

  assignNotionRichText(props, NOTION_PROP.fullName, fields.fullName);

  const emailTrim = (fields.email || '').trim();
  if (emailTrim) props[NOTION_PROP.clientEmail] = { email: emailTrim };

  const notes = buildLandingEnquiryNotes(fields);
  assignNotionRichText(props, NOTION_PROP.additionalNotes, notes);

  const response = await notionFetchWithRetry(
    'https://api.notion.com/v1/pages',
    {
      method: 'POST',
      headers: {
        Authorization:    `Bearer ${apiKey}`,
        'Content-Type':   'application/json',
        'Notion-Version': NOTION_VERSION,
      },
      body: JSON.stringify({
        parent:     { database_id: DATABASE_ID },
        properties: props,
      }),
    },
    'createLandingEnquiry',
  );

  const page = await response.json();
  console.log('[notion] Client Sites row created, page id:', page.id);
  return page;
}
