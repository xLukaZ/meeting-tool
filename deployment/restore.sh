#!/bin/bash
# Restores a backup on a new VPS — run AFTER first-setup.sh
# Usage: bash deployment/restore.sh /path/to/backup-20240101-120000.tar.gz
set -e

BACKUP_FILE="${1:?Usage: bash deployment/restore.sh <backup-file.tar.gz>}"
APP_DIR="/var/www/meeting-tool"
WORK_DIR="/tmp/meeting-tool-restore"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "==> Extracting backup"
mkdir -p "$WORK_DIR"
tar -xzf "$BACKUP_FILE" -C "$WORK_DIR"

SQL_FILE=$(ls "$WORK_DIR"/*.sql 2>/dev/null | head -1)
ENV_FILE="$WORK_DIR/.env"

if [ -z "$SQL_FILE" ]; then
  echo "Error: No .sql file found in backup"
  exit 1
fi

echo "==> Restoring PostgreSQL database"
sudo -u postgres psql -c "DROP DATABASE IF EXISTS meetingtool;"
sudo -u postgres psql -c "CREATE DATABASE meetingtool OWNER meetingtool;"
sudo -u postgres psql meetingtool < "$SQL_FILE"
echo "    Database restored."

if [ -f "$ENV_FILE" ]; then
  echo "==> Restoring .env"
  cp "$ENV_FILE" "$APP_DIR/.env"
  chown www-data:www-data "$APP_DIR/.env"
  echo "    .env restored — update APP_URL and GOOGLE_REDIRECT_URI for new domain if changed."
else
  echo "    No .env in backup — make sure $APP_DIR/.env exists before deploying."
fi

rm -rf "$WORK_DIR"

echo ""
echo "==> Restore complete. Next steps:"
echo "  1. If domain changed: update APP_URL + GOOGLE_REDIRECT_URI in .env"
echo "  2. Run: bash $APP_DIR/deployment/deploy.sh"
echo "  3. Run: bash $APP_DIR/deployment/setup-cron.sh"
