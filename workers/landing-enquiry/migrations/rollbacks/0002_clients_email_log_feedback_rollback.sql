-- Rollback for 0002_clients_email_log_feedback
-- Database: neobookworm-enquiries
--
-- This file lives in `rollbacks/` so wrangler's migrations workflow does NOT
-- auto-apply it. Run by hand with:
--
--   cd workers/landing-enquiry
--   npx wrangler d1 execute neobookworm-enquiries --remote \
--     --file=migrations/rollbacks/0002_clients_email_log_feedback_rollback.sql
--
-- DROPPING THESE TABLES PERMANENTLY DELETES ALL ONBOARDING-CLIENT STATE:
-- every clients row, every email_log entry, every feedback submission. Take a
-- backup (`wrangler d1 export`) first unless you genuinely want a clean slate.
--
-- The d1_migrations bookkeeping row for 0002 is NOT removed here, so wrangler
-- will not re-apply 0002 automatically. To re-apply, also run:
--
--   wrangler d1 execute neobookworm-enquiries --remote \
--     --command "DELETE FROM d1_migrations WHERE name = '0002_clients_email_log_feedback.sql'"

DROP INDEX IF EXISTS idx_feedback_slug;
DROP TABLE IF EXISTS feedback;

DROP INDEX IF EXISTS idx_email_log_slug_template;
DROP INDEX IF EXISTS idx_email_log_slug_sent;
DROP TABLE IF EXISTS email_log;

DROP INDEX IF EXISTS idx_clients_email;
DROP INDEX IF EXISTS idx_clients_stage;
DROP INDEX IF EXISTS idx_clients_source;
DROP TABLE IF EXISTS clients;
