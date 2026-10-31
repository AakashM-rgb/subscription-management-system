#!/usr/bin/env bash
# Nightly logical backup of the Brightloop database (run on the Docker host from the repo root).
#   crontab:  15 2 * * *  cd /opt/brightloop && ./deploy/backup.sh >> /var/log/brightloop-backup.log 2>&1
# Optional off-site copy: set BACKUP_RCLONE_REMOTE (e.g. "s3:brightloop-backups") in .env.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; source .env; set +a

BACKUP_DIR="${BACKUP_DIR:-/var/backups/brightloop}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/brightloop-$STAMP.dump"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Custom format (-Fc): compressed, restorable selectively with pg_restore.
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$FILE.partial"
mv "$FILE.partial" "$FILE"
chmod 600 "$FILE"

# Sanity check: the archive must be readable and contain the invoices table.
docker compose exec -T db pg_restore --list < "$FILE" | grep -q "TABLE public invoices"
sha256sum "$FILE" > "$FILE.sha256"
echo "$(date -u +%FT%TZ) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"

if [[ -n "${BACKUP_RCLONE_REMOTE:-}" ]]; then
  rclone copy "$FILE" "$BACKUP_RCLONE_REMOTE/" && rclone copy "$FILE.sha256" "$BACKUP_RCLONE_REMOTE/"
  echo "copied off-site to $BACKUP_RCLONE_REMOTE"
fi

find "$BACKUP_DIR" -name 'brightloop-*.dump*' -mtime +"$KEEP_DAYS" -delete
