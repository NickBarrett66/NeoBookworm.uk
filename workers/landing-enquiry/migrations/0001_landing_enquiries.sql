-- Migration 0001: landing_enquiries table
-- All columns for current and future phases are defined here.
-- Phase 1 uses: id, created_at, full_name, biz_name, email, start_option,
--               source, details, current_url, payload_json
-- Phase 2+ uses: notion_status, email_status, notion_page_id,
--                notion_error, email_error, notion_attempts, email_attempts

CREATE TABLE IF NOT EXISTS landing_enquiries (
  id               TEXT    PRIMARY KEY,
  created_at       TEXT    NOT NULL,

  full_name        TEXT    NOT NULL,
  biz_name         TEXT    NOT NULL,
  email            TEXT    NOT NULL,
  start_option     TEXT    NOT NULL,
  source           TEXT    NOT NULL,
  details          TEXT,
  current_url      TEXT,

  notion_status    TEXT    NOT NULL DEFAULT 'pending',
  email_status     TEXT    NOT NULL DEFAULT 'pending',
  notion_page_id   TEXT,
  notion_error     TEXT,
  email_error      TEXT,
  notion_attempts  INTEGER NOT NULL DEFAULT 0,
  email_attempts   INTEGER NOT NULL DEFAULT 0,

  payload_json     TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_enquiries_status_created
  ON landing_enquiries (notion_status, email_status, created_at);
