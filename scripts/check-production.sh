#!/bin/sh
set -eu

echo "==> Checking TypeScript"
npx tsc --noEmit --pretty false

echo "==> Checking collection-scoped query guardrail"
npm run check:collection-scope

echo "==> Checking default collection assumptions"
npm run check:collection-defaults

if [ -n "${DATABASE_URL:-}" ]; then
  echo "==> Checking database collection integrity"
  npm run check:collection-integrity
else
  echo "==> Skipping database collection integrity: DATABASE_URL is not set"
fi

echo "==> Building application"
npm run build

echo "Production check passed."
