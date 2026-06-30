CREATE TABLE IF NOT EXISTS tenants (
  slug        TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR REPLACE INTO tenants (slug, config_json) VALUES (
  'hetyres',
  '{"displayName":"HE Tyres","homeUrl":"https://neobookworm.uk/he-tyres/","theme":{"bg":"#1a2336","accent":"#ec7325","accentH":"#d35f17","accentFg":"#1a2336","accentRgb":"236, 115, 37"},"calendarId":null,"slotDuration":30,"minLeadMinutes":120,"maxAdvanceDays":60,"timezone":"Europe/London","regLookup":true,"workingHours":{"1":{"open":"08:30","close":"17:00"},"2":{"open":"08:30","close":"17:00"},"3":{"open":"08:30","close":"17:00"},"4":{"open":"08:30","close":"17:00"},"5":{"open":"08:30","close":"17:00"},"6":{"open":"08:30","close":"12:30"}}}'
);

INSERT OR REPLACE INTO tenants (slug, config_json) VALUES (
  'neobookworm',
  '{"displayName":"NeoBookworm","homeUrl":"https://neobookworm.uk","theme":{"bg":"#0f1f3d","accent":"#f5a623","accentH":"#d4891a","accentFg":"#0f1f3d","accentRgb":"245, 166, 35"},"calendarId":"c_44a4cefa0af749692e9941bf12924e253c573b55a6858cbf15c7b4568c2952a4@group.calendar.google.com","slotDuration":30,"minLeadMinutes":120,"maxAdvanceDays":30,"timezone":"Europe/London","regLookup":false,"workingHours":{"1":{"open":"09:00","close":"17:30"},"2":{"open":"09:00","close":"17:30"},"3":{"open":"09:00","close":"17:30"},"4":{"open":"09:00","close":"17:30"},"5":{"open":"09:00","close":"17:30"}}}'
);
