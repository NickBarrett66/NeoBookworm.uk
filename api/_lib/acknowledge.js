// Acknowledgement helper — Session 6 of docs/neobookworm-onboarding-build-plan-v3.md.
//
// Shared by:
//   api/onboarding-intake.js  — auto-path for J1–J4 inbound enquiries
//   api/dashboard.js          — manual promote (J5, cold prospects)
//
// Dedup contract:
//   Checks email_log for a prior acknowledgement row (template LIKE '%-E1%', status='sent')
//   before sending. Second call returns { acknowledged: false, reason: 'already_acknowledged' }.
//
// deliver_by default:
//   If clients.next_action_by is empty at promotion time, calculates 5 working days
//   from now (skipping Saturday and Sunday), stores the human-readable date back into
//   the clients row, and uses it as the {deliver_by} template variable.
//
// Usage:
//   const { sendAcknowledgement } = require('./_lib/acknowledge');
//   const { acknowledged, reason, error } = await sendAcknowledgement(slug);

'use strict';

const { queryD1, enquiriesDb } = require('./d1');
const { sendTemplated }        = require('./email');

// Journey → first-acknowledgement template ID
const JOURNEY_TEMPLATE = {
  J1: 'J1-E1',
  J2: 'J2-E1',
  J3: 'J3-E1',
  J4: 'J4-E1',
  J5: 'J5-E1-quick',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate a human-readable date N working days from today.
 * Skips Saturday (6) and Sunday (0).
 * Returns e.g. "Wednesday 4 June".
 *
 * @param {number} n  - Number of working days to add (default 5)
 * @returns {string}
 */
function workingDaysFromNow(n = 5) {
  const d = new Date();
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
  });
}

/**
 * Return true if an acknowledgement has already been sent for this slug.
 * Checks email_log for any sent E1 row.
 *
 * @param {string} slug
 * @returns {Promise<boolean>}
 */
async function hasAcknowledgement(slug) {
  const rows = await queryD1(
    enquiriesDb(),
    `SELECT id FROM email_log
     WHERE slug = ? AND template LIKE '%-E1%' AND status = 'sent'
     LIMIT 1`,
    [slug]
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// sendAcknowledgement
// ---------------------------------------------------------------------------

/**
 * Send the first-contact (E1) acknowledgement for a newly promoted client.
 *
 * Idempotent: if an acknowledgement row already exists in email_log the send
 * is skipped and { acknowledged: false, reason: 'already_acknowledged' } is
 * returned.
 *
 * If the template requires {deliver_by} and clients.next_action_by is empty,
 * a default of 5 working days from now is calculated, persisted to the
 * clients row, and used.
 *
 * If the template requires {current_url} (J2, J3) and clients.current_url is
 * empty, the send is skipped with reason 'missing_current_url'. Nick must
 * send J2-E1 / J3-E1 manually from the dashboard after setting the field.
 *
 * @param {string} slug
 * @returns {Promise<{ acknowledged: boolean, reason?: string, error?: string }>}
 */
async function sendAcknowledgement(slug) {
  // Dedup check
  const already = await hasAcknowledgement(slug);
  if (already) {
    return { acknowledged: false, reason: 'already_acknowledged' };
  }

  // Read client row
  const clientRows = await queryD1(
    enquiriesDb(),
    `SELECT * FROM clients WHERE slug = ?`,
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

  const name     = client.contact_name  || client.business_name || 'there';
  const business = client.business_name || client.contact_name  || 'your business';
  const portalUrl = `https://neobookworm.uk/c/${slug}/`;

  // Build vars common to every acknowledgement
  const vars = { name, business, portal_url: portalUrl };

  // {deliver_by} — required by J1/J2/J3/J4
  if (['J1', 'J2', 'J3', 'J4'].includes(journey)) {
    let deliverBy = client.next_action_by;
    if (!deliverBy) {
      deliverBy = workingDaysFromNow(5);
      try {
        await queryD1(
          enquiriesDb(),
          `UPDATE clients SET next_action_by = ? WHERE slug = ?`,
          [deliverBy, slug]
        );
      } catch (e) {
        console.error(`[acknowledge] next_action_by update failed for ${slug}:`, e.message);
      }
    }
    vars.deliver_by = deliverBy;
  }

  // {current_url} — required by J2/J3
  if (['J2', 'J3'].includes(journey)) {
    if (!client.current_url) {
      console.warn(`[acknowledge] ${slug} journey=${journey} has no current_url — skipping send; send ${templateId} manually`);
      return { acknowledged: false, reason: 'missing_current_url' };
    }
    vars.current_url = client.current_url;
  }

  // Send
  try {
    const result = await sendTemplated({ slug, templateId, vars, to: client.email });
    if (result.ok) {
      return { acknowledged: true };
    }
    return { acknowledged: false, error: result.error };
  } catch (err) {
    console.error(`[acknowledge] sendTemplated threw for ${slug} (${templateId}):`, err.message);
    return { acknowledged: false, error: err.message };
  }
}

module.exports = { sendAcknowledgement, JOURNEY_TEMPLATE, workingDaysFromNow };
