#!/bin/sh
set -eu

echo "==> Checking TypeScript"
npx tsc --noEmit --pretty false

echo "==> Checking workflow invariants"
npm run check:workflows

echo "==> Checking care scheduling invariants"
npm run check:care-scheduling

echo "==> Checking measurement unit conversions"
npm run check:units

echo "==> Checking Magic Fill merge invariants"
npm run check:magic-fill

echo "==> Checking plant identity and acquisition-label invariants"
npm run check:plant-identity

echo "==> Checking Plant Definition Tag invariants"
npm run check:plant-tags

echo "==> Checking provenance model invariants"
npm run check:provenance

echo "==> Checking treatment management invariants"
npm run check:treatments

echo "==> Checking substrate management invariants"
npm run check:substrates

echo "==> Checking event engine invariants"
npm run check:events

echo "==> Checking collection-scoped query guardrail"
npm run check:collection-scope

echo "==> Checking default collection assumptions"
npm run check:collection-defaults

if [ -n "${DATABASE_URL:-}" ]; then
  echo "==> Checking database collection integrity"
  npm run check:collection-integrity
  npm run provenance:check
else
  echo "==> Skipping database collection integrity: DATABASE_URL is not set"
fi

echo "==> Building application"
npm run build

echo "Production check passed."
