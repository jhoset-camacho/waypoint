#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

parity_dir="scripts/db/migration-parity"

shasum -a 256 -c "$parity_dir/source-manifest.sha256"

actual_list="$(mktemp)"
trap 'rm -f "$actual_list"' EXIT

find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print \
  | LC_ALL=C sort > "$actual_list"

diff -u "$parity_dir/expected-migrations.txt" "$actual_list"

echo "Migration source hashes and exact 001-009 file set verified."
