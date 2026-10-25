#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 2 ]]; then
  echo "usage: $0 INPUT_DUMP OUTPUT_DUMP" >&2
  exit 64
fi

input_dump="$1"
output_dump="$2"

if [[ ! -f "$input_dump" ]]; then
  echo "input dump not found: $input_dump" >&2
  exit 66
fi

# G1-P01 compares user-managed schema structure. ACL statements are excluded
# because the linked project retains legacy auto-exposure grants while a clean
# current CLI stack uses the new default-deny Data API posture. Grants remain a
# separate, explicit concern of the accepted persistence/RLS contract.
sed -E \
  -e '/^(GRANT|REVOKE|ALTER DEFAULT PRIVILEGES)/d' \
  -e '/^[[:space:]]*$/d' \
  "$input_dump" > "$output_dump"
