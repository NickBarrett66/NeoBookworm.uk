-- TyreTrust landing-page booking demo tenant.
-- Branded to look like HE Tyres (same navy/orange), but demoMode:true means the
-- Worker never reads/writes Google Calendar and never sends confirmation or
-- business-notification emails. Depot-only, no reg/address look-ups, so it also
-- spends zero DVLA/Postcoder credits. Safe for anyone to click through.
INSERT OR REPLACE INTO tenants (slug, config_json) VALUES (
  'tyretrust-demo',
  '{"displayName":"HE Tyres","homeUrl":"https://tyretrust.uk/","theme":{"bg":"#1a2336","accent":"#ec7325","accentH":"#d35f17","accentFg":"#1a2336","accentRgb":"236, 115, 37"},"calendarId":null,"slotDuration":30,"minLeadMinutes":120,"maxAdvanceDays":30,"timezone":"Europe/London","regLookup":false,"mobileBooking":false,"addressEnabled":false,"addressRequired":false,"demoMode":true,"workingHours":{"1":{"open":"08:30","close":"17:00"},"2":{"open":"08:30","close":"17:00"},"3":{"open":"08:30","close":"17:00"},"4":{"open":"08:30","close":"17:00"},"5":{"open":"08:30","close":"17:00"},"6":{"open":"08:30","close":"12:30"}}}'
);
