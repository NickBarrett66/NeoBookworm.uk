#!/usr/bin/env bash
# deploy.sh — Deploy both Cloudflare Workers
#
# Usage: bash scripts/deploy.sh staging
#        bash scripts/deploy.sh production

set -e

ENV="${1:-}"

if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
  echo "Usage: bash scripts/deploy.sh staging|production"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "$ENV" == "staging" ]]; then
  ENV_FLAG="--env staging"
  BOOKING_URL="https://neobookworm-booking-staging.nickbarrett.workers.dev"
  ENQUIRY_URL="https://neobookworm-landing-enquiry-staging.nickbarrett.workers.dev"
else
  ENV_FLAG=""
  BOOKING_URL="https://neobookworm-booking.nickbarrett.workers.dev"
  ENQUIRY_URL="https://neobookworm-landing-enquiry.nickbarrett.workers.dev"
fi

echo ""
echo "========================================================"
echo "  Deploying Workers — $ENV"
echo "========================================================"
echo ""

# ── 1. landing-enquiry (deploy first — booking may call it indirectly) ────────
echo "--- Deploying: neobookworm-landing-enquiry ($ENV) ---"
cd "$REPO_ROOT/workers/landing-enquiry"
npx wrangler deploy $ENV_FLAG
echo ""

# ── 2. booking ────────────────────────────────────────────────────────────────
echo "--- Deploying: neobookworm-booking ($ENV) ---"
cd "$REPO_ROOT/workers/booking"
npx wrangler deploy $ENV_FLAG
echo ""

echo "========================================================"
echo "  Deploy complete — $ENV"
echo ""
echo "  Booking Worker:          $BOOKING_URL"
echo "  Landing-enquiry Worker:  $ENQUIRY_URL"
echo ""

if [[ "$ENV" == "production" ]]; then
  echo "  REMINDER: Check that Vercel has deployed the latest main branch."
  echo "  Dashboard: https://vercel.com/dashboard"
  echo ""
  echo "  Smoke test:"
  echo "    curl -s $BOOKING_URL/health | head -c 200"
  echo "    curl -s $ENQUIRY_URL/health | head -c 200"
fi

echo "========================================================"
echo ""
