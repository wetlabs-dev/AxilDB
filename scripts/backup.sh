#!/usr/bin/env sh
set -eu

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_root="${1:-backups}"
backup_dir="${AXILDB_BACKUP_DIR:-${backup_root%/}/axildb-${timestamp}}"

mkdir -p "$backup_dir"
mkdir -p public/uploads public/labels

resolve_git_commit() {
  if [ -n "${GIT_COMMIT:-}" ]; then
    printf '%s\n' "$GIT_COMMIT"
    return
  fi
  if [ -n "${SOURCE_COMMIT:-}" ]; then
    printf '%s\n' "$SOURCE_COMMIT"
    return
  fi
  if [ -n "${VERCEL_GIT_COMMIT_SHA:-}" ]; then
    printf '%s\n' "$VERCEL_GIT_COMMIT_SHA"
    return
  fi
  if [ -n "${RENDER_GIT_COMMIT:-}" ]; then
    printf '%s\n' "$RENDER_GIT_COMMIT"
    return
  fi
  if git rev-parse --verify HEAD >/dev/null 2>&1; then
    git rev-parse --short HEAD
    return
  fi
  if [ -n "${NEXT_PUBLIC_APP_VERSION:-}" ]; then
    printf '%s\n' "$NEXT_PUBLIC_APP_VERSION"
    return
  fi
  printf '%s\n' "unknown"
}

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
  echo "git_commit=$(resolve_git_commit)"
  echo "database=axildb"
  echo "database_format=pg_dump_custom"
} > "$backup_dir/manifest.txt"

echo "Backup complete:"
echo "  $backup_dir/axildb.dump"
echo "  $backup_dir/uploads.tar.gz"
echo "  $backup_dir/labels.tar.gz"
