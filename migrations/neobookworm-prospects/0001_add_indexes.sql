-- Migration 0001: add read-efficiency indexes to neobookworm-prospects
-- Database: neobookworm-prospects (0ae32598-1680-4995-a010-96b647eacabd)
--
-- This database has no wrangler migration tracking — apply manually with:
--   npx wrangler d1 execute neobookworm-prospects --remote \
--     --file=migrations/neobookworm-prospects/0001_add_indexes.sql
--
-- All statements use CREATE INDEX IF NOT EXISTS, so this file is safe to
-- re-run and safe against staging vs production differences.
--
-- Table sizes at time of writing (2026-06-27):
--   prospects  4,776 rows
--   outbox       753 rows
--   campaigns     25 rows
--   dnc            7 rows
--
-- ─────────────────────────────────────────────────────────────────────────────
-- INDEX 1: prospects — composite status + trade_category + do_not_contact
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Optimises (skill-revisions/neobookworm-campaign-setup/SKILL.md, Step 2):
--
--   SELECT notion_id, business_name, ... FROM prospects
--   WHERE  status = 'Researched'          -- or 'Researched with website'
--     AND  trade_category = ?
--     AND  do_not_contact = 0
--     AND  email_address IS NOT NULL
--     AND  company_type = 'ltd'
--   ORDER BY review_count DESC
--   LIMIT 25;
--
--   Also optimises (api/dashboard.js):
--   SELECT COUNT(*) FROM prospects WHERE status = 'Researched' AND trade_category = ?
--
-- Without this index SQLite picks the most selective single-column index
-- (idx_status or idx_trade_category) and scans the rest in memory.
-- 'Researched' might be ~500–1,000 of 4,776 rows; filtered further by
-- trade_category, do_not_contact, and company_type in-memory.
--
-- With this index, the three equality predicates narrow the scan to
-- ~20–50 rows before fetching the full row.
--
-- Estimated rows-read reduction per campaign-setup query: 500 → ~50.
-- At ~20 queries/day during active campaigns: 10,000 → ~1,000 rows/day.
-- Write cost: 1 extra row written per INSERT/UPDATE touching these columns.

CREATE INDEX IF NOT EXISTS idx_prospects_status_trade_dnc
  ON prospects (status, trade_category, do_not_contact);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEX 2: outbox — notion_id + sent
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Optimises (api/dashboard.js) — multiple queries per prospect:
--
--   UPDATE outbox SET suppressed = 1, approved = 0, approved_at = NULL
--   WHERE  notion_id = ? AND sent = 0;
--
--   UPDATE outbox SET suppressed = 0
--   WHERE  notion_id = ? AND sent = 0;
--
--   UPDATE outbox SET approved = 0, approved_at = NULL
--   WHERE  notion_id = ? AND sent = 0;
--
--   SELECT campaign_id FROM outbox WHERE notion_id = ?
--   GROUP BY campaign_id ...
--
-- The existing idx_outbox_queue covers (sent, skipped, approved, campaign_id, ...).
-- There is no index on notion_id, so every notion_id lookup full-scans 753 rows.
--
-- Estimated rows-read reduction per notion_id query: 753 → ~30 (avg emails per prospect).
-- At ~100 notion_id queries/day (dashboard use): 75,300 → ~3,000 rows/day.
-- Write cost: 1 extra row per outbox INSERT.

CREATE INDEX IF NOT EXISTS idx_outbox_notion_id_sent
  ON outbox (notion_id, sent);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEX 3: outbox — campaign_id + sent + skipped
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Optimises (api/dashboard.js) — called after each email approval/send:
--
--   SELECT (SELECT COUNT(*) FROM outbox WHERE campaign_id = ?) AS total,
--          (SELECT COUNT(*) FROM outbox WHERE campaign_id = ? AND sent = 0 AND skipped = 0) AS pending
--
--   UPDATE campaigns SET status = 'complete'
--   WHERE  status IN ('draft','active','paused')
--     AND  id IN (SELECT campaign_id FROM outbox GROUP BY campaign_id
--                 HAVING COUNT(*) > 0
--                    AND SUM(CASE WHEN sent = 0 AND skipped = 0 THEN 1 ELSE 0 END) = 0)
--
-- The existing idx_outbox_queue is (sent, skipped, approved, campaign_id, ...).
-- campaign_id is the 4th column — SQLite cannot seek on it without matching
-- the leading columns first, so COUNT(*) WHERE campaign_id = ? scans all 753 rows.
--
-- With this index, each campaign query scans only its own outbox rows (~30 on avg).
--
-- Estimated rows-read reduction per campaign completion check: 753 → ~30.
-- At ~100 checks/day: 75,300 → ~3,000 rows/day.
-- Write cost: 1 extra row per outbox INSERT.

CREATE INDEX IF NOT EXISTS idx_outbox_campaign_id_sent_skipped
  ON outbox (campaign_id, sent, skipped);
