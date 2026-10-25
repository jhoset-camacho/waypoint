# G1-P01 — Migration parity 006–009

This directory verifies that migrations 006–009 are restored byte-for-byte from the preserved checkpoint and that applying 001–009 reconstructs the user-managed `public` schema observed in the linked Supabase project.

## Provenance

- Preserved checkpoint: `f0b60bb9f14cd8c6224dbc0e36076c5a349bd81d`.
- Checkpoint manifest: `respaldos/waypoint-cierre-20261006T214808-0600/FILES.sha256` in the private product repository.
- Code source within that checkpoint: `checkpoint/code/supabase/migrations/`.
- The four hashes are copied to `source-manifest.sha256`; `verify-source-hashes.sh` checks both byte identity and the exact 001–009 file set.
- Migrations 010, 011 and `20260925172808` are intentionally absent.

## Reproduce source verification

```sh
scripts/db/migration-parity/verify-source-hashes.sh
```

## Reproduce schema comparison

The recorded comparison used Supabase CLI `2.106.0` and PostgreSQL 17 on 2026-10-24. It reads schema only; it does not dump rows or apply anything remotely.

```sh
supabase start
supabase db dump --local --schema public --file /tmp/g1-p01-local-public.sql --yes

# Run from a checkout linked to the intended Supabase project.
supabase db dump --linked --schema public --file /tmp/g1-p01-remote-public.sql --yes

scripts/db/migration-parity/compare-public-schema.sh \
  /tmp/g1-p01-remote-public.sql \
  /tmp/g1-p01-local-public.sql
```

Recorded evidence:

| Artifact | SHA-256 |
|---|---|
| Remote raw `public` schema dump | `1a31520d2d4c889ca8d7b4aa6c93fb6883621c11ee9b938a47269938817c2577` |
| Local raw `public` schema dump after 001–009 | `8220f317edf02a3eb21bdfcdf3d46b23ced6080db62ec1baeefda5eb20e0f901` |
| Remote normalized schema | `19937fd04e88ff3818f49941f79fbbecf1974a214a60c8b62b4b90085aef216f` |
| Local normalized schema | `19937fd04e88ff3818f49941f79fbbecf1974a214a60c8b62b4b90085aef216f` |

The raw dumps differ only in ACL statements. The cloud project retains legacy `ALL` grants created by the former Data API auto-exposure behavior. A clean current stack uses the newer default-deny posture and reports only non-DML table privileges. `normalize-public-schema.sh` therefore removes only `GRANT`, `REVOKE` and `ALTER DEFAULT PRIVILEGES` statements plus blank lines; it does not remove tables, columns, constraints, indexes, policies, functions or triggers.

This difference is expected and intentionally not repaired in G1-P01. Explicit grants and RLS are governed by `CONTRATO_PERSISTENCIA_RLS_V1` and are implemented in their assigned later PRs. Supabase documents the auto-exposure change at <https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically>.

## Remote migration identifiers

The read-only `supabase migration list --linked` observation returned versions 001–009 on both sides. Local-only 010, 011 and `20260925172808` appeared only because the historical linked checkout contains them; they are not copied into this branch. Version alignment alone is not treated as proof of SQL equality.

## Boundaries

- No `db push`, migration repair, reset, deploy or remote write belongs to G1-P01.
- The schema dumps contain definitions only and remain temporary; they are not committed.
- G1-P02 owns the reusable local/CI database harness. These scripts are limited to migration provenance and parity.
