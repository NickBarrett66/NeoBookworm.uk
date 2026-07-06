export class SlotTakenError extends Error {
  constructor(message = 'Slot already taken') {
    super(message);
    this.name = 'SlotTakenError';
  }
}

function isUniqueConstraintError(err) {
  const msg = err?.message ?? String(err);
  return msg.includes('UNIQUE');
}

export async function insertBooking(db, { slug, slotStart, slotEnd, name, email, phone, note, reg, vehicleSummary, address, postcode, customAnswers }) {
  const id = crypto.randomUUID();
  const manageToken = crypto.randomUUID();
  const customAnswersJson = customAnswers && customAnswers.length ? JSON.stringify(customAnswers) : null;
  try {
    await db
      .prepare(
        `INSERT INTO bookings
           (id, slug, slot_start, slot_end, name, email, phone, note, reg, vehicle_summary, address, postcode, custom_answers, google_event_id, status, manage_token, type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'confirmed', ?, 'depot')`,
      )
      // phone column is NOT NULL (legacy schema); store '' when phone is disabled/blank.
      .bind(id, slug, slotStart, slotEnd, name, email, phone ?? '', note ?? null, reg ?? null, vehicleSummary ?? null, address ?? null, postcode ?? null, customAnswersJson, manageToken)
      .run();
    return { id, manageToken };
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new SlotTakenError();
    throw err;
  }
}

export async function insertMobileBooking(db, {
  slug, slotStart, slotEnd, name, email, phone, note, reg, vehicleSummary,
  address, postcode, band, arrivalWindow, confirmToken,
}) {
  const id = crypto.randomUUID();
  const manageToken = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO bookings
         (id, slug, slot_start, slot_end, name, email, phone, note, reg, vehicle_summary,
          address, postcode, google_event_id, status, manage_token, type, band, arrival_window, confirm_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?, 'mobile', ?, ?, ?)`,
    )
    .bind(
      id, slug, slotStart, slotEnd, name, email, phone ?? '', note ?? null,
      reg ?? null, vehicleSummary ?? null, address ?? null, postcode ?? null,
      manageToken, band ?? null, arrivalWindow ?? null, confirmToken,
    )
    .run();
  return { id, manageToken, confirmToken };
}

export async function updateBookingEvent(db, id, googleEventId) {
  await db
    .prepare(`UPDATE bookings SET google_event_id = ? WHERE id = ?`)
    .bind(googleEventId, id)
    .run();
}

export async function markBookingFailed(db, id) {
  await db.prepare(`UPDATE bookings SET status = 'failed' WHERE id = ?`).bind(id).run();
}

export async function cancelBooking(db, id) {
  await db
    .prepare(`UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?`)
    .bind(id)
    .run();
}

export async function getBookingByToken(db, token) {
  return db
    .prepare(`SELECT * FROM bookings WHERE manage_token = ?`)
    .bind(token)
    .first();
}

export async function getBookingByConfirmToken(db, token) {
  return db
    .prepare(`SELECT * FROM bookings WHERE confirm_token = ?`)
    .bind(token)
    .first();
}

export async function getBookingById(db, id, slug) {
  return db
    .prepare(`SELECT * FROM bookings WHERE id = ? AND slug = ?`)
    .bind(id, slug)
    .first();
}

export async function confirmMobileBooking(db, id) {
  try {
    await db
      .prepare(`UPDATE bookings SET status = 'confirmed' WHERE id = ? AND status = 'pending'`)
      .bind(id)
      .run();
  } catch (err) {
    // The partial unique index (slug, slot_start WHERE status='confirmed') fires
    // if another booking already holds this slot — surface it as SlotTakenError
    // so callers can show a friendly "slot no longer available" message instead
    // of throwing an unhandled 1101.
    if (isUniqueConstraintError(err)) throw new SlotTakenError();
    throw err;
  }
}

/**
 * Active (confirmed/pending) future bookings that hold a Google Calendar event,
 * for reverse-sync reconciliation. Restricted to slot_start >= now (in local
 * wall-clock ISO, which sorts lexicographically) to keep the workload bounded —
 * past bookings no longer lock a slot worth reclaiming. Pass a slug to scope to
 * one tenant (used by the manual workbench reconcile button).
 */
export async function getActiveBookingsWithEvents(db, nowIso, slug = null) {
  const base = `SELECT id, slug, google_event_id, slot_start, status, name, email
                FROM bookings
                WHERE status IN ('confirmed', 'pending')
                  AND google_event_id IS NOT NULL
                  AND slot_start >= ?`;
  const stmt = slug
    ? db.prepare(`${base} AND slug = ?`).bind(nowIso, slug)
    : db.prepare(base).bind(nowIso);
  const { results } = await stmt.all();
  return results ?? [];
}

export async function listTenantSlugs(db) {
  const { results } = await db.prepare(`SELECT slug FROM tenants`).all();
  return (results ?? []).map((r) => r.slug);
}

export async function findBookingBySlot(db, slug, slotStart) {
  return db
    .prepare(
      `SELECT * FROM bookings WHERE slug = ? AND slot_start = ? AND status = 'confirmed'`,
    )
    .bind(slug, slotStart)
    .first();
}

export async function countRecentBookingsByEmail(db, slug, email, sinceIso) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM bookings
       WHERE slug = ? AND email = ? AND status = 'confirmed' AND created_at >= ?`,
    )
    .bind(slug, email, sinceIso)
    .first();
  return row?.count ?? 0;
}

export async function updateBookingPrep(db, { slug, bookingId, prepStatus, internalNote }) {
  const existing = await db
    .prepare(`SELECT * FROM bookings WHERE id = ? AND slug = ?`)
    .bind(bookingId, slug)
    .first();
  if (!existing) return null;

  const sets = [];
  const binds = [];
  if (prepStatus !== undefined) {
    sets.push('prep_status = ?');
    binds.push(prepStatus);
  }
  if (internalNote !== undefined) {
    sets.push('internal_note = ?');
    binds.push(internalNote === '' || internalNote == null ? null : internalNote);
  }
  if (!sets.length) return existing;

  binds.push(bookingId, slug);
  await db
    .prepare(`UPDATE bookings SET ${sets.join(', ')} WHERE id = ? AND slug = ?`)
    .bind(...binds)
    .run();

  return db.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(bookingId).first();
}

/** Read-only workbench list — pending mobile + confirmed in [fromDate, toDate]. */
export async function getWorkbenchBookings(db, slug, fromDate, toDate) {
  const { results } = await db
    .prepare(
      `SELECT id, slot_start, slot_end, name, email, phone, note, reg,
              address, postcode, type, band, arrival_window, status,
              prep_status, internal_note, manage_token
       FROM bookings
       WHERE slug = ?
         AND status != 'cancelled'
         AND (
           (status = 'pending' AND type = 'mobile')
           OR (status = 'confirmed' AND substr(slot_start, 1, 10) >= ? AND substr(slot_start, 1, 10) <= ?)
         )
       ORDER BY slot_start ASC`,
    )
    .bind(slug, fromDate, toDate)
    .all();
  return results || [];
}
