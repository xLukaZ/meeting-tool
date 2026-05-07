#!/bin/bash
# Creates a full backup: PostgreSQL dump + .env
# Restoring on a new VPS: see deployment/restore.sh
# Usage: bash deployment/backup.sh
set -e

APP_DIR="/var/www/meeting-tool"
BACKUP_DIR="/root/meeting-tool-backups"
DATE=$(date +%Y%m%d-%H%M%S)
SQL_FILE="/tmp/meetingtool-${DATE}.sql"
BACKUP_FILE="${BACKUP_DIR}/backup-${DATE}.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "==> Dumping PostgreSQL database"
sudo -u postgres pg_dump meetingtool > "$SQL_FILE"

echo "==> Creating archive"
tar -czf "$BACKUP_FILE" \
  -C /tmp "meetingtool-${DATE}.sql" \
  -C "$APP_DIR" ".env"

rm -f "$SQL_FILE"

echo "==> Backup saved: $BACKUP_FILE"
echo "    Size: $(du -sh "$BACKUP_FILE" | cut -f1)"
echo ""
echo "    To transfer to another machine:"
echo "    scp root@$(hostname -I | awk '{print $1}'):$BACKUP_FILE ."
