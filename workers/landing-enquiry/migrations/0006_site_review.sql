-- Migration 0006: add site_review_content column to clients
-- Database: neobookworm-enquiries
--
-- Stores the Claude-generated site audit for J2 (free site review) clients.
-- Shown on the client portal at the review_delivered stage and editable from
-- the dashboard before Nick sends J2-E2.

ALTER TABLE clients ADD COLUMN site_review_content TEXT;
