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

    expect(harness.sequence.project('priority').tasks.map((item) => item.id)).toEqual([
        'high-short',
        'high-long',
        'low',
        'done'
    ]);
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

    expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual([
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

    expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual([
        'a',
        'b',
        'invalid'
    ]);
});

test('place inserts a new task after the last incomplete task', () => {
    const harness = createHarness([
        task('first', { manualOrder: 0 }),
        task('done', { status: 'completed', manualOrder: 1 }),
        task('new')
    ]);

    const result = harness.sequence.place('new');

    expect(result.success).toBe(true);
    expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual([
        'first',
        'new',
        'done'
    ]);
    expect(result.changedTasks.map((item) => item.id)).toEqual(
        expect.arrayContaining(['new', 'done'])
    );
    expect(result.task).toEqual(expect.objectContaining({ id: 'new', manualOrder: 1 }));
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
    expect(harness.sequence.project('manual').tasks.map((item) => item.id)).toEqual([
        'new',
        'done-a',
        'done-b'
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
