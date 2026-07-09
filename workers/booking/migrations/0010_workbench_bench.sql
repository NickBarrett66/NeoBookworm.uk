-- Bench-mode workbench: staff walk-in/phone bookings, post-appointment outcome,
-- and walk-in notification tracking. All three are internal (workbench-only) and
-- never surface in the customer booking widget, manage page or emails.
--
--   source        'online'  (public widget, default) | 'walkin' (staff-created)
--   outcome       NULL | 'done' | 'no_show'   — set from the workbench after the job
--   notify_state  'none' (default) | 'sent'   — has a walk-in customer been emailed
--
-- Only source='walkin' rows are editable/notifiable from the bench; online rows
-- stay in lock-step with Google Calendar via the existing reschedule flow.
ALTER TABLE bookings ADD COLUMN source TEXT NOT NULL DEFAULT 'online';
ALTER TABLE bookings ADD COLUMN outcome TEXT;
ALTER TABLE bookings ADD COLUMN notify_state TEXT NOT NULL DEFAULT 'none';
