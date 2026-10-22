#!/bin/sh
set -eu
node scripts/assert-runtime.mjs
node scripts/assert-redesign.mjs
node scripts/migrate.mjs
node scripts/seed-governance.mjs
exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0
