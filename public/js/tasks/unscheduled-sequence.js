const PRIORITY_RANK = Object.freeze({ high: 0, medium: 1, low: 2 });
const VALID_MODES = new Set(['priority', 'manual']);

export const UNSCHEDULED_SEQUENCE_CONFIG_ID = 'config-unscheduled-sequence';
export const UNSCHEDULED_SEQUENCE_SCHEMA_VERSION = 1;

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

function projectLegacyManual(tasks) {
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

function isValidSequenceDocument(sequenceDocument) {
    return (
        sequenceDocument?.id === UNSCHEDULED_SEQUENCE_CONFIG_ID &&
        sequenceDocument.schemaVersion === UNSCHEDULED_SEQUENCE_SCHEMA_VERSION &&
        Array.isArray(sequenceDocument.orderedTaskIds)
    );
}

function projectDocumentManual(tasks, sequenceDocument) {
    const unscheduled = tasks.filter((task) => task.type === 'unscheduled');
    const tasksById = new Map(unscheduled.map((task) => [task.id, task]));
    const included = new Set();
    const stored = [];

    for (const taskId of sequenceDocument.orderedTaskIds) {
        if (included.has(taskId) || !tasksById.has(taskId)) continue;
        included.add(taskId);
        stored.push(tasksById.get(taskId));
    }

    const unlistedIncomplete = unscheduled
        .filter((task) => !included.has(task.id) && task.status !== 'completed')
        .sort((left, right) => comparePriority(left, right) || compareIds(left, right));
    const unlistedCompleted = unscheduled
        .filter((task) => !included.has(task.id) && task.status === 'completed')
        .sort((left, right) => comparePriority(left, right) || compareIds(left, right));
    const lastIncomplete = stored.reduce(
        (last, task, index) => (task.status === 'completed' ? last : index),
        -1
    );

    return [
        ...stored.slice(0, lastIncomplete + 1),
        ...unlistedIncomplete,
        ...stored.slice(lastIncomplete + 1),
        ...unlistedCompleted
    ];
}

function projectManual(tasks, sequenceDocument) {
    return isValidSequenceDocument(sequenceDocument)
        ? projectDocumentManual(tasks, sequenceDocument)
        : projectLegacyManual(tasks);
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

function createSequenceDocument(orderedTasks) {
    return {
        id: UNSCHEDULED_SEQUENCE_CONFIG_ID,
        schemaVersion: UNSCHEDULED_SEQUENCE_SCHEMA_VERSION,
        orderedTaskIds: orderedTasks.map((task) => task.id)
    };
}

function hasSameOrderedIds(sequenceDocument, orderedTaskIds) {
    return (
        isValidSequenceDocument(sequenceDocument) &&
        sequenceDocument.orderedTaskIds.length === orderedTaskIds.length &&
        sequenceDocument.orderedTaskIds.every((taskId, index) => taskId === orderedTaskIds[index])
    );
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

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Create the ordering interface for the room-level Unscheduled task sequence.
 * Task documents are read-only inputs; only the sequence document is persisted.
 * @param {Object} adapters - Task, sequence-state, and persistence adapters
 * @returns {Object} Projection, placement, hydration, and movement operations
 */
export function createUnscheduledSequence({
    readTasks,
    readSequence,
    replaceSequence,
    persistSequence,
    reloadSequence
}) {
    let writeInFlight = false;

    function project(mode = 'priority') {
        const validMode = VALID_MODES.has(mode) ? mode : 'priority';
        const ordered =
            validMode === 'manual'
                ? projectManual(readTasks(), readSequence())
                : projectPriority(readTasks());

        return {
            tasks: ordered,
            movementByTaskId: movementFor(ordered, validMode)
        };
    }

    function settleSequenceWrite(nextSequence, priorSequence) {
        writeInFlight = true;
        replaceSequence(nextSequence);

        return (async () => {
            try {
                await persistSequence(nextSequence);
                return { success: true };
            } catch (persistError) {
                try {
                    const durableSequence = await reloadSequence();
                    replaceSequence(durableSequence);
                    return {
                        success: false,
                        code: 'persist-failed',
                        reason: errorMessage(persistError),
                        rolledBack: false,
                        reloaded: true,
                        recoveryFailed: false
                    };
                } catch (reloadError) {
                    replaceSequence(priorSequence);
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
        })()
            .catch((recoveryError) => {
                replaceSequence(priorSequence);
                return {
                    success: false,
                    code: 'persist-failed',
                    reason: errorMessage(recoveryError),
                    rolledBack: true,
                    reloaded: false,
                    recoveryFailed: true
                };
            })
            .finally(() => {
                writeInFlight = false;
            });
    }

    function placeMany(taskIds) {
        if (writeInFlight) return { success: false, code: 'unavailable' };

        const allTasks = readTasks();
        const uniqueTaskIds = [...new Set(taskIds)];
        const tasksToPlace = uniqueTaskIds.map((taskId) =>
            allTasks.find((item) => item.id === taskId)
        );
        if (tasksToPlace.some((task) => !task || task.type !== 'unscheduled')) {
            return { success: false, code: 'not-unscheduled' };
        }

        const placedIds = new Set(uniqueTaskIds);
        const ordered = projectManual(allTasks, readSequence()).filter(
            (item) => !placedIds.has(item.id)
        );
        const insertionIndex = ordered.reduce(
            (last, item, index) => (item.status === 'completed' ? last : index + 1),
            0
        );
        ordered.splice(insertionIndex, 0, ...tasksToPlace);

        const priorSequence = readSequence();
        const nextSequence = createSequenceDocument(ordered);
        if (hasSameOrderedIds(priorSequence, nextSequence.orderedTaskIds)) {
            return {
                success: true,
                changed: false,
                task: tasksToPlace[0],
                taskId: uniqueTaskIds.length === 1 ? uniqueTaskIds[0] : undefined,
                taskIds: uniqueTaskIds,
                settled: Promise.resolve({ success: true })
            };
        }

        return {
            success: true,
            changed: true,
            task: tasksToPlace[0],
            taskId: uniqueTaskIds.length === 1 ? uniqueTaskIds[0] : undefined,
            taskIds: uniqueTaskIds,
            settled: settleSequenceWrite(nextSequence, priorSequence)
        };
    }

    function place(taskId) {
        return placeMany([taskId]);
    }

    function move(taskId, destination) {
        if (writeInFlight) return { success: false, code: 'unavailable' };

        const currentTasks = readTasks();
        const source = currentTasks.find((task) => task.id === taskId);
        if (!source) return { success: false, code: 'not-found' };
        if (source.type !== 'unscheduled') return { success: false, code: 'not-unscheduled' };
        if (source.isEditingInline) return { success: false, code: 'unavailable' };

        const ordered = projectManual(currentTasks, readSequence());
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

        const moved = [...ordered];
        const [moving] = moved.splice(sourceIndex, 1);
        moved.splice(destinationIndex, 0, moving);
        const priorSequence = readSequence();
        const nextSequence = createSequenceDocument(moved);

        return {
            success: true,
            changed: true,
            taskId,
            position: destinationIndex + 1,
            total: moved.length,
            settled: settleSequenceWrite(nextSequence, priorSequence)
        };
    }

    function hydrate(sequenceDocument) {
        replaceSequence(sequenceDocument);
    }

    return { project, place, placeMany, move, hydrate };
}
