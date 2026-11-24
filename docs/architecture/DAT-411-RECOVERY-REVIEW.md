# dat-411 recovery review brief

## Status and diagnosis

[PR #128](https://github.com/iconix/fortudo/pull/128) implements the minimum recovery patch
agreed with the original implementer after the incident surfaced through
[PR #124](https://github.com/iconix/fortudo/pull/124). It is ready for implementer review;
merge, production deployment, and repair of the affected devices remain separate steps.

The desktop room was blocked by ten legacy deletion revisions that lack current writer
metadata. Repair then applied today's write contract to existing cloud revisions, rejecting
records that normal sync accepts as already remote-present. Writer eligibility and read
compatibility require separate checks: valid writer metadata also does not prove that task
fields are safe to load. The implementer agreed with this diagnosis and scope.

The phone also reported **Failed to fetch**. Its precise transport failure and local revision
set were not independently established. The evidence does not show that PR #124 introduced
every underlying condition.

## Incident evidence

Read-only inspection on November 9, 2026 found:

- Twelve pending desktop revision leaves across eleven IDs: ten legacy tombstones and two
  contracted tombstones. There was no pending live work and no saved rejection identity.
- All eleven IDs were absent in the observed cloud state. These deletions were unnecessary
  to reproduce that state, but their history still needed preservation.
- Both devices displayed **Recovery required**; desktop editing was disabled.

These observations are not an atomic snapshot or proof of an ID's entire history. Another
device can recreate a record, and the phone need not have the desktop's revision set.

## Agreed implementation and safety requirements

1. Keep the original replica, independently stored verified archive, separate staging, source
   checks, and activation fences. Preserve live, deleted, and conflicting leaves, attachments,
   and available ancestry. Offer a saved-copy download when repair fails.
2. Accept supported historical task, activity, and configuration shapes independently of
   writer metadata. Preserve downloaded bodies and revision IDs unchanged. Block activation
   for unsupported or unreadable content with an actionable record-type/field explanation.
3. Keep the current write contract mandatory for new edits and reviewed restorations.
4. Inspect replication failures and verify that advertised source leaves are present in
   staging before activation. The staged-to-remote audit proves membership, not completeness;
   sequence tokens do not provide an atomic cloud snapshot.
5. Preserve archived deletion history without replaying unnecessary deletions:

| Archived state    | Current state                | Handling                                                  |
| ----------------- | ---------------------------- | --------------------------------------------------------- |
| Deleted           | ID absent or already deleted | Preserve history; skip redundant deletion replay          |
| Deleted           | Live record                  | Require explicit review before deletion                   |
| Live              | Absent or different          | Preserve for explicit review/restoration                  |
| Multiple branches | Any                          | Preserve every branch; do not silently collapse conflicts |

Restoration guards the expected **active-local** revision. It cannot detect a remote change
that has not replicated locally or make an offline write atomic with cloud changes. Archives
contain current leaf bodies and ancestry, not every historical body; retaining originals is
therefore essential. Local archives also share the device's storage failure risk.

No automatic tombstone rewriting, production cleanup, upload-exclusion framework, or general
snapshot architecture is required.

## Review-sensitive changes

- The paced transport adds bounded read retries and cancellation. Bulk reads are split into
  at most ten requested revisions, including conflicts sharing an ID; failed chunks cannot
  become partial success. A guarded, reproducible PouchDB 9 vendoring patch prevents transient
  bulk-read failures from selecting permanent per-document fallback.
- Historical unscheduled tasks with omitted/null priority receive a read-time `medium`
  projection for display and editing; persisted bodies and revisions remain unchanged.
- The PR also fixes a separate false-rejection bug: checkpoint-skipped revisions receive one
  fresh-checkpoint retry, and only confirmed forbidden responses persist rejection identities.
  This did not cause the desktop incident, which had no saved rejection identities.

## Verification and independent review

Regression coverage includes the exact twelve-tombstone/eleven-ID pattern; legacy formats;
malformed fields despite current writer metadata; conflicts, tombstones, and attachments;
redundant-deletion review; local revision guards; interrupted retries and activation failures;
stale-tab writes; preserved exports; and hydration/rendering without changing stored revisions.

On November 10, the full `npm run verify` gate passed:

- **1,973 JavaScript tests** across 93 suites, **216 Python tests**, and **50 browser cases**.
- Coverage: 91.58% statements, 81.04% branches, 92.99% functions, 92.49% lines.
- Lint, formatting, and service-worker freshness checks passed. Jest used one worker and UTC;
  browser tests retained the host timezone.

Independent subagent review initially found the priority-rendering and oversized-conflict-read
bugs. Both were fixed in `a9ff1d3`. Re-review found **no actionable findings** and independently
confirmed unchanged stored priority records and replication of all thirty conflict leaves in
three ten-revision requests. Its focused run passed 46 tests; it did not rerun the full gate or
access production data. CI and preview deployment passed; production deployment was skipped.

## Actual dat-411 compatibility check and limits

A paced, read-only scan on November 9 applied the read validator to **all 1,817 advertised
current cloud revision leaves**, including losing conflicts and tombstones:

| Leaves                      | Count |
| --------------------------- | ----: |
| Live application revisions  | 1,749 |
| Deleted revisions           |    67 |
| Design revision             |     1 |
| Read-compatibility failures | **0** |

Seventeen application leaves failed today's writer contract but passed read compatibility.
The live leaves comprised 32 task, 1,712 activity, and five configuration revisions. A final
recheck after tightening scheduled-task duration validation covered all 32 task revisions and
other leaves under non-activity IDs (90 leaves total), with zero failures. Bodies and
attachments stayed in memory; only aggregate results were reported.

This establishes compatibility of the inspected records, **not a completed device repair**.
No production cleanup, cloud mutation, reset, or affected-device replica switch was performed.
Synthetic fixtures alone would not establish compatibility of the actual incident records.

Related: [sync states](../reference/SYNC-STATES.md),
[offline client safety](OFFLINE-CLIENT-MIGRATION-SAFETY.md),
[archive implementation](../../public/js/local-recovery.js).

## Follow-up: expired cloud deletion markers

The subsequent [retention review](TOMBSTONE-RETENTION-REVIEW.md) reproduces a false
blocker when the cloud removes an old deletion marker. Its small patch preserves
local history and skips deletion uploads only when every branch in the inspected
local replica is deleted and the cloud explicitly confirms the whole ID absent.
This is not global deletion authority: stale devices can retain live records.
Preventing their later resurrection would require a separate reconciliation
policy or durable deletion records; blocking this room does not solve that issue.
