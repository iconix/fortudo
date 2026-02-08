import {
    logger,
    calculateEndDateTime,
    timeToDateTime,
    extractDateFromDateTime,
    extractTimeFromDateTime,
    convertTo12HourTime
} from './utils.js';

// ============================================================================
// OVERLAP DETECTION
// ============================================================================

/**
 * Checks if two scheduled tasks overlap in time
 * @param {Object} task1 - First task with startDateTime and endDateTime
 * @param {Object} task2 - Second task with startDateTime and endDateTime
 * @returns {boolean} True if tasks overlap
 */
export function tasksOverlap(task1, task2) {
    if (
        task1.type !== 'scheduled' ||
        task2.type !== 'scheduled' ||
        !task1.startDateTime ||
        !task1.endDateTime ||
        !task2.startDateTime ||
        !task2.endDateTime
    ) {
        return false;
    }
    const start1 = new Date(task1.startDateTime);
    const end1 = new Date(task1.endDateTime);
    const start2 = new Date(task2.startDateTime);
    const end2 = new Date(task2.endDateTime);
    return start1 < end2 && end1 > start2;
}

/**
 * Finds all tasks that overlap with a given task
 * Excludes completed tasks, tasks being edited, and the task itself
 * @param {Object} taskToCompare - The task to check against
 * @param {Array} existingTasks - Array of existing tasks to check
 * @returns {Array} Array of overlapping tasks
 */
export function checkOverlap(taskToCompare, existingTasks) {
    if (taskToCompare.type !== 'scheduled') return [];
    // Sort tasks by start time to ensure we check in chronological order
    const sortedTasks = [...existingTasks]
        .filter((task) => task.type === 'scheduled')
        .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());
    return sortedTasks.filter(
        (task) =>
            task.id !== taskToCompare.id &&
            task.status !== 'completed' &&
            !task.editing &&
            tasksOverlap(taskToCompare, task)
    );
}

/**
 * Find a completed task that the new task would overlap with
 * Used to offer truncation of the completed task when adding a retroactive task
 * @param {Object} taskToCompare - The new task being added
 * @param {Array} existingTasks - All existing tasks
 * @returns {Object|null} The overlapping completed task, or null if none found
 */
export function findOverlappingCompletedTask(taskToCompare, existingTasks) {
    if (taskToCompare.type !== 'scheduled') return null;

    const newTaskStart = new Date(taskToCompare.startDateTime);

    for (const task of existingTasks) {
        if (
            task.type === 'scheduled' &&
            task.status === 'completed' &&
            task.id !== taskToCompare.id &&
            tasksOverlap(taskToCompare, task)
        ) {
            // Only offer truncation if new task starts AFTER completed task started
            // (i.e., we're inserting a break in the middle, not before it)
            const taskStart = new Date(task.startDateTime);
            if (newTaskStart > taskStart) {
                return task;
            }
        }
    }
    return null;
}

// ============================================================================
// ADJUSTABLE TASK DETECTION
// ============================================================================

/**
 * Find incomplete task that started before the given time
 * Returns the earliest one (first start time) - this is the "current" task
 * Used to offer truncate/extend completion when adding a new task
 * @param {string} startDateTime - ISO datetime string for new task
 * @param {Array} scheduledTasks - Array of scheduled tasks
 * @returns {Object|null} The adjustable task, or null if none found
 */
export function findAdjustableTask(startDateTime, scheduledTasks) {
    const newStart = new Date(startDateTime);
    let earliestMatch = null;
    let earliestMatchStart = null;

    for (const task of scheduledTasks) {
        if (task.type !== 'scheduled' || task.status === 'completed') continue;

        const taskStart = new Date(task.startDateTime);

        // Task started before new task
        if (taskStart < newStart) {
            // Keep the earliest one (first start time) - that's the "current" task
            if (!earliestMatch || taskStart < earliestMatchStart) {
                earliestMatch = task;
                earliestMatchStart = taskStart;
            }
        }
    }
    return earliestMatch;
}

// ============================================================================
// LOCKED TASK HANDLING
// ============================================================================

/**
 * Adjusts a task's start time to avoid overlapping with locked tasks
 * @param {Object} taskToAdjust - Task to potentially adjust
 * @param {Array} allScheduledTasks - All scheduled tasks to check against
 * @returns {Object} Adjusted task (copy of original with potentially new times)
 */
export function checkAndAdjustForLockedTasks(taskToAdjust, allScheduledTasks) {
    if (
        taskToAdjust.type !== 'scheduled' ||
        !taskToAdjust.startDateTime ||
        !taskToAdjust.duration
    ) {
        logger.debug('checkAndAdjustForLockedTasks: Task not adjustable or invalid', taskToAdjust);
        return taskToAdjust;
    }

    const adjustedTask = { ...taskToAdjust };

    const sortedLockedTasks = allScheduledTasks
        .filter(
            (t) =>
                t.id !== adjustedTask.id &&
                t.type === 'scheduled' &&
                t.locked &&
                t.status !== 'completed'
        )
        .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());

    if (sortedLockedTasks.length === 0) {
        return adjustedTask;
    }

    let hasBeenAdjustedInLoop;
    let iterations = 0;
    const MAX_ITERATIONS = sortedLockedTasks.length * 2;

    do {
        hasBeenAdjustedInLoop = false;
        iterations++;
        if (iterations > MAX_ITERATIONS) {
            logger.warn(
                'checkAndAdjustForLockedTasks: Max iterations reached, potential infinite loop. Returning task as is.',
                adjustedTask
            );
            return taskToAdjust;
        }

        for (const lockedTask of sortedLockedTasks) {
            if (tasksOverlap(adjustedTask, lockedTask)) {
                logger.debug(
                    'checkAndAdjustForLockedTasks: Adjusting task',
                    adjustedTask.description,
                    'due to locked task',
                    lockedTask.description
                );
                adjustedTask.startDateTime = lockedTask.endDateTime;
                adjustedTask.endDateTime = calculateEndDateTime(
                    adjustedTask.startDateTime,
                    adjustedTask.duration
                );
                hasBeenAdjustedInLoop = true;
                break;
            }
        }
    } while (hasBeenAdjustedInLoop);

    logger.debug('checkAndAdjustForLockedTasks: Final adjusted task', adjustedTask);
    return adjustedTask;
}

// ============================================================================
// RESCHEDULE PLAN CALCULATION
// ============================================================================

/**
 * Calculates a plan for rescheduling tasks when a new/updated task would cause overlaps
 * @param {Object} taskToPlace - The task being added/updated
 * @param {Array} otherScheduledTasks - All other scheduled tasks (excluding taskToPlace)
 * @returns {Object} Plan with effectiveEndTime, tasksToShift, shiftedTaskPlan, lockedTasks
 */
export function calculateReschedulePlan(taskToPlace, otherScheduledTasks) {
    // Calculate effective end time (including locked tasks that overlap with taskToPlace)
    let effectiveEndTimeForBlock = new Date(taskToPlace.endDateTime);
    for (const otherTask of otherScheduledTasks) {
        if (
            otherTask.locked &&
            otherTask.status !== 'completed' &&
            tasksOverlap(taskToPlace, otherTask)
        ) {
            const otherTaskEnd = new Date(otherTask.endDateTime);
            if (otherTaskEnd > effectiveEndTimeForBlock) {
                effectiveEndTimeForBlock = otherTaskEnd;
            }
        }
    }
    const effectiveEndTimeStr = effectiveEndTimeForBlock.toISOString();

    // Get all shiftable tasks that could potentially be affected
    const triggerStart = new Date(taskToPlace.startDateTime);
    const triggerEnd = new Date(effectiveEndTimeStr);

    const shiftableTasks = otherScheduledTasks
        .filter((t) => {
            if (t.status === 'completed' || t.editing || t.locked) return false;
            if (!t.startDateTime || typeof t.duration !== 'number') {
                logger.warn('calculateReschedulePlan: Skipping invalid task', t);
                return false;
            }
            const taskStart = new Date(t.startDateTime);
            const taskEnd = new Date(t.endDateTime);
            const overlapsWithTrigger = taskStart < triggerEnd && taskEnd > triggerStart;
            const startsAtOrAfterTrigger = taskStart >= triggerStart;
            return overlapsWithTrigger || startsAtOrAfterTrigger;
        })
        .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());

    // Get incomplete locked tasks for flow-around logic
    const incompleteLockedTasks = otherScheduledTasks
        .filter((t) => t.locked && t.status !== 'completed')
        .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());

    // Helper: find the next available start time that doesn't overlap with locked tasks
    const findNextAvailableStart = (proposedStart, duration) => {
        let start = new Date(proposedStart);
        let end = new Date(calculateEndDateTime(start.toISOString(), duration));

        // Keep pushing past locked tasks until we find a clear slot
        let iterations = 0;
        const maxIterations = incompleteLockedTasks.length + 1;

        while (iterations < maxIterations) {
            let conflictFound = false;
            for (const lockedTask of incompleteLockedTasks) {
                const lockedStart = new Date(lockedTask.startDateTime);
                const lockedEnd = new Date(lockedTask.endDateTime);

                // Check if proposed slot overlaps with this locked task
                if (start < lockedEnd && end > lockedStart) {
                    // Conflict! Push to after this locked task
                    start = lockedEnd;
                    end = new Date(calculateEndDateTime(start.toISOString(), duration));
                    conflictFound = true;
                    break; // Restart the check with new position
                }
            }
            if (!conflictFound) break;
            iterations++;
        }

        return start.toISOString();
    };

    // Calculate shifted positions with cascading (flowing around locked tasks)
    const shiftedTaskPlan = [];
    let currentPushPoint = effectiveEndTimeStr;

    for (const task of shiftableTasks) {
        const taskStart = new Date(task.startDateTime);
        const pushPoint = new Date(currentPushPoint);

        if (taskStart < pushPoint) {
            // Task needs to be pushed - find next available slot that avoids locked tasks
            const newStartDateTime = findNextAvailableStart(currentPushPoint, task.duration);
            const newEndDateTime = calculateEndDateTime(newStartDateTime, task.duration);
            shiftedTaskPlan.push({
                task,
                originalStart: task.startDateTime,
                originalEnd: task.endDateTime,
                newStart: newStartDateTime,
                newEnd: newEndDateTime
            });
            currentPushPoint = newEndDateTime;
        } else {
            const taskEnd = new Date(task.endDateTime);
            if (taskEnd > pushPoint) {
                currentPushPoint = task.endDateTime;
            }
        }
    }

    const tasksToShift = shiftedTaskPlan.map((sp) => sp.task);
    const lockedTasks = otherScheduledTasks.filter((t) => t.locked && t.status !== 'completed');

    return {
        effectiveEndTime: effectiveEndTimeStr,
        tasksToShift,
        shiftedTaskPlan,
        lockedTasks
    };
}

/**
 * Validates that a reschedule plan won't create overlaps with locked tasks
 * @param {Object} plan - Plan from calculateReschedulePlan()
 * @returns {Object} {success: boolean, conflicts?: Array, lockedTasks?: Array}
 */
export function validateReschedulePlan(plan) {
    const { shiftedTaskPlan, lockedTasks } = plan;
    const conflicts = [];

    for (const shiftedTask of shiftedTaskPlan) {
        const simulatedTask = {
            ...shiftedTask.task,
            startDateTime: shiftedTask.newStart,
            endDateTime: shiftedTask.newEnd
        };

        for (const lockedTask of lockedTasks) {
            if (tasksOverlap(simulatedTask, lockedTask)) {
                conflicts.push({
                    shiftedTask: shiftedTask.task,
                    lockedTask,
                    simulatedStart: shiftedTask.newStart,
                    simulatedEnd: shiftedTask.newEnd
                });
            }
        }
    }

    if (conflicts.length > 0) {
        return { success: false, conflicts, lockedTasks };
    }

    return { success: true };
}

/**
 * Validates a reschedule plan and returns both plan and any error
 * @param {Object} taskToPlace - The task being placed
 * @param {Array} otherScheduledTasks - Other scheduled tasks
 * @returns {Object} {plan, validation, error: string|null}
 */
export function validateAndGetReschedulePlan(taskToPlace, otherScheduledTasks) {
    const plan = calculateReschedulePlan(taskToPlace, otherScheduledTasks);
    const validation = validateReschedulePlan(plan);

    if (!validation.success) {
        return {
            plan,
            validation,
            error: generateLockedConflictMessage(taskToPlace, validation)
        };
    }

    return { plan, validation, error: null };
}

// ============================================================================
// GAP FINDING
// ============================================================================

/**
 * Finds gaps between locked tasks where a new task could fit
 * @param {Array} lockedTasks - Array of locked scheduled tasks
 * @param {number} requiredDuration - Duration in minutes needed
 * @returns {Array} Array of gap objects with {start, end, durationMinutes}
 */
export function findGapsBetweenLockedTasks(lockedTasks, requiredDuration) {
    if (lockedTasks.length === 0) return [];

    const sortedLocked = [...lockedTasks].sort(
        (a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
    );

    const gaps = [];
    const dayStart = timeToDateTime('00:00', extractDateFromDateTime(new Date()));
    const dayEnd = timeToDateTime('23:59', extractDateFromDateTime(new Date()));

    // Gap before first locked task
    if (sortedLocked.length > 0) {
        const firstLockedStart = new Date(sortedLocked[0].startDateTime);
        const gapDuration = (firstLockedStart - new Date(dayStart)) / 60000;
        if (gapDuration >= requiredDuration) {
            gaps.push({
                start: dayStart,
                end: sortedLocked[0].startDateTime,
                durationMinutes: Math.floor(gapDuration)
            });
        }
    }

    // Gaps between locked tasks
    for (let i = 0; i < sortedLocked.length - 1; i++) {
        const gapStart = sortedLocked[i].endDateTime;
        const gapEnd = sortedLocked[i + 1].startDateTime;
        const gapDuration = (new Date(gapEnd) - new Date(gapStart)) / 60000;

        if (gapDuration >= requiredDuration) {
            gaps.push({
                start: gapStart,
                end: gapEnd,
                durationMinutes: Math.floor(gapDuration)
            });
        }
    }

    // Gap after last locked task
    if (sortedLocked.length > 0) {
        const lastLockedEnd = new Date(sortedLocked[sortedLocked.length - 1].endDateTime);
        const gapDuration = (new Date(dayEnd) - lastLockedEnd) / 60000;
        if (gapDuration >= requiredDuration) {
            gaps.push({
                start: sortedLocked[sortedLocked.length - 1].endDateTime,
                end: dayEnd,
                durationMinutes: Math.floor(gapDuration)
            });
        }
    }

    return gaps;
}

// ============================================================================
// ERROR MESSAGES
// ============================================================================

/**
 * Generates a helpful error message when rescheduling would create locked conflicts
 * @param {Object} newTask - The task being added
 * @param {Object} validationResult - Result from validateReschedulePlan()
 * @returns {string} Formatted error message
 */
export function generateLockedConflictMessage(newTask, validationResult) {
    const { conflicts, lockedTasks } = validationResult;

    const lines = [];
    lines.push(`Can't fit this task - rescheduling would create conflicts with locked tasks:`);
    lines.push('');

    const problematicLocked = new Set(conflicts.map((c) => c.lockedTask.id));
    for (const lockedTask of lockedTasks) {
        if (problematicLocked.has(lockedTask.id)) {
            const startTime = extractTimeFromDateTime(new Date(lockedTask.startDateTime));
            const endTime = extractTimeFromDateTime(new Date(lockedTask.endDateTime));
            lines.push(
                `  • ${lockedTask.description} (locked) at ${convertTo12HourTime(startTime)} - ${convertTo12HourTime(endTime)}`
            );
        }
    }

    lines.push('');

    const gaps = findGapsBetweenLockedTasks(lockedTasks, newTask.duration);

    if (gaps.length > 0) {
        lines.push('Available time slots:');
        for (const gap of gaps) {
            const gapStart = extractTimeFromDateTime(new Date(gap.start));
            const gapEnd = extractTimeFromDateTime(new Date(gap.end));
            lines.push(
                `  • ${convertTo12HourTime(gapStart)} - ${convertTo12HourTime(gapEnd)} (${gap.durationMinutes} min available)`
            );
        }
    } else {
        lines.push('No gaps large enough to fit this task.');
    }

    lines.push('');
    lines.push('To add this task:');
    lines.push('  1. Unlock one of the conflicting tasks, OR');
    if (gaps.length > 0) {
        lines.push('  2. Choose a time in an available slot, OR');
    }
    lines.push(`  ${gaps.length > 0 ? '3' : '2'}. Delete tasks to make space`);

    return lines.join('\n');
}

// ============================================================================
// RESCHEDULE EXECUTION
// ============================================================================

/**
 * Executes a reschedule operation, shifting tasks according to the calculated plan
 * @param {Object} triggerTask - The task that triggered the reschedule
 * @param {Array} allScheduledTasks - All scheduled tasks (will be mutated)
 * @returns {Object} The executed plan
 */
export function executeReschedule(triggerTask, allScheduledTasks) {
    const wasEditing = triggerTask.editing;
    triggerTask.editing = false;

    const otherScheduledTasks = allScheduledTasks.filter((t) => t.id !== triggerTask.id);
    const plan = calculateReschedulePlan(triggerTask, otherScheduledTasks);

    for (const shiftedTask of plan.shiftedTaskPlan) {
        shiftedTask.task.startDateTime = shiftedTask.newStart;
        shiftedTask.task.endDateTime = shiftedTask.newEnd;
    }

    triggerTask.editing = wasEditing;
    return { success: true, plan };
}
