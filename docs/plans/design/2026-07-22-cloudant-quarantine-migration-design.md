# Cloudant quarantine migration design

**Status:** Implemented by a guarded migration pull request. It is not production authorization.

## Decision

Use a new Cloudant database populated by Cloudant's own one-shot replication as the temporary
pre-migration recovery point for `fortudo-dat-411`. Verify the replicated current revision graph,
then install the document validator and run a narrowly scoped, resumable taxonomy migration.

Do not build or retain a local snapshot format, portable dump, general restore engine, database
inventory system, or opaque-`update_seq` lock.

Use the transient `POST /_replicate` endpoint. A persistent `_replicator` document would retain its
credential in CouchDB revision history after deletion and a retry could not recreate the deleted
document ID without its tombstone revision. Scheduler restartability is not worth those risks for
this bounded operation. A transient request is safely rerunnable into the retained quarantine;
exact verified state, not the request response alone, establishes success.

The request uses the existing accepted legacy credential as structured authentication inside its
TLS request body. This creates no new authority and no durable replication document. It is an
explicitly approved exception to IBM's general preference for scoped replication credentials,
proportionate to Fortudo's existing browser-visible Manager credential documented in
[COUCHDB-SETUP.md](../../COUCHDB-SETUP.md) and
[ROOM-IDENTITY-AND-ACCESS-RISK.md](../../ROOM-IDENTITY-AND-ACCESS-RISK.md). The request body,
credential, URLs, and response details must never be logged.

Normal CouchDB replication transfers all current leaf revisions; `winning_revs_only` must not be
enabled because it intentionally discards conflicting leaves.

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

Enumerate current leaves with `_changes?style=all_docs`, fetch their exact bodies through bounded
`_bulk_get` batches, and obtain winners with a keyed `_all_docs` request over those IDs. The keyed
request is required because an unkeyed `_all_docs` scan omits deleted documents. Cloudant 429
responses receive bounded backoff; exhausted retries fail closed with sanitized output.

Matching revision identities across source and quarantine are the verification boundary for the
native replication protocol. Attachments travel as part of those replicated revisions. The design
does not duplicate every body and attachment into a second local archive merely to reimplement that
integrity check.

Planner inputs are also revision-bound to this state model. Every winning body returned for
planning must have the exact locked winning `_rev`; its live `_conflicts` set must equal the locked
nonwinning, nondeleted leaf revisions; and the complete set of live winners must agree. Equal state
reads around an unbound `_all_docs` response are insufficient because Cloudant may serve an older
body between them.

The tool does not record or compare Cloudant's opaque `update_seq`.

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
   Read the current taxonomy rows, verify the two locked Meetings/Comms meanings, and require the
   complete migration planner to accept the current winners and conflict metadata before creating
   the quarantine. Repeat these checks inside the capture command rather than trusting that a
   separately run preflight is still applicable. Re-read the source leaf state and `_security`
   after those checks; drift invalidates the preflight report or blocks capture before database
   creation.
2. Lock the exact Cloudant account endpoint and source database name in process memory. Normal
   output exposes neither. Require the exact source fingerprint and `_security` hash from the
   operator-approved preflight; either mismatch blocks before database creation.
3. Create one empty, nonpartitioned database with a random high-entropy
   `fortudo-quarantine-<random>` name. Abort if it already exists or is not empty.
4. Send one transient `POST /_replicate` request from `fortudo-dat-411` to that exact database. Use
   no selector, filter, `doc_ids`, `winning_revs_only`, or continuous mode. Authenticate both legs
   with the existing accepted credential as structured authentication; never put it in a URL or
   output.
5. Require a successful response with zero document write failures. A timeout or disconnect is
   ambiguous, not proof of failure: retain the quarantine and rerun before trusting state.
6. Read the source and quarantine state models. Require exact leaf-set, winner-map, count, and
   fingerprint equality.
7. Re-read and compare the source `_security` hash.
8. Retain the quarantine database through the known-client exercise. No `_replicator` document or
   temporary credential exists to clean up.

The replication may write `_local` checkpoints to the source. Those writes are expected and do not
invalidate the application-state comparison.

If source state changes before the validator is installed, do not proceed. Repeat transient
replication into the same quarantine database, reverify exact equality, and establish a new locked
fingerprint. Do not require the old quarantine leaves to be a subset of the source before retry: a
normal source update replaces a leaf with its child while the quarantine still exposes the parent
as a leaf. Replication can converge that ancestry safely. Unexpected quarantine-only leaves remain
after replication and fail final equality; do not destructively clean or trust that target.

The second pre-creation state/security read is an observed stability point, not an atomic write
fence. A source write immediately afterward can still race with database creation. The
post-replication equality checks prevent that target from producing a trusted capture receipt, and
the retained target must be treated as untrusted until a later exact retry converges. Operational
client quiescence therefore remains required.

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

## Read-only planning scope

The existing planner may inspect any explicitly named database in the `fortudo-*` namespace. Its
rules are not room-specific: it reads the selected schema-3.5 taxonomy, preserves its labels and
nonidentity fields, derives identities from its current rows, and reports aggregate intended
changes. It performs GET requests only and emits no document bodies or database name.

A successful plan is evidence that the database fits the transformation's structural assumptions,
not authorization to mutate it. The executor described below remains separately and exactly locked
to `fortudo-dat-411`; supporting another room would require its own approval and production gates.

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
database, transient replication request, validator revision, or migration revision. The preview
harness then stops the timer through the same compatible persistence behavior used by the
application and proves the configuration is absent before starting the successful capture path.

The exercise must prove:

1. default one-shot replication preserves the exact leaf set, winners, deletions, conflicts, and
   attachment-bearing revisions;
2. a successful replication whose client response is deliberately treated as lost can be rerun
   into the retained target and converge exactly, including after an existing source document is
   edited;
3. `winning_revs_only`, filters, selectors, `doc_ids`, and continuous mode are absent;
4. source leaf drift after capture blocks validator installation without a validator or migration
   write;
5. wrong preflight source/security bindings and deliberate source or `_security` drift during
   capture preconditions block before quarantine creation;
6. a deliberate `_security` change after capture blocks validator installation, and the successful
   path finishes with the original source `_security` hash unchanged;
7. validator installation changes exactly one expected design leaf;
8. a forced interruption leaves a state that a fresh run safely classifies and completes;
9. invalid legacy writes are denied after fencing while compatible writes succeed;
10. the final invariant and completion checks detect any unexpected revision; and
11. no `_replicator` document is created, output remains sanitized, and cleanup deletes only the two
    exact disposable databases.

Record only aggregate counts, state fingerprints, validator checksum/revision, test result, and
cleanup confirmation in the pull request. Credentials, URLs, descriptions, bodies, attachment
contents, and replication documents remain private.

## Production authorization boundary

Passing the preview proof establishes that the machinery works; it does not authorize production.
Production still requires the exact merged/deployed commit, fresh read-only state, stopped timer,
known-client quiescence, validator and database-name checks, explicit operator approval, and all
post-migration invariants.
