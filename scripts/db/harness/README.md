# G1-P02 local database gate

Requirements: Bash, Docker daemon and **Supabase CLI 2.106.0** on PATH. Node 22
is used by CI. No npm dependency is added; the existing lockfile stays unchanged.

```sh
npm run test:db          # reconstruct 001–009 and verify baseline/role mechanism
npm run test:db:harness  # two isolated negative runs, then a clean positive run
```

Each invocation creates a private temporary project with a unique ID, copies only
the exact 001–009 manifest and uses the harness config (PostgreSQL 17). Ports
56320–56322 must be free. It does not reuse the repository's linked project,
`.env`, seeds, functions or local metadata. There is no remote database command.
Storage schema initialization remains enabled because historical migration 002
uses `storage.buckets`; the Storage API container is excluded. No Auth, Storage,
Data API or Edge Function endpoint is exercised.
The CLI may download public container images; offline image availability is not
promised. CLI 2.106.0 selects the image versions; upgrading it is an explicit change.

Start runs with application migrations disabled so startup and migration failures
have separate exit codes. The runner enables migrations only in its disposable
config and uses `db reset --local --no-seed`. It then runs SQL via `docker exec`
inside that project's database, with `psql -X -v ON_ERROR_STOP=1`. No host DB URL
or password is accepted. The 2.106.0 shell help advertises service aliases that its delegated runtime
does not accept; the runner uses the names confirmed by the runtime warning
(`postgrest`, `storage-api`, `gotrue`, etc.). The CLI health checks and bounded `pg_isready` loop gate
SQL execution. Startup/reset output is private and deleted at exit because CLI
output can contain generated local credentials. Stage errors identify the failure
without printing that output; SQL source files are versioned for reproduction.

| Exit | Meaning |
| --- | --- |
| 10 | preflight: CLI, daemon or exact migration set |
| 11 | local startup/readiness |
| 20 | migration replay |
| 30 | SQL verification |
| 40 | cleanup failure (overrides earlier error) |
| 130 / 143 | interrupted / terminated |

EXIT/INT/TERM handlers stop only the unique project with `--no-backup`, verify
its labeled containers and volumes are absent, and remove temporary files. Never
use `stop --all`. Forced termination (SIGKILL, host crash, CI runner teardown)
cannot run shell traps; the unique ID isolates any orphaned resources. CI has a
25 minute job timeout and uses an ephemeral Ubuntu runner.

## What is actually proved

- Exactly nine migration records and 15 historical tables with RLS enabled.
- Mood tags (006), Realtime publication membership (007–008), dedupe index (009).
- PostgreSQL `SET LOCAL ROLE authenticated/anon`, `auth.uid()` and no BYPASSRLS.
- Failure propagation: `invalid-migration` appends invalid SQL to the **temporary
  copy** of 009 and must exit 20; `invalid-sql` sends invalid SQL to the same SQL
  executor after a successful replay and must exit 30. The self-test rejects a
  different exit (including startup or cleanup failure), then requires a fresh
  unmodified run to pass. The checked-out migration files are never changed.

This is baseline reconstruction and harness testing, **not V1 RLS acceptance**.
Synthetic claims only establish the role-testing mechanism. Real JWT matrices,
explicit domain grants, owner positives/negatives, upgrade/backfill, concurrency
and domain tests belong to G1-P03 and later. Historical missing grants are not
patched or hidden by enabling legacy auto-exposure. No service_role is used.

## CI and provenance

`Database CI / Local database and harness` runs on every PR to main and push to
main. PR checkout is explicitly the head SHA (not GitHub's synthetic merge SHA).
The existing CI still covers clean npm installation, TypeScript and V1 contracts.
No repository/environment Supabase secrets are referenced by the database job.

Version checked against the installed CLI's real `--version`, `start --help`,
`db reset --help`, `stop --help` and official sources on 2026-10-25:

- [CLI 2.106.0 release](https://github.com/supabase/cli/releases/tag/v2.106.0)
- [CLI commands](https://supabase.com/docs/reference/cli/introduction)
- [Database testing](https://supabase.com/docs/guides/local-development/testing/overview)
- [Current changelog](https://supabase.com/changelog)
- [Explicit grants change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Postgres minor upgrade advisory](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)

The grants change affects fresh baseline permissions; this runner does not opt
back into legacy grants. The minor-upgrade advisory concerns existing indexes,
legacy encrypted data and custom operators; this gate creates a fresh empty
baseline and does not upgrade or inspect a hosted project. CLI 2.106.0 was already
used for G1-P01; its compatibility is verified again by this gate, without an
implicit upgrade or a claim that its bundled images are the latest releases.

Governance: product `olas/G1/PLAN.md`, ADR-WP-0001–0004 and persistence/RLS
contract 1.0.0. Rollback before integration: revert this PR; no remote state changes.
