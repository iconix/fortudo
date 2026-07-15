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
    const replaceTasks = jest.fn((nextTasks) => {
        tasks = nextTasks;
    });
    const sequence = createUnscheduledSequence({
        readTasks: () => tasks,
        replaceTasks,
        persistTasks,
        reloadTasks
    });

    return { sequence, getTasks: () => tasks, replaceTasks, persistTasks, reloadTasks };
}

function projectWithoutWrites(harness, mode) {
    const originalTasks = harness.getTasks();
    const originalTaskObjects = [...originalTasks];
    const originalSnapshot = JSON.parse(JSON.stringify(originalTasks));

    const projection = harness.sequence.project(mode);

    expect(harness.getTasks()).toBe(originalTasks);
    expect(harness.getTasks()).toEqual(originalSnapshot);
    originalTaskObjects.forEach((item, index) => {
        expect(harness.getTasks()[index]).toBe(item);
    });
    expect(harness.replaceTasks).not.toHaveBeenCalled();
    expect(harness.persistTasks).not.toHaveBeenCalled();
    expect(harness.reloadTasks).not.toHaveBeenCalled();

    return projection;
}

function changedOrders(result) {
    return result.changedTasks.map(({ id, manualOrder }) => ({ id, manualOrder }));
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

test('Priority preserves automatic ordering and never writes', () => {
    const harness = createHarness([
        task('low', { priority: 'low', estDuration: 10 }),
        task('done', { priority: 'high', status: 'completed' }),
        task('high-long', { priority: 'high', estDuration: 60 }),
        task('high-short', { priority: 'high', estDuration: 15 })
    ]);

    expect(projectWithoutWrites(harness, 'priority').tasks.map((item) => item.id)).toEqual([
        'high-short',
        'high-long',
        'low',
        'done'
    ]);
});

test('My order combines ranked and legacy tasks without writing', () => {
    const harness = createHarness([
        task('ranked-done', { status: 'completed', manualOrder: 4 }),
        task('legacy-low', { priority: 'low' }),
        task('ranked-open', { manualOrder: 1 }),
        task('legacy-high', { priority: 'high' }),
        task('legacy-done', { status: 'completed', priority: 'high' })
    ]);

    expect(projectWithoutWrites(harness, 'manual').tasks.map((item) => item.id)).toEqual([
        'ranked-open',
        'legacy-high',
        'legacy-low',
        'ranked-done',
        'legacy-done'
    ]);
});

describe('Priority comparator compatibility', () => {
    test.each([
        [
            'undefined priority as a stable tie',
            [
                task('low-first', { priority: 'low' }),
                task('undefined-second', { priority: undefined })
            ],
            ['low-first', 'undefined-second']
        ],
        [
            'invalid priority as a stable tie',
            [
                task('low-first', { priority: 'low' }),
                task('invalid-second', { priority: 'urgent' })
            ],
            ['low-first', 'invalid-second']
        ],
        [
            'undefined duration as a stable tie',
            [
                task('undefined-first', { priority: 'high', estDuration: undefined }),
                task('known-second', { priority: 'high', estDuration: 10 })
            ],
            ['undefined-first', 'known-second']
        ],
        [
            'null duration after a non-null duration',
            [
                task('null-first', { priority: 'high', estDuration: null }),
                task('known-second', { priority: 'high', estDuration: 10 })
            ],
            ['known-second', 'null-first']
        ],
        [
            'equal values in their original order',
            [
                task('z-first', { priority: 'high', estDuration: 10 }),
                task('a-second', { priority: 'high', estDuration: 10 })
            ],
            ['z-first', 'a-second']
        ]
    ])('preserves %s', (_scenario, initialTasks, expectedIds) => {
        const harness = createHarness(initialTasks);

        expect(harness.sequence.project('priority').tasks.map((item) => item.id)).toEqual(
            expectedIds
        );
    });
});

test('invalid and duplicate ranks use task ID as final tie-breaker', () => {
    const harness = createHarness([
        task('b', { manualOrder: 2 }),
        task('a', { manualOrder: 2 }),
        task('invalid', { manualOrder: -1 })
    ]);

    expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual([
        'a',
        'b',
        'invalid'
    ]);
});

test('place inserts a new task after the last incomplete task', () => {
    const harness = createHarness([
        task('first', { manualOrder: 0 }),
        task('scheduled', { type: 'scheduled', manualOrder: 99 }),
        task('done', { status: 'completed', manualOrder: 1 }),
        task('new')
    ]);
    const originalTasks = new Map(harness.getTasks().map((item) => [item.id, item]));

    const result = harness.sequence.place('new');

    expect(result.success).toBe(true);
    expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual([
        'first',
        'new',
        'done'
    ]);
    expect(changedOrders(result)).toEqual([
        { id: 'done', manualOrder: 2 },
        { id: 'new', manualOrder: 1 }
    ]);
    expect(result.task).toEqual(expect.objectContaining({ id: 'new', manualOrder: 1 }));
    expect(harness.getTasks().find((item) => item.id === 'first')).toBe(originalTasks.get('first'));
    expect(harness.getTasks().find((item) => item.id === 'scheduled')).toBe(
        originalTasks.get('scheduled')
    );
    expect(harness.getTasks().find((item) => item.id === 'scheduled').manualOrder).toBe(99);
    expect(harness.replaceTasks).toHaveBeenCalledTimes(1);
    expect(harness.persistTasks).not.toHaveBeenCalled();
    expect(harness.reloadTasks).not.toHaveBeenCalled();
});

test('place inserts before completed tasks when no incomplete task exists', () => {
    const harness = createHarness([
        task('done-a', { status: 'completed', manualOrder: 0 }),
        task('done-b', { status: 'completed', manualOrder: 1 }),
        task('new')
    ]);

    const result = harness.sequence.place('new');

    expect(result.task.manualOrder).toBe(0);
    expect(changedOrders(result)).toEqual([
        { id: 'done-a', manualOrder: 1 },
        { id: 'done-b', manualOrder: 2 },
        { id: 'new', manualOrder: 0 }
    ]);
    expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual([
        'new',
        'done-a',
        'done-b'
    ]);
});

test('place returns no changed tasks when every rank is already correct', () => {
    const harness = createHarness([
        task('first', { manualOrder: 0 }),
        task('current', { manualOrder: 1 }),
        task('done', { status: 'completed', manualOrder: 2 })
    ]);
    const originalArray = harness.getTasks();
    const originalTasks = new Map(originalArray.map((item) => [item.id, item]));

    const result = harness.sequence.place('current');

    expect(result.success).toBe(true);
    expect(result.task).toBe(originalTasks.get('current'));
    expect(result.changedTasks).toEqual([]);
    expect(harness.getTasks()).not.toBe(originalArray);
    harness.getTasks().forEach((item) => {
        expect(item).toBe(originalTasks.get(item.id));
    });
});

test('place repairs invalid and gapped ranks with exact changed tasks', () => {
    const harness = createHarness([
        task('first', { manualOrder: 0 }),
        task('invalid', { manualOrder: -1 }),
        task('done', { status: 'completed', manualOrder: 4 })
    ]);
    const originalFirst = harness.getTasks()[0];

    const result = harness.sequence.place('invalid');

    expect(changedOrders(result)).toEqual([
        { id: 'invalid', manualOrder: 1 },
        { id: 'done', manualOrder: 2 }
    ]);
    expect(harness.getTasks()[0]).toBe(originalFirst);
    expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual([
        'first',
        'invalid',
        'done'
    ]);
});

test('place normalizes mixed ranked and unranked tasks exactly', () => {
    const harness = createHarness([
        task('ranked-open', { manualOrder: 5 }),
        task('legacy-low', { priority: 'low' }),
        task('ranked-done', { status: 'completed', manualOrder: 9 }),
        task('legacy-done', { status: 'completed', priority: 'high' }),
        task('new')
    ]);

    const result = harness.sequence.place('new');

    expect(changedOrders(result)).toEqual([
        { id: 'ranked-open', manualOrder: 0 },
        { id: 'legacy-low', manualOrder: 1 },
        { id: 'ranked-done', manualOrder: 3 },
        { id: 'legacy-done', manualOrder: 4 },
        { id: 'new', manualOrder: 2 }
    ]);
    expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual([
        'ranked-open',
        'legacy-low',
        'new',
        'ranked-done',
        'legacy-done'
    ]);
});

test('ranked completed tasks retain their manual position', () => {
    const harness = createHarness([
        task('a', { manualOrder: 0 }),
        task('done', { status: 'completed', manualOrder: 1 }),
        task('b', { manualOrder: 2 })
    ]);

    expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual([
        'a',
        'done',
        'b'
    ]);
});

test('invalid modes fall back to the non-writing Priority projection', () => {
    const harness = createHarness([
        task('low-ranked', { priority: 'low', manualOrder: 0 }),
        task('high-ranked', { priority: 'high', manualOrder: 1 })
    ]);

    const projection = harness.sequence.project('unknown');

    expect(projection.tasks.map((item) => item.id)).toEqual(['high-ranked', 'low-ranked']);
    expect(projection.movementByTaskId.get('high-ranked')).toEqual({
        position: 1,
        total: 2,
        canMoveUp: false,
        canMoveDown: false
    });
    expect(harness.persistTasks).not.toHaveBeenCalled();
});

test('manual projection provides one-based movement boundaries', () => {
    const harness = createHarness([
        task('first', { manualOrder: 0 }),
        task('middle', { manualOrder: 1 }),
        task('last', { manualOrder: 2 })
    ]);

    const { movementByTaskId } = harness.sequence.project('manual');

    expect(movementByTaskId).toEqual(
        new Map([
            ['first', { position: 1, total: 3, canMoveUp: false, canMoveDown: true }],
            ['middle', { position: 2, total: 3, canMoveUp: true, canMoveDown: true }],
            ['last', { position: 3, total: 3, canMoveUp: true, canMoveDown: false }]
        ])
    );
});

test.each([
    ['missing task', [task('existing')], 'missing'],
    ['scheduled task', [task('scheduled', { type: 'scheduled' })], 'scheduled']
])('place rejects a %s without changing manager-owned memory', (_label, initialTasks, taskId) => {
    const harness = createHarness(initialTasks);
    const before = harness.getTasks();

    expect(harness.sequence.place(taskId)).toEqual({
        success: false,
        code: 'not-unscheduled',
        changedTasks: []
    });
    expect(harness.getTasks()).toBe(before);
    expect(harness.persistTasks).not.toHaveBeenCalled();
    expect(harness.reloadTasks).not.toHaveBeenCalled();
});

describe('move', () => {
    test('exposes the optimistic position before persistence settles', async () => {
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
        expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual([
            'c',
            'a',
            'b'
        ]);
        expect(harness.persistTasks).toHaveBeenCalledTimes(1);
        await expect(operation.settled).resolves.toEqual({ success: true });
    });

    test.each([
        ['up', 'c', { kind: 'up' }, ['a', 'c', 'b'], 2],
        ['down', 'a', { kind: 'down' }, ['b', 'a', 'c'], 2],
        ['top', 'c', { kind: 'top' }, ['c', 'a', 'b'], 1],
        ['bottom', 'a', { kind: 'bottom' }, ['b', 'c', 'a'], 3],
        ['before a task', 'c', { kind: 'before', taskId: 'b' }, ['a', 'c', 'b'], 2],
        ['before the end', 'a', { kind: 'before', taskId: null }, ['b', 'c', 'a'], 3]
    ])(
        'supports %s destinations',
        async (_label, taskId, destination, expectedOrder, expectedPosition) => {
            const harness = createHarness([
                task('a', { manualOrder: 0 }),
                task('b', { manualOrder: 1 }),
                task('c', { manualOrder: 2 })
            ]);

            const operation = harness.sequence.move(taskId, destination);

            expect(operation).toMatchObject({
                success: true,
                changed: true,
                taskId,
                position: expectedPosition,
                total: 3
            });
            expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual(
                expectedOrder
            );
            await expect(operation.settled).resolves.toEqual({ success: true });
        }
    );

    test('resolves before a task by identity rather than a stale index', async () => {
        const harness = createHarness([
            task('a', { manualOrder: 0 }),
            task('b', { manualOrder: 1 }),
            task('c', { manualOrder: 2 })
        ]);

        const operation = harness.sequence.move('a', { kind: 'before', taskId: 'c' });

        expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual([
            'b',
            'a',
            'c'
        ]);
        await operation.settled;
    });

    test('serializes accepted moves until persistence settles', async () => {
        const firstWrite = deferred();
        const harness = createHarness([
            task('a', { manualOrder: 0 }),
            task('b', { manualOrder: 1 }),
            task('c', { manualOrder: 2 })
        ]);
        harness.persistTasks
            .mockReturnValueOnce(firstWrite.promise)
            .mockResolvedValueOnce({ succeededIds: ['a', 'b'] });

        const first = harness.sequence.move('c', { kind: 'top' });
        const optimisticTasks = harness.getTasks();
        const overlapping = harness.sequence.move('a', { kind: 'bottom' });

        expect(overlapping).toEqual({ success: false, code: 'unavailable' });
        expect(harness.getTasks()).toBe(optimisticTasks);
        expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual([
            'c',
            'a',
            'b'
        ]);
        expect(harness.persistTasks).toHaveBeenCalledTimes(1);

        firstWrite.resolve({ succeededIds: ['a', 'b', 'c'] });
        await expect(first.settled).resolves.toEqual({ success: true });

        const afterSettlement = harness.sequence.move('a', { kind: 'bottom' });
        expect(afterSettlement).toMatchObject({ success: true, changed: true, position: 3 });
        expect(harness.persistTasks).toHaveBeenCalledTimes(2);
        await afterSettlement.settled;
    });

    test('accepts another move after a failed transaction settles', async () => {
        const firstWrite = deferred();
        const harness = createHarness([
            task('a', { manualOrder: 0 }),
            task('b', { manualOrder: 1 })
        ]);
        harness.persistTasks
            .mockReturnValueOnce(firstWrite.promise)
            .mockResolvedValueOnce({ succeededIds: ['a', 'b'] });

        const first = harness.sequence.move('b', { kind: 'top' });
        expect(harness.sequence.move('a', { kind: 'bottom' })).toEqual({
            success: false,
            code: 'unavailable'
        });

        firstWrite.reject(new Error('offline'));
        await expect(first.settled).resolves.toMatchObject({
            success: false,
            rolledBack: true
        });

        const retry = harness.sequence.move('b', { kind: 'top' });
        expect(retry).toMatchObject({ success: true, changed: true });
        await retry.settled;
    });

    test('writes exactly the normalized tasks changed by a sparse legacy move', async () => {
        const scheduled = task('scheduled', { type: 'scheduled', manualOrder: 99 });
        const fixed = task('fixed', { manualOrder: 0 });
        const shifted = task('shifted', { manualOrder: 1 });
        const legacy = task('legacy');
        const tail = task('tail', { status: 'completed', manualOrder: 3 });
        const harness = createHarness([scheduled, fixed, shifted, legacy, tail]);

        const operation = harness.sequence.move('legacy', { kind: 'up' });

        expect(harness.persistTasks).toHaveBeenNthCalledWith(1, [
            { ...shifted, manualOrder: 2 },
            { ...legacy, manualOrder: 1 }
        ]);
        expect(operation).toMatchObject({
            success: true,
            changed: true,
            taskId: 'legacy',
            position: 2,
            total: 4
        });
        await operation.settled;
    });

    test.each([
        ['top boundary', 'a', { kind: 'top' }, 1],
        ['up boundary', 'a', { kind: 'up' }, 1],
        ['bottom boundary', 'b', { kind: 'bottom' }, 2],
        ['down boundary', 'b', { kind: 'down' }, 2],
        ['before itself', 'a', { kind: 'before', taskId: 'a' }, 1]
    ])(
        'returns a settled no-op at the %s without persistence',
        async (_label, taskId, destination, position) => {
            const harness = createHarness([
                task('a', { manualOrder: 0 }),
                task('b', { manualOrder: 1 })
            ]);
            const before = harness.getTasks();

            const operation = harness.sequence.move(taskId, destination);

            expect(operation).toMatchObject({
                success: true,
                changed: false,
                taskId,
                position,
                total: 2
            });
            await expect(operation.settled).resolves.toEqual({ success: true });
            expect(harness.getTasks()).toBe(before);
            expect(harness.replaceTasks).not.toHaveBeenCalled();
            expect(harness.persistTasks).not.toHaveBeenCalled();
        }
    );

    test.each([
        ['missing task', 'missing', { kind: 'top' }, 'not-found'],
        ['scheduled task', 'scheduled', { kind: 'top' }, 'not-unscheduled'],
        ['inline-editing task', 'editing', { kind: 'top' }, 'unavailable'],
        ['unknown destination', 'available', { kind: 'sideways' }, 'invalid-destination'],
        [
            'missing before target',
            'available',
            { kind: 'before', taskId: 'missing' },
            'invalid-destination'
        ],
        ['omitted before target', 'available', { kind: 'before' }, 'invalid-destination'],
        ['omitted destination', 'available', undefined, 'invalid-destination']
    ])('returns a structured failure for a %s', (_label, taskId, destination, code) => {
        const harness = createHarness([
            task('scheduled', { type: 'scheduled' }),
            task('editing', { isEditingInline: true }),
            task('available')
        ]);
        const before = harness.getTasks();

        expect(harness.sequence.move(taskId, destination)).toEqual({ success: false, code });
        expect(harness.getTasks()).toBe(before);
        expect(harness.replaceTasks).not.toHaveBeenCalled();
        expect(harness.persistTasks).not.toHaveBeenCalled();
    });

    test('a full persistence failure restores memory without compensation', async () => {
        const harness = createHarness([
            task('a', { manualOrder: 0 }),
            task('b', { manualOrder: 1 })
        ]);
        harness.persistTasks.mockRejectedValueOnce(new Error('offline'));

        const operation = harness.sequence.move('b', { kind: 'top' });

        await expect(operation.settled).resolves.toEqual({
            success: false,
            code: 'persist-failed',
            reason: 'offline',
            rolledBack: true,
            reloaded: false
        });
        expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual(['a', 'b']);
        expect(harness.persistTasks).toHaveBeenCalledTimes(1);
        expect(harness.reloadTasks).not.toHaveBeenCalled();
    });

    test('rollback restores missing order fields while preserving concurrent task fields', async () => {
        const harness = createHarness([task('a'), task('b')]);
        harness.persistTasks.mockRejectedValueOnce(new Error('offline'));

        const operation = harness.sequence.move('b', { kind: 'top' });
        harness.getTasks().find((item) => item.id === 'a').description = 'concurrent edit';
        await operation.settled;

        expect(harness.getTasks().find((item) => item.id === 'a').description).toBe(
            'concurrent edit'
        );
        harness.getTasks().forEach((item) => {
            expect(Object.prototype.hasOwnProperty.call(item, 'manualOrder')).toBe(false);
        });
    });

    test('a partial failure restores memory and compensates successful documents', async () => {
        const harness = createHarness([
            task('a', { manualOrder: 0 }),
            task('b', { manualOrder: 1 })
        ]);
        harness.persistTasks
            .mockRejectedValueOnce(Object.assign(new Error('partial'), { succeededIds: ['a'] }))
            .mockResolvedValueOnce({ succeededIds: ['a'] });

        const operation = harness.sequence.move('b', { kind: 'top' });
        harness.getTasks().find((item) => item.id === 'a').status = 'completed';

        await expect(operation.settled).resolves.toEqual({
            success: false,
            code: 'persist-failed',
            reason: 'partial',
            rolledBack: true,
            reloaded: false
        });
        expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual(['a', 'b']);
        expect(harness.getTasks().find((item) => item.id === 'a').status).toBe('completed');
        expect(harness.persistTasks).toHaveBeenCalledTimes(2);
        expect(harness.persistTasks.mock.calls[1][0]).toEqual([
            expect.objectContaining({ id: 'a', manualOrder: 0, status: 'completed' })
        ]);
        expect(harness.reloadTasks).not.toHaveBeenCalled();
    });

    test('deduplicates successful IDs before compensating restored documents', async () => {
        const harness = createHarness([
            task('a', { manualOrder: 0 }),
            task('b', { manualOrder: 1 })
        ]);
        harness.persistTasks
            .mockRejectedValueOnce(
                Object.assign(new Error('partial'), { succeededIds: ['a', 'a'] })
            )
            .mockResolvedValueOnce({ succeededIds: ['a'] });

        const operation = harness.sequence.move('b', { kind: 'top' });

        await expect(operation.settled).resolves.toMatchObject({
            success: false,
            rolledBack: true,
            reloaded: false
        });
        expect(harness.persistTasks).toHaveBeenCalledTimes(2);
        expect(harness.persistTasks.mock.calls[1][0]).toEqual([
            expect.objectContaining({ id: 'a', manualOrder: 0 })
        ]);
        expect(harness.reloadTasks).not.toHaveBeenCalled();
    });

    test('foreign successful IDs trigger durable reload without subset compensation', async () => {
        const harness = createHarness([
            task('a', { manualOrder: 0 }),
            task('b', { manualOrder: 1 })
        ]);
        harness.persistTasks.mockRejectedValueOnce(
            Object.assign(new Error('partial'), { succeededIds: ['a', 'foreign'] })
        );
        harness.reloadTasks.mockResolvedValueOnce([
            task('a', { manualOrder: 1 }),
            task('b', { manualOrder: 0 })
        ]);

        const operation = harness.sequence.move('b', { kind: 'top' });

        await expect(operation.settled).resolves.toMatchObject({
            success: false,
            rolledBack: false,
            reloaded: true,
            recoveryFailed: false
        });
        expect(harness.persistTasks).toHaveBeenCalledTimes(1);
        expect(harness.reloadTasks).toHaveBeenCalledTimes(1);
        expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual(['b', 'a']);
    });

    test('a deleted successful document triggers reload instead of partial compensation', async () => {
        const firstWrite = deferred();
        const harness = createHarness([
            task('a', { manualOrder: 0 }),
            task('b', { manualOrder: 1 })
        ]);
        harness.persistTasks.mockReturnValueOnce(firstWrite.promise);
        harness.reloadTasks.mockResolvedValueOnce([task('b', { manualOrder: 0 })]);

        const operation = harness.sequence.move('b', { kind: 'top' });
        harness.replaceTasks(harness.getTasks().filter((item) => item.id !== 'a'));
        firstWrite.reject(Object.assign(new Error('partial'), { succeededIds: ['a', 'b'] }));

        await expect(operation.settled).resolves.toMatchObject({
            success: false,
            rolledBack: false,
            reloaded: true
        });
        expect(harness.persistTasks).toHaveBeenCalledTimes(1);
        expect(harness.reloadTasks).toHaveBeenCalledTimes(1);
        expect(harness.getTasks()).toEqual([task('b', { manualOrder: 0 })]);
    });

    test('failed anomaly reload retains restored memory and resolves recovery failure', async () => {
        const firstWrite = deferred();
        const harness = createHarness([
            task('a', { manualOrder: 0 }),
            task('b', { manualOrder: 1 })
        ]);
        harness.persistTasks.mockReturnValueOnce(firstWrite.promise);
        harness.reloadTasks.mockRejectedValueOnce(new Error('reload failed'));

        const operation = harness.sequence.move('b', { kind: 'top' });
        harness.replaceTasks(harness.getTasks().filter((item) => item.id !== 'a'));
        firstWrite.reject(Object.assign(new Error('partial'), { succeededIds: ['a'] }));

        await expect(operation.settled).resolves.toEqual({
            success: false,
            code: 'persist-failed',
            reason: 'reload failed',
            rolledBack: true,
            reloaded: false,
            recoveryFailed: true
        });
        expect(harness.persistTasks).toHaveBeenCalledTimes(1);
        expect(harness.getTasks()).toEqual([task('b', { manualOrder: 1 })]);
    });

    test('failed compensation reloads durable local state', async () => {
        const harness = createHarness([
            task('a', { manualOrder: 0 }),
            task('b', { manualOrder: 1 })
        ]);
        harness.persistTasks
            .mockRejectedValueOnce(Object.assign(new Error('partial'), { succeededIds: ['a'] }))
            .mockRejectedValueOnce(new Error('compensation failed'));
        harness.reloadTasks.mockResolvedValueOnce([
            task('a', { manualOrder: 1 }),
            task('b', { manualOrder: 0 })
        ]);

        const operation = harness.sequence.move('b', { kind: 'top' });

        await expect(operation.settled).resolves.toEqual({
            success: false,
            code: 'persist-failed',
            reason: 'compensation failed',
            rolledBack: false,
            reloaded: true,
            recoveryFailed: false
        });
        expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual(['b', 'a']);
        expect(harness.reloadTasks).toHaveBeenCalledTimes(1);
    });

    test('failed compensation and reload resolve a recovery failure', async () => {
        const harness = createHarness([
            task('a', { manualOrder: 0 }),
            task('b', { manualOrder: 1 })
        ]);
        harness.persistTasks
            .mockRejectedValueOnce(Object.assign(new Error('partial'), { succeededIds: ['a'] }))
            .mockRejectedValueOnce(new Error('compensation failed'));
        harness.reloadTasks.mockRejectedValueOnce(new Error('reload failed'));

        const operation = harness.sequence.move('b', { kind: 'top' });

        await expect(operation.settled).resolves.toEqual({
            success: false,
            code: 'persist-failed',
            reason: 'reload failed',
            rolledBack: true,
            reloaded: false,
            recoveryFailed: true
        });
        expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual(['a', 'b']);
    });
});
