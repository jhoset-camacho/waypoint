# G1-P02A disposable domain harness

Requirements: Bash, Node 22+, Docker daemon and **Supabase CLI exactly 2.106.0**.
No npm dependencies are added. CI uses Ubuntu 24.04 / Node 22. CLI-selected
PostgreSQL 17 images are retained; there is no implicit CLI/image upgrade.

```sh
npm run test:db             # historical rebuild, full rebuild, discovered suites
npm run test:db:harness     # nine scenarios, then verify tracked tree unchanged
bash scripts/db/harness/run.sh baseline  # strict historical rebuild only
```

## Two independent migration gates

`baseline.sha256` pins **all nine** historical SQL files (001–009) from the
approved main `bda6300c43b9e94f2377776964e1daabe4cdfd66`. `plan.mjs` also checks
names/order against the unchanged migration-parity manifest. Missing, renamed,
modified or nonregular baseline files fail **20**, before Docker starts. The
historical manifest in `migration-parity/` is never expanded or modified.

Other entries in `supabase/migrations/` must be regular files named
`<14-digit-version>_<lowercase_name>.sql`, version greater than 00000000000009,
with unique versions. Historical 010, 011 and 20260925172808 are explicitly
rejected. Names and versions are sorted bytewise; malformed/unexpected entries,
including symlinks in controlled file or directory components, fail closed. Candidate SQL is trusted reviewed migration code,
not statically proven nondestructive; the harness does not certify additive semantics.

R1 canonicalizes the checkout anchor first, then uses `lstat` and `realpath` on
**every controlled component below it**, including `supabase`, `migrations`,
SQL/fixture directories and individual files. Baseline and checkout candidates
must remain inside the verified canonical migration root. The host's ordinary
ancestor aliases (macOS `/var` to `/private/var`) are normalized at the anchor;
internal links, traversal, unexpected absolute paths and noncanonical components
are rejected with **20**, before copying SQL.

Temporary candidate snapshots use a separate explicit sandbox, never a root
selected implicitly from an environment variable. It must be a real private
`wp-g1-p02a.<random>` directory owned by the current UID with the runner's matching
owner marker. Its internal directories/files are checked the same way. Before
staging candidates into the disposable migration directory, the runner rechecks
containment and snapshot hashes. Core SQL is also checked, snapshotted and
rechecked immediately before execution. Copy destinations are exclusive.

The runner snapshots baseline and candidates into private temporary directories.
First it reconstructs **only 001–009** and runs the original strict historical SQL
(including exactly nine history records and 15 tables). Then it copies the ordered
candidates into that same disposable project and performs a full clean rebuild.
It compares applied history against the exact planned versions. Later domain
changes cannot hide behind weakened historical assertions. `baseline` stops after
the first reconstruction. Zero candidates is supported. This is clean replay,
not a stateful upgrade/backfill test; domain suites must add those assertions.

## Module protocol v1

Every nonreserved entry in `scripts/db/` declares a module. The only reserved
system directories there are **harness** and **migration-parity**. A module must
be a real nonlinked directory with name matching `^[a-z][a-z0-9-]*$`, containing
one regular `db-suite.json` manifest. A missing/corrupt manifest, invalid name,
file in place of a directory, link (including dangling links), or unsupported
structure fails **30**; none can silently disappear as `NONE`. Link targets are
never inspected to decide whether a linked entry is a module. Temporary fixture
modules follow the same rules, and duplicate names across roots fail **30**.

Example for a future module (none created here):

```json
{"version":1,"setup":["fixtures.setup.sql"],"tests":["permissions.test.mjs","shape.test.sql"]}
```

- Module names across both roots and file lists run in bytewise sorted order; duplicate paths, empty tests,
  unknown manifest keys, invalid version, absolute/traversing paths, symlinks and
  escaped realpaths fail **30**. Every controlled component is checked, including
  intermediate test directories, and paths are checked again before read/import.
  Paths differing only in case are rejected as ambiguous. Only named `.setup.sql`, `.test.sql`, `.test.mjs`
  regular files run; unrelated files never execute automatically.
- Setup SQL executes first as local postgres, solely for fixtures. SQL tests use
  `psql -X -v ON_ERROR_STOP=1` and must explicitly choose roles if testing SQL RLS.
- Each MJS test exports a default async function receiving `{sql, api, users, createUser}`.
  `sql(text)` runs privileged SQL on the disposable database; use **only** for
  preparation, cleanup, structural assertions or deliberately selected SQL roles.
  It is never evidence that an HTTP authorization check passed.
- `await createUser()` creates an additional real local identity for role matrices.
  `users` contains two distinct frozen `{id}` identities created through local
  Auth signup, then password sign-in. JWTs are validated against `/auth/v1/user`
  and retained only inside a closure. They are not handcrafted or exposed in logs.
- `await api('anon', 'table?select=id')` and `await api(users[0], 'table',
  {method:'POST',body:{...}})` return `{status,body}`. Every call uses the fixed
  local gateway, the local anon API key and the selected real user JWT; redirects
  and absolute paths are rejected. Add assertions for positives and negatives.
- No service-role API is supplied. Signup/password flow needs only anon. The
  service key returned by local CLI status is deliberately ignored; no test
  credits a privileged read/write as RLS proof. Never use user_metadata for auth.
- Genuine absence of nonreserved entries prints `NONE`, succeeds after Auth/HTTP smoke, and is distinct from a
  discovered suite failure. Any discovery/setup/test/Auth/Data API failure is **30**.
- Suites are trusted repository code, not an adversarial sandbox. Their privileged
  SQL helper can alter the test DB, so review must enforce fixture-only privilege
  use. They execute only **after** the mandatory independent historical gate.

The self-test's manifest is generated only in its temporary project, then uses
this same discovery code. Its candidate and tests live under `harness/fixtures/`;
none are production migrations or P03 membership logic.

## Isolation, logs and cleanup

Every invocation owns a unique `wp-g1-p02a-*` project and a private mktemp directory
(umask 077). It copies no linked config, `.env`, seeds or functions; remote DB/env
connection inputs are unset. Before reset/stop it checks its owner marker, unique
project ID, private directory and absence of a linked project-ref. It only calls
`start`, `status`, `db reset --local --no-seed`, `stop --project-id ... --no-backup`.
No link, push, repair, deploy, hosted DB access or remote credentials are used.
CLI telemetry/public image downloads are separate from access to project data.

Fixed ports **56320–56322** must be free; concurrent runs on the same host are
unsupported (unique IDs prevent sharing resources, but do not allocate new ports).
Startup/reset/status/SQL logs remain private and are deleted, because CLI output
can include generated credentials. Failure messages report stages, not secret
values or HTTP response bodies. Modules must follow this same logging rule.

EXIT/INT/TERM stop only the owned project with no backup, check labeled containers
and volumes and the deterministic Supabase network, then remove private files.
Removing the DB volume removes Auth users, sessions and fixture data. Each scenario
must report cleanup PASS; the self-test also rejects any cleanup FAIL even if a
primary error has the expected exit. SIGKILL or host failure cannot guarantee
trap cleanup; CI uses an ephemeral runner. Never use `stop --all`.

| Exit | Meaning |
| --- | --- |
| 0 | success |
| 20 | preflight, baseline integrity, candidate, startup or rebuild error |
| 30 | SQL, module, Auth, HTTP or authorization assertion error |
| 40 | cleanup failure when no earlier primary error exists |
| 130 / 143 | interrupted / terminated |

If both a stage and cleanup fail, retain the **primary** code and print
`primary=<code>; cleanup=40`. The self-test rejects this combination. This replaces
P02's cleanup override so the primary stage is not lost. Legacy 10/11 startup
codes are folded into 20; the required 20/30/0 meanings remain explicit.

## Self-test evidence

The original nine scenarios are nominal evidence; they did **not** cover the
parent-directory SQL escape or silently omitted modules found by independent
review. R1 adds planner path/sandbox regressions, actual macOS root-alias positives,
strict discovery/execution regressions and real-runner reproductions of both
review exploits **before** retaining the nine nominal scenarios. The real external
migration attack must fail **20** before database startup, so
`public.harness_external_marker` cannot be created; the linked failing module must
fail discovery with **30**, not disappear as `NONE`, and must never execute its
external marker code. Both real-runner tests require cleanup PASS.

Scenarios: modified baseline 20, incomplete baseline 20, baseline-only 0, valid
candidate 0, invalid candidate 20, valid discovered module 0, invalid discovered
module 30, invalid SQL 30, final complete reconstruction 0. Valid module proves
anon public access, two Auth identities with private own rows, cross-user SELECT
isolation, and a rejected cross-user INSERT (42501) with no mutation. The test is
a harness capability probe, **not acceptance of P03/V1 RLS**. Synthetic SQL claims
remain only as the historical role-mechanism check.

Each negative must reach its intended failure stage, not merely return the same
code from an earlier failure.

The self-test compares the tracked diff against HEAD before/after, including staged
changes, so it can run while developing without requiring commits. CI starts clean.
No source file is edited by any scenario.

The R1 checks close static filesystem path/structure escapes. Repository suites
remain trusted executable code. They do not provide a hostile-host sandbox or an
atomic filesystem snapshot against a concurrent same-UID process replacing
ancestors between a check and an OS read/import. Real macOS `/var` alias tests run
locally on macOS; Ubuntu reports that platform-specific case as SKIP and runs the
portable containment cases. SIGKILL/host-failure cleanup limitations remain.

## CI and official research (2026-10-26)

Database CI runs only PRs to main and pushes to main, checks out the exact head,
disables persisted credentials, uses contents:read and a 35-minute timeout. All
three actions are pinned to upstream SHAs. Checkout/setup-node v5 use Node 24;
Supabase setup-cli v1.7.3 still declares Node 20 upstream, so GitHub's forced-Node-24
warning may remain for that action. CLI remains 2.106.0. No remote secrets needed.

Actual CLI `--help`, `start --help`, `db reset --help`, `stop --help`, `status --help`
were inspected. Runtime service names, not shell aliases, match the P02 findings.
Official sources consulted:

- [Changelog index](https://supabase.com/changelog.md).
- [CLI commands](https://supabase.com/docs/reference/cli/introduction).
- [Password Auth](https://supabase.com/docs/guides/auth/passwords).
- [API security](https://supabase.com/docs/guides/api/securing-your-api): explicit
  grants plus RLS, not automatic exposure.
- [Grants change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically):
  fixture grants are explicit; historical missing grants are not patched.
- [Self-hosted gateway](https://supabase.com/changelog/48048-self-hosted-supabase-envoy-becomes-the-default-api-gateway-b)
  and [Auth URL](https://supabase.com/changelog/47093-self-hosted-supabase-api-external-url-to-include-auth-v1):
  Docker Compose changes do not justify changing the pinned CLI stack; local HTTP
  flows must prove compatibility rather than inferring it from current docs.
- [TLS advisory](https://supabase.com/changelog/cbc-tls-ciphers-deprecated): hosted
  HTTPS change; this fixture uses exclusively loopback HTTP.

Rollback: revert this harness PR, keep P03 blocked. No remote state changes.
Governance: G1 plan, ADR-WP-0001/0002/0004, persistence/RLS contract 1.0.0.
