# Offline Client Migration Safety

## Status

This document records an architectural diagnosis discovered during the entity and taxonomy identity hardening rollout. It is not an authorization to broaden the current production migration or to redesign room identity.

## Executive summary

Fortudo's offline-first foundation is reasonable: every browser keeps a local PouchDB database and synchronizes it with a room-scoped Cloudant database. The architectural weakness is the absence of a protocol that prevents an obsolete client from writing after the server-side data model advances.

Deploying a new Fortudo release does not atomically update every browser. Each device has its own cached application, service worker, local revision tree, and update lifecycle. An old client can therefore reconnect after a migration and upload documents that predate or omit newly required identity fields.

The original identity-migration plan compensated with an operational gate around client updates,
local revision-graph snapshots, and opaque update-sequence equality. Production observation showed
that the Cloudant update sequence can change without an application leaf change, and the custom
snapshot/restore layer was larger than this one migration justified. That tooling has been retired.
The replacement design uses a server-enforced document contract plus a temporary Cloudant-native
replication quarantine.

## Current production scope

A metadata-only inventory on 2026-07-21 found:

- 11 Fortudo-named Cloudant databases.
- 4 preview databases.
- 7 non-preview, nonempty databases with schema 3.5 legacy taxonomy.
- 0 non-preview databases already carrying taxonomy `identityVersion: 1`.

The current tooling has no write mode. Its read-only planner accepts an explicitly named valid
`fortudo-*` database so operators can compare legacy schema-3.5 rooms without changing them. The
planner reads and preserves each room's own taxonomy; it does not contain a hardcoded `dat-411`
taxonomy.

The future mutation executor remains deliberately locked to `fortudo-dat-411`. That is a safety
fence derived from the rollout's explicit authorization for the guarded `dat-411` migration, not a
Cloudant limitation. The other six non-preview databases have not been classified as active rooms,
abandoned rooms, or tests, and they are not authorized migration targets merely because a read-only
plan succeeds.

If more rooms require fencing, each needs an independently approved client-quiescence, native
quarantine capture, content-state fingerprint, fence installation, and verification cycle. The
taxonomy migration remains locked to `fortudo-dat-411`; tooling must not silently generalize it to
every database whose name starts with `fortudo-`.

## What is not inherently wrong

These choices are normal for a local-first PWA:

- A local database allows the application to work offline.
- Bidirectional replication allows multiple clients to converge.
- Service workers update independently on each browser.
- CouchDB revision trees retain concurrent branches rather than silently discarding them.

The problem is treating deployment of compatible source code as proof that every writer has activated that code.

## Architectural diagnosis

### 1. Application versions are device-local

Room membership is stored in browser `localStorage`, and each browser opens its own `fortudo-<room>` PouchDB database. Reloading one device updates only that device's JavaScript and service worker. It cannot update another browser's application cache or local database.

Relevant code:

- `public/js/room-manager.js` stores the active and saved rooms locally.
- `public/js/storage.js` constructs the local room database.
- `public/js/sw-register.js` activates an update and reloads the current page after a service-worker controller change.

### 2. Synchronization pushes before it pulls

`triggerSync()` replicates the local database to Cloudant before pulling the current remote state. This is useful for ordinary offline editing, but it means a dormant client can publish a stale branch before learning that a migration changed the remote document.

An update prompt cannot reliably protect this path. The old application may initialize storage and begin synchronization before the new service worker is installed, activated, and controlling the page.

### 3. Older taxonomy writers are lossy

The taxonomy is stored as one singleton configuration document. Older clients normalize it to the fields they understand and persist the normalized structure as a full document. They do not preserve identity fields unknown to that release.

After the identity migration, an old client can therefore read the new taxonomy, discard identity metadata in memory, and later save a descendant revision without:

- `identityVersion`;
- immutable group or category IDs;
- `legacyKeys`;
- group identity links;
- archive status and timestamps.

Because the save is a descendant of the migrated winner, it can remove the migrated fields without creating an obvious schema-version mismatch: both formats still identify themselves as schema 3.5.

The singleton document increases the blast radius. Editing one taxonomy label rewrites all groups and categories.

### 4. There is no minimum writer-version fence

Documents do not carry an enforced client write version, and the server does not reject writes from clients that predate the identity contract. The compatibility release can understand legacy-only references, but it cannot stop an old release from creating more of them after the one-time migration reports success.

Consequences include:

- new tasks or activities created with obsolete ID generation;
- categorized records written without `categoryId`;
- taxonomy identity metadata removed by an old settings edit;
- conflict leaves recreated after migration conflict cleanup;
- a valid migration completion marker alongside documents that no longer satisfy the migration invariants.

### 5. There is no durable client-capability inventory

Cloudant stores room data, not a registry of devices holding replicas. The application cannot currently answer:

- how many devices have a local copy of a room;
- which release each device last ran;
- whether a device has unsynchronized changes;
- whether every device has activated the compatibility release.

Server request activity is not a substitute for this registry: a dormant device can be absent for months and still reconnect later.

### 6. Conflict retention makes the failure visible but not harmless

CouchDB replication preserves divergent revisions. If migration creates revision `N+1` while an offline client creates a different descendant `N+1-prime`, the later replication uploads both branches. CouchDB chooses a winner deterministically, but it is not guaranteed to choose the migrated branch.

Even when the migrated branch remains the winner, the new losing leaf violates the post-migration invariant that conflict leaves have been resolved. If the old branch wins, required identity fields can disappear from the visible document.

## Reconnection scenarios

### No local writes

If a dormant client is fully synchronized before migration, performs no automatic or user writes, and reconnects without creating local changes, it may safely pull the migrated descendants. It still must activate the new application before future use.

This is not a dependable operational assumption. Startup behavior such as task rollover or timer handling can write, and users can interact before accepting an update.

### Unsynchronized legacy writes

If the device has local changes based on pre-migration revisions, its first push can create divergent leaves. Tasks, activities, running-timer state, or the taxonomy configuration may then lack the new identity fields.

### Old client writes after pulling

Pulling the migration does not make old code write-compatible. A subsequent taxonomy save can strip unknown fields from a newer remote revision, and newly created entities can still use the obsolete identity behavior.

### Retired or cleared client

A device whose Fortudo site data has been cleared no longer holds a local revision tree and cannot upload stale room documents. A permanently retired device is likewise outside the active writer set.

## Current operational mitigation

Production is paused while the minimum replacement machinery is implemented. The intended sequence
is:

1. Deploy the forward-compatible release.
2. Prove the exact native-quarantine and migration implementation on disposable Cloudant databases.
3. Stop the running timer, close known active Fortudo sessions, and require the live timer
   configuration to be absent before any quarantine or source write.
4. Run a fresh read-only dry-run.
5. Create and verify a Cloudant-native one-shot quarantine containing every current leaf.
6. Recheck the exact source leaf set and `_security` hash immediately before fencing.
7. Install and verify the server-side document contract as the only application-state change.
8. Apply deterministic compare-and-set successors and conflict tombstones.
9. Verify counts, durations, labels, existing IDs, identity fields, and absence of live conflict leaves.
10. Reopen compatible clients, complete normal sync, and repeat read-only verification.

This gate is scoped per room. Updating one device is sufficient only when it is the sole remaining device with a local copy of that room.

## Target architecture

The long-term design should make obsolete clients unable to damage migrated data.

### Preserve unknown fields

Read-modify-write paths should preserve fields not owned by the current operation. Taxonomy changes should update the intended record or field rather than reconstructing the entire configuration from a lossy in-memory model.

### Version the writer contract

Every mutable document should identify the write contract used to produce it. This is distinct from a broad storage schema version. The contract must cover required identity fields and any invariants expected from the writer.

### Enforce a minimum writer version

After a cutover, obsolete writes should fail closed before entering the remote revision tree. The precise enforcement mechanism needs a separate Cloudant-focused design, but the required behavior is clear:

- compatible writers continue normally;
- obsolete writers receive an explicit upgrade-required error;
- local unsynchronized data remains available for controlled recovery;
- remote migrated data is not partially downgraded.

### Preflight compatibility before pushing

A client should learn the room's minimum write contract before uploading local changes. If it is obsolete, it must stop synchronization and direct the user through an upgrade or recovery flow.

A client-side preflight alone cannot constrain releases that predate the mechanism, so it must be paired with server-side enforcement during the transition.

### Use a two-phase migration protocol

Future migrations should use explicit phases:

1. Deploy readers and writers that tolerate both old and new fields and preserve unknown data.
2. Establish or enforce the minimum compatible writer version.
3. Observe that active clients are compatible where useful, without treating absence as proof that no dormant clients exist.
4. Migrate data under revision and verified native-quarantine gates.
5. Retain compatibility until the rollback window closes.

### Reduce singleton blast radius

Taxonomy records should eventually have mutation boundaries that do not require rewriting unrelated records. This recommendation does not authorize the separate redesigned-taxonomy project, but it should inform that design.

### Add bounded client observability

A privacy-conscious client-capability record could report a random device installation ID, app version, room, and last successful sync. Such records help coordinate active devices but cannot prove that no dormant device exists. Enforcement, rather than telemetry alone, must remain the safety boundary.

## Recommended follow-up work

1. Classify the six non-preview databases outside the currently authorized target.
2. Keep the current migration stopped until the target room's client and timer gates pass.
3. Design a minimum-writer-version and server-enforcement mechanism before the next incompatible migration.
4. Make taxonomy persistence non-lossy and narrow its write granularity.
5. Add recovery guidance for a legacy offline client discovered after cutover.
6. Treat room identity and authorization as a separate project, as already scoped.

## Evidence map

- `public/js/room-manager.js`: device-local room state.
- `public/js/storage.js`: device-local PouchDB database and stored-document writes.
- `public/js/sync-manager.js`: push-before-pull replication order.
- `public/js/sw-register.js`: per-browser service-worker activation.
- `public/js/taxonomy/taxonomy-store.js`: taxonomy normalization and singleton persistence.
- `scripts/migrate_taxonomy_identity.py`: namespace-scoped, read-only transformation planner.
- `docs/plans/design/2026-07-22-cloudant-quarantine-migration-design.md`: proposed minimal
  production recovery and migration gates.

## Appendix A: DDIA learning guide

This incident is a compact case study in the ideas developed by Martin Kleppmann and Chris Riccomini in _Designing Data-Intensive Applications_ (DDIA), especially the second edition's treatment of schema evolution, sync engines, local-first software, and conflicting writes.

The central lesson is:

> A schema migration is not merely a database transformation. It is a protocol upgrade involving every process that can still write the data.

### Fortudo-to-DDIA map

| Fortudo observation                                             | DDIA concept                                                         | Second-edition reading                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Old and new application versions coexist                        | Forward and backward compatibility; rolling upgrades                 | Chapter 5, “Encoding and Evolution”                                            |
| An old client drops fields it does not understand               | Dataflow through databases; older code handling newer data           | Chapter 5, “Dataflow Through Databases”                                        |
| Every browser owns a writable local replica                     | Sync engines and local-first software                                | Chapter 6, “Replication”                                                       |
| Offline devices create divergent revision branches              | Multi-leader behavior, conflicting writes, and concurrency detection | Chapter 6, “Dealing with Conflicting Writes” and “Detecting Concurrent Writes” |
| Cloudant selects one revision leaf as winner                    | Storage convergence versus application-level correctness             | Chapter 6                                                                      |
| Revision compare-and-set gates prevent overwrites               | Compare-and-set, lost-update prevention, and transaction boundaries  | Chapter 8, “Transactions”                                                      |
| A dormant device cannot be distinguished from a retired device  | Partial failure and the limits of distributed knowledge              | Chapter 9, “The Trouble with Distributed Systems”                              |
| Reload, quiesce, migrate, and verify is an operational protocol | Reliability, evolvability, and operability                           | Chapter 2, “Defining Nonfunctional Requirements”                               |

The second edition is particularly relevant because Chapter 6 explicitly includes “Sync Engines and Local-First Software.”

Primary chapter references:

- [Chapter 5: Encoding and Evolution](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/ch05.html)
- [Chapter 6: Replication](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/ch06.html)
- [Chapter 8: Transactions](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/ch08.html)
- [Second-edition contents, including Chapter 9](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/ix01.html)

### Three dimensions of compatibility

Compatibility is often reduced to two questions:

1. Can new code read old data?
2. Can old code read new data?

Fortudo exposes a third requirement:

3. Can old code read, modify, and write new data back without destroying fields it does not understand?

The legacy taxonomy client could read schema 3.5 documents containing additional identity fields. Its normalization layer then discarded those fields. A later taxonomy save reconstructed the singleton configuration without them.

The client was superficially forward-compatible for reading, but it was not **round-trip compatible** for writing. This is the concrete Fortudo version of DDIA's warning that older code may read data produced by newer code and then write it back through the database.

Forward-compatible persistence requires one of the following:

- preserve fields the writer does not own or understand;
- patch only the fields owned by the operation;
- use an encoding and library that safely retain unknown fields;
- reject writes from clients whose writer contract is obsolete.

### A PWA as an unbounded rolling deployment

In a conventional server rollout, old and new versions might coexist for minutes. In a PWA, they can coexist for months:

- application code is cached on independently controlled devices;
- a device may remain offline indefinitely;
- deploying new assets does not prove that the device installed or activated them;
- the device retains both an old runtime and an old revision tree;
- it can reconnect long after the migration window closes.

Fortudo therefore has an effectively unbounded rolling deployment. Service-worker activation and dormant-client behavior are part of the data protocol, not only frontend delivery concerns.

This explains why observing that the new release is live is insufficient. The migration must either prove that every possible writer is compatible or enforce compatibility at the write boundary.

### Replication convergence is not invariant preservation

CouchDB and PouchDB can replicate every revision successfully and still leave the application in an invalid state. For example:

- both migrated and legacy branches may exist in the revision tree;
- Cloudant may deterministically choose a winner;
- every active client may eventually observe that same winner;
- the winner may nevertheless lack required identity fields;
- even a correct winner still leaves a conflict leaf that violates the migration's postconditions.

This is an important DDIA distinction: **replica convergence does not imply application correctness**. Correctness depends on application invariants and on where those invariants are enforced.

### Reading path

For the second edition, use this order:

1. Chapter 5, especially “Modes of Dataflow” and “Dataflow Through Databases.”
2. Chapter 6, especially “Sync Engines and Local-First Software,” “Dealing with Conflicting Writes,” and “Detecting Concurrent Writes.”
3. Chapter 9 for partial failures and what one process can know about another.
4. Chapter 8's treatment of lost updates and transaction boundaries.
5. Chapter 2's evolvability and operability sections as the architectural frame.

For the first edition, the closest sequence is:

1. Chapter 4, “Encoding and Evolution.”
2. Chapter 5, “Replication.”
3. Chapter 8, “The Trouble with Distributed Systems.”
4. Chapter 7, “Transactions.”
5. Chapter 1's reliability, maintainability, and evolvability discussion.

A useful companion is Kleppmann and collaborators' [Local-First Software essay](https://www.inkandswitch.com/essay/local-first/). DDIA supplies the distributed-systems model; the essay applies many of the ideas directly to independently writable client replicas.

### Revision-tracing exercise

Model Fortudo as three nodes:

```text
Old browser A ──┐
                ├── Cloudant
New browser B ──┘
```

Start with one taxonomy document:

```text
N       original shared revision
N+1     migration branch containing identity fields
N+1′    offline old-client edit without identity fields
```

Work through these stages:

1. Both browsers synchronize revision `N`.
2. Browser A goes offline.
3. The compatibility release is activated on browser B.
4. Migration writes `N+1` to Cloudant.
5. Old browser A edits its local `N`, producing `N+1′`.
6. Browser A reconnects and pushes before pulling.
7. Cloudant receives both leaves and selects a winner.
8. Browser B pulls the resulting revision tree.

At every stage, answer:

- What has each node observed?
- Which revision is each node's write based on?
- Are two writes causally related or concurrent?
- Which fields does each application version understand?
- Which fields survive a read-modify-write round trip?
- What rule selects the database winner?
- Does the selected winner satisfy the application invariants?
- What conflicts remain even if the correct branch wins?
- Where is the minimum supported writer version enforced?
- What recovery path preserves browser A's unsynchronized work?

Then repeat the exercise with browser A making no explicit edit, but performing an automatic task rollover or stale-timer write during startup.

### Design deduction

The exercise leads to a stronger migration protocol:

1. Deploy readers and writers that safely handle both formats.
2. Preserve unknown fields during mixed-version operation.
3. Establish a minimum supported writer contract.
4. Check that contract before a client pushes.
5. Enforce it at a trusted write boundary so pre-protocol clients fail closed.
6. Preserve rejected local work for controlled recovery.
7. Migrate under revision, verified native-quarantine, and quiescence gates.
8. Verify application invariants, not only replication success.

DDIA supplies the conceptual tools for deriving this protocol, but it is not a PWA migration
runbook. Service-worker activation, Cloudant permissions, quarantine verification, and the exact
recovery UX remain application-specific engineering work.
