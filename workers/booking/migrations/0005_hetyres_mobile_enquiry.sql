-- Session M1 — unified depot/mobile chooser for HE Tyres.
-- Enables View 0 in ui.js; mobile path POSTs to the existing Vercel enquiry API.
UPDATE tenants
SET config_json = json_set(
      config_json,
      '$.mobileEnquiryUrl',
      'https://neobookworm.uk/api/he-tyres-enquiry'
    ),
    updated_at = datetime('now')
WHERE slug = 'hetyres';
