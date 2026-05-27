-- Migration 0003: add rendered body storage to email_log
--
-- Allows the client portal to display the content of sent emails.
-- Existing rows will have body = NULL; the portal handles this gracefully.
--
-- Rollback: ALTER TABLE email_log DROP COLUMN body  (SQLite 3.35+)
--           or recreate the table without the column.

ALTER TABLE email_log ADD COLUMN body TEXT;
