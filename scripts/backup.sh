#!/usr/bin/env bash
# Daily PostgreSQL backup script for Smart Stable Manager
# Add to crontab: 0 3 * * * /opt/stable-manager/scripts/backup.sh
set -euo pipefail

BACKUP_DIR="/opt/stable-manager/backups"
CONTAINER_NAME="horse-manager-db-1"
DB_USER="${POSTGRES_USER:-stablemanager}"
DB_NAME="${POSTGRES_DB:-stablemanager}"
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "Starting backup: $BACKUP_FILE"
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"

# Remove backups older than retention period
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

echo "Backup complete. Size: $(du -h "$BACKUP_FILE" | cut -f1)"
echo "Backups in $BACKUP_DIR: $(ls -1 "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)"
