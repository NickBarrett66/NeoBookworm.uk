// GET/POST /api/dashboard — Worker ES module version.
// All actions match api/dashboard.js exactly; differences:
//   - queryD1/prospectsDb/enquiriesDb take env as first arg
//   - promoteToClient/sendAcknowledgement/sendTemplated/sendRendered/bookingAdmin take env
//   - runSiteAudit(env, slug, opts)
//   - body parsed via request.json(); query params via url.searchParams
//   - Web Response; crypto.randomUUID() is a global

import { queryD1, prospectsDb, enquiriesDb }                              from '../_lib/d1.js';
import { bookingAdmin }                                                    from '../_lib/booking.js';
import { promoteToClient }                                                 from '../_lib/promote.js';
import { sendTemplated, sendRendered }                                     from '../_lib/email.js';
import { renderTemplate }                                                  from '../_lib/templates.js';
import { resolveSiteUrl, resolveLiveSiteUrl, normalizeStoredUrl }          from '../_lib/site-url.js';
import { runSiteAudit }                                                    from '../_lib/audit.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROSPECTS_EDITABLE = [
  'business_name', 'status', 'trade_category', 'contact_name', 'email_address', 'phone',
  'town', 'address', 'postcode',
  'has_website', 'website_url', 'website_platform', 'website_agency',
  'rating', 'review_count', 'postcard_score', 'prospect_segment',
  'company_type', 'ch_number', 'ch_status', 'ch_incorporation_date',
  'date_first_contacted', 'last_email_sent', 'contact_count',
  'research_summary', 'notes', 'note', 'disqualify_reason',
  'do_not_contact', 'response_classification', 'demo_url', 'demo_site_name',
];

const ENQUIRIES_EDITABLE = ['handled', 'admin_notes'];
const INTAKE_EDITABLE    = ['status', 'handled', 'admin_notes'];
const CONTACT_EDITABLE   = ['handled', 'admin_notes'];

const CLIENTS_EDITABLE = [
  'preview_url', 'live_url', 'current_url', 'domain', 'domain_status',
  'plan', 'next_action_by', 'notes', 'revision_count',
  'hosting_provider', 'hosting_url', 'client_email', 'stripe_customer_id',
  'stripe_link', 'site_review_content',
];

const CLIENT_VALID_STAGES = [
  'acknowledged', 'researching', 'building', 'reviewing', 'review_delivered',
  'preview_ready', 'revisions', 'awaiting_payment', 'preparing_live',
  'live', 'care_active', 'self_managed', 'dropped_out',
];

const TEMPLATE_STAGE_ADVANCE = {
  'J1-E1': 'researching',
  'J1-E2': 'building',
  'J1-E4': 'preview_ready',
};

const SUBMISSIONS_SOURCE_TYPES = new Set(['enquiry', 'intake', 'contact']);

// ---------------------------------------------------------------------------
// Response helper
// ---------------------------------------------------------------------------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// D1 helper wrappers — always pass env
// ---------------------------------------------------------------------------

async function syncCampaignCompleteStatus(env, campaignId) {
  const rows = await queryD1(env, prospectsDb(env),
    `SELECT
       (SELECT COUNT(*) FROM outbox WHERE campaign_id = ?) AS total,
       (SELECT COUNT(*) FROM outbox WHERE campaign_id = ? AND sent = 0 AND skipped = 0) AS pending`,
    [campaignId, campaignId]
  );
  const { total, pending } = rows[0] || {};
  if (total > 0 && pending === 0) {
    await queryD1(env, prospectsDb(env),
      `UPDATE campaigns SET status = 'complete' WHERE id = ? AND status != 'complete'`,
      [campaignId]
    );
    return true;
  }
  return false;
}

async function syncAllCompleteCampaigns(env) {
  await queryD1(env, prospectsDb(env),
    `UPDATE campaigns SET status = 'complete'
     WHERE status IN ('draft', 'active', 'paused')
       AND id IN (
         SELECT campaign_id FROM outbox
         GROUP BY campaign_id
         HAVING COUNT(*) > 0
            AND SUM(CASE WHEN sent = 0 AND skipped = 0 THEN 1 ELSE 0 END) = 0
       )`
  );
}

function normalisePhone(raw) {
  if (!raw) return null;
  let n = String(raw).replace(/[\s\-().+]/g, '');
  if (n.startsWith('44') && n.length >= 12) n = '0' + n.slice(2);
  if (n.startsWith('0044')) n = '0' + n.slice(4);
  if (!/^0\d{9,10}$/.test(n)) return null;
  return n;
}

function normaliseName(raw) {
  if (!raw) return null;
  const result = raw.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  return result || null;
}

function normalisePostcode(raw) {
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/\s+/g, '');
  if (cleaned.length < 5) return null;
  return cleaned.slice(0, -3) + ' ' + cleaned.slice(-3);
}

async function loadDncLookupMaps(env) {
  const rows = await queryD1(env, prospectsDb(env), 'SELECT id, phone, business_name, postcode FROM dnc');
  const phoneMap = new Map();
  const namePostcodeMap = new Map();
  for (const row of rows) {
    const normPhone    = normalisePhone(row.phone);
    const normName     = normaliseName(row.business_name);
    const normPostcode = normalisePostcode(row.postcode);
    if (normPhone) phoneMap.set(normPhone, row.id);
    if (normName && normPostcode) namePostcodeMap.set(`${normName}|${normPostcode}`, row.id);
  }
  return { phoneMap, namePostcodeMap };
}

function checkProspectDnc(maps, phone, businessName, postcode) {
  const normPhone = normalisePhone(phone);
  if (normPhone && maps.phoneMap.has(normPhone)) {
    return { isDNC: true, reason: `DNC: phone match (${normPhone})` };
  }
  const normName     = normaliseName(businessName);
  const normPostcode = normalisePostcode(postcode);
  if (normName && normPostcode && maps.namePostcodeMap.has(`${normName}|${normPostcode}`)) {
    return { isDNC: true, reason: 'DNC: name+postcode match' };
  }
  return { isDNC: false, reason: null };
}

async function prospectOnDncList(env, prospect) {
  if (prospect.do_not_contact) return true;
  const maps = await loadDncLookupMaps(env);
  return checkProspectDnc(maps, prospect.phone, prospect.business_name, prospect.postcode).isDNC;
}

async function addProspectToDnc(env, notionId, sourceReason = 'DNC: manual dashboard add') {
  const rows = await queryD1(env, prospectsDb(env), 'SELECT * FROM prospects WHERE notion_id = ?', [notionId]);
  if (!rows.length) throw new Error('Prospect not found');
  const p = rows[0];

  const maps    = await loadDncLookupMaps(env);
  const existing = checkProspectDnc(maps, p.phone, p.business_name, p.postcode);

  let dncInserted = false;
  if (!existing.isDNC) {
    await queryD1(env, prospectsDb(env),
      `INSERT INTO dnc (phone, business_name, postcode, reason) VALUES (?, ?, ?, ?)`,
      [
        p.phone != null && String(p.phone).trim() !== '' ? String(p.phone) : null,
        p.business_name ? String(p.business_name) : null,
        p.postcode      ? String(p.postcode)       : null,
        sourceReason,
      ]
    );
    dncInserted = true;
  }

  const disqualifyReason = existing.isDNC ? existing.reason : sourceReason;

  await Promise.all([
    queryD1(env, prospectsDb(env),
      `UPDATE prospects SET
         status = 'Disqualified',
         do_not_contact = 1,
         disqualify_reason = ?,
         sequence_suppressed = 1
       WHERE notion_id = ?`,
      [disqualifyReason, notionId]
    ),
    queryD1(env, prospectsDb(env),
      `UPDATE outbox SET suppressed = 1, approved = 0, approved_at = NULL
       WHERE notion_id = ? AND sent = 0`,
      [notionId]
    ),
  ]);

  return { dncInserted, alreadyOnDnc: existing.isDNC, disqualifyReason };
}

async function fetchProspectCampaigns(env, notionId) {
  return queryD1(env, prospectsDb(env),
    `WITH prospect_campaigns AS (
       SELECT campaign_id AS id FROM outbox WHERE notion_id = ?
       UNION
       SELECT NULLIF(TRIM(email_campaign_id), '') AS id FROM prospects WHERE notion_id = ?
     )
     SELECT c.id, c.trade, c.status, c.priority, c.count_sent, c.count_total,
            COALESCE(agg.outbox_rows, 0) AS outbox_rows,
            COALESCE(agg.pending_emails, 0) AS pending_emails,
            COALESCE(agg.suppressed, 0) AS suppressed
     FROM prospect_campaigns pc
     JOIN campaigns c ON c.id = pc.id
     LEFT JOIN (
       SELECT campaign_id,
              COUNT(*) AS outbox_rows,
              SUM(CASE WHEN sent = 0 AND skipped = 0 THEN 1 ELSE 0 END) AS pending_emails,
              MAX(suppressed) AS suppressed
       FROM outbox
       WHERE notion_id = ?
       GROUP BY campaign_id
     ) agg ON agg.campaign_id = c.id
     WHERE pc.id IS NOT NULL
     ORDER BY c.priority DESC, c.created_at DESC`,
    [notionId, notionId, notionId]
  );
}

function buildSortOrder(sortPairs, allowedCols, colExpr, { pinCompleteLast = false, completeExpr = null } = {}) {
  const orderClauses = [];
  for (const [col, dir] of sortPairs) {
    if (!col || !allowedCols.has(col)) continue;
    const d = dir === 'desc' ? 'DESC' : 'ASC';
    orderClauses.push(`${colExpr(col)} ${d}`);
  }
  if (pinCompleteLast && completeExpr) {
    orderClauses.unshift(`${completeExpr} ASC`);
  }
  return orderClauses.length ? orderClauses.join(', ') : null;
}

function parseSortParams(sp, prefix = 'sort') {
  return [
    [sp.get(`${prefix}1_col`) || '', sp.get(`${prefix}1_dir`) || 'asc'],
    [sp.get(`${prefix}2_col`) || '', sp.get(`${prefix}2_dir`) || 'asc'],
    [sp.get(`${prefix}3_col`) || '', sp.get(`${prefix}3_dir`) || 'asc'],
  ];
}

async function fetchClientSourceRecord(env, source_type, source_id) {
  if (!source_type || !source_id) return null;
  switch (source_type) {
    case 'landing_enquiry': {
      const rows = await queryD1(env, enquiriesDb(env),
        `SELECT id, created_at, full_name, biz_name, email, start_option,
                source, details, current_url, handled, admin_notes
           FROM landing_enquiries WHERE id = ? LIMIT 1`, [source_id]);
      return rows[0] || null;
    }
    case 'intake': {
      const rows = await queryD1(env, enquiriesDb(env),
        `SELECT * FROM intake_submissions WHERE id = ? LIMIT 1`, [source_id]);
      return rows[0] || null;
    }
    case 'contact': {
      const rows = await queryD1(env, enquiriesDb(env),
        `SELECT * FROM contact_enquiries WHERE id = ? LIMIT 1`, [source_id]);
      return rows[0] || null;
    }
    case 'prospect': {
      const rows = await queryD1(env, prospectsDb(env),
        `SELECT notion_id, business_name, contact_name, email_address, phone,
                trade_category, town, postcode, website_url, has_website,
                rating, review_count, ch_number, ch_status, demo_url, demo_site_name,
                status, prospect_segment, last_email_sent, contact_count
           FROM prospects WHERE notion_id = ? LIMIT 1`, [source_id]);
      return rows[0] || null;
    }
    default:
      return null;
  }
}

async function findLinkedClient(env, source_type, source_id) {
  const rows = await queryD1(env, enquiriesDb(env),
    `SELECT slug, journey, stage, email, business_name, contact_name
       FROM clients
      WHERE source_type = ? AND source_id = ?
      LIMIT 1`,
    [source_type, source_id]
  );
  return rows.length ? rows[0] : null;
}

function buildSubmissionsUnion(handled, q, sourceFilter) {
  const hasSearch  = q && q.trim().length > 0;
  const searchPct  = hasSearch ? `%${q.trim()}%` : null;
  const includeAll = !sourceFilter || sourceFilter === 'all';
  const branches   = [];

  function pushBranch(sourceType, selectSql, searchCols) {
    if (!includeAll && sourceFilter !== sourceType) return;
    const conditions = [];
    const params     = [];
    if (handled === '0') { conditions.push('handled = 0'); }
    if (handled === '1') { conditions.push('handled = 1'); }
    if (hasSearch) {
      conditions.push(`(${searchCols.map(c => `${c} LIKE ?`).join(' OR ')})`);
      searchCols.forEach(() => params.push(searchPct));
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    branches.push({ sql: `${selectSql}${where}`, params });
  }

  pushBranch('enquiry',
    `SELECT 'enquiry' AS source_type, id AS source_id, created_at,
            full_name AS display_name, biz_name AS business_name,
            email, NULL AS trade, handled,
            start_option, NULL AS intake_status, NULL AS message_preview,
            notion_status, email_status
     FROM landing_enquiries`,
    ['full_name', 'biz_name', 'email']
  );

  pushBranch('intake',
    `SELECT 'intake' AS source_type, id AS source_id, created_at,
            full_name AS display_name, business_name, email,
            trade_category AS trade, handled,
            NULL AS start_option, status AS intake_status, NULL AS message_preview,
            NULL AS notion_status, NULL AS email_status
     FROM intake_submissions`,
    ['full_name', 'business_name', 'email', 'trade_category']
  );

  pushBranch('contact',
    `SELECT 'contact' AS source_type, id AS source_id, created_at,
            name AS display_name, NULL AS business_name, email,
            trade, handled,
            NULL AS start_option, NULL AS intake_status,
            substr(message, 1, 80) AS message_preview,
            NULL AS notion_status, NULL AS email_status
     FROM contact_enquiries`,
    ['name', 'email', 'trade']
  );

  return branches;
}

function buildClientVars(client) {
  const vars = {};
  vars.name       = client.contact_name  || client.business_name || 'there';
  vars.business   = client.business_name || client.contact_name  || 'your business';
  vars.portal_url = `https://neobookworm.uk/c/${client.slug}/`;
  if (client.preview_url)      vars.preview_url     = resolveSiteUrl(client.preview_url);
  if (client.live_url || client.domain) {
    vars.live_url = resolveLiveSiteUrl(client.live_url, client.domain);
  }
  if (client.current_url)      vars.current_url      = resolveSiteUrl(client.current_url);
  if (client.next_action_by)   vars.deliver_by       = client.next_action_by;
  if (client.domain)           vars.domain           = client.domain;
  if (client.hosting_provider) vars.hosting_provider = client.hosting_provider;
  if (client.hosting_url)      vars.hosting_url      = client.hosting_url;
  if (client.client_email)     vars.client_email     = client.client_email;
  if (client.revision_count != null) vars.revisions_count = String(client.revision_count);
  vars.stripe_link = client.stripe_link || '[STRIPE LINK — paste into dashboard Site URLs field]';
  return vars;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handle(request, env, ctx, url) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405);
  }

  const secret = env.DASHBOARD_SECRET;
  if (secret) {
    const auth  = request.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== secret) return json({ error: 'Unauthorised' }, 401);
  }

  if (!env.CF_API_TOKEN) return json({ error: 'CF_API_TOKEN not configured' }, 500);

  const sp = url.searchParams;

  // ── POST ───────────────────────────────────────────────────────────────────

  if (request.method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
    if (!body || typeof body !== 'object') return json({ error: 'Invalid JSON body' }, 400);

    const { action, id, fields, notion_id, campaign_id } = body;

    if (action === 'outreach_sent') {
      if (!notion_id || typeof notion_id !== 'string')     return json({ ok: false, error: 'notion_id required' }, 400);
      if (!campaign_id || typeof campaign_id !== 'string') return json({ ok: false, error: 'campaign_id required' }, 400);
      try {
        await Promise.all([
          queryD1(env, prospectsDb(env),
            `UPDATE prospects
             SET last_email_sent        = datetime('now'),
                 date_first_contacted   = CASE WHEN date_first_contacted IS NULL THEN datetime('now') ELSE date_first_contacted END,
                 contact_count          = COALESCE(contact_count, 0) + 1,
                 status                 = 'Emailed',
                 email_campaign_id      = ?
             WHERE notion_id = ?`,
            [campaign_id, notion_id]
          ),
          queryD1(env, prospectsDb(env),
            `UPDATE campaigns SET count_sent = count_sent + 1 WHERE id = ?`,
            [campaign_id]
          ),
        ]);
        await syncCampaignCompleteStatus(env, campaign_id);
        return json({ ok: true, notion_id, campaign_id });
      } catch (err) {
        console.error('[dashboard outreach_sent]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'outbox_approve_prospect') {
      if (!body.notion_id || !body.campaign_id) return json({ ok: false, error: 'notion_id and campaign_id required' }, 400);
      try {
        await queryD1(env, prospectsDb(env),
          `UPDATE outbox SET approved = 1, approved_at = datetime('now')
           WHERE notion_id = ? AND campaign_id = ? AND sent = 0 AND skipped = 0 AND suppressed = 0`,
          [body.notion_id, body.campaign_id]);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_approve_prospect]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'outbox_unapprove_prospect') {
      if (!body.notion_id || !body.campaign_id) return json({ ok: false, error: 'notion_id and campaign_id required' }, 400);
      try {
        await queryD1(env, prospectsDb(env),
          `UPDATE outbox SET approved = 0, approved_at = NULL
           WHERE notion_id = ? AND campaign_id = ? AND sent = 0`,
          [body.notion_id, body.campaign_id]);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_unapprove_prospect]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'outbox_suppress_prospect') {
      if (!body.notion_id || !body.campaign_id) return json({ ok: false, error: 'notion_id and campaign_id required' }, 400);
      try {
        await Promise.all([
          queryD1(env, prospectsDb(env),
            `UPDATE outbox SET suppressed = 1
             WHERE notion_id = ? AND campaign_id = ? AND sent = 0`,
            [body.notion_id, body.campaign_id]),
          queryD1(env, prospectsDb(env),
            `UPDATE prospects SET sequence_suppressed = 1 WHERE notion_id = ?`,
            [body.notion_id]),
        ]);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_suppress_prospect]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'outbox_unsuppress_prospect') {
      if (!body.notion_id || !body.campaign_id) return json({ ok: false, error: 'notion_id and campaign_id required' }, 400);
      try {
        await Promise.all([
          queryD1(env, prospectsDb(env),
            `UPDATE outbox SET suppressed = 0
             WHERE notion_id = ? AND campaign_id = ? AND sent = 0`,
            [body.notion_id, body.campaign_id]),
          queryD1(env, prospectsDb(env),
            `UPDATE prospects SET sequence_suppressed = 0 WHERE notion_id = ?`,
            [body.notion_id]),
        ]);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_unsuppress_prospect]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'outbox_next') {
      try {
        const rows = await queryD1(env, prospectsDb(env),
          `SELECT o.id, o.campaign_id, o.notion_id, o.business_name,
                  o.email, o.subject, o.body, o.seq_num
           FROM outbox o
           JOIN campaigns c ON o.campaign_id = c.id
           WHERE o.sent = 0
             AND o.skipped = 0
             AND o.approved = 1
             AND o.suppressed = 0
             AND c.status = 'active'
             AND (o.scheduled_not_before IS NULL OR o.scheduled_not_before <= datetime('now'))
           ORDER BY c.priority DESC, o.created_at ASC
           LIMIT 1`
        );
        return json({ ok: true, data: rows[0] || null });
      } catch (err) {
        console.error('[dashboard outbox_next]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'outbox_approve') {
      if (!id) return json({ ok: false, error: 'id required' }, 400);
      try {
        await queryD1(env, prospectsDb(env),
          `UPDATE outbox SET approved = 1, approved_at = datetime('now') WHERE id = ?`, [id]);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_approve]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'outbox_unapprove') {
      if (!id) return json({ ok: false, error: 'id required' }, 400);
      try {
        await queryD1(env, prospectsDb(env),
          `UPDATE outbox SET approved = 0, approved_at = NULL WHERE id = ? AND sent = 0`, [id]);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_unapprove]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'outbox_approve_all') {
      if (!campaign_id || typeof campaign_id !== 'string') return json({ ok: false, error: 'campaign_id required' }, 400);
      try {
        const countRows = await queryD1(env, prospectsDb(env),
          `SELECT COUNT(*) AS n FROM outbox
           WHERE campaign_id = ? AND sent = 0 AND skipped = 0 AND suppressed = 0 AND approved = 0`,
          [campaign_id]);
        await queryD1(env, prospectsDb(env),
          `UPDATE outbox SET approved = 1, approved_at = datetime('now')
           WHERE campaign_id = ? AND sent = 0 AND skipped = 0 AND suppressed = 0`,
          [campaign_id]);
        return json({ ok: true, approved_count: countRows[0]?.n || 0 });
      } catch (err) {
        console.error('[dashboard outbox_approve_all]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'outbox_confirm') {
      if (!id) return json({ ok: false, error: 'id required' }, 400);
      try {
        const outboxRows = await queryD1(env, prospectsDb(env),
          `SELECT seq_num, notion_id, campaign_id FROM outbox WHERE id = ?`, [id]);
        if (!outboxRows.length) return json({ ok: false, error: 'Outbox row not found' }, 404);
        const seqNum = outboxRows[0].seq_num ?? 1;

        const prospectsUpdate = seqNum === 1
          ? `UPDATE prospects
             SET last_email_sent      = datetime('now'),
                 date_first_contacted = CASE WHEN date_first_contacted IS NULL
                                             THEN datetime('now')
                                             ELSE date_first_contacted END,
                 contact_count        = COALESCE(contact_count, 0) + 1,
                 status               = 'Emailed',
                 email_campaign_id    = (SELECT campaign_id FROM outbox WHERE id = ?)
             WHERE notion_id = (SELECT notion_id FROM outbox WHERE id = ?)`
          : `UPDATE prospects
             SET last_email_sent = datetime('now')
             WHERE notion_id = (SELECT notion_id FROM outbox WHERE id = ?)`;

        const prospectsParams = seqNum === 1 ? [id, id] : [id];
        const notionId   = outboxRows[0].notion_id;
        const campaignId = outboxRows[0].campaign_id;

        await Promise.all([
          queryD1(env, prospectsDb(env),
            `UPDATE outbox SET sent = 1, sent_at = datetime('now') WHERE id = ?`, [id]),
          queryD1(env, prospectsDb(env), prospectsUpdate, prospectsParams),
          queryD1(env, prospectsDb(env),
            `UPDATE campaigns SET count_sent = count_sent + 1
             WHERE id = (SELECT campaign_id FROM outbox WHERE id = ?)`, [id]),
        ]);

        if (seqNum === 1 && notionId && campaignId) {
          await Promise.all([
            queryD1(env, prospectsDb(env),
              `UPDATE outbox
               SET scheduled_not_before = date(datetime('now'), '+5 days')
               WHERE campaign_id = ? AND notion_id = ? AND seq_num = 2 AND sent = 0
                 AND (scheduled_not_before IS NULL OR scheduled_not_before <= date('now'))`,
              [campaignId, notionId]),
            queryD1(env, prospectsDb(env),
              `UPDATE outbox
               SET scheduled_not_before = date(datetime('now'), '+12 days')
               WHERE campaign_id = ? AND notion_id = ? AND seq_num = 3 AND sent = 0
                 AND (scheduled_not_before IS NULL OR scheduled_not_before <= date('now'))`,
              [campaignId, notionId]),
          ]);
        }

        if (campaignId) await syncCampaignCompleteStatus(env, campaignId);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_confirm]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'outbox_error') {
      if (!id) return json({ ok: false, error: 'id required' }, 400);
      if (body.error === undefined) return json({ ok: false, error: 'error required' }, 400);
      try {
        await queryD1(env, prospectsDb(env),
          `UPDATE outbox SET send_error = ?, send_attempts = send_attempts + 1 WHERE id = ?`,
          [body.error, id]);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_error]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'outbox_edit') {
      if (!id) return json({ ok: false, error: 'id required' }, 400);
      const OUTBOX_EDITABLE = ['subject', 'body', 'scheduled_not_before'];
      const editFields = fields && typeof fields === 'object' ? fields : {};
      const allowed = Object.keys(editFields).filter(k => OUTBOX_EDITABLE.includes(k));
      if (!allowed.length) return json({ ok: false, error: 'No editable fields provided' }, 400);
      const set    = allowed.map(k => `${k} = ?`).join(', ');
      const params = [...allowed.map(k => editFields[k]), id];
      try {
        await queryD1(env, prospectsDb(env), `UPDATE outbox SET ${set} WHERE id = ?`, params);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_edit]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'outbox_skip') {
      if (!id) return json({ ok: false, error: 'id required' }, 400);
      try {
        const skipRows = await queryD1(env, prospectsDb(env),
          `SELECT campaign_id FROM outbox WHERE id = ?`, [id]);
        await queryD1(env, prospectsDb(env),
          `UPDATE outbox SET skipped = 1, skip_reason = ? WHERE id = ?`,
          [body.reason || null, id]);
        const cid = skipRows[0]?.campaign_id;
        if (cid) await syncCampaignCompleteStatus(env, cid);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_skip]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'outbox_unskip') {
      if (!id) return json({ ok: false, error: 'id required' }, 400);
      try {
        await queryD1(env, prospectsDb(env),
          `UPDATE outbox SET skipped = 0, skip_reason = NULL WHERE id = ?`, [id]);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_unskip]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'campaign_activate') {
      if (!id) return json({ ok: false, error: 'id required' }, 400);
      try {
        await queryD1(env, prospectsDb(env),
          `UPDATE campaigns SET status = 'active', scheduled_at = datetime('now') WHERE id = ?`, [id]);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard campaign_activate]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'campaign_pause') {
      if (!id) return json({ ok: false, error: 'id required' }, 400);
      try {
        await queryD1(env, prospectsDb(env),
          `UPDATE campaigns SET status = 'paused' WHERE id = ?`, [id]);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard campaign_pause]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'campaign_resume') {
      if (!id) return json({ ok: false, error: 'id required' }, 400);
      try {
        await queryD1(env, prospectsDb(env),
          `UPDATE campaigns SET status = 'active' WHERE id = ?`, [id]);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard campaign_resume]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'campaign_boost') {
      if (!id) return json({ ok: false, error: 'id required' }, 400);
      if (typeof body.delta !== 'number') return json({ ok: false, error: 'delta (integer) required' }, 400);
      try {
        await queryD1(env, prospectsDb(env),
          `UPDATE campaigns SET priority = MAX(-10, MIN(10, priority + ?)) WHERE id = ?`,
          [body.delta, id]);
        const rows = await queryD1(env, prospectsDb(env),
          `SELECT priority FROM campaigns WHERE id = ?`, [id]);
        return json({ ok: true, new_priority: rows[0]?.priority ?? null });
      } catch (err) {
        console.error('[dashboard campaign_boost]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'outbox_populate') {
      if (!campaign_id || typeof campaign_id !== 'string') return json({ ok: false, error: 'campaign_id required' }, 400);
      if (!Array.isArray(body.rows) || !body.rows.length) return json({ ok: false, error: 'rows array required' }, 400);
      try {
        await Promise.all(body.rows.map(row => queryD1(env, prospectsDb(env),
          `INSERT OR IGNORE INTO outbox (id, campaign_id, notion_id, business_name, email, subject, body, scheduled_not_before)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), campaign_id, row.notion_id, row.business_name, row.email, row.subject, row.body, row.scheduled_not_before || null]
        )));
        await queryD1(env, prospectsDb(env),
          `UPDATE campaigns SET count_total = count_total + ? WHERE id = ?`,
          [body.rows.length, campaign_id]);
        return json({ ok: true, inserted: body.rows.length });
      } catch (err) {
        console.error('[dashboard outbox_populate]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'client_promote') {
      const { source_type, source_id, journey } = body;
      if (!source_type || !source_id) return json({ ok: false, error: 'source_type and source_id required' }, 400);
      try {
        const result = await promoteToClient(env, { source_type, source_id, journey });
        return json({ ok: true, ...result });
      } catch (err) {
        console.error('[dashboard client_promote]', err.message);
        return json({ ok: false, error: err.message }, 400);
      }
    }

    if (action === 'client_set_stage') {
      const { slug, stage, next_action_by } = body;
      if (!slug || !stage) return json({ ok: false, error: 'slug and stage required' }, 400);
      if (!CLIENT_VALID_STAGES.includes(stage)) return json({ ok: false, error: `Invalid stage: ${stage}` }, 400);
      try {
        const setClause = next_action_by !== undefined
          ? `stage = ?, stage_changed_at = datetime('now'), next_action_by = ?`
          : `stage = ?, stage_changed_at = datetime('now')`;
        const params = next_action_by !== undefined
          ? [stage, next_action_by || null, slug]
          : [stage, slug];
        await queryD1(env, enquiriesDb(env), `UPDATE clients SET ${setClause} WHERE slug = ?`, params);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard client_set_stage]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'client_preview') {
      const { slug, templateId, extra_vars = {} } = body;
      if (!slug || !templateId) return json({ ok: false, error: 'slug and templateId required' }, 400);
      try {
        const clientRows = await queryD1(env, enquiriesDb(env), `SELECT * FROM clients WHERE slug = ?`, [slug]);
        if (!clientRows.length) return json({ ok: false, error: 'Client not found' }, 404);
        const vars = { ...buildClientVars(clientRows[0]), ...extra_vars };
        const { subject, body: emailBody } = renderTemplate(templateId, vars);
        return json({ ok: true, subject, body: emailBody });
      } catch (err) {
        return json({ ok: false, error: err.message }, 400);
      }
    }

    if (action === 'client_send') {
      const { slug, templateId, extra_vars = {}, subject: subjectOverride, body: bodyOverride } = body;
      if (!slug || !templateId) return json({ ok: false, error: 'slug and templateId required' }, 400);
      try {
        const clientRows = await queryD1(env, enquiriesDb(env), `SELECT * FROM clients WHERE slug = ?`, [slug]);
        if (!clientRows.length) return json({ ok: false, error: 'Client not found' }, 404);
        const client = clientRows[0];

        let result;
        if (subjectOverride && bodyOverride) {
          result = await sendRendered(env, { slug, templateId, subject: subjectOverride, body: bodyOverride, to: client.email });
        } else {
          const vars = { ...buildClientVars(client), ...extra_vars };
          result = await sendTemplated(env, { slug, templateId, vars, to: client.email });
        }

        let stageAdvanced = null;
        if (result.ok) {
          const nextStage = TEMPLATE_STAGE_ADVANCE[templateId];
          if (nextStage) {
            const currentRank = CLIENT_VALID_STAGES.indexOf(client.stage);
            const nextRank    = CLIENT_VALID_STAGES.indexOf(nextStage);
            if (nextRank > currentRank) {
              try {
                await queryD1(env, enquiriesDb(env),
                  `UPDATE clients SET stage = ?, stage_changed_at = datetime('now') WHERE slug = ?`,
                  [nextStage, slug]
                );
                stageAdvanced = nextStage;
              } catch (e) {
                console.error(`[client_send] stage advance to ${nextStage} failed for ${slug}:`, e.message);
              }
            }
          }
        }

        return json({ ok: result.ok, error: result.error || null, stage_advanced: stageAdvanced });
      } catch (err) {
        console.error('[dashboard client_send]', err.message);
        return json({ ok: false, error: err.message }, 400);
      }
    }

    if (action === 'client_audit_run') {
      const { slug, dry_run = false, test_mode = false } = body;
      if (!slug) return json({ ok: false, error: 'slug required' }, 400);
      try {
        const result = await runSiteAudit(env, slug, { dryRun: Boolean(dry_run), testMode: Boolean(test_mode) });
        return json(result, result.ok ? 200 : 400);
      } catch (err) {
        console.error('[dashboard client_audit_run]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'client_set_fields') {
      const { slug, fields: f } = body;
      if (!slug || !f || typeof f !== 'object') return json({ ok: false, error: 'slug and fields object required' }, 400);
      const URL_FIELDS = new Set(['preview_url', 'live_url', 'current_url']);
      const allowed = Object.keys(f).filter(k => CLIENTS_EDITABLE.includes(k));
      if (!allowed.length) return json({ ok: false, error: 'No editable fields provided' }, 400);
      const set    = allowed.map(k => `${k} = ?`).join(', ');
      const params = [...allowed.map(k => {
        const val = f[k] || null;
        return URL_FIELDS.has(k) ? normalizeStoredUrl(val) : val;
      }), slug];
      try {
        await queryD1(env, enquiriesDb(env), `UPDATE clients SET ${set} WHERE slug = ?`, params);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard client_set_fields]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'prospect_add_dnc') {
      if (!id) return json({ ok: false, error: 'id required' }, 400);
      const reason = typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim()
        : 'DNC: manual dashboard add';
      try {
        const result = await addProspectToDnc(env, id, reason);
        return json({ ok: true, ...result });
      } catch (err) {
        console.error('[dashboard prospect_add_dnc]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'client_delete') {
      const { slug, confirm_slug } = body;
      if (!slug) return json({ ok: false, error: 'slug required' }, 400);
      if (!confirm_slug || confirm_slug !== slug) return json({ ok: false, error: 'confirm_slug must match slug' }, 400);
      const existing = await queryD1(env, enquiriesDb(env),
        'SELECT slug FROM clients WHERE slug = ? LIMIT 1', [slug]);
      if (!existing.length) return json({ ok: false, error: 'Client not found' }, 404);
      try {
        await queryD1(env, enquiriesDb(env), 'DELETE FROM change_requests WHERE slug = ?', [slug]);
        await queryD1(env, enquiriesDb(env), 'DELETE FROM email_log WHERE slug = ?', [slug]);
        await queryD1(env, enquiriesDb(env), 'DELETE FROM feedback WHERE slug = ?', [slug]);
        await queryD1(env, enquiriesDb(env), 'DELETE FROM clients WHERE slug = ?', [slug]);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard client_delete]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    if (action === 'email_log_delete') {
      const { id: elId, slug } = body;
      if (!elId || !slug) return json({ ok: false, error: 'id and slug required' }, 400);
      const existing = await queryD1(env, enquiriesDb(env),
        'SELECT id FROM email_log WHERE id = ? AND slug = ? LIMIT 1', [elId, slug]);
      if (!existing.length) return json({ ok: false, error: 'Email log row not found' }, 404);
      await queryD1(env, enquiriesDb(env), 'DELETE FROM email_log WHERE id = ? AND slug = ?', [elId, slug]);
      return json({ ok: true });
    }

    if (action === 'tenant_save') {
      const { slug, config } = body;
      if (!slug || !config || typeof config !== 'object') return json({ ok: false, error: 'slug and config object required' }, 400);
      try {
        const { status, data } = await bookingAdmin(env, `/admin/tenant/${encodeURIComponent(slug)}`, {
          method: 'PUT',
          body: { config },
        });
        return json(data, status);
      } catch (err) {
        console.error('[dashboard tenant_save]', err.message);
        return json({ ok: false, error: err.message }, 500);
      }
    }

    // Remaining update/delete actions require id
    if (!id) return json({ error: 'id required' }, 400);
    const isDelete = action && action.endsWith('_delete');
    if (!fields && !isDelete) return json({ error: 'fields object required' }, 400);

    if (action === 'update') {
      const allowed = Object.keys(fields).filter(k => PROSPECTS_EDITABLE.includes(k));
      if (!allowed.length) return json({ error: 'No editable fields provided' }, 400);
      const set    = allowed.map(k => `${k} = ?`).join(', ');
      const params = [...allowed.map(k => fields[k]), id];
      try {
        await queryD1(env, prospectsDb(env), `UPDATE prospects SET ${set} WHERE notion_id = ?`, params);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard update]', err.message);
        return json({ error: err.message }, 500);
      }
    }

    if (action === 'enquiries_update') {
      const allowed = Object.keys(fields).filter(k => ENQUIRIES_EDITABLE.includes(k));
      if (!allowed.length) return json({ error: 'No editable fields provided' }, 400);
      const set    = allowed.map(k => `${k} = ?`).join(', ');
      const params = [...allowed.map(k => fields[k]), id];
      try {
        await queryD1(env, enquiriesDb(env), `UPDATE landing_enquiries SET ${set} WHERE id = ?`, params);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard enquiries_update]', err.message);
        return json({ error: err.message }, 500);
      }
    }

    if (action === 'intake_update') {
      const allowed = Object.keys(fields).filter(k => INTAKE_EDITABLE.includes(k));
      if (!allowed.length) return json({ error: 'No editable fields provided' }, 400);
      const set    = allowed.map(k => `${k} = ?`).join(', ');
      const params = [...allowed.map(k => fields[k]), id];
      try {
        await queryD1(env, enquiriesDb(env), `UPDATE intake_submissions SET ${set} WHERE id = ?`, params);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard intake_update]', err.message);
        return json({ error: err.message }, 500);
      }
    }

    if (action === 'contact_update') {
      const allowed = Object.keys(fields).filter(k => CONTACT_EDITABLE.includes(k));
      if (!allowed.length) return json({ error: 'No editable fields provided' }, 400);
      const set    = allowed.map(k => `${k} = ?`).join(', ');
      const params = [...allowed.map(k => fields[k]), id];
      try {
        await queryD1(env, enquiriesDb(env), `UPDATE contact_enquiries SET ${set} WHERE id = ?`, params);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard contact_update]', err.message);
        return json({ error: err.message }, 500);
      }
    }

    if (action === 'enquiries_delete') {
      try {
        await queryD1(env, enquiriesDb(env), `DELETE FROM landing_enquiries WHERE id = ?`, [id]);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard enquiries_delete]', err.message);
        return json({ error: err.message }, 500);
      }
    }

    if (action === 'intake_delete') {
      try {
        await queryD1(env, enquiriesDb(env), `DELETE FROM intake_submissions WHERE id = ?`, [id]);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard intake_delete]', err.message);
        return json({ error: err.message }, 500);
      }
    }

    if (action === 'contact_delete') {
      try {
        await queryD1(env, enquiriesDb(env), `DELETE FROM contact_enquiries WHERE id = ?`, [id]);
        return json({ ok: true });
      } catch (err) {
        console.error('[dashboard contact_delete]', err.message);
        return json({ error: err.message }, 500);
      }
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  }

  // ── GET ────────────────────────────────────────────────────────────────────

  const action     = sp.get('action') || '';
  const status     = sp.get('status') || '';
  const page       = sp.get('page') || '1';
  const q          = sp.get('q') || '';
  const handled    = sp.get('handled') || 'all';
  const source     = sp.get('source') || 'all';
  const q_business = sp.get('q_business') || '';
  const q_contact  = sp.get('q_contact')  || '';
  const q_trade    = sp.get('q_trade')    || '';
  const q_town     = sp.get('q_town')     || '';
  const q_campaign = sp.get('q_campaign') || '';
  const q_phone    = sp.get('q_phone')    || '';
  const q_email    = sp.get('q_email')    || '';
  const has_website   = sp.get('has_website')   || '';
  const min_rating    = sp.get('min_rating')    || '';
  const max_rating    = sp.get('max_rating')    || '';
  const emailed_filter = sp.get('emailed_filter') || '';
  const created_from   = sp.get('created_from')   || '';
  const created_to     = sp.get('created_to')     || '';

  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = 50;
  const offset   = (pageNum - 1) * pageSize;

  try {
    if (action === 'summary') {
      const CACHE_KEY = 'dashboard:summary';
      const CACHE_TTL = 300; // 5 minutes

      // Native KV binding — one read, zero D1 rows on a cache hit
      if (env.SUMMARY_CACHE) {
        const cached = await env.SUMMARY_CACHE.get(CACHE_KEY, 'json');
        if (cached) return json({ ...cached, cached: true });
      }

      const [prospectRows, enquiryRows, intakeRows, contactRows] = await Promise.all([
        queryD1(env, prospectsDb(env), `SELECT status, COUNT(*) AS count FROM prospects GROUP BY status ORDER BY count DESC`),
        queryD1(env, enquiriesDb(env), `SELECT COUNT(*) AS total, SUM(CASE WHEN handled = 1 THEN 1 ELSE 0 END) AS handled FROM landing_enquiries`),
        queryD1(env, enquiriesDb(env), `SELECT COUNT(*) AS total, SUM(CASE WHEN handled = 1 THEN 1 ELSE 0 END) AS handled FROM intake_submissions`),
        queryD1(env, enquiriesDb(env), `SELECT COUNT(*) AS total, SUM(CASE WHEN handled = 1 THEN 1 ELSE 0 END) AS handled FROM contact_enquiries`),
      ]);
      const payload = {
        ok: true,
        data:      prospectRows,
        enquiries: enquiryRows[0] || { total: 0, handled: 0 },
        intake:    intakeRows[0]  || { total: 0, handled: 0 },
        contact:   contactRows[0] || { total: 0, handled: 0 },
      };
      if (env.SUMMARY_CACHE) {
        await env.SUMMARY_CACHE.put(CACHE_KEY, JSON.stringify(payload), { expirationTtl: CACHE_TTL });
      }
      return json(payload);
    }

    if (action === 'tenant_list') {
      const { status: s, data } = await bookingAdmin(env, '/admin/tenants');
      return json(data, s);
    }

    if (action === 'tenant_get') {
      const slug = (sp.get('slug') || '').trim();
      if (!slug) return json({ ok: false, error: 'slug required' }, 400);
      const { status: s, data } = await bookingAdmin(env, `/admin/tenant/${encodeURIComponent(slug)}`);
      return json(data, s);
    }

    if (action === 'prospect_search') {
      const qr = (sp.get('q') || '').trim();
      if (!qr) return json({ ok: true, data: [], total: 0, page: pageNum, pageSize });
      const pct = `%${qr}%`;
      const searchWhere = 'business_name LIKE ? OR email_address LIKE ?';
      const campaignIdExpr = `COALESCE(
        NULLIF(TRIM(prospects.email_campaign_id), ''),
        (SELECT o.campaign_id
         FROM outbox o
         WHERE o.notion_id = prospects.notion_id
         ORDER BY o.created_at ASC, o.campaign_id ASC
         LIMIT 1)
      )`;
      const [rows, countRows] = await Promise.all([
        queryD1(env, prospectsDb(env),
          `SELECT notion_id, business_name, email_address, status, trade_category, town, contact_name,
                  ${campaignIdExpr} AS campaign_id
           FROM prospects
           WHERE ${searchWhere}
           ORDER BY business_name ASC
           LIMIT ? OFFSET ?`,
          [pct, pct, pageSize, offset]
        ),
        queryD1(env, prospectsDb(env),
          `SELECT COUNT(*) AS total FROM prospects WHERE ${searchWhere}`,
          [pct, pct]
        ),
      ]);
      return json({ ok: true, data: rows, total: countRows[0]?.total || 0, page: pageNum, pageSize });
    }

    if (action === 'list') {
      if (!status) return json({ error: 'status parameter required' }, 400);

      const inCampaign        = status === 'In Campaign';
      const withCampaignId    = inCampaign || status === 'Emailed';
      const disqualified      = status === 'Disqualified';
      const contactDetailList = ['Discovered', 'Researched', 'Qualified', 'Dedup Passed'].includes(status);
      const salvageWebsite    = status === 'Salvage - Website' || status === 'Researched with website';
      const campaignIdExpr    = `COALESCE(
        NULLIF(TRIM(prospects.email_campaign_id), ''),
        (SELECT o.campaign_id
         FROM outbox o
         WHERE o.notion_id = prospects.notion_id
         ORDER BY o.created_at ASC, o.campaign_id ASC
         LIMIT 1)
      )`;
      const campaignPriorityExpr = `(SELECT c.priority FROM campaigns c WHERE c.id = (${campaignIdExpr}))`;

      const conditions   = ['status = ?'];
      const filterParams = [status];

      if (q_business.trim()) { conditions.push('business_name LIKE ?');  filterParams.push(`%${q_business.trim()}%`); }
      if (q_contact.trim())  { conditions.push('contact_name LIKE ?');   filterParams.push(`%${q_contact.trim()}%`);  }
      if (q_trade.trim())    { conditions.push('trade_category LIKE ?'); filterParams.push(`%${q_trade.trim()}%`);    }
      if (q_town.trim())     { conditions.push('town LIKE ?');           filterParams.push(`%${q_town.trim()}%`);     }
      if (has_website === '0' || has_website === '1') {
        conditions.push('has_website = ?'); filterParams.push(Number(has_website));
      }
      if (min_rating !== '' && !isNaN(Number(min_rating))) {
        conditions.push('CAST(rating AS REAL) >= ?'); filterParams.push(Number(min_rating));
      }
      if (max_rating !== '' && !isNaN(Number(max_rating))) {
        conditions.push('CAST(rating AS REAL) <= ?'); filterParams.push(Number(max_rating));
      }
      if (emailed_filter === 'never')   { conditions.push('last_email_sent IS NULL');     }
      if (emailed_filter === 'emailed') { conditions.push('last_email_sent IS NOT NULL'); }
      if (q_campaign.trim() && withCampaignId) {
        conditions.push(`(${campaignIdExpr}) LIKE ?`);
        filterParams.push(`%${q_campaign.trim()}%`);
      }
      if (q_phone.trim()) { conditions.push('phone LIKE ?');         filterParams.push(`%${q_phone.trim()}%`); }
      if (q_email.trim()) { conditions.push('email_address LIKE ?'); filterParams.push(`%${q_email.trim()}%`); }
      if (created_from.trim()) {
        conditions.push('date(created_at) >= date(?)'); filterParams.push(created_from.trim());
      }
      if (created_to.trim()) {
        conditions.push('date(created_at) <= date(?)'); filterParams.push(created_to.trim());
      }
      if (q.trim()) {
        conditions.push('(business_name LIKE ? OR contact_name LIKE ? OR town LIKE ? OR email_address LIKE ?)');
        const pct = `%${q.trim()}%`;
        filterParams.push(pct, pct, pct, pct);
      }

      const where = conditions.map((c, i) => (i === 0 ? `WHERE ${c}` : `AND ${c}`)).join(' ');

      const sortExpr = (col) => {
        if (col === 'rating') return 'CAST(rating AS REAL)';
        if (col === 'campaign_id') return campaignIdExpr;
        if (col === 'campaign_priority') return campaignPriorityExpr;
        return col;
      };

      const SORT_COLS_ALLOWED = new Set([
        'business_name', 'contact_name', 'trade_category', 'town',
        'has_website', 'rating', 'last_email_sent', 'created_at',
        ...(withCampaignId ? ['campaign_id'] : []),
        ...(inCampaign ? ['campaign_priority'] : []),
        ...(disqualified ? ['ch_number', 'ch_status', 'company_type'] : []),
        ...(salvageWebsite ? ['website_platform', 'website_agency', 'website_url'] : []),
        ...(contactDetailList ? ['phone', 'email_address'] : []),
      ]);
      const sort1_col = sp.get('sort1_col') || '';
      const sort1_dir = sp.get('sort1_dir') || 'asc';
      const sort2_col = sp.get('sort2_col') || '';
      const sort2_dir = sp.get('sort2_dir') || 'asc';
      const sort3_col = sp.get('sort3_col') || '';
      const sort3_dir = sp.get('sort3_dir') || 'asc';
      const orderClauses = [];
      for (const [col, dir] of [[sort1_col, sort1_dir], [sort2_col, sort2_dir], [sort3_col, sort3_dir]]) {
        if (!col || !SORT_COLS_ALLOWED.has(col)) continue;
        const d = dir === 'desc' ? 'DESC' : 'ASC';
        orderClauses.push(`${sortExpr(col)} ${d}`);
      }
      const orderBy = orderClauses.length
        ? orderClauses.join(', ')
        : (status === 'Emailed'
          ? 'last_email_sent DESC NULLS LAST, business_name ASC'
          : inCampaign
          ? `${campaignPriorityExpr} DESC NULLS LAST, business_name ASC`
          : contactDetailList || disqualified
          ? 'created_at DESC NULLS LAST, business_name ASC'
          : 'business_name ASC');

      const listSelectCore = `notion_id, business_name, contact_name, trade_category, town,
                  email_address, has_website, rating, postcard_score,
                  last_email_sent, date_first_contacted, demo_url, prospect_segment,
                  created_at`;

      const listSelect = inCampaign
        ? `SELECT ${listSelectCore}, ${campaignIdExpr} AS campaign_id, ${campaignPriorityExpr} AS campaign_priority`
        : withCampaignId
        ? `SELECT ${listSelectCore}, ${campaignIdExpr} AS campaign_id`
        : disqualified
        ? `SELECT ${listSelectCore}, ch_number, ch_status, company_type`
        : salvageWebsite
        ? `SELECT ${listSelectCore}, website_platform, website_agency, website_url`
        : contactDetailList
        ? `SELECT ${listSelectCore}, phone`
        : `SELECT ${listSelectCore}`;

      const [rows, countRows] = await Promise.all([
        queryD1(env, prospectsDb(env),
          `${listSelect} FROM prospects ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
          [...filterParams, pageSize, offset]
        ),
        queryD1(env, prospectsDb(env),
          `SELECT COUNT(*) AS total FROM prospects ${where}`,
          filterParams
        ),
      ]);
      return json({ ok: true, data: rows, total: countRows[0]?.total || 0, page: pageNum, pageSize });
    }

    if (action === 'record') {
      const rid = sp.get('id');
      if (!rid) return json({ error: 'id parameter required' }, 400);
      const rows = await queryD1(env, prospectsDb(env), `SELECT * FROM prospects WHERE notion_id = ?`, [rid]);
      if (!rows.length) return json({ error: 'Record not found' }, 404);
      const [client, on_dnc_list, campaigns] = await Promise.all([
        findLinkedClient(env, 'prospect', rid),
        prospectOnDncList(env, rows[0]),
        fetchProspectCampaigns(env, rid),
      ]);
      return json({ ok: true, data: rows[0], client, on_dnc_list, campaigns });
    }

    if (action === 'submissions_list') {
      const sourceFilter = SUBMISSIONS_SOURCE_TYPES.has(source) ? source : 'all';
      const branches     = buildSubmissionsUnion(handled, q, sourceFilter);

      if (!branches.length) return json({ ok: true, data: [], total: 0, page: pageNum, pageSize });

      const unionSql    = branches.map(b => b.sql).join(' UNION ALL ');
      const unionParams = branches.flatMap(b => b.params);
      const wrapped     = `SELECT * FROM (${unionSql}) AS submissions ORDER BY created_at DESC`;

      const [rows, countRows] = await Promise.all([
        queryD1(env, enquiriesDb(env), `${wrapped} LIMIT ? OFFSET ?`, [...unionParams, pageSize, offset]),
        queryD1(env, enquiriesDb(env), `SELECT COUNT(*) AS total FROM (${unionSql}) AS submissions`, unionParams),
      ]);
      return json({ ok: true, data: rows, total: countRows[0]?.total || 0, page: pageNum, pageSize });
    }

    if (action === 'submissions_record') {
      const source_type = sp.get('source_type') || '';
      const sid = sp.get('id');
      if (!source_type || !sid) return json({ error: 'source_type and id parameters required' }, 400);
      if (!SUBMISSIONS_SOURCE_TYPES.has(source_type)) return json({ error: `Invalid source_type: ${source_type}` }, 400);
      const table = source_type === 'enquiry' ? 'landing_enquiries'
        : source_type === 'intake' ? 'intake_submissions'
        : 'contact_enquiries';
      const rows = await queryD1(env, enquiriesDb(env), `SELECT * FROM ${table} WHERE id = ?`, [sid]);
      if (!rows.length) return json({ error: 'Record not found' }, 404);
      return json({ ok: true, data: rows[0], source_type });
    }

    if (action === 'enquiries_list') {
      const hasSearch = q && q.trim().length > 0;
      const searchPct = hasSearch ? `%${q.trim()}%` : null;
      const conditions = [];
      const baseParams = [];
      if (handled === '0') { conditions.push('handled = 0'); }
      if (handled === '1') { conditions.push('handled = 1'); }
      if (hasSearch) {
        conditions.push('(full_name LIKE ? OR biz_name LIKE ? OR email LIKE ?)');
        baseParams.push(searchPct, searchPct, searchPct);
      }
      const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
      const [rows, countRows] = await Promise.all([
        queryD1(env, enquiriesDb(env),
          `SELECT id, created_at, full_name, biz_name, email, source,
                  start_option, handled, notion_status, email_status
           FROM landing_enquiries${where}
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
          [...baseParams, pageSize, offset]
        ),
        queryD1(env, enquiriesDb(env), `SELECT COUNT(*) AS total FROM landing_enquiries${where}`, baseParams),
      ]);
      return json({ ok: true, data: rows, total: countRows[0]?.total || 0, page: pageNum, pageSize });
    }

    if (action === 'enquiries_record') {
      const rid = sp.get('id');
      if (!rid) return json({ error: 'id parameter required' }, 400);
      const rows = await queryD1(env, enquiriesDb(env), `SELECT * FROM landing_enquiries WHERE id = ?`, [rid]);
      if (!rows.length) return json({ error: 'Record not found' }, 404);
      const client = await findLinkedClient(env, 'landing_enquiry', rid);
      return json({ ok: true, data: rows[0], client });
    }

    if (action === 'intake_list') {
      const hasSearch = q && q.trim().length > 0;
      const searchPct = hasSearch ? `%${q.trim()}%` : null;
      const conditions = [];
      const baseParams = [];
      if (handled === '0') { conditions.push('handled = 0'); }
      if (handled === '1') { conditions.push('handled = 1'); }
      if (hasSearch) {
        conditions.push('(business_name LIKE ? OR email LIKE ? OR trade_category LIKE ?)');
        baseParams.push(searchPct, searchPct, searchPct);
      }
      const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
      const [rows, countRows] = await Promise.all([
        queryD1(env, enquiriesDb(env),
          `SELECT id, created_at, business_name, trade_category, email, status, handled
           FROM intake_submissions${where}
           ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...baseParams, pageSize, offset]
        ),
        queryD1(env, enquiriesDb(env), `SELECT COUNT(*) AS total FROM intake_submissions${where}`, baseParams),
      ]);
      return json({ ok: true, data: rows, total: countRows[0]?.total || 0, page: pageNum, pageSize });
    }

    if (action === 'intake_record') {
      const rid = sp.get('id');
      if (!rid) return json({ error: 'id parameter required' }, 400);
      const rows = await queryD1(env, enquiriesDb(env), `SELECT * FROM intake_submissions WHERE id = ?`, [rid]);
      if (!rows.length) return json({ error: 'Record not found' }, 404);
      const client = await findLinkedClient(env, 'intake', rid);
      return json({ ok: true, data: rows[0], client });
    }

    if (action === 'contact_list') {
      const hasSearch = q && q.trim().length > 0;
      const searchPct = hasSearch ? `%${q.trim()}%` : null;
      const conditions = [];
      const baseParams = [];
      if (handled === '0') { conditions.push('handled = 0'); }
      if (handled === '1') { conditions.push('handled = 1'); }
      if (hasSearch) {
        conditions.push('(name LIKE ? OR email LIKE ? OR trade LIKE ?)');
        baseParams.push(searchPct, searchPct, searchPct);
      }
      const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
      const [rows, countRows] = await Promise.all([
        queryD1(env, enquiriesDb(env),
          `SELECT id, created_at, name, trade, email, handled
           FROM contact_enquiries${where}
           ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...baseParams, pageSize, offset]
        ),
        queryD1(env, enquiriesDb(env), `SELECT COUNT(*) AS total FROM contact_enquiries${where}`, baseParams),
      ]);
      return json({ ok: true, data: rows, total: countRows[0]?.total || 0, page: pageNum, pageSize });
    }

    if (action === 'contact_record') {
      const rid = sp.get('id');
      if (!rid) return json({ error: 'id parameter required' }, 400);
      const rows = await queryD1(env, enquiriesDb(env), `SELECT * FROM contact_enquiries WHERE id = ?`, [rid]);
      if (!rows.length) return json({ error: 'Record not found' }, 404);
      const client = await findLinkedClient(env, 'contact', rid);
      return json({ ok: true, data: rows[0], client });
    }

    if (action === 'campaigns_list') {
      const qt      = (sp.get('q_trade') || '').trim();
      const qStatus = (sp.get('q_status') || '').trim();
      const qCid    = (sp.get('q_campaign_id') || '').trim();
      const minPri  = sp.get('min_priority') || '';
      const maxPri  = sp.get('max_priority') || '';
      const progFil = sp.get('progress_filter') || '';

      await syncAllCompleteCampaigns(env);

      const conditions   = [];
      const filterParams = [];
      if (qt)    { conditions.push('c.trade LIKE ?');  filterParams.push(`%${qt}%`); }
      if (qStatus) { conditions.push('c.status = ?');  filterParams.push(qStatus.toLowerCase()); }
      if (qCid)  { conditions.push('c.id LIKE ?');     filterParams.push(`%${qCid}%`); }
      if (minPri !== '' && !isNaN(Number(minPri))) { conditions.push('c.priority >= ?'); filterParams.push(Number(minPri)); }
      if (maxPri !== '' && !isNaN(Number(maxPri))) { conditions.push('c.priority <= ?'); filterParams.push(Number(maxPri)); }
      if (progFil === 'complete') {
        conditions.push(`(SELECT COUNT(*) FROM outbox o WHERE o.campaign_id = c.id) > 0 AND (SELECT COUNT(*) FROM outbox o WHERE o.campaign_id = c.id AND o.sent = 0 AND o.skipped = 0) = 0`);
      } else if (progFil === 'in_progress') {
        conditions.push(`COALESCE(c.count_sent, 0) > 0 AND c.status != 'complete'`);
      } else if (progFil === 'not_started') {
        conditions.push(`COALESCE(c.count_sent, 0) = 0`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const CAMP_SORT_COLS = new Set([
        'trade', 'status', 'priority', 'count_replied', 'created_at',
        'count_sent', 'count_total', 'count_approved', 'id',
      ]);
      const campColExpr = (col) => {
        if (col === 'count_approved') return `(SELECT COUNT(*) FROM outbox o WHERE o.campaign_id = c.id AND o.approved = 1)`;
        if (col === 'id') return 'c.id';
        return `c.${col}`;
      };
      const sortOrder = buildSortOrder(
        parseSortParams(sp),
        CAMP_SORT_COLS,
        campColExpr,
        { pinCompleteLast: true, completeExpr: `CASE WHEN c.status = 'complete' THEN 1 ELSE 0 END` }
      );
      const orderBy = sortOrder || `CASE WHEN c.status = 'complete' THEN 1 ELSE 0 END ASC, c.priority DESC, c.created_at DESC`;

      const rows = await queryD1(env, prospectsDb(env),
        `SELECT c.id, c.trade, c.landing_page, c.created_at, c.scheduled_at, c.count_total,
                c.count_sent, c.count_replied, c.status, c.notes, c.priority,
                (SELECT COUNT(*) FROM outbox o WHERE o.campaign_id = c.id AND o.approved = 1) AS count_approved
         FROM campaigns c
         ${where}
         ORDER BY ${orderBy}`,
        filterParams
      );
      return json({ ok: true, data: rows });
    }

    if (action === 'campaigns_detail') {
      const cid = sp.get('id');
      if (!cid) return json({ error: 'id parameter required' }, 400);

      const qBiz     = (sp.get('q_business') || '').trim();
      const qCon     = (sp.get('q_contact')  || '').trim();
      const qTown2   = (sp.get('q_town')     || '').trim();
      const qStat    = (sp.get('q_status')   || '').trim();
      const emFil    = sp.get('emailed_filter') || '';

      await syncCampaignCompleteStatus(env, cid);

      const prospectConditions = ['email_campaign_id = ?'];
      const prospectParams = [cid];
      if (qBiz) { prospectConditions.push('business_name LIKE ?'); prospectParams.push(`%${qBiz}%`); }
      if (qCon) {
        prospectConditions.push('(contact_name LIKE ? OR email_address LIKE ?)');
        const pct = `%${qCon}%`;
        prospectParams.push(pct, pct);
      }
      if (qTown2) { prospectConditions.push('town LIKE ?'); prospectParams.push(`%${qTown2}%`); }
      if (qStat)  { prospectConditions.push('status = ?'); prospectParams.push(qStat); }
      if (emFil === 'never')   { prospectConditions.push('last_email_sent IS NULL'); }
      if (emFil === 'emailed') { prospectConditions.push('last_email_sent IS NOT NULL'); }

      const prospectWhere = `WHERE ${prospectConditions.join(' AND ')}`;

      const CAMP_PROSPECT_SORT_COLS = new Set([
        'business_name', 'email_address', 'town', 'status', 'last_email_sent', 'contact_count',
      ]);
      const prospectSortOrder = buildSortOrder(
        parseSortParams(sp),
        CAMP_PROSPECT_SORT_COLS,
        (col) => col === 'email_address' ? 'email_address' : col
      );
      const prospectOrderBy = prospectSortOrder || 'last_email_sent DESC NULLS LAST, business_name ASC';

      const [campaignRows, prospectRows, outboxSummary] = await Promise.all([
        queryD1(env, prospectsDb(env), `SELECT * FROM campaigns WHERE id = ?`, [cid]),
        queryD1(env, prospectsDb(env),
          `SELECT notion_id, business_name, contact_name, email_address, town, status,
                  last_email_sent, contact_count
           FROM prospects
           ${prospectWhere}
           ORDER BY ${prospectOrderBy}`,
          prospectParams
        ),
        queryD1(env, prospectsDb(env),
          `SELECT o.notion_id, o.business_name, o.email,
                  COUNT(*) AS total_emails,
                  SUM(CASE WHEN o.sent = 1 THEN 1 ELSE 0 END) AS sent_count,
                  SUM(CASE WHEN o.suppressed = 1 THEN 1 ELSE 0 END) AS suppressed_count,
                  MAX(o.suppressed) AS is_suppressed
           FROM outbox o
           WHERE o.campaign_id = ?
           GROUP BY o.notion_id, o.business_name, o.email
           ORDER BY o.business_name ASC`,
          [cid]
        ),
      ]);
      if (!campaignRows.length) return json({ error: 'Campaign not found' }, 404);
      return json({ ok: true, campaign: campaignRows[0], prospects: prospectRows, outbox_summary: outboxSummary });
    }

    if (action === 'outbox_list') {
      const cid      = sp.get('campaign_id');
      const qBiz2    = (sp.get('q_business') || '').trim();
      const qEmail2  = (sp.get('q_email')    || '').trim();
      const qSubj    = (sp.get('q_subject')  || '').trim();
      const appFil   = sp.get('approval_filter') || '';
      const sentFil  = sp.get('sent_filter')     || '';
      if (!cid) return json({ error: 'campaign_id parameter required' }, 400);

      const conditions   = ['campaign_id = ?'];
      const filterParams = [cid];
      if (qBiz2)  { conditions.push('business_name LIKE ?'); filterParams.push(`%${qBiz2}%`); }
      if (qEmail2) { conditions.push('email LIKE ?');         filterParams.push(`%${qEmail2}%`); }
      if (qSubj)  { conditions.push('subject LIKE ?');       filterParams.push(`%${qSubj}%`); }
      if (appFil === 'approved') { conditions.push('approved = 1'); }
      else if (appFil === 'pending') { conditions.push('approved = 0 AND sent = 0 AND skipped = 0'); }
      if (sentFil === 'sent') { conditions.push('sent = 1'); }
      else if (sentFil === 'unsent')  { conditions.push('sent = 0 AND skipped = 0'); }
      else if (sentFil === 'skipped') { conditions.push('skipped = 1'); }

      const where = `WHERE ${conditions.join(' AND ')}`;

      const OUTBOX_SORT_COLS = new Set([
        'business_name', 'email', 'subject', 'seq_num', 'scheduled_not_before', 'approved', 'sent',
      ]);
      const outboxSortOrder = buildSortOrder(parseSortParams(sp), OUTBOX_SORT_COLS, (col) => col);
      const orderBy = outboxSortOrder || 'notion_id ASC, seq_num ASC';

      const rows = await queryD1(env, prospectsDb(env),
        `SELECT id, notion_id, business_name, email, subject,
                substr(body, 1, 120) AS body_preview,
                created_at, scheduled_not_before,
                approved, approved_at,
                sent, sent_at, skipped, skip_reason,
                send_error, send_attempts,
                seq_num, suppressed
         FROM outbox
         ${where}
         ORDER BY ${orderBy}`,
        filterParams
      );
      return json({ ok: true, data: rows });
    }

    if (action === 'outbox_record') {
      const rid = sp.get('id');
      if (!rid) return json({ error: 'id parameter required' }, 400);
      const rows = await queryD1(env, prospectsDb(env), `SELECT * FROM outbox WHERE id = ?`, [rid]);
      if (!rows.length) return json({ error: 'Record not found' }, 404);
      return json({ ok: true, data: rows[0] });
    }

    if (action === 'client_list') {
      const stage_filter = sp.get('stage_filter') || 'active';
      const q_search     = (sp.get('q_search') || '').trim();
      const s1col = sp.get('sort1_col') || '';
      const s1dir = sp.get('sort1_dir') || 'asc';
      const s2col = sp.get('sort2_col') || '';
      const s2dir = sp.get('sort2_dir') || 'asc';

      const conditions   = [];
      const filterParams = [];

      if (stage_filter === 'active') {
        conditions.push(`c.stage != 'dropped_out'`);
      } else if (stage_filter !== 'all') {
        if (CLIENT_VALID_STAGES.includes(stage_filter)) {
          conditions.push(`c.stage = ?`); filterParams.push(stage_filter);
        }
      }

      if (q_search) {
        conditions.push(`(c.business_name LIKE ? OR c.contact_name LIKE ? OR c.email LIKE ?)`);
        const pct = `%${q_search}%`;
        filterParams.push(pct, pct, pct);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const CLIENT_SORT_COLS = new Set([
        'business_name', 'stage', 'days_in_stage', 'last_email_at',
        'created_at', 'next_action_by', 'journey',
      ]);
      const orderClauses = [];
      for (const [col, dir] of [[s1col, s1dir], [s2col, s2dir]]) {
        if (!col || !CLIENT_SORT_COLS.has(col)) continue;
        const d = dir === 'desc' ? 'DESC' : 'ASC';
        const expr =
          col === 'days_in_stage' ? `CAST((julianday('now') - julianday(c.stage_changed_at)) AS INTEGER)` :
          col === 'last_email_at' ? `(SELECT MAX(e.sent_at) FROM email_log e WHERE e.slug = c.slug)` :
          `c.${col}`;
        orderClauses.push(`${expr} ${d}`);
      }
      const orderBy = orderClauses.length ? orderClauses.join(', ') : `c.stage_changed_at ASC`;

      const [rows, countRows] = await Promise.all([
        queryD1(env, enquiriesDb(env),
          `SELECT c.slug, c.business_name, c.contact_name, c.email,
                  c.journey, c.stage, c.stage_changed_at, c.created_at,
                  c.next_action_by, c.preview_url, c.live_url,
                  CAST((julianday('now') - julianday(c.stage_changed_at)) AS INTEGER) AS days_in_stage,
                  (SELECT MAX(e.sent_at) FROM email_log e WHERE e.slug = c.slug) AS last_email_at
           FROM clients c
           ${where}
           ORDER BY ${orderBy}
           LIMIT ? OFFSET ?`,
          [...filterParams, pageSize, offset]
        ),
        queryD1(env, enquiriesDb(env), `SELECT COUNT(*) AS total FROM clients c ${where}`, filterParams),
      ]);
      return json({ ok: true, data: rows, total: countRows[0]?.total || 0, page: pageNum, pageSize });
    }

    if (action === 'client_detail') {
      const slug = sp.get('slug');
      if (!slug) return json({ error: 'slug required' }, 400);
      const [clientRows, emailLogRows, changeRequestRows] = await Promise.all([
        queryD1(env, enquiriesDb(env), `SELECT * FROM clients WHERE slug = ?`, [slug]),
        queryD1(env, enquiriesDb(env),
          `SELECT id, template, subject, body, sent_at, status, error, recipient
           FROM email_log WHERE slug = ? ORDER BY sent_at DESC LIMIT 30`,
          [slug]
        ),
        queryD1(env, enquiriesDb(env),
          `SELECT id, body, stage_at, created_at
           FROM change_requests WHERE slug = ? ORDER BY created_at DESC`,
          [slug]
        ),
      ]);
      if (!clientRows.length) return json({ error: 'Client not found' }, 404);

      const client = clientRows[0];
      let sourceRecord = null;
      let sourceError  = null;
      try {
        sourceRecord = await fetchClientSourceRecord(env, client.source_type, client.source_id);
      } catch (err) {
        sourceError = err.message;
        console.warn('[dashboard] client_detail source fetch failed:', err.message);
      }

      return json({
        ok: true,
        data: client,
        email_log: emailLogRows,
        change_requests: changeRequestRows,
        source_type: client.source_type,
        source_record: sourceRecord,
        source_error: sourceError,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (err) {
    console.error('[dashboard]', err.message);
    return json({ error: err.message }, 500);
  }
}
