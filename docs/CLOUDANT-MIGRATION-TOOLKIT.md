# Cloudant migration toolkit boundaries

## Purpose

Fortudo has reusable Cloudant safety primitives, but it does not have a general-purpose production
migration engine. This distinction is intentional. Reusing verified state handling reduces risk;
making data transformations or production targets configurable would hide the decisions that need
the most review.

This document identifies which code is reusable as-is, which code is a foundation for a future
operation, and which code belongs only to the completed `fortudo-dat-411` taxonomy-identity-v1
migration.

The exact completed operation remains documented in
[Taxonomy identity v1: dat-411 operation runbook](migrations/taxonomy_identity_v1/dat-411-operation-runbook.md).
Architectural motivation and the offline-replica case study remain in
[Offline-client migration safety](OFFLINE-CLIENT-MIGRATION-SAFETY.md).

## Ownership map

| Category                              | Location                                                          | Stability rule                                                                                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reusable as-is                        | `scripts/cloudant_migration/state.py`                             | Product-neutral canonical leaf state, counts, and fingerprints. No room, taxonomy, or migration constants.                                                              |
| Reusable as-is                        | `scripts/cloudant_migration/client.py`                            | Credential-redacting reads, revision-state inspection, and revision-aware document writes. It has no production CLI or database lifecycle methods.                      |
| Read-only current-contract inspection | `scripts/document_contract_ops.py`                                | Verifies the exact reviewed v1 validator in any explicitly named `fortudo-*` database. It needs a versioned artifact catalog before supporting v2.                      |
| Migration-family foundation           | `scripts/migrations/taxonomy_identity_v1/planner.py`              | Read-only v1 identity planning for an explicit `fortudo-*` database. Its transformation applies only to the taxonomy-identity-v1 schema transition.                     |
| Intentionally one-off                 | `scripts/migrations/taxonomy_identity_v1/dat_411_operation.py`    | Exact source lock, locked meanings, quarantine lifecycle, v1 executor, completion marker, and production approval gates. Never parameterize this file for another room. |
| Exact disposable proof                | `scripts/migrations/taxonomy_identity_v1/disposable_gate.py`      | Proves the completed operation through disposable Cloudant databases. A pass certifies that exact implementation and commit, not future migrations.                     |
| Browser compatibility foundation      | `public/js/document-contract.js` and `public/js/sync-contract.js` | Central persistence envelope, validator, divergence audit, and recovery behavior. These currently support exactly remote contract v1 and writer envelope v1.            |

Import direction is one-way:

```text
versioned production operation
    -> migration-family planner
    -> reusable Cloudant state/client primitives
```

Reusable modules must never import a migration-family or production-operation module. Importing a
write-capable library function is not production authorization; authorization remains in the exact
operation entry point and its reviewed gates.

## Reusable safety guarantees

The reusable Python layer currently provides:

- Credential and response redaction in raised errors.
- Stable account-endpoint checksums without exposing the endpoint.
- Complete current leaf enumeration, including deleted and conflicting leaves.
- Winner-to-leaf consistency checks.
- Canonical state counts and fingerprints that exclude opaque `update_seq`.
- `_security` hashing.
- Revision-aware document writes; the operation supplies and checks the exact parent revision.
- Rate-limit retries with bounded backoff.

The completed operation adds, but does not generalize:

- Approved source and quarantine name policies.
- Native transient replication.
- Database creation and deletion.
- Timer, taxonomy, and locked-meaning preconditions.
- Validator-first fencing.
- Taxonomy/entity successors and conflict tombstones.
- Completion-marker semantics.

A future operation may reuse the algorithms behind those additions, but it must supply and prove
its own target authorization, invariants, and lifecycle gates.

## Starting another room at contract v1

There are two different operations that should not be conflated:

1. Install the exact v1 validator so future revisions must satisfy the document contract.
2. Rewrite current legacy documents with taxonomy identity and writer metadata.

The read-only validator inspector and v1 planner can assess another explicitly named room today.
The `dat-411` operation cannot write to it and must not be generalized by changing its source
constant.

A future fence-only room operation needs:

- A fresh private inventory and explicit room approval.
- Exact database identity, partitioning, leaf-state fingerprint, `_security` hash, and timer state.
- Its own native quarantine and verified capture receipt.
- Installation of the exact v1 validator.
- Proof that only the validator design document changed and `_security` did not.
- A retained quarantine/closure decision and known-client exercise.

It must not apply the `dat-411` taxonomy transformation. A full v1 backfill in another room would be
a separate migration-family operation requiring review of that room's taxonomy, winner/conflict
state, and invariants.

## Starting a later contract version

A policy-only validator change can usually reuse the Cloudant state, quarantine, CAS, verification,
and browser recovery foundations. It still needs:

- An immutable validator artifact and checksum for the new remote contract.
- A browser release that recognizes the exact old and new remote contracts during rollout.
- A compare-and-set design-document successor rather than a first-install fence.
- A version-specific golden corpus and disposable real-Cloudant proof.
- Independent room-by-room installation and verification.

The possible policy change that would prohibit deleting persisted taxonomy identities is recorded
in [Taxonomy Manager UX Point of View](TAXONOMY-MANAGER-UX-POV.md). That note is product context,
not migration authorization.

If the persisted writer envelope changes, the operation also needs version-aware encoding, local
validation, divergence classification, offline behavior, and an explicit expand/contract or strict
cutover decision. Existing remote leaves may remain grandfathered unless the new guarantee requires
a backfill. A backfill reuses revision and verification mechanics, not the v1 transformation.

The follow-up browser organization is specified in
[Phase 2: document-contract version boundaries](plans/implementation/2026-07-23-document-contract-version-boundaries.md).

## Adapter checklist for a future operation

Before adding a new mutating entry point, write down:

- Exact authorized database-name policy.
- Contract version before and after the operation.
- Expected account checksum and database identity.
- Read-only preconditions and source-state lock.
- Whether a native quarantine is proportionate and how it is retained.
- Exact intended leaf transitions.
- Application invariants and cross-document assumptions.
- Treatment of conflicts, tombstones, attachments, and concurrent writes.
- Interruption and partial-result classification.
- Whether completion needs a marker and what verified state it commits to.
- Sanitized operator output.
- Disposable Cloudant proof matrix.
- Production approval and cleanup boundary.

If any of those are unknown, keep the tooling read-only.

## Proof and change policy

Tests and prior Cloudant proofs remain evidence only for unchanged code and unchanged semantics.
Moving a primitive without changing behavior can retain its characterization tests. Parameterizing a
target, changing a validator, changing an envelope, or altering a transition invalidates the
relevant proof and requires a new disposable real-Cloudant gate.

Do not add:

- A configuration-driven production mutation engine.
- Browser-side database provisioning.
- A local revision-graph backup or reverse-restore format.
- Automatic conflict merging or rollback.
- Credentialed scheduled automation.

Those are outside the minimal migration architecture.
