// GET  /api/dashboard?action=summary
// GET  /api/dashboard?action=list&status=X&page=N&q_business=&q_contact=&q_trade=&q_town=&has_website=0|1&min_rating=&max_rating=&emailed_filter=emailed|never
// GET  /api/dashboard?action=record&id=X
// GET  /api/dashboard?action=enquiries_list&page=N&q=search&handled=0|1|all
// GET  /api/dashboard?action=enquiries_record&id=X
// GET  /api/dashboard?action=campaigns_list
// GET  /api/dashboard?action=campaigns_detail&id=<campaign_id>
// POST /api/dashboard  body: { action:"update",            id, fields:{...} }
// POST /api/dashboard  body: { action:"enquiries_update",  id, fields:{...} }
// POST /api/dashboard  body: { action:"outreach_sent",     notion_id, campaign_id }
//
// Protected by Authorization: Bearer <DASHBOARD_SECRET>
// Proxies queries to D1 via the Cloudflare REST API.
//
// Required env vars:
//   CF_API_TOKEN        — Cloudflare API token with D1:Edit permission
//   DASHBOARD_SECRET    — token callers must supply as Bearer token
// Optional:
//   CF_ACCOUNT_ID       — defaults to the NeoBookworm Cloudflare account
//   D1_PROSPECTS_ID     — defaults to neobookworm-prospects DB id
//   D1_ENQUIRIES_ID     — defaults to neobookworm-enquiries DB id

const CF_ACCOUNT_ID_DEFAULT   = '4f0a019a24cacd090cf6b3c3cf31c732';
const D1_PROSPECTS_ID_DEFAULT = '0ae32598-1680-4995-a010-96b647eacabd';
const D1_ENQUIRIES_ID_DEFAULT = '771b3047-f977-485e-9cfb-736815931998';

function prospectsDb()  { return process.env.D1_PROSPECTS_ID  || D1_PROSPECTS_ID_DEFAULT; }
function enquiriesDb()  { return process.env.D1_ENQUIRIES_ID  || D1_ENQUIRIES_ID_DEFAULT; }
function accountId()    { return process.env.CF_ACCOUNT_ID    || CF_ACCOUNT_ID_DEFAULT; }

async function queryD1(dbId, sql, params = []) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId()}/d1/database/${dbId}/query`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.CF_API_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.errors?.[0]?.message || 'D1 query failed');
  }
  return data.result[0].results;
}

const PROSPECTS_EDITABLE = [
  'status', 'notes', 'note', 'disqualify_reason', 'postcard_score',
  'do_not_contact', 'response_classification', 'demo_url', 'demo_site_name',
];

const ENQUIRIES_EDITABLE = ['handled', 'admin_notes'];
const INTAKE_EDITABLE    = ['status', 'handled', 'admin_notes'];
const CONTACT_EDITABLE   = ['handled', 'admin_notes'];

function parseBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  try { return JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : b); } catch { return null; }
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
        return res.status(200).json({ ok: true, notion_id, campaign_id });
      } catch (err) {
        console.error('[dashboard outreach_sent]', err.message);
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    if (action === 'outbox_next') {
      try {
        const rows = await queryD1(prospectsDb(),
          `SELECT o.id, o.campaign_id, o.notion_id, o.business_name,
                  o.email, o.subject, o.body
           FROM outbox o
           JOIN campaigns c ON o.campaign_id = c.id
           WHERE o.sent = 0
             AND o.skipped = 0
             AND o.approved = 1
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
           WHERE campaign_id = ? AND sent = 0 AND skipped = 0 AND approved = 0`,
          [campaign_id]);
        await queryD1(prospectsDb(),
          `UPDATE outbox SET approved = 1, approved_at = datetime('now')
           WHERE campaign_id = ? AND sent = 0 AND skipped = 0`,
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
        await Promise.all([
          queryD1(prospectsDb(),
            `UPDATE outbox SET sent = 1, sent_at = datetime('now') WHERE id = ?`,
            [id]),
          queryD1(prospectsDb(),
            `UPDATE prospects
             SET last_email_sent      = datetime('now'),
                 date_first_contacted = CASE WHEN date_first_contacted IS NULL
                                             THEN datetime('now')
                                             ELSE date_first_contacted END,
                 contact_count        = COALESCE(contact_count, 0) + 1,
                 status               = 'Emailed',
                 email_campaign_id    = (SELECT campaign_id FROM outbox WHERE id = ?)
             WHERE notion_id = (SELECT notion_id FROM outbox WHERE id = ?)`,
            [id, id]),
          queryD1(prospectsDb(),
            `UPDATE campaigns SET count_sent = count_sent + 1
             WHERE id = (SELECT campaign_id FROM outbox WHERE id = ?)`,
            [id]),
        ]);
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
        await queryD1(prospectsDb(),
          `UPDATE outbox SET skipped = 1, skip_reason = ? WHERE id = ?`,
          [body.reason || null, id]);
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
    action, status, page = '1', q = '', handled = 'all',
    q_business = '', q_contact = '', q_trade = '', q_town = '',
    has_website = '', min_rating = '', max_rating = '',
    emailed_filter = '',
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
      // Legacy global search (q) — kept for backward compatibility
      if (q.trim()) {
        conditions.push('(business_name LIKE ? OR contact_name LIKE ? OR town LIKE ? OR email_address LIKE ?)');
        const pct = `%${q.trim()}%`;
        filterParams.push(pct, pct, pct, pct);
      }

      const where = conditions.map((c, i) => (i === 0 ? `WHERE ${c}` : `AND ${c}`)).join(' ');

      const [rows, countRows] = await Promise.all([
        queryD1(prospectsDb(),
          `SELECT notion_id, business_name, contact_name, trade_category, town,
                  email_address, has_website, rating, postcard_score,
                  last_email_sent, date_first_contacted, demo_url, prospect_segment
           FROM prospects
           ${where}
           ORDER BY business_name
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
      return res.status(200).json({ ok: true, data: rows[0] });
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
      return res.status(200).json({ ok: true, data: rows[0] });
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
      return res.status(200).json({ ok: true, data: rows[0] });
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
      return res.status(200).json({ ok: true, data: rows[0] });
    }

    // ── Campaigns list ────────────────────────────────────────────────────────
    if (action === 'campaigns_list') {
      const rows = await queryD1(prospectsDb(),
        `SELECT id, trade, landing_page, created_at, scheduled_at, count_total,
                count_sent, count_replied, status, notes
         FROM campaigns
         ORDER BY created_at DESC`
      );
      return res.status(200).json({ ok: true, data: rows });
    }

    // ── Campaigns detail ──────────────────────────────────────────────────────
    if (action === 'campaigns_detail') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id parameter required' });
      const [campaignRows, prospectRows] = await Promise.all([
        queryD1(prospectsDb(), `SELECT * FROM campaigns WHERE id = ?`, [id]),
        queryD1(prospectsDb(),
          `SELECT notion_id, business_name, email_address, town, status,
                  last_email_sent, contact_count
           FROM prospects
           WHERE email_campaign_id = ?
           ORDER BY last_email_sent DESC NULLS LAST, business_name`,
          [id]
        ),
      ]);
      if (!campaignRows.length) return res.status(404).json({ error: 'Campaign not found' });
      return res.status(200).json({ ok: true, campaign: campaignRows[0], prospects: prospectRows });
    }

    // ── Outbox list ───────────────────────────────────────────────────────────
    if (action === 'outbox_list') {
      const { campaign_id: cid } = req.query;
      if (!cid) return res.status(400).json({ error: 'campaign_id parameter required' });
      const rows = await queryD1(prospectsDb(),
        `SELECT id, notion_id, business_name, email, subject,
                substr(body, 1, 120) AS body_preview,
                created_at, scheduled_not_before,
                approved, approved_at,
                sent, sent_at, skipped, skip_reason, send_error, send_attempts
         FROM outbox
         WHERE campaign_id = ?
         ORDER BY sent ASC, skipped ASC, approved DESC, created_at ASC`,
        [cid]);
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

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('[dashboard]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
