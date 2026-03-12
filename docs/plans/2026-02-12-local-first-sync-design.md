# Local-First Sync with PouchDB/CouchDB

## Overview

Add cross-device sync to Fortudo while keeping it local-first. The app always works offline against a local PouchDB database. A remote CouchDB instance acts as a relay so tasks sync between devices. Identity is room-code-based, with no authentication.

## Architecture

```
task-manager.js -> storage.js -> PouchDB (local, IndexedDB) -> CouchDB (remote, async)
```

- PouchDB replaces localStorage as the local store (~46KB from CDN, no build step)
- CouchDB hosted on any CouchDB-compatible host (fully portable)
- App reads/writes locally, syncs to remote in background
- The app never breaks because of sync issues; sync errors are informational, never blocking

## Room Codes

- Each user picks or generates a short code (e.g., `fox-742`)
- Code maps to database names: `fortudo-fox-742` locally and remotely
- Multiple room codes saved in localStorage for easy switching
- Displayed in header with a dropdown to switch rooms
- Future: shared room code between users for a shared list

### localStorage keys

- `fortudo-active-room` - the current room code
- `fortudo-rooms` - JSON array of all room codes the user has used

### UX flow

- First visit: entry screen with "generate code" or "enter code" input
- Subsequent visits: straight to active room's tasks
- "Switch room" dropdown in header shows saved rooms, plus option to add a new code
- Selecting a different room tears down current PouchDB sync, opens new room's local database, triggers sync

## Storage Layer Changes

### New storage.js interface

| Function | Purpose |
|---|---|
| `initStorage(roomCode)` | Create/open PouchDB database for room, set up sync config |
| `putTask(task)` | Write a single task document to PouchDB |
| `deleteTask(id)` | Remove a single task document from PouchDB |
| `saveTasks(tasks)` | Bulk replace all tasks (used for init, clear-all) |
| `loadTasks()` | Query all documents, return as array |
| `triggerSync()` | Kick off a one-time sync with remote CouchDB |
| `onSyncStatusChange(callback)` | Subscribe to sync status events |

### ID mapping

- `id` <-> `_id` aliased in storage.js; task-manager.js always uses `id`
- `_rev` tracked in an in-memory `Map<id, rev>`, never exposed outside storage.js

### UI flag stripping

- `editing` and `confirmingDelete` are UI state flags stripped in task-manager.js before passing to storage
- These should never have been persisted; this cleans that up

## Task-Manager.js Changes

### finalizeTaskModification

Current: `finalizeTaskModification()` calls `saveTasks(entireArray)`

New: `finalizeTaskModification(changedTask)` accepts the modified task and calls `storage.putTask(task)`

### Other call site changes

- Direct `saveTasks(tasks)` calls for unscheduled task adds -> `storage.putTask(task)`
- `deleteTask` -> `storage.deleteTask(id)` instead of splice + save all
- `updateTaskState` (init/bulk reset) -> keeps `saveTasks(tasks)` for bulk operations

## Data Model

Task documents in PouchDB are the same shape as current task objects, with PouchDB's `_id` and `_rev` added:

```json
{
    "_id": "sched-1707123456789",
    "_rev": "3-a1b2c3d4",
    "description": "Morning workout",
    "type": "scheduled",
    "startDateTime": "2025-01-15T08:00:00",
    "duration": 60,
    "status": "incomplete"
}
```

Task ordering is not affected by the PouchDB migration:
- Scheduled tasks: sorted by `startDateTime` in task-manager.js
- Unscheduled tasks: sorted by completion status, then priority, then estimated duration

## Sync Behavior

### Triggers

1. **On app load** - pull latest from remote, merge with local
2. **After any write** - push local changes to remote (debounced)
3. **Manual "sync now" button** - force sync

### Status indicator (header, next to room code)

- Green checkmark: in sync
- Spinning: syncing in progress
- Yellow warning: local changes haven't been pushed (offline, etc.)
- Red: sync error (remote unreachable)

No modal dialogs or interruptions. Passive indicator only.

### Conflict resolution

- Auto-resolved: most recent write wins
- Losing revision silently discarded
- No user-facing conflict UI for v1
- Future (shared lists): task-level last-write-wins plus field-level merge covers most cases

## Error Handling

| Scenario | Behavior |
|---|---|
| Remote unreachable | App works locally, sync indicator shows yellow, syncs when connectivity returns |
| Sync conflict | Last write wins, auto-resolved |
| First use, new room code | Empty local DB created, remote DB created on first push |
| New device, existing room code | Brief "syncing..." state on first load, then renders pulled tasks |
| Sync error | Caught and surfaced via status indicator, never thrown |

What we don't build:
- No retry logic with backoff (manual sync button is sufficient)
- No connectivity monitoring/polling
- No "you're offline" banner

## Dead Code Removal

- `reorderUnscheduledTask` in task-manager.js
- `initializeDragAndDropUnscheduled` in dom-handler.js
- `handleDropUnscheduledTask` and callback wiring in unscheduled-task-handlers.js
- Corresponding tests

## Files Touched

| File | Change |
|---|---|
| `storage.js` | Rewrite: PouchDB internals, new interface |
| `task-manager.js` | Modify: `finalizeTaskModification(task)`, individual storage calls, strip UI flags, remove dead code |
| `app.js` | Modify: `initStorage(roomCode)` at startup, sync status UI wiring |
| `dom-handler.js` | Modify: remove `initializeDragAndDropUnscheduled` |
| `handlers/unscheduled-task-handlers.js` | Modify: remove drag-drop handler and callback |
| `index.html` | Modify: PouchDB CDN script, room code UI, sync indicator |

Not touched: renderers, modal-manager, reschedule-engine, utils, CSS.

## Testing Strategy

### storage.js tests

- Use `pouchdb-adapter-memory` (in-memory adapter, no IndexedDB, fast)
- Test `putTask` maps `id` -> `_id` and stores correctly
- Test `loadTasks` maps `_id` -> `id`, strips `_rev`
- Test `deleteTask` removes the document
- Test `saveTasks` (bulk) correctly handles insert/update/delete
- Test `_rev` map stays in sync after operations

### Sync tests

- Two in-memory PouchDB instances syncing with each other (no CouchDB needed)
- Test sync triggers after `putTask` (debounced)
- Test sync triggers on `initStorage`
- Test sync errors caught and surfaced via status callback
- Test status callback fires with correct states

### task-manager.js tests

- Update mocks to match new storage function signatures
- Test `editing`/`confirmingDelete` stripped before storage calls

### E2E tests

- Unchanged for v1 (test against local PouchDB, sync not exercised)

### Dead code test removal

- Remove tests for `reorderUnscheduledTask` and drag-and-drop

## Out of Scope (YAGNI)

- Authentication
- Real-time sync (WebSocket/listener)
- Conflict resolution UI
- Connectivity monitoring
- Retry with backoff
- Delete saved rooms from list
- Shared list collaboration (future feature)
