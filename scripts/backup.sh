#!/usr/bin/env sh
set -eu

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_root="${1:-backups}"
backup_dir="${backup_root%/}/axildb-${timestamp}"

mkdir -p "$backup_dir"
mkdir -p public/uploads public/labels

echo "Creating AxilDB backup in $backup_dir"

docker compose exec -T db pg_dump -U plants -d axildb -Fc > "$backup_dir/axildb.dump"
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
