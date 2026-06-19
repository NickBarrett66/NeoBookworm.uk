-- Add vehicle registration and vehicle summary to bookings
ALTER TABLE bookings ADD COLUMN reg TEXT;
ALTER TABLE bookings ADD COLUMN vehicle_summary TEXT;
