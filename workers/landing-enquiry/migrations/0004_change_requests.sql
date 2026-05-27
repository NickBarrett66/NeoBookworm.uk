-- Migration 0004: change_requests table + last_action_at debounce column
-- Database: neobookworm-enquiries
--
-- What this adds:
--   change_requests — each "I'd like a few changes" submission from the client
--                     portal, stored individually so every round of revisions
--                     is preserved. Separate from the feedback table (which was
--                     reserved for structured categories).
--   last_action_at  — debounce timestamp on clients to prevent double-submit
--                     when the client clicks a portal action button twice.

ALTER TABLE clients ADD COLUMN last_action_at TEXT;

CREATE TABLE IF NOT EXISTS change_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL,
  body        TEXT NOT NULL,
  stage_at    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_change_requests_slug
  ON change_requests (slug, created_at DESC);
