-- Migration 0005: add stripe_link column to clients
-- Database: neobookworm-enquiries
--
-- What this adds:
--   stripe_link — per-client Stripe Payment Link URL (e.g. with
--                 client_reference_id={slug} appended). Set from the
--                 dashboard once payment is due; the portal renders it
--                 as the "Pay invoice" button on the awaiting_payment
--                 stage, and the C3 template interpolates it as
--                 {stripe_link}.

ALTER TABLE clients ADD COLUMN stripe_link TEXT;
