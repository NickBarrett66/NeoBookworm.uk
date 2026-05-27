// Portal action handler — NeoBookworm onboarding.
//
// POST /c/:slug/action (rewritten by vercel.json)
//
// Accepts client-initiated stage transitions from the preview panel.
// The slug IS the access credential — no additional auth.
//
// Body: { action: 'approve'|'changes'|'decline', message?: string }
//
// approve  → awaiting_payment  — notifies Nick; C3 (with stripe link) sent
//                                 manually from the dashboard.
// changes  → revisions         — inserts change_requests row; sends C1 email.
// decline  → dropped_out       — sends C4 email; clears next_action_by.
//
// Guards:
//   - Only fires from preview_ready or review_delivered stages.
//   - 30-second debounce on last_action_at prevents double-submission.

'use strict';

const { queryD1, enquiriesDb } = require('./_lib/d1');
const { sendTemplated }        = require('./_lib/email');

const ACTIONABLE_STAGES = new Set(['preview_ready', 'review_delivered']);
const DEBOUNCE_SECONDS  = 30;
const PORTAL_BASE       = 'https://neobookworm.uk/c/';

function portalUrl(slug) {
  return PORTAL_BASE + encodeURIComponent(slug) + '/';
}

function addWorkingDays(n) {
  const d = new Date();
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

function formatDate(isoDate) {
  return new Date(isoDate + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London',
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).setHeader('Allow', 'POST').end('Method Not Allowed');
    return;
  }

  const slug = ((req.query.slug || '') + '').trim().toLowerCase();
  if (!slug) {
    return res.status(400).json({ ok: false, error: 'Missing slug' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON' });
  }

  const action  = (body.action  || '').trim();
  const message = (body.message || '').trim();

  if (!['approve', 'changes', 'decline'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'Invalid action' });
  }

  // ── Look up client ──
  let client;
  try {
    const rows = await queryD1(
      enquiriesDb(),
      `SELECT slug, business_name, contact_name, email, stage, preview_url,
              revision_count, last_action_at
         FROM clients WHERE slug = ? LIMIT 1`,
      [slug]
    );
    client = rows[0] || null;
  } catch (err) {
    console.error('[portal-action] D1 query failed:', err.message);
    return res.status(500).json({ ok: false, error: 'Service unavailable — please try again shortly.' });
  }

  if (!client) {
    return res.status(404).json({ ok: false, error: 'Not found' });
  }

  // ── Stage guard ──
  if (!ACTIONABLE_STAGES.has(client.stage)) {
    return res.status(409).json({
      ok: false,
      error: 'This action is not available at the current stage.',
      stage: client.stage,
    });
  }

  // ── Debounce ──
  if (client.last_action_at) {
    const lastMs = new Date(
      client.last_action_at.includes('T')
        ? client.last_action_at
        : client.last_action_at.replace(' ', 'T') + 'Z'
    ).getTime();
    if (Date.now() - lastMs < DEBOUNCE_SECONDS * 1000) {
      return res.status(409).json({
        ok: false,
        error: 'Request already received — please wait a moment before trying again.',
      });
    }
  }

  const name        = (client.contact_name || '').split(/\s+/)[0] || 'there';
  const business    = client.business_name || 'your business';
  const portal      = portalUrl(slug);
  const previewUrl  = (client.preview_url || '').trim();

  try {

    // ── Approve: go live ──────────────────────────────────────────────────────
    if (action === 'approve') {
      const nextActionBy = addWorkingDays(2);

      await queryD1(
        enquiriesDb(),
        `UPDATE clients
            SET stage            = 'awaiting_payment',
                stage_changed_at = datetime('now'),
                next_action_by   = ?,
                last_action_at   = datetime('now')
          WHERE slug = ?`,
        [nextActionBy, slug]
      );

      // Notify Nick so he can send C3 (with Stripe link) from the dashboard.
      const nodemailer  = require('nodemailer');
      const gwUser      = process.env.GW_SMTP_USER;
      const gwPass      = process.env.GW_SMTP_PASS;
      if (gwUser && gwPass) {
        const transport = nodemailer.createTransport({
          host: 'smtp.gmail.com', port: 587, secure: false,
          auth: { user: gwUser, pass: gwPass },
        });
        transport.sendMail({
          from:    `"NeoBookworm Portal" <${gwUser}>`,
          to:      gwUser,
          subject: `ACTION NEEDED: ${business} is ready to go live`,
          text:    [
            `${business} (${client.email}) has approved their preview and wants to go live.`,
            '',
            'Next step: send them the payment link (C3) from the dashboard.',
            `Dashboard: https://neobookworm.uk/dashboard`,
            `Portal: ${portal}`,
          ].join('\n'),
        }).catch(err => console.error('[portal-action] Nick notification failed:', err.message));
      }

      return res.status(200).json({ ok: true, next_stage: 'awaiting_payment' });
    }

    // ── Changes: request revisions ────────────────────────────────────────────
    if (action === 'changes') {
      if (!message) {
        return res.status(400).json({ ok: false, error: 'Please describe the changes you\'d like before sending.' });
      }
      if (message.length > 4000) {
        return res.status(400).json({ ok: false, error: 'Message too long — please keep it under 4000 characters.' });
      }

      const newRevCount  = (Number(client.revision_count) || 0) + 1;
      const deliverByIso = addWorkingDays(3);
      const deliverBy    = formatDate(deliverByIso);

      await queryD1(
        enquiriesDb(),
        `UPDATE clients
            SET stage            = 'revisions',
                stage_changed_at = datetime('now'),
                revision_count   = ?,
                next_action_by   = ?,
                last_action_at   = datetime('now')
          WHERE slug = ?`,
        [newRevCount, deliverByIso, slug]
      );

      await queryD1(
        enquiriesDb(),
        `INSERT INTO change_requests (slug, body, stage_at) VALUES (?, ?, ?)`,
        [slug, message, client.stage]
      );

      await sendTemplated({
        slug,
        templateId: 'C1',
        vars: { name, business, deliver_by: deliverBy, portal_url: portal },
        to: client.email,
      });

      return res.status(200).json({ ok: true, next_stage: 'revisions' });
    }

    // ── Decline: close it down ────────────────────────────────────────────────
    if (action === 'decline') {
      await queryD1(
        enquiriesDb(),
        `UPDATE clients
            SET stage            = 'dropped_out',
                stage_changed_at = datetime('now'),
                next_action_by   = NULL,
                last_action_at   = datetime('now')
          WHERE slug = ?`,
        [slug]
      );

      if (previewUrl) {
        await sendTemplated({
          slug,
          templateId: 'C4',
          vars: { name, business, preview_url: previewUrl },
          to: client.email,
        });
      } else {
        console.warn(`[portal-action] C4 skipped for ${slug} — no preview_url on record`);
      }

      return res.status(200).json({ ok: true, next_stage: 'dropped_out' });
    }

  } catch (err) {
    console.error('[portal-action] action failed:', err.message);
    return res.status(500).json({
      ok: false,
      error: 'Something went wrong — please try again or email nick@neobookworm.uk',
    });
  }
};
