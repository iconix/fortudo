# Fortudo Activities: Adding Activity Tracking & Insights

## Pyramid Summary

- **~2w:** Add activity tracking to Fortudo so planning and actual time spent live in one app: categories/settings, manual and automatic activity logging, and insights built around plan-vs-actual review.
- **~8w:** Activities now rest on a merged storage foundation: `task`, `activity`, and `config` documents coexist in the same room database, task writes are scoped safely, and preview/sync validation exists. The remaining work is user-facing behavior: categories/settings, activity creation, and insights UI layered on top of that foundation.
- **~32w:** Fortudo evolves from a planning-only tool into a lightweight planning-and-tracking system. Categories connect tasks and activities, the coordinator remains the post-mutation seam for cross-cutting behavior like auto-logging, and insights center on reviewing planned versus actual time without splitting that workflow into a separate app.

---

## Problem

Fortudo handles the planning side of daily time management by scheduling tasks into time blocks, but it has no way to track what actually happened. There is no record of whether tasks were completed on time, no way to log unplanned activities, and no insights into how time was actually spent. The [tracks](https://github.com/iconix/tracks) app solves the tracking and insights side but is a separate tool with no integration. The goal is to bring that functionality into Fortudo so planning and tracking live in one app.

## System Context (Research Findings)

### Fortudo Architecture

- **Storage:** PouchDB with per-room databases (`fortudo-{roomCode}`). Storage now supports typed documents (`task`, `activity`, `config`) in the same room database. Legacy task docs are migrated to `docType: 'task'` during boot-time storage preparation. Task bulk replace is scoped to task documents only. Revision tracking is type-scoped internally. Preview deploys use isolated room/database names so preview testing never touches live room data.
- **Task schema:** `id`, `type` (`scheduled` / `unscheduled`), `description`, `startDateTime`, `endDateTime`, `duration`, `status`, `locked`, `editing`, `confirmingDelete`, `priority` (unscheduled only), `estDuration` (unscheduled only).
- **ID conventions:** `sched-{timestamp}` for scheduled, `unsched-{timestamp}` for unscheduled.
- **Module architecture:** `app.js` now focuses on boot, storage wiring, room lifecycle, and top-level event setup. Feature handlers live under `tasks/`. Successful task mutations are reported through `app-coordinator.js` as semantic post-mutation events. Render-time callback threading still exists through `dom-renderer.js`.
- **Sync:** Bidirectional CouchDB replication via `sync-manager.js` with debounced sync and status callbacks. Room-switch sync handoff is now session-aware so in-flight sync from one room does not mutate the next room.
- **UI:** Dark Tailwind theme. Teal = scheduled, indigo = unscheduled, amber = warnings, rose = destructive. Modals remain for real confirmations. Toasts now handle non-blocking feedback. Max width `3xl`.

### Tracks Architecture

- **Data model:** Activities have `name`, `start`, `end`, `duration`, and `tag`. Tracks uses a start/stop time-tracking model.
- **Tag system:** Hierarchical keys with `/` separator (for example `work/project`). First segment is the grouping category. User-configurable with colors.
- **Charts:** Chart.js from CDN. Doughnut chart for time by tag, bar chart for daily hours over 14 days. Insights tab with summary stats and a collapsible daily timeline.
- **Storage:** `localStorage`, flat array of activities filtered by date at runtime.

### Key Constraints

- `saveTasks()` bulk replace must stay scoped to task documents only. Activity and config documents must not be caught in that blast radius.
- 90% statement and line coverage, 90% function coverage, and 79% branch coverage are enforced by pre-commit hooks.
- No build step. Vanilla JS with ES modules served directly via Firebase Hosting.

## Design

### Data Model

**New document type - Activity:**

```js
{
    docType: 'activity',
    id: 'activity-{timestamp}',
    description: String,
    category: String | null,      // category key, e.g. 'work/deep'
    startDateTime: String,        // ISO datetime
    endDateTime: String,          // ISO datetime
    duration: Number,             // minutes, matching Fortudo task duration units
    source: 'auto' | 'manual',    // future: 'habit' is possible later
    sourceTaskId: String | null   // source task link when source = 'auto'
}
```

**Task document additions:**

```js
{
    docType: 'task',              // new field, migrated onto existing docs
    category: String | null,      // new field, optional
    // ... all existing task fields unchanged
}
```

**Config document - Categories:**

Stored in PouchDB so categories sync across devices.

```js
{
    docType: 'config',
    id: 'config-categories',
    categories: [
        { key: 'work/deep', label: 'Deep Work', color: '#0ea5e9', group: 'work' },
        { key: 'work/meetings', label: 'Meetings', color: '#6366f1', group: 'work' },
        { key: 'work/comms', label: 'Comms', color: '#f59e0b', group: 'work' },
        { key: 'work/admin', label: 'Admin', color: '#64748b', group: 'work' },
        { key: 'personal', label: 'Personal', color: '#ec4899', group: 'personal' },
        { key: 'break', label: 'Break', color: '#22c55e', group: 'break' }
    ]
}
```

Categories use a hierarchical key format. The `group` field, derived from the first path segment, supports zoomed-out aggregation in insights. The form dropdown groups options by group for easy scanning.

Shared field names between tasks and activities: `description`, `startDateTime`, `endDateTime`, `duration`, `category`.

### Storage Layer Changes

**New functions in `storage.js`:**

- `putActivity(activity)` - same upsert pattern as `putTask`
- `loadActivities()` - `db.allDocs()` filtered to `docType: 'activity'`
- `deleteActivity(id)` - same pattern as `deleteTask`
- `loadConfig(configId)` - loads a single config document by ID
- `putConfig(config)` - upserts a config document

**Modified functions:**

- `loadTasks()` - filters to `docType: 'task'`, while still accepting documents without `docType` for backwards compatibility
- `saveTasks(tasks)` - deletes and rewrites only `docType: 'task'` documents during bulk replace

**Migration:**

On first load, legacy task documents without `docType` get `docType: 'task'` written back during storage preparation. That migration is idempotent.

**Update after Phase 2:** config document primitives shipped, but default category seeding did not. Seeding should happen later in `category-manager.js` / settings work, not in generic storage code.

### Architecture: Coordinator Boundary

`app-coordinator.js` owns runtime post-mutation orchestration. `app.js` stays focused on boot, DOM setup, storage wiring, and room lifecycle. Handlers should stay thin: they call a manager for state changes, then report successful mutations through semantic coordinator events.

```js
// app-coordinator.js
export function onTaskCreated({ task }) { ... }
export function onTaskEdited({ task }) { ... }
export function onTaskScheduled({ task }) { ... }
export function onTaskUnscheduled({ task }) { ... }
export function onTaskCompleted({ task }) { ... }
export function onTaskDeleted({ task }) { ... }
export function onScheduledTasksCleared() { ... }
export function onCompletedTasksCleared() { ... }
export function onAllTasksCleared() { ... }
```

Before:

```txt
handleCompleteTask -> completeTask -> putTask -> refreshUI -> confetti -> updateStartTime
```

After:

```txt
handleCompleteTask -> completeTask -> coordinator.onTaskCompleted({ task })
```

The current implementation uses object payloads such as `coordinator.onTaskCompleted({ task })` rather than primitive arguments.

Pre-Activities, most coordinator events still resolve to `refreshUI()`, with scheduled-task completion confetti as the one distinct cross-cutting side effect. That is acceptable. The value of the coordinator at this stage is the semantic boundary, not a large present-day behavior surface.

As Activities land, new cross-cutting behavior should attach to these semantic events rather than being re-threaded through each handler. That keeps handlers thin and preserves the coordinator as the single post-mutation boundary.

If the coordinator later grows unwieldy with habits, rollover, or richer activity logic, it can evolve into an event bus pattern. There is no need to force that now.

**Day boundary detection:**

The earlier placeholder `coordinator.onDayChanged()` hook was intentionally removed once it became clear it implied behavior that did not exist yet. Future day-rollover work should reintroduce a real semantic boundary only when rollover mutation rules are fully specified.

### Module Structure

```txt
public/js/
|-- tasks/
|   |-- manager.js                # task state management, CRUD
|   |-- scheduled-renderer.js     # renders scheduled task list
|   |-- scheduled-handlers.js     # scheduled task event handlers
|   |-- unscheduled-handlers.js   # unscheduled task event handlers
|   |-- add-handler.js            # add task handler
|   |-- clear-handler.js          # clear tasks handler
|   `-- form-utils.js             # task form extraction, validation
|-- activities/
|   |-- manager.js                # activity state management, CRUD, auto-logging
|   |-- renderer.js               # renders activity log list
|   |-- insights-renderer.js      # insights dashboard, timeline, charts
|   |-- handlers.js               # activity event handlers
|   `-- form-utils.js             # activity form extraction
|-- app.js                        # boot sequence, DOM setup, storage + room wiring
|-- app-coordinator.js            # runtime post-mutation orchestration
|-- storage.js                    # PouchDB persistence layer
|-- dom-renderer.js               # page-level rendering and event wiring
|-- modal-manager.js              # confirmation and schedule modals
|-- toast-manager.js              # non-blocking toast notifications
|-- room-manager.js               # room code management
|-- room-renderer.js              # room entry screen UI
|-- sync-manager.js               # CouchDB sync
|-- reschedule-engine.js          # rescheduling logic
|-- category-manager.js           # category CRUD and config-doc loading
|-- settings-manager.js           # Activities toggle and related settings
|-- utils.js                      # shared utilities
`-- config.js                     # CouchDB URL config
```

Files within feature folders are unprefixed, for example `tasks/manager.js` instead of `tasks/task-manager.js`. VS Code or Cursor can show parent folders in tabs when filenames are ambiguous.

**State management principle:** Renderers can read from any manager. The coordinator owns cross-module post-mutation side effects. UI intent routing remains separate from the coordinator.

### Feature Toggle & Settings

`settings-manager.js` should expose `isActivitiesEnabled()` and `setActivitiesEnabled(bool)`. The storage mechanism, `localStorage` versus PouchDB, stays encapsulated and can be finalized later.

When Activities are disabled: no activity-related DOM, no category dropdown on tasks, no auto-logging, and no insights tab. Tasks should continue working exactly as they do today.

**Settings UI:** Gear icon in the header, next to the room-code badge and sync indicator. Opens a settings modal with:

- Activities toggle ("Enable Activities")
- Category management: list of categories with colored dots, edit/delete buttons, and an "Add category" flow with label input and color picker
- Toggling the feature keeps the modal open, shows the toggle in its new state, explains what will change, and provides a "Reload to apply" primary action. The user can close the modal without reloading if they change their mind.

### UI: Activity Logging

**Auto-logging:** When a scheduled task is completed and Activities are enabled, `createActivityFromTask(task)` creates an activity document copying `description`, `startDateTime`, `endDateTime`, `duration`, and `category`, with `source: 'auto'` and `sourceTaskId`. Silent, no notification.

**Manual logging:** Third mode on the existing task form, alongside Scheduled and Unscheduled. Accent color is still TBD. Candidates: cyan, sky, or orange.

Fields: description, category dropdown grouped by group, start time, duration (hours/minutes). No priority and no rescheduling logic.

**Category dropdown visual:** Since `<option>` elements cannot be styled with colors consistently cross-browser, the dropdown should stay text-only and grouped by group. A small colored dot or badge can render next to the currently selected category outside the `<select>`.

**Category on rendered tasks and activities:** A small colored pill badge next to the description. When no category is set, show no badge.

### UI: Insights View

Accessed via a tab toggle in the header ("Tasks" / "Insights"). The toggle switches visibility of main content sections while the info panel stays visible in both views. The daily plan-vs-actual review is the primary focus; longer-term trends are secondary and collapsed by default.

**Sections:**

1. **Today's Summary**
   - Two-row plan-vs-actual timeline: top row shows planned task blocks, bottom row shows actual activities (auto + manual). Blocks are proportionally sized by duration and colored by category.
   - Summary stats: total planned time, total actual time, tasks completed, late count
   - Category breakdown bars

2. **Activity Log**
   - Chronological list of today's activities
   - Each entry shows description, category badge, time range, and duration
   - Manual entries are editable and deletable
   - Auto entries link to their source task

3. **Data Issues**
   - Highlights overlapping activities, end-before-start, and duplicate auto-logged entries
   - Shown as a warning section, collapsed when there are no issues

4. **Trends** (collapsed by default)
   - Time-by-category doughnut chart, filterable by date range
   - Daily-hours bar chart over the last 14 days
   - Hand-rolled HTML/CSS/SVG for v1. Re-evaluate Chart.js only if the result feels too plain

### UI Patterns

**Toast notifications:** `toast-manager.js` is already in place for non-blocking feedback. Toasts slide in, auto-dismiss, and replace modal alerts where no decision is required. Modals remain for genuine confirmations.

**Empty states:** Each view should have a meaningful empty state with guidance, for example "No activities tracked today - log one or complete a scheduled task" or "Enable Activities in settings to start tracking."

**Keyboard shortcuts:** Add once form modes and the insights tab exist.

- `1`, `2`, `3` to switch form mode
- `Tab` to toggle Tasks / Insights views
- `Esc` to close modals

**Transitions:** Tab switching, chart animations, and timeline build-in belong in the polish phase.

**Mobile:** Plan-vs-actual timeline should either stack vertically or support horizontal scroll on narrow screens.

**Onboarding:** One-time tooltip or walkthrough on first Activities enable. Polish phase.

### Testing

**TDD approach:** Red/green for all new code. Write failing tests first, implement until they pass, then refactor.

**Unit tests needed:**

- `activities/manager.js` - addActivity, createActivityFromTask, CRUD
- `activities/handlers.js` - activity handler tests following existing patterns
- `category-manager.js` - loading defaults, CRUD, config-doc persistence
- `settings-manager.js` - toggle read/write
- `storage.js` - new activity/config functions, `saveTasks` scoping, migration
- `app-coordinator.js` - activity-related coordination logic

**Existing tests:** The `tasks/` reorganization, toast system, coordinator hardening, and current orchestration boundary are already covered. New work should extend from that baseline rather than re-proving the foundation.

**E2E tests:** Add activity tracking E2E coverage once the UI exists.

**Existing smoke coverage:** storage-level merge-readiness checks are now covered by `scripts/playwright_preview_smoke.py`, including legacy migration, cross-type isolation, room isolation, and synced-preview behavior.

### Sync Considerations

Activity documents sync via PouchDB like tasks. No special conflict handling is required for v1. Duplicate activities from sync conflicts are a minor data-quality issue; deduplication by `sourceTaskId` can come later if needed.

Lazy loading: activity modules can be imported eagerly but gated by `isActivitiesEnabled()`. If a chart library is adopted, load it lazily on first Insights open.

## Open Questions

- **Activity accent color:** cyan, sky, or orange (leaning blue/sky). Try visually during implementation.
- **Charts:** Hand-rolled HTML/CSS/SVG for v1. If that looks too plain, evaluate either a lightweight library such as uPlot or Frappe Charts, or Chart.js for full interactivity.
- **Settings storage mechanism:** `localStorage` (per-device) versus PouchDB (per-room) for the Activities toggle. Decide once the intended behavior is clearer.

## Implementation Phases

### Completed Foundation Work

**Phase 1: Reorganize and foundation**

- Move existing files into `tasks/`, rename `room-ui-handler.js` to `room-renderer.js`
- Introduce `app-coordinator.js` and extract post-action logic from handlers
- Add `toast-manager.js` and migrate non-blocking `showAlert` calls
- Update import paths and keep existing tests passing

**Phase 1.5: Cleanup**

- Make local-only sync config explicit
- Clarify clear-schedule naming and behavior
- Remove the placeholder day-boundary hook instead of pretending rollover exists
- Align docs and README with the future rollover direction

**Phase 1.7: Coordinator hardening**

- Replace generic coordinator calls with semantic task events
- Tighten handler-to-coordinator contracts
- Add manager, handler, app, and integration coverage around the boundary
- Align architecture notes with the actual pre-Activities coordinator shape

**Phase 2: Storage**

- Add `docType` migration for legacy task documents
- Add `putActivity`, `loadActivities`, `deleteActivity`, `loadConfig`, `putConfig`
- Scope `saveTasks` to `docType: 'task'` only
- Add storage regression tests for migration, scoping, activities, and config documents
- Add preview smoke coverage for storage guarantees and synced preview behavior
- Harden room-switch sync lifecycle discovered during validation

### Next Planned Work

**Phase 3: Categories and settings**

- Add `category-manager.js` with default seeding from the config doc
- Add `settings-manager.js` with Activities toggle
- Build settings modal UI: toggle plus category management
- Add category dropdown on task form in all relevant modes
- Add keyboard shortcuts for form modes if the UI is stable enough

**Phase 4: Activity logging**

- Add `activities/manager.js` with CRUD and `createActivityFromTask`
- Add third form mode ("Activity") on the main task form
- Wire auto-logging into task completion via the coordinator
- Add empty states for activity views

**Phase 5: Insights view**

- Add header tab toggle for Tasks / Insights
- Add two-row plan-vs-actual timeline
- Add activity log list with edit/delete for manual entries
- Add category breakdown bars and summary stats
- Add trends section
- Add keyboard shortcut for tab toggle if it still feels worthwhile

**Phase 6: Polish and E2E**

- Add E2E coverage for activity flows
- Finalize activity accent color
- Add transitions and micro-interactions
- Adapt timeline UX for mobile
- Add onboarding tooltips on first Activities enable
- Evaluate Chart.js only if the hand-rolled visuals are too plain
