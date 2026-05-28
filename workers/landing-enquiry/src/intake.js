/**
 * Notify api/onboarding-intake after a landing_enquiry row is saved to D1.
 * For J2 (site review) enquiries that are successfully acknowledged, also
 * triggers api/run-site-audit to queue the Claude-powered review.
 *
 * Session 6 of docs/neobookworm-onboarding-build-plan-v3.md.
 * Session 7: audit trigger added for J2.
 *
 * Called via ctx.waitUntil() — runs entirely in background, never blocks the
 * HTTP response. The enquiry is already committed to D1 before this runs, so
 * a failure here is safe: the row is visible in the dashboard and can be
 * promoted / audited manually.
 *
 * Required Worker secrets:
 *   ONBOARDING_INTAKE_SECRET  (set via `wrangler secret put ONBOARDING_INTAKE_SECRET`)
 *   — also used as the auth token for /api/run-site-audit
 */

const VERCEL_INTAKE_URL = 'https://neobookworm.uk/api/onboarding-intake';
const VERCEL_AUDIT_URL  = 'https://neobookworm.uk/api/run-site-audit';

/**
 * POST { source_type: 'landing_enquiry', source_id: enquiryId } to
 * api/onboarding-intake, which promotes the enquiry to a client and sends
 * the acknowledgement email. For J2 clients that are successfully acknowledged,
 * also fires the site audit.
 *
 * @param {{ ONBOARDING_INTAKE_SECRET?: string, VERCEL_INTAKE_URL?: string }} env
 * @param {string} enquiryId  - UUID of the landing_enquiries row
 * @returns {Promise<void>}   - Never throws; all errors logged to console.
 */
export async function notifyOnboardingIntake(env, enquiryId) {
  const secret = env.ONBOARDING_INTAKE_SECRET;

  if (!secret) {
    console.warn('[intake] ONBOARDING_INTAKE_SECRET not set — skipping auto-promote for', enquiryId);
    return;
  }

  const url = env.VERCEL_INTAKE_URL || VERCEL_INTAKE_URL;

  let slug = null;
  let journey = null;
  let acknowledged = false;

  try {
    const resp = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${secret}`,
      },
      body: JSON.stringify({
        source_type: 'landing_enquiry',
        source_id:   enquiryId,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error(`[intake] onboarding-intake returned ${resp.status} for ${enquiryId}: ${text.slice(0, 300)}`);
      return;
    }

    const json = await resp.json().catch(() => ({}));
    slug         = json.slug         || null;
    journey      = json.journey      || null;
    acknowledged = json.acknowledged || false;
    const reason = json.reason || json.error || 'unknown';

    if (acknowledged) {
      console.log(`[intake] auto-promoted + acknowledged: ${enquiryId} → slug=${slug} journey=${journey}`);
    } else {
      console.log(`[intake] auto-promoted, not acknowledged: ${enquiryId} → slug=${slug} reason=${reason}`);
    }
  } catch (err) {
    console.error(`[intake] fetch to onboarding-intake failed for ${enquiryId}:`, err.message);
    return;
  }

  // For J2 (site review) clients that were acknowledged, trigger the audit.
  // The audit runs asynchronously and takes ~10–20s (page fetch + Claude).
  // Failure here is safe — the dashboard "Re-run audit" button provides the fallback.
  if (acknowledged && journey === 'J2' && slug) {
    await triggerSiteAudit(env, slug);
  }
}

/**
 * POST { slug } to api/run-site-audit to trigger a Claude site audit.
 * Uses ONBOARDING_INTAKE_SECRET for auth (same secret, fewer Worker env vars).
 *
 * @param {{ ONBOARDING_INTAKE_SECRET?: string }} env
 * @param {string} slug
 * @returns {Promise<void>}
 */
async function triggerSiteAudit(env, slug) {
  const secret  = env.ONBOARDING_INTAKE_SECRET;
  const auditUrl = env.VERCEL_AUDIT_URL || VERCEL_AUDIT_URL;

  try {
    const resp = await fetch(auditUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${secret}`,
      },
      body: JSON.stringify({ slug }),
    });

    const json = await resp.json().catch(() => ({}));

    if (resp.ok) {
      const mode = json.test_mode ? 'TEST' : json.dry_run ? 'DRY_RUN' : 'live';
      console.log(`[intake] audit triggered for ${slug} [${mode}]`);
    } else {
      console.error(`[intake] audit request failed for ${slug}: ${json.error || resp.status}`);
    }
  } catch (err) {
    console.error(`[intake] audit fetch failed for ${slug}:`, err.message);
  }
}
