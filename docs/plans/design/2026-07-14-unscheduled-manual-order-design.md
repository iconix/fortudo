# Unscheduled Manual Order Design

**Date:** 2026-07-14
**Status:** Approved for implementation

## Summary

Fortudo's Unscheduled list currently sorts incomplete tasks before completed tasks, then by
priority, then by shortest estimated duration. Add an optional **My order** mode so users can
maintain an intentional execution sequence without assigning times.

The existing automatic sort remains available as **Priority**. Fortudo remembers the last mode
selected on the current browser, while the manual sequence syncs with the room.

## User Need

Users often know the order in which tomorrow's tasks must happen even when they cannot estimate
reliable start times or durations. Scheduling those tasks would create false precision, while the
current automatic sort discards the user's intended sequence.

The feature should support a single persistent Unscheduled sequence. It does not introduce dates,
day-specific lists, or another scheduling type.

## Goals

- Let users arrange Unscheduled tasks into an explicit sequence.
- Preserve the current priority-and-duration sort as an alternative view.
- Make reordering fast with mouse or touch and operable with a keyboard.
- Preserve the manual sequence while users switch sort modes, complete tasks, reload, or sync.
- Keep reordering separate from scheduling; manual order carries no time semantics.

## Non-goals

- Day-specific untimed plans
- Multiple named or saved sequences
- A custom sort builder or additional sort modes
- Undo history for reorder operations
- Changes to scheduled-task ordering

## Sort Modes

Add a compact two-option control beside the **Unscheduled Tasks** heading:

`Sort: [ My order | Priority ]`

### Priority

- Preserve the current order: incomplete before completed, priority high-to-low, then shortest
  estimated duration.
- Hide all manual-reordering affordances.
- Do not change the saved manual sequence.

### My order

- Render tasks in their saved manual sequence.
- Show a six-dot drag handle to the left of each task checkbox.
- Keep completed tasks in place and visibly checked.
- Insert new or newly unscheduled tasks after the last incomplete task. If no incomplete task
  exists, insert them before the completed tasks.
- Allow completed tasks to be moved.

### Remembered selection

- Preserve **Priority** as the initial mode for existing users.
- After the user selects a mode, remember that selection in local browser storage.
- Do not sync the selected mode. Different people or devices may prefer different views of the
  same room.
- Selecting a mode is display-only and must not mutate tasks or their manual order.

## Reordering Interaction

### Pointer and touch

- Begin dragging only from the six-dot handle. The task card itself remains available for
  scrolling, completion, and task actions.
- Give the handle an adequate touch target and apply drag-specific touch behavior only to the
  handle so normal list scrolling remains reliable.
- While dragging, visually lift the moving card and show a clear insertion marker at the current
  destination.
- Auto-scroll when the pointer approaches the top or bottom viewport edge.
- Apply the new order immediately on drop without a success toast.
- Disable the handle while a task is being edited or is otherwise temporarily unavailable.

### Keyboard and precise movement

In **My order**, add a **Move** group to the existing task actions menu:

- Move up
- Move down
- Move to top
- Move to bottom

Hide these actions in Priority mode. Disable actions that cannot change the task's position.
After a move, preserve focus on the moved task's actions so repeated keyboard movement remains
efficient. Announce the task's new position through an accessible live region.

## Data Model and Ordering Rules

Store order in one room-level config document, separate from task documents:

```js
{
    id: 'config-unscheduled-sequence',
    docType: 'config',
    schemaVersion: 1,
    orderedTaskIds: ['task-gamma', 'task-alpha', 'task-beta']
}
```

- Task edits and reorder operations write different PouchDB documents. Reordering must never add
  or update an order field on task documents.
- The stored identifiers define My order. Projection deduplicates identifiers, ignores deleted or
  scheduled tasks, and cannot recreate a task from a stale identifier.
- Unlisted incomplete tasks are inserted after the last listed incomplete task; unlisted completed
  tasks are appended. Priority order plus stable task ID orders each unlisted group.
- New and newly unscheduled tasks are placed after the last incomplete task by one sequence-document
  transaction. Multi-task lifecycle operations preserve caller order in one transaction.
- Completing, reopening, or editing a task does not change the sequence document.
- Scheduling or deleting a task may leave a harmless stale identifier. The next sequence mutation
  writes the reconciled identifier list.
- For migration only, an absent or invalid sequence document projects legacy numeric `manualOrder`
  values using the original rules. The first sequence mutation materializes that projection into
  the config document without rewriting or removing legacy fields. Old production code ignores the
  new config document, so rollback remains safe.

The **Unscheduled sequence module** owns Priority and My order projection, lifecycle placement,
movement, normalization, and the persistence transaction for sequence changes. Its interface is
the test surface for all sequence invariants and rollback behavior. The task manager remains the
canonical owner of the full task collection and supplies narrow task and sequence-state adapters.
A sequence repository isolates config persistence and CouchDB conflict cleanup; callers do not
learn ordering math, revisions, or PouchDB details.

The **Unscheduled list UI module** owns the remembered display mode, list rendering, ordering
affordances, delegated list events, accessible feedback, drag state, and deferred rerendering.
Application orchestration mounts and refreshes the list through this module instead of threading
mode, callbacks, and drag state through `app.js` and `dom-renderer.js`.

All Unscheduled-list event routing moves behind this seam, including scheduling, timer start,
editing, deletion, completion, inline forms, action menus, movement, and dragging. The UI module
interprets DOM events and owns interaction state, then delegates business operations through an
injected named-actions adapter. Scheduling, timer, and task-mutation rules remain outside the UI
module. `dom-renderer.js` no longer stores Unscheduled callback globals or branches on
Unscheduled-list controls.

### Unscheduled sequence interface

`public/js/tasks/unscheduled-sequence.js` is a deep domain module created with narrow adapters for
reading tasks, reading and replacing manager-owned sequence state, persisting one sequence
document, and reloading durable sequence state. Its logical interface has five operations:

- `project(mode)` returns the ordered Unscheduled tasks plus movement metadata for the selected
  `priority` or `manual` mode. Projection never writes.
- `place(taskId)` applies lifecycle placement when one task enters the Unscheduled list.
- `placeMany(taskIds)` applies an ordered multi-task lifecycle placement in one write.
- `move(taskId, destination)` applies an explicit user reorder and owns its optimistic state,
  single-document persistence, rollback, and durable-state recovery.
- `hydrate(sequenceDocument)` replaces local sequence state after room load or synchronization
  without writing.

Move destinations express intent rather than array arithmetic: up, down, top, bottom, or before a
specific task ID, with a null before-ID meaning the end. Pointer drops translate to the ID that
follows the insertion point. Identity-based destinations remain meaningful if sync changes the
manager-owned collection before a deferred drop is applied.

An accepted move returns its immediate position and a settlement promise. This makes the
optimistic render explicit instead of requiring callers to know that an async function mutates
memory before its first await. Boundary moves return a successful no-op without persistence;
invalid, missing, wrong-type, or unavailable tasks return a structured failure.

The manager keeps the sequence factory private. Existing callers receive narrow manager wrappers
for reading the Unscheduled projection and requesting a move; application code never receives
state-replacement or persistence adapters.

### Unscheduled list UI interface

`public/js/tasks/unscheduled-list.js` exposes one list instance with three lifecycle operations:

- `mount()` resolves stable DOM roots, restores the local mode preference, and binds delegated
  events once.
- `render()` reads the current mode and sequence projection, then renders immediately or retains
  the latest requested render while a drag is active.
- `destroy()` aborts listeners, cancels transient interaction state, and clears deferred work for
  room teardown and tests.

The list UI module receives narrow sequence, named-actions, preference, feedback, and running-
activity adapters. Browser implementations are used in production and lightweight fakes in
tests. The logical module may use private render or pointer-geometry files to control file size,
but only the list interface is imported outside the module and tests exercise behavior through
that interface.

`app.js` mounts the list once and calls its render operation from the normal task-display refresh.
`dom-renderer.js` calls the same render seam from broader refreshes and contains no Unscheduled-
specific delegation. The list module is the sole owner of the remembered mode, rendered
affordances, open-menu/focus state, announcements, pointer gesture, and latest-only deferred
render.

## Persistence and Synchronization

- Persist each placement or move as one update to `config-unscheduled-sequence`. Task persistence
  remains owned by the task manager and is independent of the order transaction.
- The sequence module snapshots the prior sequence document, replaces manager-owned sequence state
  for an immediate UI response, and settles the config write in the background.
- If local persistence fails, reload only the durable sequence document. A successful reload
  replaces optimistic sequence state without touching task fields; if reload also fails, restore
  the prior in-memory sequence and report a recovery failure.
- App room loads and post-sync refreshes wait for any accepted local sequence write, load the
  sequence through its repository, and hydrate both tasks and order before rendering.
- Concurrent task edit and reorder operations cannot create sibling task revisions because they
  target different documents.
- Concurrent reorders may create siblings only on the sequence config. The repository preserves
  CouchDB's deterministic current winner, advances it, tombstones every losing revision in one
  bulk request, and re-reads/retries because CouchDB bulk operations are non-atomic.
- Conflict cleanup never promotes a caller's stale snapshot over the latest winner. Cleanup is
  complete only when a fresh read reports no losing revisions.
- Continue surfacing remote state through the existing passive sync indicator; do not add a
  reorder-specific success or conflict dialog.

## Accessibility

- Give the sort control an explicit accessible name and expose which mode is selected.
- Give each drag handle an accessible label containing the task description, but use the actions
  menu as the supported keyboard-reordering path.
- Ensure handles and menu items meet Fortudo's existing touch-target sizing.
- Do not communicate the drop position using color alone.
- Announce menu-driven moves and successful drops with the task's one-based position and total task
  count.
- Preserve focus after menu-driven moves and after rerendering.

## Error and Edge Cases

- Empty lists keep the existing empty state; the sort control may remain visible.
- A one-task list shows My order but disables movement.
- Reordering a completed task is allowed.
- Reordering is blocked while the task is inline editing or otherwise unavailable.
- A task removed by sync during a drag cancels the drag safely and refreshes the list.
- A remote refresh received during a drag is applied after the gesture ends, preventing the
  active target from disappearing mid-gesture.
- Priority and estimated-duration edits affect Priority mode only and never overwrite My order.

## Testing and Acceptance Criteria

### Unscheduled sequence interface tests

- Priority and My order projection, including missing, duplicate, stale, and invalid identifiers
- Legacy `manualOrder` fallback without persistence and first-mutation materialization
- Identity-based move destinations and movement boundaries
- New-task and newly-unscheduled-task placement after the last incomplete task
- Completion, reopening, editing, scheduling, and deletion stability
- Optimistic position metadata, one-document persistence, durable sequence reload after failure,
  in-memory rollback when reload fails, and non-rejecting recovery failure

### Unscheduled list UI interface tests

- Sort control state and local preference restoration
- Handles and Move menu visibility by mode
- Disabled handle and menu states
- Existing schedule, timer, edit, delete, completion, inline form, and menu actions through the
  named-actions adapter
- Pointer/touch drop position and insertion feedback
- Menu movement, focus preservation, and live-region announcements
- Latest-only rerender deferral during a drag and remote task removal
- Optimistic render, rollback render, durable-reload render, and error feedback
- Mount and destroy listener lifecycle

### Integration and adapter tests

- Manager add and unschedule operations delegate lifecycle placement while preserving their
  existing result contracts
- Config storage reports conflict leaves, advances the latest winner, tombstones losing revisions,
  retries non-atomic races, and rejects non-conflict bulk failures
- Reorder versus task edit, concurrent reorders, add versus reorder, and delete/schedule versus
  reorder preserve task fields and converge to a valid sequence
- App and broader DOM refresh paths call the same list render seam
- Existing tests are removed only after a traceability review maps each protected behavior to a
  passing replacement interface, adapter, integration, or end-to-end test
- A failure-sensitivity check temporarily breaks each migrated behavior and confirms its
  replacement test fails; coverage percentage alone does not justify deleting a test

### End-to-end coverage

- Reorder several tasks, reload, and confirm the sequence persists
- Switch to Priority, then return to My order and confirm the sequence is unchanged
- Complete a task and confirm it remains in its manual position
- Add a task and confirm it appears after the last incomplete task
- Run two isolated preview clients through reorder-versus-edit, concurrent-reorder,
  add-versus-reorder, and delete-versus-reorder races; confirm explicit task mutations survive,
  deleted tasks are not resurrected, all clients converge, and Cloudant has no remaining conflicts

The feature is accepted when both modes remain predictable, manual order survives persistence and
sync, and every reorder operation is available without requiring a drag gesture.
