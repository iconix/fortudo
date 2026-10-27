# Document-contract v1 preparation

**Status:** Implemented in the v1 artifact refactor; release acceptance remains separate.

## Scope

Freeze the reviewed v1 remote policy, export it reliably for operational tooling, and prove that
current behavior is unchanged. No registry or multi-version negotiation is needed until a concrete
v2 policy requires it.

## Implementation

- `public/js/contracts/remote-contract-v1.js` owns the exact validator function, rejection codes,
  source checksum, remote-policy version, and design-document builder. The validator source and
  checksum remain byte-for-byte identical to the installed v1 artifact.
- `public/js/document-contract.js` remains the existing import facade and writer-envelope encoder.
  `WRITER_ENVELOPE_VERSION` and `REMOTE_DOCUMENT_CONTRACT_VERSION` are independent names. The old
  `DOCUMENT_CONTRACT_VERSION` export remains a compatibility alias for the remote policy. Taxonomy
  identity and the completed migration retain their existing version boundaries.
- `scripts/export-document-contract.mjs` imports the native browser module and verifies the
  reviewed source hash and metadata before emitting the canonical design document. `--write`
  regenerates `contracts/document-contract-v1.json`; `--check` detects drift without writing.
- Python inspection and the completed migration load the emitted JSON artifact and independently
  verify its v1 identity and checksum. Python no longer parses JavaScript or depends on prose
  markers. Loading an artifact does not require Node at operational runtime.
- The disposable Cloudant gate uses the same verified exporter. The generated JSON is a checked-in
  output, not a second handwritten validator.

## Unchanged behavior

The current writer envelope, taxonomy identity, missing-validator tolerance, exact v1 compatibility
checks, divergence classification, recovery behavior, sync ordering, and update UX remain unchanged.
No production Cloudant documents, validators, credentials, or room provisioning change.

## Verification

Characterization tests pin the reviewed v1 checksum, canonical artifact, writer envelopes and
tombstones. Existing golden-corpus and browser safety suites retain the behavior checks. Exporter
and Python tests cover source/metadata drift, missing or invalid artifacts, alternate working
directories, regeneration, and sanitized failures.

Run focused checks during implementation, then the release gates on the completed change:

```text
node scripts/export-document-contract.mjs --check
npm run build:sw-precache
npm run check:pouchdb
npm run check:fontawesome
npm run check:css
npm run verify
```

An isolated Firebase preview, deployed browser acceptance, the disposable real-Cloudant contract
gate, and green CI remain release acceptance requirements. Inspect live asset hashes before a
separately approved production deployment. Local checks do not claim those release checks passed.

## Separate operational decisions

Retained-quarantine closure and the known-device exercise remain operational work. They do not block
this behavior-preserving source refactor, which neither deletes the quarantine nor changes
production data.

Another-room fencing, v2 policy or envelope design, multi-version negotiation, backfills, and
provisioning require their own concrete proposals and checks.
