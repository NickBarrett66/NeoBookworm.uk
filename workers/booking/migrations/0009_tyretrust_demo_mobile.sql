-- TyreTrust landing-page demo: enable the depot/mobile chooser and fix the
-- broken success-screen "back" link.
--
-- Why:
--  * mobileBooking:true turns on View 0 (depot vs mobile chooser) so the demo
--    shows BOTH journeys, not depot-only. The depot origin + distance bands are
--    hardcoded in geo.js (Swindon SN5 7SW), so no per-tenant geo config is needed.
--  * addressEnabled/addressRequired let the mobile form collect a fitting address.
--    addressLookup is deliberately left unset (free postcodes.io area validation) —
--    NOT 'full' — so demo visitors never spend Postcoder credits.
--  * homeUrl is removed: it pointed at https://tyretrust.uk/ (a dead domain) and
--    rendered a "← Back to HE Tyres" link on the success screen that navigated the
--    parent window (target=_parent) to that dead URL. Dropping homeUrl removes the
--    link entirely; the widget's own "Book another slot" button handles reset.
--
-- Safety: this tenant MUST keep demoMode:true. handleBook AND handleMobileRequest
-- both short-circuit on demoMode (no DB write, no Google Calendar, no email), so
-- enabling the full mobile request-then-confirm flow here stays cost-free and
-- clutter-free. NOTE (9 Jul 2026): the live tyretrust-demo config had *lost*
-- demoMode entirely — it was created by 0008 with demoMode:true but later re-saved
-- through the dashboard, whose schema.js has no demoMode field, so the save stripped
-- it (and left junk demo bookings behind). We re-set demoMode:true here as well so
-- this migration captures the true intended end-state and is safe to re-apply.
--
-- IMPORTANT: do NOT run `wrangler d1 migrations apply` for the booking DB — 0008 and
-- 0009 are applied out-of-band (direct `d1 execute`), and the live tyretrust-demo row
-- has since drifted (dashboard-enriched: lunchBreak, schema defaults, etc.). The
-- migrations runner would re-run 0008's INSERT OR REPLACE and wipe that drift back to
-- the minimal baseline. Apply booking-DB config changes with targeted `d1 execute`
-- (then bust KV `tenant:tyretrust-demo`), not the migrations runner.
UPDATE tenants
SET config_json = json_remove(
      json_set(
        json_set(
          json_set(
            json_set(config_json, '$.mobileBooking', json('true')),
            '$.addressEnabled', json('true')
          ),
          '$.addressRequired', json('true')
        ),
        '$.demoMode', json('true')
      ),
      '$.homeUrl'
    ),
    updated_at = datetime('now')
WHERE slug = 'tyretrust-demo';
