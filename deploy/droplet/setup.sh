#!/usr/bin/env bash
# Run ONCE on a fresh Ubuntu droplet as root:  bash setup.sh
# Installs Docker, nginx and certbot, clones the repo, writes nginx for api.toppicgames.com and starts the API.
set -euo pipefail
DOMAIN="${DOMAIN:-api.toppicgames.com}"
EMAIL="${EMAIL:-hello@toppicgames.com}"
REPO="${REPO:-https://github.com/hsesay987/fantasy-draft.git}"
BRANCH="${BRANCH:-main}"
APP=/opt/toppic

apt-get update -y
apt-get install -y ca-certificates curl git nginx certbot python3-certbot-nginx ufw
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

ufw allow OpenSSH; ufw allow 'Nginx Full'; ufw --force enable

[ -d "$APP/.git" ] || git clone "$REPO" "$APP"
cd "$APP" && git fetch --all && git checkout "$BRANCH" && git pull --ff-only

[ -f /etc/toppic.env ] || { cp deploy/droplet/api.env.example /etc/toppic.env; chmod 600 /etc/toppic.env; echo ">> Edit /etc/toppic.env (database + keys), then run: bash $APP/deploy/droplet/update.sh"; }

cat > /etc/nginx/sites-available/toppic-api <<NGINX
server {
  listen 80;
  server_name $DOMAIN;
  client_max_body_size 5m;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 3600s;
  }
}
NGINX
ln -sf /etc/nginx/sites-available/toppic-api /etc/nginx/sites-enabled/toppic-api
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --no-eff-email --redirect -n || echo "certbot failed: check that $DOMAIN points at this droplet"
echo "setup done"
