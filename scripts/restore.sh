#!/usr/bin/env sh
set -eu

backup_dir="${1:-}"

if [ -z "$backup_dir" ]; then
  echo "Usage: AXILDB_RESTORE_CONFIRM=YES scripts/restore.sh backups/axildb-YYYYMMDDTHHMMSSZ" >&2
  exit 1
fi

if [ "${AXILDB_RESTORE_CONFIRM:-}" != "YES" ]; then
  echo "Restore is destructive. Re-run with AXILDB_RESTORE_CONFIRM=YES to continue." >&2
  exit 1
fi

if [ ! -f "$backup_dir/axildb.dump" ]; then
  echo "Missing $backup_dir/axildb.dump" >&2
  exit 1
fi

echo "Restoring AxilDB database from $backup_dir"
docker compose up -d db
cat "$backup_dir/axildb.dump" | docker compose exec -T db pg_restore -U plants -d axildb --clean --if-exists --no-owner

if [ -f "$backup_dir/uploads.tar.gz" ]; then
  mkdir -p public/uploads
  tar -xzf "$backup_dir/uploads.tar.gz"
fi

if [ -f "$backup_dir/labels.tar.gz" ]; then
  mkdir -p public/labels
  tar -xzf "$backup_dir/labels.tar.gz"
fi

echo "Restore complete. Recreate the app containers when ready:"
echo "  docker compose up -d --build"
