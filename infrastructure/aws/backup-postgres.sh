#!/usr/bin/env bash
# OrthoCare AI — daily PostgreSQL backup with configurable retention.
#
# Intended to run via cron on the EC2 host, e.g.:
#   0 2 * * * APP_ENV_FILE=/opt/orthocare/.env /opt/orthocare/infrastructure/aws/backup-postgres.sh >> /var/log/orthocare-backup.log 2>&1
#
# Backups are LOCAL-ONLY private files (not uploaded anywhere by this script) —
# copy BACKUP_DIR off-host yourself if you want off-instance durability.
# Never make backups publicly accessible.
set -euo pipefail

APP_ENV_FILE="${APP_ENV_FILE:-/opt/orthocare/.env}"
BACKUP_DIR="${BACKUP_DIR:-/opt/orthocare/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

log() { echo "[backup-postgres] $(date -Iseconds) $*"; }

if [[ -f "$APP_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$APP_ENV_FILE"; set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not set (checked ${APP_ENV_FILE}). Aborting." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUT_FILE="${BACKUP_DIR}/orthocare-${TIMESTAMP}.sql.gz"

log "Dumping database to ${OUT_FILE}"
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip > "$OUT_FILE"
chmod 600 "$OUT_FILE"
log "Backup complete: $(du -h "$OUT_FILE" | cut -f1)"

log "Pruning backups older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -name 'orthocare-*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete

log "Done. Note: backup retention (${RETENTION_DAYS}d) is independent of the application's"
log "DATA_RETENTION_DAYS (patient operational data) and DOCUMENT_RETENTION_DAYS (clinic documents)."
