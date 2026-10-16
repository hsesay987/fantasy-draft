#!/usr/bin/env bash
# Dump the public schema of a Postgres database to a compressed file you can restore anywhere.
#   SOURCE_URL="postgresql://..." npm run db:backup
# Only the `public` schema is dumped: that is all this app uses (no Supabase auth/storage objects).
set -euo pipefail
: "${SOURCE_URL:?Set SOURCE_URL to the database you want to back up (use the Supabase *session pooler* URL if the direct host is unreachable)}"
cd "$(dirname "$0")/../.."
mkdir -p backups
OUT="backups/toppic-$(date +%Y%m%d-%H%M%S).dump"

echo "pg_dump client: $(pg_dump --version)"
SERVER_VER=$(psql "$SOURCE_URL" -Atc "show server_version" 2>/dev/null || true)
[ -n "$SERVER_VER" ] && echo "server: PostgreSQL $SERVER_VER" || { echo "Could not connect to SOURCE_URL. Check the URL, password and that the project is not paused." >&2; exit 1; }

pg_dump "$SOURCE_URL" --format=custom --compress=6 --no-owner --no-acl --schema=public --file="$OUT"

echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
echo "tables in dump:"; pg_restore --list "$OUT" | grep -c "TABLE DATA" | xargs echo " "
echo "Keep this file somewhere safe (it contains user emails and password hashes). It is git-ignored."
