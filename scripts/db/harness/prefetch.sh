#!/usr/bin/env bash
# This phase may see the registry token; it never invokes Node or Supabase.
set +x
set -euo pipefail
umask 077
here=$(cd "$(dirname "$0")" && pwd)
[[ -n ${WP_PREFETCH_CONFIG:-} && -n ${GHCR_TOKEN:-} && -n ${GHCR_USER:-} ]] || { echo '[database:prefetch] FAIL: missing phase inputs' >&2; exit 20; }
for helper in pass secretservice osxkeychain wincred; do
  if command -v "docker-credential-$helper" >/dev/null 2>&1; then echo '[database:prefetch] FAIL: implicit credential helper present' >&2; exit 20; fi
done
# Exclusive directory; never inherit Docker config or a credential helper.
mkdir "$WP_PREFETCH_CONFIG" || { echo '[database:prefetch] FAIL: phase config already exists' >&2; exit 20; }
export DOCKER_CONFIG="$WP_PREFETCH_CONFIG"
cleanup() {
  primary=$?
  trap - EXIT INT TERM
  failed=0
  docker logout ghcr.io >/dev/null 2>&1 || true
  rm -rf -- "$DOCKER_CONFIG" || failed=1
  [[ ! -e $DOCKER_CONFIG && ! -L $DOCKER_CONFIG ]] || failed=1
  if [[ $failed == 1 ]]; then
    echo "[database:prefetch] FAIL: cleanup; primary=$primary; cleanup=40" >&2
    [[ $primary != 0 ]] || primary=40
  else echo '[database:prefetch] PASS: authenticated config removed'; fi
  exit "$primary"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '{}\n' > "$DOCKER_CONFIG/config.json"
if printf '%s' "$GHCR_TOKEN" | docker login ghcr.io --username "$GHCR_USER" --password-stdin >"$DOCKER_CONFIG/login.log" 2>&1; then :; else
  primary=$?; echo '[database:prefetch] FAIL: registry login (private output suppressed)' >&2; exit "$primary"
fi
# Docker reads config, not token environment variables, for the remaining pulls.
unset GHCR_TOKEN GITHUB_TOKEN GH_TOKEN DOCKER_AUTH_CONFIG REGISTRY_AUTH_FILE
count=0
while IFS= read -r image || [[ -n $image ]]; do
  [[ $image =~ ^ghcr\.io/supabase/[a-z-]+:[a-zA-Z0-9.-]+$ && $image != *:latest ]] || { echo '[database:prefetch] FAIL: invalid pinned image' >&2; exit 20; }
  count=$((count+1))
  if docker pull "$image" >"$DOCKER_CONFIG/pull.log" 2>&1; then :; else
    primary=$?
    category=other-pull
    if grep -Eqi 'denied|unauthorized|manifest unknown|not found' "$DOCKER_CONFIG/pull.log"; then category=image-unavailable
    elif grep -Eqi 'toomanyrequests|429' "$DOCKER_CONFIG/pull.log"; then category=registry-rate-limit; fi
    echo "[database:prefetch] FAIL: category=$category; image=$image (private output suppressed)" >&2; exit "$primary"
  fi
  docker image inspect "$image" >"$DOCKER_CONFIG/inspect.log" 2>&1 || { echo '[database:prefetch] FAIL: required image absent after pull' >&2; exit 20; }
  echo "[database:prefetch] PASS: $image"
done < "$here/images.txt"
[[ $count == 5 ]] || { echo '[database:prefetch] FAIL: incomplete image set' >&2; exit 20; }
