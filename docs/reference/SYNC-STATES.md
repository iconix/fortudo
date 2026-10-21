# Sync and safety states

Status: reference for the current app implementation.
For server provisioning, see [CouchDB Sync Setup](COUCHDB-SETUP.md). For the architectural
background, see [Offline Client Migration Safety](../architecture/OFFLINE-CLIENT-MIGRATION-SAFETY.md).

## Sync status and editing

Before the app's JavaScript starts, the HTML shell displays **Loading Fortudo…** and a native
**Reload** link after 500ms, avoiding a flash on fast loads. This reveal delay uses CSS, so it also
works when the helper script is unavailable. Confirmed failures bypass the delay. A separate
script with no imports reports script failures as **Fortudo couldn’t
load**, and changes an unfinished load to **Fortudo is taking longer to load** after 15 seconds.
The initial message and Reload link remain usable even if that helper fails to load. The fallback
disappears when the room entry screen or main app appears. Reload preserves the URL query, local
databases, and the tab's saved drafts; it does not clear data or initiate repair. This covers
loading the app code itself, before the startup-error toast and its Retry handler can exist.

Fortudo saves task changes in a room-scoped local PouchDB database and replicates them to the
remote room database. The sync badge describes connection, replication, and safety states;
it is not by itself a reliable indication that editing is available.

During startup, the task submission button shows **Loading…**. Users can draft a task, but saving
and existing task actions remain blocked until safety checks, local migration, and loading the
local app state have completed. The first cloud replication does not have to finish before
editing opens. Drafts are retained separately from saved tasks, in session storage scoped to the
room, including across reloads in the same tab. If session storage is unavailable, drafting still
works in memory, but persistence across a reload is not guaranteed.
An untouched start-time field still receives its first suggested value when local loading
finishes. A time the user entered or deliberately cleared is preserved, including across reloads.

There is no permanent "Ready to edit" label. Once editing is safe, controls return to their normal
appearance. Exceptional blocks show explanatory messages and relevant actions. Clicking the sync
badge retries the operation blocking the room: local preparation after a startup failure,
a safety check after an audit failure, or normal sync otherwise. The badge and toast retry links
share one handler and busy guard. Normal sync shows **Checking sync…** and an outcome message even when the badge ends
in the same state. The badge spins and is disabled during the manual request, then returns to the
resulting sync state. Outcomes distinguish completed sync, pending changes, connection failures,
and safety blocks. During initial loading, the click explains that sync is not available yet;
after a startup failure, it runs the same retry as the startup message’s **Retry** action. Local-only
rooms explain that cloud sync is not configured. Background sync does not show these manual-request
notifications.

## Error and safety states

These states block ordinary task writes even after local preparation. A draft is not a saved task
and does not bypass the write restrictions.

| Badge             | Internal state              | What triggers it                                                                                                                                                    | Next action                                                                                                                                                                            |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup error     | `preparation-error`         | Storage preparation, migration, or subsequent startup state loading/normalization failed.                                                                           | Click the sync badge or use **Retry** in the startup message. Persistent failures need investigation of local storage and startup diagnostics.                                         |
| Update required   | `update-required`           | The remote document contract declares an integer version newer than this client supports.                                                                           | Use **Reload** to load a compatible app release. Reloading only helps if that release is available.                                                                                    |
| Reload to update  | `update-required-available` | The same version incompatibility, with an updated service worker waiting to activate.                                                                               | Use **Reload** to activate the waiting update.                                                                                                                                         |
| Sync setup error  | `validator-mismatch`        | The remote contract does not match the expected version, checksum, or exact validator source, or the database is partitioned, which this contract does not support. | Correct the server configuration or align the app/server deployment using the approved setup or migration procedure. The toast does **not** recommend retrying as the fix.             |
| Sync check failed | `audit-error`               | Fortudo could not complete its safety audit or another required sync safety check failed.                                                                           | Click the sync badge or use **Retry check**. If it keeps failing, reload and investigate the diagnostic cause; failure alone does not establish that recovery or a reset is necessary. |
| Recovery required | `recovery-required`         | An exact local revision is missing remotely and either fails the local document contract or was recorded as rejected by the remote.                                 | Use **Recover changes** to save a verified copy, rebuild safely, and review missing changes. Originals are retained.                                                                   |

A tab whose local replica was replaced by repair in another tab shows **Reload room**
(`replica-replaced`). Writes and sync stay suspended there until reload; its task draft is kept.
The message offers **Reload**, which opens the selected replica through normal safety checks.

### What an audit failure means

The divergence audit reads local document revisions, asks the remote which exact revisions it
already has, and checks the remaining local revisions against the document contract. It needs a
stable local snapshot to do that comparison.

`audit-error` includes these cases:

- Local database information, the revision listing, or a document body cannot be read.
- A revision listing or document body is inconsistent with the requested revision.
- The local database changes during each of three snapshot attempts, so a stable audit cannot finish.
- Required rejection-tracking data or another startup safety check fails unexpectedly.
- A remote database handle cannot be created, or replication failures remain unresolved after auditing.

An audit error means **safety was not established**. Recovery required means **specific stranded
local revisions were identified**. They are not interchangeable diagnoses.

Ordinary remote inspection and revision-comparison failures generally become `offline`; transport
exceptions during replication become `offline` or `error`. Those paths should not automatically be
diagnosed as local corruption, an obsolete client, or a configuration mismatch.

### Retry feedback

The startup-error message offers **Retry** to rerun local preparation and state loading. It shows
**Retrying startup…**, then either **Tasks loaded. You can edit tasks again.** or a distinct
**Tasks still could not load…** message with another Retry action. A successful startup retry does
not bypass a remaining update, configuration, audit, or recovery block; that block's explanation
and dedicated action still apply. Repeated badge or toast clicks do not enqueue duplicate startup retries.

The audit-error toast offers **Retry check**; the badge runs the same action in this state. It runs the normal sync path, including safety
checks; it does not override the fence or discard local data. Duplicate retry requests are ignored
while that request is running.

The toast reports the outcome:

- **Checking local changes…** while the request is in progress.
- **Check passed. You can edit tasks again.** when the request finishes in a writable state without
  a transport error.
- **The check failed again…** when auditing still fails, retaining the retry action.
- A connection explanation when the request ends offline or with a transport error, or a generic
  "could not finish" message when the retry rejects unexpectedly.
- A configuration explanation without a retry action if the result is a configuration mismatch.
  Update, recovery, and startup errors retain their own dedicated actions.

Retrying can resolve a transient read failure or concurrent-write race. It cannot install a newer
app, repair a mismatched server validator, or recover rejected records by itself. After an operator
fixes the server configuration, clicking the sync badge can rerun the checks. Badge retries never
automatically reload the app, download a recovery file, reset local data, or replay task edits;
update and recovery messages retain their explicit actions. Background sync remains separate
from these user-requested retries.

## Connection and informational states

Except for **Connecting**, these states permit local edits once local preparation has completed.
They do not guarantee a complete cloud backup or that all other devices' changes have arrived.

| Badge                   | Internal state      | Meaning                                                                                                                                                                |
| ----------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connecting              | `checking`          | Initial compatibility and safety checks are running; ordinary writes are blocked.                                                                                      |
| Local                   | `idle`              | No remote sync URL is configured.                                                                                                                                      |
| Sync ready              | `compatible`        | The compatibility and divergence checks passed; this can appear before local preparation finishes.                                                                     |
| Syncing                 | `syncing`           | Replication is running.                                                                                                                                                |
| Synced                  | `synced`            | The completed sync and its post-pull checks succeeded.                                                                                                                 |
| Pending                 | `unsynced`          | Local changes are waiting for synchronization.                                                                                                                         |
| Offline                 | `offline`           | A required remote request could not be completed, or replication failed while the browser reported being offline. This is not proof of the specific network cause.     |
| Error                   | `error`             | Replication failed while the browser did not report being offline.                                                                                                     |
| Sync protection missing | `missing-validator` | The remote database exists without the document-contract validator. The current compatibility policy explicitly allows this state; it does not provide server fencing. |
| Sync not provisioned    | `unprovisioned`     | The remote database was not found. Local work is allowed; cloud sync is unavailable. Browsers do not create the missing remote database.                               |

## Guided recovery

The **Recover changes** action opens a modal repair flow. It never starts a download, rebuild,
or restore automatically. Users can also reopen saved copies from **Settings → Recovery copies**.

1. **Repair this room** begins the combined save-and-refresh operation. **Saving your changes…**
   captures a stable snapshot of all current local leaves, including
   deleted and conflicting leaves, attachments and revision ancestry. Fortudo saves the bundle in
   the separate `fortudo-recovery-archives-v1` local database, reads it back, and verifies its
   manifest and every document checksum and identity. A storage or verification failure blocks
   the next step. This verifies an independent browser copy; it does not claim that a downloaded
   file was saved to disk.
2. **Refreshing this room…** checks the current remote contract and downloads into a separate local
   database. Fortudo checks pull completion, checks the contract again, validates the downloaded
   leaves, and audits them against the remote before selecting that replica. Local state must
   still match the saved snapshot, including the source database identity as well as its update
   sequence. An older archive from another replica cannot rebuild the current room. Opening such
   a saved copy offers a new repair that first preserves the current replica; the older archive
   remains available. Failures leave the original database and recovery archive intact.
   Successful selection is recorded in a room-scoped localStorage pointer and the app reloads
   through normal preparation and sync gates. No original database is deleted.
3. **Review saved changes** shows the remaining count and compares archived local leaves with current records. Exact revisions
   already present remotely and records whose normalized content matches the current copy need no
   decision. Conflicting leaves remain separate review entries. Choose **Restore change**,
   **Apply saved deletion**, or **Keep current** for each difference. Deletions are never inferred
   or applied automatically. The review shows readable saved and current values side by side when a current version exists.
   Raw bodies and record IDs remain collapsed under **Troubleshooting details**; ordinary task
   descriptions can be corrected under **Edit description**, with an advanced record editor
   under **Troubleshooting details** for other fields. Both disclosures have touch-sized targets.
4. Restores write new revisions against the revision shown in the review. A changed current
   revision requires fresh review; there is no blind overwrite or replay with `new_edits:false`.
   Each restore runs the current document contract, including previous-document taxonomy checks,
   and respects compatibility, preparation, audit and recovery write blocks. Legacy category keys
   map to current identities where possible; unavailable categories are explicitly shown as being
   cleared. Saved taxonomy settings merge with current rows, preserving cloud identities and
   references. Invalid records require correction before restoration, including task status,
   unscheduled priority, and numeric, nonnegative estimated duration. The original archive remains
   unchanged when validation fails. Category comparisons show names, group membership, archived
   state, and changed or version-specific rows without opening the advanced JSON.
5. Decisions are journaled per archived revision and survive reload. Restored edits then follow
   the normal guarded sync path; local restoration does not itself prove successful cloud backup.
   Completion shows **Room repaired**, the durable restored count, and a primary **Done** action.
   Kept changes remain archived and can be reconsidered using the quiet **Review skipped changes**
   action, shown only when changes were skipped. Completion omits the redundant Close button.
   When opened from Settings, history sits in a collapsed **Saved copies** section with readable
   local dates. The guided completion screen contains no history or download controls.
   Deciding one record preserves edits and expanded troubleshooting details on the remaining cards.
   Focus moves to the next remaining card near the previous position instead of returning to the
   dialog heading. After the last card, focus returns to the completion heading.
   Untouched proposals refresh when restored categories change their identity mapping.

Repairing a room stops replication in older tabs when the active-replica pointer changes; their
storage writes also check that pointer. The original databases remain available. If an old tab's
already-started write finishes after selection, review captures and verifies a supplemental
snapshot before showing its additional changes. Each supplemental bundle is independently checked.

Copies are private and local to this browser profile and origin. They are not uploaded. They use
additional disk space and are retained after review. Clearing browser/site data removes these
copies. File export is available only under **Settings → Recovery copies → Saved copies → Download debug copy**.
The guided repair flow does not offer or recommend downloading a file. The debugging export uses
`fortudo-guided-recovery-v1` and includes all verified bundles and review decisions; each bundle
retains its `fortudo-local-recovery-v1` checksums. Download initiation is not disk-save verification.
There is no file-import UI in this release; keep browser data until repair and sync are complete.
Do not log archive contents or attach them to public issue reports.

## Local demo behavior

The floating **Demo only · simulated cloud** controls belong to the temporary local demo, not the
shipped app. They force compatibility and transport outcomes while the app's actual controls and
local persistence run normally.

An audit retry repeats the currently forced outcome; it does not clear the simulated fault.
To clear an error in the demo, select **Healthy sync** and **Apply scenario**. For a forced startup
failure, then click the sync badge or the toast’s **Retry** action to finish loading. **Finish startup
checks** and **Finish cloud sync** release the deliberately paused startup and replication stages.
The real app's retry outcomes depend on the actual local database and remote service.

## Implementation references

- [Badge labels](../../public/js/room-renderer.js)
- [Edit readiness and retry classification](../../public/js/edit-readiness.js)
- [Draft preservation, loading controls, and retry feedback](../../public/js/task-editing-ui.js)
- [Startup retry feedback](../../public/js/startup-retry-ui.js)
- [Manual sync badge feedback](../../public/js/manual-sync-ui.js)
- [Compatibility inspection and divergence audit](../../public/js/sync-contract.js)
- [Sync gates, replication, and status transitions](../../public/js/sync-manager.js)
- [Startup orchestration](../../public/js/app.js) and [storage preparation](../../public/js/storage.js)
- [Recovery/update actions](../../public/js/contract-safety-ui.js), [verified bundles](../../public/js/local-recovery.js),
  [repair and review](../../public/js/guided-recovery.js), and [recovery dialog](../../public/js/recovery-ui.js)
