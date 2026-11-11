# Cloud deletion-marker expiry: review brief

Status: implemented for PR review on November 10, 2026. No production deployment,
user-data mutation, or actual-device repair is part of this change.

## Reproduction

The executable reproduction is
[`sync-tombstone-retention.test.js`](../../__tests__/sync-tombstone-retention.test.js).
It uses real PouchDB 9 replication, the real application audit and sync manager,
and a dedicated memory-only adapter. No remote account or browser profile is used.

Each fixture creates a live task, an attachment, and a deleted task on the source.
Three complete pull/push rounds establish real checkpoints and compatible audits.
The fixture then removes only the deleted ID's metadata and revision bodies from
the memory source. It verifies that its UUID, sequence counter, checkpoints, and
all unrelated raw entries remain unchanged. The local deleted revision remains.

This models the observable result of Cloudant removal: exact-revision GET returns
404, `_revs_diff` reports the revision missing, and `_changes` omits the ID. It does
not reproduce Cloudant's internal scheduler, elapsed retention time, or hosted
HTTP transport. The memory adapter has no purge implementation; the deletion
helper is guarded to operate only on these disposable, fully deleted fixture IDs.

Results reproduced before the patch:

| Case                                | Checkpointed replication      | Application behavior                                                |
| ----------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| Legacy deleted revision expires     | Writes zero records           | Full audit reports `FDC_TOMBSTONE_CONTRACT`; editing is blocked     |
| Contracted deleted revision expires | Initially writes zero records | Audit calls it pending; the fresh-checkpoint retry uploads it again |

Regular synchronization does not prevent this defect. Our full-history audit
reinterprets a retained deletion as new work after the cloud forgets it; the
replication checkpoints themselves are functioning.

[IBM documents automatic removal of fully deleted records' metadata after a
minimum of 90 days](https://cloud.ibm.com/docs/Cloudant?topic=Cloudant-faq-enabling-automatic-removal-of-document-tombstones).
The actual incident also has an unchanged revision classified as cloud-present
in the November 9 archive and cloud-missing in the November 10 archive. That
revision remains in the retained July migration quarantine. Provider cleanup is
the leading explanation, not a directly observed per-record removal event.

## Smallest safe rule

Treat a cloud-missing local deletion as needing no remote deletion when:

1. Every current local leaf for its ID is deleted; there is no live conflict branch.
2. A successful, validated cloud `_all_docs` lookup explicitly reports that whole
   ID absent. A GET 404 alone is insufficient because it can mean a retained tombstone.
3. The local snapshot is still the one audited, and no persisted server denial
   applies to that ID's pending revisions.

Preserve every local revision and existing archive unchanged. Exclude the entire
ID from pending-write validation and both ordinary and checkpoint-bypass pushes.
Keep this classification separate from `remotePresent`: the revision is not
currently in the cloud. A deleted document with a live local or cloud branch keeps
the existing validation/recovery behavior. Existing malformed live-record and
explicit-denial protections remain mandatory.

This does not require deletion timestamps, a 90-day client timer, or a permanent
ledger of cloud acknowledgments. Even a never-uploaded local deletion needs no
remote write when the whole cloud ID is absent. The local history is still kept.
That is a deliberate refinement of the earlier proposal requiring historical
cloud-confirmation evidence.

## Integration boundary

The existing stable audit batches absence checks for candidate IDs using the
existing sync transport, then rechecks the local sequence and retries on drift. Network errors, malformed responses, and
authorization errors must never become confirmed absence.

The production sync manager applies a PouchDB push filter with the sorted excluded
ID set in `query_params`. This binds exclusion scope to the checkpoint identity.
Do not hide a changing exclusion set in a closure behind an unchanged checkpoint
identity. Use the filter in both push attempts, including fresh-checkpoint retries.
Do not filter cloud pulls, discard local documents, or alter server validators.

A changed exclusion set creates a new replication scope and can rescan local
changes. Checkpoints are reused while that set is unchanged. A regression verifies zero
additional writes on a repeated sync; existing pacing remains in place.

If a live cloud document appears after the absence check, the excluded deletion
is not sent. Pull it normally and re-audit; preserve both branches and keep the
existing safeguards. A local recreation becomes pending work on the next stable
audit, with a checkpoint scope that permits its transfer.

Keep the manager's current session, preparation, rejection, retry, post-pull audit,
and replica-activation fences. Do not remove the fresh-checkpoint retry globally:
it is still needed for genuine pending writes skipped by checkpoints.

## Stale-client distinction

�All local branches are deleted� describes only the replica being inspected. It
is not proof that every device agrees, or that this ID must stay deleted forever.
A stale client can still hold a live version and later upload it. Blocking the
current room does not prevent that existing retention-window limitation.

The patch prevents a false blocker and unnecessary uploads; it does not establish
a permanent deletion authority. Live work arriving later remains subject to the
existing conflict and recovery checks. No stale-client data is discarded. Devices
offline beyond retention need a separate preserving reconciliation policy; a
permanent ledger or soft-delete model would be a separate, larger change.

## Regression coverage and verification

The regression suite now calls the production audit and sync manager rather than
a test-only implementation. It covers legacy and contracted expiry; restarts and
repeated sync; the real fresh-checkpoint retry; interrupted pushes; pending live
work and attachments; all-deleted and mixed live/deleted conflicts; live cloud
records; explicit denials; network and ambiguous-response failures; bounded
absence batches; snapshot drift; cloud recreation after preflight; and local
recreation after an excluded push. Original leaves remain unchanged.

The initial red run failed 13 of 21 cases against the unpatched production path.
After implementation and the added integration cases, 118 focused tests across
four suites passed. The full repository gate passed with 2,049 JavaScript tests,
216 Python tests, and 63 browser tests; coverage remained above every threshold.

The memory fixture models cloud API outcomes, not Cloudant's internal cleanup
scheduler or hosted HTTP performance. Existing session and replacement-fence
regressions remain in the manager suite. The latest production `dat-411` state
has not been repaired or declared unblocked by these tests.
