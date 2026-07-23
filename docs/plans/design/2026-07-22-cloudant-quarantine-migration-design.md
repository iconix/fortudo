# Cloudant quarantine migration design

**Status:** Design for a later implementation pull request. It is not an operational authorization.

## Decision

Use a new Cloudant database populated by Cloudant's own one-shot replication as the temporary
pre-migration recovery point for `fortudo-dat-411`. Verify the replicated current revision graph,
then install the document validator and run a narrowly scoped, resumable taxonomy migration.

Do not build or retain a local snapshot format, portable dump, general restore engine, database
inventory system, or opaque-`update_seq` lock.

IBM recommends managed `_replicator` jobs over the transient `/_replicate` endpoint because jobs are
restartable and observable. Normal CouchDB replication transfers all current leaf revisions;
`winning_revs_only` must not be enabled because it intentionally discards conflicting leaves.

References:

- [IBM Cloudant replication guide](https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-replication-guide)
- [IBM Cloudant advanced replication](https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-advanced-replication)
- [Apache CouchDB replication protocol](https://docs.couchdb.org/en/stable/replication/protocol.html)

## Goals

- Preserve every current live, deleted, and conflicting leaf before fencing production.
- Preserve Cloudant's current winners and all task and activity IDs.
- Detect source drift using application revision state rather than `update_seq` equality.
- Make an interrupted migration safe to inspect and resume from current Cloudant state.
- Provide a recovery source without automating a dangerous reverse restore into production.
- Keep normal output limited to aggregate counts and hashes.

## Non-goals

- A general Cloudant backup product or disaster-recovery system.
- A byte-for-byte archive of compacted non-leaf bodies, database UUID, or update sequence.
- A portable export outside Cloudant.
- Automatic full-database rollback or conflict merging.
- Migration of any room other than `fortudo-dat-411`.
- Taxonomy redesign, room identity, credentials, device telemetry, or browser provisioning.

## Why native replication is the recovery primitive

Cloudant already implements revision-tree transfer, attachment transfer, conflict preservation,
checkpointing, and retry. Reimplementing those responsibilities in a local Python archive adds a
second data transport and restore protocol that must be proven under compaction, conflicts,
tombstones, attachments, rate limiting, interruption, and partial files.

The quarantine database is intentionally narrower than a conventional backup. It is a temporary,
same-account copy of the current replicable leaf graph for this one migration. It does not claim to
preserve compacted historical bodies. That is sufficient for inspecting or selectively recovering
the state that could otherwise be affected by the migration.

## State model

For this operation, content state is represented by:

- the set of `(document ID, leaf revision, deletion state)` for every current non-`_local` leaf;
- the winning revision for every document;
- aggregate live, deleted, and conflicted-leaf counts; and
- a canonical SHA-256 fingerprint of those values.

The set includes application and design documents. `_local/*` documents are excluded because
replication checkpoints are local implementation metadata and replication itself can change them.
Derived `_conflicts` arrays are not hashed separately because the leaf set already represents them.

Matching revision identities across source and quarantine are the verification boundary for the
native replication protocol. Attachments travel as part of those replicated revisions. The design
does not duplicate every body and attachment into a second local archive merely to reimplement that
integrity check.

Cloudant's `update_seq` may be recorded diagnostically but must never be compared for equality or
used as a content-stability gate.

## `_security`

Read and canonically hash the source `_security` document before quarantine capture, immediately
before validator installation, and after the migration. Equality proves that this operation did not
change the database's legacy names/roles configuration.

Do not copy `_security` into a local backup, copy it automatically to quarantine, or offer a restore
command for it. It is authorization metadata, not application data, and Cloudant IAM configuration
is outside this document. Any intentional security change is a separate approved operation.

## Quarantine capture protocol

1. Require the compatible release to be live and close known active clients. Read the source and
   require `config-running-activity` to be absent. A live timer blocks before any remote mutation,
   including quarantine database creation. Stopping the timer through a compatible client deletes
   that live configuration; merely closing its UI is insufficient.
2. Lock the exact Cloudant account endpoint and source database name in process memory. Normal
   output exposes neither.
3. Create one empty, nonpartitioned database with a random high-entropy
   `fortudo-quarantine-<random>` name. Abort if it already exists or is not empty.
4. Create a one-shot `_replicator` job from `fortudo-dat-411` to that exact database. Use no selector,
   filter, `doc_ids`, `winning_revs_only`, or continuous mode. Any replication credential must be
   temporary and narrowly scoped, must never be logged or committed, and must be revoked after the
   job is removed.
5. Wait for the scheduler to report completion. A terminal error or timeout blocks the operation.
6. Read the source and quarantine state models. Require exact leaf-set, winner-map, count, and
   fingerprint equality.
7. Re-read and compare the source `_security` hash.
8. Remove the completed replication job and revoke its temporary credential. Retain the quarantine
   database through the known-client exercise.

The replication may write `_local` checkpoints to the source. Those writes are expected and do not
invalidate the application-state comparison.

If source state changes before the validator is installed, do not proceed. Repeat the one-shot
replication into the same quarantine database, reverify exact equality, and establish a new locked
fingerprint. Unexpected quarantine-only leaves or any ambiguous result require a new empty
quarantine database rather than destructive cleanup.

## Fence installation

Immediately before installation, require the source state fingerprint and `_security` hash to match
the locked capture. On first installation the validator design document must be absent; create the
exact reviewed `_design/fortudo-document-contract` revision with a create-only compare-and-set
request. On resume, accept an existing validator only when its revision is the exact revision
recorded from this operation's successful create and its source, version, checksum, and surrounding
locked source state all match. Any other existing design document blocks the operation.

Afterward, require:

- the previous source leaf set plus exactly the expected validator leaf;
- no other new, removed, or changed leaf;
- the expected validator version, checksum, source, and revision; and
- the unchanged `_security` hash.

Any difference stops the operation before taxonomy writes.

## Minimal migration executor

The executor remains locked to `fortudo-dat-411` and the approved taxonomy mapping. It recomputes a
fresh plan from remote winners and conflicts and writes one intended successor at a time using the
exact current `_rev` as a compare-and-set precondition.

The order is:

1. taxonomy identity document;
2. task and activity successors;
3. losing activity-branch tombstones carrying writer contract version 1;
4. complete invariant verification; and
5. a separate completion marker followed by another complete verification.

Each transformation is deterministic and idempotent. After interruption, rerun from a fresh remote
read: already-correct successors are skipped, unresolved documents and conflict leaves remain in the
new plan, and any state that cannot be classified safely blocks progress. There is no automatic
rewind and no general local journal/restore subsystem.

The executor must preserve:

- all task and activity IDs;
- the current Cloudant winner as the parent of each migrated successor;
- every nonidentity field;
- `work/meetings -> Comms` and `work/comms -> Meetings`; and
- meaning derived from current taxonomy rows and immutable IDs, never from legacy key wording.

Post-migration verification derives the exact expected leaf transitions from the locked pre-state
and successful Cloudant responses. An unrelated leaf or revision blocks the completion marker even
if every migrated document is individually valid.

## Recovery boundary

The quarantine database is read-only after capture. No tool may reverse-replicate it over production.
If recovery is needed, inspect the production and quarantine revisions and copy selected documents
through a separately reviewed procedure. For broader analysis, quarantine may be replicated into a
new disposable database; production remains untouched.

Retain quarantine until the compatible-client exercise and final production verification are
complete, then delete exactly that approved database. Cloudant database deletion is irreversible,
so require the exact name, the recorded quarantine fingerprint, and explicit confirmation.

## Mandatory preview proof before implementation merge

The later implementation pull request may not merge based on mocked tests alone. Before merge, run
the exact operational code against randomly named disposable Cloudant source and quarantine
databases through the same authenticated path intended for production.

The fixture must initially include:

- ordinary live documents;
- a deleted leaf;
- a document with multiple live conflict leaves and a known winner;
- an attachment;
- the locked taxonomy labels and representative task/activity references; and
- a running-timer configuration document used only to prove the zero-write preflight.

First run the production preflight with that live timer. It must fail before creating a quarantine
database, replication job, validator revision, or migration revision. The preview harness then stops
the timer through the same compatible persistence behavior used by the application and proves the
configuration is absent before starting the successful capture path.

The exercise must prove:

1. default one-shot replication preserves the exact leaf set, winners, deletions, conflicts, and
   attachment-bearing revisions;
2. `winning_revs_only`, filters, selectors, `doc_ids`, and continuous mode are absent;
3. source leaf drift after capture blocks validator installation without a validator or migration
   write;
4. a deliberate `_security` change after capture blocks validator installation, and the successful
   path finishes with the original source `_security` hash unchanged;
5. validator installation changes exactly one expected design leaf;
6. a forced interruption leaves a state that a fresh run safely classifies and completes;
7. invalid legacy writes are denied after fencing while compatible writes succeed;
8. the final invariant and completion checks detect any unexpected revision; and
9. cleanup deletes only the two exact disposable databases and the exact replication job, and
   verifies revocation of the exact temporary replication credential.

Record only aggregate counts, state fingerprints, validator checksum/revision, test result, and
cleanup confirmation in the pull request. Credentials, URLs, descriptions, bodies, attachment
contents, and replication documents remain private.

## Production authorization boundary

Passing the preview proof establishes that the machinery works; it does not authorize production.
Production still requires the exact merged/deployed commit, fresh read-only state, stopped timer,
known-client quiescence, validator and database-name checks, explicit operator approval, and all
post-migration invariants.
