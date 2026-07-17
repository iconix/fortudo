# Unscheduled Manual Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox ('- [ ]') syntax for tracking.

**Goal:** Add a remembered My order view for the global Unscheduled list, with room-synced manual sequencing, accessible menu moves, and pointer/touch drag handles while preserving Priority.

**Architecture:** Deepen two modules. The Unscheduled sequence module owns projection, lifecycle placement, explicit movement, optimistic sequence state, non-destructive batch persistence, compensation, rollback, and durable recovery behind a three-operation interface. The Unscheduled list UI module owns mode preference, rendering, all Unscheduled event delegation, accessibility feedback, pointer state, and deferred rerenders behind mount/render/destroy; task manager remains the canonical task-state owner and existing handlers remain the named-actions adapter.

**Tech Stack:** Vanilla JavaScript ES modules, PouchDB 9, Jest 30 with jsdom, Tailwind CSS 3 plus 'public/css/custom.css', Python/Playwright E2E, Firebase-hosted PWA precache generation.

## Architecture Correction — 2026-07-15

The implementation below records the original per-task-rank plan and is retained as execution
history. A two-client Cloudant probe showed that rewriting task documents during reorder can lose a
concurrent task edit. The following correction supersedes every step that writes, compensates, or
normalizes `manualOrder` on task documents:

- Store `orderedTaskIds` in the single room-level config document
  `config-unscheduled-sequence`; do not dual-write task ranks.
- Keep `manualOrder` read-only as an absent-document migration fallback. The first sequence
  mutation materializes legacy projection without rewriting legacy task documents.
- Make `unscheduled-sequence.js` own projection, placement, optimistic replacement, one-document
  persistence settlement, reload, and rollback through `project`, `place`, `placeMany`, `move`, and
  `hydrate`.
- Add `unscheduled-sequence-repository.js` as the narrow config persistence seam. Storage exposes
  conflict-aware config reads and a retrying resolver that advances the latest CouchDB winner and
  tombstones all losing leaves.
- Hydrate the sequence alongside tasks on room load and post-sync refresh, after any accepted local
  sequence transaction settles.
- Replace obsolete per-task rank transaction tests with sequence-document, task-edit isolation,
  lifecycle placement, conflict cleanup, and two-isolated-client Cloudant acceptance coverage.
- Treat concurrent reorder resolution as deterministic winner selection for order only. Task data
  is never part of that conflict surface.

This correction preserves all approved list UI and interaction work in the remainder of the plan.

## Global Constraints

- Preserve Priority as the initial mode for browsers without a valid saved preference.
- Internal mode values are exactly 'priority' and 'manual'; user-facing copy is exactly 'Priority' and 'My order'.
- Manual order is one room-synced global Unscheduled sequence, not a day-specific plan.
- Completed tasks stay visibly checked in place in My order and remain movable.
- New and newly unscheduled tasks are placed after the last incomplete task.
- Dragging starts only from a six-dot handle; the task card remains scrollable and interactive.
- Every drag operation is also available through Move up, Move down, Move to top, and Move to bottom.
- Explicit moves update memory immediately, then settle persistence in the background.
- A failed write restores the snapshot and compensates successful rows from a partial batch.
- If compensation also fails, reload local PouchDB state and render that durable state.
- If durable reload also fails, retain the restored in-memory snapshot and resolve a stronger
  recovery failure instead of rejecting the settlement promise.
- Lifecycle placement uses the existing add/unschedule persistence contract; it does not make all task mutations awaitable.
- Do not add a global store, event bus, generic repository interface, or third-party drag dependency.
- Only the sequence interface and list UI interface are test surfaces; private comparators, rank helpers, mode storage, renderer helpers, and drag geometry are not exported for tests.
- Follow strict TDD: observe each replacement or new interface test fail before adding its implementation.
- Run all commands from 'C:\Users\narho\Documents\GitHub\fortudo\.worktrees\unscheduled-manual-order'.

---

## File and Responsibility Map

| File                                                         | Responsibility                                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 'public/js/storage.js'                                       | PouchDB-specific non-destructive batch adapter and structured partial-failure error.                        |
| 'public/js/tasks/unscheduled-sequence.js'                    | Deep Unscheduled sequence implementation: project, place, move, persist, compensate, rollback, recover.     |
| 'public/js/tasks/manager.js'                                 | Canonical task state, private sequence composition, narrow public read/move wrappers, lifecycle delegation. |
| 'public/js/tasks/unscheduled-list.js'                        | Deep public list UI seam: mount, render, destroy, mode, delegation, feedback, render deferral.              |
| 'public/js/tasks/unscheduled-renderer.js'                    | Private markup implementation used only by the list UI module.                                              |
| 'public/js/tasks/unscheduled-list-drag.js'                   | Private pointer/geometry implementation used only by the list UI module.                                    |
| 'public/js/tasks/unscheduled-handlers.js'                    | Named business-actions adapter; no DOM delegation ownership.                                                |
| 'public/js/dom-renderer.js'                                  | Broader page rendering; calls the list render seam and removes Unscheduled event branches/globals.          |
| 'public/js/app.js'                                           | Wires and mounts the list once; app does not read mode or drag state.                                       |
| 'public/js/modal-manager.js'                                 | Consumes the named confirm-schedule action without the old callback shape.                                  |
| 'public/index.html'                                          | Static mode control and polite live region.                                                                 |
| 'public/css/custom.css'                                      | Handle, lifted-card, insertion-marker, and reduced-motion states.                                           |
| 'public/css/tailwind.css'                                    | Regenerated committed Tailwind output.                                                                      |
| 'public/sw-precache.js', 'public/sw.js'                      | Regenerated PWA precache list and version.                                                                  |
| '**tests**/storage.test.js'                                  | Real in-memory PouchDB adapter contract.                                                                    |
| '**tests**/unscheduled-sequence.test.js'                     | Sequence behavior through project/place/move only.                                                          |
| '**tests**/task-management.test.js'                          | Manager composition and lifecycle integration only.                                                         |
| '**tests**/unscheduled-list.test.js'                         | List behavior through mount/render/destroy and real DOM events.                                             |
| '**tests**/unscheduled-task-handlers.test.js'                | Business-action behavior; callback-shape assertion removed.                                                 |
| '**tests**/app.test.js', '**tests**/dom-interaction.test.js' | Thin wiring tests after Unscheduled routing migrates.                                                       |
| 'tests/e2e/test_unscheduled_order.py'                        | Mode, menu, completion, placement, reload, sync, and pointer behavior.                                      |

---

### Task 1: Add the Structured PouchDB Batch Adapter

**Files:**

- Modify: 'public/js/storage.js:95-147,249-257'
- Modify: '**tests**/storage.test.js:20-35,87-145'

**Interfaces:**

- Produces: 'TaskBatchWriteError' with 'succeededIds' and 'failures'.
- Produces: 'putTasks(tasks): Promise<{succeededIds: string[]}>'. It never deletes omitted documents, updates revision tracking for successful rows, triggers sync once when at least one row succeeds, and reports every failed row.

- [ ] **Step 1: Add failing adapter tests**

Import 'putTasks' and 'TaskBatchWriteError', then add:

```js
describe('putTasks', () => {
  test('upserts only supplied tasks and returns successful IDs', async () => {
    await initStorage(uniqueRoomCode(), { adapter: 'memory' });
    await putTask({
      id: 'scheduled-kept',
      type: 'scheduled',
      description: 'Keep',
      status: 'incomplete'
    });

    const result = await putTasks([
      {
        id: 'unscheduled-a',
        type: 'unscheduled',
        description: 'A',
        status: 'incomplete',
        priority: 'medium',
        manualOrder: 1
      },
      {
        id: 'unscheduled-b',
        type: 'unscheduled',
        description: 'B',
        status: 'incomplete',
        priority: 'low',
        manualOrder: 0
      }
    ]);

    expect(result).toEqual({
      succeededIds: ['unscheduled-a', 'unscheduled-b']
    });
    expect(await loadTasks()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'scheduled-kept' }),
        expect.objectContaining({ id: 'unscheduled-a', manualOrder: 1 }),
        expect.objectContaining({ id: 'unscheduled-b', manualOrder: 0 })
      ])
    );
  });

  test('throws structured row results after a partial batch failure', async () => {
    await initStorage(uniqueRoomCode(), { adapter: 'memory' });
    const database = getDb();
    const bulkDocs = jest.spyOn(database, 'bulkDocs').mockResolvedValueOnce([
      { ok: true, id: 'unscheduled-a', rev: '1-a' },
      { id: 'unscheduled-b', error: 'conflict', name: 'conflict', status: 409 }
    ]);

    await expect(
      putTasks([
        { id: 'unscheduled-a', type: 'unscheduled', status: 'incomplete' },
        { id: 'unscheduled-b', type: 'unscheduled', status: 'incomplete' }
      ])
    ).rejects.toMatchObject({
      name: 'TaskBatchWriteError',
      succeededIds: ['unscheduled-a'],
      failures: [
        expect.objectContaining({ id: 'unscheduled-b', error: 'conflict' })
      ]
    });
    bulkDocs.mockRestore();
  });
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run:

```powershell
npm.cmd test -- --runInBand __tests__/storage.test.js
```

Expected: FAIL because 'putTasks' and 'TaskBatchWriteError' are not exported.

- [ ] **Step 3: Implement the adapter**

Add beside 'putTask':

```js
export class TaskBatchWriteError extends Error {
  constructor(results) {
    const succeededIds = results
      .filter((result) => result.ok)
      .map((result) => result.id);
    const failures = results.filter((result) => !result.ok);
    super('One or more task documents could not be written.');
    this.name = 'TaskBatchWriteError';
    this.succeededIds = succeededIds;
    this.failures = failures;
  }
}

export async function putTasks(tasksToPut) {
  ensureStorageInitialized();
  if (tasksToPut.length === 0) return { succeededIds: [] };

  const docs = await Promise.all(
    tasksToPut.map(async (task) => {
      const doc = toStoredDoc(task, DOC_TYPES.TASK);
      const revision = await getTrackedRevision(task.id, DOC_TYPES.TASK);
      if (revision) doc._rev = revision;
      return doc;
    })
  );
  const results = await db.bulkDocs(docs);
  const succeededIds = [];
  for (const result of results) {
    if (result.ok) {
      taskRevMap.set(result.id, result.rev);
      succeededIds.push(result.id);
    }
  }
  if (succeededIds.length > 0) debouncedSync();
  if (results.some((result) => !result.ok))
    throw new TaskBatchWriteError(results);
  return { succeededIds };
}
```

- [ ] **Step 4: Run storage tests**

```powershell
npm.cmd test -- --runInBand __tests__/storage.test.js __tests__/storage-scoping.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add public/js/storage.js __tests__/storage.test.js
git commit -m "feat: add structured task batch writes"
```

---

### Task 2: Create the Deep Sequence Projection and Placement Interface

**Files:**

- Create: 'public/js/tasks/unscheduled-sequence.js'
- Create: '**tests**/unscheduled-sequence.test.js'

**Interfaces:**

- Consumes adapters: 'readTasks()', 'replaceTasks(nextTasks)', 'persistTasks(changedTasks)', and 'reloadTasks()'.
- Produces: 'createUnscheduledSequence(adapters)' returning 'project(mode)', 'place(taskId)', and, in Task 3, 'move(taskId, destination)'.
- 'project(mode)' returns '{tasks, movementByTaskId}' and never writes.
- 'place(taskId)' updates manager-owned memory and returns '{success, task, changedTasks}' without calling 'persistTasks'.

- [ ] **Step 1: Write failing projection and placement tests**

```js
import { createUnscheduledSequence } from '../public/js/tasks/unscheduled-sequence.js';

function task(id, overrides = {}) {
  return {
    id,
    type: 'unscheduled',
    description: id,
    status: 'incomplete',
    priority: 'medium',
    estDuration: 30,
    ...overrides
  };
}

function createHarness(initialTasks) {
  let tasks = initialTasks.map((item) => ({ ...item }));
  const persistTasks = jest.fn(() => Promise.resolve({ succeededIds: [] }));
  const reloadTasks = jest.fn(() => Promise.resolve(tasks));
  const sequence = createUnscheduledSequence({
    readTasks: () => tasks,
    replaceTasks: (nextTasks) => {
      tasks = nextTasks;
    },
    persistTasks,
    reloadTasks
  });
  return { sequence, getTasks: () => tasks, persistTasks, reloadTasks };
}

test('Priority preserves automatic ordering and never writes', () => {
  const harness = createHarness([
    task('low', { priority: 'low', estDuration: 10 }),
    task('done', { priority: 'high', status: 'completed' }),
    task('high-long', { priority: 'high', estDuration: 60 }),
    task('high-short', { priority: 'high', estDuration: 15 })
  ]);
  expect(
    harness.sequence.project('priority').tasks.map((item) => item.id)
  ).toEqual(['high-short', 'high-long', 'low', 'done']);
  expect(harness.persistTasks).not.toHaveBeenCalled();
});

test('My order combines ranked and legacy tasks without writing', () => {
  const harness = createHarness([
    task('ranked-done', { status: 'completed', manualOrder: 4 }),
    task('legacy-low', { priority: 'low' }),
    task('ranked-open', { manualOrder: 1 }),
    task('legacy-high', { priority: 'high' }),
    task('legacy-done', { status: 'completed', priority: 'high' })
  ]);
  expect(
    harness.sequence.project('manual').tasks.map((item) => item.id)
  ).toEqual([
    'ranked-open',
    'legacy-high',
    'legacy-low',
    'ranked-done',
    'legacy-done'
  ]);
  expect(harness.persistTasks).not.toHaveBeenCalled();
});

test('invalid and duplicate ranks use task ID as final tie-breaker', () => {
  const harness = createHarness([
    task('b', { manualOrder: 2 }),
    task('a', { manualOrder: 2 }),
    task('invalid', { manualOrder: -1 })
  ]);
  expect(
    harness.sequence.project('manual').tasks.map((item) => item.id)
  ).toEqual(['a', 'b', 'invalid']);
});

test('place inserts a new task after the last incomplete task', () => {
  const harness = createHarness([
    task('first', { manualOrder: 0 }),
    task('done', { status: 'completed', manualOrder: 1 }),
    task('new')
  ]);
  const result = harness.sequence.place('new');
  expect(result.success).toBe(true);
  expect(
    harness.sequence.project('manual').tasks.map((item) => item.id)
  ).toEqual(['first', 'new', 'done']);
  expect(result.changedTasks.map((item) => item.id)).toEqual(
    expect.arrayContaining(['new', 'done'])
  );
  expect(result.task).toEqual(
    expect.objectContaining({ id: 'new', manualOrder: 1 })
  );
  expect(harness.persistTasks).not.toHaveBeenCalled();
});

test('place inserts before completed tasks when no incomplete task exists', () => {
  const harness = createHarness([
    task('done-a', { status: 'completed', manualOrder: 0 }),
    task('done-b', { status: 'completed', manualOrder: 1 }),
    task('new')
  ]);
  const result = harness.sequence.place('new');
  expect(result.task.manualOrder).toBe(0);
  expect(
    harness.sequence.project('manual').tasks.map((item) => item.id)
  ).toEqual(['new', 'done-a', 'done-b']);
});

test('ranked completed tasks retain their manual position', () => {
  const harness = createHarness([
    task('a', { manualOrder: 0 }),
    task('done', { status: 'completed', manualOrder: 1 }),
    task('b', { manualOrder: 2 })
  ]);
  expect(
    harness.sequence.project('manual').tasks.map((item) => item.id)
  ).toEqual(['a', 'done', 'b']);
});
```

- [ ] **Step 2: Run and verify red**

```powershell
npm.cmd test -- --runInBand __tests__/unscheduled-sequence.test.js
```

Expected: FAIL because the sequence module does not exist.

- [ ] **Step 3: Implement projection and placement**

Create 'public/js/tasks/unscheduled-sequence.js':

```js
const PRIORITY_RANK = Object.freeze({ high: 0, medium: 1, low: 2 });
const VALID_MODES = new Set(['priority', 'manual']);

function compareIds(left, right) {
  return String(left.id).localeCompare(String(right.id));
}

function hasValidManualOrder(task) {
  return Number.isFinite(task.manualOrder) && task.manualOrder >= 0;
}

function comparePriority(left, right) {
  const completion =
    Number(left.status === 'completed') - Number(right.status === 'completed');
  if (completion !== 0) return completion;
  const priority =
    (PRIORITY_RANK[left.priority] ?? PRIORITY_RANK.medium) -
    (PRIORITY_RANK[right.priority] ?? PRIORITY_RANK.medium);
  if (priority !== 0) return priority;
  const leftHasDuration = Number.isFinite(left.estDuration);
  const rightHasDuration = Number.isFinite(right.estDuration);
  if (
    leftHasDuration &&
    rightHasDuration &&
    left.estDuration !== right.estDuration
  ) {
    return left.estDuration - right.estDuration;
  }
  if (leftHasDuration !== rightHasDuration) return leftHasDuration ? -1 : 1;
  return 0;
}

function projectPriority(tasks) {
  return tasks
    .filter((task) => task.type === 'unscheduled')
    .sort(comparePriority);
}

function projectManual(tasks) {
  const unscheduled = tasks.filter((task) => task.type === 'unscheduled');
  const ranked = unscheduled.filter(hasValidManualOrder).sort((left, right) => {
    const rank = left.manualOrder - right.manualOrder;
    return rank || compareIds(left, right);
  });
  if (ranked.length === 0) return [...unscheduled].sort(comparePriority);
  const legacyIncomplete = unscheduled
    .filter((task) => !hasValidManualOrder(task) && task.status !== 'completed')
    .sort(
      (left, right) => comparePriority(left, right) || compareIds(left, right)
    );
  const legacyCompleted = unscheduled
    .filter((task) => !hasValidManualOrder(task) && task.status === 'completed')
    .sort(
      (left, right) => comparePriority(left, right) || compareIds(left, right)
    );
  const lastIncomplete = ranked.reduce(
    (last, task, index) => (task.status === 'completed' ? last : index),
    -1
  );
  return [
    ...ranked.slice(0, lastIncomplete + 1),
    ...legacyIncomplete,
    ...ranked.slice(lastIncomplete + 1),
    ...legacyCompleted
  ];
}

function movementFor(tasks, mode) {
  return new Map(
    tasks.map((task, index) => [
      task.id,
      {
        position: index + 1,
        total: tasks.length,
        canMoveUp: mode === 'manual' && index > 0,
        canMoveDown: mode === 'manual' && index < tasks.length - 1
      }
    ])
  );
}

function replaceOrderFields(allTasks, ordered) {
  const orderById = new Map(ordered.map((task, index) => [task.id, index]));
  const changedTasks = [];
  const nextTasks = allTasks.map((task) => {
    if (!orderById.has(task.id) || task.manualOrder === orderById.get(task.id))
      return task;
    const changed = { ...task, manualOrder: orderById.get(task.id) };
    changedTasks.push(changed);
    return changed;
  });
  return { nextTasks, changedTasks };
}

export function createUnscheduledSequence({
  readTasks,
  replaceTasks,
  persistTasks,
  reloadTasks
}) {
  function project(mode = 'priority') {
    const validMode = VALID_MODES.has(mode) ? mode : 'priority';
    const ordered =
      validMode === 'manual'
        ? projectManual(readTasks())
        : projectPriority(readTasks());
    return {
      tasks: ordered,
      movementByTaskId: movementFor(ordered, validMode)
    };
  }

  function place(taskId) {
    const task = readTasks().find((item) => item.id === taskId);
    if (!task || task.type !== 'unscheduled') {
      return { success: false, code: 'not-unscheduled', changedTasks: [] };
    }
    const ordered = projectManual(readTasks()).filter(
      (item) => item.id !== taskId
    );
    const insertionIndex = ordered.reduce(
      (last, item, index) => (item.status === 'completed' ? last : index + 1),
      0
    );
    ordered.splice(insertionIndex, 0, task);
    const replacement = replaceOrderFields(readTasks(), ordered);
    replaceTasks(replacement.nextTasks);
    return {
      success: true,
      task: replacement.nextTasks.find((item) => item.id === taskId),
      changedTasks: replacement.changedTasks
    };
  }

  return {
    project,
    place,
    move() {
      throw new Error('Sequence movement is added in Task 3.');
    }
  };
}
```

- [ ] **Step 4: Run and verify green**

```powershell
npm.cmd test -- --runInBand __tests__/unscheduled-sequence.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add public/js/tasks/unscheduled-sequence.js __tests__/unscheduled-sequence.test.js
git commit -m "feat: add unscheduled sequence projection"
```

---

### Task 3: Add Transactional Sequence Movement and Recovery

**Files:**

- Modify: 'public/js/tasks/unscheduled-sequence.js'
- Modify: '**tests**/unscheduled-sequence.test.js'

**Interfaces:**

- 'move(taskId, destination)' returns a synchronous operation result.
- Accepted changes return '{success: true, changed: true, position, total, settled}'.
- 'settled' resolves to success, rolled-back failure, or durable-reload failure; it does not reject.
- Destinations are '{kind: up|down|top|bottom|before, taskId?: string|null}'.

- [ ] **Step 1: Add failing movement and recovery tests**

```js
test('move exposes optimistic position before settlement', async () => {
  const harness = createHarness([task('a'), task('b'), task('c')]);
  harness.persistTasks.mockResolvedValueOnce({ succeededIds: ['a', 'b', 'c'] });
  const operation = harness.sequence.move('c', { kind: 'top' });
  expect(operation).toMatchObject({
    success: true,
    changed: true,
    taskId: 'c',
    position: 1,
    total: 3
  });
  expect(
    harness.sequence.project('manual').tasks.map((item) => item.id)
  ).toEqual(['c', 'a', 'b']);
  await expect(operation.settled).resolves.toEqual({ success: true });
});

test('move before a task uses identity rather than a stale index', async () => {
  const harness = createHarness([
    task('a', { manualOrder: 0 }),
    task('b', { manualOrder: 1 }),
    task('c', { manualOrder: 2 })
  ]);
  const operation = harness.sequence.move('c', { kind: 'before', taskId: 'b' });
  expect(
    harness.sequence.project('manual').tasks.map((item) => item.id)
  ).toEqual(['a', 'c', 'b']);
  await operation.settled;
});

test('a boundary move is a no-op without persistence', () => {
  const harness = createHarness([
    task('a', { manualOrder: 0 }),
    task('b', { manualOrder: 1 })
  ]);
  expect(harness.sequence.move('a', { kind: 'top' })).toMatchObject({
    success: true,
    changed: false,
    position: 1,
    total: 2
  });
  expect(harness.persistTasks).not.toHaveBeenCalled();
});

test('missing, scheduled, and inline-editing tasks return structured failures', () => {
  const harness = createHarness([
    task('scheduled', { type: 'scheduled' }),
    task('editing', { isEditingInline: true })
  ]);
  expect(harness.sequence.move('missing', { kind: 'top' })).toMatchObject({
    success: false,
    code: 'not-found'
  });
  expect(harness.sequence.move('scheduled', { kind: 'top' })).toMatchObject({
    success: false,
    code: 'not-unscheduled'
  });
  expect(harness.sequence.move('editing', { kind: 'top' })).toMatchObject({
    success: false,
    code: 'unavailable'
  });
});

test('a full persistence failure restores memory without compensation', async () => {
  const harness = createHarness([
    task('a', { manualOrder: 0 }),
    task('b', { manualOrder: 1 })
  ]);
  harness.persistTasks.mockRejectedValueOnce(new Error('offline'));
  const operation = harness.sequence.move('b', { kind: 'top' });
  await expect(operation.settled).resolves.toMatchObject({
    success: false,
    code: 'persist-failed',
    rolledBack: true,
    reloaded: false
  });
  expect(
    harness.sequence.project('manual').tasks.map((item) => item.id)
  ).toEqual(['a', 'b']);
  expect(harness.persistTasks).toHaveBeenCalledTimes(1);
});

test('partial failure restores memory and compensates successful documents', async () => {
  const harness = createHarness([
    task('a', { manualOrder: 0 }),
    task('b', { manualOrder: 1 })
  ]);
  harness.persistTasks
    .mockRejectedValueOnce(
      Object.assign(new Error('partial'), { succeededIds: ['a'] })
    )
    .mockResolvedValueOnce({ succeededIds: ['a'] });
  const operation = harness.sequence.move('b', { kind: 'top' });
  harness.getTasks().find((item) => item.id === 'a').status = 'completed';
  await expect(operation.settled).resolves.toMatchObject({
    success: false,
    code: 'persist-failed',
    rolledBack: true,
    reloaded: false
  });
  expect(
    harness.sequence.project('manual').tasks.map((item) => item.id)
  ).toEqual(['a', 'b']);
  expect(harness.getTasks().find((item) => item.id === 'a').status).toBe(
    'completed'
  );
  expect(harness.persistTasks).toHaveBeenCalledTimes(2);
});

test('failed compensation reloads durable local state', async () => {
  const harness = createHarness([
    task('a', { manualOrder: 0 }),
    task('b', { manualOrder: 1 })
  ]);
  harness.persistTasks
    .mockRejectedValueOnce(
      Object.assign(new Error('partial'), { succeededIds: ['a'] })
    )
    .mockRejectedValueOnce(new Error('compensation failed'));
  harness.reloadTasks.mockResolvedValueOnce([
    task('a', { manualOrder: 1 }),
    task('b', { manualOrder: 0 })
  ]);
  const operation = harness.sequence.move('b', { kind: 'top' });
  await expect(operation.settled).resolves.toMatchObject({
    success: false,
    rolledBack: false,
    reloaded: true
  });
  expect(
    harness.sequence.project('manual').tasks.map((item) => item.id)
  ).toEqual(['b', 'a']);
});

test('failed compensation and reload resolve as recovery failure', async () => {
  const harness = createHarness([
    task('a', { manualOrder: 0 }),
    task('b', { manualOrder: 1 })
  ]);
  harness.persistTasks
    .mockRejectedValueOnce(
      Object.assign(new Error('partial'), { succeededIds: ['a'] })
    )
    .mockRejectedValueOnce(new Error('compensation failed'));
  harness.reloadTasks.mockRejectedValueOnce(new Error('reload failed'));
  const operation = harness.sequence.move('b', { kind: 'top' });
  await expect(operation.settled).resolves.toMatchObject({
    success: false,
    rolledBack: true,
    reloaded: false,
    recoveryFailed: true,
    reason: 'reload failed'
  });
});
```

- [ ] **Step 2: Run and verify red**

```powershell
npm.cmd test -- --runInBand __tests__/unscheduled-sequence.test.js
```

Expected: FAIL because 'move' still throws.

- [ ] **Step 3: Implement destination resolution and settlement**

Add:

```js
function resolveDestination(ordered, sourceIndex, destination) {
  switch (destination?.kind) {
    case 'up':
      return Math.max(0, sourceIndex - 1);
    case 'down':
      return Math.min(ordered.length - 1, sourceIndex + 1);
    case 'top':
      return 0;
    case 'bottom':
      return ordered.length - 1;
    case 'before': {
      if (destination.taskId === null) return ordered.length - 1;
      const targetIndex = ordered.findIndex(
        (task) => task.id === destination.taskId
      );
      if (targetIndex < 0) return null;
      return targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
    }
    default:
      return null;
  }
}

function snapshotManualOrder(tasks) {
  return new Map(
    tasks.map((task) => [
      task.id,
      {
        hadValue: Object.prototype.hasOwnProperty.call(task, 'manualOrder'),
        value: task.manualOrder
      }
    ])
  );
}

function restoreManualOrder(tasks, snapshot, changedIds) {
  return tasks.map((task) => {
    if (!changedIds.has(task.id) || !snapshot.has(task.id)) return task;
    const restored = { ...task };
    const prior = snapshot.get(task.id);
    if (prior.hadValue) restored.manualOrder = prior.value;
    else delete restored.manualOrder;
    return restored;
  });
}
```

Replace the temporary 'move' with:

```js
function move(taskId, destination) {
  const currentTasks = readTasks();
  const source = currentTasks.find((task) => task.id === taskId);
  if (!source) return { success: false, code: 'not-found' };
  if (source.type !== 'unscheduled')
    return { success: false, code: 'not-unscheduled' };
  if (source.isEditingInline) return { success: false, code: 'unavailable' };

  const ordered = projectManual(currentTasks);
  const sourceIndex = ordered.findIndex((task) => task.id === taskId);
  const destinationIndex = resolveDestination(
    ordered,
    sourceIndex,
    destination
  );
  if (destinationIndex === null)
    return { success: false, code: 'invalid-destination' };
  if (sourceIndex === destinationIndex) {
    return {
      success: true,
      changed: false,
      taskId,
      position: sourceIndex + 1,
      total: ordered.length,
      settled: Promise.resolve({ success: true })
    };
  }

  const before = snapshotManualOrder(currentTasks);
  const moved = [...ordered];
  const [moving] = moved.splice(sourceIndex, 1);
  moved.splice(destinationIndex, 0, moving);
  const replacement = replaceOrderFields(currentTasks, moved);
  replaceTasks(replacement.nextTasks);
  const changedIds = new Set(replacement.changedTasks.map((task) => task.id));

  const settled = (async () => {
    try {
      await persistTasks(replacement.changedTasks);
      return { success: true };
    } catch (error) {
      const restoredTasks = restoreManualOrder(readTasks(), before, changedIds);
      replaceTasks(restoredTasks);
      const restoredById = new Map(
        restoredTasks.map((task) => [task.id, task])
      );
      const succeededIds = Array.isArray(error.succeededIds)
        ? error.succeededIds
        : [];
      if (succeededIds.length > 0) {
        try {
          await persistTasks(
            succeededIds.map((id) => restoredById.get(id)).filter(Boolean)
          );
        } catch (compensationError) {
          try {
            replaceTasks(await reloadTasks());
            return {
              success: false,
              code: 'persist-failed',
              reason: compensationError.message,
              rolledBack: false,
              reloaded: true,
              recoveryFailed: false
            };
          } catch (reloadError) {
            return {
              success: false,
              code: 'persist-failed',
              reason: reloadError.message,
              rolledBack: true,
              reloaded: false,
              recoveryFailed: true
            };
          }
        }
      }
      return {
        success: false,
        code: 'persist-failed',
        reason: error.message,
        rolledBack: true,
        reloaded: false
      };
    }
  })();

  return {
    success: true,
    changed: true,
    taskId,
    position: destinationIndex + 1,
    total: moved.length,
    settled
  };
}
```

Return 'move' from the factory.

- [ ] **Step 4: Run and verify green**

```powershell
npm.cmd test -- --runInBand __tests__/unscheduled-sequence.test.js __tests__/storage.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add public/js/tasks/unscheduled-sequence.js __tests__/unscheduled-sequence.test.js
git commit -m "feat: transact unscheduled sequence moves"
```

---

### Task 4: Compose the Sequence Inside Task Manager

**Files:**

- Modify: 'public/js/tasks/manager.js:12,135-198,279-318,691-701,1494-1528'
- Modify: '**tests**/task-management.test.js:45-65,2150-2370'

**Interfaces:**

- Produces manager wrapper 'getUnscheduledView(mode = priority)'.
- Preserves 'getSortedUnscheduledTasks()' as a Priority compatibility selector.
- Produces manager wrapper 'moveUnscheduledTask(taskId, destination)'.
- Keeps 'place' private and calls it from add and unschedule paths.

- [ ] **Step 1: Add failing manager composition tests**

Mock 'putTasks' and 'loadTasks', then add:

```js
test('getUnscheduledView delegates both display modes without persisting', () => {
  updateTaskState(
    [
      createUnscheduledTask('low', 30),
      { ...createUnscheduledTask('high', 30), manualOrder: 0 }
    ],
    { persist: false }
  );
  expect(getUnscheduledView('priority').tasks[0].priority).toBe('high');
  expect(getUnscheduledView('manual').tasks[0].manualOrder).toBe(0);
  expect(mockPutTasks).not.toHaveBeenCalled();
});

test('moveUnscheduledTask persists stripped changed documents', async () => {
  updateTaskState(
    [
      { ...createUnscheduledTask('high', 30), id: 'a', manualOrder: 0 },
      { ...createUnscheduledTask('low', 30), id: 'b', manualOrder: 1 }
    ],
    { persist: false }
  );
  mockPutTasks.mockResolvedValueOnce({ succeededIds: ['a', 'b'] });
  const operation = moveUnscheduledTask('b', { kind: 'top' });
  expect(getUnscheduledView('manual').tasks.map((task) => task.id)).toEqual([
    'b',
    'a'
  ]);
  await expect(operation.settled).resolves.toEqual({ success: true });
  expect(mockPutTasks).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ id: 'b', manualOrder: 0 }),
      expect.objectContaining({ id: 'a', manualOrder: 1 })
    ])
  );
});

test('adding and unscheduling use placement without changing result contracts', () => {
  const addResult = addTask({
    taskType: 'unscheduled',
    description: 'Added',
    priority: 'medium',
    estDuration: 20
  });
  expect(addResult.success).toBe(true);
  expect(addResult.task.manualOrder).toBe(0);

  const scheduled = createTaskWithDateTime({
    description: 'Convert',
    startTime: '10:00',
    duration: 30
  });
  updateTaskState([...getTaskState(), scheduled], { persist: false });
  const unscheduleResult = unscheduleTask(scheduled.id);
  expect(unscheduleResult.success).toBe(true);
  expect(unscheduleResult.task.type).toBe('unscheduled');
  expect(unscheduleResult.task.manualOrder).toEqual(expect.any(Number));
});

test('completion and reopening preserve manualOrder', () => {
  const task = {
    ...createUnscheduledTask('Keep rank', 30),
    id: 'ranked',
    manualOrder: 4
  };
  updateTaskState([task], { persist: false });
  expect(toggleUnscheduledTaskCompleteState('ranked').task.manualOrder).toBe(4);
  expect(toggleUnscheduledTaskCompleteState('ranked').task.manualOrder).toBe(4);
});
```

- [ ] **Step 2: Run and verify red**

```powershell
npm.cmd test -- --runInBand __tests__/task-management.test.js
```

Expected: FAIL because the manager wrappers do not exist.

- [ ] **Step 3: Compose the private sequence and add wrappers**

Import 'putTasks', 'loadTasks', and 'createUnscheduledSequence'. Add after 'stripUIFlags':

```js
let unscheduledSequence = null;

function replaceTaskCollection(nextTasks) {
  tasks = nextTasks;
  reorganizeTaskArray();
  invalidateTaskCaches();
}

function getUnscheduledSequence() {
  if (!unscheduledSequence) {
    unscheduledSequence = createUnscheduledSequence({
      readTasks: () => tasks,
      replaceTasks: replaceTaskCollection,
      persistTasks: (changedTasks) => putTasks(changedTasks.map(stripUIFlags)),
      reloadTasks: () => loadTasks()
    });
  }
  return unscheduledSequence;
}

export function getUnscheduledView(mode = 'priority') {
  return getUnscheduledSequence().project(mode);
}

export function getSortedUnscheduledTasks() {
  return getUnscheduledView('priority').tasks;
}

export function moveUnscheduledTask(taskId, destination) {
  return getUnscheduledSequence().move(taskId, destination);
}
```

Remove the old private Unscheduled comparator and old selector.

- [ ] **Step 4: Delegate lifecycle placement in all three entry paths**

Replace the Unscheduled branch of 'addTask' with:

```js
tasks.push(taskObject);
const placement = getUnscheduledSequence().place(taskObject.id);
const placedTask = placement.success ? placement.task : taskObject;
finalizeTaskModification(
  placement.success ? placement.changedTasks : [taskObject]
);
logger.info('addTask: Unscheduled task added.');
return createSuccessfulTaskResult(placedTask);
```

Replace the Unscheduled branch of 'confirmAddTaskAndReschedule' with:

```js
if (!tasks.find((task) => task.id === taskToAdd.id)) {
  tasks.push(taskToAdd);
}
const placement = getUnscheduledSequence().place(taskToAdd.id);
const placedTask = placement.success ? placement.task : taskToAdd;
finalizeTaskModification(
  placement.success ? placement.changedTasks : [taskToAdd]
);
return createSuccessfulTaskResult(placedTask);
```

Keep the scheduled branch's existing final return. Replace 'unscheduleTask' after conversion with:

```js
const unscheduledTask = convertScheduledTaskToUnscheduled(task);
tasks[taskIndex] = unscheduledTask;
const placement = getUnscheduledSequence().place(unscheduledTask.id);
const placedTask = placement.success ? placement.task : unscheduledTask;
finalizeTaskModification(
  placement.success ? placement.changedTasks : [unscheduledTask]
);

logger.info('Task unscheduled:', placedTask);
return createSuccessfulTaskResult(placedTask);
```

These paths intentionally preserve the existing synchronous mutation and persistence shape. They do not start the explicit-reorder transaction owned by 'move'.

- [ ] **Step 5: Run manager, handler, and integration tests**

```powershell
npm.cmd test -- --runInBand __tests__/task-management.test.js __tests__/add-task-handler.test.js __tests__/unscheduled-task-handlers.test.js __tests__/integration.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add public/js/tasks/manager.js __tests__/task-management.test.js
git commit -m "refactor: deepen unscheduled sequence ownership"
```

---

### Task 5: Mount the Deep List UI and Migrate Existing Actions

**Files:**

- Create: 'public/js/tasks/unscheduled-list.js'
- Create: '**tests**/unscheduled-list.test.js'
- Modify: 'public/js/tasks/unscheduled-renderer.js:299-328'
- Modify: 'public/js/tasks/unscheduled-handlers.js:181-195'
- Modify: 'public/index.html'

**Interfaces:**

- Produces 'mountUnscheduledList(options)', 'renderUnscheduledList()', and 'destroyUnscheduledList()'.
- Consumes 'readView(mode)', 'moveTask(id, destination)', named actions, 'getRunningActivity()', 'showError(message, options)', and browser localStorage.
- The renderer becomes private implementation and accepts '{mode, movementByTaskId, runningActivity}' instead of callbacks.

- [ ] **Step 1: Add failing list lifecycle, mode, and existing-action tests**

```js
import {
  mountUnscheduledList,
  renderUnscheduledList,
  destroyUnscheduledList
} from '../public/js/tasks/unscheduled-list.js';

function installDom() {
  document.body.innerHTML = `
        <div id="unscheduled-sort-control" aria-label="Unscheduled order">
            <span>Sort:</span>
            <button type="button" data-unscheduled-mode="manual">My order</button>
            <button type="button" data-unscheduled-mode="priority">Priority</button>
        </div>
        <div id="unscheduled-task-list"></div>
        <div id="unscheduled-order-status" aria-live="polite"></div>
    `;
}

function task(id, overrides = {}) {
  return {
    id,
    type: 'unscheduled',
    description: id,
    status: 'incomplete',
    priority: 'medium',
    estDuration: 30,
    ...overrides
  };
}

describe('Unscheduled list UI interface', () => {
  let readView;
  let moveTask;
  let actions;

  beforeEach(() => {
    installDom();
    localStorage.clear();
    readView = jest.fn((mode) => ({
      tasks: [task('a')],
      movementByTaskId: new Map([
        ['a', { position: 1, total: 1, canMoveUp: false, canMoveDown: false }]
      ]),
      mode
    }));
    moveTask = jest.fn();
    actions = {
      schedule: jest.fn(),
      startTimer: jest.fn(),
      edit: jest.fn(),
      delete: jest.fn(),
      saveEdit: jest.fn(),
      cancelEdit: jest.fn(),
      toggleComplete: jest.fn()
    };
  });

  afterEach(() => destroyUnscheduledList());

  test('mount defaults invalid preferences to Priority', () => {
    localStorage.setItem('fortudo-unscheduled-sort-mode', 'invalid');
    mountUnscheduledList({
      readView,
      moveTask,
      actions,
      getRunningActivity: () => null
    });
    renderUnscheduledList();
    expect(readView).toHaveBeenCalledWith('priority');
    expect(
      document
        .querySelector('[data-unscheduled-mode="priority"]')
        .getAttribute('aria-pressed')
    ).toBe('true');
  });

  test('mode selection persists locally and changes the rendered projection', () => {
    mountUnscheduledList({
      readView,
      moveTask,
      actions,
      getRunningActivity: () => null
    });
    document.querySelector('[data-unscheduled-mode="manual"]').click();
    expect(localStorage.getItem('fortudo-unscheduled-sort-mode')).toBe(
      'manual'
    );
    expect(readView).toHaveBeenLastCalledWith('manual');
  });

  test('existing actions route through the named-actions adapter', () => {
    mountUnscheduledList({
      readView,
      moveTask,
      actions,
      getRunningActivity: () => null
    });
    renderUnscheduledList();
    document.querySelector('.btn-edit-unscheduled').click();
    expect(actions.edit).toHaveBeenCalledWith('a');
  });

  test('action menu routing, Escape, and inline Enter stay behind the list interface', () => {
    mountUnscheduledList({
      readView,
      moveTask,
      actions,
      getRunningActivity: () => null
    });
    renderUnscheduledList();
    const trigger = document.querySelector(
      '.btn-unscheduled-task-actions-menu'
    );
    const menu = document.querySelector('.unscheduled-task-actions-menu');
    trigger.click();
    expect(menu.hidden).toBe(false);
    trigger.focus();
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);

    document
      .querySelector('.inline-edit-unscheduled-form')
      .classList.remove('hidden');
    const input = document.querySelector('[name="inline-edit-description"]');
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    expect(actions.saveEdit).toHaveBeenCalledWith('a');
  });

  test('destroy removes listeners', () => {
    mountUnscheduledList({
      readView,
      moveTask,
      actions,
      getRunningActivity: () => null
    });
    destroyUnscheduledList();
    document.querySelector('[data-unscheduled-mode="manual"]').click();
    expect(readView).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and verify red**

```powershell
npm.cmd test -- --runInBand __tests__/unscheduled-list.test.js
```

Expected: FAIL because the list module does not exist.

- [ ] **Step 3: Add static controls**

Place above '#unscheduled-task-list':

```html
<div
  id="unscheduled-sort-control"
  class="mb-3 flex items-center justify-end gap-1"
  role="group"
  aria-label="Unscheduled order"
>
  <span class="mr-1 text-xs text-slate-400">Sort:</span>
  <button type="button" data-unscheduled-mode="manual" aria-pressed="false">
    My order
  </button>
  <button type="button" data-unscheduled-mode="priority" aria-pressed="true">
    Priority
  </button>
</div>
<div id="unscheduled-order-status" class="sr-only" aria-live="polite"></div>
```

- [ ] **Step 4: Refactor the private renderer signature**

Change the renderer export:

```js
export function renderUnscheduledTasks(
  unscheduledTasks,
  {
    mode = 'priority',
    movementByTaskId = new Map(),
    runningActivity = null
  } = {}
) {
  const list = getUnscheduledTaskListElement();
  if (!list) return;
  list.replaceChildren();
  if (unscheduledTasks.length === 0) {
    list.innerHTML = EMPTY_STATE_MESSAGE;
    return;
  }
  for (const task of unscheduledTasks) {
    list.appendChild(
      createUnscheduledTaskCard(task, {
        mode,
        movement: movementByTaskId.get(task.id),
        runningActivity
      })
    );
  }
}
```

Update 'createUnscheduledTaskCard' and the menu renderer to consume the option object. Do not bind events or store callbacks in this file.

- [ ] **Step 5: Implement mount/render/destroy and existing action routing**

Create 'public/js/tasks/unscheduled-list.js':

```js
import { renderUnscheduledTasks } from './unscheduled-renderer.js';

const MODE_KEY = 'fortudo-unscheduled-sort-mode';
const VALID_MODES = new Set(['priority', 'manual']);
let state = null;

function readMode(storage) {
  try {
    const saved = storage.getItem(MODE_KEY);
    return VALID_MODES.has(saved) ? saved : 'priority';
  } catch {
    return 'priority';
  }
}

function writeMode(storage, mode) {
  try {
    storage.setItem(MODE_KEY, mode);
  } catch {
    // Keep the selected mode for the page session.
  }
}

function taskIdFrom(target) {
  return target.closest('[data-task-id]')?.dataset.taskId || null;
}

function closeMenus({ except = null, restoreFocus = false } = {}) {
  let focusTarget = null;
  state.root
    .querySelectorAll('.unscheduled-task-actions-menu')
    .forEach((menu) => {
      if (menu === except || menu.hidden) return;
      const trigger = menu.parentElement?.querySelector(
        '.btn-unscheduled-task-actions-menu'
      );
      menu.hidden = true;
      menu.classList.remove('action-menu-content--open');
      menu.classList.add('action-menu-content', 'action-menu-content--closed');
      menu.parentElement?.classList.remove('z-50');
      menu.closest('[data-task-id]')?.classList.remove('z-40');
      trigger?.setAttribute('aria-expanded', 'false');
      focusTarget ||= trigger;
    });
  if (restoreFocus) focusTarget?.focus();
}

function toggleMenu(trigger) {
  const menu = trigger.parentElement?.querySelector(
    '.unscheduled-task-actions-menu'
  );
  if (!menu) return;
  const shouldOpen = menu.hidden;
  closeMenus({ except: shouldOpen ? menu : null });
  menu.hidden = !shouldOpen;
  menu.classList.add('action-menu-content');
  menu.classList.toggle('action-menu-content--open', shouldOpen);
  menu.classList.toggle('action-menu-content--closed', !shouldOpen);
  menu.parentElement?.classList.toggle('z-50', shouldOpen);
  menu.closest('[data-task-id]')?.classList.toggle('z-40', shouldOpen);
  trigger.setAttribute('aria-expanded', String(shouldOpen));
}

function handleClick(event) {
  const target = event.target;
  const modeButton = target.closest('[data-unscheduled-mode]');
  if (modeButton) {
    state.mode = modeButton.dataset.unscheduledMode;
    writeMode(state.storage, state.mode);
    renderUnscheduledList();
    return;
  }
  const menuTrigger = target.closest('.btn-unscheduled-task-actions-menu');
  if (menuTrigger) {
    event.preventDefault();
    toggleMenu(menuTrigger);
    return;
  }
  const taskId = taskIdFrom(target);
  if (!taskId || target.closest('button[disabled]')) return;
  if (target.closest('.btn-schedule-task')) {
    closeMenus();
    state.actions.schedule(taskId);
  } else if (target.closest('.btn-start-unscheduled-timer')) {
    closeMenus();
    state.actions.startTimer(taskId);
  } else if (target.closest('.btn-edit-unscheduled')) {
    closeMenus();
    state.actions.edit(taskId);
  } else if (target.closest('.btn-delete-unscheduled')) {
    closeMenus();
    state.actions.delete(taskId);
  } else if (target.closest('.task-checkbox-unscheduled'))
    state.actions.toggleComplete(taskId);
  else if (target.closest('.btn-save-inline-edit'))
    state.actions.saveEdit(taskId);
  else if (target.closest('.btn-cancel-inline-edit'))
    state.actions.cancelEdit(taskId);
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    closeMenus({ restoreFocus: true });
    return;
  }
  if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement))
    return;
  const taskId = taskIdFrom(event.target);
  if (!taskId || !event.target.closest('form')) return;
  event.preventDefault();
  state.actions.saveEdit(taskId);
}

function handleDocumentClick(event) {
  if (!event.target.closest?.('.unscheduled-task-actions')) closeMenus();
}

function handleSubmit(event) {
  const taskId = taskIdFrom(event.target);
  if (!taskId) return;
  event.preventDefault();
  state.actions.saveEdit(taskId);
}

export function mountUnscheduledList({
  readView,
  moveTask,
  actions,
  getRunningActivity,
  showError = () => {},
  storage = window.localStorage
}) {
  destroyUnscheduledList();
  const root = document.getElementById('unscheduled-task-list');
  const controls = document.getElementById('unscheduled-sort-control');
  if (!root || !controls)
    throw new Error('Unscheduled list roots are missing.');
  const abortController = new AbortController();
  state = {
    root,
    controls,
    readView,
    moveTask,
    actions,
    getRunningActivity,
    showError,
    storage,
    mode: readMode(storage),
    abortController,
    dragActive: false,
    pendingView: null
  };
  controls.addEventListener('click', handleClick, {
    signal: abortController.signal
  });
  root.addEventListener('click', handleClick, {
    signal: abortController.signal
  });
  root.addEventListener('submit', handleSubmit, {
    signal: abortController.signal
  });
  root.addEventListener('keydown', handleKeydown, {
    signal: abortController.signal
  });
  document.addEventListener('click', handleDocumentClick, {
    signal: abortController.signal
  });
}

export function renderUnscheduledList() {
  if (!state) return;
  const view = state.readView(state.mode);
  if (state.dragActive) {
    state.pendingView = view;
    return;
  }
  renderView(view);
}

function renderView(view) {
  document.querySelectorAll('[data-unscheduled-mode]').forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.unscheduledMode === state.mode)
    );
  });
  renderUnscheduledTasks(view.tasks, {
    mode: state.mode,
    movementByTaskId: view.movementByTaskId,
    runningActivity: state.getRunningActivity()
  });
}

export function destroyUnscheduledList() {
  state?.abortController.abort();
  state = null;
}
```

- [ ] **Step 6: Export a named-actions adapter**

Replace 'createUnscheduledTaskCallbacks' with:

```js
export function createUnscheduledTaskActions() {
  return {
    schedule: handleScheduleUnscheduledTask,
    startTimer: handleStartTimerFromUnscheduledTask,
    edit: handleEditUnscheduledTask,
    delete: handleDeleteUnscheduledTask,
    confirmSchedule: handleConfirmScheduleTask,
    saveEdit: handleSaveUnscheduledTaskEdit,
    cancelEdit: handleCancelUnscheduledTaskEdit,
    toggleComplete: handleToggleCompleteUnscheduledTask
  };
}
```

Keep handler behavior tests; remove only the old callback-property shape test after the list action-routing test passes.

- [ ] **Step 7: Run tests**

```powershell
npm.cmd test -- --runInBand __tests__/unscheduled-list.test.js __tests__/unscheduled-task-renderer.test.js __tests__/unscheduled-task-handlers.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add public/index.html public/js/tasks/unscheduled-list.js public/js/tasks/unscheduled-renderer.js public/js/tasks/unscheduled-handlers.js __tests__/unscheduled-list.test.js __tests__/unscheduled-task-handlers.test.js
git commit -m "refactor: deepen unscheduled list UI"
```

---

### Task 6: Add Menu Movement, Accessibility Feedback, and Settlement UI

**Files:**

- Modify: 'public/js/tasks/unscheduled-list.js'
- Modify: 'public/js/tasks/unscheduled-renderer.js'
- Modify: '**tests**/unscheduled-list.test.js'

**Interfaces:**

- The renderer emits move buttons only in My order.
- The list converts menu intent to sequence destinations.
- Optimistic moves render immediately; settlement failure rerenders rollback or durable reload and reports an error.

- [ ] **Step 1: Add failing menu and settlement tests**

```js
test('My order renders handles and boundary-aware move commands', () => {
  localStorage.setItem('fortudo-unscheduled-sort-mode', 'manual');
  readView.mockReturnValue({
    tasks: [task('a'), task('b')],
    movementByTaskId: new Map([
      ['a', { position: 1, total: 2, canMoveUp: false, canMoveDown: true }],
      ['b', { position: 2, total: 2, canMoveUp: true, canMoveDown: false }]
    ])
  });
  mountUnscheduledList({
    readView,
    moveTask,
    actions,
    getRunningActivity: () => null
  });
  renderUnscheduledList();
  expect(document.querySelectorAll('.unscheduled-drag-handle')).toHaveLength(2);
  expect(
    document.querySelector('[data-task-id="a"] [data-move-kind="up"]').disabled
  ).toBe(true);
  expect(
    document.querySelector('[data-task-id="b"] [data-move-kind="top"]').disabled
  ).toBe(false);
});

test('menu movement renders and announces the optimistic position', async () => {
  localStorage.setItem('fortudo-unscheduled-sort-mode', 'manual');
  readView.mockReturnValue({
    tasks: [task('a'), task('b')],
    movementByTaskId: new Map([
      ['a', { position: 1, total: 2, canMoveUp: false, canMoveDown: true }],
      ['b', { position: 2, total: 2, canMoveUp: true, canMoveDown: false }]
    ])
  });
  moveTask.mockReturnValue({
    success: true,
    changed: true,
    taskId: 'b',
    position: 1,
    total: 2,
    settled: Promise.resolve({ success: true })
  });
  mountUnscheduledList({
    readView,
    moveTask,
    actions,
    getRunningActivity: () => null
  });
  renderUnscheduledList();
  document.querySelector('[data-task-id="b"] [data-move-kind="top"]').click();
  expect(moveTask).toHaveBeenCalledWith('b', { kind: 'top' });
  await Promise.resolve();
  expect(document.getElementById('unscheduled-order-status').textContent).toBe(
    'Moved b to position 1 of 2.'
  );
  expect(document.activeElement).toBe(
    document.querySelector(
      '[data-task-id="b"] .btn-unscheduled-task-actions-menu'
    )
  );
});

test('failed settlement rerenders and reports durable reload', async () => {
  localStorage.setItem('fortudo-unscheduled-sort-mode', 'manual');
  const showError = jest.fn();
  readView.mockReturnValue({
    tasks: [task('a'), task('b')],
    movementByTaskId: new Map([
      ['a', { position: 1, total: 2, canMoveUp: false, canMoveDown: true }],
      ['b', { position: 2, total: 2, canMoveUp: true, canMoveDown: false }]
    ])
  });
  moveTask.mockReturnValue({
    success: true,
    changed: true,
    taskId: 'b',
    position: 1,
    total: 2,
    settled: Promise.resolve({
      success: false,
      rolledBack: false,
      reloaded: true,
      reason: 'compensation failed'
    })
  });
  mountUnscheduledList({
    readView,
    moveTask,
    actions,
    getRunningActivity: () => null,
    showError
  });
  renderUnscheduledList();
  document.querySelector('[data-task-id="b"] [data-move-kind="top"]').click();
  await Promise.resolve();
  await Promise.resolve();
  expect(showError).toHaveBeenCalledWith(
    'Order could not be saved. Fortudo reloaded the stored order.',
    { theme: 'rose' }
  );
});

test('failed durable reload reports the stronger recovery error', async () => {
  localStorage.setItem('fortudo-unscheduled-sort-mode', 'manual');
  const showError = jest.fn();
  readView.mockReturnValue({
    tasks: [task('a'), task('b')],
    movementByTaskId: new Map([
      ['a', { position: 1, total: 2, canMoveUp: false, canMoveDown: true }],
      ['b', { position: 2, total: 2, canMoveUp: true, canMoveDown: false }]
    ])
  });
  moveTask.mockReturnValue({
    success: true,
    changed: true,
    taskId: 'b',
    position: 1,
    total: 2,
    settled: Promise.resolve({
      success: false,
      rolledBack: true,
      reloaded: false,
      recoveryFailed: true,
      reason: 'reload failed'
    })
  });
  mountUnscheduledList({
    readView,
    moveTask,
    actions,
    getRunningActivity: () => null,
    showError
  });
  renderUnscheduledList();
  document.querySelector('[data-task-id="b"] [data-move-kind="top"]').click();
  await Promise.resolve();
  await Promise.resolve();
  expect(showError).toHaveBeenCalledWith(
    'Order could not be recovered from storage. Reload Fortudo before making more changes.',
    { theme: 'rose' }
  );
});
```

- [ ] **Step 2: Run and verify red**

```powershell
npm.cmd test -- --runInBand __tests__/unscheduled-list.test.js
```

Expected: FAIL because move markup and handling do not exist.

- [ ] **Step 3: Add mode-specific handle and move markup**

Add to the private renderer:

```js
function renderMoveMenu(task, movement) {
  const upDisabled = !movement?.canMoveUp;
  const downDisabled = !movement?.canMoveDown;
  return `
        <div class="unscheduled-task-actions-menu-group mt-1.5 pt-1.5 border-t border-slate-700">
            <button type="button" data-move-kind="up" data-task-id="${task.id}" ${upDisabled ? 'disabled' : ''}>Move up</button>
            <button type="button" data-move-kind="down" data-task-id="${task.id}" ${downDisabled ? 'disabled' : ''}>Move down</button>
            <button type="button" data-move-kind="top" data-task-id="${task.id}" ${upDisabled ? 'disabled' : ''}>Move to top</button>
            <button type="button" data-move-kind="bottom" data-task-id="${task.id}" ${downDisabled ? 'disabled' : ''}>Move to bottom</button>
        </div>
    `;
}
```

Use existing menu-item classes on each button. Emit the six-dot handle before the checkbox only in manual mode, escape the task description in its aria-label, and disable it while inline editing or while the running activity references the task.

- [ ] **Step 4: Handle moves and settlement**

Add:

```js
async function settleMove(operation) {
  const result = await operation.settled;
  if (result.success) return;
  renderUnscheduledList();
  const message = result.recoveryFailed
    ? 'Order could not be recovered from storage. Reload Fortudo before making more changes.'
    : result.reloaded
      ? 'Order could not be saved. Fortudo reloaded the stored order.'
      : 'Order could not be saved. Your previous order was restored.';
  state.showError(message, { theme: 'rose' });
}

function announceMove(description, operation) {
  const status = document.getElementById('unscheduled-order-status');
  if (status) {
    status.textContent =
      'Moved ' +
      description +
      ' to position ' +
      operation.position +
      ' of ' +
      operation.total +
      '.';
  }
}

function handleMoveButton(target, taskId) {
  const description = target.closest('.task-card')?.dataset.taskName || 'task';
  const operation = state.moveTask(taskId, { kind: target.dataset.moveKind });
  if (!operation.success || !operation.changed) return;
  renderUnscheduledList();
  announceMove(description, operation);
  document
    .querySelector(
      '[data-task-id="' + taskId + '"] .btn-unscheduled-task-actions-menu'
    )
    ?.focus();
  void settleMove(operation);
}
```

Call 'handleMoveButton' before existing-action routing when '[data-move-kind]' matches.

- [ ] **Step 5: Run tests**

```powershell
npm.cmd test -- --runInBand __tests__/unscheduled-list.test.js __tests__/unscheduled-sequence.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add public/js/tasks/unscheduled-list.js public/js/tasks/unscheduled-renderer.js __tests__/unscheduled-list.test.js
git commit -m "feat: move unscheduled tasks accessibly"
```

---

### Task 7: Add Private Pointer Reordering and Deferred Rendering

**Files:**

- Create: 'public/js/tasks/unscheduled-list-drag.js'
- Modify: 'public/js/tasks/unscheduled-list.js'
- Modify: 'public/css/custom.css'
- Modify: '**tests**/unscheduled-list.test.js'
- Modify: '**tests**/custom-css.test.js'

**Interfaces:**

- The drag helper is private and imported only by 'unscheduled-list.js'.
- Tests dispatch pointer events through the mounted list interface; they do not import drag helpers.
- Drops produce '{kind: before, taskId}' destinations.

- [ ] **Step 1: Add failing interface-level pointer tests**

```js
function pointer(type, target, values) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: values.clientX,
    clientY: values.clientY
  });
  Object.defineProperty(event, 'pointerId', { value: values.pointerId || 1 });
  target.dispatchEvent(event);
}

test('dragging by the handle sends an identity-based before destination', () => {
  localStorage.setItem('fortudo-unscheduled-sort-mode', 'manual');
  readView.mockReturnValue({
    tasks: [task('a'), task('b'), task('c')],
    movementByTaskId: new Map()
  });
  moveTask.mockReturnValue({
    success: true,
    changed: true,
    taskId: 'c',
    position: 1,
    total: 3,
    settled: Promise.resolve({ success: true })
  });
  mountUnscheduledList({
    readView,
    moveTask,
    actions,
    getRunningActivity: () => null
  });
  renderUnscheduledList();
  const cards = [...document.querySelectorAll('.task-card')];
  cards.forEach((card, index) => {
    card.getBoundingClientRect = () => ({
      top: index * 50,
      bottom: index * 50 + 40,
      height: 40,
      left: 0,
      right: 300,
      width: 300
    });
  });
  const scrollBy = jest.spyOn(window, 'scrollBy').mockImplementation(() => {});
  pointer('pointerdown', cards[2].querySelector('.unscheduled-drag-handle'), {
    pointerId: 7,
    clientY: 110
  });
  pointer('pointermove', document.getElementById('unscheduled-task-list'), {
    pointerId: 7,
    clientY: 5
  });
  pointer('pointerup', document.getElementById('unscheduled-task-list'), {
    pointerId: 7,
    clientY: 5
  });
  expect(moveTask).toHaveBeenCalledWith('c', { kind: 'before', taskId: 'a' });
  expect(document.activeElement).toBe(
    document.querySelector('[data-task-id="c"] .unscheduled-drag-handle')
  );
  expect(scrollBy).toHaveBeenCalledWith({ top: -24, behavior: 'auto' });
  scrollBy.mockRestore();
});

test('render requests during drag apply only the latest view after cancellation', () => {
  localStorage.setItem('fortudo-unscheduled-sort-mode', 'manual');
  mountUnscheduledList({
    readView,
    moveTask,
    actions,
    getRunningActivity: () => null
  });
  renderUnscheduledList();
  const handle = document.querySelector('.unscheduled-drag-handle');
  pointer('pointerdown', handle, { pointerId: 3, clientY: 10 });
  readView
    .mockReturnValueOnce({ tasks: [task('b')], movementByTaskId: new Map() })
    .mockReturnValueOnce({ tasks: [task('c')], movementByTaskId: new Map() });
  renderUnscheduledList();
  renderUnscheduledList();
  expect(taskOrderFromDom()).toEqual(['a']);
  pointer('pointercancel', document.getElementById('unscheduled-task-list'), {
    pointerId: 3,
    clientY: 10
  });
  expect(taskOrderFromDom()).toEqual(['c']);
  expect(readView).toHaveBeenCalledTimes(3);
});

test('a remote view that removes the dragged task cancels safely', () => {
  localStorage.setItem('fortudo-unscheduled-sort-mode', 'manual');
  readView.mockReturnValue({
    tasks: [task('a'), task('b')],
    movementByTaskId: new Map()
  });
  mountUnscheduledList({
    readView,
    moveTask,
    actions,
    getRunningActivity: () => null
  });
  renderUnscheduledList();
  pointer(
    'pointerdown',
    document.querySelector('[data-task-id="a"] .unscheduled-drag-handle'),
    {
      pointerId: 4,
      clientY: 10
    }
  );
  readView.mockReturnValue({ tasks: [task('b')], movementByTaskId: new Map() });
  renderUnscheduledList();
  expect(taskOrderFromDom()).toEqual(['b']);
  expect(document.querySelector('.unscheduled-task--dragging')).toBeNull();
  expect(moveTask).not.toHaveBeenCalled();
});
```

Add this test helper beside 'pointer':

```js
function taskOrderFromDom() {
  return [
    ...document.querySelectorAll('#unscheduled-task-list .task-card')
  ].map((card) => card.dataset.taskId);
}
```

- [ ] **Step 2: Run and verify red**

```powershell
npm.cmd test -- --runInBand __tests__/unscheduled-list.test.js
```

Expected: FAIL because pointer delegation is absent.

- [ ] **Step 3: Implement the private drag helper**

Create 'public/js/tasks/unscheduled-list-drag.js':

```js
export function createUnscheduledListDrag({ root, onActiveChange, onDrop }) {
  let active = null;

  function insertionBeforeId(clientY) {
    const cards = [
      ...root.querySelectorAll('.task-card:not(.unscheduled-task--dragging)')
    ];
    const next = cards.find((card) => {
      const rect = card.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });
    return next?.dataset.taskId || null;
  }

  function cleanup() {
    if (active) {
      try {
        active.handle.releasePointerCapture?.(active.pointerId);
      } catch {
        // Capture can already be released by the browser after cancellation.
      }
    }
    active?.card.classList.remove('unscheduled-task--dragging');
    root.querySelector('.unscheduled-drop-marker')?.remove();
    active = null;
    onActiveChange(false);
  }

  function pointerDown(event) {
    const handle = event.target.closest('.unscheduled-drag-handle');
    if (!handle || handle.disabled) return;
    const card = handle.closest('.task-card');
    if (!card) return;
    active = {
      pointerId: event.pointerId,
      handle,
      card,
      taskId: card.dataset.taskId,
      beforeId: null
    };
    handle.setPointerCapture?.(event.pointerId);
    card.classList.add('unscheduled-task--dragging');
    onActiveChange(true);
  }

  function pointerMove(event) {
    if (!active || event.pointerId !== active.pointerId) return;
    active.beforeId = insertionBeforeId(event.clientY);
    root.querySelector('.unscheduled-drop-marker')?.remove();
    const marker = document.createElement('div');
    marker.className = 'unscheduled-drop-marker';
    marker.setAttribute('aria-hidden', 'true');
    const before = active.beforeId
      ? root.querySelector('[data-task-id="' + active.beforeId + '"]')
      : null;
    root.insertBefore(marker, before);
    if (event.clientY < 32) window.scrollBy({ top: -24, behavior: 'auto' });
    if (event.clientY > window.innerHeight - 32) {
      window.scrollBy({ top: 24, behavior: 'auto' });
    }
  }

  function pointerUp(event) {
    if (!active || event.pointerId !== active.pointerId) return;
    const drop = { taskId: active.taskId, beforeId: active.beforeId };
    cleanup();
    onDrop(drop);
  }

  function pointerCancel(event) {
    if (!active || event.pointerId !== active.pointerId) return;
    cleanup();
  }

  root.addEventListener('pointerdown', pointerDown);
  root.addEventListener('pointermove', pointerMove);
  root.addEventListener('pointerup', pointerUp);
  root.addEventListener('pointercancel', pointerCancel);

  return {
    getActiveTaskId() {
      return active?.taskId || null;
    },
    cancel() {
      if (active) cleanup();
    },
    destroy() {
      root.removeEventListener('pointerdown', pointerDown);
      root.removeEventListener('pointermove', pointerMove);
      root.removeEventListener('pointerup', pointerUp);
      root.removeEventListener('pointercancel', pointerCancel);
      if (active) cleanup();
    }
  };
}
```

- [ ] **Step 4: Compose drag behind the list interface**

During mount:

```js
state.drag = createUnscheduledListDrag({
  root,
  onActiveChange(active) {
    state.dragActive = active;
    if (!active && state.pendingView) {
      const pendingView = state.pendingView;
      state.pendingView = null;
      renderView(pendingView);
    }
  },
  onDrop({ taskId, beforeId }) {
    const operation = state.moveTask(taskId, {
      kind: 'before',
      taskId: beforeId
    });
    if (!operation.success || !operation.changed) {
      renderUnscheduledList();
      return;
    }
    renderUnscheduledList();
    const description =
      state.readView(state.mode).tasks.find((task) => task.id === taskId)
        ?.description || 'task';
    announceMove(description, operation);
    document
      .querySelector('[data-task-id="' + taskId + '"] .unscheduled-drag-handle')
      ?.focus();
    void settleMove(operation);
  }
});
```

Extend the active-drag branch in 'renderUnscheduledList' so a synced deletion cancels safely:

```js
if (state.dragActive) {
  state.pendingView = view;
  const activeTaskId = state.drag?.getActiveTaskId();
  if (activeTaskId && !view.tasks.some((task) => task.id === activeTaskId)) {
    state.drag.cancel();
  }
  return;
}
```

In 'destroyUnscheduledList', clear 'pendingView', call 'state.drag?.destroy()', then abort listeners
before clearing 'state'.

- [ ] **Step 5: Add CSS states and their guard test**

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
  transform: scale(1.01);
}

.unscheduled-drop-marker {
  height: 0.25rem;
  margin: 0.25rem 0;
  border-radius: 9999px;
  background: rgb(129 140 248);
}

@media (prefers-reduced-motion: reduce) {
  .unscheduled-task--dragging {
    transform: none;
  }
}
```

In '**tests**/custom-css.test.js', assert all four selectors and 'touch-action: none' are present.

- [ ] **Step 6: Run tests**

```powershell
npm.cmd test -- --runInBand __tests__/unscheduled-list.test.js __tests__/custom-css.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add public/js/tasks/unscheduled-list-drag.js public/js/tasks/unscheduled-list.js public/css/custom.css __tests__/unscheduled-list.test.js __tests__/custom-css.test.js
git commit -m "feat: drag unscheduled sequence by handle"
```

---

### Task 8: Wire One List Seam and Replace Obsolete Tests

**Files:**

- Modify: 'public/js/app.js:2-80,155-175,285-310'
- Modify: 'public/js/dom-renderer.js:1-35,280-330,540-735,938-946'
- Modify: 'public/js/modal-manager.js:254-355'
- Modify: '**tests**/app.test.js'
- Modify: '**tests**/dom-interaction.test.js'
- Modify: '**tests**/unscheduled-task-renderer.test.js'
- Modify: '**tests**/unscheduled-task-handlers.test.js'

**Interfaces:**

- App mounts one list with manager read/move wrappers and named actions.
- App and broader refresh both call 'renderUnscheduledList()'.
- No code outside the list module imports drag state, mode state, or Unscheduled renderer event helpers.

- [ ] **Step 1: Add failing thin wiring tests**

Mock the list interface in app tests:

```js
jest.mock('../public/js/tasks/unscheduled-list.js', () => ({
  mountUnscheduledList: jest.fn(),
  renderUnscheduledList: jest.fn(),
  destroyUnscheduledList: jest.fn()
}));

test('room initialization mounts and renders the Unscheduled list through one seam', async () => {
  await initializeAppForTest();
  expect(mountUnscheduledList).toHaveBeenCalledTimes(1);
  expect(renderUnscheduledList).toHaveBeenCalled();
});
```

In DOM tests, assert 'refreshUI()' calls 'renderUnscheduledList' and no longer requires an Unscheduled callback object.

- [ ] **Step 2: Run and verify red**

```powershell
npm.cmd test -- --runInBand __tests__/app.test.js __tests__/dom-interaction.test.js
```

Expected: FAIL because app and DOM still use the old callback/render pipeline.

- [ ] **Step 3: Wire app and modal initialization**

Create actions once:

```js
const unscheduledActions = createUnscheduledTaskActions();
mountUnscheduledList({
  readView: getUnscheduledView,
  moveTask: moveUnscheduledTask,
  actions: unscheduledActions,
  getRunningActivity,
  showError: showToast
});
initializeModalEventListeners(unscheduledActions);
```

Rename the modal-manager parameter from 'unscheduledTaskCallbacks' to 'unscheduledActions' and
replace its submit callback with:

```js
unscheduledActions.confirmSchedule(
  taskId,
  startTime,
  duration,
  reschedulePreApproved
);
```

Replace both calls that pass ordered tasks into an Unscheduled renderer with:

```js
renderUnscheduledList();
```

Call 'destroyUnscheduledList()' during room teardown/reset alongside existing listener cleanup.

- [ ] **Step 4: Remove old Unscheduled delegation from DOM renderer**

Delete:

- 'globalUnscheduledTaskCallbacks'.
- Unscheduled click, submit, and keydown handlers.
- Unscheduled menu toggle/close state.
- 'initializeUnscheduledTaskListEventListeners'.
- The pass-through 'renderUnscheduledTasks' wrapper.

Import 'renderUnscheduledList' and call it from 'refreshUI()'. Keep scheduled delegation unchanged.

- [ ] **Step 5: Apply the test traceability review**

| Old protected behavior                         | Replacement test                       | Action                                               |
| ---------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| Priority comparator in manager                 | sequence Priority projection           | Remove old comparator cases after replacement passes |
| Renderer mode/handle/menu markup               | list rendered DOM through mount/render | Remove direct renderer duplication                   |
| Callback factory property names                | list action routing plus app wiring    | Remove property-shape test                           |
| Unscheduled DOM click/submit branches          | list real-event tests                  | Remove migrated DOM-interaction cases                |
| Handler scheduling/timer/edit/delete rules     | existing handler tests                 | Keep                                                 |
| PouchDB row/revision behavior                  | storage adapter tests                  | Keep                                                 |
| Add/unschedule placement crossing manager seam | manager integration tests              | Keep                                                 |
| Reload and sync persistence                    | E2E                                    | Keep                                                 |

For replacements that would pass against legacy behavior, the red step must still target the missing new interface. Do not delete an old assertion until its replacement passes through that interface. Record old and replacement test names in the commit body.

- [ ] **Step 6: Run the migrated surface**

```powershell
npm.cmd test -- --runInBand __tests__/storage.test.js __tests__/unscheduled-sequence.test.js __tests__/task-management.test.js __tests__/unscheduled-list.test.js __tests__/unscheduled-task-renderer.test.js __tests__/unscheduled-task-handlers.test.js __tests__/dom-interaction.test.js __tests__/app.test.js
```

Expected: PASS. No test imports a private comparator, mode helper, renderer callback setter, or drag helper.

- [ ] **Step 7: Commit**

```powershell
git add public/js/app.js public/js/dom-renderer.js public/js/modal-manager.js public/js/tasks/unscheduled-list.js public/js/tasks/unscheduled-handlers.js __tests__/app.test.js __tests__/dom-interaction.test.js __tests__/unscheduled-task-renderer.test.js __tests__/unscheduled-task-handlers.test.js
git commit -m "refactor: route unscheduled UI through one seam"
```

---

### Task 9: Add End-to-End Coverage, Generate Artifacts, and Verify

**Files:**

- Create: 'tests/e2e/test_unscheduled_order.py'
- Modify: 'public/css/tailwind.css' by generation
- Modify: 'public/sw-precache.js' by generation
- Modify: 'public/sw.js' by generation

**Interfaces:**

- E2E verifies observable behavior only.
- Generated PWA artifacts include every new JavaScript module.

- [ ] **Step 1: Add the complete E2E scenario using the repository's standalone Playwright pattern**

Create 'tests/e2e/test_unscheduled_order.py':

```python
"""Unscheduled manual-order behavior and local room persistence."""

from __future__ import annotations

import re

from playwright.sync_api import expect, sync_playwright

from scripts.e2e_helpers import (
    add_unscheduled_task,
    dismiss_open_modals,
    read_docs,
    wait_for_main_app,
    wait_until,
)
from tests.e2e.helpers import BASE_URL, launch_e2e_page, seed_and_enter_room


ROOM_CODE = "unscheduled-manual-order"


def unscheduled_task(doc_id: str, description: str, manual_order: int) -> dict:
    return {
        "_id": doc_id,
        "id": doc_id,
        "docType": "task",
        "type": "unscheduled",
        "description": description,
        "status": "incomplete",
        "priority": "medium",
        "estDuration": 30,
        "manualOrder": manual_order,
        "editing": False,
        "confirmingDelete": False,
    }


def card_for(page, description: str):
    return page.locator("#unscheduled-task-list .task-card").filter(
        has_text=description
    ).first


def task_order(page) -> list[str]:
    return page.locator("#unscheduled-task-list .task-card").evaluate_all(
        "(cards) => cards.map((card) => card.dataset.taskName)"
    )


def wait_for_order(page, expected: list[str]) -> None:
    page.wait_for_function(
        """
        expected => JSON.stringify(
            [...document.querySelectorAll('#unscheduled-task-list .task-card')]
                .map(card => card.dataset.taskName)
        ) === JSON.stringify(expected)
        """,
        arg=expected,
    )


def persisted_manual_order(page, room_code: str) -> list[str]:
    tasks = [
        doc
        for doc in read_docs(page, room_code)
        if doc.get("docType") == "task" and doc.get("type") == "unscheduled"
    ]
    if any(not isinstance(doc.get("manualOrder"), (int, float)) for doc in tasks):
        return []
    return [doc["description"] for doc in sorted(tasks, key=lambda doc: doc["manualOrder"])]


def wait_for_persisted_order(page, room_code: str, expected: list[str]) -> None:
    wait_until(
        lambda: persisted_manual_order(page, room_code) == expected,
        f"persisted Unscheduled order {expected!r}",
    )


def move_menu_item(page, description: str, kind: str) -> None:
    card = card_for(page, description)
    card.locator(".btn-unscheduled-task-actions-menu").click()
    card.locator(f'[data-move-kind="{kind}"]').click()


def complete_unscheduled_task(page, description: str) -> None:
    card_for(page, description).locator(".task-checkbox-unscheduled").click()


def drag_task_before(page, source_description: str, target_description: str) -> None:
    handle = card_for(page, source_description).locator(".unscheduled-drag-handle")
    target = card_for(page, target_description)
    handle_box = handle.bounding_box()
    target_box = target.bounding_box()
    assert handle_box and target_box
    handle.hover()
    page.mouse.down()
    page.mouse.move(
        target_box["x"] + target_box["width"] / 2,
        target_box["y"] + 2,
        steps=6,
    )
    page.mouse.up()


def test_unscheduled_manual_order_persists_and_syncs_between_pages() -> None:
    seeded = [
        unscheduled_task("unsched-dropoff", "Drop off", 0),
        unscheduled_task("unsched-interview", "Interview prep", 1),
        unscheduled_task("unsched-dinner", "Dinner", 2),
        unscheduled_task("unsched-read", "Read", 3),
    ]

    with sync_playwright() as playwright:
        browser, context, page = launch_e2e_page(playwright)
        try:
            seed_and_enter_room(page, ROOM_CODE, seeded)
            page.locator('[data-unscheduled-mode="manual"]').click()
            move_menu_item(page, "Read", "top")
            expected = ["Read", "Drop off", "Interview prep", "Dinner"]
            wait_for_order(page, expected)
            wait_for_persisted_order(page, ROOM_CODE, expected)

            page.reload(wait_until="load")
            wait_for_main_app(page)
            dismiss_open_modals(page)
            expect(page.locator('[data-unscheduled-mode="manual"]')).to_have_attribute(
                "aria-pressed", "true"
            )
            wait_for_order(page, expected)

            page.locator('[data-unscheduled-mode="priority"]').click()
            page.locator('[data-unscheduled-mode="manual"]').click()
            wait_for_order(page, expected)

            complete_unscheduled_task(page, "Interview prep")
            wait_for_order(page, expected)
            expect(
                card_for(page, "Interview prep").locator(
                    ".task-checkbox-unscheduled i"
                )
            ).to_have_class(re.compile(r".*fa-check-square.*"))

            add_unscheduled_task(page, "New task", 25)
            after_add = ["Read", "Drop off", "Interview prep", "Dinner", "New task"]
            wait_for_order(page, after_add)
            wait_for_persisted_order(page, ROOM_CODE, after_add)

            drag_task_before(page, "Dinner", "Drop off")
            dragged = ["Read", "Dinner", "Drop off", "Interview prep", "New task"]
            wait_for_order(page, dragged)
            wait_for_persisted_order(page, ROOM_CODE, dragged)

            second_page = context.new_page()
            second_page.goto(BASE_URL, wait_until="load")
            wait_for_main_app(second_page)
            dismiss_open_modals(second_page)
            expect(
                second_page.locator('[data-unscheduled-mode="manual"]')
            ).to_have_attribute("aria-pressed", "true")
            wait_for_order(second_page, dragged)
        finally:
            context.close()
            browser.close()
```

This intentionally verifies two pages sharing the same local room database. Field-level unit and
storage tests cover the same 'manualOrder' documents used by remote room replication; the scenario
does not claim to emulate a second remote CouchDB device.

- [ ] **Step 2: Run E2E**

```powershell
uv run --with pytest --with playwright python -m pytest tests/e2e/test_unscheduled_order.py -q
```

Expected: PASS.

- [ ] **Step 3: Generate committed assets**

```powershell
npm.cmd run build:css
npm.cmd run build:sw-precache
```

Expected: Tailwind, precache, and cache version update. Confirm the precache contains 'js/tasks/unscheduled-sequence.js', 'js/tasks/unscheduled-list.js', and 'js/tasks/unscheduled-list-drag.js'.

- [ ] **Step 4: Run focused JavaScript verification**

```powershell
npm.cmd test -- --runInBand __tests__/storage.test.js __tests__/unscheduled-sequence.test.js __tests__/task-management.test.js __tests__/unscheduled-list.test.js __tests__/unscheduled-task-handlers.test.js __tests__/dom-interaction.test.js __tests__/app.test.js __tests__/custom-css.test.js __tests__/service-worker.test.js
```

Expected: PASS.

- [ ] **Step 5: Run full repository verification**

```powershell
npm.cmd run check
npm.cmd run test:coverage
npm.cmd run test:e2e
```

Expected: lint, format, Jest coverage, and complete E2E pass.

- [ ] **Step 6: Inspect and commit final artifacts**

```powershell
git status --short
git diff --check
git diff --stat
```

Expected: only feature, test, glossary/design/plan, and generated PWA files are present; 'git diff --check' prints no errors.

```powershell
git add CONTEXT.md docs/plans/design/2026-07-14-unscheduled-manual-order-design.md docs/plans/implementation/2026-07-14-unscheduled-manual-order.md tests/e2e/test_unscheduled_order.py public/css/tailwind.css public/sw-precache.js public/sw.js
git commit -m "test: verify unscheduled manual ordering"
```

---

## Final Acceptance Checklist

- [x] Priority remains the default for missing or invalid local preference.
- [x] My order/Priority selection is remembered only in the browser.
- [x] Manual order syncs through the room-level `config-unscheduled-sequence` document; reorder
      writes never mutate task documents.
- [x] Completed tasks remain checked, in place, and movable in My order.
- [x] New and newly unscheduled tasks appear after the last incomplete task.
- [x] Menu moves and handle dragging use the same identity-based sequence operation.
- [x] Whole-card dragging is impossible.
- [x] Existing schedule, timer, edit, delete, completion, and inline-edit actions still work.
- [x] Remote renders are deferred during drag and the latest render runs afterward.
- [x] A failed sequence write reloads only durable sequence state; if reload also fails, prior
      in-memory sequence state is restored without touching task fields.
- [x] Concurrent sequence revisions preserve CouchDB's deterministic winner and tombstone losing
      leaves; task edits remain outside that conflict surface.
- [x] App and DOM renderer know neither mode state nor drag state.
- [x] No test imports private comparator, mode, renderer callback, or drag helpers.
- [x] Every removed test has a named replacement through a surviving interface or adapter.
- [x] Focus and live announcements work for menu and pointer movement.
- [x] PWA precache includes all new modules.
- [x] Lint, format, Jest coverage, and local/CI E2E verification pass.

### Deployment-preview note

The two-client Cloudant data-safety scenario passed against the SHA-specific Firebase deployment
with browser CORS enforcement explicitly bypassed: task edit versus reorder, concurrent reorder,
add versus reorder, and delete versus stale reorder all converged; sentinel fields survived, the
deleted task was not resurrected, and no conflict leaves remained. A normal browser run against
that immutable hostname correctly remains a deployment-infrastructure gate because Cloudant does
not currently allow the newly generated Firebase origin. The older preview URL is CORS-allowed but
serves the pre-correction task-rank build, so it is not valid evidence for this architecture.
