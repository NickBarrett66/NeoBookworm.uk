CREATE TABLE IF NOT EXISTS bookings (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL,
  slot_start      TEXT NOT NULL,
  slot_end        TEXT NOT NULL,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT NOT NULL,
  note            TEXT,
  google_event_id TEXT,
  status          TEXT NOT NULL DEFAULT 'confirmed',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_slug_slot ON bookings(slug, slot_start);

-- Atomic double-booking guard. A second INSERT for the same confirmed slot
-- fails with a UNIQUE constraint error — this is the real race lock, not the
-- freebusy check. Partial index so cancelled rows free the slot again.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bookings_active_slot
  ON bookings(slug, slot_start) WHERE status = 'confirmed';
