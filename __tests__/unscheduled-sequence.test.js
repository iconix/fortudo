import {
    createUnscheduledSequence,
    UNSCHEDULED_SEQUENCE_CONFIG_ID,
    UNSCHEDULED_SEQUENCE_SCHEMA_VERSION
} from '../public/js/tasks/unscheduled-sequence.js';

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

function sequenceDocument(orderedTaskIds, overrides = {}) {
    return {
        id: UNSCHEDULED_SEQUENCE_CONFIG_ID,
        schemaVersion: UNSCHEDULED_SEQUENCE_SCHEMA_VERSION,
        orderedTaskIds,
        ...overrides
    };
}

function createHarness(initialTasks, initialSequence = null) {
    let tasks = initialTasks.map((item) => ({ ...item }));
    let sequenceState = initialSequence
        ? {
              ...initialSequence,
              orderedTaskIds: Array.isArray(initialSequence.orderedTaskIds)
                  ? [...initialSequence.orderedTaskIds]
                  : initialSequence.orderedTaskIds
          }
        : null;
    const replaceSequence = jest.fn((nextSequence) => {
        sequenceState = nextSequence
            ? { ...nextSequence, orderedTaskIds: [...nextSequence.orderedTaskIds] }
            : null;
    });
    const persistSequence = jest.fn(() => Promise.resolve());
    const reloadSequence = jest.fn(() => Promise.resolve(sequenceState));
    const sequence = createUnscheduledSequence({
        readTasks: () => tasks,
        readSequence: () => sequenceState,
        replaceSequence,
        persistSequence,
        reloadSequence
    });

    return {
        sequence,
        getTasks: () => tasks,
        setTasks(nextTasks) {
            tasks = nextTasks;
        },
        getSequence: () => sequenceState,
        replaceSequence,
        persistSequence,
        reloadSequence
    };
}

function ids(harness, mode = 'manual') {
    return harness.sequence.project(mode).tasks.map((item) => item.id);
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

test('Priority preserves automatic ordering and never writes sequence or task state', () => {
    const initialTasks = [
        task('low', { priority: 'low', estDuration: 10 }),
        task('done', { priority: 'high', status: 'completed' }),
        task('high-long', { priority: 'high', estDuration: 60 }),
        task('high-short', { priority: 'high', estDuration: 15 })
    ];
    const harness = createHarness(initialTasks, sequenceDocument(['low', 'done']));
    const originalTasks = harness.getTasks();
    const originalTaskObjects = [...originalTasks];
    const originalSequence = harness.getSequence();

    expect(ids(harness, 'priority')).toEqual(['high-short', 'high-long', 'low', 'done']);
    expect(harness.getTasks()).toBe(originalTasks);
    harness.getTasks().forEach((item, index) => expect(item).toBe(originalTaskObjects[index]));
    expect(harness.getSequence()).toBe(originalSequence);
    expect(harness.replaceSequence).not.toHaveBeenCalled();
    expect(harness.persistSequence).not.toHaveBeenCalled();
});

describe('manual projection', () => {
    test('derives the legacy manual order without writing when no sequence document exists', () => {
        const harness = createHarness([
            task('ranked-done', { status: 'completed', manualOrder: 4 }),
            task('legacy-low', { priority: 'low' }),
            task('ranked-open', { manualOrder: 1 }),
            task('legacy-high', { priority: 'high' }),
            task('legacy-done', { status: 'completed', priority: 'high' })
        ]);

        expect(ids(harness)).toEqual([
            'ranked-open',
            'legacy-high',
            'legacy-low',
            'ranked-done',
            'legacy-done'
        ]);
        expect(harness.replaceSequence).not.toHaveBeenCalled();
        expect(harness.persistSequence).not.toHaveBeenCalled();
    });

    test('uses the sequence document instead of legacy task ranks', () => {
        const harness = createHarness(
            [
                task('a', { manualOrder: 0 }),
                task('b', { manualOrder: 1 }),
                task('c', { manualOrder: 2 })
            ],
            sequenceDocument(['c', 'a', 'b'])
        );

        expect(ids(harness)).toEqual(['c', 'a', 'b']);
        expect(harness.getTasks().map((item) => item.manualOrder)).toEqual([0, 1, 2]);
    });

    test('reconciles duplicate, stale, scheduled, and unlisted identifiers safely', () => {
        const harness = createHarness(
            [
                task('done-first', { status: 'completed' }),
                task('open-a'),
                task('open-new', { priority: 'high' }),
                task('done-new', { status: 'completed' }),
                task('scheduled', { type: 'scheduled' })
            ],
            sequenceDocument(['done-first', 'missing', 'scheduled', 'open-a', 'open-a'])
        );

        expect(ids(harness)).toEqual(['done-first', 'open-a', 'open-new', 'done-new']);
    });

    test('invalid sequence documents fall back to legacy ordering', () => {
        const harness = createHarness(
            [task('a', { manualOrder: 1 }), task('b', { manualOrder: 0 })],
            { id: UNSCHEDULED_SEQUENCE_CONFIG_ID, schemaVersion: 1, orderedTaskIds: 'invalid' }
        );

        expect(ids(harness)).toEqual(['b', 'a']);
    });

    test('keeps completed tasks in their stored sequence position', () => {
        const harness = createHarness(
            [task('a'), task('done', { status: 'completed' }), task('b')],
            sequenceDocument(['a', 'done', 'b'])
        );

        expect(ids(harness)).toEqual(['a', 'done', 'b']);
    });

    test('provides one-based movement boundaries', () => {
        const harness = createHarness(
            [task('first'), task('middle'), task('last')],
            sequenceDocument(['first', 'middle', 'last'])
        );

        expect(harness.sequence.project('manual').movementByTaskId).toEqual(
            new Map([
                ['first', { position: 1, total: 3, canMoveUp: false, canMoveDown: true }],
                ['middle', { position: 2, total: 3, canMoveUp: true, canMoveDown: true }],
                ['last', { position: 3, total: 3, canMoveUp: true, canMoveDown: false }]
            ])
        );
    });

    test('invalid modes retain the non-writing Priority fallback', () => {
        const harness = createHarness(
            [task('low', { priority: 'low' }), task('high', { priority: 'high' })],
            sequenceDocument(['low', 'high'])
        );

        expect(ids(harness, 'unknown')).toEqual(['high', 'low']);
        expect(harness.persistSequence).not.toHaveBeenCalled();
    });
});

describe('place', () => {
    test('persists one sequence document after the last incomplete task without mutating tasks', async () => {
        const initialTasks = [
            task('first'),
            task('scheduled', { type: 'scheduled', manualOrder: 99 }),
            task('done', { status: 'completed' }),
            task('new')
        ];
        const harness = createHarness(initialTasks, sequenceDocument(['first', 'done']));
        const originalTasks = harness.getTasks();
        const originalTaskObjects = [...originalTasks];

        const operation = harness.sequence.place('new');

        expect(operation).toMatchObject({ success: true, changed: true, taskId: 'new' });
        expect(ids(harness)).toEqual(['first', 'new', 'done']);
        expect(harness.persistSequence).toHaveBeenCalledWith(
            sequenceDocument(['first', 'new', 'done'])
        );
        expect(harness.getTasks()).toBe(originalTasks);
        harness.getTasks().forEach((item, index) => expect(item).toBe(originalTaskObjects[index]));
        await expect(operation.settled).resolves.toEqual({ success: true });
    });

    test('inserts before completed tasks when there is no incomplete task', async () => {
        const harness = createHarness(
            [
                task('done-a', { status: 'completed' }),
                task('done-b', { status: 'completed' }),
                task('new')
            ],
            sequenceDocument(['done-a', 'done-b'])
        );

        const operation = harness.sequence.place('new');

        expect(ids(harness)).toEqual(['new', 'done-a', 'done-b']);
        await operation.settled;
    });

    test('materializes legacy ranks into the sequence document without rewriting tasks', async () => {
        const harness = createHarness([
            task('first', { manualOrder: 0 }),
            task('done', { status: 'completed', manualOrder: 1 }),
            task('new')
        ]);
        const before = JSON.parse(JSON.stringify(harness.getTasks()));

        const operation = harness.sequence.place('new');

        expect(harness.persistSequence).toHaveBeenCalledWith(
            sequenceDocument(['first', 'new', 'done'])
        );
        expect(harness.getTasks()).toEqual(before);
        await operation.settled;
    });

    test('places several tasks in caller order with one sequence write', async () => {
        const harness = createHarness(
            [
                task('existing'),
                task('done', { status: 'completed' }),
                task('new-later'),
                task('new-earlier')
            ],
            sequenceDocument(['existing', 'done'])
        );

        const operation = harness.sequence.placeMany(['new-earlier', 'new-later']);

        expect(operation).toMatchObject({ success: true, changed: true });
        expect(ids(harness)).toEqual(['existing', 'new-earlier', 'new-later', 'done']);
        expect(harness.persistSequence).toHaveBeenCalledTimes(1);
        expect(harness.persistSequence).toHaveBeenCalledWith(
            sequenceDocument(['existing', 'new-earlier', 'new-later', 'done'])
        );
        await expect(operation.settled).resolves.toEqual({ success: true });
    });

    test('returns a settled no-op when the task is already durably placed', async () => {
        const harness = createHarness(
            [task('first'), task('current'), task('done', { status: 'completed' })],
            sequenceDocument(['first', 'current', 'done'])
        );

        const operation = harness.sequence.place('current');

        expect(operation).toMatchObject({ success: true, changed: false, taskId: 'current' });
        await expect(operation.settled).resolves.toEqual({ success: true });
        expect(harness.persistSequence).not.toHaveBeenCalled();
        expect(harness.replaceSequence).not.toHaveBeenCalled();
    });

    test.each([
        ['missing task', [task('existing')], 'missing'],
        ['scheduled task', [task('scheduled', { type: 'scheduled' })], 'scheduled']
    ])('rejects a %s without writing', (_label, initialTasks, taskId) => {
        const harness = createHarness(initialTasks);

        expect(harness.sequence.place(taskId)).toEqual({
            success: false,
            code: 'not-unscheduled'
        });
        expect(harness.persistSequence).not.toHaveBeenCalled();
        expect(harness.replaceSequence).not.toHaveBeenCalled();
    });
});

describe('move', () => {
    test('exposes the optimistic sequence before its single-document write settles', async () => {
        const pending = deferred();
        const harness = createHarness(
            [task('a'), task('b'), task('c')],
            sequenceDocument(['a', 'b', 'c'])
        );
        harness.persistSequence.mockReturnValueOnce(pending.promise);

        const operation = harness.sequence.move('c', { kind: 'top' });

        expect(operation).toMatchObject({
            success: true,
            changed: true,
            taskId: 'c',
            position: 1,
            total: 3
        });
        expect(ids(harness)).toEqual(['c', 'a', 'b']);
        expect(harness.persistSequence).toHaveBeenCalledWith(sequenceDocument(['c', 'a', 'b']));
        expect(harness.getTasks().map((item) => item.id)).toEqual(['a', 'b', 'c']);

        pending.resolve();
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
            const harness = createHarness(
                [task('a'), task('b'), task('c')],
                sequenceDocument(['a', 'b', 'c'])
            );

            const operation = harness.sequence.move(taskId, destination);

            expect(operation).toMatchObject({
                success: true,
                changed: true,
                taskId,
                position: expectedPosition,
                total: 3
            });
            expect(ids(harness)).toEqual(expectedOrder);
            await expect(operation.settled).resolves.toEqual({ success: true });
        }
    );

    test('serializes accepted sequence writes until persistence settles', async () => {
        const pending = deferred();
        const harness = createHarness(
            [task('a'), task('b'), task('c')],
            sequenceDocument(['a', 'b', 'c'])
        );
        harness.persistSequence.mockReturnValueOnce(pending.promise);

        const first = harness.sequence.move('c', { kind: 'top' });
        expect(harness.sequence.move('a', { kind: 'bottom' })).toEqual({
            success: false,
            code: 'unavailable'
        });
        expect(harness.sequence.place('b')).toEqual({ success: false, code: 'unavailable' });
        expect(harness.persistSequence).toHaveBeenCalledTimes(1);

        pending.resolve();
        await first.settled;

        const next = harness.sequence.move('a', { kind: 'bottom' });
        expect(next).toMatchObject({ success: true, changed: true });
        await next.settled;
    });

    test.each([
        ['top boundary', 'a', { kind: 'top' }, 1],
        ['up boundary', 'a', { kind: 'up' }, 1],
        ['bottom boundary', 'b', { kind: 'bottom' }, 2],
        ['down boundary', 'b', { kind: 'down' }, 2],
        ['before itself', 'a', { kind: 'before', taskId: 'a' }, 1]
    ])('returns a settled no-op at the %s', async (_label, taskId, destination, position) => {
        const harness = createHarness([task('a'), task('b')], sequenceDocument(['a', 'b']));

        const operation = harness.sequence.move(taskId, destination);

        expect(operation).toMatchObject({
            success: true,
            changed: false,
            taskId,
            position,
            total: 2
        });
        await expect(operation.settled).resolves.toEqual({ success: true });
        expect(harness.persistSequence).not.toHaveBeenCalled();
    });

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
        const harness = createHarness(
            [
                task('scheduled', { type: 'scheduled' }),
                task('editing', { isEditingInline: true }),
                task('available')
            ],
            sequenceDocument(['editing', 'available'])
        );

        expect(harness.sequence.move(taskId, destination)).toEqual({ success: false, code });
        expect(harness.persistSequence).not.toHaveBeenCalled();
    });

    test('reloads the durable sequence after a failed write without touching task fields', async () => {
        const harness = createHarness([task('a'), task('b')], sequenceDocument(['a', 'b']));
        harness.persistSequence.mockRejectedValueOnce(new Error('offline'));
        harness.reloadSequence.mockResolvedValueOnce(sequenceDocument(['a', 'b']));

        const operation = harness.sequence.move('b', { kind: 'top' });
        harness.getTasks().find((item) => item.id === 'a').description = 'concurrent edit';

        await expect(operation.settled).resolves.toEqual({
            success: false,
            code: 'persist-failed',
            reason: 'offline',
            rolledBack: false,
            reloaded: true,
            recoveryFailed: false
        });
        expect(ids(harness)).toEqual(['a', 'b']);
        expect(harness.getTasks().find((item) => item.id === 'a').description).toBe(
            'concurrent edit'
        );
    });

    test('restores the prior in-memory sequence if both persistence and reload fail', async () => {
        const before = sequenceDocument(['a', 'b']);
        const harness = createHarness([task('a'), task('b')], before);
        harness.persistSequence.mockRejectedValueOnce(new Error('offline'));
        harness.reloadSequence.mockRejectedValueOnce(new Error('reload failed'));

        const operation = harness.sequence.move('b', { kind: 'top' });

        await expect(operation.settled).resolves.toEqual({
            success: false,
            code: 'persist-failed',
            reason: 'reload failed',
            rolledBack: true,
            reloaded: false,
            recoveryFailed: true
        });
        expect(harness.getSequence()).toEqual(before);
        expect(ids(harness)).toEqual(['a', 'b']);
    });
});

test('hydrate replaces sequence state from sync without writing', () => {
    const harness = createHarness(
        [task('a'), task('b'), task('c')],
        sequenceDocument(['a', 'b', 'c'])
    );

    harness.sequence.hydrate(sequenceDocument(['c', 'b', 'a']));

    expect(ids(harness)).toEqual(['c', 'b', 'a']);
    expect(harness.persistSequence).not.toHaveBeenCalled();
});
