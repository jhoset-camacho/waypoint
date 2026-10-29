#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
for key in GITHUB_TOKEN GHCR_TOKEN GH_TOKEN DOCKER_AUTH_CONFIG REGISTRY_AUTH_FILE; do
  [[ -z ${!key+x} ]] || { echo '[database:registry-isolation] FAIL: credential environment input' >&2; exit 20; }
done
node "$here/credentials.mjs" --check
node "$here/credentials.test.mjs"
node "$here/offline-docker.test.mjs"
# Compare the entire tracked diff, including staged changes; works before commit too.
before=$(git -C "$root" diff HEAD --binary | shasum -a 256)
node "$here/plan.test.mjs"
node "$here/discovery.test.mjs"
node "$here/diagnostics.test.mjs"
node "$here/startup.test.mjs"
node "$here/startup-entry.test.mjs"
node "$here/snapshot.test.mjs"
node "$here/adversarial-integration.mjs"
node "$here/ports.test.mjs"
cleanup_failed=0
log=
trap '[[ -z $log ]] || rm -f "$log"' EXIT
for scenario in modified-baseline missing-baseline baseline valid-candidate invalid-migration valid-module invalid-module invalid-sql verify; do
  expected=0
  case "$scenario" in modified-baseline|missing-baseline|invalid-migration) expected=20 ;; invalid-module|invalid-sql) expected=30 ;; esac
  result=0
  log=$(mktemp)
  bash "$here/run.sh" "$scenario" >"$log" 2>&1 || result=$?
  node "$here/diagnostics.mjs" --text "$log"
  if grep -q '\[database:cleanup\] FAIL' "$log"; then cleanup_failed=1; fi
  proof='[database:verify] PASS'
  case "$scenario" in
    modified-baseline|missing-baseline) proof='[database:plan] FAIL' ;;
    baseline) proof='[database:baseline] PASS: independent' ;;
    invalid-migration) proof='[database:migration] FAIL: Local rebuild failed' ;;
    invalid-module) proof='FAIL: module-harness-fixture assertion' ;;
    invalid-sql) proof='[database:sql] FAIL: Deliberate SQL failure' ;;
    valid-module) proof='[database:authorization] PASS' ;;
  esac
  if ! grep -Fq "$proof" "$log" || ! grep -Fq '[database:cleanup] PASS' "$log"; then
    node "$here/diagnostics.mjs" --result "$scenario" "$result" "$expected" "$log"
    echo "[harness:selftest] FAIL: $scenario did not reach its intended stage or cleanup" >&2
    rm -f "$log"
    exit 1
  fi
  if [[ $result != "$expected" || $cleanup_failed != 0 ]]; then
    node "$here/diagnostics.mjs" --result "$scenario" "$result" "$expected" "$log"
    rm -f "$log"
    echo "[harness:selftest] FAIL: $scenario returned $result, expected $expected; cleanup_failed=$cleanup_failed" >&2
    exit 1
  fi
  rm -f "$log"
  echo "[harness:selftest] PASS: $scenario returned $expected after cleanup"
done
[[ $(git -C "$root" diff HEAD --binary | shasum -a 256) == "$before" ]] || { echo '[harness:selftest] FAIL: tracked tree changed'; exit 1; }
echo '[harness:selftest] PASS: final reconstruction green; tracked tree intact'
