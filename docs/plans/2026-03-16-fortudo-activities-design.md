# Fortudo Activities: Adding Activity Tracking & Insights

## Pyramid Summary

- **~2w:** Add activity tracking to fortudo: auto-log completed tasks, manual activity logging via a third form mode, insights dashboard with plan-vs-actual timeline and category breakdowns. Toggleable per-user.
- **~8w:** Activities are a new PouchDB document type alongside tasks, sharing the same database and sync infrastructure. Categories (with group hierarchy) provide the aggregation layer for insights. A mediator/coordinator pattern replaces scattered handler logic to support cross-cutting concerns. File structure reorganized into `tasks/` and `activities/` folders. New toast notification system replaces modal alerts for non-blocking feedback. Feature is off by default, enabled via a settings modal.
- **~32w:** See full design below.

---

## Problem

Fortudo handles the planning side of daily time management (scheduling tasks into time blocks) but has no way to track what actually happened. There's no record of whether tasks were completed on time, no way to log unplanned activities, and no insights into how time was actually spent. The [tracks](https://github.com/iconix/tracks) app solves the tracking/insights side but is a separate tool with no integration. The goal is to bring tracks' functionality into fortudo so planning and tracking live in one app.

## System Context (Research Findings)

### Fortudo Architecture

- **Storage:** PouchDB with per-room databases (`fortudo-{roomCode}`). Documents are plain objects with `_id` = `task.id`. No document-type discriminator exists today. An in-memory `revMap` tracks `_rev` for upserts. `saveTasks()` does destructive bulk replace (deletes all docs, re-inserts).
- **Task schema:** `id`, `type` ('scheduled'/'unscheduled'), `description`, `startDateTime`, `endDateTime`, `duration`, `status`, `locked`, `editing`, `confirmingDelete`, `priority` (unscheduled only), `estDuration` (unscheduled only).
- **ID conventions:** `sched-{timestamp}` for scheduled, `unsched-{timestamp}` for unscheduled.
- **Module architecture:** `app.js` (orchestrator) creates callback objects, passes them through renderers to DOM event delegation. Handlers call managers for state changes, then do post-action coordination (save, refresh UI, etc.) inline.
- **Sync:** Bidirectional CouchDB replication via `sync-manager.js` with debounced sync and status callbacks.
- **UI:** Dark Tailwind theme. Teal = scheduled, indigo = unscheduled, amber = warnings, rose = destructive. Modals for confirmations and alerts. Max width `3xl`.

### Tracks Architecture

- **Data model:** Activities have `name`, `start`, `end`, `duration` (seconds), `tag`. Start/stop time tracking model.
- **Tag system:** Hierarchical keys with `/` separator (e.g., `work/project`). First segment = category for grouping. User-configurable with colors.
- **Charts:** Chart.js from CDN. Doughnut (time by tag), bar (daily hours over 14 days). Insights tab with summary stats and collapsible daily timeline.
- **Storage:** localStorage, flat array of all activities filtered by date at runtime.

### Key Constraints

- `saveTasks()` bulk replace must be scoped to task documents only. Activity and config documents must not be caught in this blast radius.
- 80% test coverage threshold (75% branches) enforced by pre-commit hooks.
- No build step. Vanilla JS with ES modules served directly via Firebase Hosting.

## Design

### Data Model

**New document type — Activity:**

```js
{
    docType: 'activity',
    id: 'activity-{timestamp}',
    description: String,
    category: String | null,       // category key, e.g., 'work/deep'
    startDateTime: String,         // ISO datetime
    endDateTime: String,           // ISO datetime
    duration: Number,              // minutes (consistent with fortudo tasks)
    source: 'auto' | 'manual',    // auto = from completed task, manual = user-logged (future: 'habit' for habit-tracked activities)
    sourceTaskId: String | null    // links to source task (when source = 'auto')
}
```

**Task document additions:**

```js
{
    docType: 'task',               // new field, migrated onto existing docs
    category: String | null,       // new field, optional
    // ... all existing fields unchanged
}
```

**Config document — Categories:**

Stored in PouchDB so they sync across devices.

```js
{
    docType: 'config',
    id: 'config-categories',
    categories: [
        { key: 'work/deep',     label: 'Deep Work',  color: '#0ea5e9', group: 'work' },
        { key: 'work/meetings', label: 'Meetings',   color: '#6366f1', group: 'work' },
        { key: 'work/comms',    label: 'Comms',       color: '#f59e0b', group: 'work' },
        { key: 'work/admin',    label: 'Admin',       color: '#64748b', group: 'work' },
        { key: 'personal',      label: 'Personal',    color: '#ec4899', group: 'personal' },
        { key: 'break',         label: 'Break',       color: '#22c55e', group: 'break' }
    ]
}
```

Categories use a hierarchical key format. The `group` field (derived from the first path segment) enables zoom-out aggregation in insights. The form dropdown groups options by group for easy scanning.

Shared field names between tasks and activities: `description`, `startDateTime`, `endDateTime`, `duration`, `category`.

### Storage Layer Changes

**New functions in `storage.js`:**

- `putActivity(activity)` — same upsert pattern as `putTask`.
- `loadActivities()` — `db.allDocs()` filtered to `docType: 'activity'`.
- `deleteActivity(id)` — same pattern as `deleteTask`.
- `loadConfig(configId)` — loads a single config document by ID.
- `putConfig(config)` — upserts a config document.

**Modified functions:**

- `loadTasks()` — filters to `docType: 'task'` (or documents without `docType` for backwards compatibility).
- `saveTasks(tasks)` — scoped to only delete `docType: 'task'` documents during bulk replace.

**Migration:** On first load, documents without `docType` get `docType: 'task'` written back via `putTask`. If no `config-categories` document exists, defaults are seeded. Both operations are idempotent.

### Architecture: Mediator/Coordinator Pattern

A new `app-coordinator.js` module owns runtime orchestration. `app.js` stays thin (boot, DOM setup, wiring). Handlers become thin reporters: they call the manager for state changes, then call the coordinator for cross-cutting side effects.

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
```
handleCompleteTask → completeTask → putTask → refreshUI → confetti → updateStartTime
```

After:
```
handleCompleteTask → completeTask → coordinator.onTaskCompleted(task)
```

The current implementation uses object payloads such as `coordinator.onTaskCompleted({ task })` rather than primitive arguments.

The current coordinator centralizes the post-mutation effects that already exist today: `refreshUI()` for successful task mutations and scheduled-task completion confetti. The semantic event surface is intentionally narrow and pre-Activities. It gives Activities, auto-logging, and later day-rollover work a stable runtime boundary without leaving generic `onTaskUpdated()`-style glue in place.

As Activities land, new cross-cutting behavior should attach to these semantic events instead of being re-threaded through each handler. That keeps handlers thin and preserves the coordinator as the single post-mutation boundary.

If the coordinator grows unwieldy with habits and day-rollover logic, it can graduate to an event bus pattern. The coordination points are already identified, making the swap straightforward. Habit tracking is a planned fast-follow (it already exists in tracks), so the coordinator is designed with that in mind.

**Day boundary detection:** The earlier placeholder `coordinator.onDayChanged()` hook was intentionally removed once it became clear it implied behavior that did not exist yet. Future day-rollover work should reintroduce a real semantic boundary only when the rollover mutation rules are fully specified.

### Module Structure

```
public/js/
├── tasks/
│   ├── manager.js                # task state management, CRUD
│   ├── scheduled-renderer.js     # renders scheduled task list
│   ├── scheduled-handlers.js     # scheduled task event handlers
│   ├── unscheduled-handlers.js   # unscheduled task event handlers
│   ├── add-handler.js            # add task handler
│   ├── clear-handler.js          # clear tasks handler
│   └── form-utils.js             # task form extraction, validation
├── activities/
│   ├── manager.js                # activity state management, CRUD, auto-logging
│   ├── renderer.js               # renders activity log list
│   ├── insights-renderer.js      # insights dashboard, timeline, charts
│   ├── handlers.js               # activity event handlers
│   └── form-utils.js             # activity form extraction
├── app.js                        # boot sequence, DOM setup, wiring
├── app-coordinator.js            # runtime orchestration
├── storage.js                    # PouchDB persistence layer
├── dom-renderer.js               # page-level only (clock, form toggle, start time); scheduled task rendering extracted to tasks/scheduled-renderer.js
├── modal-manager.js              # confirmation and schedule modals
├── toast-manager.js              # non-blocking toast notifications
├── room-manager.js               # room code management
├── room-renderer.js              # room entry screen UI (renamed from handlers/room-ui-handler.js)
├── sync-manager.js               # CouchDB sync
├── reschedule-engine.js          # rescheduling logic
├── category-manager.js           # category CRUD, config doc, defaults
├── settings-manager.js           # feature toggles (Activities enabled)
├── utils.js                      # shared utilities
└── config.js                     # CouchDB URL config
```

Files within feature folders are unprefixed (e.g., `tasks/manager.js` not `tasks/task-manager.js`). VS Code / Cursor shows parent folders in tabs when filenames are ambiguous (`workbench.editor.labelFormat: short`).

**State management principle:** Renderers can read from any manager. Only the coordinator writes cross-module side effects.

### Feature Toggle & Settings

`settings-manager.js` exposes `isTracksEnabled()` and `setTracksEnabled(bool)`. Storage mechanism (localStorage vs PouchDB) is encapsulated and TBD.

When disabled: no activity-related DOM, no category dropdown on tasks, no auto-logging, no insights tab. Tasks work exactly as today.

**Settings UI:** Gear icon in the header (next to room-code badge and sync indicator). Opens a settings modal with:
- Activities toggle ("Enable Activities")
- Category management: list of categories with colored dots, edit/delete buttons, "Add category" with label input and color picker
- Flipping the toggle keeps the modal open, showing the toggle in its new state, a brief explanation of what will change ("Activity tracking will be enabled/disabled after reload"), and a "Reload to apply" button as the primary action. The user can close the modal without reloading if they change their mind.

### UI: Activity Logging

**Auto-logging:** When a scheduled task is completed and Activities is enabled, `createActivityFromTask(task)` creates an activity document copying `description`, `startDateTime`, `endDateTime`, `duration`, `category` with `source: 'auto'` and `sourceTaskId`. Silent, no notification.

**Manual logging:** Third mode on the existing task form, alongside "Scheduled" and "Unscheduled". Accent color TBD (candidates: cyan, sky, or orange — try visually during implementation).

Fields: description, category dropdown (grouped by group), start time, duration (hours/minutes). No priority, no rescheduling logic.

**Category dropdown visual:** Since `<option>` elements can't be styled with colors cross-browser, the dropdown shows text labels grouped by group. A small colored dot or badge renders next to the currently selected category value outside the `<select>`.

**Category on rendered tasks/activities:** A small colored pill badge next to the description. When no category is set, no badge is shown (no "uncategorized" label).

### UI: Insights View

Accessed via a tab toggle in the header ("Tasks" / "Insights"). Switches visibility of main content sections. Info panel stays visible in both views. The daily plan-vs-actual review is the primary focus of insights; longer-term trends are secondary (collapsed by default).

**Sections:**

1. **Today's Summary**
   - Two-row plan-vs-actual timeline: top row shows planned task blocks (from scheduled times at completion), bottom row shows actual activities (auto + manual). Blocks proportionally sized by duration, colored by category.
   - Summary stats: total planned time, total actual time, tasks completed, late count.
   - Category breakdown bars.

2. **Activity Log**
   - Chronological list of today's activities. Each entry shows description, category color badge, time range, duration. Manual entries are editable/deletable. Auto entries link to source task.

3. **Data Issues**
   - Detects and highlights data quality problems: overlapping activities, end-before-start, duplicate auto-logged entries. Shown as a warning section (collapsed when no issues). Helps catch inconsistencies from auto-logging or sync conflicts.

4. **Trends** (collapsed by default)
   - Time-by-category doughnut chart, filterable by date range.
   - Daily hours bar chart over last 14 days.
   - Hand-rolled HTML/CSS/SVG for v1. Evaluate Chart.js if more interactivity is desired.

### UI Patterns

**Toast notifications:** New `toast-manager.js` replaces modal alerts for non-blocking feedback. Small notification slides in, auto-dismisses after 3-4 seconds. Modals remain for genuine confirmations requiring a decision. Introduced in Phase 1, existing `showAlert` calls migrated where appropriate.

**Empty states:** Each view has a meaningful empty state with guidance (e.g., "No activities tracked today — log one or complete a scheduled task", "Enable Activities in settings to start tracking").

**Keyboard shortcuts:** Added once form modes and tab exist.
- `1` / `2` / `3` to switch form mode
- `Tab` to toggle Tasks/Insights views
- `Esc` to close modals

**Transitions:** Tab switching, chart animations, timeline build-in. Polish phase.

**Mobile:** Plan-vs-actual timeline stacks vertically or supports horizontal scroll on narrow screens. Polish phase.

**Onboarding:** One-time tooltip/walkthrough on first Activities enable. Polish phase.

### Testing

**TDD approach:** Red/green for all new code. Write failing tests first, implement until they pass, refactor.

**Unit tests needed:**
- `activities/manager.js` — addActivity, createActivityFromTask, CRUD
- `activities/handlers.js` — handler tests following existing patterns
- `category-manager.js` — loading defaults, CRUD, config doc persistence
- `settings-manager.js` — toggle read/write
- `storage.js` — new functions, `saveTasks` scoping, migration
- `app-coordinator.js` — coordination logic
- `toast-manager.js` — show, auto-dismiss

**Existing tests:** Import paths updated for the `tasks/` reorganization. Mechanical step done before adding new functionality.

**E2E tests:** New Playwright test file for activity tracking flows.

### Sync Considerations

Activity documents sync via PouchDB like tasks. No special conflict handling for v1. Duplicate activities from sync conflicts are a minor data quality issue; deduplicate by `sourceTaskId` later if needed.

Lazy loading: activity modules always imported but gated by `isTracksEnabled()`. Chart library (if adopted) loaded lazily on first insights view open.

## Open Questions

- **Activity accent color:** cyan, sky, or orange (leaning blue/sky). Try visually during implementation.
- **Charts:** Hand-rolled HTML/CSS/SVG for v1. If the result feels too plain, evaluate either a lightweight library (e.g., uPlot ~35KB, Frappe Charts ~17KB) as a middle ground, or Chart.js (~200KB) for full interactivity. User likes pizzazz, so this is likely to be revisited.
- **Settings storage mechanism:** localStorage (per-device) vs PouchDB (per-room) for the Activities toggle. Decide when use cases are clearer. API is the same either way.
- **`reschedule-engine.js` location:** Currently stays at root level. Could move into `tasks/` since it only applies to tasks. Decide during Phase 1 reorganization.

## Implementation Phases

**Phase 1: Reorganize & foundation**
- Move existing files into `tasks/`, rename `room-ui-handler.js` → `room-renderer.js`
- Introduce `app-coordinator.js`, extract post-action logic from handlers
- Add `toast-manager.js`, migrate non-blocking `showAlert` calls
- Update all import paths, existing tests pass
- Add day-boundary detection to the 1-second interval

**Phase 2: Storage**
- Add `docType` migration
- New storage functions: `putActivity`, `loadActivities`, `deleteActivity`, `loadConfig`, `putConfig`
- Scope `saveTasks` to `docType: 'task'` only
- TDD throughout

**Phase 3: Categories & settings**
- `category-manager.js`, seeds defaults from config doc
- `settings-manager.js` with Activities toggle
- Settings modal UI: toggle + category management (add/edit/delete)
- Category dropdown on task form (all modes)
- Keyboard shortcuts for form modes

**Phase 4: Activity logging**
- `activities/manager.js` with CRUD and `createActivityFromTask`
- Third form mode ("Activity") on the task form
- Auto-logging wired into task completion via coordinator
- Empty states for activity views

**Phase 5: Insights view**
- Tab toggle in header (Tasks / Insights)
- Two-row plan-vs-actual timeline
- Activity log list with edit/delete for manual entries
- Category breakdown bars and summary stats
- Trends section (doughnut + bar chart, hand-rolled)
- Keyboard shortcut for tab toggle

**Phase 6: Polish & E2E**
- Playwright tests for activity flows
- Activity accent color decision
- Transitions and micro-interactions
- Mobile timeline adaptation
- Onboarding tooltips on first Activities enable
- Evaluate Chart.js if charts feel too plain
