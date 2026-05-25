-- NeoBookworm D1 live schemas
-- Extracted from sqlite_master on 2026-05-25
-- Database: neobookworm-enquiries (771b3047-f977-485e-9cfb-736815931998)
--   Tables: contact_enquiries, intake_submissions, landing_enquiries
-- Database: neobookworm-prospects (0ae32598-1680-4995-a010-96b647eacabd)
--   Tables: prospects

CREATE TABLE contact_enquiries (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  name        TEXT NOT NULL,
  trade       TEXT,
  email       TEXT NOT NULL,
  phone       TEXT,
  message     TEXT NOT NULL,
  handled     INTEGER DEFAULT 0,
  admin_notes TEXT
);

CREATE TABLE intake_submissions (
  id                  TEXT PRIMARY KEY,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  business_name       TEXT,
  trade_category      TEXT,
  full_name           TEXT,
  email               TEXT,
  phone               TEXT,
  area                TEXT,
  services            TEXT,
  accreditations      TEXT,
  work_exclusions     TEXT,
  about               TEXT,
  team_size           TEXT,
  ideal_work          TEXT,
  colour_preferences  TEXT,
  website_style       TEXT,
  testimonials        TEXT,
  trust_marks         TEXT,
  domain_name         TEXT,
  contact_methods     TEXT,
  working_hours       TEXT,
  free_quotes         TEXT,
  emergency_callouts  TEXT,
  google_business     TEXT,
  domain_status       TEXT,
  inspiration_url     TEXT,
  years_trading       INTEGER,
  additional_notes    TEXT,
  photo_urls          TEXT,
  logo_url            TEXT,
  status              TEXT DEFAULT 'pending_review',
  handled             INTEGER DEFAULT 0,
  admin_notes         TEXT,
  notion_page_id      TEXT
);

CREATE TABLE landing_enquiries (
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
  payload_json     TEXT    NOT NULL,
  admin_notes      TEXT,
  handled          INTEGER DEFAULT 0
);

CREATE TABLE prospects (
  -- Identity
  notion_id         TEXT PRIMARY KEY,
  business_name     TEXT NOT NULL,

  -- Status & Pipeline
  status            TEXT,
  prospect_segment  TEXT,
  trade_category    TEXT,
  trade_tier        TEXT,
  rating            REAL,
  li_test_score     REAL,
  postcard_score    REAL,
  postcard_status   TEXT,
  disqualify_reason TEXT,
  response_classification TEXT,

  -- Contact Details
  contact_name      TEXT,
  job_title         TEXT,
  contact_level     TEXT,
  email_address     TEXT,
  phone             TEXT,
  contact_linkedin  TEXT,

  -- Business Details
  business_type     TEXT,
  company_type      TEXT,
  address           TEXT,
  town              TEXT,
  postcode          TEXT,
  website_url       TEXT,
  has_website       INTEGER DEFAULT 0,
  employee_band     TEXT,
  turnover_band     TEXT,
  review_count      REAL,
  years_on_checkatrade REAL,

  -- Companies House
  ch_number         TEXT,
  ch_status         TEXT,
  ch_incorporation_date TEXT,
  companies_house_confirmed TEXT,

  -- LinkedIn
  company_linkedin  TEXT,

  -- Demo & Brief
  demo_url          TEXT,
  demo_site_name    TEXT,

  -- Email Outreach
  email_source_url  TEXT,
  email_thread_id   TEXT,
  last_email_sent   TEXT,
  date_first_contacted TEXT,
  contact_count     REAL,
  legal_basis       TEXT,

  -- UTM Tracking
  utm_source        TEXT,
  utm_medium        TEXT,
  utm_campaign      TEXT,
  utm_content       TEXT,
  campaign_url      TEXT,

  -- Research & Notes
  research_summary  TEXT,
  research_quality  TEXT,
  notes             TEXT,
  note              TEXT,
  agent_log         TEXT,
  data_source       TEXT,

  -- Flags
  do_not_contact    INTEGER DEFAULT 0,

  -- Dates
  date_added        TEXT,
  created_at        TEXT DEFAULT (datetime('now')),

  -- Later additions (ALTER TABLE)
  website_platform         TEXT,
  website_agency           TEXT,
  has_incumbent_agency     INTEGER DEFAULT 0,
  domain_status            TEXT,
  website_sub_segment      TEXT,
  email_campaign_id        TEXT,
  sequence_suppressed      INTEGER NOT NULL DEFAULT 0
);
