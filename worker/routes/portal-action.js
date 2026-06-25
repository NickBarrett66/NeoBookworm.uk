// Portal action handler — Worker ES module version.
// POST /c/:slug/action
// approve → awaiting_payment | changes → revisions | decline → dropped_out
// Nick notification on approve goes via the SMTP bridge (sendRendered).

import { queryD1, enquiriesDb } from '../_lib/d1.js';
import { sendTemplated, sendRendered } from '../_lib/email.js';

const ACTIONABLE_STAGES = new Set(['preview_ready', 'review_delivered']);
const DEBOUNCE_SECONDS  = 30;
const PORTAL_BASE       = 'https://neobookworm.uk/c/';

// Path regex — same as worker/index.js C_PATH_RE but we only need the slug.
const SLUG_RE = /^\/c\/([^/]+)/;

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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handle(request, env, ctx, url) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'POST' },
    });
  }

  const slugMatch = SLUG_RE.exec(url.pathname);
  const slug = slugMatch ? slugMatch[1].trim().toLowerCase() : '';
  if (!slug) return json({ ok: false, error: 'Missing slug' }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const action  = (body.action  || '').trim();
  const message = (body.message || '').trim();

  if (!['approve', 'changes', 'decline'].includes(action)) {
    return json({ ok: false, error: 'Invalid action' }, 400);
  }

  // ── Look up client ──────────────────────────────────────────────────────────
  let client;
  try {
    const rows = await queryD1(
      env,
      enquiriesDb(env),
      `SELECT slug, business_name, contact_name, email, stage, preview_url,
              revision_count, last_action_at
         FROM clients WHERE slug = ? LIMIT 1`,
      [slug]
    );
    client = rows[0] || null;
  } catch (err) {
    console.error('[portal-action] D1 query failed:', err.message);
    return json({ ok: false, error: 'Service unavailable — please try again shortly.' }, 500);
  }

  if (!client) return json({ ok: false, error: 'Not found' }, 404);

  // ── Stage guard ─────────────────────────────────────────────────────────────
  if (!ACTIONABLE_STAGES.has(client.stage)) {
    return json({
      ok: false,
      error: 'This action is not available at the current stage.',
      stage: client.stage,
    }, 409);
  }

  // ── Debounce ─────────────────────────────────────────────────────────────────
  if (client.last_action_at) {
    const lastMs = new Date(
      client.last_action_at.includes('T')
        ? client.last_action_at
        : client.last_action_at.replace(' ', 'T') + 'Z'
    ).getTime();
    if (Date.now() - lastMs < DEBOUNCE_SECONDS * 1000) {
      return json({
        ok: false,
        error: 'Request already received — please wait a moment before trying again.',
      }, 409);
    }
  }

  const name       = (client.contact_name || '').split(/\s+/)[0] || 'there';
  const business   = client.business_name || 'your business';
  const portal     = portalUrl(slug);
  const previewUrl = (client.preview_url || '').trim();

  try {

    // ── Approve ──────────────────────────────────────────────────────────────
    if (action === 'approve') {
      const nextActionBy = addWorkingDays(2);

      await queryD1(
        env,
        enquiriesDb(env),
        `UPDATE clients
            SET stage            = 'awaiting_payment',
                stage_changed_at = datetime('now'),
                next_action_by   = ?,
                last_action_at   = datetime('now')
          WHERE slug = ?`,
        [nextActionBy, slug]
      );

      // Notify Nick via the SMTP bridge.
      const gwUser = env.GW_SMTP_USER || 'nick@neobookworm.uk';
      ctx.waitUntil(
        sendRendered(env, {
          slug,
          templateId: 'manual',
          subject:    `ACTION NEEDED: ${business} is ready to go live`,
          body: [
            `${business} (${client.email}) has approved their preview and wants to go live.`,
            '',
            'Next step: send them the payment link (C3) from the dashboard.',
            `Dashboard: https://neobookworm.uk/dashboard`,
            `Portal: ${portal}`,
          ].join('\n'),
          to: gwUser,
        }).catch(err => console.error('[portal-action] Nick notification failed:', err.message))
      );

      return json({ ok: true, next_stage: 'awaiting_payment' });
    }

    // ── Changes ──────────────────────────────────────────────────────────────
    if (action === 'changes') {
      if (!message) {
        return json({ ok: false, error: 'Please describe the changes you\'d like before sending.' }, 400);
      }
      if (message.length > 4000) {
        return json({ ok: false, error: 'Message too long — please keep it under 4000 characters.' }, 400);
      }

      const newRevCount  = (Number(client.revision_count) || 0) + 1;
      const deliverByIso = addWorkingDays(3);
      const deliverBy    = formatDate(deliverByIso);

      await queryD1(
        env,
        enquiriesDb(env),
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
        env,
        enquiriesDb(env),
        `INSERT INTO change_requests (slug, body, stage_at) VALUES (?, ?, ?)`,
        [slug, message, client.stage]
      );

      await sendTemplated(env, {
        slug,
        templateId: 'C1',
        vars: { name, business, deliver_by: deliverBy, portal_url: portal },
        to: client.email,
      });

      return json({ ok: true, next_stage: 'revisions' });
    }

    // ── Decline ──────────────────────────────────────────────────────────────
    if (action === 'decline') {
      await queryD1(
        env,
        enquiriesDb(env),
        `UPDATE clients
            SET stage            = 'dropped_out',
                stage_changed_at = datetime('now'),
                next_action_by   = NULL,
                last_action_at   = datetime('now')
          WHERE slug = ?`,
        [slug]
      );

      if (previewUrl) {
        await sendTemplated(env, {
          slug,
          templateId: 'C4',
          vars: { name, business, preview_url: previewUrl },
          to: client.email,
        });
      } else {
        console.warn(`[portal-action] C4 skipped for ${slug} — no preview_url on record`);
      }

      return json({ ok: true, next_stage: 'dropped_out' });
    }

  } catch (err) {
    console.error('[portal-action] action failed:', err.message);
    return json({
      ok: false,
      error: 'Something went wrong — please try again or email nick@neobookworm.uk',
    }, 500);
  }
}
