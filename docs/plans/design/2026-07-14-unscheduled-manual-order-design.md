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

Add an optional non-negative numeric `manualOrder` field to unscheduled tasks. Scheduled tasks do
not use this field.

- Lower values render first in My order.
- When no tasks have `manualOrder`, existing tasks initially appear in the same sequence as the
  current Priority view. Merely viewing My order does not write task data.
- If ranked and unranked tasks are mixed, place unranked incomplete tasks after the last ranked
  incomplete task and unranked completed tasks at the end. Use the Priority sequence within each
  unranked group, then normalize on the next order mutation.
- The first reorder operation normalizes the displayed sequence into explicit manual-order values
  before applying the move.
- New and newly unscheduled tasks receive a value that places them after the last incomplete task.
  Later completed tasks shift as needed so their relative manual sequence remains intact.
- Completing, reopening, or editing a task does not change its manual-order value.
- Scheduling or deleting a task removes it from the sequence; remaining gaps are valid and do not
  require immediate normalization.
- Invalid or duplicate values use stable task ID as a final tie-breaker. This prevents tasks from
  disappearing or rendering nondeterministically while data is repaired or synchronized.

The **Unscheduled sequence module** owns Priority and My order projection, lifecycle placement,
movement, normalization, and the persistence transaction for sequence changes. Its interface is
the test surface for all sequence invariants and rollback behavior. The task manager remains the
canonical owner of the full task collection and supplies narrow state and persistence adapters to
the sequence module; callers do not learn rank math or PouchDB write details.

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
reading and replacing manager-owned task state, persisting changed task documents, and reloading
durable local state. Its logical interface has three operations:

- `project(mode)` returns the ordered Unscheduled tasks plus movement metadata for the selected
  `priority` or `manual` mode. Projection never writes.
- `place(taskId)` applies lifecycle placement when a task enters the Unscheduled list and returns
  the placed task plus the tasks whose order fields changed. The manager persists those changes
  through the existing add or unschedule mutation; this operation does not redefine those
  mutations' error contracts.
- `move(taskId, destination)` applies an explicit user reorder and owns its optimistic state,
  batch persistence, compensation, rollback, and durable-state recovery.

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

- Persist changed manual-order fields through a non-destructive PouchDB batch adapter owned by the
  existing storage module.
- The sequence module snapshots affected manual-order fields, updates manager-owned memory for an
  immediate UI response, and settles the batch write in the background.
- The batch adapter inspects every PouchDB result because a bulk write can partially succeed. The
  sequence module owns compensation for successful rows and restores the prior in-memory sequence
  when the transaction fails.
- If local persistence fails, rerender the restored sequence and show an error toast.
- If compensating persistence also fails, reload tasks from local PouchDB, rerender the durable
  state, and show a stronger error toast. In this exceptional path, matching durable storage takes
  precedence over preserving the optimistic visual sequence.
- If that durable reload also fails, keep the restored in-memory snapshot, resolve the sequence
  operation as a recovery failure, and tell the user to reload Fortudo before making more changes.
- Transactional persistence and rollback apply to explicit reorder operations. Lifecycle
  placement remains part of the existing add or unschedule persistence path so this feature does
  not redefine every task mutation's asynchronous contract.
- Continue surfacing remote state through the existing passive sync indicator; do not add a
  reorder-specific success or conflict dialog.
- PouchDB's existing task-level conflict policy applies. A deterministic tie-breaker keeps the
  list renderable if concurrent device changes temporarily produce duplicate positions.

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

- Priority and My order projection, including missing, duplicate, and invalid values
- Initial fallback to the current Priority sequence without persistence
- Identity-based move destinations and movement boundaries
- New-task and newly-unscheduled-task placement after the last incomplete task
- Completion, reopening, editing, scheduling, and deletion stability
- Optimistic position metadata, successful settlement, partial batch failure, compensation,
  in-memory rollback, durable reload when compensation also fails, and non-rejecting recovery
  failure when durable reload is unavailable

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
- The PouchDB batch adapter updates revisions, reports per-document partial failures, and supports
  compensation writes
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
- Verify the sequence after room synchronization

The feature is accepted when both modes remain predictable, manual order survives persistence and
sync, and every reorder operation is available without requiring a drag gesture.
