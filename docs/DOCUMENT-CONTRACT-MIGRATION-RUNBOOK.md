# Document-contract migration runbook

This runbook is the operational companion to the entity and taxonomy identity hardening. It does not authorize a production write by itself. Stop whenever a database name, UUID, opaque update sequence, `_security` hash, validator revision, leaf set, or required approval differs from the locked private manifest.

Never paste the Cloudant credential URL, document bodies, descriptions, or private manifests into a terminal transcript, issue, pull request, or chat. Set `FORTUDO_CLOUDANT_URL` only in the local process environment. Store inventories, snapshots, and journals on an encrypted user-only volume outside the repository by default.

An operator may explicitly accept temporary unencrypted storage with `--confirm-temporary-unencrypted` only when the directory is user-only, outside the repository and cloud-synced folders, and retained no later than completion of S3 and the known-client exercise. The private manifest records this protection mode and deletion condition. Never pass `--confirm-encrypted-volume` for an unencrypted destination.

## Compatibility release

The compatibility release:

- writes document contract version 1 and the redundant category witness;
- audits exact local leaf revisions before every push;
- permits existing databases whose validator is not installed yet;
- never creates a remote database from the browser;
- blocks mismatched/newer fences and recovery-required replicas;
- keeps an unprovisioned room local-only;
- exports stranded local leaves before an explicitly confirmed reset.

Do not switch `COMPATIBILITY_RELEASE_ALLOWS_MISSING_VALIDATOR` to fail-closed until every known nonempty production room is either fenced or explicitly retired.

## Required local and preview gates

Run the repository checks and regenerate the service-worker artifact:

```powershell
npm run build:sw-precache
npm run check:pouchdb
npm run check:fontawesome
npm run check:css
npm run verify
```

After deploying an isolated compatible preview, run its acceptance suite. Then run the disposable real-Cloudant gate through PouchDB 9:

```powershell
node scripts/cloudant-contract-gate.mjs
```

The gate creates and destroys only two randomly named `fortudo-preview-contract-gate-*` databases. Its aggregate output must show compatible writes, denied legacy writes and tombstones, partial mixed-batch behavior, a detected checkpointed denial, and validator-last reconstruction.

Require green GitHub CI, record the exact commit SHA and generated service-worker version, deploy the compatibility release, and verify live asset hashes before any production fence installation.

## Private inventory

Create a fresh read-only inventory:

```powershell
python scripts/document_contract_ops.py inventory `
  --manifest-root X:\fortudo-private `
  --confirm-encrypted-volume
```

For the approved temporary-unencrypted exception, replace the final flag with `--confirm-temporary-unencrypted`.

The normal output contains aggregate counts and the manifest checksum only. Locate the private manifest inside the operator-supplied root; its path and exact database list stay off normal command output. Obtain explicit approval for the fresh database list. Do not reuse an older count.

## Fence and migrate `fortudo-dat-411`

1. Stop the timer and close known active clients.
2. Lock the database name, UUID, opaque update sequence, `_security` checksum, taxonomy mapping, current winners, and every conflict leaf from the private inventory/dry-run.
3. Create `S0` before installing the fence:

   ```powershell
   python scripts/document_contract_ops.py snapshot `
     --database fortudo-dat-411 `
     --backup-root X:\fortudo-private `
     --label S0 `
     --confirm-encrypted-volume
   ```

   For the approved temporary-unencrypted exception, replace the final flag with `--confirm-temporary-unencrypted`. The resulting manifest binds the exception and mandatory post-S3 deletion into its checksum.

4. Install the validator using only values copied from the locked `S0` manifest:

   ```powershell
   python scripts/document_contract_ops.py install `
     --database fortudo-dat-411 `
     --confirm-database fortudo-dat-411 `
     --expected-uuid <private-uuid> `
     --expected-update-seq <private-opaque-sequence> `
     --expected-security-checksum <private-hash> `
     --snapshot <S0-path>
   ```

5. Verify the validator and prove that only its design leaf changed. Create `S1` with the same snapshot command and `--label S1`.
6. Run a new default dry-run of `migrate_taxonomy_identity.py`. Its sequence must exactly equal the `S1` sequence.
7. Apply with the exact `S1` path:

   ```powershell
   python scripts/migrate_taxonomy_identity.py `
     --database fortudo-dat-411 `
     --apply `
     --expected-update-seq <S1-opaque-sequence> `
     --confirm-database fortudo-dat-411 `
     --s1-snapshot <S1-path>
   ```

The migration journal is created beside `S1`. On interruption, rerun with `--journal <journal-path>` only after the dry-run still describes the same intended bodies. Locked pre-states resume, exact intended results are accepted, and any divergence halts.

The tool applies identity revisions and conflict tombstones first, verifies all invariants, fingerprints the complete current leaf state, then writes and rereads the completion marker separately. A pre-existing marker blocks automatic execution and requires manual verified-state review.

8. Create `S2` only after marker, fingerprint, counts, winners, conflict resolution, locked labels, and nonidentity invariants all verify.

Direct production restore is disabled. Reconstruct a new `fortudo-quarantine-*` database with `restore-quarantine`; legacy leaf trees load before the validator. Reconciliation back into production remains manual and selective.

## Other existing rooms

After approval of the fresh inventory, process one room at a time:

1. Re-lock its identity and state.
2. Create `R0`.
3. Install the fence with the snapshot lock.
4. Verify that only the design leaf changed.
5. Create `R1`.

Do not run the `fortudo-dat-411` taxonomy migration against another room. A failure in one room does not authorize or invalidate another room's operation.

## Future rooms and closure

Provision future remote rooms manually and fence-first:

```powershell
python scripts/document_contract_ops.py provision `
  --database fortudo-<room> `
  --confirm-database fortudo-<room>
```

Exercise each known client. It must either pass a stable divergence audit and sync, or export/reset, pull, and then pass. Create `S3` after that exercise; it is an aggregate observation, not proof that no dormant replica exists.

The final record must include exact test and coverage results, CI and deployment status, commit and service-worker SHAs, live asset hashes, inventory/snapshot/journal paths and checksums, migration and fence counts, validator revision, completion fingerprint, and every post-migration invariant.
