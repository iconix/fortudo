# dat-411 recovery blockers and proposed fixes

## Status and implementer conclusion

Review brief for [PR #124](https://github.com/iconix/fortudo/pull/124), based on the November 9,
2026 incident and the implementer's supplied reviews. The implementer agrees with the diagnosis,
revised minimum patch, and acceptance criteria, and reports no remaining proposal blocker.
This document does not authorize production writes, local data deletion, or deployment.

The implementer identifies the strict repair gate as an implementation mistake: it conflates
eligibility for new writes with compatibility for reading existing revisions. Removing that
gate alone is insufficient because malformed domain fields can pass rebuild when current
writer metadata is present. The user needs the room usable again without losing local work,
deletion history, or cloud records.

The recommended approach retains the original replica, verified archive, staged cloud copy,
and review before replaying changes. Much of this flow already works. The focused changes are
separate read-compatibility validation, suppression of redundant deletion replay, and stronger
completeness coverage. No production cleanup should be necessary.

## Implementer reproduction results

The implementer reports five passing isolated in-memory reproductions, including ten legacy
plus two contracted tombstones across eleven remote-absent IDs. With compatible cloud records,
the existing rebuild preserved all twelve markers and avoided replaying them. This supports
retaining the existing preservation architecture rather than replacing it.

The review also reports that the newer incident branch retains the strict repair check, that
already-deleted cloud records can generate redundant deletion review entries, and that malformed
task fields can pass rebuild despite current writer metadata. These are supplied reproduction
results; they were not rerun as part of incorporating the review. The incident counts and phone
transport failure below remain the original diagnosis evidence, not production findings
independently reverified by the implementer.

## User impact

The user reported that `dat-411` became entirely unavailable for editing after the recent
startup and recovery changes. Both the phone and this computer display **Recovery required**.
The phone also displayed **Sync check failed** and a repair failure ending in **Failed to fetch**.
The desktop Add Task button was confirmed disabled while the recovery warning was active.

The document-contract audit predates PR #124. That PR exposed and extended the startup and
guided-recovery experience; the evidence does not establish that it introduced every
underlying condition in this incident.

## Confirmed findings

### Local audit on the affected computer

The deployed app's own `getLastDivergenceAudit()` and read-only local database inspection returned:

| Observation                                                 | Result                   |
| ----------------------------------------------------------- | ------------------------ |
| Local live document count                                   | 1,574                    |
| Local revisions classified remote-present                   | 1,650                    |
| Revisions classified eligible for upload                    | 2                        |
| Revisions classified recovery-required                      | 10                       |
| Reason for all ten recovery-required revisions              | `FDC_TOMBSTONE_CONTRACT` |
| Persisted remote-rejection identities                       | 0                        |
| Live revisions among all twelve pending revisions           | 0                        |
| Deleted revisions among all twelve pending revisions        | 12                       |
| Deleted revisions without current writer metadata           | 10                       |
| Deleted revisions with current writer metadata              | 2                        |
| Distinct document IDs represented by those twelve revisions | 11                       |
| Those IDs reported `not_found` by remote `_all_docs`        | 11                       |

Document counts and revision counts measure different things: the audit includes deleted and
conflicting leaves. The twelve pending revisions are all deletion markers, or tombstones.
The two eligible revisions are also tombstones, not live task changes waiting to upload.

Remote checks used the same room configuration as the affected app, and the remote handle
reported 1,736 live documents, matching the independent cloud inspection. The local audit
therefore identifies the concrete desktop blocker: ten legacy deletion revisions fail the
current tombstone contract even though their document IDs are absent remotely.

Calling them obsolete means they are unnecessary to reproduce the cloud's observed current
state. It does not prove the IDs never existed remotely, explain their entire history, or
guarantee another device cannot recreate a record later. Their history should be preserved.
The phone's local revision set has not been inspected and need not match the desktop's.

### Cloud state and transport

A paced read-only scan of cloud changes and their winning document bodies found:

| Observation                                          | Result                           |
| ---------------------------------------------------- | -------------------------------- |
| Live records excluding the contract design document  | 1,735                            |
| Contract design documents                            | 1                                |
| Deleted documents                                    | 52                               |
| Documents advertising multiple revision leaves       | 29                               |
| Additional advertised leaves                         | 29                               |
| Live winning records failing the current contract    | 2, both `FDC_CONTRACT_VERSION`   |
| Deleted winning records failing the current contract | 13, all `FDC_TOMBSTONE_CONTRACT` |

The structural validation counts cover winning bodies, not every losing conflict body.
These are observations of a live database, not an atomic historical snapshot.

The remote validator's version, checksum, and exact source matched the expected version-1
contract. Database reads and a small `_bulk_get` succeeded. CORS preflight and response headers
allowed the production app origin. The paced scan encountered no HTTP 429 responses.

The phone's **Failed to fetch** remains an unconfirmed transport failure. Successful small,
paced requests do not establish that a full unpaced repair download would succeed. The
deployed sync code still lacked the existing paced transport changes at inspection time.

## Why the current behavior blocks the room

In [sync-contract.js](../../public/js/sync-contract.js), `auditLocalDivergence()` first uses
`_revs_diff` to find exact local revisions missing remotely. A missing revision that fails
`validateLocalDocumentContract()` enters `recoveryRequired`.

The validator in [document-contract.js](../../public/js/document-contract.js) requires
`writerContract.version === 1` even for a deletion. The ten legacy local tombstones fail
that requirement. [sync-manager.js](../../public/js/sync-manager.js) treats
`recovery-required` as a room-wide persistence block.

This audit does not distinguish a deletion for an existing remote record from a deletion
whose entire document ID is absent remotely. The generic warning does not explain that this
desktop's pending revisions consist entirely of deletion history.
Simply changing the warning or removing the audit block would be insufficient: the ordinary
unfiltered push could still send the legacy tombstones and encounter server rejection.

## Why repair has a separate compatibility barrier

Normal divergence auditing accepts an exact remote-present revision before checking whether
it satisfies today's writer contract. This permits existing cloud revisions with legacy
metadata to remain usable.

In [guided-recovery.js](../../public/js/guided-recovery.js), `rebuild()` instead validates
every downloaded application leaf against the current writer contract and rejects the
entire staged database when any leaf fails. It does this before its remote divergence audit.
The observed cloud already contains winning revisions that fail that unconditional check.
Consequently, fixing the download transport alone leaves a predictable validation barrier.
This barrier is distinct from the phone's observed network failure.

The test named `blocks unsafe cloud contents and retains originals` in
[guided-recovery.test.js](../../__tests__/guided-recovery.test.js) currently enforces this
strict behavior. A compatibility change needs an explicit distinction between missing writer
metadata and unsafe domain contents, rather than weakening that test without a replacement.

## Proposal A Preserve and rebuild the local replica

This is the preferred candidate because the existing recovery service already preserves,
stages, verifies, selects a new replica, and reviews archived differences.

1. Preserve the original local database and create an independently stored, verified recovery
   archive before selecting another replica. Include every current live, deleted, and
   conflicting leaf, attachments, and available revision ancestry. Offer a downloadable copy.
2. Download the cloud into a separate local database using the paced transport. Do not replay
   the old local tombstones into that database automatically.
3. Compare archived changes with the staged copy using the following rules.
4. Activate the staged copy only after verification and source-change checks pass. Keep the
   original database and archive available afterward.

| Archived local state | Staged cloud state       | Proposed handling                                           |
| -------------------- | ------------------------ | ----------------------------------------------------------- |
| Deleted              | ID absent                | Keep the marker in the archive; no deletion needs replaying |
| Deleted              | Record already deleted   | Retain history; avoid redundant deletion replay             |
| Deleted              | Live record exists       | Require explicit review before creating a new deletion      |
| Live                 | Absent or different      | Preserve for explicit review and restoration                |
| Any                  | Conflicting leaves exist | Preserve the leaves; do not silently collapse them          |

For the observed desktop state, all twelve pending revisions remain preserved without being
automatically uploaded from the new active replica. The implementer's reproduction confirms
that this already works when the cloud contains compatible records. A fresh cloud comparison
should surface observed changes before a deletion decision, but it cannot make a subsequent
offline local write atomic with remote changes.

The existing `review()` already skips an archived deletion when `currentDocument()` returns
no current record. Add explicit handling for an already-deleted record: preserve the archived
marker and current tombstone without offering another deletion. Retain explicit review for
deletions against live records and cover multiple archived leaves for the same ID.

`restore()` checks the expected revision in the active local database. Retain that guard and
describe it accurately: a local revision change invalidates the decision, but a remote change
that has not replicated locally does not. Neither the UI nor tests should claim a remote
compare-and-swap guarantee that the offline write path does not provide.

The archive format contains current leaf bodies and ancestry, not a complete export of every
historical revision body. Retaining the original database is therefore part of the proposal.
Local archives also share the device's storage failure risk; they should not be presented as
an independent off-device backup. Rollback after new edits must preserve the new replica's
changes as well as the original.

## Proposal B Align repair with existing cloud compatibility

Treat current writer eligibility and safe reading as separate checks:

- Preserve a supported, exact remote-present revision unchanged even if it lacks current
  writer metadata. A downloaded cloud revision should receive the same compatibility
  treatment as that revision arriving through normal sync.
- Keep the current contract mandatory for every new edit or reviewed restoration. Do not
  attach metadata to a downloaded document while retaining its old `_rev`.
- Define and check the domain shapes the app can safely load independently of writer
  metadata. A supported legacy record may pass; a malformed record with valid current writer
  metadata must fail the read-safety check. Preserve unsupported or unreadable records
  verbatim, block activation, and provide an actionable explanation. Do not silently drop or
  normalize them to make repair succeed.
- Keep remote validator compatibility checks and activation protections intact.

Verification should cover both preservation and download completeness. Checking that every
staged leaf exists remotely proves that the staged copy contains no unexplained local leaves;
it does not, by itself, prove that every required remote leaf was downloaded. Require a
successful complete replication with failures inspected, and vet a bounded check that the
source leaves expected for that transfer are present locally, including conflicts and
tombstones. Treat Cloudant sequence values as opaque continuation tokens, not an atomic
content lock. Avoid introducing a general snapshot or migration framework for this fix.

## Other approaches and their tradeoffs

| Approach                                                                         | Benefit                                           | Concern                                                                                                                                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classify obsolete tombstones as nonblocking and exclude them from normal uploads | Could reopen editing without a full rebuild       | Must cover every upload, retry, checkpoint, and concurrent-write path; exclusions must not suppress a later legitimate deletion or a recreated record sharing the ID |
| Create new contracted deletion revisions locally                                 | Keeps deletion intent in the active revision tree | Could propagate obsolete intent or conflict with a recreated cloud record; adding metadata does not establish that replaying the deletion is appropriate             |
| Rewrite legacy cloud records before repair                                       | Could satisfy the existing strict repair gate     | Broadens the incident into a production migration, changes revisions, and introduces conflict and category-identity risks                                            |

The first alternative may be useful later, but changing audit classification alone is unsafe.
The latter two should not be automatic incident remediation. The preferred candidate keeps
cloud data unchanged and uses the existing staged-recovery mechanism.

## Regression cases required before shipping

1. Reproduce the desktop pattern: ten legacy and two contracted deletion leaves across eleven
   remote-absent IDs. Preserve all originals and complete repair without replaying them.
2. Repair a cloud copy containing supported legacy live records, legacy tombstones, conflicting
   leaves, and attachments. Preserve original bodies and revision identities.
3. Distinguish a supported legacy record from a malformed or unsupported domain record; prove
   that unusable content is preserved and never silently accepted or discarded.
4. Cover an absent record, an already-deleted record, and a live record for a deletion's ID.
   Suppress redundant deletion replay for the first two and retain explicit review for the
   live record. Reject restoration when the expected active-local revision has changed.
   Separately exercise an unreplicated remote change and document the actual conflict behavior;
   do not assert that the local revision guard detects it.
5. Include genuinely unsynced live local work and conflicting deletion/live branches. Preserve
   every leaf and restore only reviewed changes through current-contract writes.
6. Interrupt replication, exhaust read retries, fail archive verification, run out of storage,
   change the validator, or fail replica selection. Leave the original intact and selectable
   through a safe recovery path; do not activate a partial copy.
7. Allow an older tab to finish an in-flight write around activation. Preserve the late change
   and keep the existing stale-tab write fence effective.
8. Verify that new ordinary writes and restorations still obey the server contract. Exercise
   repeated repair, reload, and review so retries do not duplicate edits or lose decisions.

## Minimum patch recommended by the implementer

1. Keep verified archives, original replicas, separate staging, and activation fences.
2. Accept supported legacy cloud revisions unchanged and separately validate domain shapes
   the app can safely read.
3. Preserve unsupported records and block activation with an actionable explanation.
4. Suppress redundant deletion replay while retaining explicit review for deletions against
   live records.
5. Retain replication failure checks and add focused completeness coverage for conflicting
   leaves, tombstones, attachments, and interrupted retries. The staged-to-remote audit alone
   proves membership, not download completeness.
6. Keep current-contract validation mandatory for new writes and restorations.

The strict repair gate was intended as a safety barrier, but the implementer agrees that its
writer-metadata check is the wrong boundary for existing cloud revisions. Repair can be fixed
without a production data cleanup or a new replication architecture.

## Response to the implementer and acceptance requirements

I agree with the minimum patch. It targets the actual blockers while retaining the
preservation machinery that already works. Your reproductions justify narrowing the original
proposal: rebuilding does not need redesigning. I also accept your correction that the
restoration revision guard is local and provides no atomic guarantee against cloud changes.

I would retain three requirements from the original proposal:

1. **Define read compatibility before replacing the strict gate.** Removing writer-contract
   validation is necessary, but an overly strict domain validator could recreate the same
   recovery deadlock. Accept supported historical representations the app knows how to load.
   Conversely, current writer metadata must not make malformed fields acceptable. Preserve
   downloaded bodies and revision IDs unchanged; apply current write rules when creating a
   new revision.
2. **Preserve deletion intent without automatically replaying it.** Skip redundant deletion
   review for both absent and already-deleted records while retaining their archived histories.
   A deletion against a live record still needs explicit review, including cases with several
   archived branches sharing an ID. The original proposal primarily requires this behavior,
   not a new preservation mechanism.
3. **Make completeness an explicit acceptance criterion.** Avoid a new snapshot framework, but
   demonstrate that the actual replication-result checks reject incomplete transfers. A
   passing staged-to-remote membership audit is insufficient. If existing PouchDB completion
   semantics provide the necessary guarantee, focused tests should establish that. Add a
   bounded runtime check only where a concrete gap remains.

Two additional delivery requirements should prevent a technically correct patch from leaving
the user blocked:

- **Check the observed legacy cloud records against the proposed read validator.** Missing
  writer metadata alone should cease blocking them, but the incident's contract scan did not
  establish that their domain fields are supported. Verify that distinction through an
  authorized read-only compatibility check or appropriately protected representative fixtures.
  If their shapes are unsupported, identify that before claiming the patch unblocks `dat-411`.
- **Give a usable next step when activation remains blocked.** Retain access to the verified
  saved copy and explain the failing record type or field without exposing sensitive contents
  in routine logs. A generic “repair couldn’t finish” message is insufficient. Explain what
  correction, supported update, or reviewed recovery action would allow progress; provide
  access to the preserved export when automatic recovery cannot proceed.

I would not add automatic tombstone rewriting, production cleanup, or a new upload-exclusion
mechanism to this patch. Those introduce risk and complexity without being necessary to repair
the diagnosed case. These requirements clarify the proposed acceptance criteria; they do not
establish that the patch has been implemented or tested.

## Implementer concurrence and decisions before coding

In the follow-up review, the implementer accepted the revised scope and acceptance criteria
as a sound implementation brief. The remaining decisions should become concrete test cases
before coding; they are details to resolve within this scope, not reasons to redesign recovery.
That document review involved no code changes, new test runs, or production access.

- Specify the supported task, activity, and configuration shapes for read compatibility,
  preferably reusing existing domain rules where appropriate. Define actionable failure
  details without exposing sensitive record contents in routine logs.
- Choose the smallest completeness check and fixtures that cover missing remote leaves,
  attachments, and retries without introducing a general snapshot framework.
- Specify when to refresh cloud comparisons and how to explain changes that have not yet
  replicated locally. Keep the local revision guard distinct from remote concurrency.
- Confirm preservation and review semantics when several archived leaves share an ID,
  including combinations of live and deleted branches.

The initial test matrix must make the supported historical task, activity, and configuration
formats explicit, cover multiple branches sharing an ID, and establish replication completeness
under interrupted retries. These cases should guide the minimum implementation described above.

Passing synthetic fixtures establishes behavior for those fixtures. It does not establish
that the actual incident records are readable. Verification of the affected cloud records
against the proposed read validator remains a separate requirement before claiming that
`dat-411` is unblocked.

## Related work and scope boundaries

The local branch `codex/fix-false-room-recovery` includes existing paced transport commits
`2929306` and `6d4e9f9`, plus changes addressing a separate bug that inferred permanent
rejection from revisions still missing after a push. That work was not deployed during the
diagnosis. The affected desktop had zero saved rejection identities, so that inferred-rejection
fix does not address its ten tombstone failures.

No data changes, reset, repair, or cloud mutation were performed as part of the diagnosis.
The tests for the earlier transport and inferred-rejection work did not validate these proposals.

## Local implementation and actual record verification

The minimum repair patch is now implemented locally. It adds a pure read-compatibility validator,
preserves supported legacy cloud revisions unchanged, checks source revision coverage before
activation, suppresses redundant deletion replay, and makes the verified saved copy downloadable
when repair fails. Originals, archive checks, staging, activation fences, and current-contract
validation of new writes remain in place.

New regression cases cover the twelve-tombstone incident pattern, supported historical task and
configuration forms, malformed fields despite current writer metadata, multiple live/deleted
branches for one ID, missing conflict/tombstone/attachment records in a falsely successful pull,
retry completion, local revision guards, and interrupted or failed activation. Browser cases
exercise legacy cloud repair with preserved conflict attachments and export after blocked repair.

On November 9, 2026, a separate paced read-only scan applied the new read-compatibility rules
to all 1,817 advertised current cloud revision leaves in `dat-411`, including losing conflict
branches and tombstones. It read bodies and attachments into memory and printed only aggregate
results. All leaves passed: 1,749 live application revisions, 67 deleted revisions, and one design
revision. Of the application leaves, 17 failed current writer-contract validation but none failed
read compatibility. Live leaves comprised 32 task, 1,712 activity, and five configuration
revisions. These are revision counts, not distinct document counts. No throttling was observed.

A final read-only recheck after tightening scheduled-task duration validation examined all 32
task revisions and the other revisions under non-activity IDs (90 leaves total). All passed
the final validator. Validation completed with 1,959 JavaScript tests, 216 Python repository
tests, and 49 local browser tests passing. JavaScript coverage remained above all repository
thresholds. The incident fixture asserts exactly twelve archived tombstones across eleven IDs.

This establishes compatibility of the actual inspected records with the new read rules. It does
not establish a completed repair of either affected device. The patch has not been deployed,
and the user's local replica selection, original data, and cloud data were not changed.

## Followup subagent findings and corrections

An independent review of PR #128 at `fc5cda3` found two concrete gaps, reproduced without
production access:

1. The validator accepted missing/null unscheduled priority, but the renderer required a
   string. A real rebuild could activate successfully and then fail during rendering.
   `loadTasks()` now projects Medium priority for those historical values without changing
   persisted bodies or revisions. Regression tests run real rebuild, storage hydration, and
   rendering for omitted, null, and explicit priority, and verify stored revisions remain exact.
2. PouchDB's ten-change replication batch could request thirty revision leaves when each
   document had three conflicts. Pacing alone repeated an oversized request until retries
   exhausted. The transport now splits by requested revision count, queues each chunk through
   the existing pacing/retry/cancellation path, and merges all branch/error results. A failed
   chunk never becomes a partially successful combined response. Unit and real-browser
   regressions cover shared capacity, conflicts, cancellation, and failed later chunks.

The browser repair fixture also models HTTP close semantics for its local IndexedDB cloud
stand-in across tabs. Real source, archive, and staged handles retain their original lifecycle;
this avoids fixture-only shared-connection closure races while keeping preservation assertions.
The priority regression additionally verifies rendering after reload and that the cloud record
is still stored without the projected priority field.

The followup verification on November 10 passed: 1,973 JavaScript tests across 93 suites,
216 Python repository tests, and 50 local browser cases. Coverage was 91.58% statements,
81.04% branches, 92.99% functions, and 92.49% lines. The full `npm run verify` gate used
one Jest worker with UTC scoped to Jest; browser tests retained the host timezone. Production
data and affected user replicas were not changed during these corrections.

Related context:

- [Sync and safety states](../reference/SYNC-STATES.md)
- [Offline client migration safety](OFFLINE-CLIENT-MIGRATION-SAFETY.md)
- [Local recovery archive implementation](../../public/js/local-recovery.js)
- [Completed dat-411 migration runbook](../migrations/taxonomy_identity_v1/dat-411-operation-runbook.md)
