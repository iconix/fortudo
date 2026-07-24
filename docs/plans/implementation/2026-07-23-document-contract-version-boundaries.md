# Phase 2: document-contract version boundaries

**Status:** Follow-up implementation plan; not started.

## Objective

Make the browser's existing v1 document contract an immutable, explicitly versioned artifact and
separate the version numbers for remote policy, writer envelope, taxonomy identity, and data
migration. Preserve current v1 behavior exactly.

This phase prepares a clean extension point whether the next change is:

- another room receiving the current v1 fence;
- a policy-only remote contract v2; or
- a v2 that changes the persisted writer envelope.

It does not implement any of those operations.

## Preconditions

- The completed `fortudo-dat-411` migration remains healthy.
- The retained-quarantine and known-device exercise has a documented closure decision.
- Phase 1's toolkit boundaries and versioned Python operation layout are merged.
- Any public-file change is treated as a compatibility-release change with a Firebase preview,
  regenerated service-worker artifact, full verification, and deployment approval.

## Locked behavior

- The installed v1 Cloudant validator source and SHA-256 checksum remain byte-for-byte identical.
- Current documents continue using writer envelope version 1.
- Taxonomy identity remains version 1.
- Remote contract inspection continues to accept only the exact installed v1 artifact.
- Missing-validator compatibility behavior does not change.
- Divergence audit, recovery, sync ordering, and user-visible update behavior do not change.
- No production Cloudant data or design document is written.

## Proposed browser layout

```text
public/js/contracts/
  writer-v1.js
  remote-contract-v1.js
  registry.js

public/js/document-contract.js
  compatibility facade for current imports

public/js/sync-contract.js
  current single-version orchestration
```

`writer-v1.js` owns persistence-envelope encoding and structural validation for writer version 1.
`remote-contract-v1.js` owns the immutable Cloudant validator, remote policy metadata, checksum, and
accepted writer versions. `registry.js` initially exposes only v1; it must not implement speculative
multi-version negotiation.

Use distinct constants:

```text
REMOTE_DOCUMENT_CONTRACT_VERSION = 1
WRITER_ENVELOPE_VERSION = 1
TAXONOMY_IDENTITY_VERSION = 1
TAXONOMY_MIGRATION_VERSION = 1
```

Equal numeric values do not make these interchangeable.

## Machine-verifiable operational artifact

Replace Python's prose-marker extraction from the mixed browser module with one authoritative,
machine-verifiable path from `remote-contract-v1.js` to the exact Cloudant design document.

Preferred shape:

1. A small Node exporter imports the browser contract module.
2. It emits the canonical design document without credentials or remote metadata.
3. Python inspection and migration tooling consumes the emitted artifact.
4. Tests compare the browser builder, emitted validator source, declared checksum, and Python view.

Do not maintain a second handwritten validator or implement a JavaScript parser in Python.

## Test-first implementation sequence

1. Add characterization tests pinning the current v1 validator source, checksum, design metadata,
   writer envelope, tombstones, and sanitized rejection codes.
2. Add tests proving the four version concepts are distinct exports even though each equals `1`.
3. Add versioned v1 modules and keep `document-contract.js` as a compatibility facade.
4. Add the machine-verifiable design-document export and switch read-only Python inspection to it.
5. Prove the golden conformance corpus still agrees between local and Cloudant validation.
6. Prove startup inspection, divergence audit, recovery classification, and all persistence paths
   have unchanged results.
7. Regenerate the service-worker precache and run the complete repository suite.
8. Deploy an isolated Firebase preview and run browser plus real-Cloudant v1 acceptance.
9. Review live asset hashes before any production deployment.

## Required verification

Run:

```text
npm run build:sw-precache
npm run check:pouchdb
npm run check:fontawesome
npm run check:css
npm run verify
```

Also require:

- Exact v1 validator checksum equality before and after the refactor.
- Exact design-document semantic equality.
- Deployed-preview acceptance.
- The current real-Cloudant contract gate.
- Green GitHub CI.
- No production Cloudant write.

## Explicit deferrals

Do not add during phase 2:

- Remote contract v2.
- Writer envelope v2.
- Dual-version room negotiation.
- Offline envelope selection.
- A transition or bridge validator.
- A generic migration adapter class.
- Another-room fencing.
- Automatic provisioning, backfill, conflict resolution, or recovery import.

Those behaviors require a concrete migration proposal and their own review.

## Completion criteria

Phase 2 is complete when v1 is represented as an immutable versioned artifact, each version axis is
named independently, operational tooling consumes the same reviewed artifact without brittle source
markers, and every current browser/Cloudant behavior remains proven unchanged.
