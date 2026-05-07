#!/bin/bash
# Run on the VPS every time you push an update
# Usage: bash deployment/deploy.sh
set -e

APP_DIR="/var/www/meeting-tool"
cd "$APP_DIR"

echo "==> Pulling latest code"
git pull

echo "==> Installing dependencies"
npm ci

echo "==> Syncing database schema"
npx prisma db push --accept-data-loss

echo "==> Generating Prisma client"
npx prisma generate

echo "==> Building"
npm run build

echo "==> Restarting service"
systemctl restart meeting-tool
systemctl status meeting-tool --no-pager

echo "==> Done"
echo ""
echo "    Reminder: if this is the first deploy, also run:"
echo "    bash deployment/setup-cron.sh"
