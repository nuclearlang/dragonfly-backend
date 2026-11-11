#!/bin/sh
# Builds the fastapi example (examples/examples-fastapi/rick_api) and checks the generated Python:
# pyright --strict, its tests in Nuclear (pytest) and an end-to-end run (smoke.py: HTTP, agent, graph).
# Needs tools/python/.venv (tools/python/requirements.txt + pip install -e packages/dragonfly-py).
set -e
# the working tree (plan 006): this repository (dragonfly-backend) inside the `nuclear` one, or NUCLEAR_ROOT
here=$(cd "$(dirname "$0")/../.." && pwd)
root=${NUCLEAR_ROOT:-$(cd "$here/.." && pwd)}
V="$root/tools/python/.venv/bin"
# a command's last line, and its whole output when it fails (a pipe to tail would hide the failure)
last() { out=$("$@" 2>&1) || { echo "$out"; exit 1; }; echo "$out" | tail -1; }
p="$here/examples/examples-fastapi/rick_api"
rm -rf "$p/build"
(cd "$root" && cargo run -q -p nuclear-cli -- build "$p")
cd "$p/build"
last "$V/pyright" --pythonpath "$V/python"
last "$V/python" -m pytest -q -p no:warnings
PYTHONPATH=. "$V/python" "$here/tools/fastapi-check/smoke.py"
last "$V/python" -m pytest -q -p no:warnings "$here/packages/dragonfly-py/tests"
# ADR-0093 §9: the backend example (examples/examples-backend/tasks_api, written for nestjs) builds with fastapi too
c=$(mktemp -d)
cp -r "$here/examples/examples-backend/tasks_api/." "$c" && rm -rf "$c/build"
sed -i 's/dialect = "nestjs"/dialect = "fastapi"/' "$c/config.nuc"
(cd "$root" && cargo run -q -p nuclear-cli -- build "$c")
cd "$c/build"
last "$V/pyright" --pythonpath "$V/python"
last "$V/python" -m pytest -q -p no:warnings
# ADR-0100 §5: its migrations, made from the entities and applied to a fresh SQLite; then nothing is left to make
export DATABASE="$c/fresh.sqlite"
last "$V/python" -m dragonfly.migrate make "first" --dir "$c/migrations"
last "$V/python" -m dragonfly.migrate up --dir "$c/migrations"
"$V/python" -m dragonfly.migrate make "again" --dir "$c/migrations" | grep -q "no changes"
unset DATABASE
echo "migrations: made, applied, nothing left"
rm -rf "$c"
echo "conformance: tasks_api built with fastapi ok"
