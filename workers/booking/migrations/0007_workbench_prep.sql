-- Session W2 — staff prep status + internal notes (workbench only; never customer-facing).
ALTER TABLE bookings ADD COLUMN prep_status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE bookings ADD COLUMN internal_note TEXT;
