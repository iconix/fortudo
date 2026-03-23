# Fortudo Activities — Phase 2: Storage

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the PouchDB storage layer to support multiple document types (tasks, activities, config) with backwards-compatible migration, while keeping the existing `saveTasks` bulk-replace scoped safely to task documents only.

**Architecture:** Add a `docType` field to all documents. Existing taskless documents get migrated to `docType: 'task'` on first load. New storage functions (`putActivity`, `loadActivities`, `deleteActivity`, `loadConfig`, `putConfig`) follow the same upsert/rev-tracking pattern as existing task functions. `loadTasks` filters by `docType`, and `saveTasks` only deletes task documents during its bulk replace. Migration and default seeding are idempotent.

**Tech Stack:** Vanilla JS (ES modules), PouchDB (in-memory adapter for tests), Jest + jsdom

**Spec:** `docs/plans/2026-03-16-fortudo-activities-design.md` (sections: Data Model, Storage Layer Changes)

**Repo:** `https://github.com/iconix/fortudo` — branch from `activities-phase1` (or `main` if PR #52 is merged)

---

## Status Update

Phase 2 is complete and merged in PR #53.

What actually landed matches the intent of this plan, with a few notable differences in final shape:

- storage preparation is now exposed as `prepareStorage()` and used from `app.js`, rather than wiring `initStorage()` and `migrateDocTypes()` separately in the app boot path
- storage revision tracking ended up type-scoped internally (`task`, `activity`, `config`) rather than using one shared revision map
- default category seeding was intentionally deferred; Phase 2 shipped config document primitives, not category defaults
- validation work uncovered room-switch sync lifecycle issues, so Phase 2 also includes sync handoff hardening in `sync-manager.js` and storage teardown sequencing
- merge-readiness verification now includes the hosted preview Playwright smoke in `scripts/playwright_preview_smoke.py`

What Phase 2 still does not include:

- no Activities UI
- no settings/category management UI
- no auto-logging
- no insights view

Phase 3 should also carry forward these implementation rules from Phase 2 validation:

- use `prepareStorage()` as the normal boot entry to storage work; do not reintroduce ad hoc `initStorage()` plus manual migration sequencing in app boot code
- keep new UI listeners lifecycle-scoped across room switches and reloads; Phase 2 exposed duplicate-listener bugs during preview smoke work and fixed them in the page-level listener lifecycle
- treat `scripts/playwright_preview_smoke.py` as part of the practical merge-readiness path and extend it rather than creating a parallel one-off storage verification path
- for synced preview runs, preserve the current distinction between expected Cloudant noise and real runtime failures instead of treating every `404` or `412` as an app bug
- keep destructive success feedback aligned with the current `rose` toast convention, and prefer toasts over alerts for non-blocking feedback in new Activities/category flows
- keep preview automation on stable reusable preview room names so repeated hosted-preview runs do not keep minting new remote databases

The detailed checklist below is retained as the original implementation plan and historical record. Use the notes above as the source of truth where the exact implementation shape differs from the step-by-step plan.

---

## File Structure

### Files to modify

| File | Changes |
|---|---|
| `public/js/storage.js` | Add `docType` migration, activity CRUD, config CRUD, scope `saveTasks` and `loadTasks` |

### Files to create

| File | Responsibility |
|---|---|
| `__tests__/storage-migration.test.js` | Tests for `docType` migration logic |
| `__tests__/storage-activities.test.js` | Tests for activity CRUD functions |
| `__tests__/storage-config.test.js` | Tests for config CRUD functions |
| `__tests__/storage-scoping.test.js` | Tests that `saveTasks` and `loadTasks` respect `docType` boundaries |

Splitting storage tests into focused files keeps each test file short and scoped to one concern. The existing `__tests__/storage.test.js` stays unchanged (it covers the baseline task CRUD which should continue passing).

**Note:** The spec says "If no `config-categories` document exists, defaults are seeded" under Migration. Phase 2 deliberately stopped at the storage primitives (`putConfig`, `loadConfig`). Default seeding remains future work for `category-manager.js` / the settings phase, which is the layer that should own the default category set.

---

## Chunk 1: docType Migration and Load/Save Scoping

### Task 1: Scope loadTasks to docType:'task' (TDD)

`loadTasks()` currently returns all documents. After this change it returns only documents with `docType: 'task'` or documents without a `docType` field (backwards compatibility for pre-migration docs).

**Files:**
- Modify: `public/js/storage.js`
- Create: `__tests__/storage-scoping.test.js`

- [ ] **Step 1: Write failing test for loadTasks scoping**

Create `__tests__/storage-scoping.test.js`:

```js
/**
 * @jest-environment jsdom
 */

const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;

const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));
window.PouchDB = PouchDB;

jest.mock('../public/js/sync-manager.js', () => ({
    initSync: jest.fn(),
    debouncedSync: jest.fn(),
    triggerSync: jest.fn()
}));

import {
    initStorage,
    putTask,
    loadTasks,
    saveTasks,
    destroyStorage,
    getDb
} from '../public/js/storage.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `test-scoping-${testDbCounter++}-${Date.now()}`;
}

afterEach(async () => {
    await destroyStorage();
});

describe('Storage - docType scoping', () => {
    describe('loadTasks', () => {
        test('returns documents with docType "task"', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'sched-1',
                docType: 'task',
                type: 'scheduled',
                description: 'A task',
                status: 'incomplete'
            });
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].id).toBe('sched-1');
        });

        test('returns documents without docType (backwards compatibility)', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            // Simulate a pre-migration document by writing directly to PouchDB
            const db = getDb();
            await db.put({ _id: 'sched-legacy', type: 'scheduled', description: 'Legacy task', status: 'incomplete' });
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].id).toBe('sched-legacy');
        });

        test('excludes documents with docType "activity"', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'sched-1',
                docType: 'task',
                type: 'scheduled',
                description: 'A task',
                status: 'incomplete'
            });
            // Write an activity document directly to PouchDB
            const db = getDb();
            await db.put({
                _id: 'activity-1',
                docType: 'activity',
                description: 'An activity',
                duration: 30
            });
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].id).toBe('sched-1');
        });

        test('excludes documents with docType "config"', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'sched-1',
                docType: 'task',
                type: 'scheduled',
                description: 'A task',
                status: 'incomplete'
            });
            const db = getDb();
            await db.put({
                _id: 'config-categories',
                docType: 'config',
                categories: []
            });
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].id).toBe('sched-1');
        });
    });

    describe('saveTasks', () => {
        test('only deletes documents with docType "task" during bulk replace', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });

            // Create a task
            await putTask({
                id: 'sched-1',
                docType: 'task',
                type: 'scheduled',
                description: 'Old task',
                status: 'incomplete'
            });

            // Create a non-task document directly
            const db = getDb();
            await db.put({
                _id: 'activity-1',
                docType: 'activity',
                description: 'An activity',
                duration: 30
            });

            // Bulk replace tasks
            await saveTasks([
                { id: 'sched-new', docType: 'task', type: 'scheduled', description: 'New task', status: 'incomplete' }
            ]);

            // Activity should survive the bulk replace
            const activityDoc = await db.get('activity-1');
            expect(activityDoc.docType).toBe('activity');

            // Only the new task should remain in loadTasks
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].id).toBe('sched-new');
        });

        test('deletes legacy documents without docType during bulk replace', async () => {
            const roomCode = uniqueRoomCode();
            await initStorage(roomCode, { adapter: 'memory' });

            // Create a legacy doc (no docType) directly in PouchDB
            const db = getDb();
            await db.put({ _id: 'sched-legacy', type: 'scheduled', description: 'Legacy', status: 'incomplete' });

            // Re-init same room to pick up the rev
            await initStorage(roomCode, { adapter: 'memory' });

            // Bulk replace should delete the legacy doc (no docType = treated as task)
            await saveTasks([
                { id: 'sched-new', docType: 'task', type: 'scheduled', description: 'New', status: 'incomplete' }
            ]);

            const tasks = await loadTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].id).toBe('sched-new');
        });

        test('preserves config documents during bulk replace', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });

            const db = getDb();
            await db.put({
                _id: 'config-categories',
                docType: 'config',
                categories: [{ key: 'work/deep', label: 'Deep Work' }]
            });

            await putTask({
                id: 'sched-1',
                docType: 'task',
                type: 'scheduled',
                description: 'Task',
                status: 'incomplete'
            });

            await saveTasks([]);

            // Config should survive
            const configDoc = await db.get('config-categories');
            expect(configDoc.docType).toBe('config');
            expect(configDoc.categories).toHaveLength(1);
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/storage-scoping.test.js --verbose
```

Expected: FAIL — `loadTasks` returns all documents (including activity and config docs), and `saveTasks` deletes everything.

- [ ] **Step 3: Modify loadTasks to filter by docType**

In `public/js/storage.js`, update `loadTasks()`:

```js
export async function loadTasks() {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const result = await db.allDocs({ include_docs: true });
    return result.rows
        .filter((row) => {
            const docType = row.doc.docType;
            return docType === 'task' || docType === undefined;
        })
        .map((row) => {
            const doc = { ...row.doc };
            doc.id = doc._id;
            delete doc._id;
            delete doc._rev;
            return doc;
        });
}
```

- [ ] **Step 4: Modify saveTasks to scope deletions to task documents**

In `public/js/storage.js`, update `saveTasks()`:

```js
export async function saveTasks(tasks) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    // Delete only task documents (docType: 'task' or no docType)
    const existing = await db.allDocs({ include_docs: true });
    const taskRows = existing.rows.filter((row) => {
        const docType = row.doc.docType;
        return docType === 'task' || docType === undefined;
    });

    if (taskRows.length > 0) {
        const deletions = taskRows.map((row) => ({
            _id: row.id,
            _rev: row.value.rev,
            _deleted: true
        }));
        await db.bulkDocs(deletions);
    }

    // Clear only task entries from revMap
    for (const row of taskRows) {
        revMap.delete(row.id);
    }

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
    debouncedSync();
}
```

Key change: `revMap.clear()` is replaced with targeted deletion of task entries only. Non-task revs stay in the map.

- [ ] **Step 5: Run scoping tests**

```bash
npx jest __tests__/storage-scoping.test.js --verbose
```

Expected: all tests PASS

- [ ] **Step 6: Run existing storage tests**

```bash
npx jest __tests__/storage.test.js --verbose
```

Expected: all existing tests still pass. The filter is additive (all current docs are treated as tasks since none have `docType` set yet).

- [ ] **Step 7: Commit**

```bash
git add public/js/storage.js __tests__/storage-scoping.test.js
git commit -m "feat: scope loadTasks and saveTasks to docType 'task' (TDD)

loadTasks now filters to docType:'task' or undefined (backwards compat).
saveTasks only deletes task documents during bulk replace, preserving
activity and config documents. revMap cleanup is targeted instead of
clearing all entries."
```

---

### Task 2: Add docType migration (TDD)

On first load, documents without `docType` get `docType: 'task'` written back. This is idempotent: running it twice has no effect.

**Files:**
- Modify: `public/js/storage.js`
- Create: `__tests__/storage-migration.test.js`

- [ ] **Step 1: Write failing test for migration**

Create `__tests__/storage-migration.test.js`:

```js
/**
 * @jest-environment jsdom
 */

const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;

const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));
window.PouchDB = PouchDB;

jest.mock('../public/js/sync-manager.js', () => ({
    initSync: jest.fn(),
    debouncedSync: jest.fn(),
    triggerSync: jest.fn()
}));

import {
    initStorage,
    migrateDocTypes,
    loadTasks,
    destroyStorage,
    getDb
} from '../public/js/storage.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `test-migration-${testDbCounter++}-${Date.now()}`;
}

afterEach(async () => {
    await destroyStorage();
});

describe('Storage - docType migration', () => {
    test('adds docType "task" to documents that lack it', async () => {
        const roomCode = uniqueRoomCode();
        // Create a PouchDB directly and insert legacy docs
        const PDB = window.PouchDB;
        const tempDb = new PDB(`fortudo-${roomCode}`, { adapter: 'memory' });
        await tempDb.put({ _id: 'sched-1', type: 'scheduled', description: 'Legacy 1', status: 'incomplete' });
        await tempDb.put({ _id: 'unsched-1', type: 'unscheduled', description: 'Legacy 2', status: 'incomplete' });
        await tempDb.close();

        // Initialize storage (which should trigger migration)
        await initStorage(roomCode, { adapter: 'memory' });
        await migrateDocTypes();

        // Verify documents now have docType
        const db = getDb();
        const doc1 = await db.get('sched-1');
        expect(doc1.docType).toBe('task');
        const doc2 = await db.get('unsched-1');
        expect(doc2.docType).toBe('task');
    });

    test('does not modify documents that already have docType', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        const db = getDb();
        const result = await db.put({
            _id: 'sched-1',
            docType: 'task',
            type: 'scheduled',
            description: 'Already migrated',
            status: 'incomplete'
        });
        const revBefore = result.rev;

        await migrateDocTypes();

        const doc = await db.get('sched-1');
        // Rev should not change if no update was needed
        expect(doc._rev).toBe(revBefore);
    });

    test('does not modify activity or config documents', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        const db = getDb();
        await db.put({ _id: 'activity-1', docType: 'activity', description: 'Activity' });
        await db.put({ _id: 'config-cats', docType: 'config', categories: [] });

        await migrateDocTypes();

        const activity = await db.get('activity-1');
        expect(activity.docType).toBe('activity');
        const config = await db.get('config-cats');
        expect(config.docType).toBe('config');
    });

    test('is idempotent (safe to run multiple times)', async () => {
        const roomCode = uniqueRoomCode();
        const PDB = window.PouchDB;
        const tempDb = new PDB(`fortudo-${roomCode}`, { adapter: 'memory' });
        await tempDb.put({ _id: 'sched-1', type: 'scheduled', description: 'Legacy', status: 'incomplete' });
        await tempDb.close();

        await initStorage(roomCode, { adapter: 'memory' });
        await migrateDocTypes();
        await migrateDocTypes(); // run again

        const db = getDb();
        const doc = await db.get('sched-1');
        expect(doc.docType).toBe('task');
    });

    test('migrated documents are returned by loadTasks', async () => {
        const roomCode = uniqueRoomCode();
        const PDB = window.PouchDB;
        const tempDb = new PDB(`fortudo-${roomCode}`, { adapter: 'memory' });
        await tempDb.put({ _id: 'sched-1', type: 'scheduled', description: 'Legacy', status: 'incomplete' });
        await tempDb.close();

        await initStorage(roomCode, { adapter: 'memory' });
        await migrateDocTypes();

        const tasks = await loadTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].docType).toBe('task');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/storage-migration.test.js --verbose
```

Expected: FAIL — `migrateDocTypes` is not exported from `storage.js`

- [ ] **Step 3: Implement migrateDocTypes**

Add to `public/js/storage.js`:

```js
/**
 * Migrate documents that lack a docType field.
 * Adds docType: 'task' to any document without one.
 * Idempotent: safe to call multiple times.
 */
export async function migrateDocTypes() {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const result = await db.allDocs({ include_docs: true });
    const docsToMigrate = result.rows.filter(
        (row) => !row.id.startsWith('_design/') && !row.doc.docType
    );

    if (docsToMigrate.length === 0) {
        return;
    }

    logger.info(`Migrating ${docsToMigrate.length} document(s) to add docType: 'task'`);

    const updates = docsToMigrate.map((row) => ({
        ...row.doc,
        docType: 'task'
    }));

    const results = await db.bulkDocs(updates);
    for (const res of results) {
        if (res.ok) {
            revMap.set(res.id, res.rev);
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/storage-migration.test.js --verbose
```

Expected: all 5 tests PASS

- [ ] **Step 5: Run all storage tests**

```bash
npx jest __tests__/storage*.test.js --verbose
```

Expected: all tests pass across all storage test files

- [ ] **Step 6: Commit**

```bash
git add public/js/storage.js __tests__/storage-migration.test.js
git commit -m "feat: add idempotent docType migration for legacy documents (TDD)

migrateDocTypes() adds docType:'task' to any document lacking one.
Safe to run multiple times. Does not touch docs that already have
a docType field."
```

---

## Chunk 2: Activity and Config CRUD

### Task 3: Add activity CRUD functions (TDD)

**Files:**
- Modify: `public/js/storage.js`
- Create: `__tests__/storage-activities.test.js`

- [ ] **Step 1: Write failing tests for activity functions**

Create `__tests__/storage-activities.test.js`:

```js
/**
 * @jest-environment jsdom
 */

const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;

const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));
window.PouchDB = PouchDB;

jest.mock('../public/js/sync-manager.js', () => ({
    initSync: jest.fn(),
    debouncedSync: jest.fn(),
    triggerSync: jest.fn()
}));

import {
    initStorage,
    putActivity,
    loadActivities,
    deleteActivity,
    putTask,
    loadTasks,
    destroyStorage
} from '../public/js/storage.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `test-activities-${testDbCounter++}-${Date.now()}`;
}

afterEach(async () => {
    await destroyStorage();
});

describe('Storage - Activity CRUD', () => {
    describe('putActivity', () => {
        test('stores a new activity and retrieves it', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const activity = {
                id: 'activity-123',
                docType: 'activity',
                description: 'Deep work session',
                category: 'work/deep',
                startDateTime: '2025-01-15T09:00:00',
                endDateTime: '2025-01-15T10:00:00',
                duration: 60,
                source: 'manual',
                sourceTaskId: null
            };
            await putActivity(activity);
            const activities = await loadActivities();
            expect(activities).toHaveLength(1);
            expect(activities[0].id).toBe('activity-123');
            expect(activities[0].description).toBe('Deep work session');
            expect(activities[0].docType).toBe('activity');
        });

        test('updates an existing activity', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putActivity({
                id: 'activity-1',
                docType: 'activity',
                description: 'Original',
                duration: 30,
                source: 'manual',
                sourceTaskId: null
            });
            await putActivity({
                id: 'activity-1',
                docType: 'activity',
                description: 'Updated',
                duration: 45,
                source: 'manual',
                sourceTaskId: null
            });
            const activities = await loadActivities();
            expect(activities).toHaveLength(1);
            expect(activities[0].description).toBe('Updated');
            expect(activities[0].duration).toBe(45);
        });

        test('does not expose _id or _rev to callers', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putActivity({
                id: 'activity-1',
                docType: 'activity',
                description: 'Test',
                duration: 30,
                source: 'manual',
                sourceTaskId: null
            });
            const activities = await loadActivities();
            expect(activities[0]).not.toHaveProperty('_id');
            expect(activities[0]).not.toHaveProperty('_rev');
        });
    });

    describe('loadActivities', () => {
        test('returns empty array when no activities exist', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const activities = await loadActivities();
            expect(activities).toEqual([]);
        });

        test('returns only activity documents, not tasks', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'sched-1',
                docType: 'task',
                type: 'scheduled',
                description: 'A task',
                status: 'incomplete'
            });
            await putActivity({
                id: 'activity-1',
                docType: 'activity',
                description: 'An activity',
                duration: 30,
                source: 'manual',
                sourceTaskId: null
            });
            const activities = await loadActivities();
            expect(activities).toHaveLength(1);
            expect(activities[0].id).toBe('activity-1');

            const tasks = await loadTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].id).toBe('sched-1');
        });
    });

    describe('deleteActivity', () => {
        test('removes an activity by id', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putActivity({
                id: 'activity-1',
                docType: 'activity',
                description: 'To delete',
                duration: 30,
                source: 'manual',
                sourceTaskId: null
            });
            await deleteActivity('activity-1');
            const activities = await loadActivities();
            expect(activities).toHaveLength(0);
        });

        test('does not error when deleting non-existent activity', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await expect(deleteActivity('nonexistent')).resolves.not.toThrow();
        });

        test('does not affect task documents', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putTask({
                id: 'sched-1',
                docType: 'task',
                type: 'scheduled',
                description: 'A task',
                status: 'incomplete'
            });
            await putActivity({
                id: 'activity-1',
                docType: 'activity',
                description: 'An activity',
                duration: 30,
                source: 'manual',
                sourceTaskId: null
            });
            await deleteActivity('activity-1');

            const tasks = await loadTasks();
            expect(tasks).toHaveLength(1);
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/storage-activities.test.js --verbose
```

Expected: FAIL — `putActivity`, `loadActivities`, `deleteActivity` are not exported

- [ ] **Step 3: Implement activity CRUD functions**

Add to `public/js/storage.js`:

```js
/**
 * Write a single activity to PouchDB.
 * Same upsert pattern as putTask.
 * @param {Object} activity - Activity object (must have `id` and `docType: 'activity'`)
 */
export async function putActivity(activity) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const doc = { ...activity, _id: activity.id, docType: 'activity' };
    delete doc.id;

    const existingRev = revMap.get(activity.id);
    if (existingRev) {
        doc._rev = existingRev;
    }

    const result = await db.put(doc);
    revMap.set(activity.id, result.rev);
    debouncedSync();
}

/**
 * Load all activities from PouchDB.
 * Filters to docType: 'activity' only.
 * @returns {Promise<Object[]>} Array of activity objects
 */
export async function loadActivities() {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const result = await db.allDocs({ include_docs: true });
    return result.rows
        .filter((row) => row.doc.docType === 'activity')
        .map((row) => {
            const doc = { ...row.doc };
            doc.id = doc._id;
            delete doc._id;
            delete doc._rev;
            return doc;
        });
}

/**
 * Delete a single activity from PouchDB by id.
 * @param {string} id - Activity id to delete
 */
export async function deleteActivity(id) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const rev = revMap.get(id);
    if (!rev) {
        logger.warn(`deleteActivity: No rev found for id ${id}, activity may not exist.`);
        return;
    }

    try {
        await db.remove(id, rev);
        revMap.delete(id);
    } catch (err) {
        if (err.status !== 404) throw err;
        revMap.delete(id);
    }
    debouncedSync();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/storage-activities.test.js --verbose
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/storage.js __tests__/storage-activities.test.js
git commit -m "feat: add activity CRUD storage functions (TDD)

Add putActivity, loadActivities, deleteActivity. Activity documents
use docType:'activity' and follow the same upsert/rev-tracking
pattern as task documents."
```

---

### Task 4: Add config CRUD functions (TDD)

**Files:**
- Modify: `public/js/storage.js`
- Create: `__tests__/storage-config.test.js`

- [ ] **Step 1: Write failing tests for config functions**

Create `__tests__/storage-config.test.js`:

```js
/**
 * @jest-environment jsdom
 */

const { setImmediate } = require('timers');
global.setImmediate = global.setImmediate || setImmediate;

const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-adapter-memory'));
window.PouchDB = PouchDB;

jest.mock('../public/js/sync-manager.js', () => ({
    initSync: jest.fn(),
    debouncedSync: jest.fn(),
    triggerSync: jest.fn()
}));

import {
    initStorage,
    loadConfig,
    putConfig,
    loadTasks,
    loadActivities,
    saveTasks,
    destroyStorage
} from '../public/js/storage.js';

let testDbCounter = 0;
function uniqueRoomCode() {
    return `test-config-${testDbCounter++}-${Date.now()}`;
}

afterEach(async () => {
    await destroyStorage();
});

describe('Storage - Config CRUD', () => {
    describe('putConfig', () => {
        test('stores a config document and retrieves it', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const config = {
                id: 'config-categories',
                docType: 'config',
                categories: [
                    { key: 'work/deep', label: 'Deep Work', color: '#0ea5e9', group: 'work' }
                ]
            };
            await putConfig(config);
            const loaded = await loadConfig('config-categories');
            expect(loaded).not.toBeNull();
            expect(loaded.id).toBe('config-categories');
            expect(loaded.categories).toHaveLength(1);
            expect(loaded.categories[0].label).toBe('Deep Work');
        });

        test('updates an existing config document', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putConfig({
                id: 'config-categories',
                docType: 'config',
                categories: [{ key: 'work/deep', label: 'Deep Work', color: '#0ea5e9', group: 'work' }]
            });
            await putConfig({
                id: 'config-categories',
                docType: 'config',
                categories: [
                    { key: 'work/deep', label: 'Deep Work', color: '#0ea5e9', group: 'work' },
                    { key: 'personal', label: 'Personal', color: '#ec4899', group: 'personal' }
                ]
            });
            const loaded = await loadConfig('config-categories');
            expect(loaded.categories).toHaveLength(2);
        });
    });

    describe('loadConfig', () => {
        test('returns null when config document does not exist', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            const loaded = await loadConfig('config-nonexistent');
            expect(loaded).toBeNull();
        });

        test('does not expose _id or _rev', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putConfig({
                id: 'config-categories',
                docType: 'config',
                categories: []
            });
            const loaded = await loadConfig('config-categories');
            expect(loaded).not.toHaveProperty('_id');
            expect(loaded).not.toHaveProperty('_rev');
        });
    });

    describe('cross-type isolation', () => {
        test('config documents are not returned by loadTasks', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putConfig({
                id: 'config-categories',
                docType: 'config',
                categories: []
            });
            const tasks = await loadTasks();
            expect(tasks).toHaveLength(0);
        });

        test('config documents are not returned by loadActivities', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putConfig({
                id: 'config-categories',
                docType: 'config',
                categories: []
            });
            const activities = await loadActivities();
            expect(activities).toHaveLength(0);
        });

        test('config documents survive saveTasks bulk replace', async () => {
            await initStorage(uniqueRoomCode(), { adapter: 'memory' });
            await putConfig({
                id: 'config-categories',
                docType: 'config',
                categories: [{ key: 'work/deep', label: 'Deep Work', color: '#0ea5e9', group: 'work' }]
            });
            await saveTasks([]);
            const loaded = await loadConfig('config-categories');
            expect(loaded).not.toBeNull();
            expect(loaded.categories).toHaveLength(1);
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/storage-config.test.js --verbose
```

Expected: FAIL — `loadConfig`, `putConfig` are not exported

- [ ] **Step 3: Implement config CRUD functions**

Add to `public/js/storage.js`:

```js
/**
 * Load a single config document by ID.
 * @param {string} configId - Config document ID (e.g. 'config-categories')
 * @returns {Promise<Object|null>} The config object, or null if not found
 */
export async function loadConfig(configId) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    try {
        const doc = await db.get(configId);
        const config = { ...doc };
        config.id = config._id;
        delete config._id;
        delete config._rev;
        return config;
    } catch (err) {
        if (err.status === 404) return null;
        throw err;
    }
}

/**
 * Upsert a config document.
 * @param {Object} config - Config object (must have `id` and `docType: 'config'`)
 */
export async function putConfig(config) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const doc = { ...config, _id: config.id, docType: 'config' };
    delete doc.id;

    const existingRev = revMap.get(config.id);
    if (existingRev) {
        doc._rev = existingRev;
    }

    const result = await db.put(doc);
    revMap.set(config.id, result.rev);
    debouncedSync();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/storage-config.test.js --verbose
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add public/js/storage.js __tests__/storage-config.test.js
git commit -m "feat: add config document CRUD storage functions (TDD)

Add loadConfig (returns null if not found) and putConfig. Config
documents use docType:'config', are isolated from tasks and activities,
and survive saveTasks bulk replace."
```

---

## Chunk 3: Wiring and Final Verification

### Task 5: Wire migration into app boot sequence

**Files:**
- Modify: `public/js/app.js`

The migration should run once after storage initialization and before `loadTasksIntoState`. It runs on every boot but is idempotent, so no-ops if documents are already migrated.

**What actually shipped:** the final implementation exposes `prepareStorage()` in `storage.js`, and `app.js` now calls that higher-level preparation boundary instead of calling `initStorage()` and `migrateDocTypes()` separately.

- [ ] **Step 1: Add migrateDocTypes import and call to initAndBootApp**

Read `public/js/app.js` first. Find the existing import from `'./storage.js'` and add `migrateDocTypes` to it. Then find `initAndBootApp()`, locate the `await initStorage(...)` call, and add `await migrateDocTypes()` immediately after it, before `await loadTasksIntoState()`.

```js
// At the top, add migrateDocTypes to the existing storage.js import:
import { initStorage, migrateDocTypes } from './storage.js';

// Inside initAndBootApp, after initStorage and before loadTasksIntoState:
await migrateDocTypes();
```

Verify the exact current import line and function order before editing.

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: all tests pass. The migration import won't break any tests since `migrateDocTypes` is only called in the boot path (which tests mock).

- [ ] **Step 3: Manual smoke test**

Start the app locally. Open browser console and verify:
- No migration errors
- If there were existing tasks in the PouchDB database, they should now have `docType: 'task'`
- App works normally after migration

To verify migration worked, run in the browser console:
```js
// After app loads, check a doc directly
const db = new PouchDB('fortudo-YOUR_ROOM_CODE');
db.allDocs({ include_docs: true }).then(r => console.log(r.rows.map(row => ({ id: row.id, docType: row.doc.docType }))));
```

- [ ] **Step 4: Commit**

```bash
git add public/js/app.js
git commit -m "feat: wire docType migration into app boot sequence

Run migrateDocTypes() after initStorage and before loading tasks.
Idempotent: existing migrated docs are untouched on subsequent boots."
```

---

### Task 6: Add putTask docType enforcement

Ensure that `putTask` always sets `docType: 'task'` on the document, even if the caller omits it. This is a safety net so that new tasks created after migration always have the field.

**Files:**
- Modify: `public/js/storage.js`
- Modify: `__tests__/storage.test.js` (or add to `__tests__/storage-scoping.test.js`)

- [ ] **Step 1: Write failing test for docType enforcement**

Add to `__tests__/storage-scoping.test.js`:

```js
describe('putTask docType enforcement', () => {
    test('putTask sets docType to "task" if not provided', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putTask({
            id: 'sched-no-doctype',
            type: 'scheduled',
            description: 'No docType provided',
            status: 'incomplete'
        });
        const db = getDb();
        const doc = await db.get('sched-no-doctype');
        expect(doc.docType).toBe('task');
    });

    test('putTask preserves docType "task" if already set', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putTask({
            id: 'sched-with-doctype',
            docType: 'task',
            type: 'scheduled',
            description: 'Has docType',
            status: 'incomplete'
        });
        const db = getDb();
        const doc = await db.get('sched-with-doctype');
        expect(doc.docType).toBe('task');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/storage-scoping.test.js --verbose
```

Expected: first test FAIL — `doc.docType` is undefined (putTask doesn't set it)

- [ ] **Step 3: Add docType enforcement to putTask**

In `public/js/storage.js`, modify `putTask`:

```js
export async function putTask(task) {
    if (!db) throw new Error('Storage not initialized. Call initStorage first.');

    const doc = { ...task, _id: task.id, docType: 'task' };
    delete doc.id;

    const existingRev = revMap.get(task.id);
    if (existingRev) {
        doc._rev = existingRev;
    }

    const result = await db.put(doc);
    revMap.set(task.id, result.rev);
    debouncedSync();
}
```

The key change: `docType: 'task'` is always set in the spread, overriding any missing or incorrect value.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/storage-scoping.test.js --verbose
```

Expected: all tests PASS

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests pass. Existing putTask callers that omit docType now get it automatically.

- [ ] **Step 6: Commit**

```bash
git add public/js/storage.js __tests__/storage-scoping.test.js
git commit -m "feat: enforce docType 'task' on putTask

putTask now always sets docType:'task' on the document, acting as
a safety net for callers that don't explicitly include it."
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite with coverage**

```bash
npm test -- --coverage
```

Expected: all tests pass. Coverage meets thresholds (90% statements/lines, 90% functions, 79% branches).

- [ ] **Step 2: Run lint and format checks**

```bash
npm run check
```

Expected: no lint or format errors.

- [ ] **Step 3: Run E2E tests**

```bash
npm run test:e2e
```

Expected: all E2E tests pass. The `docType` addition is transparent to the UI.

- [ ] **Step 4: Verify cross-type isolation end-to-end**

In a browser with the app running, verify via console:

```js
// After adding a task via the UI, check it has docType
const db = new PouchDB('fortudo-YOUR_ROOM_CODE');
const result = await db.allDocs({ include_docs: true });
result.rows.forEach(row => console.log(row.id, row.doc.docType));
// All should show docType: 'task'
```

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -u
git commit -m "fix: address lint/format issues from Phase 2 storage changes"
```

---

## Summary of commits

1. `feat: scope loadTasks and saveTasks to docType 'task'`
2. `feat: add idempotent docType migration for legacy documents`
3. `feat: add activity CRUD storage functions`
4. `feat: add config document CRUD storage functions`
5. `feat: wire docType migration into app boot sequence`
6. `feat: enforce docType 'task' on putTask`
7. `fix: address lint/format issues from Phase 2` (if needed)
