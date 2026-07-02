-- Session M2 — mobile fitting as pending bookings with Howie confirm step.
-- address + postcode columns already exist from 0004_form.sql.

ALTER TABLE bookings ADD COLUMN type TEXT NOT NULL DEFAULT 'depot';
ALTER TABLE bookings ADD COLUMN band TEXT;
ALTER TABLE bookings ADD COLUMN arrival_window TEXT;
ALTER TABLE bookings ADD COLUMN confirm_token TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_confirm_token ON bookings(confirm_token);

-- Enable real mobile booking for HE Tyres (replaces enquiry-only path from M1).
UPDATE tenants
SET config_json = json_remove(
      json_set(
        json_set(
          json_set(
            json_set(config_json, '$.mobileBooking', true),
            '$.addressEnabled', true
          ),
          '$.addressRequired', true
        ),
        '$.addressLookup', 'full'
      ),
      '$.mobileEnquiryUrl'
    ),
    updated_at = datetime('now')
WHERE slug = 'hetyres';
