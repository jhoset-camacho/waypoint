#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root=$(cd "$(dirname "$0")/../../.." && pwd)
mode=${1:-verify}
case "$mode" in verify|invalid-migration|invalid-sql) ;; *) echo 'Usage: run.sh [verify|invalid-migration|invalid-sql]' >&2; exit 10 ;; esac
fail() { echo "[database:$1] FAIL: $2" >&2; exit "$3"; }
command -v supabase >/dev/null || fail preflight 'Supabase CLI 2.106.0 is required' 10
command -v docker >/dev/null || fail preflight 'Docker is required' 10
[[ $(supabase --version) == 2.106.0 ]] || fail preflight 'Expected Supabase CLI 2.106.0' 10
docker info >/dev/null 2>&1 || fail preflight 'Docker daemon is unavailable' 10
# Fail closed rather than silently including future/domain migrations.
expected=$(cat "$root/scripts/db/migration-parity/expected-migrations.txt")
actual=$(cd "$root" && find supabase/migrations -type f -name '*.sql' | LC_ALL=C sort)
[[ "$actual" == "$expected" ]] || fail preflight 'Expected exactly migrations 001–009' 10
work=$(mktemp -d "${TMPDIR:-/tmp}/wp-g1-p02.XXXXXXXX")
project="wp-g1-p02-$(basename "$work" | tr '[:upper:].' '[:lower:]-')"
container="supabase_db_$project"
attempted=0
cleanup() {
  result=$?
  trap - EXIT INT TERM
  if [[ $attempted == 1 ]]; then
    if ! supabase stop --workdir "$work" --project-id "$project" --no-backup >"$work/stop.log" 2>&1; then
      echo '[database:cleanup] FAIL: stop failed' >&2
      result=40
    fi
    # Verify that even a failed start left no project containers or data volumes.
    containers=$(docker ps -aq --filter "label=com.supabase.cli.project=$project") || result=40
    volumes=$(docker volume ls -q --filter "label=com.supabase.cli.project=$project") || result=40
    if [[ -n $containers || -n $volumes ]]; then
      echo '[database:cleanup] FAIL: project resources remain' >&2
      result=40
    fi
  fi
  rm -rf "$work"
  [[ $result == 40 ]] || echo '[database:cleanup] PASS: disposable resources removed'
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# No .env, link metadata, seeds, functions or remote credentials enter this directory.
unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_ID DATABASE_URL PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
mkdir -p "$work/supabase/migrations"
sed "s/replaced-by-runner/$project/" "$root/scripts/db/harness/config.toml" > "$work/supabase/config.toml"
while IFS= read -r path; do cp "$root/$path" "$work/supabase/migrations/"; done <<< "$expected"
cd "$work"
attempted=1
echo '[database:startup] Starting isolated local database (CLI 2.106.0)'
# The 2.106.0 shell help lists aliases; its delegated runtime requires these names.
# No application migrations during start: migration errors belong to the reset stage.
if ! supabase start --workdir "$work" --exclude edge-runtime,gotrue,imgproxy,kong,logflare,mailpit,postgres-meta,postgrest,realtime,storage-api,studio,supavisor,vector >"$work/start.log" 2>&1; then
  fail startup 'Local Supabase could not start (check Docker and ports 56320–56322)' 11
fi
ready=0
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$container" pg_isready -U postgres -d postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[[ $ready == 1 ]] || fail startup 'Database readiness timed out' 11
echo '[database:startup] PASS'
# Enable migrations only; preserve all other harness settings.
cp "$root/scripts/db/harness/config.toml" "$work/base.toml"
sed -e "s/replaced-by-runner/$project/" -e '/\[db.migrations\]/{n;s/false/true/;}' "$work/base.toml" > "$work/supabase/config.toml"
if [[ $mode == invalid-migration ]]; then
  printf '\nSELECT FROM ; -- G1-P02 deliberate syntax error\n' >> "$work/supabase/migrations/00000000000009_places_dedupe.sql"
fi
if ! supabase db reset --local --no-seed --workdir "$work" >"$work/reset.log" 2>&1; then
  fail migration 'Rebuilding migrations 001–009 failed' 20
fi
echo '[database:migration] PASS: rebuilt 001–009'
psql_local() { docker exec -i "$container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1; }
for sql in "$root"/scripts/db/harness/sql/*.sql; do
  if ! psql_local < "$sql" >"$work/sql.log" 2>&1; then
    fail sql "SQL verification failed: $(basename "$sql")" 30
  fi
  echo "[database:sql] PASS: $(basename "$sql")"
done
if [[ $mode == invalid-sql ]]; then
  if ! printf 'SELECT FROM ;\n' | psql_local >"$work/invalid-sql.log" 2>&1; then
    fail sql 'Deliberately invalid SQL was rejected' 30
  fi
fi
echo '[database:verify] PASS'
