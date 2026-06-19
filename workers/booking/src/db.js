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

export async function insertBooking(db, { slug, slotStart, slotEnd, name, email, phone, note }) {
  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO bookings (id, slug, slot_start, slot_end, name, email, phone, note, google_event_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'confirmed')`,
      )
      .bind(id, slug, slotStart, slotEnd, name, email, phone, note ?? null)
      .run();
    return { id };
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new SlotTakenError();
    }
    throw err;
  }
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
