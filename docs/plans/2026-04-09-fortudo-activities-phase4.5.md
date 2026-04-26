# Phase 4.5: Live Activity Timer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live start/stop timer to the activity tab so users can capture activities in real time rather than logging retroactively.

**Architecture:** Timer state is a PouchDB config document (`config-running-activity`) with an in-memory cache, following the same pattern as `settings-manager.js`. Timer functions extend `activities/manager.js`. Handler functions in `handlers.js` orchestrate stop-on-start and coordinator notifications. The coordinator's `onTaskCompleted` gains overlap detection to auto-stop running timers when auto-logged activities conflict. The activity tab shows a timer display (with editable fields and elapsed counter) when a timer is running, replacing the manual entry form. No new JS files; all logic extends existing modules.

**Tech Stack:** Vanilla JS with ES modules, PouchDB, Tailwind CSS, Jest 30 + jsdom for testing.

**Design doc:** `docs/plans/2026-03-16-fortudo-activities-design.md` — see "UI: Live Activity Timer" and "Phase 4.5 Design Decisions"

---

## File Map

**Modified:**
| File | Changes |
|------|---------|
| `public/js/storage.js` | Add `deleteConfig` export |
| `public/js/activities/manager.js` | Add 6 timer functions, update `resetActivityState`, update `createActivityFromTask` for early completion, relax `addActivity` duration validation |
| `public/js/activities/handlers.js` | Add `handleStartTimer`, `handleStopTimer` |
| `public/js/activities/ui-handlers.js` | Add timer display rendering, elapsed counter, form/timer transitions, `initializeTimerUI`, update `handleActivityAwareFormSubmit` guard, update `syncActivitiesUI` |
| `public/js/app-coordinator.js` | Extend `onTaskCompleted` with overlap detection + auto-stop |
| `public/js/dom-renderer.js` | Update `initializeTaskTypeToggle` for Start Timer button visibility |
| `public/js/app.js` | Boot restoration: `loadRunningActivity`, timer display init, activity tab highlight |
| `public/index.html` | Add `#task-form-fields` wrapper div, `#timer-display` container, `#start-timer-btn` button |
| `__tests__/test-utils.js` | Update `setupDOM` with timer HTML elements |

**New:**
| File | Purpose |
|------|---------|
| `__tests__/activity-timer.test.js` | Timer state management + timer handler tests |

**Modified (tests):**
| File | Changes |
|------|---------|
| `__tests__/storage-config.test.js` | Add `deleteConfig` tests |
| `__tests__/activity-manager.test.js` | Add early completion tests, duration validation edge case |
| `__tests__/app-coordinator.test.js` | Add overlap detection + auto-stop tests |
| `__tests__/activity-app-integration.test.js` | Add timer lifecycle integration tests |

---

## Chunk 1: Storage Foundation

### Task 1: Add `deleteConfig` to storage.js

**Files:**
- Modify: `public/js/storage.js`
- Test: `__tests__/storage-config.test.js`

- [ ] **Step 1: Write the failing tests**

In `__tests__/storage-config.test.js`, add a new `describe('deleteConfig')` block. This file uses real PouchDB with the memory adapter (not mocks).

```js
const { deleteConfig } = require('../public/js/storage.js');

// Add to existing imports if not already present

describe('deleteConfig', () => {
    test('deletes a config document by ID', async () => {
        await putConfig({ id: 'config-test-delete', someSetting: true });
        const before = await loadConfig('config-test-delete');
        expect(before).not.toBeNull();
        expect(before.someSetting).toBe(true);

        await deleteConfig('config-test-delete');
        const after = await loadConfig('config-test-delete');
        expect(after).toBeNull();
    });

    test('succeeds silently when config does not exist', async () => {
        await expect(deleteConfig('config-nonexistent')).resolves.not.toThrow();
    });

    test('does not affect other config documents', async () => {
        await putConfig({ id: 'config-keep', value: 'keep' });
        await putConfig({ id: 'config-remove', value: 'remove' });

        await deleteConfig('config-remove');

        const kept = await loadConfig('config-keep');
        expect(kept).not.toBeNull();
        expect(kept.value).toBe('keep');

        const removed = await loadConfig('config-remove');
        expect(removed).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/storage-config.test.js -t "deleteConfig" --verbose`
Expected: FAIL — `deleteConfig` is not exported from storage.js

- [ ] **Step 3: Implement `deleteConfig`**

In `public/js/storage.js`, add the export near the existing `deleteTask` and `deleteActivity` functions. The internal `deleteTypedDoc` helper already handles the deletion pattern:

```js
export async function deleteConfig(configId) {
    await deleteTypedDoc(configId, DOC_TYPES.CONFIG, 'config');
}
```

Add `deleteConfig` to any barrel exports if the file has them.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/storage-config.test.js -t "deleteConfig" --verbose`
Expected: PASS (3 tests)

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npx jest --verbose`
Expected: All existing tests pass

- [ ] **Step 6: Commit**

```bash
git add public/js/storage.js __tests__/storage-config.test.js
git commit -m "feat: add deleteConfig to storage layer for timer state cleanup"
```

---

## Chunk 2: Timer State Management

### Task 2: Timer state primitives + `startTimer` in manager.js

**Files:**
- Modify: `public/js/activities/manager.js`
- Create: `__tests__/activity-timer.test.js`

- [ ] **Step 1: Write failing tests for load, get, reset, and startTimer**

Create `__tests__/activity-timer.test.js`:

```js
/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/storage.js', () => ({
    putActivity: jest.fn(() => Promise.resolve()),
    deleteActivity: jest.fn(() => Promise.resolve()),
    putConfig: jest.fn(() => Promise.resolve()),
    loadConfig: jest.fn(() => Promise.resolve(null)),
    deleteConfig: jest.fn(() => Promise.resolve()),
}));

const {
    loadRunningActivity,
    getRunningActivity,
    startTimer,
    resetActivityState,
} = require('../public/js/activities/manager.js');

const { putConfig, loadConfig } = require('../public/js/storage.js');

const RUNNING_ACTIVITY_CONFIG_ID = 'config-running-activity';

describe('Timer state primitives', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetActivityState();
    });

    describe('getRunningActivity', () => {
        test('returns null when no timer is running', () => {
            expect(getRunningActivity()).toBeNull();
        });

        test('returns a clone, not the internal reference', async () => {
            await startTimer({ description: 'Test' });
            const a = getRunningActivity();
            const b = getRunningActivity();
            expect(a).toEqual(b);
            expect(a).not.toBe(b);
        });
    });

    describe('loadRunningActivity', () => {
        test('loads running activity from PouchDB config doc', async () => {
            loadConfig.mockResolvedValueOnce({
                id: RUNNING_ACTIVITY_CONFIG_ID,
                description: 'Working on feature',
                category: 'work/deep',
                startDateTime: '2026-04-09T10:00:00.000Z',
            });

            await loadRunningActivity();

            const running = getRunningActivity();
            expect(running).not.toBeNull();
            expect(running.description).toBe('Working on feature');
            expect(running.category).toBe('work/deep');
            expect(running.startDateTime).toBe('2026-04-09T10:00:00.000Z');
        });

        test('sets null when no config doc exists', async () => {
            loadConfig.mockResolvedValueOnce(null);
            await loadRunningActivity();
            expect(getRunningActivity()).toBeNull();
        });
    });

    describe('resetActivityState', () => {
        test('clears running timer state', async () => {
            await startTimer({ description: 'Active timer' });
            expect(getRunningActivity()).not.toBeNull();

            resetActivityState();
            expect(getRunningActivity()).toBeNull();
        });
    });
});

describe('startTimer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetActivityState();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-09T14:00:00.000Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('creates a running activity with correct fields', async () => {
        const result = await startTimer({ description: 'Deep work session', category: 'work/deep' });

        expect(result.success).toBe(true);
        expect(result.runningActivity.description).toBe('Deep work session');
        expect(result.runningActivity.category).toBe('work/deep');
        expect(result.runningActivity.startDateTime).toBe('2026-04-09T14:00:00.000Z');
    });

    test('persists config doc to PouchDB', async () => {
        await startTimer({ description: 'Test', category: null });

        expect(putConfig).toHaveBeenCalledWith(expect.objectContaining({
            id: RUNNING_ACTIVITY_CONFIG_ID,
            description: 'Test',
            category: null,
            startDateTime: '2026-04-09T14:00:00.000Z',
        }));
    });

    test('updates in-memory cache', async () => {
        await startTimer({ description: 'Cached' });
        const running = getRunningActivity();
        expect(running.description).toBe('Cached');
    });

    test('trims description whitespace', async () => {
        const result = await startTimer({ description: '  padded  ' });
        expect(result.runningActivity.description).toBe('padded');
    });

    test('rejects empty description', async () => {
        const result = await startTimer({ description: '' });
        expect(result.success).toBe(false);
        expect(result.reason).toMatch(/description/i);
        expect(putConfig).not.toHaveBeenCalled();
    });

    test('rejects when timer is already running', async () => {
        await startTimer({ description: 'First' });
        jest.clearAllMocks();

        const result = await startTimer({ description: 'Second' });
        expect(result.success).toBe(false);
        expect(result.reason).toMatch(/already running/i);
        expect(putConfig).not.toHaveBeenCalled();
    });

    test('defaults category to null when not provided', async () => {
        const result = await startTimer({ description: 'No cat' });
        expect(result.runningActivity.category).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/activity-timer.test.js --verbose`
Expected: FAIL — `loadRunningActivity`, `getRunningActivity`, `startTimer` not exported

- [ ] **Step 3: Implement timer state primitives and startTimer**

In `public/js/activities/manager.js`, add imports and timer state:

```js
// Add to existing imports from storage.js:
import { putConfig, loadConfig, deleteConfig } from '../storage.js';
// (putActivity and deleteActivity imports should already exist)

const RUNNING_ACTIVITY_CONFIG_ID = 'config-running-activity';

let runningActivity = null;
```

Add the timer functions (before or after existing activity functions):

```js
// --- Timer state management ---

export async function loadRunningActivity() {
    const config = await loadConfig(RUNNING_ACTIVITY_CONFIG_ID);
    runningActivity = config ? {
        description: config.description,
        category: config.category || null,
        startDateTime: config.startDateTime,
    } : null;
}

export function getRunningActivity() {
    return runningActivity ? { ...runningActivity } : null;
}

export async function startTimer({ description, category }) {
    if (!description?.trim()) {
        return { success: false, reason: 'Description is required to start a timer.' };
    }

    if (runningActivity) {
        return { success: false, reason: 'A timer is already running. Stop it first.' };
    }

    const now = new Date().toISOString();
    const timerState = {
        description: description.trim(),
        category: category || null,
        startDateTime: now,
    };

    await putConfig({
        id: RUNNING_ACTIVITY_CONFIG_ID,
        ...timerState,
    });

    runningActivity = timerState;
    return { success: true, runningActivity: { ...runningActivity } };
}
```

Update `resetActivityState` to also clear the timer:

```js
export function resetActivityState() {
    activities = [];
    runningActivity = null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/activity-timer.test.js --verbose`
Expected: PASS (all tests)

- [ ] **Step 5: Run full test suite for regressions**

Run: `npx jest --verbose`
Expected: All tests pass. The `resetActivityState` change should not break existing tests since it only adds a `null` assignment.

- [ ] **Step 6: Commit**

```bash
git add public/js/activities/manager.js __tests__/activity-timer.test.js
git commit -m "feat: add timer state primitives and startTimer to activity manager"
```

---

### Task 3: `stopTimer`, `stopTimerAt`, `updateRunningActivity` + duration validation

**Files:**
- Modify: `public/js/activities/manager.js`
- Modify: `__tests__/activity-timer.test.js`
- Modify: `__tests__/activity-manager.test.js`

- [ ] **Step 1: Write failing tests for stopTimer, stopTimerAt, and updateRunningActivity**

Append to `__tests__/activity-timer.test.js`:

```js
const {
    loadRunningActivity,
    getRunningActivity,
    startTimer,
    stopTimer,
    stopTimerAt,
    updateRunningActivity,
    resetActivityState,
    getActivityState,
} = require('../public/js/activities/manager.js');

const { putConfig, loadConfig, deleteConfig, putActivity } = require('../public/js/storage.js');

describe('stopTimer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetActivityState();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('creates an activity from the running timer', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({ description: 'Working', category: 'work/deep' });

        jest.setSystemTime(new Date('2026-04-09T11:30:00.000Z'));
        const result = await stopTimer();

        expect(result.success).toBe(true);
        expect(result.activity.description).toBe('Working');
        expect(result.activity.category).toBe('work/deep');
        expect(result.activity.source).toBe('timer');
        expect(result.activity.sourceTaskId).toBeNull();
        expect(result.activity.startDateTime).toBe('2026-04-09T10:00:00.000Z');
        expect(result.activity.endDateTime).toBe('2026-04-09T11:30:00.000Z');
        expect(result.activity.duration).toBe(90);
    });

    test('deletes the config doc', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({ description: 'Test' });
        jest.clearAllMocks();

        jest.setSystemTime(new Date('2026-04-09T10:30:00.000Z'));
        await stopTimer();

        expect(deleteConfig).toHaveBeenCalledWith(RUNNING_ACTIVITY_CONFIG_ID);
    });

    test('clears the in-memory cache', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({ description: 'Test' });

        jest.setSystemTime(new Date('2026-04-09T10:05:00.000Z'));
        await stopTimer();

        expect(getRunningActivity()).toBeNull();
    });

    test('returns failure when no timer is running', async () => {
        const result = await stopTimer();
        expect(result.success).toBe(false);
        expect(result.reason).toMatch(/no timer/i);
    });

    test('handles zero-duration timer (immediate stop)', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({ description: 'Quick' });

        // Same time — 0 duration
        const result = await stopTimer();
        expect(result.success).toBe(true);
        expect(result.activity.duration).toBe(0);
    });
});

describe('stopTimerAt', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetActivityState();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('stops timer at a specific endDateTime', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({ description: 'Working' });

        jest.setSystemTime(new Date('2026-04-09T11:00:00.000Z'));
        const result = await stopTimerAt('2026-04-09T10:45:00.000Z');

        expect(result.success).toBe(true);
        expect(result.activity.endDateTime).toBe('2026-04-09T10:45:00.000Z');
        expect(result.activity.duration).toBe(45);
    });

    test('clamps to zero duration when endDateTime is before startDateTime', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:30:00.000Z'));
        await startTimer({ description: 'Late start' });

        jest.setSystemTime(new Date('2026-04-09T11:00:00.000Z'));
        // endDateTime before the timer's startDateTime
        const result = await stopTimerAt('2026-04-09T10:00:00.000Z');

        expect(result.success).toBe(true);
        expect(result.activity.duration).toBe(0);
        expect(result.activity.startDateTime).toBe('2026-04-09T10:30:00.000Z');
        expect(result.activity.endDateTime).toBe('2026-04-09T10:30:00.000Z');
    });

    test('returns failure when no timer is running', async () => {
        const result = await stopTimerAt('2026-04-09T10:00:00.000Z');
        expect(result.success).toBe(false);
    });
});

describe('updateRunningActivity', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetActivityState();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('updates description on running timer', async () => {
        await startTimer({ description: 'Original' });
        jest.clearAllMocks();

        const result = await updateRunningActivity({ description: 'Updated' });

        expect(result.success).toBe(true);
        expect(result.runningActivity.description).toBe('Updated');
        expect(getRunningActivity().description).toBe('Updated');
        expect(putConfig).toHaveBeenCalledWith(expect.objectContaining({
            id: RUNNING_ACTIVITY_CONFIG_ID,
            description: 'Updated',
        }));
    });

    test('updates category on running timer', async () => {
        await startTimer({ description: 'Test', category: 'work/deep' });

        const result = await updateRunningActivity({ category: 'work/meetings' });
        expect(result.runningActivity.category).toBe('work/meetings');
    });

    test('updates startDateTime for backdating', async () => {
        await startTimer({ description: 'Forgot to start' });

        const result = await updateRunningActivity({
            startDateTime: '2026-04-09T09:30:00.000Z',
        });
        expect(result.runningActivity.startDateTime).toBe('2026-04-09T09:30:00.000Z');
    });

    test('rejects empty description', async () => {
        await startTimer({ description: 'Valid' });

        const result = await updateRunningActivity({ description: '' });
        expect(result.success).toBe(false);
        expect(getRunningActivity().description).toBe('Valid');
    });

    test('returns failure when no timer is running', async () => {
        const result = await updateRunningActivity({ description: 'No timer' });
        expect(result.success).toBe(false);
    });
});
```

- [ ] **Step 2: Write failing test for zero-duration in addActivity**

In `__tests__/activity-manager.test.js`, add:

```js
test('addActivity accepts zero duration', async () => {
    const result = await addActivity({
        description: 'Zero duration edge case',
        startDateTime: '2026-04-09T10:00:00.000Z',
        endDateTime: '2026-04-09T10:00:00.000Z',
        duration: 0,
        source: 'timer',
        sourceTaskId: null,
    });

    expect(result.success).toBe(true);
    expect(result.activity.duration).toBe(0);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest __tests__/activity-timer.test.js __tests__/activity-manager.test.js --verbose`
Expected: FAIL — `stopTimer`, `stopTimerAt`, `updateRunningActivity` not exported; zero-duration addActivity fails validation

- [ ] **Step 4: Implement stopTimer, stopTimerAt, updateRunningActivity**

In `public/js/activities/manager.js`, add after `startTimer`:

```js
export async function stopTimer() {
    if (!runningActivity) {
        return { success: false, reason: 'No timer is currently running.' };
    }

    const now = new Date();
    const start = new Date(runningActivity.startDateTime);
    const durationMinutes = Math.max(0, Math.round((now - start) / 60000));

    const activityData = {
        description: runningActivity.description,
        category: runningActivity.category,
        startDateTime: runningActivity.startDateTime,
        endDateTime: now.toISOString(),
        duration: durationMinutes,
        source: 'timer',
        sourceTaskId: null,
    };

    await deleteConfig(RUNNING_ACTIVITY_CONFIG_ID);
    runningActivity = null;

    return addActivity(activityData);
}

export async function stopTimerAt(endDateTime) {
    if (!runningActivity) {
        return { success: false, reason: 'No timer is currently running.' };
    }

    const start = new Date(runningActivity.startDateTime);
    const end = new Date(endDateTime);

    // Guard: clamp to startDateTime if end is before start (zero-duration)
    const effectiveEnd = end <= start ? start : end;
    const durationMinutes = Math.max(0, Math.round((effectiveEnd - start) / 60000));

    const activityData = {
        description: runningActivity.description,
        category: runningActivity.category,
        startDateTime: runningActivity.startDateTime,
        endDateTime: effectiveEnd.toISOString(),
        duration: durationMinutes,
        source: 'timer',
        sourceTaskId: null,
    };

    await deleteConfig(RUNNING_ACTIVITY_CONFIG_ID);
    runningActivity = null;

    return addActivity(activityData);
}

export async function updateRunningActivity(updates) {
    if (!runningActivity) {
        return { success: false, reason: 'No timer is currently running.' };
    }

    const merged = { ...runningActivity, ...updates };

    if (!merged.description?.trim()) {
        return { success: false, reason: 'Description cannot be empty.' };
    }

    runningActivity = {
        description: merged.description.trim(),
        category: merged.category || null,
        startDateTime: merged.startDateTime,
    };

    await putConfig({
        id: RUNNING_ACTIVITY_CONFIG_ID,
        ...runningActivity,
    });

    return { success: true, runningActivity: { ...runningActivity } };
}
```

- [ ] **Step 5: Relax `addActivity` duration validation**

In `public/js/activities/manager.js`, find the `addActivity` function's duration validation. Change the check from rejecting `duration <= 0` (or falsy duration) to only rejecting negative duration:

```js
// Before (one of these patterns):
// if (!activityData.duration || activityData.duration <= 0) {
// if (activityData.duration <= 0) {

// After:
if (typeof activityData.duration !== 'number' || activityData.duration < 0) {
```

This allows zero-duration activities from the timer edge case while still rejecting negative or non-numeric values.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest __tests__/activity-timer.test.js __tests__/activity-manager.test.js --verbose`
Expected: PASS (all tests)

- [ ] **Step 7: Run full test suite for regressions**

Run: `npx jest --verbose`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add public/js/activities/manager.js __tests__/activity-timer.test.js __tests__/activity-manager.test.js
git commit -m "feat: add stopTimer, stopTimerAt, updateRunningActivity with zero-duration support"
```

---

## Chunk 3: Timer Handlers

### Task 4: `handleStartTimer` and `handleStopTimer` in handlers.js

**Files:**
- Modify: `public/js/activities/handlers.js`
- Modify: `__tests__/activity-timer.test.js`

- [ ] **Step 1: Write failing tests for timer handlers**

Append to `__tests__/activity-timer.test.js`. These tests need the handlers module and mocked coordinator:

```js
jest.mock('../public/js/app-coordinator.js', () => ({
    onActivityCreated: jest.fn(),
    onActivityEdited: jest.fn(),
    onActivityDeleted: jest.fn(),
}));

jest.mock('../public/js/toast-manager.js', () => ({
    showToast: jest.fn(),
}));

// Mock showAlert on window
beforeAll(() => {
    window.showAlert = jest.fn();
});

const { handleStartTimer, handleStopTimer } = require('../public/js/activities/handlers.js');
const { onActivityCreated } = require('../public/js/app-coordinator.js');
const { showToast } = require('../public/js/toast-manager.js');

describe('handleStartTimer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetActivityState();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('starts a timer and shows toast', async () => {
        const result = await handleStartTimer({ description: 'Working', category: 'work/deep' });

        expect(result.success).toBe(true);
        expect(getRunningActivity()).not.toBeNull();
        expect(showToast).toHaveBeenCalledWith('Timer started.', { theme: 'sky' });
    });

    test('stop-on-start: stops running timer before starting new one', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({ description: 'First' });
        jest.clearAllMocks();

        jest.setSystemTime(new Date('2026-04-09T10:30:00.000Z'));
        const result = await handleStartTimer({ description: 'Second' });

        expect(result.success).toBe(true);
        expect(getRunningActivity().description).toBe('Second');
        // The stopped timer should have triggered onActivityCreated
        expect(onActivityCreated).toHaveBeenCalledWith(
            expect.objectContaining({
                activity: expect.objectContaining({
                    description: 'First',
                    source: 'timer',
                    duration: 30,
                }),
            })
        );
    });

    test('rejects empty description', async () => {
        const result = await handleStartTimer({ description: '' });
        expect(result.success).toBe(false);
        expect(getRunningActivity()).toBeNull();
    });
});

describe('handleStopTimer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetActivityState();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('stops timer, creates activity, notifies coordinator', async () => {
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({ description: 'Working' });
        jest.clearAllMocks();

        jest.setSystemTime(new Date('2026-04-09T11:00:00.000Z'));
        const result = await handleStopTimer();

        expect(result.success).toBe(true);
        expect(getRunningActivity()).toBeNull();
        expect(onActivityCreated).toHaveBeenCalledWith(
            expect.objectContaining({
                activity: expect.objectContaining({
                    description: 'Working',
                    source: 'timer',
                }),
            })
        );
        expect(showToast).toHaveBeenCalledWith('Activity logged.', { theme: 'sky' });
    });

    test('returns failure when no timer is running', async () => {
        const result = await handleStopTimer();
        expect(result.success).toBe(false);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/activity-timer.test.js -t "handleStartTimer|handleStopTimer" --verbose`
Expected: FAIL — `handleStartTimer`, `handleStopTimer` not exported

- [ ] **Step 3: Implement timer handlers**

In `public/js/activities/handlers.js`, add imports:

```js
import { startTimer, stopTimer, getRunningActivity } from './manager.js';
```

Add the handler functions:

```js
export async function handleStartTimer({ description, category }) {
    try {
        // Stop-on-start: if a timer is already running, stop it first
        const running = getRunningActivity();
        if (running) {
            const stopResult = await stopTimer();
            if (stopResult?.success && stopResult.activity) {
                onActivityCreated({ activity: stopResult.activity });
            }
        }

        const result = await startTimer({ description, category });
        if (!result.success) {
            showAlert(result.reason, 'sky');
            return result;
        }

        showToast('Timer started.', { theme: 'sky' });
        return result;
    } catch (error) {
        logger.error('Failed to start timer:', error);
        showAlert(`Failed to start timer: ${error.message}`, 'sky');
        return { success: false, reason: error.message };
    }
}

export async function handleStopTimer() {
    try {
        const result = await stopTimer();
        if (!result.success) {
            showAlert(result.reason, 'sky');
            return result;
        }

        if (result.activity) {
            onActivityCreated({ activity: result.activity });
        }

        showToast('Activity logged.', { theme: 'sky' });
        return result;
    } catch (error) {
        logger.error('Failed to stop timer:', error);
        showAlert(`Failed to stop timer: ${error.message}`, 'sky');
        return { success: false, reason: error.message };
    }
}
```

Add `logger` to imports if not already present:
```js
import { logger } from '../utils.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/activity-timer.test.js --verbose`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add public/js/activities/handlers.js __tests__/activity-timer.test.js
git commit -m "feat: add handleStartTimer and handleStopTimer with stop-on-start orchestration"
```

---

## Chunk 4: Auto-Logging Enhancements

### Task 5: Early completion time adjustment in `createActivityFromTask`

**Files:**
- Modify: `public/js/activities/manager.js`
- Modify: `__tests__/activity-manager.test.js`

- [ ] **Step 1: Write failing tests for early completion adjustment**

In `__tests__/activity-manager.test.js`, add to the `createActivityFromTask` describe block:

```js
describe('early completion adjustment', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-09T14:00:00.000Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('uses original times when task endDateTime is in the past', () => {
        const task = {
            id: 'sched-1',
            description: 'Past task',
            category: 'work/deep',
            startDateTime: '2026-04-09T13:00:00.000Z',
            endDateTime: '2026-04-09T13:30:00.000Z',
            duration: 30,
        };

        const activity = createActivityFromTask(task);
        expect(activity.startDateTime).toBe('2026-04-09T13:00:00.000Z');
        expect(activity.endDateTime).toBe('2026-04-09T13:30:00.000Z');
        expect(activity.duration).toBe(30);
    });

    test('shifts time window when task startDateTime is in the future', () => {
        // Task scheduled for 15:00-15:30 but completed now (14:00)
        const task = {
            id: 'sched-2',
            description: 'Future task done early',
            category: null,
            startDateTime: '2026-04-09T15:00:00.000Z',
            endDateTime: '2026-04-09T15:30:00.000Z',
            duration: 30,
        };

        const activity = createActivityFromTask(task);
        // endDateTime = now (14:00), startDateTime = now - 30min (13:30)
        expect(activity.endDateTime).toBe('2026-04-09T14:00:00.000Z');
        expect(activity.startDateTime).toBe('2026-04-09T13:30:00.000Z');
        expect(activity.duration).toBe(30);
    });

    test('preserves source and sourceTaskId on adjusted activities', () => {
        const task = {
            id: 'sched-3',
            description: 'Early',
            startDateTime: '2026-04-09T16:00:00.000Z',
            endDateTime: '2026-04-09T17:00:00.000Z',
            duration: 60,
        };

        const activity = createActivityFromTask(task);
        expect(activity.source).toBe('auto');
        expect(activity.sourceTaskId).toBe('sched-3');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/activity-manager.test.js -t "early completion" --verbose`
Expected: FAIL — future-task test expects adjusted times but gets original times

- [ ] **Step 3: Implement early completion adjustment**

In `public/js/activities/manager.js`, update `createActivityFromTask`:

```js
export function createActivityFromTask(task) {
    if (!task) return null;

    const now = new Date();
    let startDateTime = task.startDateTime;
    let endDateTime = task.endDateTime;
    const duration = task.duration;

    // Early completion: if task was scheduled for the future, shift to end at now
    if (new Date(startDateTime) > now) {
        endDateTime = now.toISOString();
        startDateTime = new Date(now.getTime() - duration * 60000).toISOString();
    }

    return {
        description: task.description,
        category: task.category || null,
        startDateTime,
        endDateTime,
        duration,
        source: 'auto',
        sourceTaskId: task.id || null,
    };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/activity-manager.test.js --verbose`
Expected: PASS (all tests including existing ones)

- [ ] **Step 5: Commit**

```bash
git add public/js/activities/manager.js __tests__/activity-manager.test.js
git commit -m "feat: adjust auto-log times when completing tasks scheduled in the future"
```

---

### Task 6: Overlap detection + auto-stop in `onTaskCompleted`

**Files:**
- Modify: `public/js/app-coordinator.js`
- Modify: `__tests__/app-coordinator.test.js`

- [ ] **Step 1: Write failing tests for overlap detection**

In `__tests__/app-coordinator.test.js`, add the timer-related imports to the mock setup. The file already mocks `activities/manager.js`; add `getRunningActivity` and `stopTimerAt` to the mock:

```js
// Add to the existing jest.mock for activities/manager.js:
getRunningActivity: jest.fn(() => null),
stopTimerAt: jest.fn(() => Promise.resolve({ success: true, activity: { id: 'timer-act', description: 'Timer' } })),
```

Add a new describe block:

```js
const { getRunningActivity, stopTimerAt } = require('../public/js/activities/manager.js');

describe('onTaskCompleted — timer overlap', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-09T14:00:00.000Z'));
        isActivitiesEnabled.mockReturnValue(true);
        addActivity.mockResolvedValue({ success: true, activity: { id: 'auto-act' } });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('auto-stops timer when auto-log overlaps with running timer', async () => {
        getRunningActivity.mockReturnValue({
            description: 'Timer task',
            category: null,
            startDateTime: '2026-04-09T13:00:00.000Z',
        });

        const task = {
            id: 'sched-1', type: 'scheduled', description: 'Done task',
            startDateTime: '2026-04-09T13:30:00.000Z',
            endDateTime: '2026-04-09T14:00:00.000Z',
            duration: 30,
        };

        onTaskCompleted({ task });

        // Wait for the fire-and-forget chain
        await jest.runAllTimersAsync();
        await Promise.resolve();
        await Promise.resolve();

        expect(stopTimerAt).toHaveBeenCalledWith('2026-04-09T13:30:00.000Z');
    });

    test('does not stop timer when auto-log does not overlap', async () => {
        getRunningActivity.mockReturnValue({
            description: 'Timer task',
            category: null,
            startDateTime: '2026-04-09T13:45:00.000Z',
        });

        // Task was 10:00-10:30, timer started at 13:45 — no overlap
        const task = {
            id: 'sched-2', type: 'scheduled', description: 'Old task',
            startDateTime: '2026-04-09T10:00:00.000Z',
            endDateTime: '2026-04-09T10:30:00.000Z',
            duration: 30,
        };

        onTaskCompleted({ task });

        await jest.runAllTimersAsync();
        await Promise.resolve();

        expect(stopTimerAt).not.toHaveBeenCalled();
        expect(addActivity).toHaveBeenCalled();
    });

    test('does not check timer when no timer is running', async () => {
        getRunningActivity.mockReturnValue(null);

        const task = {
            id: 'sched-3', type: 'scheduled', description: 'Normal',
            startDateTime: '2026-04-09T13:00:00.000Z',
            endDateTime: '2026-04-09T14:00:00.000Z',
            duration: 60,
        };

        onTaskCompleted({ task });

        await jest.runAllTimersAsync();
        await Promise.resolve();

        expect(stopTimerAt).not.toHaveBeenCalled();
        expect(addActivity).toHaveBeenCalled();
    });

    test('sequences stop-then-auto-log when overlap exists', async () => {
        getRunningActivity.mockReturnValue({
            description: 'Timer',
            category: null,
            startDateTime: '2026-04-09T13:00:00.000Z',
        });

        const callOrder = [];
        stopTimerAt.mockImplementation(() => {
            callOrder.push('stopTimerAt');
            return Promise.resolve({ success: true, activity: { id: 'timer-act' } });
        });
        addActivity.mockImplementation(() => {
            callOrder.push('addActivity');
            return Promise.resolve({ success: true, activity: { id: 'auto-act' } });
        });

        const task = {
            id: 'sched-4', type: 'scheduled', description: 'Task',
            startDateTime: '2026-04-09T13:30:00.000Z',
            endDateTime: '2026-04-09T14:00:00.000Z',
            duration: 30,
        };

        onTaskCompleted({ task });

        await jest.runAllTimersAsync();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(callOrder).toEqual(['stopTimerAt', 'addActivity']);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/app-coordinator.test.js -t "timer overlap" --verbose`
Expected: FAIL — `stopTimerAt` never called because the overlap logic doesn't exist yet

- [ ] **Step 3: Implement overlap detection in `onTaskCompleted`**

In `public/js/app-coordinator.js`, add imports:

```js
import { addActivity, createActivityFromTask, getRunningActivity, stopTimerAt } from './activities/manager.js';
```

Add the overlap helper (module-private):

```js
function timerOverlapsActivity(running, activity) {
    const timerStart = new Date(running.startDateTime).getTime();
    const now = Date.now();
    const actStart = new Date(activity.startDateTime).getTime();
    const actEnd = new Date(activity.endDateTime).getTime();
    // Two ranges [timerStart, now] and [actStart, actEnd] overlap iff:
    return timerStart < actEnd && actStart < now;
}
```

Replace the auto-logging section of `onTaskCompleted` with the overlap-aware version:

```js
export function onTaskCompleted({ task }) {
    if (!refreshWhenPresent(task)) { return; }
    if (task.type !== 'scheduled') { return; }

    triggerConfettiAnimation(task.id);

    if (isActivitiesEnabled()) {
        const activity = createActivityFromTask(task);
        if (activity) {
            const running = getRunningActivity();
            const hasOverlap = running && timerOverlapsActivity(running, activity);

            const timerStopPromise = hasOverlap
                ? stopTimerAt(activity.startDateTime)
                : Promise.resolve(null);

            void timerStopPromise
                .then((timerResult) => {
                    if (timerResult?.success && timerResult.activity) {
                        onActivityCreated({ activity: timerResult.activity });
                    }
                    // Now auto-log the completed task
                    return consumeActivitySmokeFailure('auto-log')
                        ? Promise.reject(new Error('Smoke forced activity auto-log failure.'))
                        : addActivity(activity);
                })
                .then((result) => {
                    if (result?.success && result.activity) {
                        onActivityCreated({ activity: result.activity });
                    }
                })
                .catch((error) => {
                    logger.error('Failed to auto-log completed task as activity:', error);
                    showToast('Task completed, but activity auto-log failed.', { theme: 'amber' });
                });
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/app-coordinator.test.js --verbose`
Expected: PASS (all tests including existing ones)

- [ ] **Step 5: Run full test suite**

Run: `npx jest --verbose`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add public/js/app-coordinator.js __tests__/app-coordinator.test.js
git commit -m "feat: auto-stop running timer on task completion when time ranges overlap"
```

---

## Chunk 5: HTML + Form Updates

### Task 7: HTML structure updates + test-utils DOM

**Files:**
- Modify: `public/index.html`
- Modify: `__tests__/test-utils.js`

- [ ] **Step 1: Add `#task-form-fields` wrapper div to index.html**

In `public/index.html`, find the `<form id="task-form">`. Inside that form, after the radio toggle `<div class="flex flex-col sm:flex-row sm:space-x-4 mb-2">` closing `</div>`, wrap all remaining form children (description input, `#time-inputs`, `#priority-input`, category elements, submit button) in a new div:

```html
<div id="task-form-fields">
    <!-- All existing form inputs from description through submit button go here -->
    <!-- Do NOT move the radio toggle div inside this wrapper -->
</div>
```

- [ ] **Step 2: Add `#start-timer-btn` next to the submit button**

Find the `<button id="add-task"` submit button. Wrap it and a new Start Timer button in a flex container:

```html
<div class="flex gap-2">
    <button id="add-task" type="submit"
        class="flex-1 py-2 sm:py-3 px-4 sm:px-6 bg-gradient-to-r from-teal-500 to-teal-400 text-white font-bold rounded-xl shadow-lg hover:shadow-teal-500/25 hover:scale-105 active:scale-95 transition-all duration-200">
        <i class="fa-solid fa-plus mr-1"></i> Add Task
    </button>
    <button id="start-timer-btn" type="button"
        class="hidden flex-1 py-2 sm:py-3 px-4 sm:px-6 bg-gradient-to-r from-sky-600 to-sky-500 text-white font-bold rounded-xl shadow-lg hover:shadow-sky-500/25 hover:scale-105 active:scale-95 transition-all duration-200">
        <i class="fa-solid fa-play mr-1"></i> Start Timer
    </button>
</div>
```

Note: The existing `#add-task` button may not have a flex wrapper. If it is standalone, wrap both buttons in the `<div class="flex gap-2">`. If it already has a wrapper, add the new button inside.

- [ ] **Step 3: Add `#timer-display` container**

After the closing `</div>` of `#task-form-fields` but still inside the `<form>`, add:

```html
<div id="timer-display" class="hidden p-3 sm:p-4 bg-slate-800/50 rounded-xl border border-sky-500/30 space-y-3">
    <div class="flex items-center justify-between">
        <div id="timer-elapsed" class="text-sky-400 font-mono text-2xl sm:text-3xl tracking-wider">00:00:00</div>
        <button id="timer-stop-btn" type="button"
            class="py-2 px-4 sm:px-6 bg-gradient-to-r from-sky-500 to-sky-400 text-white font-bold rounded-xl shadow-lg hover:shadow-sky-500/25 hover:scale-105 active:scale-95 transition-all duration-200">
            <i class="fa-solid fa-stop mr-1"></i> Stop
        </button>
    </div>
    <div class="space-y-2">
        <input id="timer-description" type="text" placeholder="What are you working on?"
            class="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:border-sky-400 focus:ring-1 focus:ring-sky-400 focus:outline-none transition-colors" />
        <div class="flex flex-col sm:flex-row gap-2">
            <select id="timer-category"
                class="flex-1 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-200 focus:border-sky-400 focus:ring-1 focus:ring-sky-400 focus:outline-none transition-colors">
                <option value="">No category</option>
            </select>
            <div class="flex items-center gap-2">
                <label class="text-slate-400 text-sm whitespace-nowrap">Started at</label>
                <input id="timer-start-time" type="time"
                    class="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-200 focus:border-sky-400 focus:ring-1 focus:ring-sky-400 focus:outline-none transition-colors" />
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 4: Update `setupDOM` in test-utils.js**

In `__tests__/test-utils.js`, find the `setupDOM()` function's HTML template. Add the same structural changes:

1. Wrap the form inputs (below the radio toggle) in `<div id="task-form-fields">...</div>`
2. Add `<button id="start-timer-btn" type="button" class="hidden">Start Timer</button>` next to the `#add-task` button
3. Add the `#timer-display` div after `#task-form-fields`:

```html
<div id="timer-display" class="hidden">
    <div id="timer-elapsed">00:00:00</div>
    <button id="timer-stop-btn" type="button">Stop</button>
    <input id="timer-description" type="text" />
    <select id="timer-category"><option value="">No category</option></select>
    <input id="timer-start-time" type="time" />
</div>
```

The test-utils version can be simplified (no Tailwind classes needed for DOM structure tests).

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `npx jest --verbose`
Expected: All tests pass. The HTML wrapper should not break existing DOM queries.

- [ ] **Step 6: Commit**

```bash
git add public/index.html __tests__/test-utils.js
git commit -m "feat: add timer display HTML structure and Start Timer button"
```

---

### Task 8: Update `initializeTaskTypeToggle` for Start Timer button

**Files:**
- Modify: `public/js/dom-renderer.js`

- [ ] **Step 1: Update `applyTaskFormMode` to show/hide Start Timer button**

In `public/js/dom-renderer.js`, inside the `initializeTaskTypeToggle` function, find where DOM refs are collected. Add:

```js
const startTimerBtn = document.getElementById('start-timer-btn');
```

Inside the `applyTaskFormMode` function, after the existing submit button updates, add:

```js
// Show Start Timer button only in activity mode
if (startTimerBtn) {
    startTimerBtn.classList.toggle('hidden', mode !== 'activity');
}
```

- [ ] **Step 2: Run full test suite**

Run: `npx jest --verbose`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add public/js/dom-renderer.js
git commit -m "feat: show Start Timer button when activity form mode is selected"
```

---

## Chunk 6: Timer Display UI

### Task 9: Timer display rendering + elapsed counter in ui-handlers.js

**Files:**
- Modify: `public/js/activities/ui-handlers.js`
- Modify: `__tests__/activity-app-integration.test.js`

- [ ] **Step 1: Write failing tests for timer display functions**

In `__tests__/activity-app-integration.test.js`, add a new describe block for timer display:

```js
const { showTimerDisplay, hideTimerDisplay } = require('../public/js/activities/ui-handlers.js');
const { getRunningActivity } = require('../public/js/activities/manager.js');

describe('Timer display rendering', () => {
    beforeEach(() => {
        setupDOM();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('showTimerDisplay hides form fields and shows timer', () => {
        showTimerDisplay({
            description: 'Working',
            category: null,
            startDateTime: '2026-04-09T10:00:00.000Z',
        });

        expect(document.getElementById('task-form-fields').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('timer-display').classList.contains('hidden')).toBe(false);
    });

    test('showTimerDisplay populates editable fields', () => {
        showTimerDisplay({
            description: 'Deep work',
            category: 'work/deep',
            startDateTime: '2026-04-09T09:30:00.000Z',
        });

        expect(document.getElementById('timer-description').value).toBe('Deep work');
        expect(document.getElementById('timer-start-time').value).toBe('09:30');
    });

    test('showTimerDisplay starts elapsed counter', () => {
        showTimerDisplay({
            description: 'Test',
            startDateTime: '2026-04-09T09:00:00.000Z',
        });

        // At 10:00, elapsed from 09:00 = 1h 0m 0s
        expect(document.getElementById('timer-elapsed').textContent).toBe('01:00:00');

        // Advance 30 seconds
        jest.advanceTimersByTime(30000);
        expect(document.getElementById('timer-elapsed').textContent).toBe('01:00:30');
    });

    test('hideTimerDisplay shows form fields and hides timer', () => {
        showTimerDisplay({
            description: 'Test',
            startDateTime: '2026-04-09T10:00:00.000Z',
        });

        hideTimerDisplay();

        expect(document.getElementById('task-form-fields').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('timer-display').classList.contains('hidden')).toBe(true);
    });

    test('hideTimerDisplay stops the elapsed counter', () => {
        showTimerDisplay({
            description: 'Test',
            startDateTime: '2026-04-09T10:00:00.000Z',
        });

        hideTimerDisplay();
        const textAfterHide = document.getElementById('timer-elapsed').textContent;

        jest.advanceTimersByTime(5000);
        expect(document.getElementById('timer-elapsed').textContent).toBe(textAfterHide);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/activity-app-integration.test.js -t "Timer display" --verbose`
Expected: FAIL — `showTimerDisplay`, `hideTimerDisplay` not exported

- [ ] **Step 3: Implement timer display functions**

In `public/js/activities/ui-handlers.js`, add module state and display functions:

```js
let timerIntervalId = null;

export function showTimerDisplay(runningActivity) {
    const formFields = document.getElementById('task-form-fields');
    const timerDisplay = document.getElementById('timer-display');
    if (!formFields || !timerDisplay) return;

    formFields.classList.add('hidden');
    timerDisplay.classList.remove('hidden');

    // Populate editable fields
    const descInput = document.getElementById('timer-description');
    const startInput = document.getElementById('timer-start-time');

    if (descInput) descInput.value = runningActivity.description || '';
    if (startInput && runningActivity.startDateTime) {
        // Extract HH:MM in local time — input type="time" uses local time
        const date = new Date(runningActivity.startDateTime);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        startInput.value = `${hours}:${minutes}`;
    }

    // Populate timer category dropdown from taxonomy
    const timerCat = document.getElementById('timer-category');
    if (timerCat) {
        // Re-use the same category options as the main form
        const mainCatSelect = document.querySelector('#task-form select[name="category"]');
        if (mainCatSelect) {
            timerCat.innerHTML = mainCatSelect.innerHTML;
        }
        timerCat.value = runningActivity.category || '';
    }

    startElapsedCounter(runningActivity.startDateTime);
}

export function hideTimerDisplay() {
    const formFields = document.getElementById('task-form-fields');
    const timerDisplay = document.getElementById('timer-display');
    if (!formFields || !timerDisplay) return;

    stopElapsedCounter();
    timerDisplay.classList.add('hidden');
    formFields.classList.remove('hidden');
}

function startElapsedCounter(startDateTime) {
    stopElapsedCounter();
    const startMs = new Date(startDateTime).getTime();
    const elapsedEl = document.getElementById('timer-elapsed');
    if (!elapsedEl) return;

    function update() {
        const elapsed = Date.now() - startMs;
        const h = Math.floor(elapsed / 3600000);
        const m = Math.floor((elapsed % 3600000) / 60000);
        const s = Math.floor((elapsed % 60000) / 1000);
        elapsedEl.textContent =
            `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    update();
    timerIntervalId = setInterval(update, 1000);
}

function stopElapsedCounter() {
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/activity-app-integration.test.js -t "Timer display" --verbose`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add public/js/activities/ui-handlers.js __tests__/activity-app-integration.test.js
git commit -m "feat: add timer display rendering with elapsed counter and editable fields"
```

---

### Task 10: Timer interaction handlers + form/timer transitions

**Files:**
- Modify: `public/js/activities/ui-handlers.js`
- Modify: `__tests__/activity-app-integration.test.js`

- [ ] **Step 1: Write failing tests for timer interactions**

Append to the timer display describe block in `__tests__/activity-app-integration.test.js`:

```js
const { initializeTimerUI, syncTimerFormState } = require('../public/js/activities/ui-handlers.js');
const { handleStartTimer, handleStopTimer } = require('../public/js/activities/handlers.js');
const { startTimer, resetActivityState, getRunningActivity } = require('../public/js/activities/manager.js');

describe('syncTimerFormState', () => {
    beforeEach(() => {
        setupDOM();
        resetActivityState();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('shows timer display when activity tab selected and timer running', async () => {
        await startTimer({ description: 'Running' });
        document.getElementById('activity').checked = true;

        syncTimerFormState();

        expect(document.getElementById('task-form-fields').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('timer-display').classList.contains('hidden')).toBe(false);
    });

    test('shows form fields when activity tab selected and no timer', () => {
        document.getElementById('activity').checked = true;

        syncTimerFormState();

        expect(document.getElementById('task-form-fields').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('timer-display').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('start-timer-btn').classList.contains('hidden')).toBe(false);
    });

    test('shows form fields and hides timer when scheduled tab selected even with timer running', async () => {
        await startTimer({ description: 'Running' });
        document.getElementById('scheduled').checked = true;

        syncTimerFormState();

        expect(document.getElementById('task-form-fields').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('timer-display').classList.contains('hidden')).toBe(true);
    });

    test('hides Start Timer button on non-activity tabs', () => {
        document.getElementById('scheduled').checked = true;

        syncTimerFormState();

        expect(document.getElementById('start-timer-btn').classList.contains('hidden')).toBe(true);
    });
});

describe('handleActivityAwareFormSubmit with timer', () => {
    test('prevents form submission when activity tab has running timer', async () => {
        setupDOM();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
        await startTimer({ description: 'Running' });

        document.getElementById('activity').checked = true;
        const form = document.getElementById('task-form');

        const mockHandleTaskSubmit = jest.fn();
        handleActivityAwareFormSubmit(form, { handleTaskSubmit: mockHandleTaskSubmit });

        // Neither task submit nor activity add should fire
        expect(mockHandleTaskSubmit).not.toHaveBeenCalled();
        jest.useRealTimers();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/activity-app-integration.test.js -t "syncTimerFormState|handleActivityAwareFormSubmit with timer" --verbose`
Expected: FAIL — `syncTimerFormState` not exported, form submit guard not implemented

- [ ] **Step 3: Implement syncTimerFormState**

In `public/js/activities/ui-handlers.js`, add imports:

```js
import { getRunningActivity } from './manager.js';
```

Add the sync function:

```js
export function syncTimerFormState() {
    const activityRadio = document.getElementById('activity');
    const isActivityMode = activityRadio?.checked;
    const running = getRunningActivity();

    const formFields = document.getElementById('task-form-fields');
    const timerDisplay = document.getElementById('timer-display');
    const startTimerBtn = document.getElementById('start-timer-btn');

    if (isActivityMode && running) {
        showTimerDisplay(running);
    } else {
        hideTimerDisplay();
        // Show Start Timer button only in activity mode when no timer
        if (startTimerBtn) {
            startTimerBtn.classList.toggle('hidden', !isActivityMode);
        }
    }
}
```

- [ ] **Step 4: Add timer guard to handleActivityAwareFormSubmit**

In the existing `handleActivityAwareFormSubmit` function, add a guard at the top of the activity branch:

```js
if (taskType === 'activity') {
    // Don't submit form when timer display is showing
    if (getRunningActivity()) {
        return;
    }
    // ... existing manual log flow
}
```

- [ ] **Step 5: Implement initializeTimerUI**

Add the initialization function that wires up timer-specific event listeners:

```js
export function initializeTimerUI(deps) {
    // Sync timer/form state when radio toggle changes
    const radios = document.querySelectorAll('input[name="task-type"]');
    radios.forEach(radio => {
        radio.addEventListener('change', () => syncTimerFormState());
    });

    // Start Timer button
    const startTimerBtn = document.getElementById('start-timer-btn');
    if (startTimerBtn) {
        startTimerBtn.addEventListener('click', () => {
            const descInput = document.querySelector('#task-form input[name="description"]');
            const catSelect = document.querySelector('#task-form select[name="category"]');
            const description = descInput?.value?.trim();
            const category = catSelect?.value || null;

            if (!description) {
                if (window.showAlert) window.showAlert('Please enter a description before starting the timer.', 'sky');
                return;
            }

            handleStartTimer({ description, category })
                .then((result) => {
                    if (result?.success) {
                        syncTimerFormState();
                        if (descInput) descInput.value = '';
                        deps.refreshUI();
                    }
                });
        });
    }

    // Stop Timer button
    const stopTimerBtn = document.getElementById('timer-stop-btn');
    if (stopTimerBtn) {
        stopTimerBtn.addEventListener('click', () => {
            handleStopTimer()
                .then((result) => {
                    if (result?.success) {
                        syncTimerFormState();
                        deps.refreshUI();
                    }
                });
        });
    }

    // Timer description edit (debounced persistence)
    const timerDesc = document.getElementById('timer-description');
    if (timerDesc) {
        timerDesc.addEventListener('change', () => {
            updateRunningActivity({ description: timerDesc.value });
        });
    }

    // Timer category edit
    const timerCat = document.getElementById('timer-category');
    if (timerCat) {
        timerCat.addEventListener('change', () => {
            updateRunningActivity({ category: timerCat.value || null });
        });
    }

    // Timer start time edit (backdating)
    const timerStartTime = document.getElementById('timer-start-time');
    if (timerStartTime) {
        timerStartTime.addEventListener('change', () => {
            const running = getRunningActivity();
            if (!running) return;
            // Parse the time input as local time (matches how we display it)
            const [hours, minutes] = timerStartTime.value.split(':').map(Number);
            const newStart = new Date();
            newStart.setHours(hours, minutes, 0, 0);
            updateRunningActivity({ startDateTime: newStart.toISOString() });
        });
    }
}
```

Add the needed imports:

```js
import { handleStartTimer, handleStopTimer } from './handlers.js';
import { getRunningActivity, updateRunningActivity } from './manager.js';
```

- [ ] **Step 6: Update syncActivitiesUI to also call syncTimerFormState**

In the existing `syncActivitiesUI(enabled)` function, add at the end:

```js
// Also sync timer display state when activities toggle changes
if (!enabled) {
    hideTimerDisplay();
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx jest __tests__/activity-app-integration.test.js --verbose`
Expected: PASS

- [ ] **Step 8: Run full test suite**

Run: `npx jest --verbose`
Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add public/js/activities/ui-handlers.js __tests__/activity-app-integration.test.js
git commit -m "feat: add timer interaction handlers with form/timer transitions and syncTimerFormState"
```

---

## Chunk 7: Boot Restoration + Integration

### Task 11: Boot restoration in app.js

**Files:**
- Modify: `public/js/app.js`

- [ ] **Step 1: Add loadRunningActivity to loadAppState**

In `public/js/app.js`, add import:

```js
import { loadRunningActivity, getRunningActivity } from './activities/manager.js';
import { initializeTimerUI, syncTimerFormState } from './activities/ui-handlers.js';
```

Update `loadAppState`:

```js
async function loadAppState() {
    await loadTasksIntoState();
    if (isActivitiesEnabled()) {
        await loadActivitiesState();
        await loadRunningActivity();
    }
}
```

- [ ] **Step 2: Add timer UI initialization to boot sequence**

In the `initAndBootApp` function, after the existing `initializeTaskTypeToggle()` call, add:

```js
initializeTimerUI({ refreshUI: refreshTaskDisplays });
```

- [ ] **Step 3: Add boot-time timer display restoration and tab highlight**

After `refreshTaskDisplays()` (the initial render at the end of boot), add:

```js
// Restore timer display if a timer was running
if (isActivitiesEnabled() && getRunningActivity()) {
    syncTimerFormState();

    // Brief highlight on activity tab to signal running timer
    const activityToggle = document.getElementById('activity-toggle-option');
    if (activityToggle) {
        activityToggle.classList.add('ring-2', 'ring-sky-400/50');
        setTimeout(() => {
            activityToggle.classList.remove('ring-2', 'ring-sky-400/50');
        }, 3000);
    }
}
```

- [ ] **Step 4: Run full test suite**

Run: `npx jest --verbose`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add public/js/app.js
git commit -m "feat: restore running timer on boot with activity tab highlight"
```

---

### Task 12: Timer lifecycle integration tests

**Files:**
- Modify: `__tests__/activity-app-integration.test.js`

- [ ] **Step 1: Write integration tests for full timer lifecycle**

Append to `__tests__/activity-app-integration.test.js`:

```js
describe('Timer lifecycle integration', () => {
    beforeEach(() => {
        setupDOM();
        resetActivityState();
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('full start → work → stop lifecycle creates activity', async () => {
        // Start timer
        const startResult = await handleStartTimer({ description: 'Feature work', category: 'work/deep' });
        expect(startResult.success).toBe(true);
        expect(getRunningActivity()).not.toBeNull();

        // Advance 45 minutes
        jest.setSystemTime(new Date('2026-04-09T10:45:00.000Z'));

        // Stop timer
        const stopResult = await handleStopTimer();
        expect(stopResult.success).toBe(true);
        expect(getRunningActivity()).toBeNull();
        expect(stopResult.activity.description).toBe('Feature work');
        expect(stopResult.activity.category).toBe('work/deep');
        expect(stopResult.activity.source).toBe('timer');
        expect(stopResult.activity.duration).toBe(45);
    });

    test('stop-on-start creates activity for the first timer', async () => {
        // Start first timer
        await handleStartTimer({ description: 'First task' });

        jest.setSystemTime(new Date('2026-04-09T10:30:00.000Z'));

        // Start second timer (auto-stops first)
        const result = await handleStartTimer({ description: 'Second task' });
        expect(result.success).toBe(true);

        // First timer's activity should have been created
        expect(onActivityCreated).toHaveBeenCalledWith(
            expect.objectContaining({
                activity: expect.objectContaining({
                    description: 'First task',
                    duration: 30,
                }),
            })
        );

        // Second timer is now running
        expect(getRunningActivity().description).toBe('Second task');
    });

    test('backdating updates the running timer start time', async () => {
        await startTimer({ description: 'Started late' });

        const result = await updateRunningActivity({
            startDateTime: '2026-04-09T09:30:00.000Z',
        });

        expect(result.success).toBe(true);
        expect(getRunningActivity().startDateTime).toBe('2026-04-09T09:30:00.000Z');
    });

    test('boot restoration recovers running timer from PouchDB', async () => {
        // Simulate a config doc existing from a previous session
        const { loadConfig } = require('../public/js/storage.js');
        loadConfig.mockResolvedValueOnce({
            id: 'config-running-activity',
            description: 'Persisted timer',
            category: 'work/deep',
            startDateTime: '2026-04-09T09:00:00.000Z',
        });

        await loadRunningActivity();

        const running = getRunningActivity();
        expect(running).not.toBeNull();
        expect(running.description).toBe('Persisted timer');
        expect(running.startDateTime).toBe('2026-04-09T09:00:00.000Z');
    });

    test('resetActivityState clears both activities and timer', async () => {
        await startTimer({ description: 'Active' });
        expect(getRunningActivity()).not.toBeNull();

        resetActivityState();

        expect(getRunningActivity()).toBeNull();
        expect(getActivityState()).toEqual([]);
    });
});
```

- [ ] **Step 2: Run integration tests**

Run: `npx jest __tests__/activity-app-integration.test.js --verbose`
Expected: PASS (all tests)

- [ ] **Step 3: Run full test suite with coverage**

Run: `npx jest --coverage`
Expected: All tests pass. Coverage thresholds (90/90/90/79) maintained.

- [ ] **Step 4: Commit**

```bash
git add __tests__/activity-app-integration.test.js
git commit -m "test: add timer lifecycle integration tests"
```

---

## Summary

12 tasks across 7 chunks:

| Chunk | Tasks | What ships |
|-------|-------|-----------|
| 1. Storage Foundation | 1 | `deleteConfig` in storage.js |
| 2. Timer State Management | 2-3 | Timer primitives, start/stop/update in manager.js |
| 3. Timer Handlers | 4 | `handleStartTimer`/`handleStopTimer` with stop-on-start |
| 4. Auto-Logging Enhancements | 5-6 | Early completion adjustment, overlap detection + auto-stop |
| 5. HTML + Form Updates | 7-8 | Timer display HTML, Start Timer button, toggle awareness |
| 6. Timer Display UI | 9-10 | Elapsed counter, editable fields, form/timer transitions |
| 7. Boot + Integration | 11-12 | Boot restoration, tab highlight, lifecycle integration tests |

Each chunk produces working, testable code. Chunks 1-4 are purely logic (no DOM). Chunks 5-7 add the UI.
