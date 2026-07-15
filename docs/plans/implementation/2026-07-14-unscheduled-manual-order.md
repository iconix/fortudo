# Unscheduled Manual Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a remembered My order view for the global Unscheduled list, with persistent manual sequencing, accessible menu moves, and pointer/touch drag handles while preserving the current Priority view.

**Architecture:** Keep ordering rules and mutations in `tasks/manager.js`, add a non-destructive storage batch upsert for atomic-looking reorder persistence, and keep the local display preference in a small browser-storage module. The renderer owns mode-specific markup and accessibility feedback; delegated DOM handlers translate sort, menu, and drag gestures into the existing unscheduled callback boundary. A focused pointer controller owns drag state and defers remote rerenders until a gesture ends.

**Tech Stack:** Vanilla JavaScript ES modules, PouchDB 9, Jest 30 with jsdom, Tailwind CSS 3 plus `public/css/custom.css`, Python/Playwright E2E, Firebase-hosted PWA precache generation.

## Global Constraints

- Preserve Priority as the initial mode for existing users; remember later selections only in local browser storage.
- Internal sort-mode values are exactly `priority` and `manual`; user-facing copy is exactly `Priority` and `My order`.
- Manual order is one room-synced global Unscheduled sequence, not a day-specific plan.
- Completed tasks remain in place in My order and remain movable.
- New and newly unscheduled tasks are inserted after the last incomplete task; if none are incomplete, insert before completed tasks.
- Dragging starts only from a six-dot handle; the task card itself remains scrollable and interactive.
- Every drag operation must also be available through Move up, Move down, Move to top, and Move to bottom menu commands.
- Reordering is quiet on success and shows a rose error toast plus the prior order on local persistence failure.
- Do not add third-party drag-and-drop or sorting dependencies.
- Follow strict TDD: observe each new test fail before adding its implementation.
- Run commands from `C:\Users\narho\Documents\GitHub\fortudo\.worktrees\unscheduled-manual-order` so Node and E2E tooling resolve against the feature worktree.

---

## File and Responsibility Map

| File | Responsibility |
|---|---|
| `public/js/storage.js` | Add non-destructive `putTasks(tasks)` batch upsert with revision-map updates. |
| `public/js/tasks/manager.js` | Manual comparator, fallback rules, rank normalization, lifecycle placement, reorder/move operations, rollback. |
| `public/js/tasks/unscheduled-sort-mode.js` | Validate, read, and write the browser-local `priority`/`manual` display preference. |
| `public/js/tasks/unscheduled-renderer.js` | Mode control state, handles, Move menu, accessible status, focus restoration, deferred list rendering. |
| `public/js/tasks/unscheduled-handlers.js` | Handle mode changes and async reorder results through the manager/coordinator boundary. |
| `public/js/tasks/unscheduled-drag.js` | Pointer/touch gesture, insertion marker, edge scrolling, drag cancellation, deferred rerender queue. |
| `public/js/dom-renderer.js` | Delegate sort and Move clicks; connect the drag controller to unscheduled callbacks. |
| `public/js/app.js` | Render the list using the remembered mode without adding DOM logic. |
| `public/index.html` | Static two-option sort control and polite live region. |
| `public/css/custom.css` | Handle, lifted-card, and insertion-marker states not represented by static Tailwind utilities. |
| `public/css/tailwind.css` | Regenerated committed Tailwind output. |
| `public/sw-precache.js`, `public/sw.js` | Regenerated PWA precache list/version after adding modules and assets. |
| `__tests__/*.test.js` | Unit, interaction, persistence, accessibility, and app-wiring coverage. |
| `tests/e2e/test_unscheduled_order.py` | User-visible mode switching, menu reorder, completion, insertion, reload, and pointer drag flow. |

---

### Task 1: Add Non-destructive Batch Task Upserts

**Files:**
- Modify: `public/js/storage.js:121-147,244-251`
- Modify: `__tests__/storage.test.js:23-35,87-137`

**Interfaces:**
- Consumes: existing `toStoredDoc(record, docType)`, `getTrackedRevision(id, docType)`, `taskRevMap`, and `debouncedSync()`.
- Produces: `putTasks(tasks: Object[]): Promise<void>`, which updates only the supplied task documents and rejects when any PouchDB bulk result contains an error.

- [ ] **Step 1: Write failing storage tests**

Add `putTasks` to the storage import and add these tests after the existing `putTask` block:

```js
describe('putTasks', () => {
    test('upserts only the supplied tasks and preserves unrelated documents', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putTask({
            id: 'unsched-1',
            type: 'unscheduled',
            description: 'First',
            status: 'incomplete',
            priority: 'medium',
            manualOrder: 0
        });
        await putTask({
            id: 'sched-1',
            type: 'scheduled',
            description: 'Keep me',
            status: 'incomplete'
        });

        await putTasks([
            {
                id: 'unsched-1',
                type: 'unscheduled',
                description: 'First',
                status: 'incomplete',
                priority: 'medium',
                manualOrder: 2
            },
            {
                id: 'unsched-2',
                type: 'unscheduled',
                description: 'Second',
                status: 'incomplete',
                priority: 'low',
                manualOrder: 1
            }
        ]);

        const stored = await loadTasks();
        expect(stored).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 'unsched-1', manualOrder: 2 }),
                expect.objectContaining({ id: 'unsched-2', manualOrder: 1 }),
                expect.objectContaining({ id: 'sched-1', description: 'Keep me' })
            ])
        );
    });

    test('preserves manualOrder through PouchDB replication', async () => {
        await initStorage(uniqueRoomCode(), { adapter: 'memory' });
        await putTasks([
            {
                id: 'unsched-sync',
                type: 'unscheduled',
                description: 'Synced order',
                status: 'incomplete',
                priority: 'medium',
                manualOrder: 7
            }
        ]);
        const replica = new PouchDB(uniqueRoomCode(), { adapter: 'memory' });
        try {
            await getDb().replicate.to(replica);
            await expect(replica.get('unsched-sync')).resolves.toEqual(
                expect.objectContaining({ manualOrder: 7, docType: 'task' })
            );
        } finally {
            await replica.destroy();
        }
    });
});
```

- [ ] **Step 2: Run the storage tests and confirm the missing export failure**

Run:

```bash
npm test -- --runInBand __tests__/storage.test.js
```

Expected: FAIL because `putTasks` is not exported.

- [ ] **Step 3: Implement typed batch upsert and the public task wrapper**

Add this helper next to `putTypedDoc` and export the wrapper next to `putTask`:

```js
async function putTypedDocs(records, docType) {
    ensureStorageInitialized();
    if (!Array.isArray(records) || records.length === 0) return;

    const docs = await Promise.all(
        records.map(async (record) => {
            const doc = toStoredDoc(record, docType);
            const existingRev = await getTrackedRevision(record.id, docType);
            if (existingRev) doc._rev = existingRev;
            return doc;
        })
    );

    const results = await db.bulkDocs(docs);
    const revStore = getRevStore(docType);
    results.forEach((result) => {
        if (result.ok) revStore.set(result.id, result.rev);
    });

    const failure = results.find((result) => result.error);
    if (failure) {
        throw new Error(`Bulk ${docType} write failed for ${failure.id}: ${failure.reason}`);
    }
    debouncedSync();
}

/**
 * Upsert a set of task documents without deleting unrelated tasks.
 * @param {Object[]} tasksToPut
 */
export async function putTasks(tasksToPut) {
    await putTypedDocs(tasksToPut, DOC_TYPES.TASK);
}
```

- [ ] **Step 4: Run storage tests**

Run: `npm test -- --runInBand __tests__/storage.test.js`

Expected: PASS, including preservation of the unrelated task and the replication assertion.

- [ ] **Step 5: Commit the storage seam**

```bash
git add public/js/storage.js __tests__/storage.test.js
git commit -m "feat: add batch task upserts"
```

---

### Task 2: Add Deterministic Manual Sorting

**Files:**
- Modify: `public/js/tasks/manager.js:24-38,163-198`
- Modify: `__tests__/task-management.test.js:2157-2245`

**Interfaces:**
- Consumes: existing task state and Priority comparator fields (`status`, `priority`, `estDuration`).
- Produces: `getSortedUnscheduledTasks(mode?: 'priority' | 'manual'): UnscheduledTask[]`; default remains `priority` for backwards compatibility.

- [ ] **Step 1: Add failing manual-sort tests**

Extend `describe('Unscheduled Task Sorting')` with:

```js
test('sorts by valid manualOrder without grouping completed tasks', () => {
    const completed = createUnscheduledTask('low', 30, 'completed');
    const first = createUnscheduledTask('low', 30);
    const last = createUnscheduledTask('high', 10);
    completed.id = 'completed';
    first.id = 'first';
    last.id = 'last';
    completed.manualOrder = 1;
    first.manualOrder = 0;
    last.manualOrder = 2;
    updateTaskState([last, completed, first]);

    expect(getSortedUnscheduledTasks('manual').map((task) => task.id)).toEqual([
        'first',
        'completed',
        'last'
    ]);
});

test('uses Priority order when every manualOrder is missing', () => {
    const low = createUnscheduledTask('low', 10);
    const high = createUnscheduledTask('high', 60);
    low.id = 'low';
    high.id = 'high';
    updateTaskState([low, high]);

    expect(getSortedUnscheduledTasks('manual').map((task) => task.id)).toEqual(['high', 'low']);
});

test('places unranked incomplete tasks before ranked completed tasks in mixed data', () => {
    const rankedIncomplete = createUnscheduledTask('low', 30);
    const rankedCompleted = createUnscheduledTask('high', 30, 'completed');
    const unrankedIncomplete = createUnscheduledTask('high', 30);
    const unrankedCompleted = createUnscheduledTask('medium', 30, 'completed');
    Object.assign(rankedIncomplete, { id: 'ranked-incomplete', manualOrder: 0 });
    Object.assign(rankedCompleted, { id: 'ranked-completed', manualOrder: 1 });
    unrankedIncomplete.id = 'unranked-incomplete';
    unrankedIncomplete.manualOrder = -1;
    unrankedCompleted.id = 'unranked-completed';
    updateTaskState([
        rankedCompleted,
        unrankedCompleted,
        rankedIncomplete,
        unrankedIncomplete
    ]);

    expect(getSortedUnscheduledTasks('manual').map((task) => task.id)).toEqual([
        'ranked-incomplete',
        'unranked-incomplete',
        'ranked-completed',
        'unranked-completed'
    ]);
});

test('uses task id to break duplicate manualOrder ties', () => {
    const b = createUnscheduledTask('medium', 30);
    const a = createUnscheduledTask('medium', 30);
    Object.assign(b, { id: 'b', manualOrder: 4 });
    Object.assign(a, { id: 'a', manualOrder: 4 });
    updateTaskState([b, a]);

    expect(getSortedUnscheduledTasks('manual').map((task) => task.id)).toEqual(['a', 'b']);
});
```

- [ ] **Step 2: Run the focused manager tests and observe manual mode fail**

Run:

```bash
npm test -- --runInBand __tests__/task-management.test.js -t "Unscheduled Task Sorting"
```

Expected: FAIL because the current function ignores the mode argument.

- [ ] **Step 3: Replace the unscheduled comparator block**

Update the unscheduled typedef with `@property {number} [manualOrder]`, then replace the current sorting helpers with:

```js
const isValidManualOrder = (value) => Number.isFinite(value) && value >= 0;

const comparePriority = (a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    if (a.estDuration !== null && b.estDuration !== null) {
        const durationDiff = a.estDuration - b.estDuration;
        if (durationDiff !== 0) return durationDiff;
    } else if (a.estDuration !== null) {
        return -1;
    } else if (b.estDuration !== null) {
        return 1;
    }
    return a.id.localeCompare(b.id);
};

const sortPriorityUnscheduledTasks = (tasksToSort) => tasksToSort.sort(comparePriority);

const sortManualUnscheduledTasks = (tasksToSort) => {
    const ranked = tasksToSort
        .filter((task) => isValidManualOrder(task.manualOrder))
        .sort((a, b) => a.manualOrder - b.manualOrder || a.id.localeCompare(b.id));
    if (ranked.length === 0) return sortPriorityUnscheduledTasks(tasksToSort);

    const unranked = tasksToSort.filter((task) => !isValidManualOrder(task.manualOrder));
    const unrankedIncomplete = unranked
        .filter((task) => task.status !== 'completed')
        .sort(comparePriority);
    const unrankedCompleted = unranked
        .filter((task) => task.status === 'completed')
        .sort(comparePriority);
    const lastIncomplete = ranked.reduce(
        (latest, task, index) => (task.status !== 'completed' ? index : latest),
        -1
    );

    return [
        ...ranked.slice(0, lastIncomplete + 1),
        ...unrankedIncomplete,
        ...ranked.slice(lastIncomplete + 1),
        ...unrankedCompleted
    ];
};

export const getSortedUnscheduledTasks = (mode = 'priority') => {
    const unscheduledTasks = tasks.filter((task) => task.type === 'unscheduled');
    return mode === 'manual'
        ? sortManualUnscheduledTasks(unscheduledTasks)
        : sortPriorityUnscheduledTasks(unscheduledTasks);
};
```

- [ ] **Step 4: Run all manager tests**

Run: `npm test -- --runInBand __tests__/task-management.test.js`

Expected: PASS; existing zero-argument calls still use Priority.

- [ ] **Step 5: Commit deterministic manual sorting**

```bash
git add public/js/tasks/manager.js __tests__/task-management.test.js
git commit -m "feat: sort unscheduled tasks by manual order"
```

---

### Task 3: Implement Reorder Mutations, Rollback, and Lifecycle Placement

**Files:**
- Modify: `public/js/tasks/manager.js:12,279-318,691-701,1372-1528`
- Modify: `__tests__/task-management.test.js`

**Interfaces:**
- Consumes: `putTasks(tasks)`, `getSortedUnscheduledTasks('manual')`, and existing `stripUIFlags`.
- Produces:
  - `reorderUnscheduledTask(taskId: string, targetIndex: number): Promise<TaskOperationResult & {position?: number, total?: number}>`
  - `moveUnscheduledTask(taskId: string, action: 'up'|'down'|'top'|'bottom'): Promise<TaskOperationResult & {position?: number, total?: number}>`

- [ ] **Step 1: Mock the batch seam and add failing reorder tests**

Add `putTasks: jest.fn(() => Promise.resolve())` to the storage mock and its storage import. Expand the existing manager destructure inside `describe('Unscheduled Task Sorting')` to include `reorderUnscheduledTask`, `moveUnscheduledTask`, `updateUnscheduledTask`, `toggleUnscheduledTaskCompleteState`, and `unscheduleTask`. Place the following nested describe before the outer sorting describe closes so it shares `createUnscheduledTask`:

```js
describe('Unscheduled Manual Order Mutations', () => {
    beforeEach(() => {
        jest.mocked(putTasks).mockResolvedValue();
    });

    test('normalizes missing ranks and moves a task to the requested index', async () => {
        const high = createUnscheduledTask('high', 60);
        const low = createUnscheduledTask('low', 10);
        high.id = 'high';
        low.id = 'low';
        updateTaskState([low, high]);

        const result = await reorderUnscheduledTask('low', 0);

        expect(result).toEqual(expect.objectContaining({ success: true, position: 1, total: 2 }));
        expect(getSortedUnscheduledTasks('manual').map((task) => task.id)).toEqual([
            'low',
            'high'
        ]);
        expect(putTasks).toHaveBeenCalledWith([
            expect.objectContaining({ id: 'low', manualOrder: 0 }),
            expect.objectContaining({ id: 'high', manualOrder: 1 })
        ]);
    });

    test('restores missing and existing ranks when persistence rejects', async () => {
        const first = createUnscheduledTask('medium', 30);
        const second = createUnscheduledTask('medium', 30);
        Object.assign(first, { id: 'first', manualOrder: 5 });
        second.id = 'second';
        updateTaskState([first, second]);
        jest.mocked(putTasks).mockRejectedValueOnce(new Error('disk full'));

        const result = await reorderUnscheduledTask('second', 0);

        expect(result).toEqual({ success: false, reason: 'Could not save task order.' });
        expect(getTaskById('first').manualOrder).toBe(5);
        expect(getTaskById('second')).not.toHaveProperty('manualOrder');
    });

    test.each([
        ['up', 1],
        ['down', 3],
        ['top', 1],
        ['bottom', 3]
    ])('supports the %s menu action', async (action, expectedPosition) => {
        const tasks = ['a', 'b', 'c'].map((id, manualOrder) => ({
            ...createUnscheduledTask('medium', 30),
            id,
            manualOrder
        }));
        updateTaskState(tasks);

        const result = await moveUnscheduledTask('b', action);

        expect(result.success).toBe(true);
        expect(result.position).toBe(expectedPosition);
    });

    test('rejects missing, editing, and out-of-range reorder requests', async () => {
        const editing = createUnscheduledTask('medium', 30);
        Object.assign(editing, { id: 'editing', isEditingInline: true, manualOrder: 0 });
        updateTaskState([editing]);

        await expect(reorderUnscheduledTask('missing', 0)).resolves.toEqual({
            success: false,
            reason: 'Unscheduled task not found.'
        });
        await expect(reorderUnscheduledTask('editing', 0)).resolves.toEqual({
            success: false,
            reason: 'Finish editing the task before moving it.'
        });
        await expect(reorderUnscheduledTask('editing', 2)).resolves.toEqual({
            success: false,
            reason: 'Invalid task position.'
        });
    });
});
```

- [ ] **Step 2: Run the mutation tests and verify the missing exports fail**

Run: `npm test -- --runInBand __tests__/task-management.test.js -t "Manual Order Mutations"`

Expected: FAIL because the reorder functions do not exist.

- [ ] **Step 3: Implement normalization, snapshot rollback, reorder, and menu moves**

Import `putTasks`. Add these helpers and exports near the unscheduled sorting block:

```js
const snapshotManualOrders = (orderedTasks) =>
    new Map(
        orderedTasks.map((task) => [
            task.id,
            Object.prototype.hasOwnProperty.call(task, 'manualOrder')
                ? { present: true, value: task.manualOrder }
                : { present: false }
        ])
    );

const restoreManualOrders = (snapshot) => {
    snapshot.forEach((entry, taskId) => {
        const task = getTaskById(taskId);
        if (!task) return;
        if (entry.present) task.manualOrder = entry.value;
        else delete task.manualOrder;
    });
    invalidateTaskCaches();
};

const normalizeManualOrders = (orderedTasks) => {
    orderedTasks.forEach((task, index) => {
        task.manualOrder = index;
    });
    return orderedTasks;
};

export async function reorderUnscheduledTask(taskId, targetIndex) {
    const ordered = getSortedUnscheduledTasks('manual');
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= ordered.length) {
        return { success: false, reason: 'Invalid task position.' };
    }
    const sourceIndex = ordered.findIndex((task) => task.id === taskId);
    if (sourceIndex === -1) {
        return { success: false, reason: 'Unscheduled task not found.' };
    }
    if (ordered[sourceIndex].isEditingInline) {
        return { success: false, reason: 'Finish editing the task before moving it.' };
    }

    const snapshot = snapshotManualOrders(ordered);
    const [movedTask] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, movedTask);
    normalizeManualOrders(ordered);
    invalidateTaskCaches();

    try {
        await putTasks(ordered.map(stripUIFlags));
        return {
            success: true,
            task: movedTask,
            position: targetIndex + 1,
            total: ordered.length
        };
    } catch (error) {
        logger.error('Could not persist unscheduled task order:', error);
        restoreManualOrders(snapshot);
        return { success: false, reason: 'Could not save task order.' };
    }
}

export async function moveUnscheduledTask(taskId, action) {
    const ordered = getSortedUnscheduledTasks('manual');
    const currentIndex = ordered.findIndex((task) => task.id === taskId);
    if (currentIndex === -1) {
        return { success: false, reason: 'Unscheduled task not found.' };
    }
    const targets = {
        up: Math.max(0, currentIndex - 1),
        down: Math.min(ordered.length - 1, currentIndex + 1),
        top: 0,
        bottom: ordered.length - 1
    };
    if (!Object.prototype.hasOwnProperty.call(targets, action)) {
        return { success: false, reason: 'Invalid move action.' };
    }
    return reorderUnscheduledTask(taskId, targets[action]);
}
```

Place the target-range validation after the task lookup if the tests should prioritize “not found” over “invalid position”; keep the tests and implementation consistent.

- [ ] **Step 4: Add failing lifecycle-placement tests**

```js
test('adds a new unscheduled task after the last incomplete manual task', () => {
    updateTaskState([
        {
            ...createUnscheduledTask('medium', 30),
            id: 'a',
            description: 'Existing',
            manualOrder: 0
        },
        {
            ...createUnscheduledTask('medium', 30, 'completed'),
            id: 'done',
            description: 'Done',
            manualOrder: 1
        }
    ]);

    const result = addTask({
        taskType: 'unscheduled',
        description: 'New task',
        priority: 'low',
        estDuration: 15
    });

    expect(result.success).toBe(true);
    expect(getSortedUnscheduledTasks('manual').map((task) => task.description)).toEqual([
        'Existing',
        'New task',
        'Done'
    ]);
});

test('newly unscheduled tasks are inserted after the last incomplete task', () => {
    const scheduled = createTaskWithDateTime({
        id: 'scheduled-source',
        description: 'Scheduled source',
        startTime: '09:00',
        duration: 30
    });
    updateTaskState([
        scheduled,
        { ...createUnscheduledTask('medium', 30), id: 'existing', manualOrder: 0 },
        {
            ...createUnscheduledTask('medium', 30, 'completed'),
            id: 'done',
            manualOrder: 1
        }
    ]);

    expect(unscheduleTask('scheduled-source').success).toBe(true);
    expect(getSortedUnscheduledTasks('manual').map((task) => task.id)).toEqual([
        'existing',
        'scheduled-source',
        'done'
    ]);
});

test('completion and editing do not change manualOrder', () => {
    const task = { ...createUnscheduledTask('medium', 30), id: 'fixed', manualOrder: 9 };
    updateTaskState([task]);

    toggleUnscheduledTaskCompleteState('fixed');
    updateUnscheduledTask('fixed', {
        description: 'Edited',
        priority: 'high',
        estDuration: 45
    });

    expect(getTaskById('fixed').manualOrder).toBe(9);
});
```

- [ ] **Step 5: Implement shared lifecycle placement**

Add and use:

```js
const placeAfterLastIncomplete = (taskToPlace) => {
    const ordered = getSortedUnscheduledTasks('manual').filter(
        (task) => task.id !== taskToPlace.id
    );
    const lastIncompleteIndex = ordered.reduce(
        (latest, task, index) => (task.status !== 'completed' ? index : latest),
        -1
    );
    ordered.splice(lastIncompleteIndex + 1, 0, taskToPlace);
    return normalizeManualOrders(ordered);
};
```

In the unscheduled branch of `addTask`, push the new task, call `placeAfterLastIncomplete`, and pass every normalized task to `finalizeTaskModification` instead of calling `putTask` directly. In `unscheduleTask`, replace the scheduled task, call the same helper, and finalize every changed task. Do not renumber on completion, reopening, editing, scheduling, or deletion.

- [ ] **Step 6: Run manager and handler-adjacent tests**

Run:

```bash
npm test -- --runInBand __tests__/task-management.test.js __tests__/add-task-handler.test.js __tests__/scheduled-task-handlers.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit the manager behavior**

```bash
git add public/js/tasks/manager.js __tests__/task-management.test.js
git commit -m "feat: persist unscheduled manual order"
```

---

### Task 4: Add the Remembered Sort Mode and Mode-specific Rendering

**Files:**
- Create: `public/js/tasks/unscheduled-sort-mode.js`
- Create: `__tests__/unscheduled-sort-mode.test.js`
- Modify: `public/index.html:488-500`
- Modify: `public/js/tasks/unscheduled-renderer.js:49-117,221-329`
- Modify: `public/js/dom-renderer.js:1-30,718-733`
- Modify: `public/js/app.js:1-25,165-169`
- Modify: `__tests__/unscheduled-task-renderer.test.js`
- Modify: `__tests__/app.test.js`

**Interfaces:**
- Produces from `unscheduled-sort-mode.js`:
  - `UNSCHEDULED_SORT_MODES = { PRIORITY: 'priority', MANUAL: 'manual' }`
  - `getUnscheduledSortMode(storage?: Storage): 'priority'|'manual'`
  - `setUnscheduledSortMode(mode, storage?: Storage): 'priority'|'manual'`
- Changes `renderUnscheduledTasks(tasks, callbacks, setCallbacks, sortMode = 'priority')` to receive the active mode explicitly.
- Produces renderer helpers `announceUnscheduledTaskPosition(task, position, total)` and `focusUnscheduledTaskActions(taskId)` for Task 5.

- [ ] **Step 1: Write failing preference tests**

Create:

```js
/** @jest-environment jsdom */

import {
    UNSCHEDULED_SORT_MODES,
    getUnscheduledSortMode,
    setUnscheduledSortMode
} from '../public/js/tasks/unscheduled-sort-mode.js';

describe('unscheduled sort mode preference', () => {
    beforeEach(() => localStorage.clear());

    test('defaults missing and corrupt values to Priority', () => {
        expect(getUnscheduledSortMode()).toBe(UNSCHEDULED_SORT_MODES.PRIORITY);
        localStorage.setItem('fortudo-unscheduled-sort-mode', 'alphabetical');
        expect(getUnscheduledSortMode()).toBe(UNSCHEDULED_SORT_MODES.PRIORITY);
    });

    test('remembers My order locally', () => {
        expect(setUnscheduledSortMode(UNSCHEDULED_SORT_MODES.MANUAL)).toBe('manual');
        expect(localStorage.getItem('fortudo-unscheduled-sort-mode')).toBe('manual');
        expect(getUnscheduledSortMode()).toBe('manual');
    });

    test('normalizes invalid writes to Priority', () => {
        expect(setUnscheduledSortMode('bad-value')).toBe('priority');
        expect(getUnscheduledSortMode()).toBe('priority');
    });
});
```

- [ ] **Step 2: Run the new test and confirm the module is missing**

Run: `npm test -- --runInBand __tests__/unscheduled-sort-mode.test.js`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the local preference module**

```js
export const UNSCHEDULED_SORT_MODES = Object.freeze({
    PRIORITY: 'priority',
    MANUAL: 'manual'
});

const STORAGE_KEY = 'fortudo-unscheduled-sort-mode';
const VALID_MODES = new Set(Object.values(UNSCHEDULED_SORT_MODES));

function normalizeMode(mode) {
    return VALID_MODES.has(mode) ? mode : UNSCHEDULED_SORT_MODES.PRIORITY;
}

export function getUnscheduledSortMode(storage = globalThis.localStorage) {
    if (!storage) return UNSCHEDULED_SORT_MODES.PRIORITY;
    return normalizeMode(storage.getItem(STORAGE_KEY));
}

export function setUnscheduledSortMode(mode, storage = globalThis.localStorage) {
    const normalized = normalizeMode(mode);
    if (storage) storage.setItem(STORAGE_KEY, normalized);
    return normalized;
}
```

- [ ] **Step 4: Add failing renderer tests for Priority and My order**

Update the renderer test `beforeEach` and add this factory and the mode assertions:

```js
document.body.innerHTML = `
    <div id="unscheduled-sort-control">
        <button data-unscheduled-sort-mode="manual" aria-pressed="false">My order</button>
        <button data-unscheduled-sort-mode="priority" aria-pressed="true">Priority</button>
    </div>
    <p id="unscheduled-order-status"></p>
    <div id="unscheduled-task-list"></div>
`;

function createRendererTask(overrides = {}) {
    return {
        id: 'unsched-render',
        type: 'unscheduled',
        description: 'Rendered task',
        priority: 'medium',
        estDuration: 30,
        status: 'incomplete',
        isEditingInline: false,
        ...overrides
    };
}

test('renders My order handles and boundary-aware Move actions', () => {
    renderUnscheduledTasks(
        [
            createRendererTask({ id: 'first', description: 'First' }),
            createRendererTask({ id: 'last', description: 'Last' })
        ],
        {},
        jest.fn(),
        'manual'
    );

    const cards = document.querySelectorAll('.task-card');
    expect(cards[0].querySelector('.unscheduled-drag-handle')).not.toBeNull();
    expect(cards[0].querySelector('[data-move-action="up"]').disabled).toBe(true);
    expect(cards[0].querySelector('[data-move-action="down"]').disabled).toBe(false);
    expect(cards[1].querySelector('[data-move-action="bottom"]').disabled).toBe(true);
    expect(document.querySelector('[data-unscheduled-sort-mode="manual"]').getAttribute('aria-pressed')).toBe('true');
});

test('hides every reorder affordance in Priority mode', () => {
    renderUnscheduledTasks([createRendererTask()], {}, jest.fn(), 'priority');
    expect(document.querySelector('.unscheduled-drag-handle')).toBeNull();
    expect(document.querySelector('[data-move-action]')).toBeNull();
    expect(document.querySelector('[data-unscheduled-sort-mode="priority"]').getAttribute('aria-pressed')).toBe('true');
});

test('keeps completed tasks movable and disables an editing task handle', () => {
    renderUnscheduledTasks(
        [
            createRendererTask({ id: 'done', status: 'completed' }),
            createRendererTask({ id: 'editing', isEditingInline: true })
        ],
        {},
        jest.fn(),
        'manual'
    );
    expect(document.querySelector('[data-task-id="done"] .unscheduled-drag-handle').disabled).toBe(false);
    expect(document.querySelector('[data-task-id="editing"] .unscheduled-drag-handle').disabled).toBe(true);
});
```

Add a local `createRendererTask(overrides = {})` factory so every test supplies the complete current task shape.

- [ ] **Step 5: Add the static sort control and live region**

Replace the current unscheduled heading row with:

```html
<div class="flex flex-col gap-2 mb-2 sm:mb-3 sm:flex-row sm:items-center sm:justify-between">
    <h3 class="text-lg sm:text-xl font-normal text-indigo-400 pl-2 flex items-center">
        <i class="fa-solid fa-list-ul mr-2"></i>Unscheduled Tasks
    </h3>
    <div
        id="unscheduled-sort-control"
        class="inline-flex self-start rounded-lg border border-slate-600 bg-slate-800 p-1"
        role="group"
        aria-label="Sort unscheduled tasks"
    >
        <button
            type="button"
            class="min-h-9 px-3 rounded-md text-sm font-medium transition-colors text-slate-300 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            data-unscheduled-sort-mode="manual"
            aria-pressed="false"
        >My order</button>
        <button
            type="button"
            class="min-h-9 px-3 rounded-md text-sm font-medium transition-colors bg-indigo-500 text-white shadow focus:outline-none focus:ring-2 focus:ring-indigo-300"
            data-unscheduled-sort-mode="priority"
            aria-pressed="true"
        >Priority</button>
    </div>
</div>
<p id="unscheduled-order-status" class="sr-only" aria-live="polite" aria-atomic="true"></p>
```

- [ ] **Step 6: Implement renderer mode helpers and markup**

Add:

```js
const SORT_ACTIVE_CLASSES = ['bg-indigo-500', 'text-white', 'shadow'];
const SORT_INACTIVE_CLASSES = ['text-slate-300', 'hover:bg-slate-700'];

function syncUnscheduledSortControl(sortMode) {
    document.querySelectorAll('[data-unscheduled-sort-mode]').forEach((button) => {
        const selected = button.dataset.unscheduledSortMode === sortMode;
        button.setAttribute('aria-pressed', String(selected));
        button.classList.toggle(SORT_ACTIVE_CLASSES[0], selected);
        button.classList.toggle(SORT_ACTIVE_CLASSES[1], selected);
        button.classList.toggle(SORT_ACTIVE_CLASSES[2], selected);
        SORT_INACTIVE_CLASSES.forEach((className) => button.classList.toggle(className, !selected));
    });
}

function renderMoveMenu(task, index, total) {
    const actions = [
        ['up', 'fa-arrow-up', 'Move up', index === 0],
        ['down', 'fa-arrow-down', 'Move down', index === total - 1],
        ['top', 'fa-angles-up', 'Move to top', index === 0],
        ['bottom', 'fa-angles-down', 'Move to bottom', index === total - 1]
    ];
    return `<div class="unscheduled-move-actions mt-1.5 pt-1.5 border-t border-slate-700">
        ${actions
            .map(
                ([action, icon, label, disabled]) => `<button
                    class="btn-move-unscheduled grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2 w-full min-h-10 px-2.5 rounded-md text-slate-300 hover:bg-slate-700 text-sm text-left disabled:opacity-50"
                    type="button" role="menuitem" data-move-action="${action}"
                    ${disabled ? 'disabled' : ''}>
                    <i class="fa-solid ${icon} text-slate-400 text-center" aria-hidden="true"></i>
                    <span>${label}</span>
                </button>`
            )
            .join('')}
    </div>`;
}

export function announceUnscheduledTaskPosition(task, position, total) {
    const status = document.getElementById('unscheduled-order-status');
    if (status) status.textContent = `${task.description}, position ${position} of ${total}.`;
}

export function focusUnscheduledTaskActions(taskId) {
    const card = Array.from(document.querySelectorAll('#unscheduled-task-list [data-task-id]')).find(
        (element) => element.dataset.taskId === taskId
    );
    card?.querySelector('.btn-unscheduled-task-actions-menu')?.focus();
}
```

Pass `sortMode`, `index`, and `total` through card creation. In manual mode, prepend a button with classes `unscheduled-drag-handle drag-handle`, `type="button"`, `aria-label="Reorder ${task.description}"`, and a six-dot icon. Disable it for `isEditingInline` or a task linked to the running timer. Append `renderMoveMenu` to the existing actions menu only in manual mode.

- [ ] **Step 7: Thread the remembered mode through app renders**

Import `getUnscheduledSortMode` from `./tasks/unscheduled-sort-mode.js` in both `app.js` and `dom-renderer.js`.

In `app.js`'s `refreshTaskDisplays`:

```js
const sortMode = getUnscheduledSortMode();
renderUnscheduledTasks(
    getSortedUnscheduledTasks(sortMode),
    unscheduledTaskEventCallbacks,
    sortMode
);
```

Update the DOM wrapper and its `refreshUI` call explicitly:

```js
export function renderUnscheduledTasks(
    unscheduledTasks,
    eventCallbacks,
    sortMode = getUnscheduledSortMode()
) {
    const callbacks = eventCallbacks || globalUnscheduledTaskCallbacks;
    renderUnscheduledTasksBase(
        unscheduledTasks,
        callbacks,
        (cb) => {
            globalUnscheduledTaskCallbacks = cb;
        },
        sortMode
    );
}

const sortMode = getUnscheduledSortMode();
renderUnscheduledTasks(getSortedUnscheduledTasks(sortMode), undefined, sortMode);
```

Keep `app.js` orchestration-only.

Add this app-level regression using the existing `setupAppWithTasks` helper:

```js
test('boots into the remembered manual mode without changing Priority data', async () => {
    localStorage.setItem('fortudo-unscheduled-sort-mode', 'manual');
    await setupAppWithTasks([
        {
            id: 'priority-first',
            type: 'unscheduled',
            description: 'Priority first',
            status: 'incomplete',
            priority: 'high',
            estDuration: 30,
            manualOrder: 1
        },
        {
            id: 'manual-first',
            type: 'unscheduled',
            description: 'Manual first',
            status: 'incomplete',
            priority: 'low',
            estDuration: 30,
            manualOrder: 0
        }
    ]);

    expect(document.querySelector('[data-unscheduled-sort-mode="manual"]').getAttribute('aria-pressed')).toBe('true');
    expect(
        Array.from(document.querySelectorAll('#unscheduled-task-list .task-card')).map(
            (card) => card.dataset.taskId
        )
    ).toEqual(['manual-first', 'priority-first']);
});
```

- [ ] **Step 8: Run focused preference, renderer, DOM, and app tests**

Run:

```bash
npm test -- --runInBand __tests__/unscheduled-sort-mode.test.js __tests__/unscheduled-task-renderer.test.js __tests__/dom-interaction.test.js __tests__/app.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit the mode UI**

```bash
git add public/index.html public/js/tasks/unscheduled-sort-mode.js public/js/tasks/unscheduled-renderer.js public/js/dom-renderer.js public/js/app.js __tests__/unscheduled-sort-mode.test.js __tests__/unscheduled-task-renderer.test.js __tests__/app.test.js
git commit -m "feat: add unscheduled sort modes"
```

---

### Task 5: Wire Sort Changes and Accessible Menu Moves

**Files:**
- Modify: `public/js/tasks/unscheduled-handlers.js:1-15,164-190`
- Modify: `public/js/dom-renderer.js:566-701`
- Modify: `__tests__/unscheduled-task-handlers.test.js`
- Modify: `__tests__/dom-interaction.test.js:1015-1228`

**Interfaces:**
- Consumes: `moveUnscheduledTask`, `reorderUnscheduledTask`, sort-mode setters, renderer announce/focus helpers, and `refreshUI()`.
- Adds callback entries:
  - `onChangeUnscheduledSortMode(mode)`
  - `onMoveUnscheduledTask(taskId, action): Promise<void>`
  - `onReorderUnscheduledTask(taskId, targetIndex): Promise<void>`

- [ ] **Step 1: Add failing handler tests for mode, success, and rollback UX**

Add the three new handlers to the test import. Mock and import their UI dependencies:

```js
jest.mock('../public/js/tasks/unscheduled-sort-mode.js', () => ({
    setUnscheduledSortMode: jest.fn((mode) => mode)
}));

jest.mock('../public/js/tasks/unscheduled-renderer.js', () => ({
    announceUnscheduledTaskPosition: jest.fn(),
    focusUnscheduledTaskActions: jest.fn()
}));

import { setUnscheduledSortMode } from '../public/js/tasks/unscheduled-sort-mode.js';
import {
    announceUnscheduledTaskPosition,
    focusUnscheduledTaskActions
} from '../public/js/tasks/unscheduled-renderer.js';
```

Then add:

```js
test('changes the remembered sort mode and refreshes', () => {
    handleChangeUnscheduledSortMode('manual');
    expect(setUnscheduledSortMode).toHaveBeenCalledWith('manual');
    expect(refreshUI).toHaveBeenCalled();
});

test('moves a task, refreshes, announces, and restores action focus', async () => {
    jest.spyOn(taskManager, 'moveUnscheduledTask').mockResolvedValueOnce({
        success: true,
        task: createUnscheduledTask({ id: 'moved', description: 'Moved task' }),
        position: 1,
        total: 3
    });

    await handleMoveUnscheduledTask('moved', 'top');

    expect(refreshUI).toHaveBeenCalled();
    expect(announceUnscheduledTaskPosition).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'moved' }),
        1,
        3
    );
    expect(focusUnscheduledTaskActions).toHaveBeenCalledWith('moved');
    expect(showToast).not.toHaveBeenCalled();
});

test('refreshes the rolled-back order and shows an error toast', async () => {
    jest.spyOn(taskManager, 'reorderUnscheduledTask').mockResolvedValueOnce({
        success: false,
        reason: 'Could not save task order.'
    });

    await handleReorderUnscheduledTask('task-1', 2);

    expect(refreshUI).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
        'Could not save task order. Your previous order was restored.',
        { theme: 'rose' }
    );
});
```

Also assert `createUnscheduledTaskCallbacks()` exposes all three new callback names.

- [ ] **Step 2: Run handlers and confirm missing functions fail**

Run: `npm test -- --runInBand __tests__/unscheduled-task-handlers.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement handler orchestration**

Import `moveUnscheduledTask` and `reorderUnscheduledTask` from `./manager.js`, `setUnscheduledSortMode` from `./unscheduled-sort-mode.js`, and the two renderer helpers from `./unscheduled-renderer.js`. Add:

```js
export function handleChangeUnscheduledSortMode(mode) {
    setUnscheduledSortMode(mode);
    refreshUI();
}

async function finishOrderChange(result, { restoreFocus = false } = {}) {
    refreshUI();
    if (!result.success) {
        const message =
            result.reason === 'Could not save task order.'
                ? 'Could not save task order. Your previous order was restored.'
                : result.reason || 'Could not move task.';
        showToast(message, { theme: 'rose' });
        return;
    }
    announceUnscheduledTaskPosition(result.task, result.position, result.total);
    if (restoreFocus) focusUnscheduledTaskActions(result.task.id);
}

export async function handleMoveUnscheduledTask(taskId, action) {
    await finishOrderChange(await moveUnscheduledTask(taskId, action), {
        restoreFocus: true
    });
}

export async function handleReorderUnscheduledTask(taskId, targetIndex) {
    await finishOrderChange(await reorderUnscheduledTask(taskId, targetIndex));
}
```

Add the three functions to the callback factory.

- [ ] **Step 4: Add failing DOM delegation tests**

Extend the test callback object and test DOM with sort buttons and Move items. Add:

```js
test('delegates the My order mode control', () => {
    document.body.insertAdjacentHTML(
        'afterbegin',
        '<div id="unscheduled-sort-control"><button data-unscheduled-sort-mode="manual">My order</button></div>'
    );
    initializeUnscheduledTaskListEventListeners(mockUnscheduledTaskCallbacks);

    document.querySelector('[data-unscheduled-sort-mode="manual"]').click();

    expect(mockUnscheduledTaskCallbacks.onChangeUnscheduledSortMode).toHaveBeenCalledWith(
        'manual'
    );
});

test('delegates a Move to top action and closes the menu', () => {
    setupUnscheduledTask('unsched-1');
    const menu = document.querySelector('.unscheduled-task-actions-menu');
    menu.insertAdjacentHTML(
        'beforeend',
        '<button class="btn-move-unscheduled" data-move-action="top">Move to top</button>'
    );
    document.querySelector('.btn-unscheduled-task-actions-menu').click();

    document.querySelector('[data-move-action="top"]').click();

    expect(mockUnscheduledTaskCallbacks.onMoveUnscheduledTask).toHaveBeenCalledWith(
        'unsched-1',
        'top'
    );
    expect(menu.hidden).toBe(true);
});

test('ignores a disabled Move action', () => {
    setupUnscheduledTask('unsched-1');
    const menu = document.querySelector('.unscheduled-task-actions-menu');
    menu.insertAdjacentHTML(
        'beforeend',
        '<button class="btn-move-unscheduled" data-move-action="up" disabled>Move up</button>'
    );

    document.querySelector('[data-move-action="up"]').click();

    expect(mockUnscheduledTaskCallbacks.onMoveUnscheduledTask).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Implement sort-control and Move delegation**

Add a control click handler:

```js
function handleUnscheduledSortControlClick(event) {
    const button = event.target.closest('[data-unscheduled-sort-mode]');
    const mode = button?.dataset.unscheduledSortMode;
    if (mode && globalUnscheduledTaskCallbacks?.onChangeUnscheduledSortMode) {
        globalUnscheduledTaskCallbacks.onChangeUnscheduledSortMode(mode);
    }
}
```

In `handleUnscheduledTaskListClick`, check `.btn-move-unscheduled` before schedule/edit/delete branches, close the menu, and call `onMoveUnscheduledTask(taskId, button.dataset.moveAction)`. In `initializeUnscheduledTaskListEventListeners`, remove/add the stable sort-control listener alongside the list listeners.

- [ ] **Step 6: Run handler and delegated-interaction tests**

Run:

```bash
npm test -- --runInBand __tests__/unscheduled-task-handlers.test.js __tests__/dom-interaction.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit accessible menu movement**

```bash
git add public/js/tasks/unscheduled-handlers.js public/js/dom-renderer.js __tests__/unscheduled-task-handlers.test.js __tests__/dom-interaction.test.js
git commit -m "feat: add accessible unscheduled moves"
```

---

### Task 6: Add Pointer and Touch Dragging with Deferred Refresh

**Files:**
- Create: `public/js/tasks/unscheduled-drag.js`
- Create: `__tests__/unscheduled-drag.test.js`
- Modify: `public/js/tasks/unscheduled-renderer.js:303-329`
- Modify: `public/js/dom-renderer.js:690-701,938-946`
- Modify: `public/css/custom.css:1-11`
- Modify: `__tests__/custom-css.test.js`

**Interfaces:**
- Produces:
  - `initializeUnscheduledDrag(listElement, { onDrop })`
  - `renderOrDeferUnscheduledList(renderNow)`
  - `resetUnscheduledDragState()`
- Calls `onDrop(taskId: string, targetIndex: number): Promise<void>` after a successful pointer gesture.

- [ ] **Step 1: Write failing pointer-controller tests**

Create a jsdom test with this setup and the gesture cases:

```js
/** @jest-environment jsdom */

import {
    initializeUnscheduledDrag,
    renderOrDeferUnscheduledList,
    resetUnscheduledDragState
} from '../public/js/tasks/unscheduled-drag.js';

let list;

function pointerEvent(type, { pointerId = 1, pointerType = 'mouse', clientY = 60 } = {}) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
    Object.defineProperties(event, {
        pointerId: { value: pointerId },
        pointerType: { value: pointerType }
    });
    return event;
}

function cardFor(id) {
    return list.querySelector(`[data-task-id="${id}"]`);
}

function handleFor(id) {
    return cardFor(id).querySelector('.unscheduled-drag-handle');
}

beforeEach(() => {
    document.body.innerHTML = `
        <div id="unscheduled-task-list">
            ${['a', 'b', 'c']
                .map(
                    (id) => `<div class="task-card" data-task-id="${id}">
                        <button class="unscheduled-drag-handle">Move ${id}</button>
                    </div>`
                )
                .join('')}
        </div>`;
    list = document.getElementById('unscheduled-task-list');
    ['a', 'b', 'c'].forEach((id, index) => {
        cardFor(id).getBoundingClientRect = () => ({
            top: index * 50,
            height: 40,
            bottom: index * 50 + 40,
            left: 0,
            right: 300,
            width: 300,
            x: 0,
            y: index * 50,
            toJSON: () => ({})
        });
        handleFor(id).setPointerCapture = jest.fn();
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    window.scrollBy = jest.fn();
});

afterEach(() => resetUnscheduledDragState());

test.each(['mouse', 'touch'])('drops a %s gesture at the marker index', async (pointerType) => {
    const onDrop = jest.fn(() => Promise.resolve());
    initializeUnscheduledDrag(list, { onDrop });

    handleFor('b').dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, pointerType, clientY: 60 }));
    list.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, pointerType, clientY: 5 }));
    list.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, pointerType, clientY: 5 }));
    await Promise.resolve();

    expect(onDrop).toHaveBeenCalledWith('b', 0);
    expect(document.querySelector('.unscheduled-drop-indicator')).toBeNull();
});

test('starts only from an enabled handle', () => {
    initializeUnscheduledDrag(list, { onDrop: jest.fn() });
    cardFor('a').dispatchEvent(pointerEvent('pointerdown', { pointerId: 1 }));
    handleFor('b').disabled = true;
    handleFor('b').dispatchEvent(pointerEvent('pointerdown', { pointerId: 2 }));
    expect(document.querySelector('.unscheduled-drop-indicator')).toBeNull();
});

test('defers the latest render until an active gesture settles', async () => {
    let releaseDrop;
    initializeUnscheduledDrag(list, {
        onDrop: () => new Promise((resolve) => {
            releaseDrop = resolve;
        })
    });
    handleFor('a').dispatchEvent(pointerEvent('pointerdown', { pointerId: 1 }));
    const firstRender = jest.fn();
    const latestRender = jest.fn();
    renderOrDeferUnscheduledList(firstRender);
    renderOrDeferUnscheduledList(latestRender);
    list.dispatchEvent(pointerEvent('pointerup', { pointerId: 1 }));

    expect(firstRender).not.toHaveBeenCalled();
    expect(latestRender).not.toHaveBeenCalled();
    releaseDrop();
    await Promise.resolve();
    await Promise.resolve();
    expect(firstRender).not.toHaveBeenCalled();
    expect(latestRender).toHaveBeenCalledTimes(1);
});

test('cancels safely and flushes a queued render on pointercancel', () => {
    const render = jest.fn();
    initializeUnscheduledDrag(list, { onDrop: jest.fn() });
    handleFor('a').dispatchEvent(pointerEvent('pointerdown', { pointerId: 1 }));
    renderOrDeferUnscheduledList(render);
    list.dispatchEvent(pointerEvent('pointercancel', { pointerId: 1 }));
    expect(render).toHaveBeenCalledTimes(1);
});

test('scrolls the viewport near both vertical edges', () => {
    initializeUnscheduledDrag(list, { onDrop: jest.fn(() => Promise.resolve()) });
    handleFor('b').dispatchEvent(pointerEvent('pointerdown', { pointerId: 1 }));

    list.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientY: 20 }));
    list.dispatchEvent(pointerEvent('pointermove', { pointerId: 1, clientY: 780 }));

    expect(window.scrollBy).toHaveBeenNthCalledWith(1, 0, -12);
    expect(window.scrollBy).toHaveBeenNthCalledWith(2, 0, 12);
});
```

- [ ] **Step 2: Run the new drag tests and confirm the module is missing**

Run: `npm test -- --runInBand __tests__/unscheduled-drag.test.js`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the focused drag controller**

Create the module with module-level `activeDrag` and `pendingRender`. The implementation must:

```js
let activeDrag = null;
let pendingRender = null;

export function renderOrDeferUnscheduledList(renderNow) {
    if (!activeDrag) {
        renderNow();
        return;
    }
    pendingRender = renderNow;
}

function flushPendingRender() {
    const render = pendingRender;
    pendingRender = null;
    if (render) render();
}

function getCards(list, movingCard) {
    return Array.from(list.querySelectorAll(':scope > .task-card')).filter(
        (card) => card !== movingCard
    );
}

function updateMarker(list, event) {
    const cards = getCards(list, activeDrag.card);
    const before = cards.find((card) => {
        const rect = card.getBoundingClientRect();
        return event.clientY < rect.top + rect.height / 2;
    });
    list.insertBefore(activeDrag.marker, before || null);
    activeDrag.targetIndex = before ? cards.indexOf(before) : cards.length;

    const edge = 48;
    if (event.clientY < edge) window.scrollBy(0, -12);
    else if (event.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
}

function cleanupDrag() {
    if (!activeDrag) return;
    activeDrag.card.classList.remove('unscheduled-task--dragging');
    activeDrag.handle.removeAttribute('aria-grabbed');
    activeDrag.marker.remove();
    activeDrag = null;
}

export function initializeUnscheduledDrag(list, { onDrop }) {
    list.onpointerdown = (event) => {
        const handle = event.target.closest('.unscheduled-drag-handle');
        const card = handle?.closest('.task-card');
        if (!handle || handle.disabled || !card || activeDrag) return;
        const sourceIndex = Array.from(list.querySelectorAll(':scope > .task-card')).indexOf(card);
        const marker = document.createElement('div');
        marker.className = 'unscheduled-drop-indicator';
        card.after(marker);
        card.classList.add('unscheduled-task--dragging');
        handle.setAttribute('aria-grabbed', 'true');
        handle.setPointerCapture?.(event.pointerId);
        activeDrag = {
            card,
            handle,
            marker,
            pointerId: event.pointerId,
            targetIndex: sourceIndex
        };
        event.preventDefault();
    };

    list.onpointermove = (event) => {
        if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
        updateMarker(list, event);
        event.preventDefault();
    };

    list.onpointerup = async (event) => {
        if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
        const { card, targetIndex } = activeDrag;
        try {
            await onDrop(card.dataset.taskId, targetIndex);
        } finally {
            cleanupDrag();
            flushPendingRender();
        }
    };

    list.onpointercancel = () => {
        cleanupDrag();
        flushPendingRender();
    };
}

export function resetUnscheduledDragState() {
    cleanupDrag();
    pendingRender = null;
}
```

- [ ] **Step 4: Integrate deferred rendering and the callback**

Wrap only the list mutation in the deferral boundary so the active callbacks and sort-control state still update immediately:

```js
export function renderUnscheduledTasks(
    unscheduledTasks,
    eventCallbacks,
    setGlobalCallbacks,
    sortMode = 'priority'
) {
    setGlobalCallbacks(eventCallbacks);
    syncUnscheduledSortControl(sortMode);

    const unscheduledTaskList = getUnscheduledTaskListElement();
    if (!unscheduledTaskList) {
        logger.error('Unscheduled task list element not found.');
        return;
    }

    renderOrDeferUnscheduledList(() => {
        unscheduledTaskList.innerHTML = '';
        if (unscheduledTasks.length === 0) {
            unscheduledTaskList.innerHTML = EMPTY_STATE_MESSAGE;
            return;
        }
        unscheduledTasks.forEach((task, index) => {
            const taskCard = createUnscheduledTaskCard(
                task,
                sortMode,
                index,
                unscheduledTasks.length
            );
            unscheduledTaskList.appendChild(taskCard);
            if (task.isEditingInline) {
                toggleUnscheduledTaskInlineEdit(task.id, true, task);
            }
        });
    });
}
```

In `initializeUnscheduledTaskListEventListeners`, call:

```js
initializeUnscheduledDrag(unscheduledTaskList, {
    onDrop: (taskId, targetIndex) =>
        globalUnscheduledTaskCallbacks?.onReorderUnscheduledTask?.(taskId, targetIndex)
});
```

Call `resetUnscheduledDragState()` from `resetEventDelegation()`. Because rendering is deferred until `onDrop` settles, a remote refresh or task deletion during the gesture is applied only after the handler returns.

- [ ] **Step 5: Add and test explicit drag CSS states**

Add:

```css
.unscheduled-drag-handle {
    touch-action: none;
    cursor: grab;
}
.unscheduled-drag-handle:active {
    cursor: grabbing;
}
.unscheduled-task--dragging {
    opacity: 0.72;
    transform: translateY(-2px) scale(1.01);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
}
.unscheduled-drop-indicator {
    min-height: 0.25rem;
    border-radius: 9999px;
    background: rgb(165, 180, 252);
    box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.8);
}
```

Add this node-environment CSS assertion:

```js
test('defines unscheduled drag affordance and drop states', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'css', 'custom.css'),
        'utf8'
    );

    expect(css).toContain('.unscheduled-drag-handle');
    expect(css).toContain('touch-action: none');
    expect(css).toContain('.unscheduled-drag-handle:active');
    expect(css).toContain('.unscheduled-task--dragging');
    expect(css).toContain('.unscheduled-drop-indicator');
});
```

- [ ] **Step 6: Run drag, renderer, DOM, and CSS tests**

Run:

```bash
npm test -- --runInBand __tests__/unscheduled-drag.test.js __tests__/unscheduled-task-renderer.test.js __tests__/dom-interaction.test.js __tests__/custom-css.test.js
```

Expected: PASS for mouse, touch, cancel, deferred refresh, and edge scroll cases.

- [ ] **Step 7: Commit pointer/touch dragging**

```bash
git add public/js/tasks/unscheduled-drag.js public/js/tasks/unscheduled-renderer.js public/js/dom-renderer.js public/css/custom.css __tests__/unscheduled-drag.test.js __tests__/custom-css.test.js
git commit -m "feat: drag unscheduled tasks by handle"
```

---

### Task 7: Complete End-to-End Coverage and PWA Artifacts

**Files:**
- Create: `tests/e2e/test_unscheduled_order.py`
- Modify: `public/css/tailwind.css` (generated)
- Modify: `public/sw-precache.js` (generated)
- Modify: `public/sw.js` (generated version stamp)

**Interfaces:**
- Consumes: all prior UI selectors and callback behavior.
- Produces: browser-level proof that the remembered mode and room-synced `manualOrder` values survive real PouchDB reloads.

- [ ] **Step 1: Write the focused Playwright scenario**

Create the complete file:

```python
"""E2E coverage for remembered manual ordering of Unscheduled tasks."""

from playwright.sync_api import expect, sync_playwright

from tests.e2e.helpers import BASE_URL, launch_seeded_page


ROOM_CODE = "unscheduled-order-room"


def visible_order(page):
    return page.locator("#unscheduled-task-list .task-card").evaluate_all(
        "cards => cards.map(card => card.dataset.taskName)"
    )


def wait_for_order(page, expected):
    page.wait_for_function(
        """expected => JSON.stringify(
            Array.from(document.querySelectorAll('#unscheduled-task-list .task-card'))
                .map(card => card.dataset.taskName)
        ) === JSON.stringify(expected)""",
        expected,
    )


def open_actions_for(page, description):
    card = page.locator("#unscheduled-task-list .task-card").filter(
        has_text=description
    ).first
    card.locator(".btn-unscheduled-task-actions-menu").click()
    card.locator(".unscheduled-task-actions-menu").wait_for(state="visible")
    return card


def task_doc(task_id, description, priority, manual_order):
    return {
        "_id": task_id,
        "id": task_id,
        "docType": "task",
        "type": "unscheduled",
        "description": description,
        "status": "incomplete",
        "priority": priority,
        "estDuration": 30,
        "manualOrder": manual_order,
    }


def test_unscheduled_manual_order_flow():
    docs = [
        task_doc("unsched-high", "High priority", "high", 2),
        task_doc("unsched-first", "Manual first", "low", 0),
        task_doc("unsched-second", "Manual second", "medium", 1),
    ]

    with sync_playwright() as playwright:
        browser, context, page = launch_seeded_page(playwright, ROOM_CODE, docs)
        try:
            expect(page.locator('[data-unscheduled-sort-mode="priority"]')).to_have_attribute(
                "aria-pressed", "true"
            )
            assert visible_order(page)[0] == "High priority"

            page.locator('[data-unscheduled-sort-mode="manual"]').click()
            wait_for_order(page, ["Manual first", "Manual second", "High priority"])

            high = open_actions_for(page, "High priority")
            high.locator('[data-move-action="top"]').click()
            wait_for_order(page, ["High priority", "Manual first", "Manual second"])
            expect(page.locator("#unscheduled-order-status")).to_contain_text(
                "position 1 of 3"
            )

            high = page.locator("#unscheduled-task-list .task-card").filter(
                has_text="High priority"
            ).first
            high.locator(".task-checkbox-unscheduled").click()
            wait_for_order(page, ["High priority", "Manual first", "Manual second"])
            expect(high.locator(".line-through")).to_have_count(1)

            page.locator("#unscheduled").check()
            page.locator('input[name="description"]').fill("New incomplete")
            page.locator('input[name="priority"][value="low"]').check()
            page.locator('input[name="est-duration-hours"]').fill("0")
            page.locator('input[name="est-duration-minutes"]').fill("15")
            page.locator('#task-form button[type="submit"]').click()
            expected = ["High priority", "Manual first", "Manual second", "New incomplete"]
            wait_for_order(page, expected)

            page.reload(wait_until="load")
            expect(page.locator('[data-unscheduled-sort-mode="manual"]')).to_have_attribute(
                "aria-pressed", "true"
            )
            wait_for_order(page, expected)

            page.locator('[data-unscheduled-sort-mode="priority"]').click()
            expect(page.locator('[data-unscheduled-sort-mode="priority"]')).to_have_attribute(
                "aria-pressed", "true"
            )
            page.locator('[data-unscheduled-sort-mode="manual"]').click()
            wait_for_order(page, expected)

            first_card = page.locator("#unscheduled-task-list .task-card").nth(0)
            dragged_card = page.locator("#unscheduled-task-list .task-card").nth(1)
            handle_box = dragged_card.locator(".unscheduled-drag-handle").bounding_box()
            first_box = first_card.bounding_box()
            assert handle_box and first_box
            page.mouse.move(
                handle_box["x"] + handle_box["width"] / 2,
                handle_box["y"] + handle_box["height"] / 2,
            )
            page.mouse.down()
            page.mouse.move(first_box["x"] + 8, first_box["y"] + 2, steps=5)
            page.mouse.up()
            dragged_expected = [
                "Manual first",
                "High priority",
                "Manual second",
                "New incomplete",
            ]
            wait_for_order(page, dragged_expected)

            page.reload(wait_until="load")
            wait_for_order(page, dragged_expected)

            second_page = context.new_page()
            second_page.goto(BASE_URL, wait_until="load")
            wait_for_order(second_page, dragged_expected)
        finally:
            context.close()
            browser.close()
```

- [ ] **Step 2: Run the completed E2E scenario**

Run:

```bash
python -m pytest tests/e2e/test_unscheduled_order.py -q
```

Expected: PASS. Tasks 1-6 already established each new behavior through red-green unit and interaction tests; this scenario is their browser-level acceptance check. If it fails, add a lower-level regression test beside the owning module and observe that test fail before changing implementation.

- [ ] **Step 3: Fix only integration gaps exposed by E2E**

Allowed fixes are limited to callback wiring, selector stability, focus/status timing, and insertion-boundary bugs in files already owned by Tasks 1-6. Add a Jest regression test beside the owning module before each fix, run it red, implement the smallest change, then rerun it green.

- [ ] **Step 4: Regenerate committed CSS and PWA artifacts**

Run:

```bash
npm run build:css
npm run build:sw-precache
```

Expected: `public/css/tailwind.css`, `public/sw-precache.js`, and the version stamp in `public/sw.js` update. Confirm `/js/tasks/unscheduled-drag.js` and `/js/tasks/unscheduled-sort-mode.js` are present in the generated precache list.

- [ ] **Step 5: Run focused feature verification**

Run:

```bash
npm test -- --runInBand __tests__/storage.test.js __tests__/task-management.test.js __tests__/unscheduled-sort-mode.test.js __tests__/unscheduled-task-renderer.test.js __tests__/unscheduled-task-handlers.test.js __tests__/unscheduled-drag.test.js __tests__/dom-interaction.test.js __tests__/app.test.js __tests__/custom-css.test.js __tests__/service-worker.test.js
python -m pytest tests/e2e/test_unscheduled_order.py -q
```

Expected: all listed Jest suites and the focused E2E test pass.

- [ ] **Step 6: Run repository-wide verification**

Run:

```bash
npm run check
npm test -- --coverage
npm run test:e2e
npm run check:pouchdb
npm run check:fontawesome
node scripts/generate-sw-precache.mjs --check
git diff --check
```

Expected: zero lint/format errors, all Jest tests pass with at least 80% statements/lines/functions and 75% branches, all Python E2E tests pass, vendored assets and precache are current, and Git reports no whitespace errors.

- [ ] **Step 7: Commit integration coverage and generated artifacts**

```bash
git add tests/e2e/test_unscheduled_order.py public/css/tailwind.css public/sw-precache.js public/sw.js
git status --short
git commit -m "test: verify unscheduled manual ordering"
```

Before committing, inspect `git status --short` and unstage anything outside the files changed by this feature. Do not use `git add .`.

---

## Final Acceptance Checklist

- [ ] Priority remains the default for users without a stored preference.
- [ ] Selecting My order is remembered locally and does not sync as room data.
- [ ] Switching to Priority never overwrites `manualOrder`.
- [ ] Existing unranked tasks enter My order in their current Priority sequence.
- [ ] Mixed, invalid, and duplicate ranks render deterministically.
- [ ] Completed tasks stay in place and remain movable in My order.
- [ ] New and newly unscheduled tasks enter after the last incomplete task.
- [ ] Mouse and touch drag only from the handle and do not block normal card scrolling/actions.
- [ ] Menu moves cover every drag operation, preserve focus, and announce positions.
- [ ] Editing and running-timer tasks cannot be dragged.
- [ ] Remote rerenders are deferred until the active drag settles.
- [ ] Persistence failures restore the prior in-memory order and show the error toast.
- [ ] Manual order survives reload, same-room use, and PouchDB replication.
- [ ] No success toast appears for reorder operations.
- [ ] Offline precache includes both new JavaScript modules.
