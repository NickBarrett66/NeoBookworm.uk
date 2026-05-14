// GET /api/dashboard?action=summary
// GET /api/dashboard?action=list&status=X&page=N&q=search
// GET /api/dashboard?action=record&id=X
//
// Protected by Authorization: Bearer <DASHBOARD_SECRET>
// Proxies queries to D1 via the Cloudflare REST API.
//
// Required env vars:
//   CF_API_TOKEN       — Cloudflare API token with D1:Read permission
//   DASHBOARD_SECRET   — token callers must supply as Bearer token
// Optional:
//   CF_ACCOUNT_ID      — defaults to the NeoBookworm Cloudflare account
//   D1_PROSPECTS_ID    — defaults to the neobookworm-prospects DB id

const CF_ACCOUNT_ID_DEFAULT = '4f0a019a24cacd090cf6b3c3cf31c732';
const D1_DB_ID_DEFAULT      = '0ae32598-1680-4995-a010-96b647eacabd';

async function queryD1(sql, params = []) {
  const accountId = process.env.CF_ACCOUNT_ID || CF_ACCOUNT_ID_DEFAULT;
  const dbId      = process.env.D1_PROSPECTS_ID || D1_DB_ID_DEFAULT;
  const url       = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`;

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method Not Allowed' });

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

  const { action, status, page = '1', q = '' } = req.query;
  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = 50;
  const offset   = (pageNum - 1) * pageSize;

  try {
    // ── Summary: count by status ────────────────────────────────────────────
    if (action === 'summary') {
      const rows = await queryD1(
        `SELECT status, COUNT(*) AS count FROM prospects GROUP BY status ORDER BY count DESC`
      );
      return res.status(200).json({ ok: true, data: rows });
    }

    // ── List: records for a given status ────────────────────────────────────
    if (action === 'list') {
      if (!status) return res.status(400).json({ error: 'status parameter required' });

      const hasSearch  = q && q.trim().length > 0;
      const searchPct  = hasSearch ? `%${q.trim()}%` : null;
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
        queryD1(
          `SELECT notion_id, business_name, contact_name, trade_category, town,
                  email_address, has_website, rating, postcard_score,
                  last_email_sent, date_first_contacted, demo_url, prospect_segment
           FROM prospects
           WHERE status = ?${searchWhere}
           ORDER BY business_name
           LIMIT ? OFFSET ?`,
          listParams
        ),
        queryD1(
          `SELECT COUNT(*) AS total FROM prospects WHERE status = ?${searchWhere}`,
          countParams
        ),
      ]);

      return res.status(200).json({
        ok: true,
        data: rows,
        total: countRows[0]?.total || 0,
        page: pageNum,
        pageSize,
      });
    }

    // ── Record: full single record ───────────────────────────────────────────
    if (action === 'record') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id parameter required' });

      const rows = await queryD1(
        `SELECT * FROM prospects WHERE notion_id = ?`,
        [id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Record not found' });
      return res.status(200).json({ ok: true, data: rows[0] });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('[dashboard]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
