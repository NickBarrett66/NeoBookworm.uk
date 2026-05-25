-- Migration 0002: clients + email_log + feedback (onboarding state)
-- Database: neobookworm-enquiries
-- Added in Session 1 of docs/neobookworm-onboarding-build-plan-v3.md
--
-- What this adds:
--   clients     — the single onboarding record per prospect, keyed by slug.
--                 source_type/source_id link back to the originating raw row
--                 (landing_enquiries / intake_submissions / contact_enquiries
--                 / prospects). 13-stage CHECK constraint includes the v3
--                 addition `review_delivered` for J2.
--   email_log   — every onboarding email sent or attempted. Keyed by slug,
--                 not prospect_id. TEXT sent_at to match the rest of the
--                 schema. No FK to prospects. Supersedes the playbook's
--                 (older) email_log block.
--   feedback    — structured "few changes please" submissions from the portal.
--
-- Rollback: workers/landing-enquiry/migrations/rollbacks/
--           0002_clients_email_log_feedback_rollback.sql

CREATE TABLE IF NOT EXISTS clients (
  slug                TEXT PRIMARY KEY,
  source_type         TEXT NOT NULL CHECK (source_type IN
                        ('landing_enquiry','intake','contact','prospect')),
  source_id           TEXT NOT NULL,

  business_name       TEXT,
  contact_name        TEXT,
  email               TEXT NOT NULL,

  journey             TEXT CHECK (journey IN ('J1','J2','J3','J4','J5')),
  stage               TEXT NOT NULL DEFAULT 'acknowledged' CHECK (stage IN (
                        'acknowledged','researching','building','reviewing','review_delivered',
                        'preview_ready','revisions','awaiting_payment','preparing_live',
                        'live','care_active','self_managed','dropped_out')),
  stage_changed_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  next_action_by      TEXT,

  current_url         TEXT,
  preview_url         TEXT,
  live_url            TEXT,

  domain              TEXT,
  domain_status       TEXT CHECK (domain_status IN ('confirmed','suggested','unresolved')),

  plan                TEXT CHECK (plan IN ('care','self_managed')),
  payment_status      TEXT NOT NULL DEFAULT 'none',
  stripe_customer_id  TEXT,
  last_payment_at     TEXT,

  revision_count      INTEGER NOT NULL DEFAULT 0,
  review_content      TEXT,
  hosting_provider    TEXT,
  hosting_url         TEXT,
  client_email        TEXT,

  last_nudge_sent_at  TEXT,
  opt_out             INTEGER NOT NULL DEFAULT 0,
  notes               TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_source
  ON clients (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_clients_stage
  ON clients (stage, stage_changed_at);
CREATE INDEX IF NOT EXISTS idx_clients_email
  ON clients (email);

CREATE TABLE IF NOT EXISTS email_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL,
  template   TEXT NOT NULL,
  sent_at    TEXT NOT NULL DEFAULT (datetime('now')),
  subject    TEXT NOT NULL,
  recipient  TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'sent',
  error      TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_log_slug_sent
  ON email_log (slug, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_slug_template
  ON email_log (slug, template);

CREATE TABLE IF NOT EXISTS feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL,
  categories  TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_slug
  ON feedback (slug);
