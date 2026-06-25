// Acknowledgement helper — Worker ES module version.
// All functions take env as first argument instead of reading process.env.

import { queryD1, enquiriesDb } from './d1.js';
import { sendTemplated } from './email.js';

const JOURNEY_TEMPLATE = {
  J1: 'J1-E1',
  J2: 'J2-E1',
  J3: 'J3-E1',
  J4: 'J4-E1',
  J5: 'J5-E1-quick',
};

const STAGE_AFTER_E1 = {
  J1: 'researching',
};

export function workingDaysFromNow(n = 5) {
  const d = new Date();
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

export function humanDate(isoStr) {
  const d = new Date(isoStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
  });
}

async function hasAcknowledgement(env, slug) {
  const rows = await queryD1(
    env,
    enquiriesDb(env),
    `SELECT id FROM email_log
     WHERE slug = ? AND template LIKE '%-E1%' AND status = 'sent'
     LIMIT 1`,
    [slug]
  );
  return rows.length > 0;
}

export async function sendAcknowledgement(env, slug) {
  const already = await hasAcknowledgement(env, slug);
  if (already) {
    return { acknowledged: false, reason: 'already_acknowledged' };
  }

  const clientRows = await queryD1(
    env,
    enquiriesDb(env),
    'SELECT * FROM clients WHERE slug = ?',
    [slug]
  );
  if (!clientRows.length) {
    return { acknowledged: false, reason: 'client_not_found' };
  }
  const client = clientRows[0];

  const journey    = client.journey;
  const templateId = JOURNEY_TEMPLATE[journey];
  if (!templateId) {
    return { acknowledged: false, reason: `no_template_for_journey_${journey}` };
  }

  const fullName  = (client.contact_name || '').trim();
  const name      = fullName.split(/\s+/)[0] || client.business_name || 'there';
  const business  = client.business_name || client.contact_name || 'your business';
  const portalUrl = `https://neobookworm.uk/c/${slug}/`;

  const vars = { name, business, portal_url: portalUrl };

  const DELIVER_DAYS = { J2: 1 };
  if (['J1', 'J2', 'J3', 'J4'].includes(journey)) {
    let deliverByIso = client.next_action_by;
    if (!deliverByIso) {
      deliverByIso = workingDaysFromNow(DELIVER_DAYS[journey] ?? 5);
      try {
        await queryD1(
          env,
          enquiriesDb(env),
          'UPDATE clients SET next_action_by = ? WHERE slug = ?',
          [deliverByIso, slug]
        );
      } catch (e) {
        console.error(`[acknowledge] next_action_by update failed for ${slug}:`, e.message);
      }
    }
    vars.deliver_by = humanDate(deliverByIso);
  }

  if (['J2', 'J3'].includes(journey)) {
    if (!client.current_url) {
      console.warn(`[acknowledge] ${slug} journey=${journey} has no current_url — skipping send`);
      return { acknowledged: false, reason: 'missing_current_url' };
    }
    vars.current_url = client.current_url;
  }

  try {
    const result = await sendTemplated(env, { slug, templateId, vars, to: client.email });
    if (result.ok) {
      const nextStage = STAGE_AFTER_E1[journey];
      if (nextStage && client.stage === 'acknowledged') {
        try {
          await queryD1(
            env,
            enquiriesDb(env),
            `UPDATE clients SET stage = ?, stage_changed_at = datetime('now') WHERE slug = ?`,
            [nextStage, slug]
          );
        } catch (e) {
          console.error(`[acknowledge] stage advance to ${nextStage} failed for ${slug}:`, e.message);
        }
      }
      return { acknowledged: true };
    }
    return { acknowledged: false, error: result.error };
  } catch (err) {
    console.error(`[acknowledge] sendTemplated threw for ${slug} (${templateId}):`, err.message);
    return { acknowledged: false, error: err.message };
  }
}

export { JOURNEY_TEMPLATE };
