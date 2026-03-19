# Fortudo Activities — Phase 1: Reorganize & Foundation

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the fortudo codebase into `tasks/` folder structure, introduce an app-coordinator pattern, add a toast notification system, and wire up day-boundary detection — all without changing any user-facing behavior.

**Architecture:** Move all task-related modules from flat `public/js/` and `public/js/handlers/` into a `public/js/tasks/` subfolder. Introduce `app-coordinator.js` to centralize post-action side effects currently scattered across handlers. Add `toast-manager.js` for non-blocking notifications. Rename `room-ui-handler.js` → `room-renderer.js` for consistency. Delete the now-empty `handlers/` directory.

**Tech Stack:** Vanilla JS (ES modules), PouchDB, Jest + jsdom, Tailwind CSS

**Spec:** `docs/plans/2026-03-16-fortudo-activities-design.md`

**Repo:** `https://github.com/iconix/fortudo` (clone locally before starting)

---

## File Structure

### Files to move

| # | Current Path | New Path | Notes |
|---|---|---|---|
| 1 | `handlers/scheduled-task-handlers.js` | `tasks/scheduled-handlers.js` | |
| 2 | `handlers/unscheduled-task-handlers.js` | `tasks/unscheduled-handlers.js` | |
| 3 | `handlers/add-task-handler.js` | `tasks/add-handler.js` | |
| 4 | `handlers/clear-tasks-handler.js` | `tasks/clear-handler.js` | |
| 5 | `handlers/room-ui-handler.js` | `room-renderer.js` | Stays at root (not task-specific) |
| 6 | `task-manager.js` | `tasks/manager.js` | Renamed |
| 7 | `scheduled-task-renderer.js` | `tasks/scheduled-renderer.js` | Renamed |
| 8 | `unscheduled-task-renderer.js` | `tasks/unscheduled-renderer.js` | Renamed |
| 9 | `form-utils.js` | `tasks/form-utils.js` | |
| 10 | `task-validators.js` | `tasks/validators.js` | Renamed |
| 11 | `confirmation-helpers.js` | `tasks/confirmation-helpers.js` | |

All paths are relative to `public/js/`.

### Files to create

| File | Responsibility |
|---|---|
| `public/js/app-coordinator.js` | Centralized post-action orchestration |
| `public/js/toast-manager.js` | Non-blocking toast notifications |
| `__tests__/app-coordinator.test.js` | Coordinator unit tests |
| `__tests__/toast-manager.test.js` | Toast manager unit tests |

### Files that stay at root (no move)

`app.js`, `storage.js`, `dom-renderer.js`, `modal-manager.js`, `room-manager.js`, `sync-manager.js`, `reschedule-engine.js`, `utils.js`, `config.js`

**Note on `reschedule-engine.js`:** This could arguably move into `tasks/` since it only applies to tasks, but the design spec lists it as an open question. Keeping it at root for now; revisit if the `tasks/` folder feels incomplete.

---

## Chunk 1: File Reorganization

### Task 1: Move all task-related files into tasks/

**Files:**
- Create: `public/js/tasks/` directory
- Move: all 11 files listed in the move table above
- Modify: every file that imports from a moved file (see import maps below)

This is one atomic operation. All moves and all import updates happen together so the codebase is never in a broken state.

- [ ] **Step 1: Create the tasks/ directory and move all files**

```bash
cd public/js
mkdir -p tasks

# Move handler files (handlers/ → tasks/)
git mv handlers/scheduled-task-handlers.js tasks/scheduled-handlers.js
git mv handlers/unscheduled-task-handlers.js tasks/unscheduled-handlers.js
git mv handlers/add-task-handler.js tasks/add-handler.js
git mv handlers/clear-tasks-handler.js tasks/clear-handler.js

# Move room-ui-handler to root with rename
git mv handlers/room-ui-handler.js room-renderer.js

# Move root-level task files (root → tasks/)
git mv task-manager.js tasks/manager.js
git mv scheduled-task-renderer.js tasks/scheduled-renderer.js
git mv unscheduled-task-renderer.js tasks/unscheduled-renderer.js
git mv form-utils.js tasks/form-utils.js
git mv task-validators.js tasks/validators.js
git mv confirmation-helpers.js tasks/confirmation-helpers.js
```

- [ ] **Step 2: Update imports in moved files (within tasks/)**

Each file that moved needs its import paths adjusted. The pattern:
- Files that were in `handlers/` used `'../foo.js'` to reach root modules. Now in `tasks/`, root modules are still `'../foo.js'` (no change for root targets), but other task files are now siblings (`'./foo.js'`).
- Files that were at root used `'./foo.js'` to reach other root files. Now in `tasks/`, root modules become `'../foo.js'`, and other task files become `'./foo.js'`.

**`tasks/scheduled-handlers.js`** (was: `handlers/scheduled-task-handlers.js`):
```
Old                              → New
'../task-manager.js'             → './manager.js'
'../form-utils.js'               → './form-utils.js'
'../scheduled-task-renderer.js'  → './scheduled-renderer.js'
'../confirmation-helpers.js'     → './confirmation-helpers.js'
'../modal-manager.js'            → '../modal-manager.js'     (no change)
'../dom-renderer.js'             → '../dom-renderer.js'      (no change)
'../utils.js'                    → '../utils.js'             (no change)
```

**`tasks/unscheduled-handlers.js`** (was: `handlers/unscheduled-task-handlers.js`):
```
Old                              → New
'../task-manager.js'             → './manager.js'
'../form-utils.js'               → './form-utils.js'
'../confirmation-helpers.js'     → './confirmation-helpers.js'
'../modal-manager.js'            → '../modal-manager.js'     (no change)
'../dom-renderer.js'             → '../dom-renderer.js'      (no change)
'../utils.js'                    → '../utils.js'             (no change)
```

**`tasks/add-handler.js`** (was: `handlers/add-task-handler.js`):
```
Old                              → New
'../task-manager.js'             → './manager.js'
'../form-utils.js'               → './form-utils.js'
'../scheduled-task-renderer.js'  → './scheduled-renderer.js'
'../modal-manager.js'            → '../modal-manager.js'     (no change)
'../dom-renderer.js'             → '../dom-renderer.js'      (no change)
'../utils.js'                    → '../utils.js'             (no change)
```

**`tasks/clear-handler.js`** (was: `handlers/clear-tasks-handler.js`):
```
Old                              → New
'../task-manager.js'             → './manager.js'
'../modal-manager.js'            → '../modal-manager.js'     (no change)
'../dom-renderer.js'             → '../dom-renderer.js'      (no change)
```

**`tasks/confirmation-helpers.js`** (was: `confirmation-helpers.js`):
```
Old                              → New
'./task-manager.js'              → './manager.js'
'./modal-manager.js'             → '../modal-manager.js'
'./dom-renderer.js'              → '../dom-renderer.js'
'./utils.js'                     → '../utils.js'
```

**`tasks/scheduled-renderer.js`** (was: `scheduled-task-renderer.js`):
```
Old                              → New
'./utils.js'                     → '../utils.js'
'./reschedule-engine.js'         → '../reschedule-engine.js'
'./form-utils.js'                → './form-utils.js'         (no change — both in tasks/)
```

**`tasks/unscheduled-renderer.js`** (was: `unscheduled-task-renderer.js`):
```
Old                              → New
'./utils.js'                     → '../utils.js'
'./form-utils.js'                → './form-utils.js'         (no change — both in tasks/)
```

**`tasks/manager.js`** (was: `task-manager.js`):
Read the file's import block first. Expected changes:
```
Old                              → New
'./storage.js'                   → '../storage.js'
'./utils.js'                     → '../utils.js'
'./reschedule-engine.js'         → '../reschedule-engine.js'
'./task-validators.js'           → './validators.js'
```
Verify: read the actual imports and update any others that point to root-level modules with `'../'` prefix.

**`tasks/form-utils.js`** (was: `form-utils.js`):
Read the file's import block first. Expected changes:
```
Old                              → New
'./utils.js'                     → '../utils.js'
'./modal-manager.js'             → '../modal-manager.js'
'./task-manager.js'              → './manager.js'
'./task-validators.js'           → './validators.js'
'./reschedule-engine.js'         → '../reschedule-engine.js'
```
Verify: read the actual imports and update any others.

**`tasks/validators.js`** (was: `task-validators.js`):
No imports from other modules. No changes needed.

**`room-renderer.js`** (was: `handlers/room-ui-handler.js`):
```
Old                              → New
'../room-manager.js'             → './room-manager.js'
```

- [ ] **Step 3: Update imports in root-level source files**

**`app.js`** — the most import changes:
```
Old                                         → New
'./task-manager.js'                         → './tasks/manager.js'
'./form-utils.js'                           → './tasks/form-utils.js'
'./scheduled-task-renderer.js'              → './tasks/scheduled-renderer.js'
'./handlers/scheduled-task-handlers.js'     → './tasks/scheduled-handlers.js'
'./handlers/unscheduled-task-handlers.js'   → './tasks/unscheduled-handlers.js'
'./handlers/add-task-handler.js'            → './tasks/add-handler.js'
'./handlers/clear-tasks-handler.js'         → './tasks/clear-handler.js'
'./handlers/room-ui-handler.js'             → './room-renderer.js'
```
Unchanged: `'./modal-manager.js'`, `'./storage.js'`, `'./utils.js'`, `'./dom-renderer.js'`, `'./room-manager.js'`, `'./sync-manager.js'`

**`dom-renderer.js`**:
```
Old                                → New
'./task-manager.js'                → './tasks/manager.js'
'./task-validators.js'             → './tasks/validators.js'
'./form-utils.js'                  → './tasks/form-utils.js'
'./scheduled-task-renderer.js'     → './tasks/scheduled-renderer.js'
'./unscheduled-task-renderer.js'   → './tasks/unscheduled-renderer.js'
```
Unchanged: `'./utils.js'`

- [ ] **Step 4: Update imports in test files**

**`__tests__/scheduled-task-handlers.test.js`**:
```
Old                                                  → New
'../public/js/handlers/scheduled-task-handlers.js'   → '../public/js/tasks/scheduled-handlers.js'
'../public/js/task-manager.js'                       → '../public/js/tasks/manager.js'
```

**`__tests__/unscheduled-task-handlers.test.js`**:
```
Old                                                    → New
'../public/js/handlers/unscheduled-task-handlers.js'   → '../public/js/tasks/unscheduled-handlers.js'
'../public/js/task-manager.js'                         → '../public/js/tasks/manager.js'
```

**`__tests__/add-task-handler.test.js`**:
```
Old                                            → New
'../public/js/handlers/add-task-handler.js'    → '../public/js/tasks/add-handler.js'
'../public/js/task-manager.js'                 → '../public/js/tasks/manager.js'
```

**`__tests__/clear-tasks-handler.test.js`**:
```
Old                                              → New
'../public/js/handlers/clear-tasks-handler.js'   → '../public/js/tasks/clear-handler.js'
'../public/js/task-manager.js'                   → '../public/js/tasks/manager.js'
```

**`__tests__/room-ui-handler.test.js`**:
```
Old                                              → New
'../public/js/handlers/room-ui-handler.js'       → '../public/js/room-renderer.js'
```
Also update the `jest.mock` path if it mocks `room-ui-handler`:
```
jest.mock('../public/js/handlers/room-ui-handler.js' → no, this file mocks room-manager.js which doesn't move
```

**`__tests__/integration.test.js`**:
```
Old                                              → New
'../public/js/scheduled-task-renderer.js'        → '../public/js/tasks/scheduled-renderer.js'
'../public/js/task-manager.js'                   → '../public/js/tasks/manager.js'
'../public/js/dom-renderer.js'                   → no change
'../public/js/utils.js'                          → no change
'../public/js/storage.js'                        → no change
'../public/js/sync-manager.js'                   → no change
```

**`__tests__/scheduled-task-renderer.test.js`**:
```
Old                                              → New
'../public/js/scheduled-task-renderer.js'        → '../public/js/tasks/scheduled-renderer.js'
'../public/js/utils.js'                          → no change
```

**`__tests__/form-utils.test.js`**:
```
Old                                     → New
'../public/js/form-utils.js'            → '../public/js/tasks/form-utils.js'
'../public/js/modal-manager.js'         → no change
```

**`__tests__/test-utils.js`**:
No changes needed (imports from `'../public/js/utils.js'` which doesn't move).

**Other test files** (`storage.test.js`, `room-manager.test.js`, `modal-manager.test.js`, `reschedule-engine.test.js`):
Check each for imports from moved files. These test root-level modules so likely no changes needed, but verify.

**Jest mock paths**: Search all test files for `jest.mock(` calls that reference moved files. Update those paths too.

- [ ] **Step 5: Verify handlers/ directory is empty**

Git doesn't track empty directories, so after all `git mv` commands, the `handlers/` directory should no longer appear in the git index. Verify with:

```bash
ls public/js/handlers/ 2>/dev/null && echo "WARNING: handlers/ still has files" || echo "handlers/ is gone or empty"
```

If the directory still exists on disk (but is untracked), remove it: `rmdir public/js/handlers`

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all existing tests pass. If any fail, the error will indicate which import path is wrong. Fix and re-run.

- [ ] **Step 7: Manual smoke test**

```bash
npx serve public
```

Open the app in a browser. Verify:
- Room entry screen loads
- Can enter a room
- Can add scheduled and unscheduled tasks
- Can complete, edit, delete tasks
- Sync indicator works (if CouchDB is configured)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: move task files into tasks/ directory, rename room-ui-handler to room-renderer

Move all task-related modules (handlers, renderers, manager, validators,
form-utils, confirmation-helpers) into public/js/tasks/ subfolder.
Rename room-ui-handler.js to room-renderer.js at root level.
Delete empty handlers/ directory. Update all import paths in source
and test files."
```

---

### Task 2: Create toast-manager.js (TDD)

**Files:**
- Create: `public/js/toast-manager.js`
- Create: `__tests__/toast-manager.test.js`

The toast manager renders non-blocking notifications that auto-dismiss after a timeout. It replaces `showAlert()` for informational messages.

- [ ] **Step 1: Write the failing test for showToast**

Create `__tests__/toast-manager.test.js`:

```js
/**
 * @jest-environment jsdom
 */

import { showToast, getToastContainer } from '../public/js/toast-manager.js';

describe('toast-manager', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        const container = getToastContainer();
        if (container) container.remove();
    });

    test('showToast creates a toast element in the container', () => {
        showToast('Task added successfully');
        const container = getToastContainer();
        expect(container).toBeTruthy();
        expect(container.children.length).toBe(1);
        expect(container.textContent).toContain('Task added successfully');
    });

    test('showToast auto-dismisses after default timeout (3500ms)', () => {
        showToast('Temporary message');
        const container = getToastContainer();
        expect(container.children.length).toBe(1);

        jest.advanceTimersByTime(3499);
        expect(container.children.length).toBe(1);

        jest.advanceTimersByTime(1);
        expect(container.children.length).toBe(0);
    });

    test('showToast accepts custom timeout', () => {
        showToast('Quick message', { duration: 2000 });
        const container = getToastContainer();
        expect(container.children.length).toBe(1);

        jest.advanceTimersByTime(2000);

        expect(container.children.length).toBe(0);
    });

    test('showToast accepts a theme color', () => {
        showToast('Teal message', { theme: 'teal' });
        const toast = getToastContainer().children[0];
        expect(toast.className).toContain('teal');
    });

    test('multiple toasts stack in the container', () => {
        showToast('First');
        showToast('Second');
        showToast('Third');
        const container = getToastContainer();
        expect(container.children.length).toBe(3);
    });

    test('toast container is created lazily on first showToast', () => {
        expect(document.querySelector('[data-toast-container]')).toBeNull();
        showToast('Hello');
        expect(document.querySelector('[data-toast-container]')).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/toast-manager.test.js --verbose
```

Expected: FAIL — cannot find module `'../public/js/toast-manager.js'`

- [ ] **Step 3: Implement toast-manager.js**

Create `public/js/toast-manager.js`:

```js
/** @type {HTMLElement|null} */
let container = null;

const THEME_CLASSES = {
    teal: 'bg-teal-900/90 border-teal-700 text-teal-200',
    indigo: 'bg-indigo-900/90 border-indigo-700 text-indigo-200',
    amber: 'bg-amber-900/90 border-amber-700 text-amber-200',
    rose: 'bg-rose-900/90 border-rose-700 text-rose-200',
    default: 'bg-slate-800/90 border-slate-600 text-slate-200'
};

const DEFAULT_DURATION = 3500;

/**
 * Get or create the toast container element.
 * @returns {HTMLElement}
 */
export function getToastContainer() {
    if (!container || !document.body.contains(container)) {
        container = document.createElement('div');
        container.setAttribute('data-toast-container', '');
        container.className =
            'fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Show a non-blocking toast notification.
 * @param {string} message - The message to display
 * @param {Object} [options]
 * @param {number} [options.duration=3500] - Auto-dismiss after this many ms
 * @param {string} [options.theme='default'] - Color theme: teal, indigo, amber, rose, default
 */
export function showToast(message, options = {}) {
    const { duration = DEFAULT_DURATION, theme = 'default' } = options;
    const toastContainer = getToastContainer();

    const toast = document.createElement('div');
    const themeClasses = THEME_CLASSES[theme] || THEME_CLASSES.default;
    toast.className = `${themeClasses} px-4 py-2 rounded-lg border text-sm shadow-lg pointer-events-auto transition-opacity duration-300`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, duration);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/toast-manager.test.js --verbose
```

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/toast-manager.js __tests__/toast-manager.test.js
git commit -m "feat: add toast-manager for non-blocking notifications (TDD)"
```

---

### Task 3: Migrate showAlert calls to toasts

**Files:**
- Modify: `public/js/tasks/scheduled-handlers.js`
- Modify: `public/js/tasks/unscheduled-handlers.js`
- Modify: `public/js/tasks/add-handler.js`
- Modify: `public/js/tasks/clear-handler.js`
- Modify: affected test files (update mocks/assertions)

Migrate `showAlert()` calls that are non-blocking feedback to `showToast()`. Keep `showAlert()` for messages that result from user-initiated confirmation flows where context matters. Keep all `askConfirmation()` calls as modals.

**Migration criteria:**
- **→ Toast:** success messages, informational messages, "no items found" messages
- **→ Keep as alert:** error messages from confirmation flows where the user needs to see what went wrong before retrying

- [ ] **Step 1: Identify all showAlert calls and classify them**

Read each handler file and classify every `showAlert()` call. Create a table of (file, line, message, decision).

Guidelines:
- Success confirmations ("All scheduled tasks cleared", "Task added") → toast
- Empty-state messages ("There are no tasks to clear") → toast
- Validation/error from confirmation flow ("Could not complete task", "Task not scheduled to avoid overlap") → keep as alert (user just made a decision and needs to see why it failed)
- Auto-reschedule notifications → toast

- [ ] **Step 2: Add showToast import to handler files**

For each handler file that will use toasts, add:
```js
import { showToast } from '../toast-manager.js';
```

- [ ] **Step 3: Replace identified showAlert calls with showToast**

For each call classified as toast:
```js
// Before
showAlert('All scheduled tasks have been cleared.', 'teal');

// After
showToast('All scheduled tasks have been cleared.', { theme: 'teal' });
```

Note: `showToast` takes `{ theme }` as second argument, not a bare string like `showAlert`. Update the call signature accordingly.

- [ ] **Step 4: Update test assertions**

For test files that assert on `showAlert` being called with a migrated message:
- Add `jest.mock` for `toast-manager.js` if not already present
- Change `expect(showAlert).toHaveBeenCalledWith(...)` to `expect(showToast).toHaveBeenCalledWith(...)`
- Update the expected argument format from `(msg, theme)` to `(msg, { theme })`

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: migrate non-blocking showAlert calls to showToast

Replace informational and success showAlert() calls in task handlers
with showToast() for non-blocking auto-dismissing notifications.
Keep showAlert() for error messages from confirmation flows."
```

---

## Chunk 2: App Coordinator & Day Boundary

### Task 4: Create app-coordinator.js (TDD)

**Files:**
- Create: `public/js/app-coordinator.js`
- Create: `__tests__/app-coordinator.test.js`

The coordinator centralizes post-action side effects. Handlers call the coordinator after state changes instead of inlining refreshUI/confetti/updateStartTime.

- [ ] **Step 1: Write failing tests for coordinator events**

Create `__tests__/app-coordinator.test.js`:

```js
/**
 * @jest-environment jsdom
 */

// Mock all dependencies
jest.mock('../public/js/dom-renderer.js', () => ({
    refreshUI: jest.fn(),
    updateStartTimeField: jest.fn()
}));

jest.mock('../public/js/tasks/scheduled-renderer.js', () => ({
    triggerConfettiAnimation: jest.fn(),
    refreshActiveTaskColor: jest.fn(),
    refreshCurrentGapHighlight: jest.fn()
}));

jest.mock('../public/js/tasks/manager.js', () => ({
    getSuggestedStartTime: jest.fn(() => '10:00'),
    getTaskState: jest.fn(() => [])
}));

import {
    onTaskCompleted,
    onTaskAdded,
    onTaskUpdated,
    onTaskDeleted,
    onDayChanged
} from '../public/js/app-coordinator.js';

import { refreshUI, updateStartTimeField } from '../public/js/dom-renderer.js';
import { triggerConfettiAnimation } from '../public/js/tasks/scheduled-renderer.js';
import { getSuggestedStartTime } from '../public/js/tasks/manager.js';

describe('app-coordinator', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('onTaskCompleted', () => {
        test('refreshes UI, triggers confetti, and updates start time', () => {
            const task = { id: 'sched-123', type: 'scheduled' };
            onTaskCompleted(task);

            expect(refreshUI).toHaveBeenCalled();
            expect(triggerConfettiAnimation).toHaveBeenCalledWith('sched-123');
            expect(updateStartTimeField).toHaveBeenCalledWith('10:00', true);
        });

        test('skips confetti for unscheduled tasks', () => {
            const task = { id: 'unsched-123', type: 'unscheduled' };
            onTaskCompleted(task);

            expect(refreshUI).toHaveBeenCalled();
            expect(triggerConfettiAnimation).not.toHaveBeenCalled();
        });
    });

    describe('onTaskAdded', () => {
        test('refreshes UI and updates start time for scheduled tasks', () => {
            const task = { id: 'sched-456', type: 'scheduled' };
            onTaskAdded(task);

            expect(refreshUI).toHaveBeenCalled();
            expect(updateStartTimeField).toHaveBeenCalledWith('10:00', true);
        });

        test('refreshes UI without start time update for unscheduled tasks', () => {
            const task = { id: 'unsched-456', type: 'unscheduled' };
            onTaskAdded(task);

            expect(refreshUI).toHaveBeenCalled();
            expect(updateStartTimeField).not.toHaveBeenCalled();
        });
    });

    describe('onTaskUpdated', () => {
        test('refreshes UI and updates start time', () => {
            const task = { id: 'sched-789', type: 'scheduled' };
            onTaskUpdated(task);

            expect(refreshUI).toHaveBeenCalled();
            expect(updateStartTimeField).toHaveBeenCalledWith('10:00', true);
        });
    });

    describe('onTaskDeleted', () => {
        test('refreshes UI and updates start time', () => {
            onTaskDeleted('sched-000');

            expect(refreshUI).toHaveBeenCalled();
            expect(updateStartTimeField).toHaveBeenCalledWith('10:00', true);
        });
    });

    describe('onDayChanged', () => {
        test('is callable (placeholder for future day-boundary logic)', () => {
            expect(() => onDayChanged()).not.toThrow();
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/app-coordinator.test.js --verbose
```

Expected: FAIL — cannot find module `'../public/js/app-coordinator.js'`

- [ ] **Step 3: Implement app-coordinator.js**

Create `public/js/app-coordinator.js`:

```js
import { refreshUI, updateStartTimeField } from './dom-renderer.js';
import { triggerConfettiAnimation } from './tasks/scheduled-renderer.js';
import { getSuggestedStartTime } from './tasks/manager.js';

/**
 * Called after a task is marked as completed.
 * Handles: UI refresh, confetti animation (scheduled only), start time update.
 * Future: auto-log activity (Phase 4).
 * @param {Object} task - The completed task
 */
export function onTaskCompleted(task) {
    if (task.type === 'scheduled') {
        triggerConfettiAnimation(task.id);
        updateStartTimeField(getSuggestedStartTime(), true);
    }
    refreshUI();
}

/**
 * Called after a new task is added.
 * Handles: UI refresh, start time update (scheduled only).
 * @param {Object} task - The added task
 */
export function onTaskAdded(task) {
    refreshUI();
    if (task.type === 'scheduled') {
        updateStartTimeField(getSuggestedStartTime(), true);
    }
}

/**
 * Called after a task is updated (edited, rescheduled, locked, etc.).
 * Handles: UI refresh, start time update.
 * @param {Object} task - The updated task
 */
export function onTaskUpdated(task) {
    refreshUI();
    updateStartTimeField(getSuggestedStartTime(), true);
}

/**
 * Called after a task is deleted.
 * Handles: UI refresh, start time update.
 * @param {string} taskId - The deleted task's ID
 */
export function onTaskDeleted(taskId) {
    refreshUI();
    updateStartTimeField(getSuggestedStartTime(), true);
}

/**
 * Called when the calendar date rolls over at midnight.
 * Placeholder for future: clear schedule, habit reset, activity day rollover.
 */
export function onDayChanged() {
    // Phase 4+: auto-archive today's activities, reset habits
}

/**
 * Called after a successful sync completes.
 * Handled in app.js via refreshFromStorage() — listed here for documentation.
 * The coordinator doesn't own this yet since it requires async storage reload.
 */
// export function onSyncComplete() { }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/app-coordinator.test.js --verbose
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/app-coordinator.js __tests__/app-coordinator.test.js
git commit -m "feat: add app-coordinator for centralized post-action orchestration (TDD)"
```

---

### Task 5: Wire coordinator into scheduled task handlers

**Files:**
- Modify: `public/js/tasks/scheduled-handlers.js`
- Modify: `__tests__/scheduled-task-handlers.test.js`

Replace inline post-action logic (refreshUI + confetti + updateStartTime) in scheduled task handlers with coordinator calls.

- [ ] **Step 1: Read scheduled-handlers.js and identify extraction points**

Read `public/js/tasks/scheduled-handlers.js` fully. For each handler function, identify:
- Where `refreshUI()` is called
- Where `triggerConfettiAnimation()` is called
- Where `updateStartTimeField()` is called
- What the equivalent coordinator call would be

**Expected extraction pattern (handleCompleteTask):**
```js
// Before (scattered post-action logic):
refreshUI();
triggerConfettiAnimation(taskId);
updateStartTimeField(getSuggestedStartTime(), true);

// After (single coordinator call):
coordinator.onTaskCompleted(task);
```

- [ ] **Step 2: Add coordinator import, remove replaced imports**

In `tasks/scheduled-handlers.js`:
```js
import { onTaskCompleted, onTaskUpdated, onTaskDeleted } from '../app-coordinator.js';
```

Remove imports that are no longer directly used by handlers (only if ALL call sites in this file are replaced):
- `triggerConfettiAnimation` from `'./scheduled-renderer.js'` — if only used in handleCompleteTask
- `updateStartTimeField` from `'../dom-renderer.js'` — if only used in completion/delete flows
- `getSuggestedStartTime` from `'./manager.js'` — if only used with updateStartTimeField

**Important:** Check each import carefully. If it's still used elsewhere in the file (e.g., `refreshUI` in a non-extracted path), keep it.

- [ ] **Step 3: Replace post-action logic with coordinator calls**

For each handler, replace the inline post-action code with the appropriate coordinator call. The handler should still handle:
- Manager state changes (these stay)
- User feedback (showAlert/showToast — these stay)
- Confirmation flows (these stay)

Only the cross-cutting side effects move to the coordinator.

- [ ] **Step 4: Update scheduled-task-handlers tests**

Update test expectations:
- Mock `app-coordinator.js` in the test file
- Replace assertions on `refreshUI`/`triggerConfettiAnimation` with assertions on `onTaskCompleted`/`onTaskUpdated`/`onTaskDeleted`
- Remove mocks for functions that are no longer directly called by handlers

```js
jest.mock('../public/js/app-coordinator.js', () => ({
    onTaskCompleted: jest.fn(),
    onTaskUpdated: jest.fn(),
    onTaskDeleted: jest.fn()
}));

import { onTaskCompleted } from '../public/js/app-coordinator.js';

// In test:
expect(onTaskCompleted).toHaveBeenCalledWith(expect.objectContaining({ id: taskId }));
```

- [ ] **Step 5: Run tests**

```bash
npx jest __tests__/scheduled-task-handlers.test.js --verbose
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add public/js/tasks/scheduled-handlers.js __tests__/scheduled-task-handlers.test.js
git commit -m "refactor: wire scheduled handlers to app-coordinator

Replace inline refreshUI/confetti/updateStartTime in scheduled task
handlers with coordinator.onTaskCompleted/onTaskUpdated/onTaskDeleted."
```

---

### Task 6: Wire coordinator into remaining handlers

**Files:**
- Modify: `public/js/tasks/unscheduled-handlers.js`
- Modify: `public/js/tasks/add-handler.js`
- Modify: `public/js/tasks/clear-handler.js`
- Modify: corresponding test files

Same pattern as Task 5, applied to the other three handler files.

- [ ] **Step 1: Wire coordinator into unscheduled-handlers.js**

Add coordinator import. Replace inline `refreshUI()` calls after state changes with `onTaskUpdated(task)` / `onTaskDeleted(taskId)` as appropriate.

**Note:** Some `refreshUI()` calls in unscheduled handlers are for UI-only state changes (toggling inline edit mode). These are not "task events" and should NOT go through the coordinator. Only replace refreshUI calls that follow actual task state mutations (delete, schedule, complete toggle).

- [ ] **Step 2: Wire coordinator into add-handler.js**

Add coordinator import. After the successful add path (line ~126 in current code), the handler does: form reset, initializeTaskTypeToggle, updateStartTimeField, focusTaskDescriptionInput, showAlert, refreshUI.

The coordinator should handle `refreshUI` and `updateStartTimeField`. The form-specific logic (reset, focus, toggle) stays in the handler because it's handler-specific, not a cross-cutting concern.

Replace the tail of the success path:
```js
// Before:
if (initialTaskData.taskType === 'scheduled') {
    updateStartTimeField(getSuggestedStartTime(), true);
}
// ... showAlert ...
refreshUI();

// After:
onTaskAdded({ type: initialTaskData.taskType, id: operationResult.taskId });
// ... showAlert/showToast ...
```

- [ ] **Step 3: Wire coordinator into clear-handler.js**

For the "clear scheduled" flow, after `deleteAllScheduledTasks()` succeeds:
```js
// Before:
refreshUI();
updateStartTimeField(getSuggestedStartTime(), true);

// After:
onTaskDeleted('all-scheduled');  // or just call the two functions — clear is a batch operation
```

**Decision point:** The "clear all tasks" and "clear completed tasks" operations are batch operations, not single-task events. The coordinator's `onTaskDeleted` is designed for single-task deletion. Options:
- (a) Call `onTaskDeleted` with a sentinel value — ugly
- (b) Keep inline `refreshUI()` + `updateStartTimeField()` for batch operations — pragmatic
- (c) Add `onTasksCleared()` to coordinator — clean but adds scope

**Recommended:** option (b) for now. The clear handler already works and doesn't need coordinator mediation. Activities won't auto-log from deletes. Leave these as-is and only extract coordinator calls from single-task handlers.

- [ ] **Step 4: Update test files for all modified handlers**

Update `__tests__/unscheduled-task-handlers.test.js` and `__tests__/add-task-handler.test.js` with coordinator mocks and updated assertions. Same pattern as Task 5 Step 4.

For `__tests__/clear-tasks-handler.test.js`: no changes needed if we kept inline calls (option b).

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: wire remaining handlers to app-coordinator

Wire unscheduled and add-task handlers to coordinator for post-action
orchestration. Clear-tasks handler keeps inline calls (batch operation)."
```

---

### Task 7: Add day-boundary detection

**Files:**
- Modify: `public/js/app.js`
- Modify: `__tests__/app-coordinator.test.js` (if adding onDayChanged behavior)

- [ ] **Step 1: Add day-boundary check to the 1-second interval in app.js**

In `app.js`, the existing 1-second interval (around line 224) refreshes active task color and gap highlights. Add a day-boundary check:

```js
// In initAndBootApp(), around line 224:
let lastDate = new Date().toDateString();

const activeTaskColorInterval = setInterval(() => {
    refreshActiveTaskColor(getTaskState());
    refreshCurrentGapHighlight();
    refreshStartTimeField();

    // Day boundary detection
    const currentDate = new Date().toDateString();
    if (currentDate !== lastDate) {
        lastDate = currentDate;
        onDayChanged();
    }
}, 1000);
```

Add the coordinator import at the top of `app.js`:
```js
import { onDayChanged } from './app-coordinator.js';
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: all tests pass. The day-boundary code is a runtime check that won't affect jsdom tests.

- [ ] **Step 3: Manual smoke test**

Open the app in a browser. Verify the 1-second interval still works (active task colors update, clock ticks). The day-boundary check is passive until midnight and won't change behavior.

- [ ] **Step 4: Commit**

```bash
git add public/js/app.js
git commit -m "feat: add day-boundary detection to 1-second interval

Check if the calendar date has changed on each tick. Calls
coordinator.onDayChanged() on rollover, which is a placeholder
for future day-boundary features (activity archival, habit reset)."
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full test suite with coverage**

```bash
npm test -- --coverage
```

Expected: all tests pass, coverage meets thresholds (80% statements, 75% branches).

- [ ] **Step 2: Run lint and format checks**

```bash
npm run check
```

Expected: no lint or format errors. If the file moves introduced any issues, fix them.

- [ ] **Step 3: Run E2E tests (if available)**

```bash
npm run test:e2e
```

Expected: all E2E tests pass (these test via the browser, so they validate the runtime import graph).

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address lint/format issues from Phase 1 reorganization"
```

---

## Summary of commits

1. `refactor: move task files into tasks/ directory, rename room-ui-handler to room-renderer`
2. `feat: add toast-manager for non-blocking notifications (TDD)`
3. `refactor: migrate non-blocking showAlert calls to showToast`
4. `feat: add app-coordinator for centralized post-action orchestration (TDD)`
5. `refactor: wire scheduled handlers to app-coordinator`
6. `refactor: wire remaining handlers to app-coordinator`
7. `feat: add day-boundary detection to 1-second interval`
8. `fix: address lint/format issues from Phase 1 reorganization` (if needed)
