#!/bin/bash
# Run once on a fresh VPS (Ubuntu 22.04 / Debian 12)
# Usage: bash deployment/first-setup.sh yourdomain.com
set -e

DOMAIN="${1:?Usage: bash deployment/first-setup.sh yourdomain.com}"
APP_DIR="/var/www/meeting-tool"

echo "==> Installing system packages"
apt update && apt install -y nginx certbot python3-certbot-nginx postgresql postgresql-contrib git curl

echo "==> Installing Node.js 20 LTS via NodeSource"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v && npm -v

echo "==> Creating PostgreSQL database and user"
DB_PASS=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 32)
sudo -u postgres psql <<SQL
CREATE USER meetingtool WITH PASSWORD '${DB_PASS}';
CREATE DATABASE meetingtool OWNER meetingtool;
SQL
echo "DB password: ${DB_PASS}  (save this — needed for .env)"

echo "==> Creating app directory"
mkdir -p "$APP_DIR"
chown www-data:www-data "$APP_DIR"

echo "==> Generating secrets"
SESSION_SECRET=$(openssl rand -base64 32)
TOKEN_KEY=$(openssl rand -hex 16)  # exactly 32 hex chars = 32 bytes readable
echo ""
echo "================================================================"
echo "Add these to your .env at ${APP_DIR}/.env :"
echo ""
echo "  APP_URL=https://${DOMAIN}"
echo "  PORT=3001"
echo "  DATABASE_URL=postgresql://meetingtool:${DB_PASS}@localhost:5432/meetingtool"
echo "  SESSION_SECRET=${SESSION_SECRET}"
echo "  TOKEN_ENCRYPTION_KEY=${TOKEN_KEY}"
echo "  GOOGLE_CLIENT_ID=<from Google Cloud Console>"
echo "  GOOGLE_CLIENT_SECRET=<from Google Cloud Console>"
echo "  GOOGLE_REDIRECT_URI=https://${DOMAIN}/api/team/callback"
echo "================================================================"
echo ""

echo "==> Configuring nginx"
NGINX_CONF="/etc/nginx/sites-available/meeting-tool"
cp "$(dirname "$0")/nginx.conf" "$NGINX_CONF"
sed -i "s/yourdomain.com/${DOMAIN}/g" "$NGINX_CONF"
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/meeting-tool
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> Obtaining SSL certificate"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@${DOMAIN}"

echo "==> Installing systemd service"
cp "$(dirname "$0")/meeting-tool.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable meeting-tool

echo ""
echo "================================================================"
echo "==> Setup complete. Next steps:"
echo "  1. Clone your repo:  git clone <repo-url> ${APP_DIR}"
echo "  2. Create .env:      cp ${APP_DIR}/.env.example ${APP_DIR}/.env"
echo "     Then fill in all values (secrets printed above)"
echo "  3. Deploy:           bash ${APP_DIR}/deployment/deploy.sh"
echo "  4. Cron einrichten:  bash ${APP_DIR}/deployment/setup-cron.sh"
echo ""
echo "  Google Cloud Console (einmalig konfigurieren):"
echo "    Authorized redirect URIs: https://${DOMAIN}/api/team/callback"
echo "    Authorized JS origins:    https://${DOMAIN}"
echo ""
echo "  VPS-Umzug später:"
echo "    Backup:  bash ${APP_DIR}/deployment/backup.sh"
echo "    Restore: bash ${APP_DIR}/deployment/restore.sh <backup-file>"
echo "================================================================"
