#!/bin/sh
# Builds the nestjs example (examples/examples-backend/tasks_api) and checks the generated TypeScript: tsc --strict,
# its tests in Nuclear (node:test) and an end-to-end run (smoke.mjs). Needs tools/node (npm install there, then
# `npm install --no-save ../../packages/dragonfly-nest` after building it).
set -e
# the working tree (plan 006): this repository (dragonfly-backend) inside the `nuclear` one, or NUCLEAR_ROOT
here=$(cd "$(dirname "$0")/../.." && pwd)
root=${NUCLEAR_ROOT:-$(cd "$here/.." && pwd)}
nm="$root/tools/node/node_modules"
# build the runtime, then copy it fresh (npm keeps an old copy of the same version; a `--no-save` install also
# prunes the other runtime linked the same way)
(cd "$here/packages/dragonfly-nest" && node "$nm/typescript/bin/tsc" -p tsconfig.json)
rm -rf "$nm/dragonfly-nest"
(cd "$root/tools/node" && npm install --no-save --no-audit --no-fund --install-links "$here/packages/dragonfly-nest" >/dev/null 2>&1)
p="$here/examples/examples-backend/tasks_api"
rm -rf "$p/build"
(cd "$root" && cargo run -q -p nuclear-cli -- build "$p")
ln -sfn "$nm" "$p/build/node_modules"
cd "$p/build"
node "$nm/typescript/bin/tsc" -p tsconfig.json && echo "tsc --strict: 0 errors"
tests() { out=$(node --test "$@" 2>&1) || { echo "$out"; exit 1; }; echo "$out" | grep -E '^ℹ (pass|fail)'; }
tests "dist/test/**/*.js"
node "$here/tools/nestjs-check/smoke.mjs" "$p/build"
# ADR-0100 §5: the migrations of the example, made from its entities and applied to a fresh SQLite; then nothing is
# left to make
m=$(mktemp -d)
export DATABASE="$m/fresh.sqlite"
migrate() { node node_modules/dragonfly-nest/dist/migrate.js "$@" --dir "$m/migrations"; }
migrate make "first" >/dev/null && migrate up >/dev/null && migrate make "again" | grep -q "no changes"
unset DATABASE
rm -rf "$m"
echo "migrations: made, applied, nothing left"
cd "$here/packages/dragonfly-nest" && node "$nm/typescript/bin/tsc" -p tsconfig.test.json && tests "dist-test/test/**/*.js"
