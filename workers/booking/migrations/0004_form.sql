-- Phase 4 — form flexibility. Per-booking storage for the optional address
-- capture and tenant-defined custom questions. Location type and field
-- toggles/required live in tenant config, not here.
ALTER TABLE bookings ADD COLUMN address TEXT;
ALTER TABLE bookings ADD COLUMN postcode TEXT;
ALTER TABLE bookings ADD COLUMN custom_answers TEXT; -- JSON: [{ "label": "...", "value": "..." }]
