#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 2 ]]; then
  echo "usage: $0 REMOTE_DUMP LOCAL_DUMP" >&2
  exit 64
fi

repo_root="$(git rev-parse --show-toplevel)"
normalizer="$repo_root/scripts/db/migration-parity/normalize-public-schema.sh"
remote_dump="$1"
local_dump="$2"

temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

remote_normalized="$temp_dir/remote-public.normalized.sql"
local_normalized="$temp_dir/local-public.normalized.sql"

"$normalizer" "$remote_dump" "$remote_normalized"
"$normalizer" "$local_dump" "$local_normalized"

shasum -a 256 "$remote_normalized" "$local_normalized"
diff -u "$remote_normalized" "$local_normalized"

echo "Normalized public schemas are identical."
