// GET  /api/dashboard?action=summary
// GET  /api/dashboard?action=list&status=X&page=N&q=search
// GET  /api/dashboard?action=record&id=X
// GET  /api/dashboard?action=enquiries_list&page=N&q=search&handled=0|1|all
// GET  /api/dashboard?action=enquiries_record&id=X
// GET  /api/dashboard?action=campaigns_list
// GET  /api/dashboard?action=campaigns_detail&id=<campaign_id>
// POST /api/dashboard  body: { action:"update",            id, fields:{...} }
// POST /api/dashboard  body: { action:"enquiries_update",  id, fields:{...} }
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

    const { action, id, fields } = body;
    if (!id)     return res.status(400).json({ error: 'id required' });
    if (!fields) return res.status(400).json({ error: 'fields object required' });

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

    return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  // ── GET ──────────────────────────────────────────────────────────────────
  const { action, status, page = '1', q = '', handled = 'all' } = req.query;
  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = 50;
  const offset   = (pageNum - 1) * pageSize;

  try {
    // ── Summary: prospect counts + enquiries total ───────────────────────────
    if (action === 'summary') {
      const [prospectRows, enquiryRows] = await Promise.all([
        queryD1(prospectsDb(), `SELECT status, COUNT(*) AS count FROM prospects GROUP BY status ORDER BY count DESC`),
        queryD1(enquiriesDb(), `SELECT COUNT(*) AS total, SUM(CASE WHEN handled = 1 THEN 1 ELSE 0 END) AS handled FROM landing_enquiries`),
      ]);
      return res.status(200).json({
        ok: true,
        data: prospectRows,
        enquiries: enquiryRows[0] || { total: 0, handled: 0 },
      });
    }

    // ── Prospects list ───────────────────────────────────────────────────────
    if (action === 'list') {
      if (!status) return res.status(400).json({ error: 'status parameter required' });

      const hasSearch   = q && q.trim().length > 0;
      const searchPct   = hasSearch ? `%${q.trim()}%` : null;
      const searchWhere = hasSearch
        ? ` AND (business_name LIKE ? OR contact_name LIKE ? OR town LIKE ? OR email_address LIKE ?)`
        : '';
      const listParams  = hasSearch
        ? [status, searchPct, searchPct, searchPct, searchPct, pageSize, offset]
        : [status, pageSize, offset];
      const countParams = hasSearch
        ? [status, searchPct, searchPct, searchPct, searchPct]
        : [status];

      const [rows, countRows] = await Promise.all([
        queryD1(prospectsDb(),
          `SELECT notion_id, business_name, contact_name, trade_category, town,
                  email_address, has_website, rating, postcard_score,
                  last_email_sent, date_first_contacted, demo_url, prospect_segment
           FROM prospects
           WHERE status = ?${searchWhere}
           ORDER BY business_name
           LIMIT ? OFFSET ?`,
          listParams
        ),
        queryD1(prospectsDb(),
          `SELECT COUNT(*) AS total FROM prospects WHERE status = ?${searchWhere}`,
          countParams
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

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('[dashboard]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
