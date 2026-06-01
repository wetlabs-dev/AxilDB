#!/bin/sh
set -eu

SCHEMA_PATH="${PRISMA_SCHEMA_PATH:-prisma/schema.prisma}"
BASELINE_MIGRATION="20260601000000_initial_baseline"
DB_SCHEMA="${AXILDB_DATABASE_SCHEMA:-public}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required to deploy Prisma migrations." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to deploy AxilDB migrations safely." >&2
  echo "The Docker migrate image includes it; install the PostgreSQL client for local use." >&2
  exit 1
fi

# Prisma accepts ?schema=public in DATABASE_URL, but psql/libpq does not.
PSQL_DATABASE_URL="${DATABASE_URL%%\?*}"

quote_literal() {
  printf "%s" "$1" | sed "s/'/''/g"
}

SQL_SCHEMA="$(quote_literal "$DB_SCHEMA")"
MIGRATIONS_TABLE_EXISTS="$(psql "$PSQL_DATABASE_URL" -tAc "SELECT to_regclass('${SQL_SCHEMA}.\"_prisma_migrations\"') IS NOT NULL;")"
USER_TABLE_COUNT="$(psql "$PSQL_DATABASE_URL" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = '${SQL_SCHEMA}' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations';")"

if [ "$MIGRATIONS_TABLE_EXISTS" = "f" ] && [ "$USER_TABLE_COUNT" != "0" ]; then
  echo "Existing AxilDB tables found without Prisma migration history."
  echo "Checking schema drift before marking the initial migration as already applied..."

  DIFF_FILE="${TMPDIR:-/tmp}/axildb-prisma-drift.sql"
  set +e
  npx prisma migrate diff \
    --from-url "$DATABASE_URL" \
    --to-schema-datamodel "$SCHEMA_PATH" \
    --script \
    --exit-code > "$DIFF_FILE"
  DIFF_STATUS=$?
  set -e

  if [ "$DIFF_STATUS" -eq 2 ]; then
    echo "The existing database does not match the Prisma schema. Refusing to baseline automatically." >&2
    echo "Review the drift below, back up the database, and resolve it before deploying migrations." >&2
    cat "$DIFF_FILE" >&2
    exit 1
  fi

  if [ "$DIFF_STATUS" -ne 0 ]; then
    echo "Could not compare the existing database with the Prisma schema." >&2
    cat "$DIFF_FILE" >&2
    exit "$DIFF_STATUS"
  fi

  npx prisma migrate resolve --schema "$SCHEMA_PATH" --applied "$BASELINE_MIGRATION"
fi

npx prisma migrate deploy --schema "$SCHEMA_PATH"
