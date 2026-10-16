#!/usr/bin/env bash
# Starts the API (port 4001) and the web app (port 3000) together. Ctrl+C stops both.
set -e
cd "$(dirname "$0")/.."
trap 'kill 0' EXIT INT TERM
(cd backend && PORT=4001 CORS_ORIGIN=http://localhost:3000 npx ts-node --transpile-only src/server.ts) &
NEXT_PUBLIC_API_URL=http://localhost:4001 npx next dev -p 3000 &
wait
