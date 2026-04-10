# Fortudo Activities: Adding Activity Tracking & Insights

## Pyramid Summary

- **~2w:** Add activity tracking to Fortudo so planning and actual time spent live in one app: synced Activities enablement, shared task/activity taxonomy, manual logging, automatic logging from completed tasks, a live start/stop timer, and insights built around plan-vs-actual review.
- **~8w:** Activities can be logged three ways: manually after the fact, auto-logged when scheduled tasks complete, or captured in real time via a live timer (PouchDB config doc, syncs across devices). The foundation supports `task`, `activity`, and `config` documents in one room database with taxonomy, settings, and timer state all PouchDB-backed. Insights UI layers on top for plan-vs-actual review.
- **~32w:** Fortudo evolves from a planning-only tool into a lightweight planning-and-tracking system. Tasks and activities share taxonomy, settings sync at the room level, the coordinator remains the post-mutation seam for cross-cutting behavior like auto-logging and timer auto-stop, and insights center on reviewing planned versus actual time without splitting that workflow into a separate app.

---

## Problem

Fortudo handles the planning side of daily time management by scheduling tasks into time blocks, but it has no way to track what actually happened. There is no record of whether tasks were completed on time, no way to log unplanned activities, and no insights into how time was actually spent. The [tracks](https://github.com/iconix/tracks) app solves the tracking and insights side but is a separate tool with no integration. The goal is to bring that functionality into Fortudo so planning and tracking live in one app.

## System Context (Research Findings)

### Fortudo Architecture

- **Storage:** PouchDB with per-room databases (`fortudo-{roomCode}`). Storage now supports typed documents (`task`, `activity`, `config`) in the same room database. Legacy task docs are migrated to `docType: 'task'` during boot-time storage preparation. Task bulk replace is scoped to task documents only. Revision tracking is type-scoped internally. Preview deploys use isolated room/database names so preview testing never touches live room data.
- **Task schema:** `id`, `type` (`scheduled` / `unscheduled`), `description`, `startDateTime`, `endDateTime`, `duration`, `status`, `locked`, `editing`, `confirmingDelete`, `priority` (unscheduled only), `estDuration` (unscheduled only), `category` (optional, taxonomy key).
- **ID conventions:** `sched-{timestamp}` for scheduled, `unsched-{timestamp}` for unscheduled.
- **Module architecture:** `app.js` now focuses on boot, storage wiring, room lifecycle, and top-level event setup. Feature handlers live under `tasks/`. Successful task mutations are reported through `app-coordinator.js` as semantic post-mutation events. Render-time callback threading still exists through `dom-renderer.js`.
- **Sync:** Bidirectional CouchDB replication via `sync-manager.js` with debounced sync and status callbacks. Room-switch sync handoff is now session-aware so in-flight sync from one room does not mutate the next room.
- **UI:** Dark Tailwind theme. Teal = scheduled, indigo = unscheduled, sky = activity, amber = warnings, rose = destructive. Modals remain for real confirmations. Toasts now handle non-blocking feedback. Max width `3xl`.

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
    source: 'auto' | 'manual' | 'timer',  // future: 'habit' is possible later
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

**Config document - Taxonomy:**

Stored in PouchDB so task taxonomy syncs across devices sharing a room.

```js
{
    docType: 'config',
    id: 'config-categories',
    schemaVersion: '3.5',
    groups: [
        { key: 'work', label: 'Work', colorFamily: 'blue', color: '#0ea5e9' },
        { key: 'personal', label: 'Personal', colorFamily: 'rose', color: '#ec4899' },
        { key: 'break', label: 'Break', colorFamily: 'green', color: '#22c55e' }
    ],
    categories: [
        {
            key: 'work/deep',
            groupKey: 'work',
            label: 'Deep Work',
            color: '#0ea5e9',
            isLinkedToGroupFamily: true
        },
        {
            key: 'work/meetings',
            groupKey: 'work',
            label: 'Meetings',
            color: '#6366f1',
            isLinkedToGroupFamily: true
        }
    ]
}
```

Taxonomy now treats standalone groups and child categories as first-class records. Keys remain hierarchical using `/`, so insights can still aggregate by top-level group while the task form dropdown stays grouped for easy scanning.

**Config document - Running Activity Timer:**

Ephemeral config doc representing a live timer. Created on timer start, deleted on timer stop. Syncs across devices sharing a room.

```js
{
    docType: 'config',
    id: 'config-running-activity',
    description: String,
    category: String | null,
    startDateTime: String  // ISO datetime, real wall-clock time
}
```

When the timer stops, this config doc is deleted and a normal activity document is created with `source: 'timer'`, computed `endDateTime` and `duration`.

Shared field names between tasks and activities: `description`, `startDateTime`, `endDateTime`, `duration`, `category`.

### Storage Layer Changes

**New functions in `storage.js`:**

- `putActivity(activity)` - same upsert pattern as `putTask`
- `loadActivities()` - `db.allDocs()` filtered to `docType: 'activity'`
- `deleteActivity(id)` - same pattern as `deleteTask`
- `loadConfig(configId)` - loads a single config document by ID
- `putConfig(config)` - upserts a config document
- `deleteConfig(configId)` - deletes a config document (used by timer stop)

**Modified functions:**

- `loadTasks()` - filters to `docType: 'task'`, while still accepting documents without `docType` for backwards compatibility
- `saveTasks(tasks)` - deletes and rewrites only `docType: 'task'` documents during bulk replace

**Migration:**

On first load, legacy task documents without `docType` get `docType: 'task'` written back during storage preparation. That migration is idempotent.

**Update after Phase 3/3.9:** generic config primitives remain in `storage.js`, while taxonomy-specific seeding, normalization, selectors, and mutations live in focused taxonomy modules. The earlier `category-manager.js` compatibility facade has been removed.

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

export function onActivityCreated({ activity }) { ... }
export function onActivityEdited({ activity }) { ... }
export function onActivityDeleted({ activity }) { ... }
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

Most coordinator events resolve to `refreshUI()`, which re-renders task lists and the activity log. Scheduled-task completion adds confetti and, when Activities are enabled, fires auto-logging as a fire-and-forget async chain (`.then()/.catch()`) to keep `onTaskCompleted` synchronous. Auto-log failures surface an amber warning toast rather than blocking the completion flow.

Cross-cutting behavior attaches to these semantic events rather than being threaded through each handler. That keeps handlers thin and preserves the coordinator as the single post-mutation boundary.

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
|   |-- manager.js                # activity state management, CRUD, createActivityFromTask, live timer
|   |-- renderer.js               # renders activity log list with inline editing
|   |-- handlers.js               # activity add/edit/delete handlers
|   |-- form-utils.js             # activity form extraction (add + edit)
|   |-- ui-handlers.js            # activity UI orchestration (form routing, list clicks, edit state, timer display)
|   |-- smoke-hooks.js            # testability hooks for forcing activity failures in preview/smoke
|   `-- insights-renderer.js      # (Phase 5) insights dashboard, timeline, charts
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
|-- taxonomy/
|   |-- taxonomy-store.js        # taxonomy load/persist, seeding, normalization
|   |-- taxonomy-selectors.js    # taxonomy snapshot queries, option helpers, badge rendering
|   `-- taxonomy-mutations.js    # taxonomy CRUD and task-reference safety checks
|-- settings/
|   `-- taxonomy-settings.js     # taxonomy management UI inside settings modal
|-- category-colors.js            # color family palettes and helpers
|-- settings-manager.js           # Activities toggle (PouchDB config doc + in-memory cache)
|-- settings-renderer.js          # settings modal shell, toggle wiring, delegates to taxonomy-settings
|-- utils.js                      # shared utilities
`-- config.js                     # CouchDB URL config
```

Files within feature folders are unprefixed, for example `tasks/manager.js` instead of `tasks/task-manager.js`. VS Code or Cursor can show parent folders in tabs when filenames are ambiguous.

**State management principle:** Renderers can read from any manager. The coordinator owns cross-module post-mutation side effects. UI intent routing remains separate from the coordinator.

### Feature Toggle & Settings

`settings-manager.js` now exposes `loadSettings()`, `isActivitiesEnabled()`, and `setActivitiesEnabled(bool)`. Activities enablement is stored in a PouchDB config document and read synchronously from an in-memory cache after boot. A one-time `localStorage` migration remains in place for the legacy `fortudo-activities-enabled` key.

When Activities are disabled: no activity-related DOM, no category dropdown on tasks, no auto-logging, and no insights tab. Tasks should continue working exactly as they do today.

**Settings UI:** Gear icon in the header, next to the room-code badge and sync indicator. Opens a settings modal with:

- Activities toggle ("Enable Activities")
- Taxonomy management: standalone groups plus child categories, each with edit/delete flows and grouped assignment in the task form
- Toggling the feature keeps the modal open, shows the toggle in its new state, explains what will change, and provides a "Reload to apply" primary action. The user can close the modal without reloading if they change their mind.
- Toggle persistence is async; failed writes should restore the prior toggle state and surface non-blocking feedback instead of leaving the UI in an inconsistent state.

### UI: Activity Logging

**Auto-logging:** When a scheduled task is completed and Activities are enabled, `createActivityFromTask(task)` creates an activity document copying `description`, `startDateTime`, `endDateTime`, `duration`, and `category`, with `source: 'auto'` and `sourceTaskId`. Auto-logging fires as fire-and-forget async work inside the synchronous `onTaskCompleted` coordinator event. On success, `onActivityCreated` triggers a UI refresh showing the new activity. On failure, an amber warning toast surfaces the issue without blocking the completion flow.

**Manual logging:** Third mode on the existing task form, alongside Scheduled and Unscheduled. Accent color: sky.

Fields: description, category dropdown grouped by group, start time, duration (hours/minutes). No priority and no rescheduling logic.

### UI: Live Activity Timer

Bridges the gap between Fortudo's retrospective logging and the real-time start/stop model from [tracks](https://github.com/iconix/tracks). The timer lets you capture what you're doing now with real timestamps, instead of reconstructing it after the fact.

**Activity tab states:** The activity tab in the three-way form toggle has two visual states depending on whether a timer is running:

- **No timer running:** The manual entry form as shipped in Phase 4 (description, category, start time, duration), with two side-by-side action buttons: "Log Activity" and "Start Timer."
- **Timer running:** The form transforms into a timer display showing the activity description (editable), category dropdown (editable), start time (editable, for backdating), live elapsed counter (`HH:MM:SS` via `setInterval`), and a "Stop" button. Switching to scheduled or unscheduled tabs works normally regardless of timer state. Switching back to the activity tab shows the timer display. All other operations (adding/editing/deleting tasks and activities, completing tasks, auto-logging) continue to work while the timer runs.

**Starting a timer:** Fill in description and optionally category on the activity form, click "Start Timer." Start time defaults to now. The form transforms to the timer display.

**Stopping a timer:** Click "Stop." The running-activity config doc is deleted, a normal activity document is created with computed `endDateTime` and `duration`, and the form reverts to the manual entry state. The new activity appears in the activity log.

**Backdating:** The start time on the timer display is editable via a time picker. Use case: you forgot to start the timer 20 minutes ago.

**Boot restoration:** If a `config-running-activity` doc exists on load, the timer state is silently restored and the elapsed counter resumes from the persisted `startDateTime`. The user stays on whichever tab they land on, but the activity tab gets a brief UI highlight (pulse, badge, or similar) to signal that a timer is running. Navigating to the activity tab shows the timer display.

**Stop triggers:**

1. **Explicit stop** -- user clicks "Stop" button
2. **Stop-on-start** -- starting a new timer auto-stops the running one (no confirmation). The stopped timer's `endDateTime` is set to now, its activity is created, then the new timer starts. Sequential execution to avoid two config docs existing simultaneously.
3. **Task completion with overlap** -- when auto-logging fires in `onTaskCompleted`, if the auto-logged activity's time range overlaps with the running timer's active range (`startDateTime` through now), the timer is stopped with `endDateTime` set to the auto-log's `startDateTime`. If no overlap, the timer keeps running. **Guard:** if the early-completion time adjustment shifts the auto-log's `startDateTime` to before the timer's own `startDateTime`, clamp the timer's `endDateTime` to its `startDateTime` (producing a zero-duration activity) rather than creating a negative duration. The zero-duration activity is still saved per the "always create" edge case decision.

**Early task completion adjustment:** When `createActivityFromTask` runs and the task's planned `startDateTime` is in the future, the auto-log times are adjusted: `endDateTime` = now, `startDateTime` = now minus the task's `duration`. This ensures auto-logged activities reflect when the work actually happened rather than when it was planned.

**Unscheduled tasks and the timer:** Completing an unscheduled task does not affect a running timer (unscheduled completions are lightweight and often happen mid-flow). Users who want to track unscheduled work can: start a timer for it, schedule it first then complete for auto-logging, or manually log it after the fact.

**Timer state management** in `activities/manager.js`:

- `startTimer({ description, category })` -- writes config doc, returns running state
- `stopTimer()` -- reads config doc, computes duration, creates activity, deletes config doc
- `getRunningActivity()` -- synchronous read from in-memory cache (same pattern as `isActivitiesEnabled()`)
- `updateRunningActivity({ description, category, startDateTime })` -- updates config doc (for backdating or mid-timer changes)
- `loadRunningActivity()` -- called during boot, populates in-memory cache

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
   - All entries (manual and auto-logged) are editable and deletable via inline editing
   - Auto entries show a source task link with provenance metadata; editing creates a modified copy retaining `sourceTaskId`

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

**Unit tests (covered through Phase 4):**

- `activities/manager.js` - addActivity, editActivity, removeActivity, createActivityFromTask, CRUD, state management
- `activities/handlers.js` - add/edit/save/delete handlers, resolveActivityPayload routing
- `activities/form-utils.js` - extractActivityFormData (add form), extractActivityEditFormData (inline edit), shared field extraction
- `activities/renderer.js` - renderActivities, renderActivityItem, renderInlineEditActivityItem, source link rendering
- `activities/smoke-hooks.js` - consumeActivitySmokeFailure, queueActivitySmokeFailure, host gating
- `app-coordinator.js` (integration) - activity creation/editing/deletion coordination, auto-logging flow
- `taxonomy/taxonomy-store.js` - seeding, normalization, config-doc persistence
- `taxonomy/taxonomy-selectors.js` - option helpers, resolution, badge rendering
- `taxonomy/taxonomy-mutations.js` - taxonomy CRUD and task-reference safety checks
- `settings-manager.js` - boot loading, PouchDB-backed toggle persistence, legacy migration, failure handling
- `storage.js` - activity/config functions, `saveTasks` scoping, migration

**Existing tests:** The `tasks/` reorganization, toast system, coordinator hardening, and orchestration boundary are already covered. Phase 4 extended that baseline with activity-specific unit and integration tests.

**E2E tests:** Add activity tracking E2E coverage once the UI exists.

**Existing smoke coverage:** `scripts/playwright_preview_smoke.py` covers storage-level merge-readiness and seeded UI confidence passes, including legacy migration, cross-type isolation, room isolation, synced-preview behavior, taxonomy/settings rendering, group-vs-child task assignment, reload persistence, and referenced-delete safety. `activities/smoke-hooks.js` provides testability hooks for injecting activity failures in preview/smoke environments (localhost and preview hosts only).

### Sync Considerations

Activity documents sync via PouchDB like tasks. No special conflict handling is required for v1. Duplicate activities from sync conflicts are a minor data-quality issue; deduplication by `sourceTaskId` can come later if needed.

Lazy loading: activity modules can be imported eagerly but gated by `isActivitiesEnabled()`. If a chart library is adopted, load it lazily on first Insights open.

## Open Questions

- **Activity accent color:** Currently sky in the implementation. Still open to experimenting with cyan and orange.
- **Charts:** Hand-rolled HTML/CSS/SVG for v1. If that looks too plain, evaluate either a lightweight library such as uPlot or Frappe Charts, or Chart.js for full interactivity.
- **Legacy settings migration cleanup:** remove the one-time `fortudo-activities-enabled` migration path after a later release, once it is acceptable to stop supporting users skipping directly from pre-3.9 builds.
- **Unscheduled task hint:** When Activities are enabled, surface a hint near unscheduled tasks that they won't auto-log on completion. Exact placement and wording TBD.
- **Timer display compactness:** How compact should the timer display be? One-line minimal bar vs. showing all editable fields (description, category, start time) inline.

### Phase 4 Design Decisions (resolved)

1. **Activities visible from Phase 4.** A simple chronological list of today's activities renders below the task list. This becomes the "Activity Log" section of Phase 5 Insights, so the renderer work isn't throwaway. Edit/delete ships in Phase 4 for both manual and auto-logged activities; auto entries retain visible provenance and `sourceTaskId` metadata as an edited copy of the completed task.

2. **Third form mode routing.** `extractActivityFormData()` lives in `activities/form-utils.js` (separate from tasks). Submit routes through `activities/handlers.js`, not the task `add-handler.js`. `dom-renderer.js` gains a three-way mode toggle but delegates to the appropriate module. Manual activity creation flows through `coordinator.onActivityCreated({ activity })`, keeping the coordinator as the consistent post-mutation boundary.

3. **Auto-logging: scheduled tasks only.** Unscheduled tasks lack real start/end times; synthesizing timestamps from estimated duration produces misleading plan-vs-actual data. Users who want to track unscheduled work can: start a timer for it (Phase 4.5), schedule it first (giving it real times, then completing auto-logs naturally), or manually log it.

4. **Phase 4 file boundary.** Phase 4 ships: `activities/manager.js`, `activities/handlers.js`, `activities/form-utils.js`, `activities/renderer.js`, `activities/ui-handlers.js`, `activities/smoke-hooks.js`. Phase 5 ships: `activities/insights-renderer.js`.

5. **`isActivitiesEnabled()` stays synchronous.** Boot-time `loadSettings()` populates an in-memory cache from the PouchDB config doc. `isActivitiesEnabled()` remains a synchronous read. Same pattern as `loadTaxonomy()`. No call sites become async.

### Phase 4.5 Design Decisions (resolved)

1. **Timer state as PouchDB config doc, not activity doc.** A running timer is ephemeral coordinator state, not a first-class activity. It becomes an activity only when stopped. This keeps the activity schema clean (no `status: 'running'` partial documents) and avoids confusing insights queries. The config doc syncs across devices and survives page reloads.

2. **No new files.** Timer logic extends `activities/manager.js` (state, start/stop/update) and `activities/ui-handlers.js` (timer display, elapsed counter, form transitions). The timer is a feature of activity management, not a separate module.

3. **Overlap check uses real time ranges, not assumptions.** The auto-log's time range may be shifted (early completion adjustment), may be in the past (task was earlier), or may be in the future (planned for later). The overlap check compares the running timer's active range (`startDateTime` through now) against the auto-log's actual time range. Only true overlaps trigger a timer stop.

4. **Unscheduled task completion does not affect the timer.** Unscheduled tasks are lightweight items often completed mid-flow. No auto-logging, no timer stop. Users track unscheduled work via the timer, schedule-then-complete, or manual logging.

5. **Side-by-side action buttons.** The activity form shows "Log Activity" and "Start Timer" side by side. This keeps the start-new-activity flow to one action when a timer is already running (type, click "Start Timer," old timer auto-stops).

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

### Completed Categories/Settings Work

**Phase 3: Categories and settings**

- Add taxonomy-backed settings UI with standalone groups and child categories
- Add grouped category assignment on the task form
- Add taxonomy rendering on task badges and settings surfaces
- Add initial Activities toggle and settings modal flow

**Phase 3.9: Cleanup and settings migration**

- Remove the `category-manager.js` compatibility facade and rewire imports directly to taxonomy modules
- Move taxonomy responsibilities into `taxonomy-store`, `taxonomy-selectors`, and `taxonomy-mutations`
- Migrate the Activities toggle from legacy `localStorage` to a PouchDB config document
- Load settings during boot via `loadSettings()` before feature-gated UI checks
- Add failure-path handling so migration does not drop legacy state on failed persistence and toggle writes revert UI state with a toast

### Completed Activity Logging Work

**Phase 4: Activity logging**

- Added `activities/manager.js` with CRUD, `createActivityFromTask` (scheduled tasks only), and state management with clone/normalize pattern
- Added `activities/form-utils.js` for activity form extraction (add + inline edit), separate from task form-utils
- Added `activities/handlers.js` with submit handler routing through `coordinator.onActivityCreated`, using `resolveActivityPayload` to accept both data objects and HTMLFormElements
- Added `activities/renderer.js` with chronological today's-activities list, inline editing for all entries, source task links for auto-logged entries
- Added `activities/ui-handlers.js` for activity UI orchestration: form routing (`handleActivityAwareFormSubmit`), list click delegation, edit state management, feature-flag-aware show/hide
- Added `activities/smoke-hooks.js` for testability hooks (force activity failures in preview/smoke environments)
- Added third form mode ("Activity") via data-driven `TASK_FORM_MODE_CONFIG` three-way toggle in `dom-renderer.js`
- Wired auto-logging into scheduled task completion as fire-and-forget async in `coordinator.onTaskCompleted`
- Added empty states for activity views
- Both manual and auto-logged activities are editable; auto entries retain provenance metadata (`sourceTaskId`) through edits

### Next Planned Work

**Phase 4.5: Live activity timer**

- Add timer state management to `activities/manager.js`: `startTimer`, `stopTimer`, `getRunningActivity`, `updateRunningActivity`, `loadRunningActivity`
- Add `config-running-activity` PouchDB config doc persistence with in-memory cache
- Add timer display UI to `activities/ui-handlers.js`: elapsed counter, stop button, editable fields (description, category, start time), form-to-timer and timer-to-form transitions
- Add side-by-side "Log Activity" / "Start Timer" buttons on the activity form
- Add stop-on-start behavior (starting a new timer auto-stops the running one)
- Add early task completion time adjustment in `createActivityFromTask` (shift auto-log window to end at now when task was scheduled in the future)
- Extend `onTaskCompleted` auto-log chain in coordinator: overlap detection with running timer, auto-stop at auto-log's `startDateTime` when ranges intersect
- Add boot restoration of running timer from persisted config doc
- Verify `deleteConfig` exists in `storage.js` or add it

**Phase 4.7: Category editing parity**

- Keep full-field inline editing on activities, including category changes
- Add category editing to scheduled task inline edit forms
- Add category editing to unscheduled task inline edit forms
- Align task and activity edit layouts so category editing no longer exists only on activities
- Add renderer, form-utils, handler, app, and smoke coverage for task category edit flows

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
