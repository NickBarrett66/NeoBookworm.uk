-- Migration 0002: index prospects.email_campaign_id
-- Database: neobookworm-prospects (0ae32598-1680-4995-a010-96b647eacabd)
--
-- Apply manually:
--   npx wrangler d1 execute neobookworm-prospects --remote \
--     --file=migrations\neobookworm-prospects\0002_add_email_campaign_id_index.sql
--
-- Optimises (api/dashboard.js ~line 1657): campaign detail view prospect list
--   SELECT notion_id, business_name, ... FROM prospects
--   WHERE  email_campaign_id = ?
--   ORDER BY last_email_sent DESC NULLS LAST, business_name ASC
--
-- Without this index every campaign detail load scans all ~4,776 prospects.
-- With it, D1 seeks only to the ~25 rows for that campaign.
--
-- Estimated rows-read reduction: 4,776 → ~25 per campaign detail load.

CREATE INDEX IF NOT EXISTS idx_prospects_email_campaign_id
  ON prospects (email_campaign_id);
