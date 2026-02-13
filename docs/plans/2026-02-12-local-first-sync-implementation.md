# Local-First Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace localStorage with PouchDB for local-first storage with CouchDB sync, using room codes for identity.

**Architecture:** PouchDB replaces localStorage as the local data store. Each room code maps to a PouchDB database. A remote CouchDB instance acts as an optional sync relay. The storage.js interface is rewritten but callers see a similar API. Task-manager.js switches from "save entire array" to "put individual task" operations.

**Tech Stack:** PouchDB 9.0.0 (CDN for browser, npm for tests), pouchdb-adapter-memory (tests only), vanilla JS ES modules.

**Design doc:** `docs/plans/2026-02-12-local-first-sync-design.md`

---

### Task 1: Remove dead drag-and-drop code

**Files:**
- Modify: `public/js/task-manager.js:1303-1327` (remove `reorderUnscheduledTask`)
- Modify: `public/js/dom-handler.js:356-416` (remove `initializeDragAndDropUnscheduled`)
- Modify: `public/js/handlers/unscheduled-task-handlers.js:8,108-111,138` (remove imports and handler)
- Modify: `__tests__/task-management.test.js:2242-2273` (remove tests)
- Modify: `__tests__/unscheduled-task-handlers.test.js` (remove mock reference)
- Modify: `__tests__/clear-tasks-handler.test.js` (remove mock reference)
- Modify: `__tests__/add-task-handler.test.js` (remove mock reference)
- Modify: `__tests__/scheduled-task-handlers.test.js` (remove mock reference)

**Step 1: Remove `reorderUnscheduledTask` from task-manager.js**

Remove the function at lines 1303-1327 and its export.

**Step 2: Remove `initializeDragAndDropUnscheduled` from dom-handler.js**

Remove the function at lines 356-416 and its export.

**Step 3: Remove drag-drop handler from unscheduled-task-handlers.js**

- Remove `reorderUnscheduledTask` from the import on line 8
- Remove `handleDropUnscheduledTask` function (lines 108-111)
- Remove `onDropUnscheduledTask: handleDropUnscheduledTask` from `createUnscheduledTaskCallbacks` (line 138)

**Step 4: Remove tests for reorderUnscheduledTask**

Remove the `ReorderUnscheduledTask` describe block at lines 2242-2273 in `__tests__/task-management.test.js`.

**Step 5: Remove `initializeDragAndDropUnscheduled` mock references from test files**

In each of these test files, remove the `initializeDragAndDropUnscheduled: jest.fn()` line from the dom-handler mock:
- `__tests__/unscheduled-task-handlers.test.js:42`
- `__tests__/clear-tasks-handler.test.js:35`
- `__tests__/add-task-handler.test.js:34`
- `__tests__/scheduled-task-handlers.test.js:44`

**Step 6: Run tests**

Run: `npm test`
Expected: All tests pass (count will decrease by 2 from removed reorder tests).

**Step 7: Run lint and format**

Run: `npm run check`
Expected: Clean.

**Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove dead drag-and-drop reorder code"
```

---

### Task 2: Install PouchDB dev dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install PouchDB and memory adapter for testing**

Run: `npm install --save-dev pouchdb pouchdb-adapter-memory`

These are dev-only. The browser will load PouchDB from CDN.

**Step 2: Verify tests still pass**

Run: `npm test`
Expected: All tests pass (no code changes, just new deps).

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add pouchdb and pouchdb-adapter-memory dev dependencies"
```

---

### Task 3: Rewrite storage.js with PouchDB (TDD)

**Files:**
- Rewrite: `public/js/storage.js`
- Rewrite: `__tests__/storage.test.js`

The new storage.js uses PouchDB (via `window.PouchDB` in browser) instead of localStorage. It exposes: `initStorage`, `putTask`, `deleteTask`, `loadTasks`, `saveTasks` (bulk), `destroyStorage`, `triggerSync`, `onSyncStatusChange`, `getSyncStatus`.

**Important:** `initStorage` accepts an `options` parameter so tests can inject PouchDB constructor and adapter config. In the browser, it uses `window.PouchDB`.

**Step 1: Write the new storage.js tests**

Replace `__tests__/storage.test.js` entirely. Tests use `pouchdb` + `pouchdb-adapter-memory` for fast in-memory testing.

```javascript
/**
 * @jest-environment jsdom
 */

const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));

// Set up window.PouchDB before importing storage
window.PouchDB = PouchDB;

import {
    initStorage,
    putTask,
    deleteTask,
    loadTasks,
    saveTasks,
    destroyStorage
} from '../public/js/storage.js';

// Use a unique DB name per test to avoid cross-contamination
let testDbCounter = 0;
function uniqueRoomCode() {
    return `test-room-${testDbCounter++}-${Date.now()}`;
}

afterEach(async () => {
    await destroyStorage();
});

describe('Storage - PouchDB', () => {
    describe('initStorage', () => {
        test('initializes without error', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        });

        test('creates a database scoped to room code', async () => {
            const roomCode = uniqueRoomCode();
            await initStorage(roomCode, { adapter: 'memory' });
            const tasks = await loadTasks();
            expect(tasks).toEqual([]);
        });
    });

    describe('putTask', () => {
        test('stores a new task and retrieves it', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const task = {
                id: 'sched-123',
                type: 'scheduled',
                description: 'Test task',
                status: 'incomplete',
                startDateTime: '2025-01-15T09:00:00',
                endDateTime: '2025-01-15T10:00:00',
                duration: 60
            };
            await putTask(task);
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].id).toBe('sched-123');
            expect(tasks[0].description).toBe('Test task');
        });

        test('does not expose _id or _rev to callers', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({ id: 'sched-1', type: 'scheduled', description: 'Test', status: 'incomplete' });
            const tasks = await loadTasks();
            expect(tasks[0]).not.toHaveProperty('_id');
            expect(tasks[0]).not.toHaveProperty('_rev');
        });

        test('updates an existing task', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({ id: 'sched-1', type: 'scheduled', description: 'Original', status: 'incomplete' });
            await putTask({ id: 'sched-1', type: 'scheduled', description: 'Updated', status: 'incomplete' });
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].description).toBe('Updated');
        });
    });

    describe('deleteTask', () => {
        test('removes a task by id', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({ id: 'sched-1', type: 'scheduled', description: 'To delete', status: 'incomplete' });
            await deleteTask('sched-1');
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(0);
        });

        test('does not error when deleting non-existent task', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await expect(deleteTask('nonexistent')).resolves.not.toThrow();
        });
    });

    describe('loadTasks', () => {
        test('returns empty array when no tasks exist', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const tasks = await loadTasks();
            expect(tasks).toEqual([]);
        });

        test('returns all stored tasks', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({ id: 'sched-1', type: 'scheduled', description: 'Task 1', status: 'incomplete' });
            await putTask({ id: 'unsched-1', type: 'unscheduled', description: 'Task 2', status: 'incomplete', priority: 'high' });
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(2);
        });
    });

    describe('saveTasks (bulk)', () => {
        test('replaces all tasks with provided array', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({ id: 'old-1', type: 'scheduled', description: 'Old', status: 'incomplete' });
            await saveTasks([
                { id: 'new-1', type: 'scheduled', description: 'New 1', status: 'incomplete' },
                { id: 'new-2', type: 'unscheduled', description: 'New 2', status: 'incomplete', priority: 'low' }
            ]);
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(2);
            const ids = tasks.map(t => t.id).sort();
            expect(ids).toEqual(['new-1', 'new-2']);
        });

        test('clearing all tasks with empty array', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({ id: 'sched-1', type: 'scheduled', description: 'Task', status: 'incomplete' });
            await saveTasks([]);
            const tasks = await loadTasks();
            expect(tasks).toEqual([]);
        });
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/storage.test.js`
Expected: FAIL (storage.js still has old localStorage implementation).

**Step 3: Write the new storage.js implementation**

```javascript
import { logger } from './utils.js';

/** @type {Object|null} PouchDB database instance */
let db = null;

/** @type {Map<string, string>} In-memory map of task id -> PouchDB _rev */
const revMap = new Map();

/**
 * Initialize storage with a room code.
 * Creates/opens a PouchDB database scoped to the room.
 * @param {string} roomCode - The room identifier
 * @param {Object} [options] - PouchDB options (e.g., { adapter: 'memory' } for tests)
 */
export async function initStorage(roomCode, options = {}) {
    if (db) {
        await db.close();
    }
    revMap.clear();

    const PDB = window.PouchDB;
    const dbName = `fortudo-${roomCode}`;
    db = new PDB(dbName, options);

    // Pre-populate revMap from existing docs
    const result = await db.allDocs();
    for (const row of result.rows) {
        revMap.set(row.id, row.value.rev);
    }

    logger.info(`Storage initialized for room: ${roomCode}`);
}

/**
 * Write a single task to PouchDB.
 * Handles both insert and update (upsert) via _rev tracking.
 * @param {Object} task - Task object (must have `id` field)
 */
export async function putTask(task) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const doc = { ...task, _id: task.id };
    delete doc.id;

    const existingRev = revMap.get(task.id);
    if (existingRev) {
        doc._rev = existingRev;
    }

    const result = await db.put(doc);
    revMap.set(task.id, result.rev);
}

/**
 * Delete a single task from PouchDB by id.
 * @param {string} id - Task id to delete
 */
export async function deleteTask(id) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const rev = revMap.get(id);
    if (!rev) {
        logger.warn(`deleteTask: No rev found for id ${id}, task may not exist.`);
        return;
    }

    try {
        await db.remove(id, rev);
        revMap.delete(id);
    } catch (err) {
        if (err.status !== 404) throw err;
        revMap.delete(id);
    }
}

/**
 * Load all tasks from PouchDB.
 * Maps _id back to id and strips _rev before returning.
 * @returns {Promise<Object[]>} Array of task objects
 */
export async function loadTasks() {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const result = await db.allDocs({ include_docs: true });
    return result.rows.map((row) => {
        const doc = { ...row.doc };
        doc.id = doc._id;
        delete doc._id;
        delete doc._rev;
        return doc;
    });
}

/**
 * Bulk replace all tasks. Deletes existing docs and inserts new ones.
 * Used for init/clear-all operations.
 * @param {Object[]} tasks - Array of task objects to save
 */
export async function saveTasks(tasks) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    // Delete all existing docs
    const existing = await db.allDocs();
    if (existing.rows.length > 0) {
        const deletions = existing.rows.map((row) => ({
            _id: row.id,
            _rev: row.value.rev,
            _deleted: true
        }));
        await db.bulkDocs(deletions);
    }
    revMap.clear();

    // Insert new tasks
    if (tasks.length > 0) {
        const docs = tasks.map((task) => {
            const doc = { ...task, _id: task.id };
            delete doc.id;
            return doc;
        });
        const results = await db.bulkDocs(docs);
        for (const result of results) {
            if (result.ok) {
                revMap.set(result.id, result.rev);
            }
        }
    }
}

/**
 * Destroy the current database. Used for cleanup in tests.
 */
export async function destroyStorage() {
    if (db) {
        try {
            await db.destroy();
        } catch (err) {
            logger.warn('destroyStorage: Error destroying database:', err);
        }
        db = null;
        revMap.clear();
    }
}
```

**Step 4: Run storage tests to verify they pass**

Run: `npm test -- __tests__/storage.test.js`
Expected: All storage tests PASS.

**Step 5: Run full test suite**

Run: `npm test`
Expected: Some existing tests may fail because they import `saveTasks` and `loadTasksFromStorage` from storage.js, which no longer exist with those exact names. That is expected and will be fixed in Task 4. Storage tests should all pass.

**Step 6: Commit**

```bash
git add public/js/storage.js __tests__/storage.test.js
git commit -m "feat: rewrite storage.js with PouchDB backend (TDD)"
```

---

### Task 4: Update task-manager.js and fix all test mocks

This is the largest task. It changes how task-manager.js persists data and updates all test mocks to match.

**Files:**
- Modify: `public/js/task-manager.js` (import changes, `finalizeTaskModification`, all save call sites, strip UI flags)
- Modify: `__tests__/task-management.test.js` (update mock, make tests async-aware)
- Modify: All other test files that mock `storage.js`

**Step 1: Update task-manager.js imports**

Change line 12 from:
```javascript
import { saveTasks } from './storage.js';
```
to:
```javascript
import { putTask, deleteTask as deleteTaskFromStorage, saveTasks } from './storage.js';
```

**Step 2: Add UI flag stripping helper**

Add near the top of task-manager.js (after imports):
```javascript
/**
 * Strip UI-only flags before persisting a task.
 * @param {Object} task - Task object
 * @returns {Object} Task without UI flags
 */
const stripUIFlags = (task) => {
    const { editing, confirmingDelete, isEditingInline, ...persistable } = task;
    return persistable;
};
```

**Step 3: Update `finalizeTaskModification` to accept a changed task**

Change from:
```javascript
const finalizeTaskModification = () => {
    logger.debug('Finalizing task modification (invalidate cache, save)');
    invalidateTaskCaches();
    saveTasks(tasks);
};
```
to:
```javascript
const finalizeTaskModification = (changedTask) => {
    logger.debug('Finalizing task modification (invalidate cache, save)');
    invalidateTaskCaches();
    if (changedTask) {
        putTask(stripUIFlags(changedTask));
    }
};
```

**Step 4: Update `updateTaskState` to use bulk `saveTasks` with stripped flags**

Change line 146 from:
```javascript
saveTasks(tasks);
```
to:
```javascript
saveTasks(tasks.map(stripUIFlags));
```

**Step 5: Update all `finalizeTaskModification()` call sites to pass the changed task**

Every call to `finalizeTaskModification()` needs to pass the task that was modified. Update each one:

- `addTask` (line 623): `finalizeTaskModification(taskObject);`
- `confirmAddTaskAndReschedule` (line 669): `finalizeTaskModification(taskToAdd);`
- `updateTask` (line 804): `finalizeTaskModification(tasks[index]);`
- `updateUnscheduledTask` (line 835): `finalizeTaskModification(taskToUpdate);`
- `confirmUpdateTaskAndReschedule` (line 868): `finalizeTaskModification(tasks[index]);`
- `completeTask` scheduled branch (line 924): `finalizeTaskModification(task);`
- `confirmCompleteLate` (line 983): `finalizeTaskModification(task);`
- `adjustAndCompleteTask` (line 1025): `finalizeTaskModification(task);`
- `truncateCompletedTask` (line 1072): `finalizeTaskModification(task);`
- `deleteTask` (line 1121): Change to use `deleteTaskFromStorage` (see Step 6)
- `scheduleUnscheduledTask` (line 1264): `finalizeTaskModification(newScheduledTask);`
- `confirmScheduleUnscheduledTask` (line 1299): `finalizeTaskModification(newScheduledTask);`
- `toggleUnscheduledTaskCompleteState` (line 1346): `finalizeTaskModification(task);`
- `unscheduleTask` (line 1380): `finalizeTaskModification(task);`
- `toggleLockState` (line 1405): `finalizeTaskModification(task);`

**Step 6: Update `deleteTask` function to use storage.deleteTask**

In the `deleteTask` function (line 1119), change:
```javascript
tasks.splice(index, 1);
resetAllUIFlags();
finalizeTaskModification();
```
to:
```javascript
const taskId = tasks[index].id;
tasks.splice(index, 1);
resetAllUIFlags();
invalidateTaskCaches();
deleteTaskFromStorage(taskId);
```

**Step 7: Update direct `saveTasks(tasks)` calls for unscheduled tasks**

Three places call `saveTasks(tasks)` directly for unscheduled tasks. Change each to `putTask(stripUIFlags(taskObject))`:

- `addTask` unscheduled branch (line 629): `putTask(stripUIFlags(taskObject));`
- `confirmAddTaskAndReschedule` unscheduled branch (line 675): `putTask(stripUIFlags(taskToAdd));`
- `completeTask` unscheduled branch (line 927): `putTask(stripUIFlags(task));`

**Step 8: Handle scheduleUnscheduledTask and confirmScheduleUnscheduledTask deletions**

In `scheduleUnscheduledTask` (line 1257), after `tasks.splice(taskIndex, 1)`, add:
```javascript
deleteTaskFromStorage(unscheduledTask.id);
```

In `confirmScheduleUnscheduledTask` (line 1290), after `tasks.splice(taskIndex, 1)`, add:
```javascript
deleteTaskFromStorage(unscheduledTaskId);
```

The `finalizeTaskModification(newScheduledTask)` call that follows will handle saving the new scheduled task.

**Step 9: Update all test file mocks**

The storage mock in `__tests__/task-management.test.js` (lines 41-44) needs to change from:
```javascript
jest.mock('../public/js/storage.js', () => ({
    saveTasks: jest.fn(),
    loadTasks: jest.fn(() => [])
}));
```
to:
```javascript
jest.mock('../public/js/storage.js', () => ({
    saveTasks: jest.fn(),
    putTask: jest.fn(),
    deleteTask: jest.fn(),
    loadTasks: jest.fn(() => [])
}));
```

Also update the import (line 47) and mock variable (line 49) if they reference `saveTasks` specifically.

In all other test files that mock `../public/js/storage.js`, add the new functions to the mock object. Check these files:
- `__tests__/unscheduled-task-handlers.test.js`
- `__tests__/clear-tasks-handler.test.js`
- `__tests__/add-task-handler.test.js`
- `__tests__/scheduled-task-handlers.test.js`
- Any others found by grepping for `jest.mock.*storage`

**Step 10: Run tests**

Run: `npm test`
Expected: All tests pass.

**Step 11: Run lint and format**

Run: `npm run check`
Expected: Clean.

**Step 12: Commit**

```bash
git add -A
git commit -m "refactor: switch task-manager.js to individual storage operations"
```

---

### Task 5: Add room code manager (TDD)

**Files:**
- Create: `public/js/room-manager.js`
- Create: `__tests__/room-manager.test.js`

**Step 1: Write tests for room-manager.js**

```javascript
/**
 * @jest-environment jsdom
 */

import {
    generateRoomCode,
    getActiveRoom,
    setActiveRoom,
    getSavedRooms,
    addRoom,
    switchRoom
} from '../public/js/room-manager.js';

// Mock storage.js
jest.mock('../public/js/storage.js', () => ({
    initStorage: jest.fn(),
    destroyStorage: jest.fn(),
    saveTasks: jest.fn(),
    putTask: jest.fn(),
    deleteTask: jest.fn(),
    loadTasks: jest.fn(() => [])
}));

let mockStore = {};

beforeEach(() => {
    mockStore = {};
    Object.defineProperty(window, 'localStorage', {
        value: {
            getItem: jest.fn((key) => mockStore[key] || null),
            setItem: jest.fn((key, value) => { mockStore[key] = value; }),
            removeItem: jest.fn((key) => { delete mockStore[key]; }),
            clear: jest.fn(() => { mockStore = {}; })
        },
        writable: true
    });
});

describe('Room Manager', () => {
    describe('generateRoomCode', () => {
        test('generates a string', () => {
            const code = generateRoomCode();
            expect(typeof code).toBe('string');
            expect(code.length).toBeGreaterThan(0);
        });

        test('generates unique codes', () => {
            const codes = new Set(Array.from({ length: 20 }, () => generateRoomCode()));
            expect(codes.size).toBe(20);
        });
    });

    describe('getActiveRoom / setActiveRoom', () => {
        test('returns null when no active room', () => {
            expect(getActiveRoom()).toBeNull();
        });

        test('returns active room after setting', () => {
            setActiveRoom('fox-742');
            expect(getActiveRoom()).toBe('fox-742');
        });
    });

    describe('getSavedRooms / addRoom', () => {
        test('returns empty array when no rooms saved', () => {
            expect(getSavedRooms()).toEqual([]);
        });

        test('adds room to saved list', () => {
            addRoom('fox-742');
            expect(getSavedRooms()).toContain('fox-742');
        });

        test('does not add duplicate rooms', () => {
            addRoom('fox-742');
            addRoom('fox-742');
            expect(getSavedRooms()).toHaveLength(1);
        });
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/room-manager.test.js`
Expected: FAIL.

**Step 3: Implement room-manager.js**

```javascript
import { logger } from './utils.js';

const ACTIVE_ROOM_KEY = 'fortudo-active-room';
const SAVED_ROOMS_KEY = 'fortudo-rooms';

/**
 * Generate a random room code in the format word-NNN.
 * @returns {string} A room code like "fox-742"
 */
export function generateRoomCode() {
    const words = [
        'fox', 'owl', 'bee', 'elk', 'ant', 'bat', 'cat', 'dog',
        'emu', 'fly', 'gnu', 'hen', 'jay', 'koi', 'ram', 'yak'
    ];
    const word = words[Math.floor(Math.random() * words.length)];
    const num = Math.floor(Math.random() * 900) + 100;
    return `${word}-${num}`;
}

/**
 * Get the currently active room code from localStorage.
 * @returns {string|null}
 */
export function getActiveRoom() {
    return localStorage.getItem(ACTIVE_ROOM_KEY);
}

/**
 * Set the active room code in localStorage.
 * @param {string} roomCode
 */
export function setActiveRoom(roomCode) {
    localStorage.setItem(ACTIVE_ROOM_KEY, roomCode);
}

/**
 * Get all saved room codes from localStorage.
 * @returns {string[]}
 */
export function getSavedRooms() {
    const rooms = localStorage.getItem(SAVED_ROOMS_KEY);
    if (rooms) {
        try {
            return JSON.parse(rooms);
        } catch (err) {
            logger.error('Error parsing saved rooms:', err);
            return [];
        }
    }
    return [];
}

/**
 * Add a room code to the saved rooms list. No-op if already present.
 * @param {string} roomCode
 */
export function addRoom(roomCode) {
    const rooms = getSavedRooms();
    if (!rooms.includes(roomCode)) {
        rooms.push(roomCode);
        localStorage.setItem(SAVED_ROOMS_KEY, JSON.stringify(rooms));
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/room-manager.test.js`
Expected: PASS.

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add public/js/room-manager.js __tests__/room-manager.test.js
git commit -m "feat: add room code manager for multi-room support"
```

---

### Task 6: Add sync manager (TDD)

**Files:**
- Create: `public/js/sync-manager.js`
- Create: `__tests__/sync-manager.test.js`

The sync manager handles: triggering sync with remote CouchDB, debouncing writes, and emitting sync status changes.

**Step 1: Write tests for sync-manager.js**

```javascript
/**
 * @jest-environment jsdom
 */

import {
    initSync,
    triggerSync,
    teardownSync,
    onSyncStatusChange,
    getSyncStatus,
    debouncedSync
} from '../public/js/sync-manager.js';

describe('Sync Manager', () => {
    afterEach(() => {
        teardownSync();
    });

    describe('getSyncStatus', () => {
        test('returns "idle" before initialization', () => {
            expect(getSyncStatus()).toBe('idle');
        });
    });

    describe('onSyncStatusChange', () => {
        test('registers a callback', () => {
            const callback = jest.fn();
            const unsubscribe = onSyncStatusChange(callback);
            expect(typeof unsubscribe).toBe('function');
            unsubscribe();
        });
    });

    describe('initSync', () => {
        test('stores remote URL for later sync', () => {
            const mockDb = {};
            initSync(mockDb, 'http://localhost:5984/fortudo-test');
            expect(getSyncStatus()).toBe('idle');
        });
    });

    describe('triggerSync', () => {
        test('does nothing when no remote URL configured', async () => {
            const mockDb = { replicate: { to: jest.fn(), from: jest.fn() } };
            initSync(mockDb, null);
            await triggerSync();
            expect(mockDb.replicate.to).not.toHaveBeenCalled();
        });
    });

    describe('debouncedSync', () => {
        test('is a function', () => {
            expect(typeof debouncedSync).toBe('function');
        });
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/sync-manager.test.js`
Expected: FAIL.

**Step 3: Implement sync-manager.js**

```javascript
import { logger } from './utils.js';

/** @type {Object|null} PouchDB database instance */
let localDb = null;

/** @type {string|null} Remote CouchDB URL */
let remoteUrl = null;

/** @type {string} Current sync status: 'idle' | 'syncing' | 'synced' | 'error' | 'unsynced' */
let syncStatus = 'idle';

/** @type {Set<Function>} Registered status change callbacks */
const statusCallbacks = new Set();

/** @type {number|null} Debounce timer ID */
let debounceTimer = null;

const DEBOUNCE_MS = 2000;

/**
 * Update sync status and notify all listeners.
 * @param {string} newStatus
 */
function setStatus(newStatus) {
    syncStatus = newStatus;
    for (const cb of statusCallbacks) {
        try {
            cb(newStatus);
        } catch (err) {
            logger.error('Sync status callback error:', err);
        }
    }
}

/**
 * Initialize sync manager with a local PouchDB instance and optional remote URL.
 * @param {Object} db - Local PouchDB instance
 * @param {string|null} remote - Remote CouchDB URL (null to disable sync)
 */
export function initSync(db, remote) {
    localDb = db;
    remoteUrl = remote;
    syncStatus = 'idle';
}

/**
 * Trigger a one-time bidirectional sync with the remote.
 */
export async function triggerSync() {
    if (!localDb || !remoteUrl) return;

    setStatus('syncing');
    try {
        await localDb.replicate.to(remoteUrl);
        await localDb.replicate.from(remoteUrl);
        setStatus('synced');
    } catch (err) {
        logger.error('Sync error:', err);
        setStatus('error');
    }
}

/**
 * Debounced sync - call this after writes to batch rapid changes.
 */
export function debouncedSync() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    setStatus('unsynced');
    debounceTimer = setTimeout(() => {
        triggerSync();
    }, DEBOUNCE_MS);
}

/**
 * Register a callback for sync status changes.
 * @param {Function} callback - Called with new status string
 * @returns {Function} Unsubscribe function
 */
export function onSyncStatusChange(callback) {
    statusCallbacks.add(callback);
    return () => statusCallbacks.delete(callback);
}

/**
 * Get current sync status.
 * @returns {string}
 */
export function getSyncStatus() {
    return syncStatus;
}

/**
 * Tear down sync manager. Clears timers and state.
 */
export function teardownSync() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    localDb = null;
    remoteUrl = null;
    syncStatus = 'idle';
    statusCallbacks.clear();
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/sync-manager.test.js`
Expected: PASS.

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add public/js/sync-manager.js __tests__/sync-manager.test.js
git commit -m "feat: add sync manager for CouchDB replication"
```

---

### Task 7: Wire up storage.js with sync manager

**Files:**
- Modify: `public/js/storage.js`

Connect storage operations to sync so writes trigger debounced sync.

**Step 1: Update storage.js to import and call sync manager**

Add to storage.js:
- Import `debouncedSync` from sync-manager.js
- After `putTask` and `deleteTask` operations, call `debouncedSync()`
- `initStorage` should accept a `remoteUrl` parameter and call `initSync`
- Export `getDb()` so sync-manager can access the PouchDB instance

**Step 2: Update storage tests if needed**

Mock sync-manager.js in storage tests so sync doesn't actually run.

**Step 3: Run tests**

Run: `npm test`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add public/js/storage.js __tests__/storage.test.js
git commit -m "feat: wire storage operations to sync manager"
```

---

### Task 8: Update index.html and app.js for room code UI and PouchDB CDN

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/app.js`

**Step 1: Add PouchDB CDN script to index.html**

In `<head>`, before the app.js module script, add:
```html
<script src="https://cdn.jsdelivr.net/npm/pouchdb@9.0.0/dist/pouchdb.min.js"></script>
```

**Step 2: Add room code entry screen HTML**

Add a hidden-by-default room entry screen and sync status indicator to the HTML. The room entry screen shows when no active room is set. The main app content is hidden until a room is selected.

**Step 3: Add room code display and switch dropdown to header**

Add to the header area:
- Room code badge showing current code
- Dropdown with saved rooms
- Sync status icon (using Font Awesome icons already loaded)

**Step 4: Update app.js initialization**

The DOMContentLoaded handler needs to:
1. Check for active room code via `getActiveRoom()`
2. If no room: show room entry screen, hide main app
3. If room exists: call `await initStorage(roomCode)`, load tasks, proceed as before
4. Wire up room entry form submission
5. Wire up room switch dropdown
6. Wire up sync status indicator updates via `onSyncStatusChange`
7. Wire up manual sync button

Since `initStorage` and `loadTasks` are now async, the init flow becomes async.

**Step 5: Make app.js init flow async**

Change:
```javascript
document.addEventListener('DOMContentLoaded', () => {
    const loadedTasks = loadTasksFromStorage();
```
to:
```javascript
document.addEventListener('DOMContentLoaded', async () => {
    const activeRoom = getActiveRoom();
    if (!activeRoom) {
        showRoomEntryScreen();
        return;
    }
    await initStorage(activeRoom, { /* remoteUrl if configured */ });
    const loadedTasks = await loadTasks();
```

**Step 6: Update imports in app.js**

Replace `loadTasksFromStorage` import with `loadTasks` from storage.js, and add imports from room-manager.js and sync-manager.js.

**Step 7: Run tests**

Run: `npm test`
Expected: All tests pass. E2E tests may need PouchDB mock setup.

**Step 8: Run lint and format**

Run: `npm run check`
Expected: Clean.

**Step 9: Manual browser testing**

Open the app locally and verify:
- Room entry screen appears on first visit
- Generating a room code works
- Tasks persist after page reload (via PouchDB/IndexedDB)
- Room code displayed in header
- Sync indicator shows (even if no remote configured yet)

**Step 10: Commit**

```bash
git add -A
git commit -m "feat: add room code UI and PouchDB integration"
```

---

### Task 9: Update E2E and integration tests

**Files:**
- Modify: E2E test files as needed for PouchDB compatibility

**Step 1: Check if Playwright E2E tests need PouchDB setup**

Since PouchDB is loaded via CDN script tag, and E2E tests run against the real app, PouchDB should be available. The main change is that E2E tests will need to handle the room code entry screen (either pre-set a room code in localStorage or interact with the entry screen).

**Step 2: Update E2E test setup to handle room code**

Add a `beforeEach` that sets `fortudo-active-room` and `fortudo-rooms` in localStorage before navigating, so the app skips the room entry screen.

**Step 3: Run E2E tests**

Run: `npx playwright test`
Expected: All E2E tests pass.

**Step 4: Commit**

```bash
git add -A
git commit -m "test: update E2E tests for room code and PouchDB"
```

---

### Task 10: Final verification and coverage

**Step 1: Run full test suite with coverage**

Run: `npm test -- --coverage`
Expected: All tests pass, coverage meets 80% lines / 75% branches threshold.

**Step 2: Run lint check**

Run: `npm run check`
Expected: Clean.

**Step 3: Manual smoke test**

Open the app in browser:
- Create a room
- Add scheduled and unscheduled tasks
- Refresh page - tasks persist
- Switch rooms - different task lists
- Return to original room - tasks still there

**Step 4: Commit any final fixes**

If any fixes were needed, commit them.

---

### Future tasks (not part of this plan)

- Set up CouchDB on Fly.io and configure remote URL
- Add remote URL configuration UI (settings/config screen)
- Data migration: one-time import from localStorage to PouchDB for existing users
- Shared room collaboration features
