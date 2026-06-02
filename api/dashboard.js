// Migration: add sequence support to outbox
// Run once in Cloudflare D1 console (neobookworm-prospects DB)
// ALTER TABLE outbox ADD COLUMN seq_num INTEGER NOT NULL DEFAULT 1;        -- 1, 2, or 3
// ALTER TABLE outbox ADD COLUMN suppressed INTEGER NOT NULL DEFAULT 0;     -- 1 = stop sequence for this prospect
// ALTER TABLE prospects ADD COLUMN sequence_suppressed INTEGER NOT NULL DEFAULT 0; -- mirrors suppressed state at prospect level

// GET  /api/dashboard?action=summary
// GET  /api/dashboard?action=list&status=X&page=N&q_business=&q_contact=&q_trade=&q_town=&has_website=0|1&min_rating=&max_rating=&emailed_filter=emailed|never&sort1_col=&sort1_dir=asc|desc&sort2_col=&sort2_dir=asc|desc&sort3_col=&sort3_dir=asc|desc
// GET  /api/dashboard?action=record&id=X
// GET  /api/dashboard?action=submissions_list&page=N&q=search&handled=0|1|all&source=all|enquiry|intake|contact
// GET  /api/dashboard?action=submissions_record&source_type=enquiry|intake|contact&id=X
// GET  /api/dashboard?action=enquiries_list&page=N&q=search&handled=0|1|all
// GET  /api/dashboard?action=enquiries_record&id=X
// GET  /api/dashboard?action=campaigns_list&q_trade=&q_status=&q_campaign_id=&min_priority=&max_priority=&progress_filter=not_started|in_progress|complete&sort1_col=&sort1_dir=asc|desc&sort2_col=&sort2_dir=asc|desc&sort3_col=&sort3_dir=asc|desc
// GET  /api/dashboard?action=campaigns_detail&id=<campaign_id>&q_business=&q_contact=&q_town=&q_status=&emailed_filter=emailed|never&sort1_col=&sort1_dir=asc|desc&sort2_col=&sort2_dir=asc|desc&sort3_col=&sort3_dir=asc|desc
// GET  /api/dashboard?action=outbox_list&campaign_id=<id>&q_business=&q_email=&q_subject=&approval_filter=approved|pending&sent_filter=sent|unsent|skipped&sort1_col=&sort1_dir=asc|desc&sort2_col=&sort2_dir=asc|desc&sort3_col=&sort3_dir=asc|desc
// GET  /api/dashboard?action=client_list&stage_filter=active|all|<stage>&q_search=&page=N&sort1_col=&sort1_dir=asc|desc&sort2_col=&sort2_dir=asc|desc
// GET  /api/dashboard?action=client_detail&slug=<slug>
// POST /api/dashboard  body: { action:"update",            id, fields:{...} }
// POST /api/dashboard  body: { action:"enquiries_update",  id, fields:{...} }
// POST /api/dashboard  body: { action:"outreach_sent",     notion_id, campaign_id }
// POST /api/dashboard  body: { action:"client_promote",    source_type, source_id, journey? }
// POST /api/dashboard  body: { action:"client_set_stage",  slug, stage, next_action_by? }
// POST /api/dashboard  body: { action:"client_preview",    slug, templateId, extra_vars:{...} }
// POST /api/dashboard  body: { action:"client_send",       slug, templateId, extra_vars:{...}, subject?, body? }
// POST /api/dashboard  body: { action:"client_set_fields", slug, fields:{...} }
// POST /api/dashboard  body: { action:"client_delete",     slug, confirm_slug }
//
// Protected by Authorization: Bearer <DASHBOARD_SECRET>
// Proxies queries to D1 via the Cloudflare REST API.
//
// Required env vars:
//   CF_API_TOKEN        — Cloudflare API token with D1:Edit permission
//   DASHBOARD_SECRET    — token callers must supply as Bearer token
// Optional (defaulted in api/_lib/d1.js):
//   CF_ACCOUNT_ID       — defaults to the NeoBookworm Cloudflare account
//   D1_PROSPECTS_ID     — defaults to neobookworm-prospects DB id
//   D1_ENQUIRIES_ID     — defaults to neobookworm-enquiries DB id

const { queryD1, prospectsDb, enquiriesDb } = require('./_lib/d1');
const { promoteToClient }                  = require('./_lib/promote');
const { sendTemplated, sendRendered }      = require('./_lib/email');
const { renderTemplate }                   = require('./_lib/templates');
const { sendAcknowledgement }              = require('./_lib/acknowledge');
const { resolveSiteUrl, resolveLiveSiteUrl, normalizeStoredUrl } = require('./_lib/site-url');

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

// Stage to advance to when a template is sent successfully via client_send.
// Forward-only: if the client is already at or past the target stage, no update is made.
// J1-E1 is handled in acknowledge.js; listed here too so manual resends don't downgrade.
const TEMPLATE_STAGE_ADVANCE = {
  'J1-E1': 'researching',
  'J1-E2': 'building',
  'J1-E4': 'preview_ready',
};

function parseBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  try { return JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : b); } catch { return null; }
}

/** Mark campaign complete when every outbox row is sent or skipped. */
async function syncCampaignCompleteStatus(campaignId) {
  const rows = await queryD1(prospectsDb(),
    `SELECT
       (SELECT COUNT(*) FROM outbox WHERE campaign_id = ?) AS total,
       (SELECT COUNT(*) FROM outbox WHERE campaign_id = ? AND sent = 0 AND skipped = 0) AS pending`,
    [campaignId, campaignId]
  );
  const { total, pending } = rows[0] || {};
  if (total > 0 && pending === 0) {
    await queryD1(prospectsDb(),
      `UPDATE campaigns SET status = 'complete' WHERE id = ? AND status != 'complete'`,
      [campaignId]
    );
    return true;
  }
  return false;
}

async function syncAllCompleteCampaigns() {
  await queryD1(prospectsDb(),
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

function parseSortParams(query, prefix = 'sort') {
  return [
    [query[`${prefix}1_col`], query[`${prefix}1_dir`]],
    [query[`${prefix}2_col`], query[`${prefix}2_dir`]],
    [query[`${prefix}3_col`], query[`${prefix}3_dir`]],
  ];
}

const SUBMISSIONS_SOURCE_TYPES = new Set(['enquiry', 'intake', 'contact']);

/**
 * Fetch the raw inbound row that a `clients` row was promoted from.
 *
 * `clients.source_type` is one of: 'landing_enquiry' | 'intake' | 'contact' | 'prospect'.
 * `clients.source_id` is the primary key of the row in the matching table:
 *   - landing_enquiry → landing_enquiries.id           (enquiries DB)
 *   - intake          → intake_submissions.id          (enquiries DB)
 *   - contact         → contact_enquiries.id           (enquiries DB)
 *   - prospect        → prospects.notion_id            (prospects DB — cross-database read)
 *
 * Returns the row as-is from D1 (no field renames) or null if the source row
 * has been deleted since promotion. Throws only on D1 connection errors.
 */
async function fetchClientSourceRecord(source_type, source_id) {
  if (!source_type || !source_id) return null;
  switch (source_type) {
    case 'landing_enquiry': {
      const rows = await queryD1(enquiriesDb(),
        `SELECT id, created_at, full_name, biz_name, email, start_option,
                source, details, current_url, handled, admin_notes
           FROM landing_enquiries WHERE id = ? LIMIT 1`, [source_id]);
      return rows[0] || null;
    }
    case 'intake': {
      const rows = await queryD1(enquiriesDb(),
        `SELECT * FROM intake_submissions WHERE id = ? LIMIT 1`, [source_id]);
      return rows[0] || null;
    }
    case 'contact': {
      const rows = await queryD1(enquiriesDb(),
        `SELECT * FROM contact_enquiries WHERE id = ? LIMIT 1`, [source_id]);
      return rows[0] || null;
    }
    case 'prospect': {
      const rows = await queryD1(prospectsDb(),
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

/** Linked client row for a dashboard submission / prospect (if promoted). */
async function findLinkedClient(source_type, source_id) {
  const rows = await queryD1(
    enquiriesDb(),
    `SELECT slug, journey, stage, email, business_name, contact_name
       FROM clients
      WHERE source_type = ? AND source_id = ?
      LIMIT 1`,
    [source_type, source_id]
  );
  return rows.length ? rows[0] : null;
}

/** Build UNION ALL branches for unified inbound list (no table merge). */
function buildSubmissionsUnion(handled, q, sourceFilter) {
  const hasSearch   = q && q.trim().length > 0;
  const searchPct   = hasSearch ? `%${q.trim()}%` : null;
  const includeAll  = !sourceFilter || sourceFilter === 'all';
  const branches    = [];

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const secret = process.env.DASHBOARD_SECRET;
  if (secret) {
    const auth  = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== secret) {
      return res.status(401).json({ error: 'Unauthorised' });
    }
  }

  if (!process.env.CF_API_TOKEN) {
    return res.status(500).json({ error: 'CF_API_TOKEN not configured' });
  }

  // ── POST: update a record ────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = parseBody(req);
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const { action, id, fields, notion_id, campaign_id } = body;

    if (action === 'outreach_sent') {
      if (!notion_id || typeof notion_id !== 'string')     return res.status(400).json({ ok: false, error: 'notion_id required' });
      if (!campaign_id || typeof campaign_id !== 'string') return res.status(400).json({ ok: false, error: 'campaign_id required' });
      try {
        await Promise.all([
          queryD1(prospectsDb(),
            `UPDATE prospects
             SET last_email_sent        = datetime('now'),
                 date_first_contacted   = CASE WHEN date_first_contacted IS NULL THEN datetime('now') ELSE date_first_contacted END,
                 contact_count          = COALESCE(contact_count, 0) + 1,
                 status                 = 'Emailed',
                 email_campaign_id      = ?
             WHERE notion_id = ?`,
            [campaign_id, notion_id]
          ),
          queryD1(prospectsDb(),
            `UPDATE campaigns SET count_sent = count_sent + 1 WHERE id = ?`,
            [campaign_id]
          ),
        ]);
        await syncCampaignCompleteStatus(campaign_id);
        return res.status(200).json({ ok: true, notion_id, campaign_id });
      } catch (err) {
        console.error('[dashboard outreach_sent]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'outbox_approve_prospect') {
      if (!body.notion_id || !body.campaign_id) return res.status(400).json({ ok: false, error: 'notion_id and campaign_id required' });
      try {
        await queryD1(prospectsDb(),
          `UPDATE outbox SET approved = 1, approved_at = datetime('now')
           WHERE notion_id = ? AND campaign_id = ? AND sent = 0 AND skipped = 0 AND suppressed = 0`,
          [body.notion_id, body.campaign_id]);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_approve_prospect]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'outbox_unapprove_prospect') {
      if (!body.notion_id || !body.campaign_id) return res.status(400).json({ ok: false, error: 'notion_id and campaign_id required' });
      try {
        await queryD1(prospectsDb(),
          `UPDATE outbox SET approved = 0, approved_at = NULL
           WHERE notion_id = ? AND campaign_id = ? AND sent = 0`,
          [body.notion_id, body.campaign_id]);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_unapprove_prospect]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'outbox_suppress_prospect') {
      if (!body.notion_id || !body.campaign_id) return res.status(400).json({ ok: false, error: 'notion_id and campaign_id required' });
      try {
        await Promise.all([
          queryD1(prospectsDb(),
            `UPDATE outbox SET suppressed = 1
             WHERE notion_id = ? AND campaign_id = ? AND sent = 0`,
            [body.notion_id, body.campaign_id]),
          queryD1(prospectsDb(),
            `UPDATE prospects SET sequence_suppressed = 1 WHERE notion_id = ?`,
            [body.notion_id]),
        ]);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_suppress_prospect]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'outbox_unsuppress_prospect') {
      if (!body.notion_id || !body.campaign_id) return res.status(400).json({ ok: false, error: 'notion_id and campaign_id required' });
      try {
        await Promise.all([
          queryD1(prospectsDb(),
            `UPDATE outbox SET suppressed = 0
             WHERE notion_id = ? AND campaign_id = ? AND sent = 0`,
            [body.notion_id, body.campaign_id]),
          queryD1(prospectsDb(),
            `UPDATE prospects SET sequence_suppressed = 0 WHERE notion_id = ?`,
            [body.notion_id]),
        ]);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_unsuppress_prospect]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'outbox_next') {
      try {
        const rows = await queryD1(prospectsDb(),
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
        return res.status(200).json({ ok: true, data: rows[0] || null });
      } catch (err) {
        console.error('[dashboard outbox_next]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'outbox_approve') {
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      try {
        await queryD1(prospectsDb(),
          `UPDATE outbox SET approved = 1, approved_at = datetime('now') WHERE id = ?`, [id]);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_approve]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'outbox_unapprove') {
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      try {
        await queryD1(prospectsDb(),
          `UPDATE outbox SET approved = 0, approved_at = NULL WHERE id = ? AND sent = 0`, [id]);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_unapprove]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'outbox_approve_all') {
      if (!campaign_id || typeof campaign_id !== 'string') return res.status(400).json({ ok: false, error: 'campaign_id required' });
      try {
        const countRows = await queryD1(prospectsDb(),
          `SELECT COUNT(*) AS n FROM outbox
           WHERE campaign_id = ? AND sent = 0 AND skipped = 0 AND suppressed = 0 AND approved = 0`,
          [campaign_id]);
        await queryD1(prospectsDb(),
          `UPDATE outbox SET approved = 1, approved_at = datetime('now')
           WHERE campaign_id = ? AND sent = 0 AND skipped = 0 AND suppressed = 0`,
          [campaign_id]);
        return res.status(200).json({ ok: true, approved_count: countRows[0]?.n || 0 });
      } catch (err) {
        console.error('[dashboard outbox_approve_all]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'outbox_confirm') {
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      try {
        // Fetch seq_num so we know which email in the sequence this is
        const outboxRows = await queryD1(prospectsDb(),
          `SELECT seq_num, notion_id, campaign_id FROM outbox WHERE id = ?`, [id]);
        if (!outboxRows.length) return res.status(404).json({ ok: false, error: 'Outbox row not found' });
        const seqNum = outboxRows[0].seq_num ?? 1;

        // Build the prospects UPDATE depending on which email in the sequence this is.
        // E1 (seq_num = 1): set status, date_first_contacted (if null), contact_count, last_email_sent.
        // E2/E3 (seq_num > 1): only update last_email_sent.
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

        await Promise.all([
          queryD1(prospectsDb(),
            `UPDATE outbox SET sent = 1, sent_at = datetime('now') WHERE id = ?`,
            [id]),
          queryD1(prospectsDb(), prospectsUpdate, prospectsParams),
          queryD1(prospectsDb(),
            `UPDATE campaigns SET count_sent = count_sent + 1
             WHERE id = (SELECT campaign_id FROM outbox WHERE id = ?)`,
            [id]),
        ]);
        const cid = outboxRows[0].campaign_id;
        if (cid) await syncCampaignCompleteStatus(cid);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_confirm]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'outbox_error') {
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      if (body.error === undefined) return res.status(400).json({ ok: false, error: 'error required' });
      try {
        await queryD1(prospectsDb(),
          `UPDATE outbox SET send_error = ?, send_attempts = send_attempts + 1 WHERE id = ?`,
          [body.error, id]);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_error]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'outbox_edit') {
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      const OUTBOX_EDITABLE = ['subject', 'body', 'scheduled_not_before'];
      const editFields = fields && typeof fields === 'object' ? fields : {};
      const allowed = Object.keys(editFields).filter(k => OUTBOX_EDITABLE.includes(k));
      if (!allowed.length) return res.status(400).json({ ok: false, error: 'No editable fields provided' });
      const set    = allowed.map(k => `${k} = ?`).join(', ');
      const params = [...allowed.map(k => editFields[k]), id];
      try {
        await queryD1(prospectsDb(), `UPDATE outbox SET ${set} WHERE id = ?`, params);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_edit]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'outbox_skip') {
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      try {
        const skipRows = await queryD1(prospectsDb(),
          `SELECT campaign_id FROM outbox WHERE id = ?`, [id]);
        await queryD1(prospectsDb(),
          `UPDATE outbox SET skipped = 1, skip_reason = ? WHERE id = ?`,
          [body.reason || null, id]);
        const cid = skipRows[0]?.campaign_id;
        if (cid) await syncCampaignCompleteStatus(cid);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_skip]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'outbox_unskip') {
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      try {
        await queryD1(prospectsDb(),
          `UPDATE outbox SET skipped = 0, skip_reason = NULL WHERE id = ?`, [id]);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard outbox_unskip]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'campaign_activate') {
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      try {
        await queryD1(prospectsDb(),
          `UPDATE campaigns SET status = 'active', scheduled_at = datetime('now') WHERE id = ?`, [id]);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard campaign_activate]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'campaign_pause') {
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      try {
        await queryD1(prospectsDb(),
          `UPDATE campaigns SET status = 'paused' WHERE id = ?`, [id]);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard campaign_pause]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'campaign_resume') {
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      try {
        await queryD1(prospectsDb(),
          `UPDATE campaigns SET status = 'active' WHERE id = ?`, [id]);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard campaign_resume]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'campaign_boost') {
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      if (typeof body.delta !== 'number') return res.status(400).json({ ok: false, error: 'delta (integer) required' });
      try {
        await queryD1(prospectsDb(),
          `UPDATE campaigns SET priority = MAX(-10, MIN(10, priority + ?)) WHERE id = ?`,
          [body.delta, id]);
        const rows = await queryD1(prospectsDb(),
          `SELECT priority FROM campaigns WHERE id = ?`, [id]);
        return res.status(200).json({ ok: true, new_priority: rows[0]?.priority ?? null });
      } catch (err) {
        console.error('[dashboard campaign_boost]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'outbox_populate') {
      if (!campaign_id || typeof campaign_id !== 'string') return res.status(400).json({ ok: false, error: 'campaign_id required' });
      if (!Array.isArray(body.rows) || !body.rows.length) return res.status(400).json({ ok: false, error: 'rows array required' });
      try {
        await Promise.all(body.rows.map(row => queryD1(prospectsDb(),
          `INSERT OR IGNORE INTO outbox (id, campaign_id, notion_id, business_name, email, subject, body, scheduled_not_before)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), campaign_id, row.notion_id, row.business_name, row.email, row.subject, row.body, row.scheduled_not_before || null]
        )));
        await queryD1(prospectsDb(),
          `UPDATE campaigns SET count_total = count_total + ? WHERE id = ?`,
          [body.rows.length, campaign_id]);
        return res.status(200).json({ ok: true, inserted: body.rows.length });
      } catch (err) {
        console.error('[dashboard outbox_populate]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    // ── buildClientVars — shared var-fill for preview + send ────────────────
    function buildClientVars(client) {
      const vars = {};
      vars.name       = client.contact_name  || client.business_name || 'there';
      vars.business   = client.business_name || client.contact_name  || 'your business';
      vars.portal_url = `https://neobookworm.uk/c/${client.slug}/`;
      if (client.preview_url)      vars.preview_url      = resolveSiteUrl(client.preview_url);
      if (client.live_url || client.domain) {
        vars.live_url = resolveLiveSiteUrl(client.live_url, client.domain);
      }
      if (client.current_url)      vars.current_url       = resolveSiteUrl(client.current_url);
      if (client.next_action_by)   vars.deliver_by        = client.next_action_by;
      if (client.domain)           vars.domain            = client.domain;
      if (client.hosting_provider) vars.hosting_provider  = client.hosting_provider;
      if (client.hosting_url)      vars.hosting_url       = client.hosting_url;
      if (client.client_email)     vars.client_email      = client.client_email;
      if (client.revision_count != null) vars.revisions_count = String(client.revision_count);
      vars.stripe_link = client.stripe_link || '[STRIPE LINK — paste into dashboard Site URLs field]';
      return vars;
    }

    // ── client_promote ─────────────────────────────────────────────────────
    if (action === 'client_promote') {
      const { source_type, source_id, journey } = body;
      if (!source_type || !source_id) {
        return res.status(400).json({ ok: false, error: 'source_type and source_id required' });
      }
      try {
        const result = await promoteToClient({ source_type, source_id, journey });

        // Send first-contact acknowledgement on first promotion.
        // Dedup is inside sendAcknowledgement (checks email_log).
        // Never let an acknowledgement failure surface as a 500 — the
        // promotion itself succeeded and the client row is in D1.
        let acknowledged = false;
        let ackReason    = null;
        let ackError     = null;

        if (result.created) {
          try {
            const ack = await sendAcknowledgement(result.slug);
            acknowledged = ack.acknowledged || false;
            ackReason    = ack.reason       || null;
            ackError     = ack.error        || null;
          } catch (ackErr) {
            console.error('[dashboard client_promote] sendAcknowledgement threw:', ackErr.message);
            ackError = ackErr.message;
          }
        }

        return res.status(200).json({
          ok: true,
          ...result,
          acknowledged,
          ack_reason: ackReason,
          ack_error:  ackError,
        });
      } catch (err) {
        console.error('[dashboard client_promote]', err.message);
        return res.status(400).json({ ok: false, error: err.message });
      }
    }

    // ── client_set_stage ────────────────────────────────────────────────────
    if (action === 'client_set_stage') {
      const { slug, stage, next_action_by } = body;
      if (!slug || !stage) {
        return res.status(400).json({ ok: false, error: 'slug and stage required' });
      }
      if (!CLIENT_VALID_STAGES.includes(stage)) {
        return res.status(400).json({ ok: false, error: `Invalid stage: ${stage}` });
      }
      try {
        const setClause = next_action_by !== undefined
          ? `stage = ?, stage_changed_at = datetime('now'), next_action_by = ?`
          : `stage = ?, stage_changed_at = datetime('now')`;
        const params = next_action_by !== undefined
          ? [stage, next_action_by || null, slug]
          : [stage, slug];
        await queryD1(enquiriesDb(), `UPDATE clients SET ${setClause} WHERE slug = ?`, params);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard client_set_stage]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    // ── client_preview ───────────────────────────────────────────────────────
    if (action === 'client_preview') {
      const { slug, templateId, extra_vars = {} } = body;
      if (!slug || !templateId) {
        return res.status(400).json({ ok: false, error: 'slug and templateId required' });
      }
      try {
        const clientRows = await queryD1(enquiriesDb(), `SELECT * FROM clients WHERE slug = ?`, [slug]);
        if (!clientRows.length) return res.status(404).json({ ok: false, error: 'Client not found' });
        const client = clientRows[0];
        const vars = { ...buildClientVars(client), ...extra_vars };
        const { subject, body: emailBody } = renderTemplate(templateId, vars);
        return res.status(200).json({ ok: true, subject, body: emailBody });
      } catch (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }
    }

    // ── client_send ─────────────────────────────────────────────────────────
    if (action === 'client_send') {
      const { slug, templateId, extra_vars = {}, subject: subjectOverride, body: bodyOverride } = body;
      if (!slug || !templateId) {
        return res.status(400).json({ ok: false, error: 'slug and templateId required' });
      }
      try {
        const clientRows = await queryD1(enquiriesDb(), `SELECT * FROM clients WHERE slug = ?`, [slug]);
        if (!clientRows.length) return res.status(404).json({ ok: false, error: 'Client not found' });
        const client = clientRows[0];

        let result;
        if (subjectOverride && bodyOverride) {
          // Caller has already rendered (and possibly edited) — send as-is.
          result = await sendRendered({ slug, templateId, subject: subjectOverride, body: bodyOverride, to: client.email });
        } else {
          const vars = { ...buildClientVars(client), ...extra_vars };
          result = await sendTemplated({ slug, templateId, vars, to: client.email });
        }

        let stageAdvanced = null;
        if (result.ok) {
          const nextStage = TEMPLATE_STAGE_ADVANCE[templateId];
          if (nextStage) {
            const currentRank = CLIENT_VALID_STAGES.indexOf(client.stage);
            const nextRank    = CLIENT_VALID_STAGES.indexOf(nextStage);
            if (nextRank > currentRank) {
              try {
                await queryD1(
                  enquiriesDb(),
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

        return res.status(200).json({ ok: result.ok, error: result.error || null, stage_advanced: stageAdvanced });
      } catch (err) {
        console.error('[dashboard client_send]', err.message);
        return res.status(400).json({ ok: false, error: err.message });
      }
    }

    // ── client_audit_run ────────────────────────────────────────────────────
    if (action === 'client_audit_run') {
      const { slug, dry_run = false, test_mode = false } = body;
      if (!slug) return res.status(400).json({ ok: false, error: 'slug required' });
      try {
        const { runSiteAudit } = require('./_lib/audit');
        const result = await runSiteAudit(slug, { dryRun: Boolean(dry_run), testMode: Boolean(test_mode) });
        return res.status(result.ok ? 200 : 400).json(result);
      } catch (err) {
        console.error('[dashboard client_audit_run]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    // ── client_set_fields ───────────────────────────────────────────────────
    if (action === 'client_set_fields') {
      const { slug, fields } = body;
      if (!slug || !fields || typeof fields !== 'object') {
        return res.status(400).json({ ok: false, error: 'slug and fields object required' });
      }
      const allowed = Object.keys(fields).filter(k => CLIENTS_EDITABLE.includes(k));
      if (!allowed.length) {
        return res.status(400).json({ ok: false, error: 'No editable fields provided' });
      }
      const URL_FIELDS = new Set(['preview_url', 'live_url', 'current_url']);
      const set    = allowed.map(k => `${k} = ?`).join(', ');
      const params = [...allowed.map(k => {
        const val = fields[k] || null;
        return URL_FIELDS.has(k) ? normalizeStoredUrl(val) : val;
      }), slug];
      try {
        await queryD1(enquiriesDb(), `UPDATE clients SET ${set} WHERE slug = ?`, params);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard client_set_fields]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    // ── client_delete ───────────────────────────────────────────────────────
    if (action === 'client_delete') {
      const { slug, confirm_slug } = body;
      if (!slug) {
        return res.status(400).json({ ok: false, error: 'slug required' });
      }
      if (!confirm_slug || confirm_slug !== slug) {
        return res.status(400).json({ ok: false, error: 'confirm_slug must match slug' });
      }
      const existing = await queryD1(
        enquiriesDb(),
        'SELECT slug FROM clients WHERE slug = ? LIMIT 1',
        [slug]
      );
      if (!existing.length) {
        return res.status(404).json({ ok: false, error: 'Client not found' });
      }
      try {
        await queryD1(enquiriesDb(), 'DELETE FROM change_requests WHERE slug = ?', [slug]);
        await queryD1(enquiriesDb(), 'DELETE FROM email_log WHERE slug = ?', [slug]);
        await queryD1(enquiriesDb(), 'DELETE FROM feedback WHERE slug = ?', [slug]);
        await queryD1(enquiriesDb(), 'DELETE FROM clients WHERE slug = ?', [slug]);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard client_delete]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    // ── Delete a single email_log row ─────────────────────────────────────────
    if (action === 'email_log_delete') {
      const { id, slug } = req.body || {};
      if (!id || !slug) return res.status(400).json({ ok: false, error: 'id and slug required' });
      // Verify the row belongs to this slug before deleting (prevents cross-client deletion).
      const existing = await queryD1(
        enquiriesDb(),
        'SELECT id FROM email_log WHERE id = ? AND slug = ? LIMIT 1',
        [id, slug]
      );
      if (!existing.length) return res.status(404).json({ ok: false, error: 'Email log row not found' });
      await queryD1(enquiriesDb(), 'DELETE FROM email_log WHERE id = ? AND slug = ?', [id, slug]);
      return res.status(200).json({ ok: true });
    }

    if (!id) return res.status(400).json({ error: 'id required' });
    const isDelete = action && action.endsWith('_delete');
    if (!fields && !isDelete) return res.status(400).json({ error: 'fields object required' });

    if (action === 'update') {
      const allowed = Object.keys(fields).filter(k => PROSPECTS_EDITABLE.includes(k));
      if (!allowed.length) return res.status(400).json({ error: 'No editable fields provided' });
      const set    = allowed.map(k => `${k} = ?`).join(', ');
      const params = [...allowed.map(k => fields[k]), id];
      try {
        await queryD1(prospectsDb(), `UPDATE prospects SET ${set} WHERE notion_id = ?`, params);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard update]', err.message);
        return res.status(500).json({ error: err.message });
      }
    }

    if (action === 'enquiries_update') {
      const allowed = Object.keys(fields).filter(k => ENQUIRIES_EDITABLE.includes(k));
      if (!allowed.length) return res.status(400).json({ error: 'No editable fields provided' });
      const set    = allowed.map(k => `${k} = ?`).join(', ');
      const params = [...allowed.map(k => fields[k]), id];
      try {
        await queryD1(enquiriesDb(), `UPDATE landing_enquiries SET ${set} WHERE id = ?`, params);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard enquiries_update]', err.message);
        return res.status(500).json({ error: err.message });
      }
    }

    if (action === 'intake_update') {
      const allowed = Object.keys(fields).filter(k => INTAKE_EDITABLE.includes(k));
      if (!allowed.length) return res.status(400).json({ error: 'No editable fields provided' });
      const set    = allowed.map(k => `${k} = ?`).join(', ');
      const params = [...allowed.map(k => fields[k]), id];
      try {
        await queryD1(enquiriesDb(), `UPDATE intake_submissions SET ${set} WHERE id = ?`, params);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard intake_update]', err.message);
        return res.status(500).json({ error: err.message });
      }
    }

    if (action === 'contact_update') {
      const allowed = Object.keys(fields).filter(k => CONTACT_EDITABLE.includes(k));
      if (!allowed.length) return res.status(400).json({ error: 'No editable fields provided' });
      const set    = allowed.map(k => `${k} = ?`).join(', ');
      const params = [...allowed.map(k => fields[k]), id];
      try {
        await queryD1(enquiriesDb(), `UPDATE contact_enquiries SET ${set} WHERE id = ?`, params);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard contact_update]', err.message);
        return res.status(500).json({ error: err.message });
      }
    }

    if (action === 'enquiries_delete') {
      if (!id) return res.status(400).json({ error: 'id required' });
      try {
        await queryD1(enquiriesDb(), `DELETE FROM landing_enquiries WHERE id = ?`, [id]);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard enquiries_delete]', err.message);
        return res.status(500).json({ error: err.message });
      }
    }

    if (action === 'intake_delete') {
      if (!id) return res.status(400).json({ error: 'id required' });
      try {
        await queryD1(enquiriesDb(), `DELETE FROM intake_submissions WHERE id = ?`, [id]);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard intake_delete]', err.message);
        return res.status(500).json({ error: err.message });
      }
    }

    if (action === 'contact_delete') {
      if (!id) return res.status(400).json({ error: 'id required' });
      try {
        await queryD1(enquiriesDb(), `DELETE FROM contact_enquiries WHERE id = ?`, [id]);
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[dashboard contact_delete]', err.message);
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  // ── GET ──────────────────────────────────────────────────────────────────
  const {
    action, status, page = '1', q = '', handled = 'all', source = 'all',
    q_business = '', q_contact = '', q_trade = '', q_town = '',
    q_campaign = '',
    has_website = '', min_rating = '', max_rating = '',
    emailed_filter = '',
    sort1_col = '', sort1_dir = 'asc',
    sort2_col = '', sort2_dir = 'asc',
    sort3_col = '', sort3_dir = 'asc',
  } = req.query;
  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = 50;
  const offset   = (pageNum - 1) * pageSize;

  try {
    // ── Summary: prospect counts + enquiries total ───────────────────────────
    if (action === 'summary') {
      const [prospectRows, enquiryRows, intakeRows, contactRows] = await Promise.all([
        queryD1(prospectsDb(), `SELECT status, COUNT(*) AS count FROM prospects GROUP BY status ORDER BY count DESC`),
        queryD1(enquiriesDb(), `SELECT COUNT(*) AS total, SUM(CASE WHEN handled = 1 THEN 1 ELSE 0 END) AS handled FROM landing_enquiries`),
        queryD1(enquiriesDb(), `SELECT COUNT(*) AS total, SUM(CASE WHEN handled = 1 THEN 1 ELSE 0 END) AS handled FROM intake_submissions`),
        queryD1(enquiriesDb(), `SELECT COUNT(*) AS total, SUM(CASE WHEN handled = 1 THEN 1 ELSE 0 END) AS handled FROM contact_enquiries`),
      ]);
      return res.status(200).json({
        ok: true,
        data:     prospectRows,
        enquiries: enquiryRows[0] || { total: 0, handled: 0 },
        intake:    intakeRows[0]  || { total: 0, handled: 0 },
        contact:   contactRows[0] || { total: 0, handled: 0 },
      });
    }

    // ── Prospects list ───────────────────────────────────────────────────────
    if (action === 'list') {
      if (!status) return res.status(400).json({ error: 'status parameter required' });

      const inCampaign = status === 'In Campaign';
      const withCampaignId = inCampaign || status === 'Emailed';
      const disqualified = status === 'Disqualified';
      const salvageWebsite =
        status === 'Salvage - Website' || status === 'Researched with website';
      const campaignIdExpr = `COALESCE(
        NULLIF(TRIM(prospects.email_campaign_id), ''),
        (SELECT o.campaign_id
         FROM outbox o
         WHERE o.notion_id = prospects.notion_id
         ORDER BY o.created_at ASC, o.campaign_id ASC
         LIMIT 1)
      )`;
      const campaignPriorityExpr = `(SELECT c.priority FROM campaigns c WHERE c.id = (${campaignIdExpr}))`;

      const conditions = ['status = ?'];
      const filterParams = [status];

      // Per-column filters
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
      // Legacy global search (q) — kept for backward compatibility
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
        'has_website', 'rating', 'last_email_sent',
        ...(withCampaignId ? ['campaign_id'] : []),
        ...(inCampaign ? ['campaign_priority'] : []),
        ...(disqualified ? ['ch_number', 'ch_status', 'company_type'] : []),
        ...(salvageWebsite ? ['website_platform', 'website_agency', 'website_url'] : []),
      ]);
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
          : 'business_name ASC');

      const listSelect = inCampaign
        ? `SELECT notion_id, business_name, contact_name, trade_category, town,
                  email_address, has_website, rating, postcard_score,
                  last_email_sent, date_first_contacted, demo_url, prospect_segment,
                  ${campaignIdExpr} AS campaign_id,
                  ${campaignPriorityExpr} AS campaign_priority`
        : withCampaignId
        ? `SELECT notion_id, business_name, contact_name, trade_category, town,
                  email_address, has_website, rating, postcard_score,
                  last_email_sent, date_first_contacted, demo_url, prospect_segment,
                  ${campaignIdExpr} AS campaign_id`
        : disqualified
        ? `SELECT notion_id, business_name, contact_name, trade_category, town,
                  email_address, has_website, rating, postcard_score,
                  last_email_sent, date_first_contacted, demo_url, prospect_segment,
                  ch_number, ch_status, company_type`
        : salvageWebsite
        ? `SELECT notion_id, business_name, contact_name, trade_category, town,
                  email_address, has_website, rating, postcard_score,
                  last_email_sent, date_first_contacted, demo_url, prospect_segment,
                  website_platform, website_agency, website_url`
        : `SELECT notion_id, business_name, contact_name, trade_category, town,
                  email_address, has_website, rating, postcard_score,
                  last_email_sent, date_first_contacted, demo_url, prospect_segment`;

      const [rows, countRows] = await Promise.all([
        queryD1(prospectsDb(),
          `${listSelect}
           FROM prospects
           ${where}
           ORDER BY ${orderBy}
           LIMIT ? OFFSET ?`,
          [...filterParams, pageSize, offset]
        ),
        queryD1(prospectsDb(),
          `SELECT COUNT(*) AS total FROM prospects ${where}`,
          filterParams
        ),
      ]);

      return res.status(200).json({
        ok: true, data: rows,
        total: countRows[0]?.total || 0, page: pageNum, pageSize,
      });
    }

    // ── Prospects record ─────────────────────────────────────────────────────
    if (action === 'record') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id parameter required' });
      const rows = await queryD1(prospectsDb(), `SELECT * FROM prospects WHERE notion_id = ?`, [id]);
      if (!rows.length) return res.status(404).json({ error: 'Record not found' });
      const client = await findLinkedClient('prospect', id);
      return res.status(200).json({ ok: true, data: rows[0], client });
    }

    // ── Unified submissions list (landing + intake + contact) ───────────────
    if (action === 'submissions_list') {
      const sourceFilter = SUBMISSIONS_SOURCE_TYPES.has(source) ? source : 'all';
      const branches     = buildSubmissionsUnion(handled, q, sourceFilter);

      if (!branches.length) {
        return res.status(200).json({
          ok: true, data: [], total: 0, page: pageNum, pageSize,
        });
      }

      const unionSql   = branches.map(b => b.sql).join(' UNION ALL ');
      const unionParams = branches.flatMap(b => b.params);
      const wrapped    = `SELECT * FROM (${unionSql}) AS submissions ORDER BY created_at DESC`;

      const [rows, countRows] = await Promise.all([
        queryD1(enquiriesDb(),
          `${wrapped} LIMIT ? OFFSET ?`,
          [...unionParams, pageSize, offset]
        ),
        queryD1(enquiriesDb(),
          `SELECT COUNT(*) AS total FROM (${unionSql}) AS submissions`,
          unionParams
        ),
      ]);

      return res.status(200).json({
        ok: true, data: rows,
        total: countRows[0]?.total || 0, page: pageNum, pageSize,
      });
    }

    // ── Unified submission record ───────────────────────────────────────────
    if (action === 'submissions_record') {
      const { source_type, id } = req.query;
      if (!source_type || !id) {
        return res.status(400).json({ error: 'source_type and id parameters required' });
      }
      if (!SUBMISSIONS_SOURCE_TYPES.has(source_type)) {
        return res.status(400).json({ error: `Invalid source_type: ${source_type}` });
      }
      const table = source_type === 'enquiry' ? 'landing_enquiries'
        : source_type === 'intake' ? 'intake_submissions'
        : 'contact_enquiries';
      const rows = await queryD1(enquiriesDb(), `SELECT * FROM ${table} WHERE id = ?`, [id]);
      if (!rows.length) return res.status(404).json({ error: 'Record not found' });
      return res.status(200).json({ ok: true, data: rows[0], source_type });
    }

    // ── Enquiries list ───────────────────────────────────────────────────────
    if (action === 'enquiries_list') {
      const hasSearch   = q && q.trim().length > 0;
      const searchPct   = hasSearch ? `%${q.trim()}%` : null;

      const conditions = [];
      const baseParams = [];

      if (handled === '0')   { conditions.push('handled = 0'); }
      if (handled === '1')   { conditions.push('handled = 1'); }
      if (hasSearch) {
        conditions.push('(full_name LIKE ? OR biz_name LIKE ? OR email LIKE ?)');
        baseParams.push(searchPct, searchPct, searchPct);
      }

      const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';

      const [rows, countRows] = await Promise.all([
        queryD1(enquiriesDb(),
          `SELECT id, created_at, full_name, biz_name, email, source,
                  start_option, handled, notion_status, email_status
           FROM landing_enquiries${where}
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
          [...baseParams, pageSize, offset]
        ),
        queryD1(enquiriesDb(),
          `SELECT COUNT(*) AS total FROM landing_enquiries${where}`,
          baseParams
        ),
      ]);

      return res.status(200).json({
        ok: true, data: rows,
        total: countRows[0]?.total || 0, page: pageNum, pageSize,
      });
    }

    // ── Enquiries record ─────────────────────────────────────────────────────
    if (action === 'enquiries_record') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id parameter required' });
      const rows = await queryD1(enquiriesDb(), `SELECT * FROM landing_enquiries WHERE id = ?`, [id]);
      if (!rows.length) return res.status(404).json({ error: 'Record not found' });
      const client = await findLinkedClient('landing_enquiry', id);
      return res.status(200).json({ ok: true, data: rows[0], client });
    }

    // ── Intake list ───────────────────────────────────────────────────────────
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
        queryD1(enquiriesDb(),
          `SELECT id, created_at, business_name, trade_category, email, status, handled
           FROM intake_submissions${where}
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
          [...baseParams, pageSize, offset]
        ),
        queryD1(enquiriesDb(),
          `SELECT COUNT(*) AS total FROM intake_submissions${where}`,
          baseParams
        ),
      ]);
      return res.status(200).json({ ok: true, data: rows, total: countRows[0]?.total || 0, page: pageNum, pageSize });
    }

    // ── Intake record ─────────────────────────────────────────────────────────
    if (action === 'intake_record') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id parameter required' });
      const rows = await queryD1(enquiriesDb(), `SELECT * FROM intake_submissions WHERE id = ?`, [id]);
      if (!rows.length) return res.status(404).json({ error: 'Record not found' });
      const client = await findLinkedClient('intake', id);
      return res.status(200).json({ ok: true, data: rows[0], client });
    }

    // ── Contact list ──────────────────────────────────────────────────────────
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
        queryD1(enquiriesDb(),
          `SELECT id, created_at, name, trade, email, handled
           FROM contact_enquiries${where}
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
          [...baseParams, pageSize, offset]
        ),
        queryD1(enquiriesDb(),
          `SELECT COUNT(*) AS total FROM contact_enquiries${where}`,
          baseParams
        ),
      ]);
      return res.status(200).json({ ok: true, data: rows, total: countRows[0]?.total || 0, page: pageNum, pageSize });
    }

    // ── Contact record ────────────────────────────────────────────────────────
    if (action === 'contact_record') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id parameter required' });
      const rows = await queryD1(enquiriesDb(), `SELECT * FROM contact_enquiries WHERE id = ?`, [id]);
      if (!rows.length) return res.status(404).json({ error: 'Record not found' });
      const client = await findLinkedClient('contact', id);
      return res.status(200).json({ ok: true, data: rows[0], client });
    }

    // ── Campaigns list ────────────────────────────────────────────────────────
    if (action === 'campaigns_list') {
      const {
        q_trade = '', q_status = '', q_campaign_id = '',
        min_priority = '', max_priority = '', progress_filter = '',
      } = req.query;

      await syncAllCompleteCampaigns();

      const conditions = [];
      const filterParams = [];
      if (q_trade.trim()) {
        conditions.push('c.trade LIKE ?');
        filterParams.push(`%${q_trade.trim()}%`);
      }
      if (q_status.trim()) {
        conditions.push('c.status = ?');
        filterParams.push(q_status.trim().toLowerCase());
      }
      if (q_campaign_id.trim()) {
        conditions.push('c.id LIKE ?');
        filterParams.push(`%${q_campaign_id.trim()}%`);
      }
      if (min_priority !== '' && !isNaN(Number(min_priority))) {
        conditions.push('c.priority >= ?');
        filterParams.push(Number(min_priority));
      }
      if (max_priority !== '' && !isNaN(Number(max_priority))) {
        conditions.push('c.priority <= ?');
        filterParams.push(Number(max_priority));
      }
      if (progress_filter === 'complete') {
        conditions.push(`(
          SELECT COUNT(*) FROM outbox o WHERE o.campaign_id = c.id
        ) > 0 AND (
          SELECT COUNT(*) FROM outbox o WHERE o.campaign_id = c.id AND o.sent = 0 AND o.skipped = 0
        ) = 0`);
      } else if (progress_filter === 'in_progress') {
        conditions.push(`COALESCE(c.count_sent, 0) > 0 AND c.status != 'complete'`);
      } else if (progress_filter === 'not_started') {
        conditions.push(`COALESCE(c.count_sent, 0) = 0`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const CAMP_SORT_COLS = new Set([
        'trade', 'status', 'priority', 'count_replied', 'created_at',
        'count_sent', 'count_total', 'count_approved', 'id',
      ]);
      const campColExpr = (col) => {
        if (col === 'count_approved') {
          return `(SELECT COUNT(*) FROM outbox o WHERE o.campaign_id = c.id AND o.approved = 1)`;
        }
        if (col === 'id') return 'c.id';
        return `c.${col}`;
      };
      const sortOrder = buildSortOrder(
        parseSortParams(req.query),
        CAMP_SORT_COLS,
        campColExpr,
        { pinCompleteLast: true, completeExpr: `CASE WHEN c.status = 'complete' THEN 1 ELSE 0 END` }
      );
      const orderBy = sortOrder
        || `CASE WHEN c.status = 'complete' THEN 1 ELSE 0 END ASC, c.priority DESC, c.created_at DESC`;

      const rows = await queryD1(prospectsDb(),
        `SELECT c.id, c.trade, c.landing_page, c.created_at, c.scheduled_at, c.count_total,
                c.count_sent, c.count_replied, c.status, c.notes, c.priority,
                (SELECT COUNT(*) FROM outbox o WHERE o.campaign_id = c.id AND o.approved = 1) AS count_approved
         FROM campaigns c
         ${where}
         ORDER BY ${orderBy}`,
        filterParams
      );
      return res.status(200).json({ ok: true, data: rows });
    }

    // ── Campaigns detail ──────────────────────────────────────────────────────
    if (action === 'campaigns_detail') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id parameter required' });

      const {
        q_business = '', q_contact = '', q_town = '', q_status = '',
        emailed_filter = '',
      } = req.query;

      await syncCampaignCompleteStatus(id);

      const prospectConditions = ['email_campaign_id = ?'];
      const prospectParams = [id];
      if (q_business.trim()) {
        prospectConditions.push('business_name LIKE ?');
        prospectParams.push(`%${q_business.trim()}%`);
      }
      if (q_contact.trim()) {
        prospectConditions.push('(contact_name LIKE ? OR email_address LIKE ?)');
        const pct = `%${q_contact.trim()}%`;
        prospectParams.push(pct, pct);
      }
      if (q_town.trim()) {
        prospectConditions.push('town LIKE ?');
        prospectParams.push(`%${q_town.trim()}%`);
      }
      if (q_status.trim()) {
        prospectConditions.push('status = ?');
        prospectParams.push(q_status.trim());
      }
      if (emailed_filter === 'never')   { prospectConditions.push('last_email_sent IS NULL'); }
      if (emailed_filter === 'emailed') { prospectConditions.push('last_email_sent IS NOT NULL'); }

      const prospectWhere = `WHERE ${prospectConditions.join(' AND ')}`;

      const CAMP_PROSPECT_SORT_COLS = new Set([
        'business_name', 'email_address', 'town', 'status', 'last_email_sent', 'contact_count',
      ]);
      const prospectSortOrder = buildSortOrder(
        parseSortParams(req.query),
        CAMP_PROSPECT_SORT_COLS,
        (col) => col === 'email_address' ? 'email_address' : col
      );
      const prospectOrderBy = prospectSortOrder || 'last_email_sent DESC NULLS LAST, business_name ASC';

      const [campaignRows, prospectRows, outboxSummary] = await Promise.all([
        queryD1(prospectsDb(), `SELECT * FROM campaigns WHERE id = ?`, [id]),
        queryD1(prospectsDb(),
          `SELECT notion_id, business_name, contact_name, email_address, town, status,
                  last_email_sent, contact_count
           FROM prospects
           ${prospectWhere}
           ORDER BY ${prospectOrderBy}`,
          prospectParams
        ),
        queryD1(prospectsDb(),
          `SELECT o.notion_id, o.business_name, o.email,
                  COUNT(*) AS total_emails,
                  SUM(CASE WHEN o.sent = 1 THEN 1 ELSE 0 END) AS sent_count,
                  SUM(CASE WHEN o.suppressed = 1 THEN 1 ELSE 0 END) AS suppressed_count,
                  MAX(o.suppressed) AS is_suppressed
           FROM outbox o
           WHERE o.campaign_id = ?
           GROUP BY o.notion_id, o.business_name, o.email
           ORDER BY o.business_name ASC`,
          [id]
        ),
      ]);
      if (!campaignRows.length) return res.status(404).json({ error: 'Campaign not found' });
      return res.status(200).json({ ok: true, campaign: campaignRows[0], prospects: prospectRows, outbox_summary: outboxSummary });
    }

    // ── Outbox list ───────────────────────────────────────────────────────────
    if (action === 'outbox_list') {
      const {
        campaign_id: cid,
        q_business = '', q_email = '', q_subject = '',
        approval_filter = '', sent_filter = '',
      } = req.query;
      if (!cid) return res.status(400).json({ error: 'campaign_id parameter required' });

      const conditions = ['campaign_id = ?'];
      const filterParams = [cid];
      if (q_business.trim()) {
        conditions.push('business_name LIKE ?');
        filterParams.push(`%${q_business.trim()}%`);
      }
      if (q_email.trim()) {
        conditions.push('email LIKE ?');
        filterParams.push(`%${q_email.trim()}%`);
      }
      if (q_subject.trim()) {
        conditions.push('subject LIKE ?');
        filterParams.push(`%${q_subject.trim()}%`);
      }
      if (approval_filter === 'approved') {
        conditions.push('approved = 1');
      } else if (approval_filter === 'pending') {
        conditions.push('approved = 0 AND sent = 0 AND skipped = 0');
      }
      if (sent_filter === 'sent') {
        conditions.push('sent = 1');
      } else if (sent_filter === 'unsent') {
        conditions.push('sent = 0 AND skipped = 0');
      } else if (sent_filter === 'skipped') {
        conditions.push('skipped = 1');
      }

      const where = `WHERE ${conditions.join(' AND ')}`;

      const OUTBOX_SORT_COLS = new Set([
        'business_name', 'email', 'subject', 'seq_num', 'scheduled_not_before', 'approved', 'sent',
      ]);
      const outboxSortOrder = buildSortOrder(
        parseSortParams(req.query),
        OUTBOX_SORT_COLS,
        (col) => col
      );
      const orderBy = outboxSortOrder || 'notion_id ASC, seq_num ASC';

      const rows = await queryD1(prospectsDb(),
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
      return res.status(200).json({ ok: true, data: rows });
    }

    // ── Outbox record ─────────────────────────────────────────────────────────
    if (action === 'outbox_record') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id parameter required' });
      const rows = await queryD1(prospectsDb(), `SELECT * FROM outbox WHERE id = ?`, [id]);
      if (!rows.length) return res.status(404).json({ error: 'Record not found' });
      return res.status(200).json({ ok: true, data: rows[0] });
    }

    // ── Clients list ──────────────────────────────────────────────────────────
    if (action === 'client_list') {
      const {
        stage_filter = 'active',
        q_search = '',
        sort1_col = '', sort1_dir = 'asc',
        sort2_col = '', sort2_dir = 'asc',
      } = req.query;

      const conditions = [];
      const filterParams = [];

      if (stage_filter === 'active') {
        conditions.push(`c.stage != 'dropped_out'`);
      } else if (stage_filter !== 'all') {
        if (CLIENT_VALID_STAGES.includes(stage_filter)) {
          conditions.push(`c.stage = ?`);
          filterParams.push(stage_filter);
        }
      }

      if (q_search.trim()) {
        conditions.push(`(c.business_name LIKE ? OR c.contact_name LIKE ? OR c.email LIKE ?)`);
        const pct = `%${q_search.trim()}%`;
        filterParams.push(pct, pct, pct);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const CLIENT_SORT_COLS = new Set([
        'business_name', 'stage', 'days_in_stage', 'last_email_at',
        'created_at', 'next_action_by', 'journey',
      ]);
      const orderClauses = [];
      for (const [col, dir] of [[sort1_col, sort1_dir], [sort2_col, sort2_dir]]) {
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
        queryD1(enquiriesDb(),
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
        queryD1(enquiriesDb(),
          `SELECT COUNT(*) AS total FROM clients c ${where}`,
          filterParams
        ),
      ]);

      return res.status(200).json({
        ok: true, data: rows,
        total: countRows[0]?.total || 0, page: pageNum, pageSize,
      });
    }

    // ── Client detail ─────────────────────────────────────────────────────────
    if (action === 'client_detail') {
      const { slug } = req.query;
      if (!slug) return res.status(400).json({ error: 'slug required' });
      const [clientRows, emailLogRows, changeRequestRows] = await Promise.all([
        queryD1(enquiriesDb(), `SELECT * FROM clients WHERE slug = ?`, [slug]),
        queryD1(enquiriesDb(),
          `SELECT id, template, subject, body, sent_at, status, error, recipient
           FROM email_log WHERE slug = ? ORDER BY sent_at DESC LIMIT 30`,
          [slug]
        ),
        queryD1(enquiriesDb(),
          `SELECT id, body, stage_at, created_at
           FROM change_requests WHERE slug = ? ORDER BY created_at DESC`,
          [slug]
        ),
      ]);
      if (!clientRows.length) return res.status(404).json({ error: 'Client not found' });

      const client = clientRows[0];
      let sourceRecord = null;
      let sourceError  = null;
      try {
        sourceRecord = await fetchClientSourceRecord(client.source_type, client.source_id);
      } catch (err) {
        // Source row may have been deleted by the operator after promotion —
        // don't fail the whole detail load.
        sourceError = err.message;
        console.warn('[dashboard] client_detail source fetch failed:', err.message);
      }

      return res.status(200).json({
        ok: true,
        data: client,
        email_log: emailLogRows,
        change_requests: changeRequestRows,
        source_type: client.source_type,
        source_record: sourceRecord,
        source_error: sourceError,
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('[dashboard]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
