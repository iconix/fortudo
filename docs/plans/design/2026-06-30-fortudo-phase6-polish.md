# Phase 6: Polish, E2E Coverage, and Mobile Adaptation

## Pyramid Summary

**~2w:** Final polish phase. Four sub-phases: transitions + reduced-motion accessibility (6A), mobile adaptation (6B), what's-new modal + onboarding tooltips + Esc for modals (6C), E2E expansion + documentation (6D).

**~8w:** Day-focused insights, Tab toggle, do-now action, timer sync fixes, and activity accent color already shipped. Keyboard shortcuts (1/2/3 for form modes, registry) cut as low-value. Chart.js not adopted; hand-rolled visuals are sufficient. Remaining work focuses on accessibility (prefers-reduced-motion), mobile responsiveness for insights, first-run user guidance, and expanding Playwright coverage to close gaps in multi-tab sync, timer restore, action menus, and selected-day scoping.

**~32w:** Phase 6 closes the Fortudo activities feature set. The codebase review found that several Phase 6 items from the original design doc are already implemented: selectedDate model scoping, trend day cards with category segments, focused-viewport timeline with click-to-select blocks, day-scoped activity log, Tab key toggle, Escape for settings, and the cyan/sky accent color. The remaining work splits into four independently shippable sub-phases ordered by dependency: transitions first (foundation for onboarding animations), mobile second (highest visual impact), onboarding/what's-new third (builds on transitions), E2E last (tests the finished state). No new features beyond the original Phase 6 spec. No build step, bundler, or PouchDB data model changes.

---

## Items Closed as Done or Not Needed

| Original Phase 6 Item                                                             | Resolution                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Day-focused insights (selectedDate, day cards, focused viewport, block selection) | Shipped in insights-renderer.js, insights-model.js, insights-trends.js                                                                                                                                                                                                                                                                                |
| Activity accent color                                                             | Settled (cyan/sky palette consistent throughout renderer)                                                                                                                                                                                                                                                                                             |
| Tab for Tasks/Insights toggle                                                     | Shipped in view-toggle.js:85-99                                                                                                                                                                                                                                                                                                                       |
| Esc for settings modal                                                            | Shipped in settings-renderer.js:180                                                                                                                                                                                                                                                                                                                   |
| 1/2/3 form mode keyboard shortcuts                                                | Cut. Low value; trivial to add later if needed                                                                                                                                                                                                                                                                                                        |
| Keyboard shortcut registry                                                        | Cut. Not enough shortcuts to justify a registry module                                                                                                                                                                                                                                                                                                |
| Chart.js adoption                                                                 | Not needed. Hand-rolled visuals (day cards with category segments, focused-viewport timeline, selected block detail row) are purpose-built and sufficient. Chart.js would add ~60KB to a no-build vanilla JS app without providing chart types the app actually needs. Revisit only if trend line charts or comparative weekly analytics enter scope. |

---

## Sub-phase 6A: Transitions and `prefers-reduced-motion`

**Branch:** `phase6a-transitions`

### Reduced motion accessibility

Add a `@media (prefers-reduced-motion: reduce)` block to `public/css/custom.css` targeting all existing keyframe animations:

- `pulse-green`, `pulse-indigo`: set `animation: none`
- `emoji-float-*`, `emoji-float-flex`: set `animation: none`
- All transition properties: set `transition-duration: 0.01ms`

This does not disable animations for users who haven't opted out. It respects the OS-level accessibility preference.

### New CSS transitions

Add transitions for interactions that currently snap without visual feedback:

- **Tab switching (Tasks/Insights):** Opacity fade on `#tasks-view` and `#insights-view` when toggling visibility. Use `opacity` + `transition: opacity 150ms ease` rather than toggling `hidden` class directly (switch to `visibility: hidden; opacity: 0` for the inactive view).
- **Action menu open/close:** `transition: opacity 100ms ease, transform 100ms ease` with `transform: scale(0.95)` on closed state.
- **Timeline block selection:** `transition: outline-offset 100ms ease` or `box-shadow` transition on the selected block.
- **Settings reload prompt:** Fade-in via `opacity` transition when the prompt appears.

All new transitions must be wrapped in the same `prefers-reduced-motion` block.

### Testing

- Jest: verify `custom.css` contains the `prefers-reduced-motion` media query (snapshot or string assertion on the CSS file content is acceptable)
- Manual: verify animations play normally without reduced-motion, verify they're suppressed with reduced-motion enabled in OS settings

---

## Sub-phase 6B: Mobile Adaptation

**Branch:** `phase6b-mobile`

### Current state

- Viewport meta tag is present (`width=device-width, initial-scale=1.0`)
- Trend day strip has `overflow-x-auto` + snap scrolling (done)
- Summary grid has `grid-cols-2 md:grid-cols-4` (done in renderer)
- Timeline, activity log, and selected-day context sections have no responsive breakpoints
- Timeline blocks use click (not hover) for selection, which is already touch-friendly

### Changes

**Timeline blocks:**

- Add `min-h-[44px]` for touch targets (Apple HIG minimum)
- At narrow viewports (<640px), if a block's computed width is below a readable threshold, render the label below the block row rather than inline
- Ensure the selected-block detail row is readable at 375px (may need to stack label/time/duration vertically instead of inline)

**Insights layout at 375px:**

- Selected-day context banner: ensure text doesn't overflow, use `text-sm` or smaller
- Activity log rows: verify padding and action buttons are tappable (44px touch targets)
- Timeline tick labels: ensure they don't overlap at narrow widths; reduce to start/end labels if needed

**Insights layout at 768px:**

- Current layout should work. Verify and fix any overflow issues.
- Trend day strip: 14-day range should be usable without excessive scrolling

**No viewport changes needed for task list sections** -- those already use `sm:` breakpoints extensively.

### Testing

- Manual verification at 375px and 768px viewport widths (Chrome DevTools device toolbar)
- Playwright test with `viewport: { width: 375, height: 812 }` verifying insights elements render without horizontal overflow

---

## Sub-phase 6C: "What's New?" Modal, Onboarding Tooltips, Esc for Modals

**Branch:** `phase6c-onboarding`

### "What's new?" modal

**Trigger:** On room entry, after Activities feature flag is confirmed enabled, check `localStorage.getItem('fortudo-whats-new-activities-v1')`.

**Behavior:**

- If key is absent: show a dismissible modal via `showCustomAlert` with content:
  - Title: "What's New in Fortudo"
  - Body: three bullet points -- Activity Logging ("Track what you actually do alongside your plan"), Live Timer ("Start/stop capture with automatic activity logging"), Insights View ("Plan vs actual timeline with trend day cards")
- On dismiss ("Got it!" button or Escape): `localStorage.setItem('fortudo-whats-new-activities-v1', 'dismissed')`
- If key is present: skip silently

**Design decisions:**

- localStorage, not PouchDB: UI-only concern, not synced. Seeing it once more after clearing localStorage is harmless. PouchDB would sync across devices, which is undesirable -- the prompt should fire once per browser.
- After room entry: the modal references Activities features, so it should appear when the user can see them.
- Versioned key (`v1`): future feature announcements use `v2`, `v3`, etc. without clearing old flags.
- Multiple tabs: each tab checks independently; once one sets the flag, others won't show it on next load.

### Onboarding tooltips

**Trigger:** On first Activities enable in a room. Gated by a PouchDB config doc field: `onboardingDismissed: true` on the room's settings config doc.

**Behavior:**

- 3-step sequential walkthrough:
  1. **Form mode toggle:** "Switch between Scheduled, Unscheduled, and Activity modes here" -- positioned near the radio button group
  2. **Timer section:** "Start a timer to automatically log activities when you stop" -- positioned near the timer display
  3. **Insights tab:** "Switch to Insights to see your plan vs actual timeline" -- positioned near the Tasks/Insights toggle
- Each step is an absolutely-positioned div with: brief description, "Next" button (or "Done" on last step), dismiss X
- Clicking "Next" advances to the next step. Clicking X or "Done" dismisses the entire walkthrough.
- On dismiss: set `onboardingDismissed: true` on the config doc.

**Why PouchDB for onboarding but localStorage for what's-new:** Onboarding is per-room (each room's Activities could be enabled at different times). What's-new is a global app announcement.

### Esc for all modals

Add Escape keydown handling to `showCustomAlert` and `showCustomConfirm` in `modal-manager.js`:

- When a modal is visible, Escape triggers the close/cancel action
- Clean up the listener when the modal closes
- Matches existing pattern in `settings-renderer.js:180`

### Testing

- Jest: mock `localStorage` to verify modal fires when key absent, doesn't fire when present, sets key on dismiss
- Jest: mock PouchDB config doc to verify onboarding tooltip sequence fires on first enable, doesn't fire when `onboardingDismissed` is true
- Jest: verify Escape closes alert and confirm modals
- E2E: load app, verify what's-new modal appears, dismiss, reload, verify it doesn't reappear

---

## Sub-phase 6D: E2E Expansion and Documentation

**Branch:** `phase6d-e2e`

### New Playwright E2E tests

Model after existing smoke script patterns (`scripts/playwright_preview_smoke.py`): use `seed_docs`, `wait_for_*` utilities, `build_relative_day_*` builders, `enter_room`.

**Test scenarios:**

1. **Multi-tab timer sync:** Open two pages with the same room code. Start a timer in page A. Verify the timer UI appears in page B after CouchDB sync relay propagates the `config-running-activity` doc. Stop in page B, verify page A reflects the stop.

2. **Timer reload/restore:** Start a timer. Record the start time. Reload the page. Verify the timer display reappears with the correct description and a non-zero elapsed time consistent with the original start.

3. **Settings toggle reload-return:** Enable Activities via the settings toggle. Reload. Verify Activities UI elements are visible (activity form mode radio, timer section, activity list). Disable Activities. Reload. Verify Activities UI elements are hidden.

4. **Task action menus:** For a scheduled task: open the action menu, click "Do now" (reschedule to current time), verify the task's start time updates. For an unscheduled task: open the action menu, click "Start timer", verify the timer starts with the task's description. Test edit and lock/unlock actions.

5. **Selected-day Insights scoping:** Seed activities for two different dates. Navigate to Insights. Click a non-today trend day card. Verify the summary stats, timeline blocks, and activity log update to show only that day's data.

### Module naming review

Review JSDoc on:

- `app-lifecycle.js`: should clearly describe ownership of room/session lifecycle, midnight boundary checks, and day-boundary timers
- `app-coordinator.js`: should clearly describe ownership of post-mutation side effects (refresh UI, sync, etc.)

Add or update JSDoc if the distinction is unclear. No functional changes or renames unless the review surfaces genuine confusion.

### Chart.js decision record

Already documented in the "Items Closed" table above. No further action needed.

### Testing

- All new E2E tests must pass in CI (GitHub Actions Playwright step)
- Existing Jest suite must continue passing with coverage thresholds met
- `npm run check` must pass

---

## Operational Hardening (from original design doc)

These items are addressed across the sub-phases:

- **Timer debug snapshot seam and server-clock offset:** Already present. No changes needed.
- **Focused regression for elapsed counters/midnight/cross-device:** Covered by E2E additions in 6D (multi-tab timer sync, timer reload/restore).
- **Session-scoped lifecycle:** Already implemented via AbortController signals on room switches. No changes needed.

---

## Non-Goals

- No new features beyond original Phase 6 spec
- No habit tracking, day rollover, deduplication, or quick-action configurability
- No build step or bundler introduction
- No PouchDB data model or storage layer changes
- No breaking changes to existing task or activity behavior
