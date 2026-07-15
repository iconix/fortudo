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

    const priority = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (priority !== 0) return priority;

    if (left.estDuration !== null && right.estDuration !== null) {
        return left.estDuration - right.estDuration;
    }
    if (left.estDuration !== null) return -1;
    if (right.estDuration !== null) return 1;

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
            if (destination.taskId === undefined) return null;
            const targetIndex = ordered.findIndex((task) => task.id === destination.taskId);
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

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Create the ordering interface for the manager-owned Unscheduled task sequence.
 * @param {Object} adapters - Task-state and persistence adapters.
 * @returns {Object} Projection, placement, and movement operations.
 */
export function createUnscheduledSequence({ readTasks, replaceTasks, persistTasks, reloadTasks }) {
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

    function move(taskId, destination) {
        const currentTasks = readTasks();
        const source = currentTasks.find((task) => task.id === taskId);
        if (!source) return { success: false, code: 'not-found' };
        if (source.type !== 'unscheduled') return { success: false, code: 'not-unscheduled' };
        if (source.isEditingInline) return { success: false, code: 'unavailable' };

        const ordered = projectManual(currentTasks);
        const sourceIndex = ordered.findIndex((task) => task.id === taskId);
        const destinationIndex = resolveDestination(ordered, sourceIndex, destination);
        if (destinationIndex === null) {
            return { success: false, code: 'invalid-destination' };
        }
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
            } catch (persistError) {
                const restoredTasks = restoreManualOrder(readTasks(), before, changedIds);
                replaceTasks(restoredTasks);
                const restoredById = new Map(restoredTasks.map((task) => [task.id, task]));
                const succeededIds = Array.isArray(persistError?.succeededIds)
                    ? persistError.succeededIds
                    : [];

                if (succeededIds.length > 0) {
                    try {
                        const compensation = succeededIds
                            .map((id) => restoredById.get(id))
                            .filter(Boolean);
                        await persistTasks(compensation);
                    } catch (compensationError) {
                        try {
                            const durableTasks = await reloadTasks();
                            replaceTasks(durableTasks);
                            return {
                                success: false,
                                code: 'persist-failed',
                                reason: errorMessage(compensationError),
                                rolledBack: false,
                                reloaded: true,
                                recoveryFailed: false
                            };
                        } catch (reloadError) {
                            return {
                                success: false,
                                code: 'persist-failed',
                                reason: errorMessage(reloadError),
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
                    reason: errorMessage(persistError),
                    rolledBack: true,
                    reloaded: false
                };
            }
        })().catch((recoveryError) => ({
            success: false,
            code: 'persist-failed',
            reason: errorMessage(recoveryError),
            rolledBack: false,
            reloaded: false,
            recoveryFailed: true
        }));

        return {
            success: true,
            changed: true,
            taskId,
            position: destinationIndex + 1,
            total: moved.length,
            settled
        };
    }

    return {
        project,
        place,
        move
    };
}
