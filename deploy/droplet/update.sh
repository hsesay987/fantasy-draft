#!/usr/bin/env bash
# Pull latest code, rebuild the image, apply Prisma migrations and restart the API. Run on the droplet.
set -euo pipefail
APP=/opt/toppic
cd "$APP" && git pull --ff-only
docker build -t toppic-api backend
# Migrations use the DIRECT database URL (MIGRATE_DATABASE_URL in /etc/toppic.env).
docker run --rm --env-file /etc/toppic.env toppic-api npx prisma migrate deploy
docker rm -f toppic-api 2>/dev/null || true
docker run -d --name toppic-api --restart unless-stopped --env-file /etc/toppic.env -p 127.0.0.1:8080:8080 toppic-api
sleep 4
curl -fsS http://127.0.0.1:8080/health && echo && echo "API up"
