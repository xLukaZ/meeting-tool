#!/bin/bash
# Installs the reminder cron job automatically from .env
# Run once after first deploy, and again if SESSION_SECRET changes
# Usage: bash deployment/setup-cron.sh
set -e

ENV_FILE="/var/www/meeting-tool/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env not found at $ENV_FILE — deploy first."
  exit 1
fi

SESSION_SECRET=$(grep -E '^SESSION_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
APP_URL=$(grep -E '^APP_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")

if [ -z "$SESSION_SECRET" ]; then
  echo "Error: SESSION_SECRET not found in .env"
  exit 1
fi
if [ -z "$APP_URL" ]; then
  echo "Error: APP_URL not found in .env"
  exit 1
fi

CRON_LINE="*/15 * * * * curl -sf -H \"x-cron-secret: ${SESSION_SECRET}\" ${APP_URL}/api/cron/reminders > /dev/null 2>&1"

# Remove old entry if present, then add fresh
( crontab -l 2>/dev/null | grep -v 'api/cron/reminders' ; echo "$CRON_LINE" ) | crontab -

echo "==> Cron installed successfully:"
echo "    $CRON_LINE"
