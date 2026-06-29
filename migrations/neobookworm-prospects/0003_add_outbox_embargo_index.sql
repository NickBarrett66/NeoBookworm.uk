-- Migration 0003: index outbox for embargo slide query
-- Database: neobookworm-prospects (0ae32598-1680-4995-a010-96b647eacabd)
--
-- Apply manually:
--   npx wrangler d1 execute neobookworm-prospects --remote \
--     --file=migrations\neobookworm-prospects\0003_add_outbox_embargo_index.sql
--
-- Optimises (api/dashboard.js): outbox_embargo action
--   UPDATE outbox SET scheduled_not_before = ?
--   WHERE  campaign_id = ? AND notion_id = ? AND seq_num = ? AND sent = 0
--
-- The existing idx_outbox_campaign_id_sent_skipped covers (campaign_id, sent, skipped)
-- but not notion_id or seq_num, so this query scans all ~30 rows for the campaign.
-- New index lets it seek directly to the one matching row.

CREATE INDEX IF NOT EXISTS idx_outbox_campaign_notion_seq
  ON outbox (campaign_id, notion_id, seq_num, sent);
