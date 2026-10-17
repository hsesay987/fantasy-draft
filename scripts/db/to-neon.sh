#!/usr/bin/env bash
# One-shot move to Neon. Reads connection strings from your clipboard so passwords never touch chat or shell history.
#   npm run db:to-neon
# Needs: backend/.env.local with the current (Supabase) DATABASE_URL, and the dump in backups/ (made by db:backup).
set -euo pipefail
cd "$(dirname "$0")/../.."
ENVF=backend/.env.local
[ -f "$ENVF" ] || { echo "Missing $ENVF" >&2; exit 1; }

grab() { # $1 = prompt, $2 = must-contain-pooler (1/0)
  read -r -p "$1 then press Enter... " _
  local u; u=$(pbpaste | tr -d '\r' | grep -Eo 'postgres(ql)?://[^[:space:]"'"'"']+' | head -1 || true)
  [ -n "$u" ] || { echo "Clipboard has no postgres:// URL. Use Neon's 'Copy snippet'." >&2; exit 1; }
  if [ "$2" = 1 ]; then case "$u" in *-pooler*) ;; *) echo "That is the DIRECT url; need the pooled one (Connection pooling ON)." >&2; exit 1;; esac
  else case "$u" in *-pooler*) echo "That is the POOLED url; need the direct one (Connection pooling OFF)." >&2; exit 1;; esac; fi
  case "$u" in *neon.tech*) ;; *) echo "Not a neon.tech URL." >&2; exit 1;; esac
  printf '%s' "$u"
}

POOLED=$(grab "In Neon: Connection pooling ON, click 'Copy snippet'" 1); echo " ok (pooled, host $(printf '%s' "$POOLED" | sed -E 's#.*@([^/:?]+).*#\1#'))"
DIRECT=$(grab "Now turn Connection pooling OFF and click 'Copy snippet'" 0); echo " ok (direct, host $(printf '%s' "$DIRECT" | sed -E 's#.*@([^/:?]+).*#\1#'))"

SOURCE=$(grep -E '^DATABASE_URL=' "$ENVF" | head -1 | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//')
[ -n "$SOURCE" ] || { echo "No DATABASE_URL in $ENVF" >&2; exit 1; }

echo "== fresh backup of current database"
SOURCE_URL="$SOURCE" npm run --silent db:backup
DUMP=$(ls -t backups/toppic-*.dump | head -1)

echo "== restore $DUMP into Neon"
TARGET_URL="$DIRECT" DUMP="$DUMP" YES=1 npm run --silent db:restore

echo "== verify row counts"
SOURCE_URL="$SOURCE" TARGET_URL="$DIRECT" npm run --silent db:verify

echo "== switch backend/.env.local to Neon (old file kept as .env.local.supabase)"
cp "$ENVF" backend/.env.local.supabase
python3 - "$ENVF" "$POOLED" "$DIRECT" <<'PY'
import sys,re
f,pooled,direct=sys.argv[1:4]
lines=[l for l in open(f).read().splitlines() if not re.match(r'^(DATABASE_URL|MIGRATE_DATABASE_URL)=',l)]
lines+=[f'DATABASE_URL="{pooled}"',f'MIGRATE_DATABASE_URL="{direct}"']
open(f,'w').write("\n".join(lines)+"\n")
PY
echo "done. Restart the API (npm run dev:all)."
