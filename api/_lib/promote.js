// Promote an inbound enquiry / submission / contact / cold-prospect row
// into a `clients` row in neobookworm-enquiries.
//
// Added in Session 1 of docs/neobookworm-onboarding-build-plan-v3.md.
//
// Idempotency contract:
//   - calling promoteToClient twice for the same (source_type, source_id)
//     returns the same slug and never inserts a second clients row;
//   - the unique index idx_clients_source backstops the in-process check
//     against a true race (e.g. the landing-enquiry Worker firing two
//     concurrent POSTs to api/onboarding-intake for the same payload).
//
// Journey derivation (decision #2 in Session 1):
//   landing_enquiry  → start_option → J1 / J2 / J3
//   intake           → J4
//   contact          → J5
//   prospect         → caller MUST pass `journey` (cold prospects have no
//                      form-derived signal; the dashboard promote dialog asks
//                      the operator).
//
// Source-of-truth note:
//   `clients` lives in neobookworm-enquiries. The first three sources also
//   live there. `prospects` lives in neobookworm-prospects — the only
//   cross-database read this module performs.

const { queryD1, enquiriesDb, prospectsDb } = require('./d1');
const { generateSlug } = require('./slug');

const VALID_SOURCE_TYPES = ['landing_enquiry', 'intake', 'contact', 'prospect'];
const VALID_JOURNEYS = ['J1', 'J2', 'J3', 'J4', 'J5'];

const JOURNEY_FROM_START_OPTION = {
  leave_it_with_me: 'J1',
  tell_more:        'J1',
  review_site_first: 'J2',
  ready_to_switch:  'J3',
};

async function findExistingClient(source_type, source_id) {
  const rows = await queryD1(
    enquiriesDb(),
    'SELECT slug FROM clients WHERE source_type = ? AND source_id = ? LIMIT 1',
    [source_type, source_id]
  );
  return rows.length ? rows[0].slug : null;
}

async function fetchSourceRow(source_type, source_id) {
  switch (source_type) {
    case 'landing_enquiry': {
      const rows = await queryD1(
        enquiriesDb(),
        `SELECT id, full_name, biz_name, email, start_option, current_url
           FROM landing_enquiries
           WHERE id = ?
           LIMIT 1`,
        [source_id]
      );
      if (!rows.length) return null;
      const r = rows[0];
      return {
        business_name: r.biz_name || null,
        contact_name:  r.full_name || null,
        email:         r.email || null,
        current_url:   r.current_url || null,
        derived_journey: JOURNEY_FROM_START_OPTION[r.start_option] || null,
      };
    }

    case 'intake': {
      const rows = await queryD1(
        enquiriesDb(),
        `SELECT id, business_name, full_name, email
           FROM intake_submissions
           WHERE id = ?
           LIMIT 1`,
        [source_id]
      );
      if (!rows.length) return null;
      const r = rows[0];
      return {
        business_name: r.business_name || null,
        contact_name:  r.full_name || null,
        email:         r.email || null,
        current_url:   null,
        derived_journey: 'J4',
      };
    }

    case 'contact': {
      const rows = await queryD1(
        enquiriesDb(),
        `SELECT id, name, email
           FROM contact_enquiries
           WHERE id = ?
           LIMIT 1`,
        [source_id]
      );
      if (!rows.length) return null;
      const r = rows[0];
      return {
        business_name: null,
        contact_name:  r.name || null,
        email:         r.email || null,
        current_url:   null,
        derived_journey: 'J5',
      };
    }

    case 'prospect': {
      const rows = await queryD1(
        prospectsDb(),
        `SELECT notion_id, business_name, contact_name, email_address, website_url
           FROM prospects
           WHERE notion_id = ?
           LIMIT 1`,
        [source_id]
      );
      if (!rows.length) return null;
      const r = rows[0];
      return {
        business_name: r.business_name || null,
        contact_name:  r.contact_name || null,
        email:         r.email_address || null,
        current_url:   r.website_url || null,
        derived_journey: null,
      };
    }

    default:
      throw new Error(`Unknown source_type: ${source_type}`);
  }
}

// promoteToClient({ source_type, source_id, journey? })
//   → { slug, created }
//
// Idempotent. If a clients row already exists for (source_type, source_id)
// the existing slug is returned with created=false. Otherwise a slug is
// generated, the row is inserted, and { slug, created: true } is returned.
//
// Throws (callers should treat these as 4xx for the inbound API):
//   - unknown source_type
//   - source row not found
//   - source row has no email (we refuse to create a portal we can't email)
//   - journey is missing for a cold prospect, or is not in J1..J5
async function promoteToClient({ source_type, source_id, journey } = {}) {
  if (!VALID_SOURCE_TYPES.includes(source_type)) {
    throw new Error(`Invalid source_type: ${source_type}`);
  }
  if (!source_id || typeof source_id !== 'string') {
    throw new Error('source_id is required');
  }

  const existing = await findExistingClient(source_type, source_id);
  if (existing) {
    return { slug: existing, created: false };
  }

  const source = await fetchSourceRow(source_type, source_id);
  if (!source) {
    throw new Error(`Source row not found: ${source_type}/${source_id}`);
  }
  if (!source.email) {
    throw new Error(
      `Source row has no email — refusing to promote ${source_type}/${source_id}`
    );
  }

  const finalJourney = journey || source.derived_journey;
  if (!finalJourney) {
    throw new Error(
      `Journey could not be derived for source_type=${source_type}; ` +
      `caller must supply { journey } (J1..J5)`
    );
  }
  if (!VALID_JOURNEYS.includes(finalJourney)) {
    throw new Error(`Invalid journey: ${finalJourney}`);
  }

  const slug = await generateSlug(source.business_name, source.contact_name);

  try {
    await queryD1(
      enquiriesDb(),
      `INSERT INTO clients
         (slug, source_type, source_id, business_name, contact_name, email, journey, current_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        slug,
        source_type,
        source_id,
        source.business_name,
        source.contact_name,
        source.email,
        finalJourney,
        source.current_url,
      ]
    );
  } catch (err) {
    // Race: another promote call inserted between our existing-check and
    // our INSERT. The unique index idx_clients_source catches it. Re-read
    // and return the winner's slug so the caller still sees idempotency.
    const winner = await findExistingClient(source_type, source_id);
    if (winner) {
      return { slug: winner, created: false };
    }
    throw err;
  }

  return { slug, created: true, journey: finalJourney };
}

module.exports = {
  promoteToClient,
  JOURNEY_FROM_START_OPTION,
  VALID_SOURCE_TYPES,
  VALID_JOURNEYS,
};
