# Fortudo Activities Cleanup Phase 1.5 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the architectural and behavioral debt introduced or exposed during Activities Phase 1 by making post-mutation orchestration consistent, eliminating duplicate side effects, normalizing mutation result contracts, and tightening runtime/test behavior around local-only sync config.

**Architecture:** Keep the app-coordinator pattern, but make it a real semantic boundary instead of a partial helper layer. Move derived start-time updates fully under `refreshUI()`, standardize task-mutation result payloads in the manager layer, and route all task mutations through clear event semantics or intentionally keep them local with explicit rationale. Treat local-only config as a first-class runtime mode rather than a tolerated 404 side effect.

**Tech Stack:** Vanilla JS, Jest, Playwright/Python E2E harness, Git worktree workflow

---

## File Map

**Primary implementation files**
- `public/js/app-coordinator.js`
  Responsibility: single post-mutation orchestration boundary for semantic task events only.
- `public/js/dom-renderer.js`
  Responsibility: derive UI from task state, including start-time suggestion ownership.
- `public/js/app.js`
  Responsibility: bootstrapping and runtime wiring; should not hide config-loading failures indiscriminately.
- `public/js/tasks/manager.js`
  Responsibility: canonical mutation APIs and normalized result contracts.
- `public/js/tasks/scheduled-handlers.js`
  Responsibility: translate DOM interactions into semantic scheduled-task mutation events.
- `public/js/tasks/unscheduled-handlers.js`
  Responsibility: translate DOM interactions into semantic unscheduled-task mutation events.
- `public/js/tasks/add-handler.js`
  Responsibility: add-task flow orchestration, but not generic cross-cutting UI refresh decisions.
- `public/js/tasks/clear-handler.js`
  Responsibility: batch clear/delete flows with explicit semantics.

**Primary test files**
- `__tests__/app-coordinator.test.js`
- `__tests__/scheduled-task-handlers.test.js`
- `__tests__/unscheduled-task-handlers.test.js`
- `__tests__/add-task-handler.test.js`
- `__tests__/app.test.js`
- `__tests__/integration.test.js`
- `test_functional.py`
- `test_ui_interaction.py`

**Optional docs touched if behavior/naming changes**
- `README.md`
- `docs/ARCHITECTURE-ASSESSMENT.md`

---

### Task 1: Make `refreshUI()` the Sole Owner of Start-Time Suggestion Updates

**Files:**
- Modify: `public/js/app-coordinator.js`
- Modify: `public/js/dom-renderer.js`
- Test: `__tests__/app-coordinator.test.js`
- Test: `__tests__/app.test.js` (only if existing expectations break)

- [ ] **Step 1: Write the failing coordinator tests**

Update `__tests__/app-coordinator.test.js` so coordinator actions assert:
- `refreshUI()` is called for task mutations
- `updateStartTimeField()` is **not** called directly by the coordinator
- scheduled completion still triggers confetti

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm.cmd test -- --runInBand __tests__/app-coordinator.test.js`
Expected: FAIL because current coordinator still calls `updateStartTimeField()`

- [ ] **Step 3: Remove duplicate start-time logic from the coordinator**

In `public/js/app-coordinator.js`:
- Delete `refreshStartTimeSuggestion()`
- Remove direct `updateStartTimeField()` and `getSuggestedStartTime()` usage
- Keep semantic orchestration only:
  - `onTaskCompleted(task)` => `refreshUI()` + scheduled-only confetti
  - `onTaskAdded(task)` => `refreshUI()`
  - `onTaskUpdated(task)` => `refreshUI()`
  - `onTaskDeleted(taskId)` => `refreshUI()`

Do **not** remove start-time updates from `refreshUI()`.

- [ ] **Step 4: Re-run the focused test**

Run: `npm.cmd test -- --runInBand __tests__/app-coordinator.test.js`
Expected: PASS

- [ ] **Step 5: Run related app coverage**

Run: `npm.cmd test -- --runInBand __tests__/app.test.js __tests__/integration.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add public/js/app-coordinator.js __tests__/app-coordinator.test.js __tests__/app.test.js __tests__/integration.test.js
git commit -m "refactor: remove duplicate start-time updates from coordinator"
```

---

### Task 2: Finish the Coordinator Extraction or Deliberately Shrink It

**Files:**
- Modify: `public/js/app-coordinator.js`
- Modify: `public/js/tasks/scheduled-handlers.js`
- Modify: `public/js/tasks/unscheduled-handlers.js`
- Modify: `public/js/tasks/add-handler.js`
- Modify: `public/js/tasks/clear-handler.js`
- Test: `__tests__/scheduled-task-handlers.test.js`
- Test: `__tests__/unscheduled-task-handlers.test.js`
- Test: `__tests__/add-task-handler.test.js`

- [ ] **Step 1: Decide and document the event surface**

Before editing code, define the exact semantic coordinator API in a short comment block or doc note:
- `onTaskAdded(task)`
- `onTaskUpdated(task)`
- `onTaskDeleted(taskId)`
- `onTaskCompleted(task)`
- `onTasksCleared(scope)` or explicit decision to keep batch operations local
- `onTaskUnscheduled(task)` if unschedule remains outside `onTaskUpdated`

Recommended choice:
- Keep single-task mutations in the coordinator
- Add `onTasksCleared(scope)` for batch operations
- Treat unschedule as `onTaskUpdated(task)` if the task stays the same logical task, otherwise add `onTaskUnscheduled(task)`

- [ ] **Step 2: Write failing tests for missing semantic coverage**

Add/adjust tests so they cover:
- scheduled edit save after successful update/reschedule path
- scheduled unschedule success path
- clear scheduled / clear all / clear completed path behavior if moved into the coordinator

- [ ] **Step 3: Run focused tests to verify failure**

Run:
`npm.cmd test -- --runInBand __tests__/scheduled-task-handlers.test.js __tests__/add-task-handler.test.js __tests__/unscheduled-task-handlers.test.js`

Expected: FAIL on the newly-added assertions

- [ ] **Step 4: Implement the chosen semantic boundary**

Recommended implementation:
- `scheduled-handlers.js`
  - Replace post-success `refreshUI()` in `handleSaveTaskEdit()` with a coordinator event based on the actual confirmed result
  - Replace post-success `refreshUI()` in `handleUnscheduleTask()` with a coordinator event
- `clear-handler.js`
  - Either:
    - add `onTasksCleared(scope)` to the coordinator and use it for the three batch flows, or
    - explicitly keep batch flows local and add a top-of-file comment explaining why they intentionally bypass the coordinator

Do **not** leave the current ambiguous half-state.

- [ ] **Step 5: Re-run focused tests**

Run:
`npm.cmd test -- --runInBand __tests__/scheduled-task-handlers.test.js __tests__/add-task-handler.test.js __tests__/unscheduled-task-handlers.test.js`

Expected: PASS

- [ ] **Step 6: Run broader integration coverage**

Run:
`npm.cmd test -- --runInBand __tests__/app.test.js __tests__/integration.test.js`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add public/js/app-coordinator.js public/js/tasks/scheduled-handlers.js public/js/tasks/unscheduled-handlers.js public/js/tasks/add-handler.js public/js/tasks/clear-handler.js __tests__/scheduled-task-handlers.test.js __tests__/unscheduled-task-handlers.test.js __tests__/add-task-handler.test.js __tests__/app.test.js __tests__/integration.test.js
git commit -m "refactor: make task orchestration boundaries consistent"
```

---

### Task 3: Normalize Manager Mutation Result Contracts

**Files:**
- Modify: `public/js/tasks/manager.js`
- Modify: `public/js/tasks/unscheduled-handlers.js`
- Modify: `public/js/tasks/add-handler.js`
- Modify: any other handler that consumes mutation results
- Test: `__tests__/task-management.test.js`
- Test: `__tests__/unscheduled-task-handlers.test.js`
- Test: `__tests__/add-task-handler.test.js`

- [ ] **Step 1: Write the failing contract tests**

In `__tests__/task-management.test.js`, add targeted tests asserting stable return shapes for:
- `scheduleUnscheduledTask(...)`
- `confirmScheduleUnscheduledTask(...)`
- `addTask(...)` / `confirmAddTaskAndReschedule(...)` on success

Recommended normalized shape:
```js
{
  success: true,
  task,           // canonical mutated or created task
  taskId,         // optional convenience
  eventType       // optional semantic label if useful
}
```

For confirmation-needed failures, standardize fields too:
```js
{
  success: false,
  requiresConfirmation: true,
  confirmationType,
  proposedTask,   // canonical proposed task object
  context         // normalized payload instead of ad hoc taskData/taskObjectToFinalize
}
```

- [ ] **Step 2: Run focused tests to verify failure**

Run:
`npm.cmd test -- --runInBand __tests__/task-management.test.js __tests__/unscheduled-task-handlers.test.js __tests__/add-task-handler.test.js`

Expected: FAIL because current return objects are inconsistent

- [ ] **Step 3: Implement the contract normalization in the manager**

In `public/js/tasks/manager.js`:
- Replace ad hoc `taskData`, `newScheduledTaskData`, `taskObjectToFinalize`, `adjustedTaskObject` fields with stable names
- Ensure success paths always return the real resulting task object
- Minimize handler knowledge of internal manager branching

- [ ] **Step 4: Simplify handlers to consume the normalized contract**

In consuming handlers:
- Stop re-deriving tasks from ids when the manager already knows the result
- Stop branching on multiple payload field names for equivalent concepts
- Prefer `result.task` and `result.proposedTask` over shape-specific fields

- [ ] **Step 5: Re-run focused tests**

Run:
`npm.cmd test -- --runInBand __tests__/task-management.test.js __tests__/unscheduled-task-handlers.test.js __tests__/add-task-handler.test.js`

Expected: PASS

- [ ] **Step 6: Run full Jest suite**

Run: `npm.cmd test -- --runInBand`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add public/js/tasks/manager.js public/js/tasks/unscheduled-handlers.js public/js/tasks/add-handler.js __tests__/task-management.test.js __tests__/unscheduled-task-handlers.test.js __tests__/add-task-handler.test.js
git commit -m "refactor: normalize task mutation result contracts"
```

---

### Task 4: Make Local-Only Config an Explicit Runtime Mode

**Files:**
- Modify: `public/js/app.js`
- Optionally create: `public/js/config.js` (only if product decision changes)
- Optionally modify: `.gitignore`
- Test: `__tests__/app.test.js`
- Test: `test_ui_interaction.py`
- Doc: `README.md`

- [ ] **Step 1: Choose the configuration strategy**

Recommended choice:
- Keep `public/js/config.js` optional if you want local-developer overrides
- But in `app.js`, distinguish “module not found” from “module exists but is broken”

Alternative cleanup if you want the simplest runtime:
- Track `public/js/config.js` with `COUCHDB_URL = null`
- Remove the optional-import path entirely
- Move secrets to deployment/build env instead

- [ ] **Step 2: Write the failing app tests**

Add tests covering:
- missing `config.js` => local-only mode
- malformed or throwing `config.js` => error logged, not silently swallowed

- [ ] **Step 3: Run focused tests to verify failure**

Run:
`npm.cmd test -- --runInBand __tests__/app.test.js`

Expected: FAIL on the new error-handling expectations

- [ ] **Step 4: Implement explicit error handling**

If keeping optional `config.js`:
- In `loadCouchDbUrl()`, inspect the error and only return `null` for missing-module cases
- Log unexpected config import failures clearly

If tracking `config.js`:
- Replace dynamic import with static import
- Update docs and ignore rules accordingly

- [ ] **Step 5: Tighten the E2E console assertion**

In `test_ui_interaction.py`:
- Remove the current special-case allowance once the runtime no longer emits the expected config 404
- Keep response capture so future real 404s are still visible

- [ ] **Step 6: Re-run focused verification**

Run:
- `npm.cmd test -- --runInBand __tests__/app.test.js`
- `npm.cmd run test:e2e`

Expected: PASS without a tolerated config fetch error

- [ ] **Step 7: Update docs**

In `README.md`, document the chosen config-loading behavior so local-only mode and sync-enabled mode are both explicit.

- [ ] **Step 8: Commit**

```bash
git add public/js/app.js public/js/config.js .gitignore __tests__/app.test.js test_ui_interaction.py README.md
git commit -m "refactor: make local-only sync config explicit"
```

---

### Task 5: Clean Up Clear-Task UX and Naming

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/tasks/clear-handler.js`
- Modify: `public/js/dom-renderer.js` (if helper names change)
- Test: `__tests__/clear-tasks-handler.test.js`
- Test: `test_functional.py`
- Test: `test_ui_interaction.py`
- Doc: `README.md` (optional if user-facing naming changes are documented)

- [ ] **Step 1: Decide the vocabulary and keep it consistent**

Recommended labels and ids:
- Main button: `clear-schedule-button`
- Dropdown option: `clear-completed-tasks-option`
- Dropdown option: `clear-all-tasks-option`

Avoid the current `delete-all` id for a non-global clear action.

- [ ] **Step 2: Write failing tests for the renamed/clarified behavior**

Update tests so they assert:
- the main button clears scheduled tasks only
- the dropdown contains “Clear Completed” and “Clear All”
- selectors reflect the renamed ids

- [ ] **Step 3: Run focused tests to verify failure**

Run:
- `npm.cmd test -- --runInBand __tests__/clear-tasks-handler.test.js`
- `npm.cmd run test:e2e`

Expected: FAIL on old selectors/naming assumptions

- [ ] **Step 4: Implement the naming cleanup**

In `public/index.html` and related renderer/helpers:
- rename `delete-all` to a semantically correct id
- align helper names if they still carry “delete all” wording for scheduled-only behavior
- keep user-facing copy explicit about schedule-only versus global deletion

- [ ] **Step 5: Re-run focused verification**

Run:
- `npm.cmd test -- --runInBand __tests__/clear-tasks-handler.test.js`
- `npm.cmd run test:e2e`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/js/tasks/clear-handler.js public/js/dom-renderer.js __tests__/clear-tasks-handler.test.js test_functional.py test_ui_interaction.py README.md
git commit -m "refactor: clarify clear-task control naming"
```

---

### Task 6: Give `onDayChanged()` Real Semantics or Remove the Hook

**Files:**
- Modify: `public/js/app-coordinator.js`
- Modify: `public/js/app.js`
- Test: `__tests__/app-coordinator.test.js`
- Test: `__tests__/app.test.js`

- [ ] **Step 1: Decide whether day-boundary behavior belongs in this phase**

Recommended choice:
- Keep the hook, but give it one concrete behavior only if that behavior is already clearly desired
- Otherwise remove the interval callback and leave day-boundary work for a dedicated feature plan

Because the current placeholder is intentionally empty, the least risky cleanup is:
- keep `onDayChanged()` as a documented no-op only if another near-term task will consume it
- otherwise remove the dead hook to avoid false completeness

- [ ] **Step 2: Write the failing test for the chosen direction**

If keeping:
- add a test asserting the concrete behavior

If removing:
- update tests so no placeholder coverage remains

- [ ] **Step 3: Implement the choice**

Either:
- add the smallest real day-change behavior and its tests, or
- delete the dead path from `app.js` and `app-coordinator.js`

- [ ] **Step 4: Re-run focused tests**

Run:
`npm.cmd test -- --runInBand __tests__/app-coordinator.test.js __tests__/app.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/app.js public/js/app-coordinator.js __tests__/app-coordinator.test.js __tests__/app.test.js
git commit -m "refactor: resolve placeholder day-boundary behavior"
```

---

### Task 7: Final Verification and Documentation Sweep

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE-ASSESSMENT.md` (if architecture language is now stale)

- [ ] **Step 1: Run full coverage suite**

Run:
`npm.cmd test -- --coverage --runInBand`

Expected:
- PASS
- Coverage remains above current thresholds

- [ ] **Step 2: Run lint/format checks**

Run:
`npm.cmd run check`

Expected: PASS

- [ ] **Step 3: Run full E2E suite**

Run:
`npm.cmd run test:e2e`

Expected: PASS without tolerated-but-known-bad runtime fetches

- [ ] **Step 4: Update docs to match reality**

Confirm README and any architecture notes describe:
- the coordinator boundary accurately
- the clear-task controls accurately
- local-only config behavior accurately

- [ ] **Step 5: Commit**

```bash
git add README.md docs/ARCHITECTURE-ASSESSMENT.md
git commit -m "docs: align cleanup architecture and verification guidance"
```

---

## Recommended Execution Order

1. Task 1 first
2. Task 3 second
3. Task 2 third
4. Task 4 fourth
5. Task 5 fifth
6. Task 6 sixth
7. Task 7 last

Rationale:
- Task 1 removes known duplication immediately
- Task 3 stabilizes contracts before more orchestration work
- Task 2 becomes easier once manager payloads are predictable
- Task 4 and Task 5 remove test/runtime ambiguity
- Task 6 should be decided only after the surrounding architecture is cleaner

## Notes for the Implementer

- Do not preserve awkward behavior just because a new test currently expects it. Several of the current tests were written to match transitional architecture and should be improved, not blindly defended.
- Prefer semantic event names and stable return contracts over ad hoc payload objects.
- If a coordinator event discards its payload, that is a design smell. Either use the payload meaningfully or remove the parameter.
- If a batch operation does not belong in the coordinator, document that explicitly in code to prevent future half-refactors.
- Use TDD for each contract or orchestration change; the Task 6 regression found during Phase 1 is evidence that this cleanup should stay test-first.
