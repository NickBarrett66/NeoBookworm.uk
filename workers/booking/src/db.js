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

/**
 * Staff-created walk-in / phone booking. A confirmed depot booking with
 * source='walkin' and notify_state='none' — no customer email is sent at
 * insert time (that is a later, explicit "send" from the bench). email/name
 * may be placeholders when Howie pencils it in; Emma fills them in later.
 * Reuses the same slot lock as a public booking (partial unique index), so a
 * walk-in cannot double-book an occupied slot.
 */
export async function insertWalkinBooking(db, { slug, slotStart, slotEnd, name, email, phone, note, reg, vehicleSummary }) {
  const id = crypto.randomUUID();
  const manageToken = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO bookings
           (id, slug, slot_start, slot_end, name, email, phone, note, reg, vehicle_summary,
            google_event_id, status, manage_token, type, source, notify_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'confirmed', ?, 'depot', 'walkin', 'none')`,
      )
      .bind(id, slug, slotStart, slotEnd, name, email ?? '', phone ?? '', note ?? null, reg ?? null, vehicleSummary ?? null, manageToken)
      .run();
    return { id, manageToken };
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new SlotTakenError();
    throw err;
  }
}

/**
 * Enhance a walk-in booking's customer details from the bench (Emma adds the
 * name/email/phone/reg Howie didn't capture). Guarded to source='walkin' so a
 * public online booking can never be edited into calendar drift. Only the
 * provided fields are written. Returns the updated row, or null if no matching
 * walk-in row exists.
 */
export async function updateWalkinDetails(db, { slug, bookingId, name, email, phone, reg, note }) {
  const existing = await db
    .prepare(`SELECT * FROM bookings WHERE id = ? AND slug = ? AND source = 'walkin'`)
    .bind(bookingId, slug)
    .first();
  if (!existing) return null;

  const sets = [];
  const binds = [];
  if (name !== undefined)  { sets.push('name = ?');  binds.push(name); }
  if (email !== undefined) { sets.push('email = ?'); binds.push(email ?? ''); }
  if (phone !== undefined) { sets.push('phone = ?'); binds.push(phone ?? ''); }
  if (reg !== undefined)   { sets.push('reg = ?');   binds.push(reg || null); }
  if (note !== undefined)  { sets.push('note = ?');  binds.push(note || null); }
  if (!sets.length) return existing;

  binds.push(bookingId, slug);
  await db
    .prepare(`UPDATE bookings SET ${sets.join(', ')} WHERE id = ? AND slug = ?`)
    .bind(...binds)
    .run();

  return db.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(bookingId).first();
}

/** Mark a walk-in customer as having been sent their confirmation email. */
export async function markWalkinNotified(db, id) {
  await db.prepare(`UPDATE bookings SET notify_state = 'sent' WHERE id = ?`).bind(id).run();
}

/**
 * Post-appointment outcome (workbench-only): 'done' | 'no_show' | null (clear).
 * Guarded to confirmed rows for the slug. Returns the updated row, or null.
 */
export async function setBookingOutcome(db, { slug, bookingId, outcome }) {
  const existing = await db
    .prepare(`SELECT * FROM bookings WHERE id = ? AND slug = ? AND status = 'confirmed'`)
    .bind(bookingId, slug)
    .first();
  if (!existing) return null;
  await db
    .prepare(`UPDATE bookings SET outcome = ? WHERE id = ? AND slug = ?`)
    .bind(outcome ?? null, bookingId, slug)
    .run();
  return db.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(bookingId).first();
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
      `SELECT id, slot_start, slot_end, name, email, phone, note, reg, vehicle_summary,
              address, postcode, type, band, arrival_window, status,
              prep_status, internal_note, manage_token, source, outcome, notify_state
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
