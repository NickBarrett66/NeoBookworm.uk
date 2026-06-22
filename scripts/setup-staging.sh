#!/usr/bin/env bash
# setup-staging.sh — Provision staging Cloudflare resources (run once)
#
# Usage: bash scripts/setup-staging.sh
#
# After this script finishes:
#   1. Copy the database_id values printed below into the two wrangler.toml files
#   2. Copy the KV namespace id into workers/booking/wrangler.toml
#   3. Run:  bash scripts/run-migrations.sh staging

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo ""
echo "========================================================"
echo "  NeoBookworm — Staging resource provisioning"
echo "========================================================"
echo ""

# ── 1. Booking D1 database ────────────────────────────────────────────────────
echo "Creating D1 database: bookings-staging ..."
cd "$REPO_ROOT/workers/booking"
npx wrangler d1 create bookings-staging
echo ""
echo ">>> COPY the database_id printed above into:"
echo "    workers/booking/wrangler.toml  →  [env.staging] [[d1_databases]] database_id"
echo ""
read -rp "Press Enter when you have pasted the bookings-staging ID ..."

# ── 2. Landing-enquiry D1 database ───────────────────────────────────────────
echo ""
echo "Creating D1 database: neobookworm-enquiries-staging ..."
cd "$REPO_ROOT/workers/landing-enquiry"
npx wrangler d1 create neobookworm-enquiries-staging
echo ""
echo ">>> COPY the database_id printed above into:"
echo "    workers/landing-enquiry/wrangler.toml  →  [env.staging] [[d1_databases]] database_id"
echo ""
read -rp "Press Enter when you have pasted the enquiries-staging ID ..."

# ── 3. Booking KV namespace ───────────────────────────────────────────────────
echo ""
echo "Creating KV namespace: TOKEN_CACHE-staging ..."
cd "$REPO_ROOT/workers/booking"
npx wrangler kv namespace create TOKEN_CACHE-staging
echo ""
echo ">>> COPY the id printed above into:"
echo "    workers/booking/wrangler.toml  →  [env.staging] [[kv_namespaces]] id"
echo ""
read -rp "Press Enter when you have pasted the KV id ..."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "========================================================"
echo "  Resource creation complete."
echo ""
echo "  Next step — apply migrations to staging databases:"
echo "    bash scripts/run-migrations.sh staging"
echo "========================================================"
echo ""
