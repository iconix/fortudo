# Document-contract migration runbook

## Current status

The production entity and taxonomy migration is paused until the guarded quarantine implementation
has passed its disposable Cloudant proof, merged, and received a fresh production approval. The
browser compatibility release must be deployed and verified separately; operational-only changes
under `scripts/` and `docs/` do not require or trigger a Firebase deployment. This repository now
contains a narrowly scoped write-capable command for that later operation. Its presence is not
authorization to run it against production.

This is deliberate. The retired tooling attempted to implement a complete revision-graph snapshot
and restore format locally and treated Cloudant's opaque `update_seq` as a stable content lock.
Production observation showed that `update_seq` can change while the application leaf set does not,
so it is not a valid equality gate for this deployment. Maintaining a second replication and restore
implementation in Python was also unnecessary when Cloudant already implements CouchDB replication.

The replacement design is [Cloudant Quarantine Migration Design](plans/design/2026-07-22-cloudant-quarantine-migration-design.md).
It uses Cloudant-native quarantine replication without a local backup format, reverse restore,
durable `_replicator` document, or `update_seq` lock.

Never paste the Cloudant credential URL, document bodies, descriptions, or private database
metadata into a terminal transcript, issue, pull request, or chat. Set `FORTUDO_CLOUDANT_URL` only
in the local process environment.

## Read-only commands

Run the production operational preflight:

```powershell
python scripts/cloudant_quarantine_migration.py preflight
```

It verifies winning bodies, conflict arrays, locked labels, and timer state against one
revision-bound source state, then reports the associated migration counts, source fingerprint, and
`_security` hash. These are the authoritative production approval values.

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
it is not a replacement for the revision-bound operational preflight and does not authorize
taxonomy migration in another room. The production executor remains locked to `fortudo-dat-411`.

These commands print only a state or aggregate counts. They do not print the database name,
credentials, document bodies, descriptions, revision identifiers, or opaque database metadata.

## Guarded migration commands

`scripts/cloudant_quarantine_migration.py` provides `preflight`, `capture`, `fence`, `migrate`, and
`delete-quarantine`. Production mutations are hard-locked to `fortudo-dat-411`; every mutating mode
requires the expected account checksum, an exact source confirmation where applicable, and
`--approve-remote-writes`. Capture additionally requires the exact source fingerprint and
`_security` hash emitted by the approved preflight, and rejects either mismatch before database
creation. It creates one exact quarantine database and uses transient `POST /_replicate`; it never
writes a durable replication document.

Before this command may be used on production, run the exact disposable proof:

```powershell
python scripts/cloudant-quarantine-gate.py
```

The proof creates two random preview databases, exercises capture, retry, fencing, interruption,
completion, and invariant failures, and deletes exactly those two databases. It prints only counts
and hashes. A passing proof does not authorize production.

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
contract behavior. The separate real-Cloudant quarantine gate proves the operational migration
machinery.

## Gates before production work can resume

Production writes remain blocked until all of the following are true:

1. The minimal quarantine design is implemented without reintroducing a local snapshot transport,
   custom restore engine, portable dump, or `update_seq` equality gate.
2. The exact implementation passes its mandatory end-to-end disposable Cloudant preview exercise,
   including conflict leaves, tombstones, attachments, source-drift detection, partial migration
   recovery, and exact cleanup.
3. The implementation pull request passes the complete repository suite and GitHub CI and is merged.
4. The compatible browser release is deployed and its live assets are verified byte-for-byte
   against its exact source commit.
5. A fresh read-only production dry-run matches the approved target, mappings, winner/conflict
   expectations, and reports no running timer.
6. The operational preflight rechecks that the live timer configuration is absent and fails before
   any remote write otherwise; known clients remain quiescent.
7. The operator explicitly approves the production quarantine creation, fence installation, and
   migration after reviewing those results.

No existing script or this document authorizes skipping those gates.
