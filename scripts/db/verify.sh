#!/usr/bin/env bash
# Compare row counts of every public table between two databases.
#   SOURCE_URL=... TARGET_URL=... npm run db:verify
set -euo pipefail
: "${SOURCE_URL:?Set SOURCE_URL}"; : "${TARGET_URL:?Set TARGET_URL}"
tables=$(psql "$SOURCE_URL" -Atc "select tablename from pg_tables where schemaname='public' order by 1")
fail=0
printf "%-28s %12s %12s\n" TABLE SOURCE TARGET
for t in $tables; do
  a=$(psql "$SOURCE_URL" -Atc "select count(*) from \"public\".\"$t\"")
  b=$(psql "$TARGET_URL" -Atc "select count(*) from \"public\".\"$t\"" 2>/dev/null || echo MISSING)
  mark=""; [ "$a" = "$b" ] || { mark="  <-- MISMATCH"; fail=1; }
  printf "%-28s %12s %12s%s\n" "$t" "$a" "$b" "$mark"
done
[ $fail = 0 ] && echo "OK: every table matches" || { echo "Some tables differ"; exit 1; }
