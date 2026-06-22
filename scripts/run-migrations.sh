#!/usr/bin/env bash
# run-migrations.sh — Apply D1 migrations for both Workers
#
# Usage: bash scripts/run-migrations.sh staging
#        bash scripts/run-migrations.sh production

set -e

ENV="${1:-}"

if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
  echo "Usage: bash scripts/run-migrations.sh staging|production"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "$ENV" == "staging" ]]; then
  ENV_FLAG="--env staging"
else
  ENV_FLAG=""
fi

echo ""
echo "========================================================"
echo "  Running D1 migrations — $ENV"
echo "========================================================"
echo ""

# ── landing-enquiry ───────────────────────────────────────────────────────────
echo "--- workers/landing-enquiry ---"
cd "$REPO_ROOT/workers/landing-enquiry"
npx wrangler d1 migrations apply DB $ENV_FLAG --remote
echo ""

# ── booking ───────────────────────────────────────────────────────────────────
echo "--- workers/booking ---"
cd "$REPO_ROOT/workers/booking"
npx wrangler d1 migrations apply DB $ENV_FLAG --remote
echo ""

echo "========================================================"
echo "  Migrations complete for: $ENV"
echo "========================================================"
echo ""
