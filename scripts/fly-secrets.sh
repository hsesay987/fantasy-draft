#!/usr/bin/env bash
# Sets the API's secrets on Fly without printing them. Run from the repo root after `fly apps create toppic-api`:
#   bash scripts/fly-secrets.sh
# Reads Neon/Sentry/PostHog values from backend/.env.local, generates JWT_SECRET, asks (hidden) for the rest.
set -euo pipefail
cd "$(dirname "$0")/.."
APP=toppic-api
ENVF=backend/.env.local
val() { grep -E "^$1=" "$ENVF" | head -1 | sed -E "s/^$1=//; s/^\"//; s/\"$//"; }
ask() { local v; read -r -s -p "$1 (Enter to skip): " v; echo >&2; printf '%s' "$v"; }

args=()
for k in DATABASE_URL MIGRATE_DATABASE_URL SENTRY_DSN POSTHOG_KEY; do
  v=$(val "$k"); [ -n "$v" ] || { echo "Missing $k in $ENVF" >&2; exit 1; }
  args+=("$k=$v")
done
args+=("JWT_SECRET=$(openssl rand -hex 32)")
args+=("RESEND_VERIFY_TEMPLATE_ID=verify-email-toppic-games" "RESEND_RESET_TEMPLATE_ID=reset-password-toppic-games" "RESEND_RECEIPT_TEMPLATE_ID=toppic-subscription-confirmation")
for k in RESEND_API_KEY ANTHROPIC_API_KEY STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET GOOGLE_CLIENT_ID; do
  v=$(ask "$k"); [ -n "$v" ] && args+=("$k=$v")
done
fly secrets set --app "$APP" --stage "${args[@]}" >/dev/null
echo "staged ${#args[@]} secrets on $APP (applied on next deploy)"
