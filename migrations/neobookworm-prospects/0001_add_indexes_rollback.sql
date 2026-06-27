-- Rollback for 0001_add_indexes
-- Database: neobookworm-prospects (0ae32598-1680-4995-a010-96b647eacabd)
--
-- Run by hand with:
--   npx wrangler d1 execute neobookworm-prospects --remote \
--     --file=migrations/neobookworm-prospects/0001_add_indexes_rollback.sql

DROP INDEX IF EXISTS idx_prospects_status_trade_dnc;
DROP INDEX IF EXISTS idx_outbox_notion_id_sent;
DROP INDEX IF EXISTS idx_outbox_campaign_id_sent_skipped;
