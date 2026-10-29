#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd "$(dirname "$0")/../../.." && pwd)
# Reject credential-bearing invocations before any child program is executed.
for key in GITHUB_TOKEN GHCR_TOKEN GH_TOKEN DOCKER_AUTH_CONFIG REGISTRY_AUTH_FILE; do
  [[ -z ${!key+x} ]] || { echo '[database:registry-isolation] FAIL: credential environment input' >&2; exit 20; }
done
node "$root/scripts/db/harness/credentials.mjs" --check || exit 20
scenario=${1:-verify}
case "$scenario" in verify|baseline|modified-baseline|missing-baseline|valid-candidate|invalid-migration|invalid-sql|valid-module|invalid-module) ;; *) exit 20 ;; esac
fail() { echo "[database:$1] FAIL: $2" >&2; exit "$3"; }
for tool in node; do command -v "$tool" >/dev/null || fail preflight "$tool unavailable" 20; done
# Remove remote connection inputs; no linked config is copied or consulted.
unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_ID DATABASE_URL PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
work=$(mktemp -d "${TMPDIR:-/tmp}/wp-g1-p02a.XXXXXXXX")
project="wp-g1-p02a-$(basename "$work" | tr '[:upper:].' '[:lower:]-')"
container="supabase_db_$project"
attempted=0
safe_target() {
  [[ -d $work && ! -L $work && $(cat "$work/owner") == "$project" && $project == wp-g1-p02a-* ]] &&
    [[ ! -e $work/supabase/.temp/project-ref ]] &&
    [[ $(sed -n 's/^project_id = "\(.*\)"/\1/p' "$work/supabase/config.toml") == "$project" ]]
}
cleanup() {
  result=$?
  trap - EXIT INT TERM
  cleanup_failed=0
  if [[ $attempted == 1 ]]; then
    if ! safe_target || ! supabase stop --workdir "$work" --project-id "$project" --no-backup >"$work/stop.log" 2>&1; then cleanup_failed=1; fi
    # CLI labels containers/volumes; check the deterministic network too.
    containers=$(docker ps -aq --filter "label=com.supabase.cli.project=$project") || cleanup_failed=1
    volumes=$(docker volume ls -q --filter "label=com.supabase.cli.project=$project") || cleanup_failed=1
    networks=$(docker network ls -q --filter "name=^supabase_network_${project}$") || cleanup_failed=1
    [[ -z $containers && -z $volumes && -z $networks ]] || cleanup_failed=1
  fi
  if [[ $result != 0 || $cleanup_failed == 1 ]]; then
    node "$root/scripts/db/harness/diagnostics.mjs" --logs "$work" || true
  fi
  rm -rf "$work" || cleanup_failed=1
  if [[ $cleanup_failed == 1 ]]; then
    echo "[database:cleanup] FAIL: primary=$result; cleanup=40" >&2
    [[ $result != 0 ]] || result=40
  else echo '[database:cleanup] PASS: project containers, volumes, network and private files absent'; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '%s\n' "$project" > "$work/owner"
node "$root/scripts/db/harness/plan.mjs" "$root" "$work" "$scenario" || exit 20
sed "s/replaced-by-runner/$project/" "$root/scripts/db/harness/config.toml" > "$work/supabase/config.toml"
safe_target || fail safety 'Temporary project identity mismatch' 20
node "$root/scripts/db/harness/prepare-modules.mjs" "$root" "$work" || exit 30
for tool in docker supabase; do command -v "$tool" >/dev/null || fail preflight "$tool unavailable" 20; done
[[ $(supabase --version) == 2.106.0 ]] || fail preflight 'Requires CLI exactly 2.106.0' 20
docker info >/dev/null 2>&1 || fail preflight 'Docker unavailable (docker-unavailable)' 20
cd "$work"
attempted=1
echo '[database:startup] Starting disposable PostgreSQL, Auth and Data API'
node "$root/scripts/db/harness/startup.mjs" "$work" "$project" || exit 20
sed -e "s/replaced-by-runner/$project/" -e '/\[db.migrations\]/{n;s/false/true/;}' "$root/scripts/db/harness/config.toml" > "$work/supabase/config.toml"
reset_local() {
  echo '[database:migration] Rebuilding disposable local database'
  safe_target || fail safety 'Refusing reset of unowned project' 20
  if ! supabase db reset --local --no-seed --workdir "$work" >"$work/reset.log" 2>&1; then fail migration 'Local rebuild failed' 20; fi
}
psql_local() { docker exec -i "$container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1; }
reset_local
for sql in "$work"/core-sql/*.sql; do
  node "$root/scripts/db/harness/plan.mjs" --check-sql "$work" "core-sql/$(basename "$sql")" || exit 20
  if ! psql_local < "$sql" >"$work/sql.log" 2>&1; then fail sql 'Historical SQL verification failed' 30; fi
done
echo '[database:baseline] PASS: independent 001–009 reconstruction and historical SQL'
if [[ $scenario == baseline ]]; then exit 0; fi
node "$root/scripts/db/harness/plan.mjs" --stage-candidates "$work" || exit 20
reset_local
# Exact replay order must match the plan, including zero candidates.
if ! docker exec "$container" psql -X -U postgres -d postgres -At -c 'select version from supabase_migrations.schema_migrations order by version' >"$work/versions.txt" 2>"$work/sql.log"; then fail migration 'Cannot inspect applied history' 20; fi
if ! node --input-type=module - "$work" <<'JS'
import {readFileSync} from 'node:fs';
const w=process.argv[2];
const p=JSON.parse(readFileSync(w+'/plan.json'));
const expected=[...Array.from({length:9},(_,i)=>String(i+1).padStart(14,'0')),...p.candidates.map(n=>n.slice(0,14))].join('\n')+'\n';
if(readFileSync(w+'/versions.txt','utf8')!==expected) process.exit(1);
JS
then fail migration 'Applied history differs from ordered plan' 20; fi
echo '[database:migration] PASS: complete rebuild and exact ordered history'
if [[ $scenario == invalid-sql ]]; then
  if ! printf 'SELECT FROM ;\n' | psql_local >"$work/sql.log" 2>&1; then fail sql 'Deliberate SQL failure' 30; fi
fi
safe_target || fail safety 'Temporary identity mismatch before status' 30
if ! supabase status --workdir "$work" -o json >"$work/status.json" 2>"$work/status.log"; then fail auth 'Local credentials unavailable' 30; fi
node "$root/scripts/db/harness/modules.mjs" "$root" "$work" "$container" "$scenario" || exit 30
echo '[database:verify] PASS'
