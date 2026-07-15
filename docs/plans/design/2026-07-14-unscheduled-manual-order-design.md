# Unscheduled Manual Order Design

**Date:** 2026-07-14
**Status:** Approved UX design; awaiting written-spec review

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

The manager owns all ordering and mutation rules. Rendering code receives an already ordered list,
and event handlers translate drag or menu actions into manager operations. This follows Fortudo's
existing separation between task state, handlers, and DOM rendering.

## Persistence and Synchronization

- Persist changed manual-order fields through the existing task storage path.
- Update the UI immediately, persist in the background, and keep the prior sequence available for
  rollback.
- If local persistence fails, restore the prior sequence and show an error toast.
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

### Manager tests

- Manual sorting, including missing, duplicate, and invalid values
- Initial fallback to the current Priority sequence
- Reorder operations and top/bottom boundaries
- New-task and newly-unscheduled-task placement after the last incomplete task
- Completion, reopening, editing, scheduling, and deletion behavior
- Persistence failure restores the prior order

### Renderer and interaction tests

- Sort control state and local preference restoration
- Handles and Move menu visibility by mode
- Disabled handle and menu states
- Pointer/touch drop position and insertion feedback
- Menu movement, focus preservation, and live-region announcements
- No interference with completion, scrolling, inline editing, or existing task actions

### End-to-end coverage

- Reorder several tasks, reload, and confirm the sequence persists
- Switch to Priority, then return to My order and confirm the sequence is unchanged
- Complete a task and confirm it remains in its manual position
- Add a task and confirm it appears after the last incomplete task
- Verify the sequence after room synchronization

The feature is accepted when both modes remain predictable, manual order survives persistence and
sync, and every reorder operation is available without requiring a drag gesture.
