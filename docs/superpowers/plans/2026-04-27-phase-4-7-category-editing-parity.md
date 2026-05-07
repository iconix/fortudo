# Phase 4.7 Category Editing Parity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add category editing to scheduled and unscheduled task edit forms while preserving existing task edit behavior.

**Architecture:** Keep each edit form owned by its current feature module. Extract only the stable taxonomy form seams into focused helpers: option rendering/population, category validation, and per-select color-dot synchronization. Scheduled and unscheduled save paths carry `category` through their existing manager updates.

**Tech Stack:** Vanilla JavaScript ES modules, Jest/jsdom tests, PouchDB-backed task state, existing taxonomy selector modules.

---

### Task 1: Shared Category Form Helpers

**Files:**
- Modify: `public/js/tasks/form-utils.js`
- Test: `__tests__/form-utils.test.js`

- [ ] Add tests for reusable category option HTML, select population, validation, and dot sync against the current taxonomy fixtures.
- [ ] Run `npx.cmd jest __tests__/form-utils.test.js --runInBand` and verify the new tests fail before implementation.
- [ ] Add focused helpers in `public/js/tasks/form-utils.js`: `renderCategoryOptionsHtml`, `populateCategorySelect`, `validateCategoryKey`, and `syncCategoryColorDot`.
- [ ] Keep existing `populateCategoryDropdown` and `initializeCategoryDropdownListener` behavior by delegating to the new helpers.
- [ ] Re-run `npx.cmd jest __tests__/form-utils.test.js --runInBand` and verify it passes.

### Task 2: Scheduled Task Category Editing

**Files:**
- Modify: `public/js/tasks/scheduled-renderer.js`
- Modify: `public/js/tasks/scheduled-handlers.js`
- Modify: `public/js/tasks/manager.js`
- Modify: `public/js/tasks/form-utils.js`
- Test: `__tests__/task-management.test.js`
- Test: `__tests__/dom-interaction.test.js`

- [ ] Add failing tests proving scheduled edit forms render the current category, save a changed category, reject stale category keys, and still surface overlap/reschedule UI when category is edited.
- [ ] Run targeted scheduled tests and verify the new assertions fail.
- [ ] Add a category select and colored dot to `renderEditTaskHTML`.
- [ ] Update scheduled edit form extraction so the selected category is included and stale category keys are rejected with the existing task-themed alert.
- [ ] Update `updateTask` and confirmation paths so scheduled task category persists through normal saves and overlap-confirmed saves.
- [ ] Wire category-dot sync for scheduled edit forms after render.
- [ ] Re-run targeted scheduled tests and verify they pass.

### Task 3: Unscheduled Task Category Editing

**Files:**
- Modify: `public/js/tasks/unscheduled-renderer.js`
- Modify: `public/js/tasks/form-utils.js`
- Modify: `public/js/tasks/manager.js`
- Test: `__tests__/unscheduled-task-renderer.test.js`
- Test: `__tests__/unscheduled-task-handlers.test.js`

- [ ] Add failing tests proving unscheduled edit forms render the current category, save a changed category, reject stale category keys, and preserve completed/in-progress timer behavior.
- [ ] Add a regression test proving "start timer from task" uses the edited unscheduled category.
- [ ] Run targeted unscheduled tests and verify the new assertions fail.
- [ ] Add a category select and colored dot to the unscheduled inline edit form.
- [ ] Populate and extract category in unscheduled inline edit form helpers.
- [ ] Update `updateUnscheduledTask` so category persists.
- [ ] Wire category-dot sync for unscheduled edit forms after render/toggle.
- [ ] Re-run targeted unscheduled tests and verify they pass.

### Task 4: Activity Helper Migration And Regression

**Files:**
- Modify: `public/js/activities/renderer.js`
- Modify: `public/js/activities/ui-handlers.js`
- Test: `__tests__/activity-renderer.test.js`
- Test: `__tests__/activity-handlers.test.js`

- [ ] If mechanical, migrate activity inline category option rendering/dot sync to the shared helper.
- [ ] Add or preserve regression tests proving activity category editing behavior is unchanged.
- [ ] Run activity tests and verify they pass.

### Task 5: Final Verification

**Files:**
- Modify: `docs/plans/2026-03-16-fortudo-activities-design.md`
- Create: `docs/superpowers/plans/2026-04-27-phase-4-7-category-editing-parity.md`

- [ ] Run `npm.cmd run check`.
- [ ] Run `npm.cmd test`.
- [ ] Run `npx.cmd prettier --check docs\plans\2026-03-16-fortudo-activities-design.md docs\superpowers\plans\2026-04-27-phase-4-7-category-editing-parity.md`.
- [ ] Review `git diff` to ensure only Phase 4.7-related code/docs changed.
