const PRIORITY_RANK = Object.freeze({ high: 0, medium: 1, low: 2 });
const VALID_MODES = new Set(['priority', 'manual']);

function compareIds(left, right) {
    return String(left.id).localeCompare(String(right.id));
}

function hasValidManualOrder(task) {
    return Number.isFinite(task.manualOrder) && task.manualOrder >= 0;
}

function comparePriority(left, right) {
    const completion = Number(left.status === 'completed') - Number(right.status === 'completed');
    if (completion !== 0) return completion;

    const priority =
        (PRIORITY_RANK[left.priority] ?? PRIORITY_RANK.medium) -
        (PRIORITY_RANK[right.priority] ?? PRIORITY_RANK.medium);
    if (priority !== 0) return priority;

    const leftHasDuration = Number.isFinite(left.estDuration);
    const rightHasDuration = Number.isFinite(right.estDuration);
    if (leftHasDuration && rightHasDuration && left.estDuration !== right.estDuration) {
        return left.estDuration - right.estDuration;
    }
    if (leftHasDuration !== rightHasDuration) return leftHasDuration ? -1 : 1;

    return 0;
}

function projectPriority(tasks) {
    return tasks.filter((task) => task.type === 'unscheduled').sort(comparePriority);
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
        .sort((left, right) => comparePriority(left, right) || compareIds(left, right));
    const legacyCompleted = unscheduled
        .filter((task) => !hasValidManualOrder(task) && task.status === 'completed')
        .sort((left, right) => comparePriority(left, right) || compareIds(left, right));
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
        if (
            task.type !== 'unscheduled' ||
            !orderById.has(task.id) ||
            task.manualOrder === orderById.get(task.id)
        ) {
            return task;
        }

        const changed = { ...task, manualOrder: orderById.get(task.id) };
        changedTasks.push(changed);
        return changed;
    });

    return { nextTasks, changedTasks };
}

/**
 * Create the ordering interface for the manager-owned Unscheduled task sequence.
 * @param {Object} adapters - Task-state and persistence adapters.
 * @returns {Object} Projection, placement, and movement operations.
 */
export function createUnscheduledSequence({
    readTasks,
    replaceTasks,
    persistTasks: _persistTasks,
    reloadTasks: _reloadTasks
}) {
    function project(mode = 'priority') {
        const validMode = VALID_MODES.has(mode) ? mode : 'priority';
        const ordered =
            validMode === 'manual' ? projectManual(readTasks()) : projectPriority(readTasks());

        return {
            tasks: ordered,
            movementByTaskId: movementFor(ordered, validMode)
        };
    }

    function place(taskId) {
        const allTasks = readTasks();
        const task = allTasks.find((item) => item.id === taskId);
        if (!task || task.type !== 'unscheduled') {
            return { success: false, code: 'not-unscheduled', changedTasks: [] };
        }

        const ordered = projectManual(allTasks).filter((item) => item.id !== taskId);
        const insertionIndex = ordered.reduce(
            (last, item, index) => (item.status === 'completed' ? last : index + 1),
            0
        );
        ordered.splice(insertionIndex, 0, task);

        const replacement = replaceOrderFields(allTasks, ordered);
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
