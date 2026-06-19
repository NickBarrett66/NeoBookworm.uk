ALTER TABLE bookings ADD COLUMN manage_token TEXT;
ALTER TABLE bookings ADD COLUMN cancelled_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bookings_manage_token
  ON bookings(manage_token) WHERE manage_token IS NOT NULL;
