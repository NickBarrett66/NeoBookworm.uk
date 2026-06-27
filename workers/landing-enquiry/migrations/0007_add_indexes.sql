-- Migration 0007: add read-efficiency indexes to landing_enquiries
-- Database: neobookworm-enquiries
--
-- The existing idx_enquiries_status_created covers (notion_status, email_status, created_at).
-- Since Notion was retired (Session 0, 25 May 2026), notion_status is never updated —
-- so SQLite must scan all distinct notion_status leaf nodes before reaching email_status.
-- The new index puts email_status first, letting the retry and digest crons go straight
-- to the rows they need with zero wasted scans.
--
-- Optimises (workers/landing-enquiry/src/scheduled.js):
--   RETRY_SQL  — WHERE email_status = 'failed' AND email_attempts < 5
--                AND created_at > datetime('now', '-7 days')
--                Runs every 15 min = 96×/day
--   DIGEST_SQL — WHERE email_status = 'failed' ORDER BY created_at ASC
--                Runs once daily at 08:00 UTC
--
-- Estimated rows-read reduction (current table: 3 rows; grows with traffic):
--   Per 1,000 rows: 97,000 → ~100 rows/day for these two crons combined.

CREATE INDEX IF NOT EXISTS idx_landing_enquiries_email_status
  ON landing_enquiries (email_status, created_at);
