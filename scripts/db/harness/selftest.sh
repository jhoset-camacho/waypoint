#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
# Each run owns and cleans an independent project; originals are never edited.
for mode in invalid-migration invalid-sql; do
  expected=20
  [[ $mode != invalid-sql ]] || expected=30
  result=0
  bash "$here/run.sh" "$mode" || result=$?
  if [[ $result != "$expected" ]]; then
    echo "[harness:selftest] FAIL: $mode returned $result, expected $expected" >&2
    exit 1
  fi
  echo "[harness:selftest] PASS: $mode returned $expected after cleanup"
done
bash "$here/run.sh"
echo '[harness:selftest] PASS: final unmodified tree is green'
