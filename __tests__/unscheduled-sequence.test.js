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

test('move is reserved for the movement task', () => {
    const harness = createHarness([]);

    expect(() => harness.sequence.move()).toThrow('Sequence movement is added in Task 3.');
});
