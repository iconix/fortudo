# Phase 4: Activity Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add activity logging to Fortudo: an activity manager with CRUD and auto-logging from scheduled task completion, a third "Activity" form mode, an activity renderer showing today's log, and coordinator wiring for activity events.

**Architecture:** Activities are PouchDB documents (`docType: 'activity'`) using the existing `putActivity`/`loadActivities`/`deleteActivity` storage primitives shipped in Phase 2. The activity manager owns in-memory state and CRUD. Auto-logging fires as fire-and-forget async work inside the synchronous `onTaskCompleted` coordinator event. A three-way form toggle (scheduled/unscheduled/activity) routes submission to either `tasks/add-handler.js` or `activities/handlers.js`. The activity list renders below the unscheduled task list, gated by `isActivitiesEnabled()`. The entire activity UI container is hidden when Activities are disabled in settings.

**Tech Stack:** Vanilla JS ES modules, PouchDB (memory adapter in tests), Jest 30, Tailwind CSS

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `public/js/activities/manager.js` | Activity state management, CRUD, `createActivityFromTask` |
| Create | `public/js/activities/form-utils.js` | Activity form data extraction and validation |
| Create | `public/js/activities/handlers.js` | Activity add/edit/delete handler functions |
| Create | `public/js/activities/renderer.js` | Renders chronological activity list for today |
| Create | `__tests__/activity-manager.test.js` | Tests for activity manager CRUD + auto-logging |
| Create | `__tests__/activity-form-utils.test.js` | Tests for activity form extraction |
| Create | `__tests__/activity-handlers.test.js` | Tests for activity handlers |
| Create | `__tests__/activity-renderer.test.js` | Tests for activity list rendering |
| Modify | `public/js/app-coordinator.js` | Add `onActivityCreated`, `onActivityEdited`, `onActivityDeleted` + auto-logging in `onTaskCompleted` |
| Modify | `__tests__/app-coordinator.test.js` | Test new activity events + auto-logging |
| Modify | `public/js/utils.js` | Add `'activity'` branch to `getThemeForTaskType` and `getThemeForTask` |
| Modify | `public/js/toast-manager.js` | Add `sky` theme to `THEME_CLASSES` |
| Modify | `public/index.html` | Add Activity radio option, activity list container |
| Modify | `public/js/dom-renderer.js` | Three-way form toggle, activity list event delegation |
| Modify | `public/js/tasks/form-utils.js` | Guard `extractTaskFormData` against `'activity'` task-type |
| Modify | `public/js/app.js` | Boot wiring: load activities, activity form routing, activity event listeners, show/hide activity UI |
| Modify | `__tests__/test-utils.js` | Add activity radio + activity list container to `setupDOM` |

---

## Chunk 1: Activity Manager + Coordinator Wiring

### Task 1: Activity manager — failing tests for core CRUD

**Files:**
- Create: `__tests__/activity-manager.test.js`

- [ ] **Step 1: Write failing tests for addActivity, getActivityState, getActivityById, getTodaysActivities**

```js
/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/storage.js', () => ({
    putActivity: jest.fn(() => Promise.resolve()),
    loadActivities: jest.fn(() => Promise.resolve([])),
    deleteActivity: jest.fn(() => Promise.resolve())
}));

import {
    addActivity,
    getActivityState,
    getActivityById,
    getTodaysActivities,
    loadActivitiesState,
    removeActivity,
    editActivity,
    resetActivityState
} from '../public/js/activities/manager.js';
import { putActivity, loadActivities, deleteActivity } from '../public/js/storage.js';

describe('activity manager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetActivityState();
    });

    describe('addActivity', () => {
        test('creates activity with generated id and stores it', async () => {
            const data = {
                description: 'Deep work session',
                category: 'work/deep',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            };

            const result = await addActivity(data);

            expect(result.success).toBe(true);
            expect(result.activity.id).toMatch(/^activity-/);
            expect(result.activity.description).toBe('Deep work session');
            expect(result.activity.docType).toBe('activity');
            expect(putActivity).toHaveBeenCalledWith(result.activity);
            expect(getActivityState()).toContain(result.activity);
        });

        test('rejects activity with empty description', async () => {
            const data = {
                description: '',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            };

            const result = await addActivity(data);

            expect(result.success).toBe(false);
            expect(result.reason).toMatch(/description/i);
            expect(putActivity).not.toHaveBeenCalled();
        });

        test('rejects activity with zero duration', async () => {
            const data = {
                description: 'Test',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T09:00:00.000Z',
                duration: 0,
                source: 'manual',
                sourceTaskId: null
            };

            const result = await addActivity(data);

            expect(result.success).toBe(false);
            expect(result.reason).toMatch(/duration/i);
        });
    });

    describe('getActivityById', () => {
        test('returns activity when found', async () => {
            const { activity } = await addActivity({
                description: 'Test',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            expect(getActivityById(activity.id)).toBe(activity);
        });

        test('returns null when not found', () => {
            expect(getActivityById('activity-nonexistent')).toBeNull();
        });
    });

    describe('getTodaysActivities', () => {
        test('returns only activities from today sorted by start time', async () => {
            const today = new Date();
            const todayISO = today.toISOString().slice(0, 10);
            const yesterdayDate = new Date(today);
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yesterdayISO = yesterdayDate.toISOString().slice(0, 10);

            await addActivity({
                description: 'Yesterday',
                startDateTime: `${yesterdayISO}T09:00:00.000Z`,
                endDateTime: `${yesterdayISO}T10:00:00.000Z`,
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            await addActivity({
                description: 'Today later',
                startDateTime: `${todayISO}T14:00:00.000Z`,
                endDateTime: `${todayISO}T15:00:00.000Z`,
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            await addActivity({
                description: 'Today earlier',
                startDateTime: `${todayISO}T09:00:00.000Z`,
                endDateTime: `${todayISO}T10:00:00.000Z`,
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            const todays = getTodaysActivities();
            expect(todays).toHaveLength(2);
            expect(todays[0].description).toBe('Today earlier');
            expect(todays[1].description).toBe('Today later');
        });
    });

    describe('removeActivity', () => {
        test('removes activity from state and storage', async () => {
            const { activity } = await addActivity({
                description: 'To remove',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            const result = await removeActivity(activity.id);

            expect(result.success).toBe(true);
            expect(deleteActivity).toHaveBeenCalledWith(activity.id);
            expect(getActivityById(activity.id)).toBeNull();
        });

        test('returns failure for nonexistent activity', async () => {
            const result = await removeActivity('activity-fake');
            expect(result.success).toBe(false);
        });
    });

    describe('editActivity', () => {
        test('updates editable fields and persists', async () => {
            const { activity } = await addActivity({
                description: 'Original',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            });

            const result = await editActivity(activity.id, {
                description: 'Updated',
                duration: 90
            });

            expect(result.success).toBe(true);
            expect(result.activity.description).toBe('Updated');
            expect(result.activity.duration).toBe(90);
            expect(putActivity).toHaveBeenCalled();
        });

        test('rejects edit of auto-logged activity', async () => {
            const { activity } = await addActivity({
                description: 'Auto',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'auto',
                sourceTaskId: 'sched-123'
            });

            const result = await editActivity(activity.id, { description: 'Changed' });

            expect(result.success).toBe(false);
            expect(result.reason).toMatch(/auto/i);
        });
    });

    describe('loadActivitiesState', () => {
        test('populates state from storage', async () => {
            loadActivities.mockResolvedValueOnce([
                {
                    id: 'activity-1',
                    docType: 'activity',
                    description: 'Stored',
                    startDateTime: '2026-04-07T09:00:00.000Z',
                    endDateTime: '2026-04-07T10:00:00.000Z',
                    duration: 60,
                    source: 'manual',
                    sourceTaskId: null
                }
            ]);

            await loadActivitiesState();

            expect(getActivityState()).toHaveLength(1);
            expect(getActivityState()[0].description).toBe('Stored');
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/activity-manager.test.js --no-coverage 2>&1 | tail -5`
Expected: FAIL — cannot find module `../public/js/activities/manager.js`

- [ ] **Step 3: Commit**

```bash
git add __tests__/activity-manager.test.js
git commit -m "test: add failing tests for activity manager CRUD"
```

### Task 2: Activity manager — implementation

**Files:**
- Create: `public/js/activities/manager.js`

- [ ] **Step 1: Implement the activity manager**

```js
import { putActivity, loadActivities, deleteActivity } from '../storage.js';
import { logger } from '../utils.js';

/** @type {Array} */
let activities = [];

export function resetActivityState() {
    activities = [];
}

export function getActivityState() {
    return activities;
}

export function getActivityById(id) {
    return activities.find((a) => a.id === id) || null;
}

export function getTodaysActivities(now = new Date()) {
    const todayStr = now.toISOString().slice(0, 10);
    return activities
        .filter((a) => a.startDateTime && a.startDateTime.slice(0, 10) === todayStr)
        .sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime));
}

export async function loadActivitiesState() {
    activities = await loadActivities();
}

export async function addActivity(data) {
    if (!data.description || data.description.trim() === '') {
        return { success: false, reason: 'Activity description is required.' };
    }

    if (!data.duration || data.duration <= 0) {
        return { success: false, reason: 'Activity duration must be greater than 0.' };
    }

    if (!data.startDateTime || !data.endDateTime) {
        return { success: false, reason: 'Activity start and end times are required.' };
    }

    const activity = {
        id: `activity-${Date.now()}`,
        docType: 'activity',
        description: data.description.trim(),
        category: data.category || null,
        startDateTime: data.startDateTime,
        endDateTime: data.endDateTime,
        duration: data.duration,
        source: data.source || 'manual',
        sourceTaskId: data.sourceTaskId || null
    };

    await putActivity(activity);
    activities.push(activity);

    return { success: true, activity };
}

export async function removeActivity(id) {
    const index = activities.findIndex((a) => a.id === id);
    if (index === -1) {
        return { success: false, reason: 'Activity not found.' };
    }

    const activity = activities[index];
    await deleteActivity(id);
    activities.splice(index, 1);

    return { success: true, activity };
}

export async function editActivity(id, updates) {
    const activity = getActivityById(id);
    if (!activity) {
        return { success: false, reason: 'Activity not found.' };
    }

    if (activity.source === 'auto') {
        return { success: false, reason: 'Auto-logged activities cannot be edited.' };
    }

    const editableFields = ['description', 'category', 'startDateTime', 'endDateTime', 'duration'];
    for (const field of editableFields) {
        if (Object.prototype.hasOwnProperty.call(updates, field)) {
            activity[field] = updates[field];
        }
    }

    await putActivity(activity);

    return { success: true, activity };
}

export function createActivityFromTask(task) {
    return {
        description: task.description,
        category: task.category || null,
        startDateTime: task.startDateTime,
        endDateTime: task.endDateTime,
        duration: task.duration,
        source: 'auto',
        sourceTaskId: task.id
    };
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx jest __tests__/activity-manager.test.js --no-coverage`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add public/js/activities/manager.js
git commit -m "feat: add activity manager with CRUD and createActivityFromTask"
```

### Task 3: Coordinator activity events + auto-logging — failing tests

**Files:**
- Modify: `__tests__/app-coordinator.test.js`

- [ ] **Step 1: Add failing tests for activity events and auto-logging**

Add these tests to the existing `describe('app-coordinator', ...)` block:

```js
// Add to the existing mock block at the top:
jest.mock('../public/js/activities/manager.js', () => ({
    addActivity: jest.fn(() => Promise.resolve({ success: true, activity: {} })),
    createActivityFromTask: jest.fn((task) => ({
        description: task.description,
        startDateTime: task.startDateTime,
        endDateTime: task.endDateTime,
        duration: task.duration,
        category: task.category || null,
        source: 'auto',
        sourceTaskId: task.id
    })),
    getTodaysActivities: jest.fn(() => [])
}));

jest.mock('../public/js/settings-manager.js', () => ({
    isActivitiesEnabled: jest.fn(() => false)
}));

// Add imports:
import { addActivity, createActivityFromTask } from '../public/js/activities/manager.js';
import { isActivitiesEnabled } from '../public/js/settings-manager.js';

// Add these test cases inside describe('app-coordinator'):

test('onActivityCreated refreshes UI', () => {
    appCoordinator.onActivityCreated({
        activity: { id: 'activity-1', description: 'Test' }
    });
    expect(refreshUI).toHaveBeenCalledTimes(1);
});

test('onActivityEdited refreshes UI', () => {
    appCoordinator.onActivityEdited({
        activity: { id: 'activity-1', description: 'Test' }
    });
    expect(refreshUI).toHaveBeenCalledTimes(1);
});

test('onActivityDeleted refreshes UI', () => {
    appCoordinator.onActivityDeleted({
        activity: { id: 'activity-1', description: 'Test' }
    });
    expect(refreshUI).toHaveBeenCalledTimes(1);
});

test('onActivityCreated does nothing when activity is null', () => {
    appCoordinator.onActivityCreated({ activity: null });
    expect(refreshUI).not.toHaveBeenCalled();
});

test('onTaskCompleted auto-logs when activities are enabled and task is scheduled', () => {
    isActivitiesEnabled.mockReturnValue(true);
    const task = {
        id: 'sched-123',
        type: 'scheduled',
        description: 'Standup',
        startDateTime: '2026-04-07T09:00:00.000Z',
        endDateTime: '2026-04-07T09:30:00.000Z',
        duration: 30,
        category: 'work/meetings'
    };

    appCoordinator.onTaskCompleted({ task });

    expect(createActivityFromTask).toHaveBeenCalledWith(task);
    expect(addActivity).toHaveBeenCalled();
});

test('onTaskCompleted does not auto-log when activities are disabled', () => {
    isActivitiesEnabled.mockReturnValue(false);
    const task = { id: 'sched-456', type: 'scheduled' };

    appCoordinator.onTaskCompleted({ task });

    expect(createActivityFromTask).not.toHaveBeenCalled();
    expect(addActivity).not.toHaveBeenCalled();
});

test('onTaskCompleted does not auto-log unscheduled tasks even when activities enabled', () => {
    isActivitiesEnabled.mockReturnValue(true);
    const task = { id: 'unsched-789', type: 'unscheduled' };

    appCoordinator.onTaskCompleted({ task });

    expect(createActivityFromTask).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `npx jest __tests__/app-coordinator.test.js --no-coverage 2>&1 | tail -10`
Expected: FAIL — `onActivityCreated` is not a function, auto-logging assertions fail

- [ ] **Step 3: Commit**

```bash
git add __tests__/app-coordinator.test.js
git commit -m "test: add failing tests for coordinator activity events and auto-logging"
```

### Task 4: Coordinator activity events + auto-logging — implementation

**Files:**
- Modify: `public/js/app-coordinator.js`

- [ ] **Step 1: Add activity events and auto-logging to the coordinator**

Add imports at the top of `app-coordinator.js`:

```js
import { isActivitiesEnabled } from './settings-manager.js';
import { addActivity, createActivityFromTask } from './activities/manager.js';
```

Add new event functions after the existing task events:

```js
// --- Activity Events ---

export function onActivityCreated({ activity }) {
    if (!activity) {
        return;
    }
    refreshUI();
}

export function onActivityEdited({ activity }) {
    if (!activity) {
        return;
    }
    refreshUI();
}

export function onActivityDeleted({ activity }) {
    if (!activity) {
        return;
    }
    refreshUI();
}
```

Modify the existing `onTaskCompleted` to add auto-logging. Replace the entire function:

```js
export function onTaskCompleted({ task }) {
    if (!task) {
        return;
    }
    refreshUI();
    if (task.type === 'scheduled') {
        triggerConfettiAnimation(task.id);

        // Auto-log activity (fire-and-forget)
        if (isActivitiesEnabled()) {
            const activityData = createActivityFromTask(task);
            addActivity(activityData).catch((err) => {
                logger.warn('Auto-logging activity failed:', err);
            });
        }
    }
}
```

Add the `logger` import to the existing import from `./utils.js` (if not already present — check existing imports first):

```js
import { logger } from './utils.js';
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx jest __tests__/app-coordinator.test.js --no-coverage`
Expected: All tests PASS (both old and new)

- [ ] **Step 3: Run full test suite to check for regressions**

Run: `npx jest --no-coverage 2>&1 | tail -10`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add public/js/app-coordinator.js
git commit -m "feat: add coordinator activity events and auto-logging on task completion"
```

---

## Chunk 2: Theme + Utility Updates

### Task 5: Add sky theme to toast-manager and activity theme mapping

**Files:**
- Modify: `public/js/toast-manager.js`
- Modify: `public/js/utils.js`

- [ ] **Step 1: Add sky theme to THEME_CLASSES in toast-manager.js**

In `public/js/toast-manager.js`, add `sky` to the `THEME_CLASSES` object:

```js
const THEME_CLASSES = {
    teal: 'bg-teal-900/90 border-teal-700 text-teal-200',
    indigo: 'bg-indigo-900/90 border-indigo-700 text-indigo-200',
    sky: 'bg-sky-900/90 border-sky-700 text-sky-200',
    amber: 'bg-amber-900/90 border-amber-700 text-amber-200',
    rose: 'bg-rose-900/90 border-rose-700 text-rose-200',
    default: 'bg-slate-800/90 border-slate-600 text-slate-200'
};
```

- [ ] **Step 2: Update getThemeForTaskType and getThemeForTask in utils.js**

In `public/js/utils.js`, update both functions:

```js
export function getThemeForTask(task) {
    if (task?.type === 'activity' || task?.docType === 'activity') return 'sky';
    return task?.type === 'scheduled' ? 'teal' : 'indigo';
}

export function getThemeForTaskType(taskType) {
    if (taskType === 'activity') return 'sky';
    return taskType === 'scheduled' ? 'teal' : 'indigo';
}
```

- [ ] **Step 3: Run existing tests to check for regressions**

Run: `npx jest --no-coverage 2>&1 | tail -5`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add public/js/toast-manager.js public/js/utils.js
git commit -m "feat: add sky theme for activities and update theme helpers"
```

---

## Chunk 3: Activity Form

### Task 6: Activity form-utils — failing tests

**Files:**
- Create: `__tests__/activity-form-utils.test.js`

- [ ] **Step 1: Write failing tests for extractActivityFormData**

```js
/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/modal-manager.js', () => ({
    showAlert: jest.fn()
}));

jest.mock('../public/js/taxonomy/taxonomy-selectors.js', () => ({
    resolveCategoryKey: jest.fn((key) => (key ? { kind: 'category', record: { key } } : null))
}));

import { extractActivityFormData } from '../public/js/activities/form-utils.js';
import { showAlert } from '../public/js/modal-manager.js';

describe('extractActivityFormData', () => {
    let formElement;

    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = `
            <form id="task-form">
                <input type="text" name="description" value="Deep work" />
                <input type="radio" name="task-type" value="activity" checked />
                <select name="category" id="category-select">
                    <option value="">No category</option>
                    <option value="work/deep" selected>Deep Work</option>
                </select>
                <input type="time" name="start-time" value="09:00" />
                <input type="number" name="duration-hours" value="1" />
                <input type="number" name="duration-minutes" value="30" />
            </form>
        `;
        formElement = document.getElementById('task-form');
    });

    test('extracts valid activity form data', () => {
        const result = extractActivityFormData(formElement);

        expect(result).not.toBeNull();
        expect(result.description).toBe('Deep work');
        expect(result.category).toBe('work/deep');
        expect(result.startTime).toBe('09:00');
        expect(result.duration).toBe(90);
    });

    test('returns null and alerts for empty description', () => {
        formElement.querySelector('input[name="description"]').value = '';

        const result = extractActivityFormData(formElement);

        expect(result).toBeNull();
        expect(showAlert).toHaveBeenCalledWith(
            expect.stringMatching(/description/i),
            'sky'
        );
    });

    test('returns null and alerts for missing start time', () => {
        formElement.querySelector('input[name="start-time"]').value = '';

        const result = extractActivityFormData(formElement);

        expect(result).toBeNull();
        expect(showAlert).toHaveBeenCalledWith(
            expect.stringMatching(/start time/i),
            'sky'
        );
    });

    test('returns null and alerts for zero duration', () => {
        formElement.querySelector('input[name="duration-hours"]').value = '0';
        formElement.querySelector('input[name="duration-minutes"]').value = '0';

        const result = extractActivityFormData(formElement);

        expect(result).toBeNull();
        expect(showAlert).toHaveBeenCalledWith(
            expect.stringMatching(/duration/i),
            'sky'
        );
    });

    test('returns null category when none selected', () => {
        formElement.querySelector('#category-select').value = '';

        const result = extractActivityFormData(formElement);

        expect(result).not.toBeNull();
        expect(result.category).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/activity-form-utils.test.js --no-coverage 2>&1 | tail -5`
Expected: FAIL — cannot find module `../public/js/activities/form-utils.js`

- [ ] **Step 3: Commit**

```bash
git add __tests__/activity-form-utils.test.js
git commit -m "test: add failing tests for activity form-utils"
```

### Task 7: Activity form-utils — implementation

**Files:**
- Create: `public/js/activities/form-utils.js`

- [ ] **Step 1: Implement extractActivityFormData**

```js
import { parseDuration } from '../utils.js';
import { showAlert } from '../modal-manager.js';
import { resolveCategoryKey } from '../taxonomy/taxonomy-selectors.js';

export function extractActivityFormData(formElement) {
    const formData = new FormData(formElement);
    const description = formData.get('description')?.toString().trim();

    if (!description) {
        showAlert('Activity description cannot be empty.', 'sky');
        return null;
    }

    const startTime = formData.get('start-time')?.toString();
    if (!startTime) {
        showAlert('Start time is required for activities.', 'sky');
        return null;
    }

    const durationResult = parseDuration(
        formData.get('duration-hours')?.toString() || '0',
        formData.get('duration-minutes')?.toString() || '0'
    );

    if (!durationResult.valid) {
        showAlert(durationResult.error, 'sky');
        return null;
    }

    if (durationResult.duration <= 0) {
        showAlert('Duration must be greater than 0.', 'sky');
        return null;
    }

    const categoryKey = formData.get('category')?.toString() || null;
    let category = null;
    if (categoryKey) {
        if (!resolveCategoryKey(categoryKey)) {
            showAlert('Selected category is no longer available.', 'sky');
            return null;
        }
        category = categoryKey;
    }

    return {
        description,
        category,
        startTime,
        duration: durationResult.duration
    };
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx jest __tests__/activity-form-utils.test.js --no-coverage`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add public/js/activities/form-utils.js
git commit -m "feat: add activity form-utils with extractActivityFormData"
```

### Task 8: Guard task form-utils against activity type

**Files:**
- Modify: `public/js/tasks/form-utils.js`

- [ ] **Step 1: Add guard in extractTaskFormData for activity task-type**

In `public/js/tasks/form-utils.js`, in the `extractTaskFormData` function, change the final `else` branch. Currently:

```js
    } else {
        showAlert('Invalid task type selected.', 'indigo');
        return null;
    }
```

Replace with:

```js
    } else if (taskType === 'activity') {
        // Activity form data is handled by activities/form-utils.js
        return null;
    } else {
        showAlert('Invalid task type selected.', 'indigo');
        return null;
    }
```

- [ ] **Step 2: Run existing form-utils tests to check for regressions**

Run: `npx jest __tests__/form-utils.test.js --no-coverage`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add public/js/tasks/form-utils.js
git commit -m "fix: guard task form-utils against activity task-type"
```

---

## Chunk 4: Activity Handlers

### Task 9: Activity handlers — failing tests

**Files:**
- Create: `__tests__/activity-handlers.test.js`

- [ ] **Step 1: Write failing tests for handleAddActivity, handleDeleteActivity, handleEditActivity**

```js
/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/storage.js', () => ({
    putActivity: jest.fn(() => Promise.resolve()),
    loadActivities: jest.fn(() => Promise.resolve([])),
    deleteActivity: jest.fn(() => Promise.resolve())
}));

jest.mock('../public/js/activities/manager.js', () => ({
    addActivity: jest.fn(() =>
        Promise.resolve({ success: true, activity: { id: 'activity-1', description: 'Test' } })
    ),
    removeActivity: jest.fn(() =>
        Promise.resolve({ success: true, activity: { id: 'activity-1' } })
    ),
    editActivity: jest.fn(() =>
        Promise.resolve({
            success: true,
            activity: { id: 'activity-1', description: 'Updated' }
        })
    ),
    getActivityById: jest.fn(() => ({
        id: 'activity-1',
        description: 'Test',
        source: 'manual'
    }))
}));

jest.mock('../public/js/app-coordinator.js', () => ({
    onActivityCreated: jest.fn(),
    onActivityEdited: jest.fn(),
    onActivityDeleted: jest.fn()
}));

jest.mock('../public/js/modal-manager.js', () => ({
    showAlert: jest.fn(),
    askConfirmation: jest.fn(() => Promise.resolve(true))
}));

jest.mock('../public/js/toast-manager.js', () => ({
    showToast: jest.fn()
}));

jest.mock('../public/js/dom-renderer.js', () => ({
    refreshUI: jest.fn(),
    initializeTaskTypeToggle: jest.fn()
}));

jest.mock('../public/js/tasks/form-utils.js', () => ({
    focusTaskDescriptionInput: jest.fn(),
    resetTaskFormPreviewState: jest.fn()
}));

import {
    handleAddActivity,
    handleDeleteActivity,
    handleEditActivity
} from '../public/js/activities/handlers.js';
import { addActivity, removeActivity, editActivity } from '../public/js/activities/manager.js';
import {
    onActivityCreated,
    onActivityEdited,
    onActivityDeleted
} from '../public/js/app-coordinator.js';
import { showToast } from '../public/js/toast-manager.js';
import { showAlert } from '../public/js/modal-manager.js';

describe('activity handlers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('handleAddActivity', () => {
        test('adds activity and calls onActivityCreated on success', async () => {
            const activityData = {
                description: 'Deep work',
                category: 'work/deep',
                startTime: '09:00',
                duration: 60
            };

            await handleAddActivity(activityData);

            expect(addActivity).toHaveBeenCalled();
            expect(onActivityCreated).toHaveBeenCalled();
            expect(showToast).toHaveBeenCalledWith(
                expect.stringMatching(/logged/i),
                expect.objectContaining({ theme: 'sky' })
            );
        });

        test('shows alert on failure', async () => {
            addActivity.mockResolvedValueOnce({
                success: false,
                reason: 'Description is required.'
            });

            await handleAddActivity({ description: '', startTime: '09:00', duration: 60 });

            expect(onActivityCreated).not.toHaveBeenCalled();
            expect(showAlert).toHaveBeenCalled();
        });
    });

    describe('handleDeleteActivity', () => {
        test('removes activity and calls onActivityDeleted', async () => {
            await handleDeleteActivity('activity-1');

            expect(removeActivity).toHaveBeenCalledWith('activity-1');
            expect(onActivityDeleted).toHaveBeenCalled();
        });
    });

    describe('handleEditActivity', () => {
        test('edits activity and calls onActivityEdited', async () => {
            await handleEditActivity('activity-1', { description: 'Updated' });

            expect(editActivity).toHaveBeenCalledWith('activity-1', { description: 'Updated' });
            expect(onActivityEdited).toHaveBeenCalled();
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/activity-handlers.test.js --no-coverage 2>&1 | tail -5`
Expected: FAIL — cannot find module `../public/js/activities/handlers.js`

- [ ] **Step 3: Commit**

```bash
git add __tests__/activity-handlers.test.js
git commit -m "test: add failing tests for activity handlers"
```

### Task 10: Activity handlers — implementation

**Files:**
- Create: `public/js/activities/handlers.js`

- [ ] **Step 1: Implement activity handlers**

```js
import { addActivity, removeActivity, editActivity, getActivityById } from './manager.js';
import {
    onActivityCreated,
    onActivityEdited,
    onActivityDeleted
} from '../app-coordinator.js';
import { showAlert } from '../modal-manager.js';
import { showToast } from '../toast-manager.js';
import { timeToDateTime, calculateEndDateTime, logger } from '../utils.js';

export async function handleAddActivity(activityData) {
    const startDateTime = timeToDateTime(activityData.startTime);
    const endDateTime = calculateEndDateTime(startDateTime, activityData.duration);

    const result = await addActivity({
        description: activityData.description,
        category: activityData.category || null,
        startDateTime,
        endDateTime,
        duration: activityData.duration,
        source: 'manual',
        sourceTaskId: null
    });

    if (result.success) {
        onActivityCreated({ activity: result.activity });
        showToast('Activity logged.', { theme: 'sky' });
    } else {
        showAlert(result.reason, 'sky');
    }
}

export async function handleDeleteActivity(activityId) {
    const activity = getActivityById(activityId);
    if (!activity) {
        logger.warn('handleDeleteActivity: activity not found', activityId);
        return;
    }

    const result = await removeActivity(activityId);
    if (result.success) {
        onActivityDeleted({ activity: result.activity });
        showToast('Activity removed.', { theme: 'sky' });
    } else {
        showAlert(result.reason, 'sky');
    }
}

export async function handleEditActivity(activityId, updates) {
    const result = await editActivity(activityId, updates);
    if (result.success) {
        onActivityEdited({ activity: result.activity });
    } else {
        showAlert(result.reason, 'sky');
    }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx jest __tests__/activity-handlers.test.js --no-coverage`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add public/js/activities/handlers.js
git commit -m "feat: add activity handlers for add, delete, edit"
```

---

## Chunk 5: Activity Renderer

### Task 11: Activity renderer — failing tests

**Files:**
- Create: `__tests__/activity-renderer.test.js`

- [ ] **Step 1: Write failing tests for renderActivities**

```js
/**
 * @jest-environment jsdom
 */

jest.mock('../public/js/taxonomy/taxonomy-selectors.js', () => ({
    renderCategoryBadge: jest.fn((key) =>
        key ? `<span class="category-badge">${key}</span>` : ''
    )
}));

import { renderActivities } from '../public/js/activities/renderer.js';

describe('activity renderer', () => {
    let container;

    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '<div id="activity-list"></div>';
        container = document.getElementById('activity-list');
    });

    test('renders empty state when no activities', () => {
        renderActivities([], container);

        expect(container.innerHTML).toContain('No activities');
    });

    test('renders activity with description and time range', () => {
        const activities = [
            {
                id: 'activity-1',
                description: 'Deep work',
                category: 'work/deep',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            }
        ];

        renderActivities(activities, container);

        expect(container.innerHTML).toContain('Deep work');
        expect(container.innerHTML).toContain('1h');
        expect(container.querySelectorAll('[data-activity-id]')).toHaveLength(1);
    });

    test('renders edit and delete buttons for manual activities', () => {
        const activities = [
            {
                id: 'activity-1',
                description: 'Manual',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            }
        ];

        renderActivities(activities, container);

        expect(container.querySelector('.btn-edit-activity')).not.toBeNull();
        expect(container.querySelector('.btn-delete-activity')).not.toBeNull();
    });

    test('renders source task link for auto-logged activities instead of edit/delete', () => {
        const activities = [
            {
                id: 'activity-2',
                description: 'Auto standup',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T09:30:00.000Z',
                duration: 30,
                source: 'auto',
                sourceTaskId: 'sched-123'
            }
        ];

        renderActivities(activities, container);

        expect(container.querySelector('.btn-edit-activity')).toBeNull();
        expect(container.querySelector('.btn-delete-activity')).toBeNull();
        const sourceLink = container.querySelector('.activity-source-link');
        expect(sourceLink).not.toBeNull();
        expect(sourceLink.dataset.sourceTaskId).toBe('sched-123');
    });

    test('renders category badge when category is present', () => {
        const activities = [
            {
                id: 'activity-3',
                description: 'Categorized',
                category: 'work/deep',
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            }
        ];

        renderActivities(activities, container);

        expect(container.innerHTML).toContain('category-badge');
    });

    test('omits category badge when category is null', () => {
        const activities = [
            {
                id: 'activity-4',
                description: 'No category',
                category: null,
                startDateTime: '2026-04-07T09:00:00.000Z',
                endDateTime: '2026-04-07T10:00:00.000Z',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            }
        ];

        renderActivities(activities, container);

        expect(container.innerHTML).not.toContain('category-badge');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/activity-renderer.test.js --no-coverage 2>&1 | tail -5`
Expected: FAIL — cannot find module `../public/js/activities/renderer.js`

- [ ] **Step 3: Commit**

```bash
git add __tests__/activity-renderer.test.js
git commit -m "test: add failing tests for activity renderer"
```

### Task 12: Activity renderer — implementation

**Files:**
- Create: `public/js/activities/renderer.js`

- [ ] **Step 1: Implement renderActivities**

```js
import { renderCategoryBadge } from '../taxonomy/taxonomy-selectors.js';
import { calculateHoursAndMinutes, extractTimeFromDateTime, convertTo12HourTime } from '../utils.js';

function formatTimeRange(startDateTime, endDateTime) {
    const startTime = extractTimeFromDateTime(new Date(startDateTime));
    const endTime = extractTimeFromDateTime(new Date(endDateTime));
    return `${convertTo12HourTime(startTime)} – ${convertTo12HourTime(endTime)}`;
}

function renderActivityItem(activity) {
    const timeRange = formatTimeRange(activity.startDateTime, activity.endDateTime);
    const durationText = calculateHoursAndMinutes(activity.duration);
    const badge = renderCategoryBadge(activity.category);
    const isAuto = activity.source === 'auto';

    const actionsHtml = isAuto
        ? `<span class="activity-source-link text-xs text-sky-400/60 italic cursor-default" data-source-task-id="${activity.sourceTaskId}" title="Auto-logged from task">
               <i class="fa-solid fa-link mr-0.5"></i>auto
           </span>`
        : `<div class="flex items-center gap-2">
               <button class="btn-edit-activity text-sky-400/60 hover:text-sky-400 transition-colors text-xs" title="Edit activity">
                   <i class="fa-solid fa-pen"></i>
               </button>
               <button class="btn-delete-activity text-rose-400/60 hover:text-rose-400 transition-colors text-xs" title="Delete activity">
                   <i class="fa-solid fa-trash-can"></i>
               </button>
           </div>`;

    return `<div class="activity-item flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 hover:border-sky-700/30 transition-colors" data-activity-id="${activity.id}">
        <div class="flex-grow min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm text-slate-200 truncate">${escapeHtml(activity.description)}</span>
                ${badge}
            </div>
            <div class="text-xs text-slate-400 mt-0.5">
                ${timeRange} · ${durationText}
            </div>
        </div>
        <div class="shrink-0">
            ${actionsHtml}
        </div>
    </div>`;
}

export function renderActivities(activities, container) {
    if (!container) return;

    if (!activities || activities.length === 0) {
        container.innerHTML = `
            <div class="text-center py-6 text-slate-500 text-sm">
                <i class="fa-regular fa-clock mr-1"></i>
                No activities tracked today. Log one or complete a scheduled task.
            </div>`;
        return;
    }

    container.innerHTML = activities.map(renderActivityItem).join('');
}

function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx jest __tests__/activity-renderer.test.js --no-coverage`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add public/js/activities/renderer.js
git commit -m "feat: add activity renderer with chronological list and empty state"
```

---

## Chunk 6: HTML + Three-Way Form Toggle + Test Utils

### Task 13: Update index.html with activity radio and activity list container

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add Activity radio option to the form**

In `public/index.html`, inside the `<div class="flex flex-col sm:flex-row sm:space-x-4 mb-2">` that holds the Scheduled and Unscheduled radio buttons, add a third option after the Unscheduled radio div. Add it inside a hidden wrapper so it only shows when Activities are enabled:

```html
                        <div
                            id="activity-radio-container"
                            class="hidden"
                        >
                            <div
                                class="flex items-center p-1.5 rounded hover:bg-slate-700/50 transition-colors"
                            >
                                <input
                                    id="activity"
                                    type="radio"
                                    name="task-type"
                                    value="activity"
                                    class="mr-2 h-4 w-4 text-sky-400 focus:ring-sky-400"
                                />
                                <label
                                    for="activity"
                                    class="text-slate-300 flex items-center text-sm"
                                >
                                    <i class="fa-regular fa-clock mr-1 text-sky-400/75"></i
                                    >Activity
                                </label>
                            </div>
                        </div>
```

- [ ] **Step 2: Add activity list container below unscheduled tasks**

In `public/index.html`, after the `<!-- Unscheduled Tasks Section -->` closing `</div>`, add the activity section. Place it before the `<!-- Info Panel -->`:

```html
                <!-- Activity Log Section (hidden until Activities enabled) -->
                <div id="activities-container" class="hidden text-left mb-4 sm:mb-6 px-2 sm:px-0">
                    <div class="flex justify-between items-center mb-2 sm:mb-3">
                        <h3
                            class="text-lg sm:text-xl font-normal text-sky-400 pl-2 flex items-center"
                        >
                            <i class="fa-regular fa-clock mr-2"></i>Today's Activities
                        </h3>
                    </div>
                    <div id="activity-list" class="space-y-1.5">
                        <!-- activities will be generated here by JavaScript -->
                    </div>
                </div>
```

- [ ] **Step 3: Verify the page loads without errors**

Open the app in a browser (or run `firebase serve` if available) and confirm the page loads without JS errors in the console. The new radio and activity section should be hidden.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: add activity radio option and activity list container to HTML"
```

### Task 14: Update test-utils.js setupDOM

**Files:**
- Modify: `__tests__/test-utils.js`

- [ ] **Step 1: Add activity radio and activity list container to setupDOM**

In `__tests__/test-utils.js`, inside the `setupDOM()` function's `document.body.innerHTML` template, add the activity radio after the unscheduled radio in the task-type-toggle section:

```html
          <input type="radio" id="activity" name="task-type" value="activity" />
          <label for="activity">Activity</label>
```

And add the activity list container after the unscheduled task list:

```html
      <div id="activities-container" class="hidden">
        <div id="activity-list"></div>
      </div>
```

- [ ] **Step 2: Run full test suite to verify no regressions**

Run: `npx jest --no-coverage 2>&1 | tail -10`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add __tests__/test-utils.js
git commit -m "test: add activity radio and list container to test DOM setup"
```

### Task 15: Three-way form toggle in dom-renderer.js

**Files:**
- Modify: `public/js/dom-renderer.js`

- [ ] **Step 1: Extend initializeTaskTypeToggle to handle three modes**

In `public/js/dom-renderer.js`, replace the `initializeTaskTypeToggle` function. The new version handles scheduled, unscheduled, and activity radio buttons:

```js
export function initializeTaskTypeToggle() {
    const scheduledRadio = document.getElementById('scheduled');
    const unscheduledRadio = document.getElementById('unscheduled');
    const activityRadio = document.getElementById('activity');
    const timeInputs = document.getElementById('time-inputs');
    const priorityInput = document.getElementById('priority-input');
    const addTaskButton = document.querySelector('#task-form button[type="submit"]');
    const descriptionInput = document.querySelector('input[name="description"]');
    const startTimeInput = document.querySelector('input[name="start-time"]');

    if (
        scheduledRadio instanceof HTMLInputElement &&
        unscheduledRadio instanceof HTMLInputElement &&
        timeInputs instanceof HTMLElement &&
        priorityInput instanceof HTMLElement &&
        addTaskButton instanceof HTMLElement &&
        descriptionInput instanceof HTMLElement
    ) {
        const toggleVisibility = () => {
            const isActivity = activityRadio instanceof HTMLInputElement && activityRadio.checked;

            if (scheduledRadio.checked) {
                timeInputs.classList.remove('hidden');
                priorityInput.classList.add('hidden');
                if (startTimeInput) startTimeInput.setAttribute('required', '');
                addTaskButton.className =
                    'shrink-0 bg-gradient-to-r from-teal-500 to-teal-400 hover:from-teal-400 hover:to-teal-300 px-5 py-2.5 rounded-lg w-full sm:w-auto font-normal text-white transition-all duration-300 flex items-center justify-center';
                descriptionInput.className =
                    'bg-slate-700 p-2.5 rounded-lg w-full border border-slate-600 focus:border-teal-400 focus:outline-none transition-all';
                descriptionInput.placeholder = 'Describe your task...';
                addTaskButton.innerHTML = '<i class="fa-regular fa-plus mr-2"></i>Add Task';
            } else if (isActivity) {
                timeInputs.classList.remove('hidden');
                priorityInput.classList.add('hidden');
                if (startTimeInput) startTimeInput.setAttribute('required', '');
                addTaskButton.className =
                    'shrink-0 bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 px-5 py-2.5 rounded-lg w-full sm:w-auto font-normal text-white transition-all duration-300 flex items-center justify-center';
                descriptionInput.className =
                    'bg-slate-700 p-2.5 rounded-lg w-full border border-slate-600 focus:border-sky-400 focus:outline-none transition-all';
                descriptionInput.placeholder = 'What did you work on?';
                addTaskButton.innerHTML = '<i class="fa-regular fa-clock mr-2"></i>Log Activity';
            } else {
                timeInputs.classList.add('hidden');
                priorityInput.classList.remove('hidden');
                if (startTimeInput) startTimeInput.removeAttribute('required');
                addTaskButton.className =
                    'shrink-0 bg-gradient-to-r from-indigo-500 to-indigo-400 hover:from-indigo-400 hover:to-indigo-300 px-5 py-2.5 rounded-lg w-full sm:w-auto font-normal text-white transition-all duration-300 flex items-center justify-center';
                descriptionInput.className =
                    'bg-slate-700 p-2.5 rounded-lg w-full border border-slate-600 focus:border-indigo-400 focus:outline-none transition-all';
                descriptionInput.placeholder = 'Describe your task...';
                addTaskButton.innerHTML = '<i class="fa-regular fa-plus mr-2"></i>Add Task';
            }
        };

        scheduledRadio.addEventListener('change', toggleVisibility);
        unscheduledRadio.addEventListener('change', toggleVisibility);
        if (activityRadio instanceof HTMLInputElement) {
            activityRadio.addEventListener('change', toggleVisibility);
        }
        toggleVisibility();

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                toggleVisibility();
            }
        });

        window.addEventListener('focus', () => {
            toggleVisibility();
        });
    } else {
        logger.error('DOM elements for task type toggle not found or not of expected types.');
    }
}
```

- [ ] **Step 2: Run existing tests to check for regressions**

Run: `npx jest --no-coverage 2>&1 | tail -10`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add public/js/dom-renderer.js
git commit -m "feat: extend form toggle to support three-way scheduled/unscheduled/activity mode"
```

---

## Chunk 7: Boot Wiring + Integration

### Task 16: Wire activities into app.js boot sequence

**Files:**
- Modify: `public/js/app.js`

- [ ] **Step 1: Add activity imports to app.js**

Add these imports to the top of `public/js/app.js`:

```js
import { loadActivitiesState, getTodaysActivities } from './activities/manager.js';
import { renderActivities } from './activities/renderer.js';
import { extractActivityFormData } from './activities/form-utils.js';
import { handleAddActivity, handleDeleteActivity, handleEditActivity } from './activities/handlers.js';
```

- [ ] **Step 2: Load activities during boot**

In the `initAndBootApp` function, after `await loadTaxonomy();`, add:

```js
    // Load activities state
    if (isActivitiesEnabled()) {
        await loadActivitiesState();
    }
```

- [ ] **Step 3: Show/hide activity UI containers based on feature flag**

In the `initAndBootApp` function, after the existing `if (isActivitiesEnabled())` block that reveals the category dropdown, add code to reveal the activity containers:

```js
    if (isActivitiesEnabled()) {
        const activityRadioContainer = document.getElementById('activity-radio-container');
        if (activityRadioContainer) {
            activityRadioContainer.classList.remove('hidden');
        }

        const activitiesContainer = document.getElementById('activities-container');
        if (activitiesContainer) {
            activitiesContainer.classList.remove('hidden');
        }
    }
```

- [ ] **Step 4: Route form submission to activity handler when activity mode is selected**

Modify the `onTaskFormSubmit` callback inside `initAndBootApp`. Replace the existing implementation with:

```js
        onTaskFormSubmit: async (formElement) => {
            const selectedType = formElement.querySelector('input[name="task-type"]:checked')?.value;

            if (selectedType === 'activity') {
                const activityData = extractActivityFormData(formElement);
                if (!activityData) return;
                await handleAddActivity(activityData);
                formElement.reset();
                const activityRadio = formElement.querySelector('input[name="task-type"][value="activity"]');
                if (activityRadio) activityRadio.checked = true;
                initializeTaskTypeToggle();
                focusTaskDescriptionInput();
                return;
            }

            const taskData = extractTaskFormData(formElement);
            if (!taskData) {
                focusTaskDescriptionInput();
                return;
            }
            const overlapEl = document.getElementById('overlap-warning');
            const reschedulePreApproved = !!(overlapEl && overlapEl.textContent.trim());
            await handleAddTaskProcess(formElement, taskData, { reschedulePreApproved });
        },
```

- [ ] **Step 5: Add activity rendering to refreshTaskDisplays**

In the `initAndBootApp` function, modify the `refreshTaskDisplays` closure to also render activities. After the existing `refreshCurrentGapHighlight();` line, add:

```js
        if (isActivitiesEnabled()) {
            const activityListEl = document.getElementById('activity-list');
            if (activityListEl) {
                renderActivities(getTodaysActivities(), activityListEl);
            }
        }
```

- [ ] **Step 6: Add activity list event delegation for edit and delete buttons**

In the `initAndBootApp` function, after the existing event listener setup (after `initializeClearTasksHandlers()`), add:

```js
    // Activity list event delegation
    if (isActivitiesEnabled()) {
        const activityList = document.getElementById('activity-list');
        if (activityList) {
            activityList.addEventListener('click', (event) => {
                const target = event.target;
                const activityItem = target.closest('[data-activity-id]');
                if (!activityItem) return;
                const activityId = activityItem.dataset.activityId;

                if (target.closest('.btn-delete-activity')) {
                    handleDeleteActivity(activityId);
                } else if (target.closest('.btn-edit-activity')) {
                    // For v1, edit via a prompt-style inline flow.
                    // The activity description is extracted from the DOM, presented
                    // in an editable input, and handleEditActivity is called on save.
                    // A richer inline edit form can replace this in a future phase.
                    const descEl = activityItem.querySelector('.text-sm.text-slate-200');
                    const currentDesc = descEl ? descEl.textContent.trim() : '';
                    const newDesc = window.prompt('Edit activity description:', currentDesc);
                    if (newDesc !== null && newDesc.trim() !== '' && newDesc.trim() !== currentDesc) {
                        handleEditActivity(activityId, { description: newDesc.trim() });
                    }
                }
            }, { signal });
        }
    }
```

- [ ] **Step 7: Update refreshFromStorage to reload activities**

In the `refreshFromStorage` function, add activity reloading after `await loadTasksIntoState();`:

```js
    if (isActivitiesEnabled()) {
        await loadActivitiesState();
    }
```

- [ ] **Step 8: Run full test suite**

Run: `npx jest --no-coverage 2>&1 | tail -10`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add public/js/app.js
git commit -m "feat: wire activity boot sequence, form routing, rendering, and event delegation"
```

### Task 17: Manual smoke test

- [ ] **Step 1: Start the app locally and enable Activities in settings**

Open the app, go to Settings (gear icon), and toggle "Enable Activities" on. Reload when prompted.

- [ ] **Step 2: Verify the Activity radio option appears in the form**

The three-way toggle should show Scheduled, Unscheduled, and Activity. Switching to Activity should turn the button sky blue and change placeholder to "What did you work on?"

- [ ] **Step 3: Log a manual activity**

Select Activity mode, enter a description, pick a category, set a start time and duration, submit. Verify:
- Toast shows "Activity logged."
- Activity appears in the "Today's Activities" list below
- Category badge renders if category was selected

- [ ] **Step 4: Edit a manual activity**

Click the pencil icon on the manual activity. A browser prompt should appear with the current description. Change it and confirm. Verify the activity list re-renders with the updated description.

- [ ] **Step 5: Complete a scheduled task and verify auto-logging**

Add a scheduled task, complete it (checkbox). Verify:
- Confetti still triggers
- A new activity appears in the activity list with a link icon and "auto" label
- The auto activity shows the correct description, time range, and category
- The auto activity has NO edit or delete buttons

- [ ] **Step 6: Delete a manual activity**

Click the trash icon on a manual activity. Verify it disappears.

- [ ] **Step 7: Disable Activities and verify clean state**

Toggle Activities off in settings, reload. Verify:
- Activity radio is hidden
- Activity list section is hidden
- Completing a scheduled task does NOT create an activity

- [ ] **Step 8: Run the full test suite with coverage**

Run: `npx jest 2>&1 | tail -20`
Expected: All tests PASS, coverage thresholds met (90/90/90/79)

- [ ] **Step 9: Commit any fixes from smoke testing**

```bash
git add -A
git commit -m "fix: address issues found during Phase 4 smoke testing"
```

(Skip this step if no fixes were needed.)
