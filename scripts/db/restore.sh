#!/usr/bin/env bash
# Restore a dump made by backup.sh into an (empty or old) database, e.g. Neon.
#   TARGET_URL="postgresql://..." DUMP=backups/toppic-....dump npm run db:restore
# Use the *direct* (non-pooled) connection string for TARGET_URL.
set -euo pipefail
: "${TARGET_URL:?Set TARGET_URL to the database to restore into}"
: "${DUMP:?Set DUMP to the .dump file from db:backup}"
cd "$(dirname "$0")/../.."
[ -f "$DUMP" ] || { echo "No such file: $DUMP" >&2; exit 1; }

HOST=$(printf '%s' "$TARGET_URL" | sed -E 's#^[a-z]+://[^@]*@([^/:?]+).*#\1#')
echo "About to restore $DUMP into host: $HOST"
echo "Existing tables with the same names in the 'public' schema will be DROPPED and recreated."
if [ "${YES:-}" != "1" ]; then read -r -p "Type the host name to confirm: " ANSWER; [ "$ANSWER" = "$HOST" ] || { echo "Cancelled."; exit 1; }; fi

# --clean --if-exists makes re-running safe; owners/ACLs are dropped because the target role differs.
pg_restore --dbname="$TARGET_URL" --no-owner --no-acl --clean --if-exists --single-transaction "$DUMP"
echo "restore finished"
