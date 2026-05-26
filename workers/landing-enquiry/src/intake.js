/**
 * Notify api/onboarding-intake after a landing_enquiry row is saved to D1.
 *
 * Session 6 of docs/neobookworm-onboarding-build-plan-v3.md.
 *
 * Called via ctx.waitUntil() — runs entirely in background, never blocks the
 * HTTP response. The enquiry is already committed to D1 before this runs, so
 * a failure here is safe: the row is visible in the dashboard and can be
 * promoted manually.
 *
 * Required Worker secret:
 *   ONBOARDING_INTAKE_SECRET  (set via `wrangler secret put ONBOARDING_INTAKE_SECRET`)
 *
 * The Vercel function URL is hardcoded to production. If you need to test
 * against a preview deployment, set VERCEL_INTAKE_URL as an env var in
 * wrangler.toml or as a secret during local testing.
 */

const VERCEL_INTAKE_URL = 'https://neobookworm.uk/api/onboarding-intake';

/**
 * POST { source_type: 'landing_enquiry', source_id: enquiryId } to
 * api/onboarding-intake, which promotes the enquiry to a client and sends
 * the acknowledgement email.
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
    const { slug, acknowledged, reason, error } = json;

    if (acknowledged) {
      console.log(`[intake] auto-promoted + acknowledged: ${enquiryId} → slug=${slug}`);
    } else {
      console.log(`[intake] auto-promoted, not acknowledged: ${enquiryId} → slug=${slug} reason=${reason || error || 'unknown'}`);
    }
  } catch (err) {
    console.error(`[intake] fetch to onboarding-intake failed for ${enquiryId}:`, err.message);
  }
}
