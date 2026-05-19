#!/usr/bin/env sh
set -eu

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_root="${1:-backups}"
backup_dir="${AXILDB_BACKUP_DIR:-${backup_root%/}/axildb-${timestamp}}"

mkdir -p "$backup_dir"
mkdir -p public/uploads public/labels

echo "Creating AxilDB backup in $backup_dir"

if [ -n "${DATABASE_URL:-}" ] && command -v pg_dump >/dev/null 2>&1; then
  dump_url="$(printf '%s' "$DATABASE_URL" | sed -E 's/[?&]schema=[^&]*//; s/\?&/?/; s/[?&]$//')"
  pg_dump "$dump_url" -Fc > "$backup_dir/axildb.dump"
else
  docker compose exec -T db pg_dump -U plants -d axildb -Fc > "$backup_dir/axildb.dump"
fi
tar -czf "$backup_dir/uploads.tar.gz" public/uploads
tar -czf "$backup_dir/labels.tar.gz" public/labels

{
  echo "created_at=$timestamp"
  echo "git_commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "database=axildb"
  echo "database_format=pg_dump_custom"
} > "$backup_dir/manifest.txt"

echo "Backup complete:"
echo "  $backup_dir/axildb.dump"
echo "  $backup_dir/uploads.tar.gz"
echo "  $backup_dir/labels.tar.gz"
