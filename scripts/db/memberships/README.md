# G1-P03 membership module

Contract: persistence/RLS **1.0.1**, agent/application **1.0.0**. Scope: P03 only.

Run through the existing harness, with its required pinned CLI, private empty
Docker config, helper-free PATH and exclusively local Docker endpoint:

```sh
npm run test:db
npm run test:db:harness
```

`db-suite.json` is the only discovery entry. The module adds no dependency,
workflow edit, package script, remote credential or exposed test RPC.

- `05-upgrade.test.mjs` verifies the runner's owner marker, container identity,
  absence of a linked project, local config and the candidate snapshot hash.
  It snapshots public/private objects and fixture data **in memory**, preserves
  schema ownership/default ACLs, reconstructs the exact 001–009 SQL inside the
  same disposable database, and applies the exact candidate SQL to legacy rows.
  The sole Storage scaffold deletion is an empty fixture bucket under temporary
  local replication-role bypass in its own transaction, never an RLS assertion.
  A `finally` block restores public/private fixtures, the Auth mirror trigger
  and attachment policies. Auth users/sessions and migration history are untouched.
  Concurrent real PostgreSQL sessions insert before the migration obtains its
  ACCESS EXCLUSIVE lock; one commits and one rolls back. A catalog rendezvous
  observes the waiting migration, then asserts coverage and exact counts.
  Concurrent organizer demotions at repeatable read must produce one success
  and one safe constraint/serialization failure, with one organizer remaining.
- `10-schema.test.mjs` checks effective grants (including column privileges),
  RLS/policies, trigger order, FK/filter indexes, function ownership, definer
  status, search paths and ACLs. Historical trigger/function must be absent.
- `20-memberships.test.mjs` uses only harness Auth-created, signed-in and
  Auth-verified real JWTs for HTTP authorization. Fixture SQL opens capability
  transactionally, without granting client INSERT, and closes it before HTTP.
  A1/A2/A3/A4/B1/C/anon cover row isolation, exact contractual lookups, no UUID
  fallback, forbidden membership DML, removed access and legacy-creator denial.
  A temporary nontransactional probe proves JWT INSERT does not reach the guard
  (42501), while an expressly privileged service_role insert does (55000).
  Core repetition and injected membership failure prove cardinality and rollback.
- `30-advisors.test.mjs` runs security/performance advisors and private SQL lint
  with `--local --workdir <owned harness project>`. Output remains private.
  Only recognized catalog/network unavailability is marked UNAVAILABLE; an
  actual error finding fails. Unavailability never constitutes advisor PASS.

Privileged SQL is fixture preparation, schema inspection, administrative invariant
checking or explicit second-barrier testing. It never substitutes for JWT RLS.
The historical public.is_trip_owner predicate remains for legacy policies, with
SECURITY INVOKER, empty search_path and authenticated-only EXECUTE. Its trips query
is filtered by membership RLS, so it cannot reveal a removed creator’s trip.
No new role-transition/invitation RPC, future bootstrap stage or resolver is exposed.
`can_converse` is private and has no client execute grant before its P04 consumer.
Contractual resolution via a domain action belongs to P07; P03 proves exact RLS
queries and the relational bridge, without adding heuristic resolvers.

The historical parity helper predates additive migrations and rejects an extra
migration by design. The unchanged central harness is the authoritative P03
historical-integrity gate: all nine pinned hashes plus separate ordered candidates.

The harness owns final deletion of its database volume, users, sessions, network,
containers and private files, including after suite failure. Do not run this module
against an existing or hosted project. Same-UID trusted-suite and abrupt-host-failure
limits from the central harness still apply. This constructor's PASS results do
not replace independent review. P03 ends with capability false and no client INSERT.
