#!/usr/bin/env sh
set -eu
# Keep the existing entry point and artifact format. Full migrations and routine
# backups share the PostgreSQL dump and streaming filesystem implementation.
exec python3 scripts/migration/routine.py "${1:-${AXILDB_BACKUP_ROOT:-backups}}"
