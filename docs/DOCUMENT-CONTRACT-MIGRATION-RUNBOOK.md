# Document-contract migration runbook

## Current status

The production entity and taxonomy migration is paused. The compatibility release exists, but
this repository intentionally has no command that can install a production validator, create a
backup, restore a database, provision a room, apply the taxonomy migration, resolve production
conflicts, or write a completion marker.

This is deliberate. The retired tooling attempted to implement a complete revision-graph snapshot
and restore format locally and treated Cloudant's opaque `update_seq` as a stable content lock.
Production observation showed that `update_seq` can change while the application leaf set does not,
so it is not a valid equality gate for this deployment. Maintaining a second replication and restore
implementation in Python was also unnecessary when Cloudant already implements CouchDB replication.

The replacement design is [Cloudant Quarantine Migration Design](plans/design/2026-07-22-cloudant-quarantine-migration-design.md).
It must be implemented and proven on disposable Cloudant databases in a later pull request before
any production mutation resumes.

Never paste the Cloudant credential URL, document bodies, descriptions, or private database
metadata into a terminal transcript, issue, pull request, or chat. Set `FORTUDO_CLOUDANT_URL` only
in the local process environment.

## Supported commands

Only two read-only operations remain.

Inspect whether a named Fortudo database contains the exact reviewed validator:

```powershell
python scripts/document_contract_ops.py verify --database fortudo-dat-411
```

Generate aggregate dry-run counts—for example, for the currently authorized target:

```powershell
python scripts/migrate_taxonomy_identity.py --database fortudo-dat-411
```

The read-only planner accepts any explicit, valid `fortudo-*` database name and has no apply mode.
Its transformation rules are application-wide: it reads and preserves the selected database's
current taxonomy rather than hardcoding the `dat-411` labels. This permits comparison and auditing;
it does not authorize taxonomy migration in another room. The future production executor remains
locked to `fortudo-dat-411`.

Both commands print only a state or aggregate counts. They do not print the database name,
credentials, document bodies, descriptions, revision identifiers, or opaque database metadata.

## Compatibility-release verification

Changes to the compatibility release still require the complete repository gates and regenerated
service-worker artifact:

```powershell
npm run build:sw-precache
npm run check:pouchdb
npm run check:fontawesome
npm run check:css
npm run verify
```

An isolated Firebase preview and `node scripts/cloudant-contract-gate.mjs` verify the browser-side
contract behavior. They do not prove the future quarantine/migration machinery because that
machinery is not present yet.

## Gates before production work can resume

Production writes remain blocked until all of the following are true:

1. The minimal quarantine design is implemented without reintroducing a local snapshot transport,
   custom restore engine, portable dump, or `update_seq` equality gate.
2. The exact implementation passes its mandatory end-to-end disposable Cloudant preview exercise,
   including conflict leaves, tombstones, attachments, source-drift detection, partial migration
   recovery, and exact cleanup.
3. The implementation pull request passes the complete repository suite and GitHub CI and is merged.
4. The compatible release containing that exact commit is deployed and its live assets are verified.
5. A fresh read-only production dry-run matches the approved target, mappings, winner/conflict
   expectations, and reports no running timer.
6. The operational preflight rechecks that the live timer configuration is absent and fails before
   any remote write otherwise; known clients remain quiescent.
7. The operator explicitly approves the production quarantine creation, fence installation, and
   migration after reviewing those results.

No existing script or this document authorizes skipping those gates.
