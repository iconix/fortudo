# Fortudo Coordinator Phase 1.7 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pre-Activities coordinator a genuinely semantic orchestration boundary by giving it meaningful event contracts, routing mutation flows through those contracts consistently, and locking that behavior in with focused tests.

**Architecture:** Keep the coordinator small and task-focused for now. Do not implement Activities, day-rollover mutations, or a full event bus in this phase. Instead, harden the current boundary so handlers report semantic task transitions, the coordinator owns the cross-cutting effects that already exist today, and payloads are meaningful rather than ignored.

**Tech Stack:** Vanilla JS, ES modules, Jest (`--runInBand`), existing Playwright/Python E2E harness, Git worktree workflow

---

## File Map

**Primary implementation files**
- `public/js/app-coordinator.js`
  Responsibility: semantic post-mutation task events only; no placeholder future hooks.
- `public/js/tasks/scheduled-handlers.js`
  Responsibility: translate scheduled-task UI interactions into semantic coordinator events.
- `public/js/tasks/unscheduled-handlers.js`
  Responsibility: translate unscheduled-task UI interactions into semantic coordinator events.
- `public/js/tasks/add-handler.js`
  Responsibility: report successful task creation via the coordinator, not ad hoc orchestration.
- `public/js/tasks/clear-handler.js`
  Responsibility: report batch clear semantics to the coordinator.

**Primary test files**
- `__tests__/app-coordinator.test.js`
- `__tests__/scheduled-task-handlers.test.js`
- `__tests__/unscheduled-task-handlers.test.js`
- `__tests__/add-task-handler.test.js`
- `__tests__/clear-tasks-handler.test.js`
- `__tests__/app.test.js`
- `__tests__/integration.test.js`

**Optional docs**
- `docs/plans/2026-03-16-fortudo-activities-design.md`
- `docs/ARCHITECTURE-ASSESSMENT.md`

---

### Task 1: Define a Real Semantic Coordinator Surface

**Files:**
- Modify: `public/js/app-coordinator.js`
- Test: `__tests__/app-coordinator.test.js`

- [ ] **Step 1: Decide and document the public event vocabulary**

Add a short top-of-file contract comment in `public/js/app-coordinator.js`.

Recommended surface:

```js
onTaskCreated({ task })
onTaskEdited({ task, previousTask })
onTaskCompleted({ task })
onTaskDeleted({ taskId, taskType })
onTaskScheduled({ task, sourceTask })
onTaskUnscheduled({ task, sourceTask })
onTasksCleared({ scope, deletedCount })
```

Rules:
- every event argument must be an object payload
- every payload field must be used meaningfully or removed
- no `void task` / `void taskId` placeholders
- no future-only hooks in this phase

- [ ] **Step 2: Write the failing coordinator tests**

Update `__tests__/app-coordinator.test.js` to assert:
- `onTaskCompleted({ task })` triggers `refreshUI()` and scheduled-only confetti
- `onTaskScheduled({ task, sourceTask })` and `onTaskUnscheduled({ task, sourceTask })` refresh UI
- `onTaskDeleted({ taskId, taskType })` refreshes UI without ignored primitive args
- `onTasksCleared({ scope, deletedCount })` refreshes UI using an object payload
- removed APIs such as `onTaskUpdated`, `onTaskAdded`, or `onDayChanged` are no longer exported if the new surface replaces them

- [ ] **Step 3: Run the focused test to verify failure**

Run:
`npm.cmd test -- --runInBand __tests__/app-coordinator.test.js`

Expected:
- FAIL because the old coordinator still exposes the generic CRUD-style surface and ignored-arg behavior

- [ ] **Step 4: Implement the new coordinator surface**

In `public/js/app-coordinator.js`:
- replace the old generic exports with the chosen semantic events
- keep current cross-cutting behavior bounded to what already exists:
  - `refreshUI()`
  - scheduled completion confetti
- do not add day-rollover behavior here
- do not move failure alerts or confirmation prompts here

- [ ] **Step 5: Re-run the focused test**

Run:
`npm.cmd test -- --runInBand __tests__/app-coordinator.test.js`

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git add public/js/app-coordinator.js __tests__/app-coordinator.test.js
git commit -m "refactor: define semantic coordinator event surface"
```

---

### Task 2: Update Handlers to Report Semantic Events

**Files:**
- Modify: `public/js/tasks/scheduled-handlers.js`
- Modify: `public/js/tasks/unscheduled-handlers.js`
- Modify: `public/js/tasks/add-handler.js`
- Modify: `public/js/tasks/clear-handler.js`
- Test: `__tests__/scheduled-task-handlers.test.js`
- Test: `__tests__/unscheduled-task-handlers.test.js`
- Test: `__tests__/add-task-handler.test.js`
- Test: `__tests__/clear-tasks-handler.test.js`

- [ ] **Step 1: Write the failing handler tests**

Update handler tests so they assert the new semantic coordinator calls:
- scheduled edit save -> `onTaskEdited({ task, previousTask })`
- scheduled unschedule -> `onTaskUnscheduled({ task, sourceTask })`
- unscheduled schedule -> `onTaskScheduled({ task, sourceTask })`
- add scheduled/unscheduled task -> `onTaskCreated({ task })`
- single-task delete paths -> `onTaskDeleted({ taskId, taskType })`
- clear flows -> `onTasksCleared({ scope, deletedCount })`

Prefer assertions on payload shape, not just “some coordinator function ran”.

- [ ] **Step 2: Run focused tests to verify failure**

Run:
`npm.cmd test -- --runInBand __tests__/scheduled-task-handlers.test.js __tests__/unscheduled-task-handlers.test.js __tests__/add-task-handler.test.js __tests__/clear-tasks-handler.test.js`

Expected:
- FAIL on old coordinator call names or old payload shapes

- [ ] **Step 3: Implement scheduled-task handler mapping**

In `public/js/tasks/scheduled-handlers.js`:
- change imports to the new coordinator event names
- capture `previousTask` before an edit or unschedule mutation when needed
- call semantic coordinator functions on success only
- keep local `refreshUI()` only for UI-only state changes or failure cleanup

- [ ] **Step 4: Implement unscheduled/add/clear handler mapping**

In `public/js/tasks/unscheduled-handlers.js`, `public/js/tasks/add-handler.js`, and `public/js/tasks/clear-handler.js`:
- switch to the new coordinator imports
- report semantic payloads, not primitive ids alone
- include `deletedCount` in clear payloads when the manager result already exposes it
- if a count is not currently available, add the smallest manager plumbing needed later in this task rather than faking it in handlers

- [ ] **Step 5: Re-run focused tests**

Run:
`npm.cmd test -- --runInBand __tests__/scheduled-task-handlers.test.js __tests__/unscheduled-task-handlers.test.js __tests__/add-task-handler.test.js __tests__/clear-tasks-handler.test.js`

Expected:
- PASS

- [ ] **Step 6: Run broader app coverage**

Run:
`npm.cmd test -- --runInBand __tests__/app.test.js __tests__/integration.test.js`

Expected:
- PASS

- [ ] **Step 7: Commit**

```bash
git add public/js/tasks/scheduled-handlers.js public/js/tasks/unscheduled-handlers.js public/js/tasks/add-handler.js public/js/tasks/clear-handler.js __tests__/scheduled-task-handlers.test.js __tests__/unscheduled-task-handlers.test.js __tests__/add-task-handler.test.js __tests__/clear-tasks-handler.test.js __tests__/app.test.js __tests__/integration.test.js
git commit -m "refactor: report semantic task events to coordinator"
```

---

### Task 3: Make Payloads Carry Real Meaning

**Files:**
- Modify: `public/js/app-coordinator.js`
- Modify: `public/js/tasks/manager.js` (only if additional result metadata is truly needed)
- Test: `__tests__/app-coordinator.test.js`
- Test: `__tests__/task-management.test.js` (only if manager return values change)

- [ ] **Step 1: Identify payload fields that still exist only for ceremony**

Audit the new coordinator payloads.

Each field must justify itself:
- `task` -> needed for refresh/confetti/type-sensitive logic
- `previousTask` -> needed only if edit vs schedule vs unschedule semantics actually compare old/new state
- `taskType` on delete -> needed only if current or near-term behavior branches on it
- `deletedCount` on clear -> needed only if current or near-term behavior uses it

Remove fields that remain decorative.

- [ ] **Step 2: Write failing tests for the final payload contract**

Add or tighten tests so they assert:
- completion uses `task.type` for confetti behavior
- schedule/unschedule/edit events accept only the fields the coordinator actually reads
- no exported coordinator function requires a field that handlers must invent manually

If manager results need one extra field to support a real payload, add a targeted failing manager contract test first in `__tests__/task-management.test.js`.

- [ ] **Step 3: Run focused tests to verify failure**

Run:
`npm.cmd test -- --runInBand __tests__/app-coordinator.test.js __tests__/task-management.test.js`

Expected:
- FAIL on the tightened payload expectations if contract cleanup is still incomplete

- [ ] **Step 4: Implement the payload cleanup**

Recommended constraints:
- prefer `task` and `sourceTask` objects over ad hoc scalar reconstruction
- do not add broad new manager return fields unless a handler cannot otherwise produce a truthful payload
- keep the coordinator focused on current effects, not speculative future fields

- [ ] **Step 5: Re-run focused tests**

Run:
`npm.cmd test -- --runInBand __tests__/app-coordinator.test.js __tests__/task-management.test.js`

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git add public/js/app-coordinator.js public/js/tasks/manager.js __tests__/app-coordinator.test.js __tests__/task-management.test.js
git commit -m "refactor: tighten coordinator payload contracts"
```

---

### Task 4: Prove the Boundary with Integration Tests

**Files:**
- Modify: `__tests__/app.test.js`
- Modify: `__tests__/integration.test.js`

- [ ] **Step 1: Add failing integration assertions for the boundary**

Add tests that prove:
- a successful scheduled completion flows through the coordinator and still triggers confetti
- a successful clear-schedule flow flows through the coordinator and still refreshes the UI correctly
- a successful unschedule/schedule flow uses the semantic coordinator path, not a leftover local `refreshUI()` shortcut

Prefer black-box outcomes plus coordinator spies where needed.

- [ ] **Step 2: Run focused integration coverage to verify failure**

Run:
`npm.cmd test -- --runInBand __tests__/app.test.js __tests__/integration.test.js`

Expected:
- FAIL until the integration tests align with the new event surface

- [ ] **Step 3: Implement any missing wiring fixes**

If the new tests reveal leftover direct orchestration:
- fix the handler/coordinator wiring
- do not broaden scope into Activities, settings, or day-rollover logic

- [ ] **Step 4: Re-run focused integration coverage**

Run:
`npm.cmd test -- --runInBand __tests__/app.test.js __tests__/integration.test.js`

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add __tests__/app.test.js __tests__/integration.test.js public/js/app-coordinator.js public/js/tasks/scheduled-handlers.js public/js/tasks/unscheduled-handlers.js public/js/tasks/add-handler.js public/js/tasks/clear-handler.js
git commit -m "test: lock in coordinator integration boundaries"
```

---

### Task 5: Align Docs with the Hardened Coordinator Boundary

**Files:**
- Modify: `docs/plans/2026-03-16-fortudo-activities-design.md`
- Optionally modify: `docs/ARCHITECTURE-ASSESSMENT.md`
- Optionally modify: `README.md`

- [ ] **Step 1: Update the design doc to match the actual pre-Activities boundary**

In `docs/plans/2026-03-16-fortudo-activities-design.md`:
- keep the broader Activities vision
- update coordinator examples so they describe the semantic event surface that now exists
- note that day-rollover behavior remains future work even though the placeholder hook was removed

- [ ] **Step 2: Update architecture notes only if they are stale**

If `docs/ARCHITECTURE-ASSESSMENT.md` still implies scattered post-action logic in a way that is no longer accurate, tighten the wording. Do not rewrite the whole assessment.

- [ ] **Step 3: Run doc formatting and repo checks**

Run:
`npm.cmd run check`

Expected:
- PASS

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-03-16-fortudo-activities-design.md docs/ARCHITECTURE-ASSESSMENT.md README.md
git commit -m "docs: align coordinator architecture guidance"
```

---

## Recommended Execution Order

1. Task 1 first
2. Task 2 second
3. Task 3 third
4. Task 4 fourth
5. Task 5 last

Rationale:
- first define the target boundary
- then move handlers to it
- then tighten payloads once the new event surface is real
- then prove the boundary at integration level
- finally align docs to the actual architecture

## Notes for the Implementer

- This plan is intentionally pre-Activities. Do not start auto-logging, categories, settings, or day-rollover mutation work here.
- Do not reintroduce a placeholder `onDayChanged()` hook.
- Keep local UI-only refreshes local. The coordinator is for state-mutation side effects, not every render.
- If moving success toasts into the coordinator feels attractive, stop and justify it with current behavior. This phase is about semantic boundaries first, not broad UX rewrites.
- Prefer deleting stale generic APIs over keeping compatibility aliases unless a test or import migration truly requires a temporary bridge.
