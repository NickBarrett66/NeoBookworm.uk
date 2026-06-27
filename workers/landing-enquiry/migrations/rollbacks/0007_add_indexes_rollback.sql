-- Rollback for 0007_add_indexes
-- Database: neobookworm-enquiries
--
-- Run by hand with:
--   cd workers/landing-enquiry
--   npx wrangler d1 execute neobookworm-enquiries --remote \
--     --file=migrations/rollbacks/0007_add_indexes_rollback.sql
--
-- Dropping this index causes the retry and digest crons to revert to
-- scanning via idx_enquiries_status_created (notion_status leading),
-- which is less efficient now that Notion is retired but still correct.

DROP INDEX IF EXISTS idx_landing_enquiries_email_status;
