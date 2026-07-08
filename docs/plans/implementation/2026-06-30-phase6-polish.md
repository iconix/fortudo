# Phase 6: Polish, E2E, and Mobile Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Fortudo Phase 6 polish: reduced-motion accessibility, subtle UI
transitions, mobile Insights adaptation, first-run guidance, expanded E2E coverage, and
small documentation cleanup.

**Architecture:** Four independently shippable sub-phases. Keep behavior in focused
vanilla ES modules, keep `public/js/app.js` orchestration-only, preserve the no-build
Firebase Hosting setup, and avoid PouchDB data model changes beyond preserving a new
field on the existing room settings config doc.

**Tech Stack:** Vanilla JavaScript ES modules, PouchDB config docs, Tailwind utility
classes, Jest/jsdom, Playwright Python E2E on `http://127.0.0.1:9847`, Firebase Hosting.

---

## Source of Truth

Read these before implementation:

- `AGENTS.md`
- `CLAUDE.md`
- `docs/plans/implementation/2026-06-30-phase6-polish.md`
- `docs/plans/design/2026-06-30-fortudo-phase6-polish.md`

The design doc confirms these items are already done or explicitly cut:

- Day-focused Insights: selected date, trend day cards, focused timeline viewport, block
  click-to-select, and day-scoped Activity Log
- Activity accent color
- Tab toggle between Tasks and Insights
- Escape for settings modal
- Timer debug snapshot seam and server-clock offset
- Session-scoped lifecycle with abortable room sessions
- Cut: `1`/`2`/`3` form-mode shortcuts and keyboard shortcut registry
- Cut: Chart.js; hand-rolled visuals are sufficient

Do not re-implement closed items.

## Global Constraints

- Use strict TDD for behavioral changes: failing test, implementation, passing test.
- Run `npm test -- --coverage` and `npm run check` before each task commit.
- Do not use `--no-verify`.
- Keep commits scoped: one commit per task.
- Do not push, merge, label, close issues, or post public comments.
- Existing local user changes may be present. Do not revert or stage unrelated files.
- E2E tests expect the app on `http://127.0.0.1:9847`.
- Prefer branch/worktree isolation for each sub-phase:
  - `phase6a-transitions`
  - `phase6b-mobile`
  - `phase6c-onboarding`
  - `phase6d-e2e`

## File Structure

### Sub-phase 6A: Transitions

- Modify: `public/css/custom.css`
  - `prefers-reduced-motion` block
  - view panel transition classes
  - action menu transition classes
  - timeline block selection transition
  - settings reload prompt transition
- Modify: `public/js/activities/view-toggle.js`
  - use `view-panel--visible`/`view-panel--hidden` classes instead of view-level
    `hidden` toggling
- Modify: `public/js/dom-renderer.js`
  - add action menu open/closed classes while preserving the native `hidden` property
    for accessibility and existing tests unless a delayed close animation is explicitly
    implemented
- Modify: `public/js/settings-renderer.js`
  - add reload prompt transition class when the prompt appears
- Modify: `public/js/activities/insights-renderer.js`
  - add selected timeline block styling hook/class
- Test: `__tests__/activity-view-toggle.test.js`
- Test: `__tests__/dom-interaction.test.js`
- Test: `__tests__/settings-renderer.test.js`
- Test: `__tests__/activity-insights-renderer.test.js`
- Test: add or update a CSS content test, preferably `__tests__/custom-css.test.js`

### Sub-phase 6B: Mobile Insights

- Modify: `public/js/activities/insights-renderer.js`
  - touch target height for timeline blocks
  - row height for taller touch targets
  - responsive timeline tick labels
  - narrow-block readable label behavior if needed
- Test: `__tests__/activity-insights-renderer.test.js`
- Test: add a Playwright mobile overflow check in `test_phase6_e2e.py` or a focused
  E2E file if 6D has not started yet

### Sub-phase 6C: Guidance and Modal Escape

- Create: `public/js/whats-new.js`
  - one-time browser-local Activities announcement
- Create: `public/js/activities/onboarding.js`
  - 3-step room-scoped onboarding walkthrough
- Modify: `public/js/modal-manager.js`
  - Escape handling for alert and confirm modals with listener cleanup
- Modify: `public/js/settings-manager.js`
  - preserve `onboardingDismissed` on the existing `config-settings` doc
  - expose helper functions if needed, such as `isOnboardingDismissed()` and
    `setOnboardingDismissed()`
- Modify: `public/js/app.js`
  - minimal orchestration: call whats-new and onboarding after settings/state are loaded
- Test: `__tests__/whats-new.test.js`
- Test: `__tests__/activity-onboarding.test.js`
- Test: `__tests__/modal-manager.test.js`
- Test: `__tests__/settings-manager.test.js`

### Sub-phase 6D: E2E and Docs

- Create: `test_phase6_e2e.py`
- Modify: `test_run_all.py`
- Modify: `public/js/app-lifecycle.js`
  - add module/function JSDoc if unclear
- Review: `public/js/app-coordinator.js`
  - only edit JSDoc if the existing coordinator boundary is unclear

Do not change `activities/app-wiring.js` for the naming review unless later code changes
make its responsibilities unclear.

---

## Task 1: Reduced Motion and Transition Foundations

**Branch:** `phase6a-transitions`

**Files:**

- Modify: `public/css/custom.css`
- Modify: `public/js/activities/view-toggle.js`
- Modify: `public/js/dom-renderer.js`
- Modify: `public/js/settings-renderer.js`
- Modify: `public/js/activities/insights-renderer.js`
- Test: `__tests__/custom-css.test.js`
- Test: `__tests__/activity-view-toggle.test.js`
- Test: `__tests__/dom-interaction.test.js`
- Test: `__tests__/settings-renderer.test.js`
- Test: `__tests__/activity-insights-renderer.test.js`

- [ ] **Step 1: Create or update the CSS content test**

Add `__tests__/custom-css.test.js` if it does not exist. The test should read
`public/css/custom.css` and assert that it contains:

- `@media (prefers-reduced-motion: reduce)`
- `.view-panel`
- `.action-menu-content`
- `[data-timeline-block-id]`
- `.settings-reload-prompt`

Run:

```bash
npm test -- --runInBand __tests__/custom-css.test.js
```

Expected: FAIL until the CSS is added.

- [ ] **Step 2: Update view toggle tests for transition classes**

In `__tests__/activity-view-toggle.test.js`, update tests that assert `hidden` on
`#tasks-view` and `#insights-view`. They should now assert:

- active panel has `view-panel--visible`
- inactive panel has `view-panel--hidden`
- both panels do not retain the `hidden` class after sync
- `#view-toggle` itself still uses `hidden` when Activities is disabled

Run:

```bash
npm test -- --runInBand __tests__/activity-view-toggle.test.js
```

Expected: FAIL until `view-toggle.js` is updated.

- [ ] **Step 3: Add transition CSS**

In `public/css/custom.css`, add transition classes before the reduced-motion block:

```css
.view-panel {
  transition: opacity 150ms ease;
}

.view-panel--hidden {
  opacity: 0;
  visibility: hidden;
  position: absolute;
  pointer-events: none;
}

.view-panel--visible {
  opacity: 1;
  visibility: visible;
  position: static;
  pointer-events: auto;
}

.action-menu-content {
  transition:
    opacity 100ms ease,
    transform 100ms ease;
  transform-origin: top right;
}

.action-menu-content--closed {
  opacity: 0;
  transform: scale(0.95);
  pointer-events: none;
}

.action-menu-content--open {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}

[data-timeline-block-id] {
  transition:
    outline-offset 100ms ease,
    box-shadow 100ms ease;
}

.settings-reload-prompt {
  opacity: 0;
  transition: opacity 150ms ease;
}

.settings-reload-prompt--visible {
  opacity: 1;
}
```

Then add a reduced-motion block that disables existing `task-card`, pulse, priority badge,
celebration emoji, view panel, action menu, timeline block, and settings prompt motion.
Include a final universal guard:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- [ ] **Step 4: Update `syncActivitiesViewToggle()`**

In `public/js/activities/view-toggle.js`, replace direct `hidden` toggling on
`tasksView` and `insightsView` with `view-panel--visible` and `view-panel--hidden`. Do
not remove `hidden` behavior from the main `#view-toggle` control.

Keep behavior unchanged:

- Activities disabled forces `activeView = 'tasks'`
- switching to Insights renders Insights
- task clear controls are hidden in Insights
- clear dropdown closes when task actions are hidden

- [ ] **Step 5: Add action menu classes without breaking `hidden`**

In `public/js/dom-renderer.js`, when opening scheduled and unscheduled action menus:

- remove `action-menu-content--closed`
- add `action-menu-content` and `action-menu-content--open`
- set `menu.hidden = false`

When closing:

- remove `action-menu-content--open`
- add `action-menu-content` and `action-menu-content--closed`
- keep `menu.hidden = true`

Update `__tests__/dom-interaction.test.js` to assert the open/closed classes while
preserving existing `hidden` assertions.

- [ ] **Step 6: Add settings prompt transition hook**

In `public/js/settings-renderer.js`, render `#reload-prompt` with
`settings-reload-prompt`. When showing it, remove `hidden` and add
`settings-reload-prompt--visible`.

Update `__tests__/settings-renderer.test.js` to assert the visible class after toggling
Activities.

- [ ] **Step 7: Add selected timeline block transition styling**

In `public/js/activities/insights-renderer.js`, add a selected-state class or data
attribute to the block whose id matches `selectedTimelineBlockId`. The visual treatment
should be subtle, such as an outline or shadow. Do not change click-to-select behavior.

Update `__tests__/activity-insights-renderer.test.js` to assert the selected block gets
the selected styling hook after `setSelectedTimelineBlock()`.

- [ ] **Step 8: Run focused tests**

```bash
npm test -- --runInBand __tests__/custom-css.test.js __tests__/activity-view-toggle.test.js __tests__/dom-interaction.test.js __tests__/settings-renderer.test.js __tests__/activity-insights-renderer.test.js
```

Expected: PASS.

- [ ] **Step 9: Run full validation**

```bash
npm test -- --coverage
npm run check
```

Expected: PASS with coverage thresholds met.

- [ ] **Step 10: Commit**

```bash
git add public/css/custom.css public/js/activities/view-toggle.js public/js/dom-renderer.js public/js/settings-renderer.js public/js/activities/insights-renderer.js __tests__/custom-css.test.js __tests__/activity-view-toggle.test.js __tests__/dom-interaction.test.js __tests__/settings-renderer.test.js __tests__/activity-insights-renderer.test.js
git commit -m "Add reduced motion and transition polish"
```

---

## Task 2: Mobile Insights Adaptation

**Branch:** `phase6b-mobile`

**Files:**

- Modify: `public/js/activities/insights-renderer.js`
- Test: `__tests__/activity-insights-renderer.test.js`
- Test: `test_phase6_e2e.py` if it exists, otherwise create it with only the mobile
  overflow test and let Task 6 expand it

- [ ] **Step 1: Write failing touch target tests**

In `__tests__/activity-insights-renderer.test.js`, add tests that render a scheduled
timeline block and assert:

- block class contains `min-h-[44px]`
- row container class contains `min-h-[3.5rem]`
- midpoint tick has `hidden` and `sm:block`

Do not add a failing `flex-wrap` test for selected detail; that is already implemented.

Run:

```bash
npm test -- --runInBand __tests__/activity-insights-renderer.test.js -t "touch target|row container|midpoint"
```

Expected: FAIL until renderer classes are updated.

- [ ] **Step 2: Update timeline markup**

In `public/js/activities/insights-renderer.js`:

- change timeline blocks from `h-9 leading-9` to `min-h-[44px] leading-[44px]`
- change timeline row container from `h-12` to `min-h-[3.5rem]`
- hide the midpoint tick on narrow screens with `hidden text-center sm:block`
- place the end tick in column 3 with `col-start-3 text-right`

If manual mobile review shows narrow labels are unreadable, add a small below-row label
summary for compact blocks at narrow widths. Keep this scoped to rendering; do not add new
state.

- [ ] **Step 3: Add or update mobile E2E overflow check**

Add a Playwright test using viewport `{ "width": 375, "height": 812 }` that enables
Activities, opens Insights, and verifies the document does not horizontally overflow:

```python
overflow = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
assert overflow is False
```

If `test_phase6_e2e.py` does not exist yet, create it with just this test and shared
helpers. Task 6 will expand the file.

- [ ] **Step 4: Run focused tests**

```bash
npm test -- --runInBand __tests__/activity-insights-renderer.test.js
python -m pytest test_phase6_e2e.py -k mobile -v
```

Expected: PASS. For the E2E command, serve the app on port 9847 first if not using the
test runner.

- [ ] **Step 5: Manually verify mobile widths**

Serve the app:

```bash
python -m http.server 9847 --directory public
```

Manually verify Insights at:

- 375px width
- 768px width

Check for horizontal overflow, overlapping tick labels, readable selected block detail,
and tappable activity log controls.

- [ ] **Step 6: Run full validation**

```bash
npm test -- --coverage
npm run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/js/activities/insights-renderer.js __tests__/activity-insights-renderer.test.js test_phase6_e2e.py
git commit -m "Adapt insights timeline for mobile"
```

---

## Task 3: Escape Key for Alert and Confirm Modals

**Branch:** `phase6c-onboarding`

**Files:**

- Modify: `public/js/modal-manager.js`
- Test: `__tests__/modal-manager.test.js`

- [ ] **Step 1: Write failing Escape tests**

In `__tests__/modal-manager.test.js`, add tests for:

- Escape closes visible alert modal
- Escape closes visible confirm modal and resolves `false`
- OK/cancel/close still resolve once after Escape listener cleanup
- dispatching Escape when no custom alert or confirm is visible does not throw

Run:

```bash
npm test -- --runInBand __tests__/modal-manager.test.js -t "Escape"
```

Expected: FAIL.

- [ ] **Step 2: Implement cleanup-safe Escape handling**

In `public/js/modal-manager.js`, implement modal-local cleanup functions:

- alert Escape calls the same close behavior as OK/close
- confirm Escape calls the cancel behavior and resolves `false`
- every close path removes its own keydown listener
- repeated close paths do not resolve the confirm promise more than once

Prefer a small internal helper over duplicated inline listener cleanup.

- [ ] **Step 3: Run focused and full validation**

```bash
npm test -- --runInBand __tests__/modal-manager.test.js
npm test -- --coverage
npm run check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add public/js/modal-manager.js __tests__/modal-manager.test.js
git commit -m "Add Escape handling for custom modals"
```

---

## Task 4: One-Time What's New Modal

**Branch:** `phase6c-onboarding`

**Files:**

- Create: `public/js/whats-new.js`
- Modify: `public/js/app.js`
- Test: `__tests__/whats-new.test.js`

- [ ] **Step 1: Write failing tests**

Create `__tests__/whats-new.test.js` with tests for:

- does nothing when Activities is disabled
- shows `showCustomAlert` when Activities is enabled and
  `fortudo-whats-new-activities-v1` is absent
- does not show when the key is present
- sets `localStorage` only after the modal is dismissed

Because `showCustomAlert()` currently does not return a promise, implement the module so
tests can inject alert behavior:

```js
maybeShowWhatsNew({
  activitiesEnabled: true,
  showAlert: async () => {}
});
```

Run:

```bash
npm test -- --runInBand __tests__/whats-new.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement `whats-new.js`**

Create `public/js/whats-new.js`:

- export `WHATS_NEW_KEY`
- export `maybeShowWhatsNew({ activitiesEnabled, showAlert } = {})`
- default `showAlert` should call `showCustomAlert("What's New in Fortudo", message, 'sky')`
- mark localStorage as dismissed after the alert completes or after the injected alert
  returns

If `showCustomAlert()` remains synchronous, the production path may set the key
immediately after calling it. Tests should still cover dismiss timing through the injected
async `showAlert` seam.

- [ ] **Step 3: Wire into `app.js`**

In `public/js/app.js`, import `maybeShowWhatsNew` and call it after `loadSettings()` and
`syncActivitiesUI(isActivitiesEnabled())`, but before onboarding.

Keep this as a one-line orchestration call:

```js
void maybeShowWhatsNew({ activitiesEnabled: isActivitiesEnabled() });
```

- [ ] **Step 4: Run validation and commit**

```bash
npm test -- --runInBand __tests__/whats-new.test.js
npm test -- --coverage
npm run check
git add public/js/whats-new.js public/js/app.js __tests__/whats-new.test.js
git commit -m "Add one-time Activities whats new modal"
```

Expected: PASS before commit.

---

## Task 5: Room-Scoped Activity Onboarding

**Branch:** `phase6c-onboarding`

**Files:**

- Create: `public/js/activities/onboarding.js`
- Modify: `public/js/settings-manager.js`
- Modify: `public/js/app.js`
- Test: `__tests__/activity-onboarding.test.js`
- Test: `__tests__/settings-manager.test.js`

- [ ] **Step 1: Write failing settings-manager tests**

In `__tests__/settings-manager.test.js`, add tests proving:

- `loadSettings()` preserves `onboardingDismissed` from `config-settings`
- `setActivitiesEnabled()` preserves existing `onboardingDismissed`
- `setOnboardingDismissed(true)` writes to `config-settings`
- `isOnboardingDismissed()` reflects loaded/persisted state

Run:

```bash
npm test -- --runInBand __tests__/settings-manager.test.js -t "onboarding"
```

Expected: FAIL.

- [ ] **Step 2: Update `settings-manager.js`**

Keep `SETTINGS_CONFIG_ID = 'config-settings'`. Add cached onboarding state and helpers:

- `isOnboardingDismissed()`
- `setOnboardingDismissed(dismissed)`

Update `loadSettings()` and `setActivitiesEnabled()` so writes preserve both:

- `activitiesEnabled`
- `onboardingDismissed`

Do not introduce a separate onboarding config document.

- [ ] **Step 3: Write failing onboarding tooltip tests**

Create `__tests__/activity-onboarding.test.js` with tests for:

- no tooltip when Activities is disabled
- no tooltip when `isOnboardingDismissed()` is true
- first step appears near the task type toggle
- Next advances through timer and Insights steps
- Done dismisses and calls `setOnboardingDismissed(true)`
- X dismisses immediately and calls `setOnboardingDismissed(true)`
- abort signal removes the tooltip without persisting dismissal

Mock `settings-manager.js` rather than `storage.js`.

Run:

```bash
npm test -- --runInBand __tests__/activity-onboarding.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement `activities/onboarding.js`**

Create `public/js/activities/onboarding.js`:

- export `maybeShowOnboarding({ activitiesEnabled, signal } = {})`
- use `isOnboardingDismissed()` and `setOnboardingDismissed(true)`
- render one `[data-onboarding-tooltip]` at a time
- steps target:
  - task type toggle container, falling back to `#activity-toggle-option`
  - `#timer-display`
  - `#view-toggle`
- support Next, Done, X, and abort cleanup
- use fixed positioning and clamp left/top so the tooltip remains in viewport

- [ ] **Step 5: Wire into `app.js`**

Import `maybeShowOnboarding` and call after `maybeShowWhatsNew()`:

```js
void maybeShowOnboarding({
  activitiesEnabled: isActivitiesEnabled(),
  signal
});
```

Keep `app.js` orchestration-only.

- [ ] **Step 6: Run validation and commit**

```bash
npm test -- --runInBand __tests__/settings-manager.test.js __tests__/activity-onboarding.test.js
npm test -- --coverage
npm run check
git add public/js/activities/onboarding.js public/js/settings-manager.js public/js/app.js __tests__/activity-onboarding.test.js __tests__/settings-manager.test.js
git commit -m "Add room-scoped Activities onboarding"
```

Expected: PASS before commit.

---

## Task 6: Phase 6 E2E Coverage

**Branch:** `phase6d-e2e`

**Files:**

- Create or modify: `test_phase6_e2e.py`
- Modify: `test_run_all.py`

- [ ] **Step 1: Inspect existing E2E helpers and selectors**

Read:

- `scripts/playwright_preview_smoke.py`
- `test_ui_interaction.py`
- `test_functional.py`
- `public/index.html`

Use live selectors. Current settings trigger is `#settings-gear-btn`, not `#settings-btn`.

- [ ] **Step 2: Add timer reload/restore test**

In `test_phase6_e2e.py`, add a test that:

- enters a unique room
- enables Activities if needed
- switches to Activity mode
- starts a timer with a unique description
- reloads
- verifies `#timer-display` is visible and the description is restored
- verifies elapsed time is non-zero

Run:

```bash
python -m pytest test_phase6_e2e.py -k timer_reload -v
```

Expected: PASS with app served on port 9847.

- [ ] **Step 3: Add settings toggle reload-return tests**

Add tests that:

- enable Activities, reload, verify Activity UI is visible
- disable Activities, reload, verify Activity UI is hidden

Use `#settings-gear-btn` and `#activities-toggle`.

Run:

```bash
python -m pytest test_phase6_e2e.py -k settings -v
```

Expected: PASS.

- [ ] **Step 4: Add selected-day Insights scoping test**

Seed activities for two days. Open Insights, click a non-today `[data-trend-day]`, and
verify:

- selected-day context changes
- summary reflects the selected day
- timeline blocks reflect the selected day
- Activity Log reflects the selected day only

Use `.first()` for Playwright locators, not `.first`.

Run:

```bash
python -m pytest test_phase6_e2e.py -k selected_day -v
```

Expected: PASS.

- [ ] **Step 5: Add task action menu E2E**

Add stable coverage for:

- scheduled task action menu opens
- Do now updates the scheduled task start time
- unscheduled task action menu opens
- Start timer starts a timer with the unscheduled task description

Only add edit and lock/unlock if selectors and existing tests make them stable without
large setup.

Run:

```bash
python -m pytest test_phase6_e2e.py -k action_menu -v
```

Expected: PASS.

- [ ] **Step 6: Add guarded multi-tab timer sync test**

Add this only if the E2E environment has CouchDB relay/sync available. If not available,
use `pytest.skip("CouchDB relay not configured for multi-tab sync")`.

The test should:

- open two pages for the same room
- start timer in page A
- verify timer appears in page B after sync
- stop in page B
- verify page A reflects stopped state

Run:

```bash
python -m pytest test_phase6_e2e.py -k multi_tab -v
```

Expected: PASS or SKIP with explicit reason.

- [ ] **Step 7: Ensure mobile overflow test is present**

If Task 2 created the mobile test, keep it. Otherwise add it here.

Run:

```bash
python -m pytest test_phase6_e2e.py -k mobile -v
```

Expected: PASS.

- [ ] **Step 8: Add to aggregate runner**

Add `"test_phase6_e2e.py"` to `scripts` in `test_run_all.py`.

- [ ] **Step 9: Run validation and commit**

```bash
python -m pytest test_phase6_e2e.py -v
npm run test:e2e
npm test -- --coverage
npm run check
git add test_phase6_e2e.py test_run_all.py
git commit -m "Add Phase 6 end-to-end coverage"
```

Expected: PASS, with multi-tab sync allowed to SKIP only when CouchDB relay is absent.

---

## Task 7: Module JSDoc Review and Final Verification

**Branch:** `phase6d-e2e`

**Files:**

- Modify if needed: `public/js/app-lifecycle.js`
- Modify if needed: `public/js/app-coordinator.js`

- [ ] **Step 1: Review module boundaries**

Review:

- `public/js/app-lifecycle.js`
- `public/js/app-coordinator.js`

Expected responsibility split:

- `app-lifecycle.js`: room/session lifecycle, sync refreshes, focus/visibility refresh,
  active task color loop, day-boundary running timer handling
- `app-coordinator.js`: semantic post-mutation side effects after task/activity changes,
  including refreshes, auto activity logging, timer overlap handling, confetti, and toasts

- [ ] **Step 2: Add JSDoc only if useful**

If `app-lifecycle.js` lacks clear module/function documentation, add a file-level JSDoc
and public function JSDoc for `createRoomSessionLifecycle()`.

Only edit `app-coordinator.js` if its existing JSDoc is insufficient.

- [ ] **Step 3: Run final validation**

```bash
npm test -- --coverage
npm run check
npm run test:e2e
```

Expected: PASS with coverage thresholds met and E2E passing/skipping only guarded
CouchDB-specific multi-tab sync.

- [ ] **Step 4: Commit if docs changed**

```bash
git add public/js/app-lifecycle.js public/js/app-coordinator.js
git commit -m "Clarify app lifecycle and coordinator module docs"
```

Skip commit if no files changed.

---

## Final Manual Verification

Before marking Phase 6 complete:

- Verify reduced-motion behavior with OS/browser reduced-motion enabled.
- Verify normal transitions with reduced-motion disabled.
- Verify mobile Insights at 375px and 768px.
- Verify Escape closes alert and confirm modals.
- Verify What's New appears once per browser and does not reappear after dismissal.
- Verify onboarding appears once per room after Activities is enabled and does not
  reappear after dismissal.
- Verify no unrelated user files are staged:

```bash
git status --short
```
