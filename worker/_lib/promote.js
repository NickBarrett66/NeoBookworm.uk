// Client promotion helper — Worker ES module version.
// All functions take env as first argument instead of reading process.env.

import { queryD1, enquiriesDb, prospectsDb } from './d1.js';
import { generateSlug } from './slug.js';

export const VALID_SOURCE_TYPES = ['landing_enquiry', 'intake', 'contact', 'prospect'];
export const VALID_JOURNEYS     = ['J1', 'J2', 'J3', 'J4', 'J5'];

export const JOURNEY_FROM_START_OPTION = {
  leave_it_with_me:  'J1',
  tell_more:         'J1',
  review_site_first: 'J2',
  ready_to_switch:   'J3',
};

async function findExistingClient(env, source_type, source_id) {
  const rows = await queryD1(
    env,
    enquiriesDb(env),
    'SELECT slug FROM clients WHERE source_type = ? AND source_id = ? LIMIT 1',
    [source_type, source_id]
  );
  return rows.length ? rows[0].slug : null;
}

async function fetchSourceRow(env, source_type, source_id) {
  switch (source_type) {
    case 'landing_enquiry': {
      const rows = await queryD1(
        env,
        enquiriesDb(env),
        `SELECT id, full_name, biz_name, email, start_option, current_url
           FROM landing_enquiries WHERE id = ? LIMIT 1`,
        [source_id]
      );
      if (!rows.length) return null;
      const r = rows[0];
      return {
        business_name:   r.biz_name   || null,
        contact_name:    r.full_name  || null,
        email:           r.email      || null,
        current_url:     r.current_url || null,
        derived_journey: JOURNEY_FROM_START_OPTION[r.start_option] || null,
      };
    }

    case 'intake': {
      const rows = await queryD1(
        env,
        enquiriesDb(env),
        `SELECT id, business_name, full_name, email
           FROM intake_submissions WHERE id = ? LIMIT 1`,
        [source_id]
      );
      if (!rows.length) return null;
      const r = rows[0];
      return {
        business_name:   r.business_name || null,
        contact_name:    r.full_name     || null,
        email:           r.email         || null,
        current_url:     null,
        derived_journey: 'J4',
      };
    }

    case 'contact': {
      const rows = await queryD1(
        env,
        enquiriesDb(env),
        `SELECT id, name, email FROM contact_enquiries WHERE id = ? LIMIT 1`,
        [source_id]
      );
      if (!rows.length) return null;
      const r = rows[0];
      return {
        business_name:   null,
        contact_name:    r.name  || null,
        email:           r.email || null,
        current_url:     null,
        derived_journey: 'J5',
      };
    }

    case 'prospect': {
      const rows = await queryD1(
        env,
        prospectsDb(env),
        `SELECT notion_id, business_name, contact_name, email_address, website_url
           FROM prospects WHERE notion_id = ? LIMIT 1`,
        [source_id]
      );
      if (!rows.length) return null;
      const r = rows[0];
      return {
        business_name:   r.business_name  || null,
        contact_name:    r.contact_name   || null,
        email:           r.email_address  || null,
        current_url:     r.website_url    || null,
        derived_journey: null,
      };
    }

    default:
      throw new Error(`Unknown source_type: ${source_type}`);
  }
}

export async function promoteToClient(env, { source_type, source_id, journey } = {}) {
  if (!VALID_SOURCE_TYPES.includes(source_type)) {
    throw new Error(`Invalid source_type: ${source_type}`);
  }
  if (!source_id || typeof source_id !== 'string') {
    throw new Error('source_id is required');
  }

  const existing = await findExistingClient(env, source_type, source_id);
  if (existing) {
    return { slug: existing, created: false };
  }

  const source = await fetchSourceRow(env, source_type, source_id);
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

  const slug = await generateSlug(env, source.business_name, source.contact_name);

  try {
    await queryD1(
      env,
      enquiriesDb(env),
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
    // Race: another promote call inserted between check and INSERT.
    const winner = await findExistingClient(env, source_type, source_id);
    if (winner) {
      return { slug: winner, created: false };
    }
    throw err;
  }

  return { slug, created: true, journey: finalJourney };
}
