import {
    calculateMinutes,
    getCurrentTimeRounded,
    logger,
    timeToDateTime,
    calculateEndDateTime,
    extractTimeFromDateTime,
    getTaskDates,
    extractDateFromDateTime
} from './utils.js';
import { saveTasks } from './storage.js';

/**
 * @typedef {Object} BaseTaskProps
 * @property {string} id - Unique ID for the task
 * @property {string} description - task description
 * @property {string} status - task status ("incomplete" or "completed")
 * @property {boolean} editing - whether task is being edited
 * @property {boolean} confirmingDelete - whether delete is being confirmed
 * @property {boolean} [locked] - whether task is locked from auto-rescheduling (default false, mainly for scheduled)
 */

/**
 * @typedef {BaseTaskProps & { type: 'scheduled', startDateTime: string, endDateTime: string, duration: number }} ScheduledTask
 */

/**
 * @typedef {BaseTaskProps & { type: 'unscheduled', priority?: 'high' | 'medium' | 'low', estDuration?: number }} UnscheduledTask
 */

/**
 * @typedef {ScheduledTask | UnscheduledTask} Task
 */

/**
 * @typedef {Object} TaskOperationResult
 * @property {boolean} success - Whether the operation was successful
 * @property {string} [message] - Success message if operation succeeded
 * @property {string} [reason] - Error message if operation failed
 * @property {boolean} [requiresConfirmation] - Whether user confirmation is required
 * @property {string} [confirmationType] - Type of confirmation required (e.g. 'COMPLETE_LATE', 'RESCHEDULE_ADD')
 * @property {Task} [task] - The affected task if relevant
 * @property {string} [oldEndTime] - Old end time for late completion
 * @property {string} [newEndTime] - New end time for late completion
 * @property {number} [newDuration] - New duration for late completion
 * @property {number} [tasksDeleted] - Number of tasks deleted in bulk operations
 * @property {Object} [taskData] - Additional task data for operations like scheduling
 */

/**
 * @typedef {Object} TaskCompletionResult
 * @property {boolean} success - Whether the operation was successful
 * @property {string} [reason] - Error message if operation failed
 * @property {Task} [task] - The affected task if relevant
 * @property {boolean} [requiresConfirmation] - Whether user confirmation is required
 * @property {string} [confirmationType] - Type of confirmation required (e.g. 'COMPLETE_LATE')
 * @property {string} [oldEndTime] - Old end time for late completion
 * @property {string} [newEndTime] - New end time for late completion
 * @property {number} [newDuration] - New duration for late completion
 */

/**
 * Type guard to check if a task is a scheduled task
 * @param {Task} task - Task to check
 * @returns {task is ScheduledTask} True if task is a scheduled task
 */
export function isScheduledTask(task) {
    return (
        task.type === 'scheduled' &&
        typeof task.startDateTime === 'string' &&
        typeof task.endDateTime === 'string' &&
        typeof task.duration === 'number'
    );
}

// ============================================================================
// MIGRATION UTILITIES
// ============================================================================
function migrateTasks(tasksToMigrate) {
    const today = extractDateFromDateTime(new Date());
    let idCounter = Date.now();

    return tasksToMigrate.map((task, _index) => {
        const migratedTask = { ...task };
        if (!migratedTask.id) migratedTask.id = `task-${idCounter++}`;
        if (!migratedTask.status) migratedTask.status = 'incomplete';
        if (migratedTask.editing === undefined) migratedTask.editing = false;
        if (migratedTask.confirmingDelete === undefined) migratedTask.confirmingDelete = false;
        if (!migratedTask.type) migratedTask.type = 'scheduled';
        if (migratedTask.locked === undefined) migratedTask.locked = false;

        if (migratedTask.type === 'scheduled') {
            if (!migratedTask.startDateTime && migratedTask.startTime)
                migratedTask.startDateTime = timeToDateTime(migratedTask.startTime, today);
            if (!migratedTask.endDateTime && migratedTask.startDateTime && migratedTask.duration)
                migratedTask.endDateTime = calculateEndDateTime(
                    migratedTask.startDateTime,
                    migratedTask.duration
                );
            if (migratedTask.startDateTime && migratedTask.endDateTime && !migratedTask.duration) {
                const start = new Date(migratedTask.startDateTime);
                const end = new Date(migratedTask.endDateTime);
                migratedTask.duration = (end.getTime() - start.getTime()) / 60000;
            }
        } else if (migratedTask.type === 'unscheduled') {
            if (migratedTask.estDuration === undefined && migratedTask.duration !== undefined) {
                migratedTask.estDuration = migratedTask.duration;
                delete migratedTask.duration;
            }
            if (!migratedTask.priority) migratedTask.priority = 'medium';
        }
        delete migratedTask.startTime;
        delete migratedTask.endTime;
        return migratedTask;
    });
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================
let tasks = [];
let currentTasksVersion = 0;
export function getTaskState() {
    return tasks;
}
export function updateTaskState(newTasks) {
    tasks = migrateTasks(newTasks || []);
    if (tasks.length === 0) {
        /* Sample tasks are added in task-manager.js's updateTaskState */
    }

    // Sort scheduled tasks by start time when loading from storage
    const scheduledTasks = tasks.filter((task) => task.type === 'scheduled');
    const unscheduledTasks = tasks.filter((task) => task.type === 'unscheduled');
    sortScheduledTasks(scheduledTasks);
    tasks = [...scheduledTasks, ...unscheduledTasks];

    invalidateTaskCaches();
    saveTasks(tasks);
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================
let sortedScheduledTasksCache = null;
let sortedScheduledTasksCacheVersion = 0;
const invalidateTaskCaches = () => {
    currentTasksVersion++;
    sortedScheduledTasksCache = null;
};

// ============================================================================
// SORTING AND TASK UTILITIES
// ============================================================================
const priorityOrder = {
    high: 0,
    medium: 1,
    low: 2
};

const sortUnscheduledTasks = (tasksToSort) => {
    tasksToSort.sort((a, b) => {
        // Sort by completion status (incomplete tasks first)
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;

        // Then sort by priority
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;

        // If same priority, sort by estimated duration (shorter tasks first)
        if (a.estDuration !== null && b.estDuration !== null) {
            return a.estDuration - b.estDuration; // Shorter tasks first within same priority
        } else if (a.estDuration !== null) {
            return -1; // Tasks with duration before tasks without
        } else if (b.estDuration !== null) {
            return 1; // Tasks without duration after tasks with
        }
        return 0; // If priorities are the same and durations are both null or incomparable
    });
};

export const getSortedUnscheduledTasks = () => {
    const unscheduledTasks = tasks.filter((task) => task.type === 'unscheduled');
    sortUnscheduledTasks(unscheduledTasks);
    return unscheduledTasks;
};

const sortScheduledTasks = (tasksToSort) => {
    tasksToSort.sort(
        (a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()
    );
};

// NEW HELPER FUNCTION
function checkAndAdjustForLockedTasks(taskToAdjust, allScheduledTasks) {
    if (
        taskToAdjust.type !== 'scheduled' ||
        !taskToAdjust.startDateTime ||
        !taskToAdjust.duration
    ) {
        logger.debug('checkAndAdjustForLockedTasks: Task not adjustable or invalid', taskToAdjust);
        return taskToAdjust; // Not a schedulable task or invalid
    }

    const adjustedTask = { ...taskToAdjust }; // Work with a copy

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
        return adjustedTask; // No relevant locked tasks to consider
    }

    let hasBeenAdjustedInLoop;
    let iterations = 0; // Safety break for infinite loops
    const MAX_ITERATIONS = sortedLockedTasks.length * 2; // Heuristic limit

    do {
        hasBeenAdjustedInLoop = false;
        iterations++;
        if (iterations > MAX_ITERATIONS) {
            logger.warn(
                'checkAndAdjustForLockedTasks: Max iterations reached, potential infinite loop. Returning task as is.',
                adjustedTask
            );
            return taskToAdjust; // Return original to prevent broken state
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
                break; // Restart checks with the new position
            }
        }
    } while (hasBeenAdjustedInLoop);

    logger.debug('checkAndAdjustForLockedTasks: Final adjusted task', adjustedTask);
    return adjustedTask;
}

const getSortedScheduledTasks = () => {
    if (sortedScheduledTasksCache && sortedScheduledTasksCacheVersion === currentTasksVersion)
        return sortedScheduledTasksCache;
    logger.debug('Rebuilding sortedScheduledTasksCache');
    sortedScheduledTasksCache = tasks.filter((task) => task.type === 'scheduled');
    sortScheduledTasks(sortedScheduledTasksCache);
    sortedScheduledTasksCacheVersion = currentTasksVersion;
    return sortedScheduledTasksCache;
};

const createTaskObject = (taskData) => {
    logger.debug('createTaskObject called with taskData:', taskData);
    const id = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; // Generic ID prefix initially
    const baseTask = {
        id,
        description: taskData.description,
        status: 'incomplete',
        editing: false,
        confirmingDelete: false,
        type: taskData.taskType || 'scheduled'
    };

    let finalTask;
    if (baseTask.type === 'scheduled') {
        const today = extractDateFromDateTime(new Date());
        const startDateTime = timeToDateTime(taskData.startTime, today);
        finalTask = {
            ...baseTask,
            id: `sched-${Date.now()}`,
            startDateTime,
            endDateTime: calculateEndDateTime(startDateTime, taskData.duration),
            duration: taskData.duration
        };
    } else {
        // unscheduled
        finalTask = {
            ...baseTask,
            id: `unsched-${Date.now()}`,
            priority: taskData.priority || 'medium',
            estDuration:
                taskData.estDuration !== undefined && taskData.estDuration !== null
                    ? taskData.estDuration
                    : null
        }; // Ensure estDuration can be null
    }
    logger.debug('Created task object:', finalTask);
    return finalTask;
};

const finalizeTaskModification = () => {
    logger.debug('Finalizing task modification (invalidate cache, save)');
    invalidateTaskCaches();
    saveTasks(tasks);
};

// ============================================================================
// VALIDATION
// ============================================================================
/**
 * Validate task data before creation or update
 * @param {string} description - Task description
 * @param {string} taskType - Task type ('scheduled' or 'unscheduled')
 * @param {number} [duration] - Task duration in minutes (for scheduled tasks)
 * @param {string} [startTime] - Task start time (for scheduled tasks)
 * @param {number} [estDuration] - Estimated duration in minutes (for unscheduled tasks)
 * @returns {{isValid: boolean, reason?: string}} Validation result
 */
export function isValidTaskData(description, taskType, duration, startTime, estDuration) {
    // Validate common fields
    if (!description || description.trim() === '') {
        return { isValid: false, reason: 'Task description is required.' };
    }

    if (!taskType || !['scheduled', 'unscheduled'].includes(taskType)) {
        return { isValid: false, reason: 'Invalid task type.' };
    }

    // Validate scheduled task fields
    if (taskType === 'scheduled') {
        if (duration === undefined || duration === null || isNaN(duration) || duration < 0) {
            return {
                isValid: false,
                reason: 'Duration must be a non-negative number for scheduled tasks.'
            };
        }

        if (!startTime || startTime.trim() === '') {
            return { isValid: false, reason: 'Start time is required for scheduled tasks.' };
        }

        // Validate time format (HH:MM)
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(startTime)) {
            return { isValid: false, reason: 'Invalid start time format. Use HH:MM format.' };
        }
    }

    // Validate unscheduled task fields
    if (taskType === 'unscheduled') {
        if (
            estDuration !== undefined &&
            estDuration !== null &&
            (isNaN(estDuration) || estDuration < 0)
        ) {
            return {
                isValid: false,
                reason: 'Estimated duration must be a non-negative number for unscheduled tasks.'
            };
        }
    }

    return { isValid: true };
}

// ============================================================================
// UI STATE
// ============================================================================
const resetAllUIFlags = () =>
    tasks.forEach((task) => {
        task.editing = false;
        task.confirmingDelete = false;
    });
export function resetAllConfirmingDeleteFlags() {
    let c = false;
    tasks.forEach((t) => {
        if (t.confirmingDelete) {
            t.confirmingDelete = false;
            c = true;
        }
    });
    return c;
}
export function resetAllEditingFlags() {
    let c = false;
    tasks.forEach((t) => {
        if (t.editing) {
            t.editing = false;
            c = true;
        }
    });
    return c;
}

// ============================================================================
// OVERLAP & SCHEDULING (Scheduled Tasks Only)
// ============================================================================
export function tasksOverlap(task1, task2) {
    if (
        task1.type !== 'scheduled' ||
        task2.type !== 'scheduled' ||
        !task1.startDateTime ||
        !task1.endDateTime ||
        !task2.startDateTime ||
        !task2.endDateTime
    )
        return false;
    const start1 = new Date(task1.startDateTime);
    const end1 = new Date(task1.endDateTime);
    const start2 = new Date(task2.startDateTime);
    const end2 = new Date(task2.endDateTime);
    return start1 < end2 && start2 < end1;
}
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
export function performReschedule(actualTask) {
    if (
        actualTask.type !== 'scheduled' ||
        !actualTask.startDateTime ||
        !actualTask.endDateTime ||
        typeof actualTask.duration !== 'number'
    ) {
        logger.warn(
            'performReschedule: Invalid task, missing datetime fields, or duration not a number',
            actualTask
        );
        return;
    }

    const originalEditingState = actualTask.editing;
    actualTask.editing = false; // Temporarily set to false for overlap checks and consistency

    // Get all other scheduled tasks, sorted by their current start times
    const otherScheduledTasks = getSortedScheduledTasks().filter((t) => t.id !== actualTask.id);

    // Calculate the effective end time of the block formed by actualTask and any locked tasks it overlaps
    let effectiveEndTimeForBlock = new Date(actualTask.endDateTime);
    for (const otherTask of otherScheduledTasks) {
        // Only consider locked, non-completed tasks for extending the block
        if (
            otherTask.locked &&
            otherTask.status !== 'completed' &&
            tasksOverlap(actualTask, otherTask)
        ) {
            const otherTaskEnd = new Date(otherTask.endDateTime);
            if (otherTaskEnd > effectiveEndTimeForBlock) {
                effectiveEndTimeForBlock = otherTaskEnd;
            }
        }
    }
    const effectiveEndTimeStr = effectiveEndTimeForBlock.toISOString();

    // Identify tasks that need to be shifted. These are unlocked, non-completed, non-editing tasks
    // that overlap with the effective block created by actualTask and its collision with locked tasks.
    const tasksToShift = [];
    const blockToTestOverlap = {
        startDateTime: actualTask.startDateTime,
        endDateTime: effectiveEndTimeStr,
        type: 'scheduled', // Required by tasksOverlap
        id: `_block_for_${actualTask.id}` // Temporary ID for clarity, not used by tasksOverlap logic
    };

    for (const otherTask of otherScheduledTasks) {
        if (otherTask.status === 'completed' || otherTask.editing || otherTask.locked) {
            continue; // Skip completed, editing, or locked tasks as they won't be shifted
        }
        if (!otherTask.startDateTime || typeof otherTask.duration !== 'number') {
            logger.warn(
                'performReschedule: Skipping invalid task in tasksToShift collection',
                otherTask
            );
            continue; // Skip if task is malformed
        }

        if (tasksOverlap(blockToTestOverlap, otherTask)) {
            tasksToShift.push(otherTask);
        }
    }
    // The tasksToShift are already somewhat sorted as they come from otherScheduledTasks,
    // but if their order relative to each other could change due to how they overlap the block,
    // re-sorting by their original start times is safest before shifting.
    // Since otherScheduledTasks is sorted, and we iterate through it, tasksToShift should maintain that order.
    // If sortScheduledTasks is idempotent or safe to call here, it ensures order.
    sortScheduledTasks(tasksToShift); // Sorts by startDateTime in place, crucial for correct cascading push

    // Reschedule the identified tasks
    let currentPushPoint = effectiveEndTimeStr;
    for (const taskToReschedule of tasksToShift) {
        taskToReschedule.startDateTime = currentPushPoint;
        taskToReschedule.endDateTime = calculateEndDateTime(
            taskToReschedule.startDateTime,
            taskToReschedule.duration
        );
        currentPushPoint = taskToReschedule.endDateTime;

        logger.debug('Rescheduling task:', {
            taskId: taskToReschedule.id,
            description: taskToReschedule.description,
            newStart: taskToReschedule.startDateTime,
            newEnd: taskToReschedule.endDateTime
        });
    }

    actualTask.editing = originalEditingState; // Restore original editing state
    // Note: finalizeTaskModification() is called by the functions that call performReschedule.
}
export function getSuggestedStartTime() {
    const currentTimeRounded = getCurrentTimeRounded();
    const currentMinutes = calculateMinutes(currentTimeRounded);

    let latestTaskEndTime = null;
    let latestTaskEndMinutes = -1;
    let hasTaskAtCurrentTime = false;
    let hasTasksBeforeCurrentTime = false;
    let incompleteTaskCount = 0;

    // Consider only scheduled tasks
    const scheduledTasks = tasks.filter((task) => task.type === 'scheduled');

    for (const task of scheduledTasks) {
        // Ensure task has startDateTime and endDateTime, skip if not (should not happen for scheduled tasks)
        if (!task.startDateTime || !task.endDateTime) {
            logger.warn(
                'getSuggestedStartTime - Skipping task with missing start/endDateTime:',
                task
            );
            continue;
        }
        const { startDate: taskStartDateObj, endDate: taskEndDateObj } = getTaskDates(task);
        const taskStartTime = extractTimeFromDateTime(taskStartDateObj);
        const taskStartMinutes = calculateMinutes(taskStartTime);

        // only count incomplete tasks for the task count and latest end time
        if (task.status === 'incomplete') {
            incompleteTaskCount++;

            const taskEndTime = extractTimeFromDateTime(taskEndDateObj);
            const taskEndMinutesValue = calculateMinutes(taskEndTime);

            if (taskEndMinutesValue > latestTaskEndMinutes) {
                latestTaskEndTime = taskEndTime;
                latestTaskEndMinutes = taskEndMinutesValue;
            }

            if (!hasTaskAtCurrentTime) {
                if (taskEndMinutesValue < taskStartMinutes) {
                    // Task crosses midnight
                    if (
                        currentMinutes >= taskStartMinutes ||
                        currentMinutes < taskEndMinutesValue
                    ) {
                        hasTaskAtCurrentTime = true;
                    }
                } else {
                    // Normal task on same day
                    if (
                        currentMinutes >= taskStartMinutes &&
                        currentMinutes < taskEndMinutesValue
                    ) {
                        hasTaskAtCurrentTime = true;
                    }
                }
            }
        }

        // check if there are tasks (including completed ones) before current time
        if (!hasTasksBeforeCurrentTime) {
            if (taskStartMinutes < currentMinutes) {
                hasTasksBeforeCurrentTime = true;
            }
        }
    }

    // if no incomplete scheduled tasks exist
    if (incompleteTaskCount === 0) {
        return currentTimeRounded;
    }

    // if current time slot is occupied, use end time of latest incomplete scheduled task
    if (hasTaskAtCurrentTime) {
        return latestTaskEndTime || currentTimeRounded;
    }

    // if current time slot is available
    if (hasTasksBeforeCurrentTime) {
        // filling a gap - use current time
        return currentTimeRounded;
    } else {
        // planning ahead - use end time of latest incomplete scheduled task
        return latestTaskEndTime || currentTimeRounded;
    }
}
const createOverlapConfirmation = (operation, data, reason) => ({
    success: false,
    requiresConfirmation: true,
    confirmationType: `RESCHEDULE_${operation}`,
    ...data,
    reason
});

// ============================================================================
// CORE TASK OPERATIONS
// ============================================================================
export function addTask(taskData, isResubmissionAfterShiftConfirm = false) {
    logger.debug(
        'addTask called with taskData:',
        taskData,
        'isResubmission:',
        isResubmissionAfterShiftConfirm
    );
    const validation = isValidTaskData(
        taskData.description,
        taskData.taskType,
        taskData.taskType === 'scheduled' ? taskData.duration : undefined,
        taskData.taskType === 'scheduled' ? taskData.startTime : undefined,
        taskData.taskType === 'unscheduled' ? taskData.estDuration : undefined
    );
    if (!validation.isValid) return { success: false, reason: validation.reason };

    const taskObject = createTaskObject(taskData); // This is the task based on current input (could be original or adjusted)

    if (taskObject.type === 'scheduled') {
        const allCurrentScheduledTasks = getSortedScheduledTasks();

        if (!isResubmissionAfterShiftConfirm) {
            // Verify taskObject is a valid scheduled task
            if (!isScheduledTask(taskObject)) {
                logger.error('addTask: Invalid scheduled task object.', taskObject);
                return { success: false, reason: 'Internal error: Invalid scheduled task data.' };
            }

            const originalRequestedTimeTask = { ...taskObject };
            const taskAfterLockedCheck = checkAndAdjustForLockedTasks(
                originalRequestedTimeTask,
                allCurrentScheduledTasks
            );

            // Verify the result is also a valid scheduled task
            if (!isScheduledTask(taskAfterLockedCheck)) {
                logger.error('addTask: Invalid result from locked check.', taskAfterLockedCheck);
                return {
                    success: false,
                    reason: 'Internal error: Invalid task data after locked check.'
                };
            }

            const wasShiftedByLocked =
                taskAfterLockedCheck.startDateTime !== originalRequestedTimeTask.startDateTime;

            if (wasShiftedByLocked) {
                logger.info('addTask: Task needs shift due to locked tasks.', {
                    originalStart: originalRequestedTimeTask.startDateTime,
                    newStart: taskAfterLockedCheck.startDateTime
                });

                return createOverlapConfirmation(
                    'NEEDS_SHIFT_DUE_TO_LOCKED',
                    {
                        adjustedTaskObject: taskAfterLockedCheck,
                        adjustedTaskDataForResubmission: {
                            ...taskData,
                            startTime: extractTimeFromDateTime(
                                new Date(taskAfterLockedCheck.startDateTime)
                            ),
                            duration: taskAfterLockedCheck.duration
                        }
                    },
                    `The task "${originalRequestedTimeTask.description}" would overlap a locked task if scheduled at ${extractTimeFromDateTime(
                        new Date(originalRequestedTimeTask.startDateTime)
                    )}, as requested. Schedule it at ${extractTimeFromDateTime(
                        new Date(taskAfterLockedCheck.startDateTime)
                    )} instead?`
                );
            }
        }

        // Verify taskObject is still a valid scheduled task after potential resubmission
        if (!isScheduledTask(taskObject)) {
            logger.error('addTask: Invalid scheduled task after resubmission.', taskObject);
            return {
                success: false,
                reason: 'Internal error: Invalid task data after resubmission.'
            };
        }

        const unlockedOverlappingTasks = checkOverlap(
            taskObject,
            allCurrentScheduledTasks.filter((t) => t.id !== taskObject.id && !t.locked)
        );

        if (unlockedOverlappingTasks.length > 0) {
            logger.info('addTask: Task overlaps unlocked tasks.');
            return createOverlapConfirmation(
                'OVERLAPS_UNLOCKED_OTHERS',
                { taskObjectToFinalize: taskObject },
                `Adding "${taskObject.description}" at ${extractTimeFromDateTime(
                    new Date(taskObject.startDateTime)
                )} will overlap other tasks. Reschedule these other tasks?`
            );
        }

        // --- If we reach here: No (more) confirmations needed for this taskObject ---
        // It was either clear of locked tasks initially, OR user confirmed its shift,
        // AND it's clear of unlocked tasks, OR user confirmed rescheduling unlocked tasks (via confirmAddTaskAndReschedule).
        // The last case (OVERLAPS_UNLOCKED_OTHERS confirmed) is handled by confirmAddTaskAndReschedule directly adding and then calling performReschedule.
        // This block is for:
        //    1. Initial add, no locked conflicts, no unlocked conflicts.
        //    2. Resubmitted add (after NEEDS_SHIFT_DUE_TO_LOCKED was confirmed), and this adjusted task had no unlocked conflicts.

        const currentScheduledForAdd = tasks.filter(isScheduledTask);
        const currentUnscheduledForAdd = tasks.filter((t) => t.type === 'unscheduled');
        if (!currentScheduledForAdd.find((t) => t.id === taskObject.id)) {
            currentScheduledForAdd.push(taskObject);
            sortScheduledTasks(currentScheduledForAdd);
        }
        tasks = [...currentScheduledForAdd, ...currentUnscheduledForAdd];

        const taskInArrayForAdd = tasks.find((t) => t.id === taskObject.id);
        if (taskInArrayForAdd && isScheduledTask(taskInArrayForAdd)) {
            performReschedule(taskInArrayForAdd);
            const sch = tasks.filter(isScheduledTask);
            const unsch = tasks.filter((t) => t.type === 'unscheduled');
            sortScheduledTasks(sch);
            tasks = [...sch, ...unsch];
        }
        finalizeTaskModification();
        logger.info('addTask: Scheduled task added and processed.');
        return { success: true, task: taskObject };
    } else {
        // Unscheduled task
        tasks.push(taskObject);
        saveTasks(tasks);
        logger.info('addTask: Unscheduled task added.');
        return { success: true, task: taskObject };
    }
}

export function confirmAddTaskAndReschedule(confirmedPayload) {
    logger.debug('confirmAddTaskAndReschedule called with payload:', confirmedPayload);

    // confirmedPayload is expected to be { taskObject: actualTaskObject } from createOverlapConfirmation
    const taskToAdd = confirmedPayload.taskObject;

    if (!taskToAdd || !taskToAdd.id || !taskToAdd.type) {
        logger.error(
            'confirmAddTaskAndReschedule: Invalid taskObject in payload.',
            confirmedPayload
        );
        return { success: false, reason: 'Invalid task data for confirmation.' };
    }

    if (taskToAdd.type === 'scheduled') {
        const currentScheduledConfirm = tasks.filter(isScheduledTask);
        const currentUnscheduledConfirm = tasks.filter((t) => t.type === 'unscheduled');
        if (!currentScheduledConfirm.find((t) => t.id === taskToAdd.id)) {
            currentScheduledConfirm.push(taskToAdd);
            sortScheduledTasks(currentScheduledConfirm);
        }
        tasks = [...currentScheduledConfirm, ...currentUnscheduledConfirm];

        const taskInArrayConfirm = tasks.find((t) => t.id === taskToAdd.id);
        if (taskInArrayConfirm && isScheduledTask(taskInArrayConfirm)) {
            performReschedule(taskInArrayConfirm);
            const sch = tasks.filter(isScheduledTask);
            const unsch = tasks.filter((t) => t.type === 'unscheduled');
            sortScheduledTasks(sch);
            tasks = [...sch, ...unsch];
        }
        finalizeTaskModification();
    } else {
        // Unscheduled task
        if (!tasks.find((t) => t.id === taskToAdd.id)) {
            tasks.push(taskToAdd);
        }
        saveTasks(tasks);
    }
    return { success: true, task: taskToAdd };
}

export function updateTask(index, taskData) {
    if (index < 0 || index >= tasks.length) {
        return { success: false, reason: 'Invalid task index.' };
    }
    const existingTask = tasks[index];
    let updatedProposedDetails = {
        description: taskData.description,
        type: taskData.taskType || existingTask.type,
        status: existingTask.status,
        id: existingTask.id,
        editing: false,
        confirmingDelete: existingTask.confirmingDelete,
        locked: taskData.locked !== undefined ? taskData.locked : existingTask.locked
    };

    let wasShiftedByLocked = false;
    let originalProposedStartDateTime = null;
    let unlockedOverlappingTasks = []; // Initialize for wider scope

    if (updatedProposedDetails.type === 'scheduled') {
        updatedProposedDetails.duration = taskData.duration;
        const today = extractDateFromDateTime(new Date());
        const startTime =
            taskData.startTime ||
            (existingTask.startDateTime
                ? extractTimeFromDateTime(new Date(existingTask.startDateTime))
                : getCurrentTimeRounded());
        updatedProposedDetails.startDateTime = timeToDateTime(startTime, today);
        updatedProposedDetails.endDateTime = calculateEndDateTime(
            updatedProposedDetails.startDateTime,
            updatedProposedDetails.duration
        );
        originalProposedStartDateTime = updatedProposedDetails.startDateTime;

        const allOtherScheduledTasks = tasks.filter(
            (t) => t.type === 'scheduled' && t.id !== existingTask.id
        );
        const taskAfterLockedCheck = checkAndAdjustForLockedTasks(
            updatedProposedDetails,
            allOtherScheduledTasks
        );

        if (
            taskAfterLockedCheck.startDateTime &&
            originalProposedStartDateTime &&
            taskAfterLockedCheck.startDateTime !== originalProposedStartDateTime
        ) {
            wasShiftedByLocked = true;
            logger.info(
                'updateTask: Task update shifted due to locked tasks. Original proposed start:',
                originalProposedStartDateTime,
                'New start:',
                taskAfterLockedCheck.startDateTime
            );
        }
        updatedProposedDetails = taskAfterLockedCheck;

        // This block should be INSIDE the scheduled type check
        const allOverlappingTasks = checkOverlap(
            updatedProposedDetails,
            tasks.filter((t) => t.id !== existingTask.id && t.type === 'scheduled')
        );
        unlockedOverlappingTasks = allOverlappingTasks.filter((t) => !t.locked); // Assign to the wider scoped variable

        if (unlockedOverlappingTasks.length > 0) {
            if (wasShiftedByLocked) {
                logger.info(
                    'updateTask: Updated task (shifted by locked) overlaps unlocked. Auto-rescheduling.'
                );
                tasks[index] = { ...existingTask, ...updatedProposedDetails };
                if (isScheduledTask(tasks[index])) {
                    performReschedule(tasks[index]);
                    const sch = tasks.filter(isScheduledTask);
                    const unsch = tasks.filter((t) => t.type === 'unscheduled');
                    sortScheduledTasks(sch);
                    tasks = [...sch, ...unsch];
                }
                finalizeTaskModification();
                return {
                    success: true,
                    task: tasks[index],
                    autoRescheduledMessage:
                        'Task updated. Adjusted for locked tasks and automatically rescheduled others.'
                };
            } else {
                logger.info(
                    'updateTask: Updated task (not shifted by locked) overlaps unlocked. Confirmation needed.'
                );
                return createOverlapConfirmation(
                    'UPDATE',
                    { taskIndex: index, updatedTaskObject: updatedProposedDetails },
                    'Updating this task may overlap. Reschedule others?'
                );
            }
        }
        // If no unlockedOverlappingTasks, logic continues to the end of the function
    } else {
        updatedProposedDetails.priority = taskData.priority || 'medium';
        updatedProposedDetails.estDuration = taskData.estDuration;
        delete updatedProposedDetails.startDateTime;
        delete updatedProposedDetails.endDateTime;
        delete updatedProposedDetails.duration;
    }

    const validation = isValidTaskData(
        updatedProposedDetails.description,
        updatedProposedDetails.type,
        updatedProposedDetails.type === 'scheduled' ? updatedProposedDetails.duration : undefined,
        updatedProposedDetails.type === 'scheduled' && updatedProposedDetails.startDateTime
            ? extractTimeFromDateTime(new Date(updatedProposedDetails.startDateTime))
            : undefined,
        updatedProposedDetails.type === 'unscheduled'
            ? updatedProposedDetails.estDuration
            : undefined
    );
    if (!validation.isValid) return { success: false, reason: validation.reason };

    tasks[index] = { ...existingTask, ...updatedProposedDetails };
    if (isScheduledTask(tasks[index])) {
        performReschedule(tasks[index]);
        const sch = tasks.filter(isScheduledTask);
        const unsch = tasks.filter((t) => t.type === 'unscheduled');
        sortScheduledTasks(sch);
        tasks = [...sch, ...unsch];
    }
    finalizeTaskModification();
    let message = 'Task updated.';
    if (wasShiftedByLocked) {
        message = 'Task updated. It was adjusted for locked tasks.';
    }
    const RtnMessage =
        wasShiftedByLocked && unlockedOverlappingTasks.length === 0 ? message : undefined;
    return { success: true, task: tasks[index], autoRescheduledMessage: RtnMessage };
}

export function updateUnscheduledTask(taskId, newData) {
    const taskIndex = tasks.findIndex((t) => t.id === taskId && t.type === 'unscheduled');
    if (taskIndex === -1) {
        return { success: false, reason: 'Unscheduled task not found.' };
    }
    const taskToUpdate = tasks[taskIndex];

    const validation = isValidTaskData(
        newData.description,
        'unscheduled',
        undefined,
        undefined,
        newData.estDuration
    );
    if (!validation.isValid) {
        return { success: false, reason: validation.reason };
    }

    taskToUpdate.description = newData.description;
    taskToUpdate.priority = newData.priority;
    taskToUpdate.estDuration = newData.estDuration;

    finalizeTaskModification();
    return { success: true, task: taskToUpdate };
}

export function confirmUpdateTaskAndReschedule(confirmedPayload) {
    // confirmedPayload is expected to be { taskIndex: index, updatedTaskObject: updatedDetailsObject }
    const index = confirmedPayload.taskIndex;
    const updatedTaskObject = confirmedPayload.updatedTaskObject;

    if (index === undefined || index < 0 || index >= tasks.length || !updatedTaskObject) {
        logger.error('confirmUpdateTaskAndReschedule: Invalid payload.', confirmedPayload);
        return { success: false, reason: 'Invalid data for update confirmation.' };
    }

    const existingTask = tasks[index];
    // Merge, ensuring updatedTaskObject properties overwrite existingTask properties correctly.
    // Properties like id, status (if not completed by update), etc., from updatedTaskObject should be primary.
    tasks[index] = { ...existingTask, ...updatedTaskObject };

    if (isScheduledTask(tasks[index])) {
        const taskInArray = tasks[index]; // Already the correct reference
        performReschedule(taskInArray);
    }
    finalizeTaskModification();
    return { success: true, task: tasks[index] };
}

/**
 * Complete a task at the specified index
 * @param {number} index - Index of task to complete
 * @param {string} [currentTime24Hour] - Current time in 24-hour format (HH:MM)
 * @returns {TaskCompletionResult} Result of the complete operation
 */
export function completeTask(index, currentTime24Hour) {
    if (index < 0 || index >= tasks.length) {
        return { success: false, reason: 'Invalid task index.' };
    }

    const task = tasks[index];
    let requiresConfirmation = false;
    let confirmationType = '';
    let additionalData = {};

    if (task.type === 'scheduled' && currentTime24Hour && task.startDateTime && task.endDateTime) {
        const currentMins = calculateMinutes(currentTime24Hour);
        const startMins = calculateMinutes(extractTimeFromDateTime(new Date(task.startDateTime)));
        const endMins = calculateMinutes(extractTimeFromDateTime(new Date(task.endDateTime)));

        if (currentMins > endMins) {
            // Task completed late
            requiresConfirmation = true;
            confirmationType = 'COMPLETE_LATE';
            additionalData = {
                oldEndTime: extractTimeFromDateTime(new Date(task.endDateTime)),
                newEndTime: currentTime24Hour,
                newDuration: Math.max(0, currentMins - startMins)
            };
            return {
                success: true,
                task: { ...task },
                requiresConfirmation,
                confirmationType,
                ...additionalData
            };
        } else if (currentMins < endMins && currentMins >= startMins) {
            // Task completed early
            task.duration = Math.max(0, currentMins - startMins);
            task.endDateTime = calculateEndDateTime(task.startDateTime, task.duration);
        }
    }

    // Mark task as completed
    task.status = 'completed';
    task.editing = false;
    task.confirmingDelete = false;

    // For scheduled tasks, we need to handle rescheduling
    if (task.type === 'scheduled') {
        finalizeTaskModification();
    } else {
        // For unscheduled tasks, just save without invalidating caches
        saveTasks(tasks);
    }

    return {
        success: true,
        task,
        requiresConfirmation,
        confirmationType,
        ...additionalData
    };
}

export function confirmCompleteLate(index, newEndTime, newDuration) {
    if (index < 0 || index >= tasks.length) {
        return { success: false, reason: 'Invalid task index.' };
    }

    const task = tasks[index];
    if (task.type !== 'scheduled' || !task.startDateTime) {
        return {
            success: false,
            reason: 'Cannot confirm late completion for non-scheduled or invalid task.'
        };
    }

    // Update task with late completion details
    task.editing = false;
    task.status = 'completed';
    task.duration = newDuration;
    task.endDateTime = calculateEndDateTime(task.startDateTime, task.duration);

    // Reschedule other tasks if needed
    performReschedule(task);
    finalizeTaskModification();

    return { success: true, task };
}

export function editTask(index) {
    if (index < 0 || index >= tasks.length)
        return { success: false, reason: 'Invalid task index.' };
    resetAllUIFlags();
    tasks[index].editing = true;
    return { success: true, task: tasks[index] };
}
export function cancelEdit(index) {
    if (index < 0 || index >= tasks.length)
        return { success: false, reason: 'Invalid task index.' };
    if (tasks[index]) tasks[index].editing = false;
    return { success: true, task: tasks[index] };
}

/**
 * Delete a task at the specified index
 * @param {number} index - Index of task to delete
 * @param {boolean} confirmed - Whether deletion has been confirmed
 * @returns {TaskOperationResult} Result of the delete operation
 */
export function deleteTask(index, confirmed = false) {
    if (index < 0 || index >= tasks.length)
        return { success: false, reason: 'Invalid task index.' };
    const taskToDelete = tasks[index];

    if (!confirmed) {
        taskToDelete.confirmingDelete = true;
        return { success: false, requiresConfirmation: true, reason: 'Confirmation required.' };
    }

    tasks.splice(index, 1);
    resetAllUIFlags();
    finalizeTaskModification();
    return { success: true };
}

/**
 * Delete an unscheduled task by ID
 * @param {string} taskId - ID of unscheduled task to delete
 * @returns {TaskOperationResult} Result of the delete operation
 */
export function deleteUnscheduledTask(taskId) {
    const taskIndex = tasks.findIndex((t) => t.id === taskId && t.type === 'unscheduled');
    if (taskIndex === -1) {
        return { success: false, reason: 'Unscheduled task not found.' };
    }
    return deleteTask(taskIndex, tasks[taskIndex].confirmingDelete);
}

export function deleteAllTasks() {
    if (tasks.length === 0) return { success: true, tasksDeleted: 0 };
    const num = tasks.length;
    updateTaskState([]);
    logger.info(`deleteAllTasks: All ${num} tasks have been deleted.`);
    return { success: true, message: `${num} tasks deleted.`, tasksDeleted: num };
}

export function deleteAllScheduledTasks() {
    const currentTasks = getTaskState();
    const unscheduledTasks = currentTasks.filter((task) => task.type === 'unscheduled');
    const scheduledTasksCount = currentTasks.length - unscheduledTasks.length;

    if (scheduledTasksCount === 0) {
        logger.info('deleteAllScheduledTasks: No scheduled tasks to delete.');
        return { success: true, message: 'No scheduled tasks to delete.', tasksDeleted: 0 };
    }

    updateTaskState(unscheduledTasks);
    logger.info(
        `deleteAllScheduledTasks: All ${scheduledTasksCount} scheduled tasks have been deleted.`
    );
    return {
        success: true,
        message: `${scheduledTasksCount} scheduled tasks deleted.`,
        tasksDeleted: scheduledTasksCount
    };
}

export function deleteCompletedTasks() {
    const currentTasks = getTaskState();
    const incompleteTasks = currentTasks.filter((task) => task.status !== 'completed');
    const completedTasksCount = currentTasks.length - incompleteTasks.length;

    if (completedTasksCount === 0) {
        logger.info('deleteCompletedTasks: No completed tasks to delete.');
        return { success: true, message: 'No completed tasks to delete.', tasksDeleted: 0 };
    }

    updateTaskState(incompleteTasks);
    logger.info(
        `deleteCompletedTasks: All ${completedTasksCount} completed tasks have been deleted.`
    );
    return {
        success: true,
        message: `${completedTasksCount} completed tasks deleted.`,
        tasksDeleted: completedTasksCount
    };
}

export function scheduleUnscheduledTask(taskId, startTime, duration) {
    const taskIndex = tasks.findIndex((t) => t.id === taskId && t.type === 'unscheduled');
    if (taskIndex === -1) return { success: false, reason: 'Unscheduled task not found.' };
    const unscheduledTask = tasks[taskIndex];
    const newScheduledTaskData = {
        description: unscheduledTask.description,
        startTime,
        duration: duration || unscheduledTask.estDuration, // Use provided duration or fall back to estimated
        taskType: 'scheduled'
    };
    const tempScheduledTask = createTaskObject(newScheduledTaskData);
    const overlaps = checkOverlap(
        tempScheduledTask,
        tasks.filter((t) => t.type === 'scheduled')
    );
    if (overlaps.length > 0) {
        return {
            success: false,
            requiresConfirmation: true,
            confirmationType: 'RESCHEDULE_SCHEDULE_UNSCHEDULED',
            taskData: { unscheduledTaskId: taskId, newScheduledTaskData },
            reason: 'Scheduling will overlap. Reschedule others?'
        };
    }

    // Remove the original unscheduled task
    tasks.splice(taskIndex, 1);

    const newScheduledTask = createTaskObject(newScheduledTaskData);

    // Add the new scheduled task and re-sort the main tasks array
    const scheduledTasks = tasks.filter((t) => t.type === 'scheduled');
    const unscheduledTasks = tasks.filter((t) => t.type === 'unscheduled'); // these are the remaining unscheduled tasks
    scheduledTasks.push(newScheduledTask);
    sortScheduledTasks(scheduledTasks); // sortScheduledTasks sorts in place
    tasks = [...scheduledTasks, ...unscheduledTasks];

    performReschedule(newScheduledTask);
    finalizeTaskModification();
    return { success: true, task: newScheduledTask };
}

export function confirmScheduleUnscheduledTask(unscheduledTaskId, newScheduledTaskData) {
    const taskIndex = tasks.findIndex(
        (t) => t.id === unscheduledTaskId && t.type === 'unscheduled'
    );
    if (taskIndex !== -1) {
        tasks.splice(taskIndex, 1); // Remove the original unscheduled task
    } else {
        logger.warn(`Unscheduled task ID ${unscheduledTaskId} not found for confirmation.`);
        // If not found, we might still proceed to add it as a new task if that's desired,
        // but current logic implies it was expected to be found.
        // For now, we proceed to add it as if it's a new scheduled task derived from data.
    }

    const taskToCreate = { ...newScheduledTaskData, taskType: 'scheduled' };
    const newScheduledTask = createTaskObject(taskToCreate);

    // Add the new scheduled task and re-sort the main tasks array
    const scheduledTasks = tasks.filter((t) => t.type === 'scheduled');
    const unscheduledTasks = tasks.filter((t) => t.type === 'unscheduled');
    scheduledTasks.push(newScheduledTask);
    sortScheduledTasks(scheduledTasks); // sortScheduledTasks sorts in place
    tasks = [...scheduledTasks, ...unscheduledTasks];

    performReschedule(newScheduledTask);
    finalizeTaskModification();
    return { success: true, task: newScheduledTask };
}

export function reorderUnscheduledTask(draggedTaskId, targetTaskId) {
    const draggedTaskIndex = tasks.findIndex(
        (task) => task.id === draggedTaskId && task.type === 'unscheduled'
    );
    const targetTaskIndex = tasks.findIndex(
        (task) => task.id === targetTaskId && task.type === 'unscheduled'
    );

    if (draggedTaskIndex === -1 || targetTaskIndex === -1) {
        logger.warn('Dragged or target task not found for reordering.', {
            draggedTaskId,
            targetTaskId
        });
        return { success: false, reason: 'Could not find one or both tasks to reorder.' };
    }

    const [draggedTask] = tasks.splice(draggedTaskIndex, 1);
    tasks.splice(targetTaskIndex, 0, draggedTask);

    // No need to re-sort here as it's a manual reorder.
    // The main list 'tasks' is now updated. We just need to save.
    finalizeTaskModification();
    logger.info(`Task ${draggedTaskId} reordered to position of ${targetTaskId}`);
    return { success: true };
}

export function toggleUnscheduledTaskCompleteState(taskId) {
    const taskIndex = tasks.findIndex((task) => task.id === taskId && task.type === 'unscheduled');
    if (taskIndex === -1) {
        logger.warn(`Unscheduled task not found for toggling complete state: ${taskId}`);
        return { success: false, reason: 'Task not found.' };
    }

    const task = tasks[taskIndex];

    if (task.status === 'completed') {
        task.status = 'incomplete'; // Assuming 'incomplete' is the default active status for all tasks
        logger.info(`Unscheduled task '${task.description}' marked as not completed.`);
    } else {
        task.status = 'completed';
        logger.info(`Unscheduled task '${task.description}' marked as completed.`);
    }

    finalizeTaskModification(); // Saves tasks and invalidates caches
    return { success: true, task }; // Return the modified task
}

export function unscheduleTask(taskId) {
    const taskIndex = tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
        return { success: false, reason: 'Task not found for unscheduling.' };
    }
    const task = tasks[taskIndex];
    if (task.type !== 'scheduled') {
        return { success: false, reason: 'Task is not currently scheduled.' };
    }

    const formerScheduledDuration = task.duration; // Capture the duration before deleting it

    // Convert to unscheduled
    task.type = 'unscheduled';
    delete task.startDateTime;
    delete task.endDateTime;
    delete task.duration; // Delete the original 'duration' property for scheduled tasks

    // Add properties typical for unscheduled tasks
    task.priority = 'medium'; // Default priority
    // Use the captured former scheduled duration as the new estimated duration.
    // If it wasn't defined (though it should be for a scheduled task), set to null or a default.
    // createTaskObject allows estDuration to be null.
    task.estDuration =
        formerScheduledDuration !== undefined && formerScheduledDuration !== null
            ? formerScheduledDuration
            : null;
    task.isEditingInline = false; // Ensure it's not in edit mode by default

    // Remove properties not relevant to unscheduled tasks (if any) - Placeholder if needed
    // delete task.someScheduledOnlyProperty;

    tasks[taskIndex] = task;
    finalizeTaskModification(); // This saves to localStorage and recalculates suggestions

    logger.info('Task unscheduled:', task);
    return { success: true, task };
}

// ============================================================================
// TASK LOCKING
// ============================================================================
export function toggleLockState(taskId) {
    const taskIndex = tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
        logger.warn(`toggleLockState: Task with ID ${taskId} not found.`);
        return { success: false, reason: 'Task not found.' };
    }

    const task = tasks[taskIndex];
    if (task.type !== 'scheduled') {
        return { success: false, reason: 'Only scheduled tasks can be locked.' };
    }

    task.locked = !task.locked;
    finalizeTaskModification();
    return { success: true, task };
}
