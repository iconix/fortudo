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
 * @typedef {Object} Task
 * @property {string} description - task description
 * @property {string} [startTime] - start time in 24-hour format (HH:MM) - DEPRECATED: use startDateTime
 * @property {string} [endTime] - end time in 24-hour format (HH:MM) - DEPRECATED: use endDateTime
 * @property {string} startDateTime - start date and time in ISO format (YYYY-MM-DDTHH:MM:SS.sssZ)
 * @property {string} endDateTime - end date and time in ISO format (YYYY-MM-DDTHH:MM:SS.sssZ)
 * @property {number} duration - duration in minutes
 * @property {string} status - task status ("incomplete" or "completed")
 * @property {boolean} editing - whether task is being edited
 * @property {boolean} confirmingDelete - whether delete is being confirmed
 */

// ============================================================================
// MIGRATION UTILITIES
// TODO: Remove this once we've migrated all tasks to the new DateTime format
// ============================================================================

/**
 * Migrate tasks from legacy time format to new DateTime format
 * @param {Task[]} tasks - Array of tasks that may need migration
 * @returns {Task[]} - Migrated tasks with DateTime fields
 */
function migrateTasks(tasks) {
    const today = extractDateFromDateTime(new Date()); // Today in YYYY-MM-DD format

    return tasks.map((task) => {
        // If task already has DateTime fields, no migration needed
        if (task.startDateTime && task.endDateTime) {
            return task;
        }

        // Skip migration if task doesn't have startTime (malformed task)
        if (!task.startTime) {
            logger.error('migrateTasks: Task is malformed and has no startTime', task);
            return task;
        }

        // Migrate legacy time fields to DateTime
        const startDateTime = timeToDateTime(task.startTime, today);
        const endDateTime = calculateEndDateTime(startDateTime, task.duration);

        return {
            ...task,
            startDateTime,
            endDateTime
        };
    });
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/** @type {Task[]} */
let tasks = [];

// Caching for sorted tasks and filtering results
let sortedTasksCache = null;
let sortedTasksCacheVersion = 0;
let currentTasksVersion = 0;

/**
 * Get the current task state.
 * @returns {Task[]} The tasks array.
 */
export function getTaskState() {
    return tasks;
}

/**
 * Update the task state with a new array of tasks.
 * Invalidates caches and ensures all tasks have cached time values
 * @param {Task[]} newTasks - The new array of tasks.
 */
export function updateTaskState(newTasks) {
    // Migrate tasks to new DateTime format if needed
    tasks = migrateTasks(newTasks || []);

    // Invalidate caches when state changes
    invalidateTaskCaches();

    // Persist any changes to task state
    saveTasks(tasks);
}

// ============================================================================
// CACHE MANAGEMENT UTILITIES
// ============================================================================

// Invalidate caches when tasks change
const invalidateTaskCaches = () => {
    currentTasksVersion++;
    sortedTasksCache = null;
};

// ============================================================================
// SORTING AND TASK UTILITIES
// ============================================================================

// Helper function to sort tasks by start time
const sortTasks = (tasksToSort) => {
    tasksToSort.sort((a, b) => {
        // After migration, all tasks should have DateTime fields
        if (!a.startDateTime || !b.startDateTime) {
            throw new Error('Task missing startDateTime field after migration');
        }

        const aStartTime = new Date(/** @type {string} */ (a.startDateTime));
        const bStartTime = new Date(/** @type {string} */ (b.startDateTime));
        return aStartTime.getTime() - bStartTime.getTime();
    });
};

// Get sorted tasks with caching
const getSortedTasks = () => {
    if (sortedTasksCache && sortedTasksCacheVersion === currentTasksVersion) {
        return sortedTasksCache;
    }

    // Create a copy to avoid mutating the original array
    sortedTasksCache = [...tasks];
    sortTasks(sortedTasksCache);
    sortedTasksCacheVersion = currentTasksVersion;
    return sortedTasksCache;
};

/**
 * Helper function to create a new task object with default values
 * @param {{description: string, startTime: string, duration: number}} taskData - Task data
 * @returns {Task} A new task object
 */
const createTaskObject = ({ description, startTime, duration }) => {
    // Assumes all tasks will start today, in YYYY-MM-DD format
    const today = extractDateFromDateTime(new Date());

    // Create DateTime fields
    const startDateTime = timeToDateTime(startTime, today);
    const endDateTime = calculateEndDateTime(startDateTime, duration);

    const task = {
        description,
        startDateTime,
        endDateTime,
        duration,
        status: 'incomplete',
        editing: false,
        confirmingDelete: false
    };
    return task;
};

// Helper function to finalize task modifications (sort and save)
const finalizeTaskModification = () => {
    invalidateTaskCaches(); // Clears sortedTasksCache

    // Create a new sorted list directly from the current state of global tasks
    const currentTasksCopy = [...tasks]; // Fresh copy of potentially modified (e.g. spliced) tasks
    sortTasks(currentTasksCopy); // Sort this fresh copy

    // Update the main tasks array to maintain sort order
    tasks.splice(0, tasks.length, ...currentTasksCopy);
    saveTasks(tasks); // Save the now sorted global tasks array
};

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Check if task data is valid.
 * @param {string} description - Task description.
 * @param {number} duration - Task duration in minutes.
 * @returns {{isValid: boolean, reason?: string}} Validation result.
 */
export function isValidTaskData(description, duration) {
    if (!description || description.trim() === '') {
        return { isValid: false, reason: 'Description cannot be empty.' };
    }
    if (isNaN(duration) || duration <= 0) {
        return { isValid: false, reason: 'Duration must be a positive number.' };
    }
    return { isValid: true };
}

// ============================================================================
// UI STATE MANAGEMENT
// ============================================================================

// Helper function to reset all UI flags for all tasks
const resetAllUIFlags = () => {
    tasks.forEach((task) => {
        task.editing = false;
        task.confirmingDelete = false;
    });
};

/**
 * Resets all 'confirmingDelete' flags to false for all tasks.
 * Useful when a global click occurs, and we want to cancel any pending delete confirmations.
 */
export function resetAllConfirmingDeleteFlags() {
    let changed = false;
    tasks.forEach((task) => {
        if (task.confirmingDelete) {
            task.confirmingDelete = false;
            changed = true;
        }
    });
    // No sort or save needed as this is a transient UI state.
    return changed;
}

/**
 * Resets all 'editing' flags to false for all tasks.
 * Useful for cancelling edits on out-click, if not clicking specific save/cancel buttons.
 */
export function resetAllEditingFlags() {
    let changed = false;
    tasks.forEach((task) => {
        if (task.editing) {
            task.editing = false;
            changed = true;
        }
    });
    // No sort or save needed as this is a transient UI state.
    return changed;
}

// ============================================================================
// OVERLAP DETECTION AND SCHEDULING
// ============================================================================

/**
 * Determines if two tasks have overlapping time periods.
 * @param {Task} task1 - First task
 * @param {Task} task2 - Second task
 * @returns {boolean} - Whether tasks overlap
 */
export function tasksOverlap(task1, task2) {
    const { startDate: start1, endDate: end1 } = getTaskDates(task1);
    const { startDate: start2, endDate: end2 } = getTaskDates(task2);
    return start1 < end2 && start2 < end1;
}

/**
 * Check for overlapping tasks.
 * Uses simplified DateTime-based overlap detection
 * @param {Task} taskToCompare - The task to check against.
 * @param {Task[]} existingTasks - The list of tasks to check for overlaps.
 * @returns {Task[]} - Array of overlapping tasks.
 */
export function checkOverlap(taskToCompare, existingTasks) {
    // Early termination if no existing tasks
    if (existingTasks.length === 0) {
        return [];
    }

    const overlappingTasks = [];

    // Simple overlap detection using DateTime comparisons
    for (const task of existingTasks) {
        // Skip self, completed tasks, and editing tasks
        if (task === taskToCompare || task.status === 'completed' || task.editing) {
            continue;
        }

        if (tasksOverlap(taskToCompare, task)) {
            overlappingTasks.push(task);
        }
    }

    return overlappingTasks;
}

/**
 * Perform reschedule of tasks.
 *
 * Processes tasks in chronological order for predictable behavior
 * Uses a Set to track processed tasks, preventing infinite loops
 *
 * @param {Task} taskThatChanged - The task that triggered the reschedule.
 * @param {Task} [actualTaskRef] - Optional direct reference to the actual task (when called from update functions)
 */
export function performReschedule(taskThatChanged, actualTaskRef = undefined) {
    let actualTask = actualTaskRef;

    if (!actualTask) {
        actualTask =
            tasks.find(
                (t) =>
                    t.description === taskThatChanged.description &&
                    t.startDateTime === taskThatChanged.startDateTime
            ) || undefined;
        if (!actualTask) {
            logger.warn('performReschedule: Could not find task in global state', taskThatChanged);
            return;
        }
    }

    if (taskThatChanged.duration !== actualTask.duration) {
        actualTask.duration = taskThatChanged.duration;
        if (actualTask.startDateTime) {
            actualTask.endDateTime = calculateEndDateTime(
                actualTask.startDateTime,
                actualTask.duration
            );
        } else {
            logger.warn(
                'performReschedule: actualTask missing startDateTime for duration update',
                actualTask
            );
            return;
        }
    }

    const originalEditingState = actualTask.editing;
    actualTask.editing = false;

    // Get a sorted list of all tasks once at the beginning.
    // This list's order is for the optimized break condition.
    // The task objects within are references to the global tasks, so their properties will update.
    const sortedAllTasksView = getSortedTasks();

    // tasksToProcess will contain tasks that need to have their overlaps checked and resolved.
    // processedTasks tracks tasks that have been added to tasksToProcess to avoid redundant queueing.
    const tasksToProcess = [actualTask];
    const processedTasks = new Set([actualTask]);
    let headIndex = 0;

    while (headIndex < tasksToProcess.length) {
        const currentTask = tasksToProcess[headIndex++];

        if (!currentTask || !currentTask.startDateTime || !currentTask.endDateTime) {
            logger.warn('performReschedule: Invalid currentTask in queue', currentTask);
            continue;
        }

        // Iterate through all other relevant tasks to check for overlaps with currentTask.
        // sortedAllTasksView is used for a potentially optimized iteration order.
        for (const taskToCompare of sortedAllTasksView) {
            // Skip if taskToCompare is the current task, completed, editing, or already the current task itself.
            if (
                taskToCompare === currentTask ||
                taskToCompare.status === 'completed' ||
                taskToCompare.editing
            ) {
                continue;
            }

            if (!taskToCompare.startDateTime || typeof taskToCompare.duration !== 'number') {
                logger.warn('performReschedule: Invalid taskToCompare found', taskToCompare);
                continue;
            }

            // Optimization: If taskToCompare (in its current state) starts after currentTask ends,
            // it (and subsequent sorted tasks) cannot overlap with currentTask's current position.
            if (new Date(taskToCompare.startDateTime) >= new Date(currentTask.endDateTime)) {
                break; // Assumes sortedAllTasksView is sorted by start times
            }

            if (tasksOverlap(currentTask, taskToCompare)) {
                const newStartDateTimeStr = currentTask.endDateTime;
                const newEndDateTimeStr = calculateEndDateTime(
                    newStartDateTimeStr,
                    taskToCompare.duration
                );

                // Update the task that needs to be shifted
                taskToCompare.startDateTime = newStartDateTimeStr;
                taskToCompare.endDateTime = newEndDateTimeStr;

                // If this shifted task hasn't been queued for its own processing turn, add it.
                if (!processedTasks.has(taskToCompare)) {
                    processedTasks.add(taskToCompare);
                    tasksToProcess.push(taskToCompare);
                }
            }
        }
    }

    actualTask.editing = originalEditingState;
}

/**
 * Get the suggested start time for a new task based on current schedule availability.
 *
 * Logic:
 * 1. If no incomplete tasks exist, suggests the current time rounded up to the nearest 5 minutes
 * 2. If the current time slot is occupied (by an incomplete task), suggests the end time of the latest incomplete task
 * 3. If the current time slot is available:
 *    - If there are existing tasks (including completed ones) before the current time (filling a gap), suggests current time rounded up
 *    - If there are no existing tasks before the current time (planning ahead), suggests end time of latest task
 *
 * This ensures new tasks fill schedule gaps when appropriate, or continue planning from the latest task.
 *
 * @returns {string} Suggested start time in 24-hour format (HH:MM)
 */
export function getSuggestedStartTime() {
    const currentTimeRounded = getCurrentTimeRounded();
    const currentMinutes = calculateMinutes(currentTimeRounded);

    let latestTaskEndTime = null;
    let latestTaskEndMinutes = -1;
    let hasTaskAtCurrentTime = false;
    let hasTasksBeforeCurrentTime = false;
    let incompleteTaskCount = 0;

    for (const task of tasks) {
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

    // if no incomplete tasks exist
    if (incompleteTaskCount === 0) {
        return currentTimeRounded;
    }

    // if current time slot is occupied, use end time of latest task
    if (hasTaskAtCurrentTime) {
        return latestTaskEndTime || currentTimeRounded;
    }

    // if current time slot is available
    if (hasTasksBeforeCurrentTime) {
        // filling a gap - use current time
        return currentTimeRounded;
    } else {
        // planning ahead - use end time of latest task
        return latestTaskEndTime || currentTimeRounded;
    }
}

// ============================================================================
// CONFIRMATION HELPERS
// ============================================================================

/**
 * Helper function to create overlap confirmation response
 * @param {string} operation - The operation type (e.g., 'ADD', 'EDIT')
 * @param {Object} data - Additional data to include in the response
 * @param {string} reason - The reason message for the confirmation
 * @returns {{success: boolean, requiresConfirmation: boolean, confirmationType: string, reason: string}} Overlap confirmation response object
 */
const createOverlapConfirmation = (operation, data, reason) => {
    return {
        success: false,
        requiresConfirmation: true,
        confirmationType: `RESCHEDULE_${operation}`,
        ...data,
        reason
    };
};

// ============================================================================
// CORE TASK OPERATIONS
// ============================================================================

/**
 * Add a new task.
 * @param {{description: string, startTime: string, duration: number}} taskData
 * @returns {{success: boolean, task?: Task, reason?: string, requiresConfirmation?: boolean, confirmationType?: string, taskData?: any}}
 */
export function addTask({ description, startTime, duration }) {
    const validation = isValidTaskData(description, duration);
    if (!validation.isValid) {
        return { success: false, reason: validation.reason };
    }

    const newTask = createTaskObject({ description, startTime, duration });

    const overlaps = checkOverlap(newTask, tasks);
    if (overlaps.length > 0) {
        return createOverlapConfirmation(
            'ADD',
            { taskData: { description, startTime, duration } },
            'Adding this task will overlap with existing tasks. Would you like to reschedule the other tasks?'
        );
    }

    tasks.push(newTask);
    performReschedule(newTask); // Reschedule based on newTask's impact
    finalizeTaskModification(); // Single sort and save at the end
    return { success: true, task: newTask };
}

/**
 * Confirms adding a task and performs rescheduling.
 * @param {{description: string, startTime: string, duration: number}} taskData
 * @returns {{success: boolean, task?: Task}}
 */
export function confirmAddTaskAndReschedule({ description, startTime, duration }) {
    const newTask = createTaskObject({ description, startTime, duration });
    tasks.push(newTask);
    performReschedule(newTask); // Then reschedule
    finalizeTaskModification(); // Single sort and save at the end
    return { success: true, task: newTask };
}

/**
 * Update an existing task.
 * @param {number} index - Task index.
 * @param {Partial<Pick<Task, 'description' | 'startTime' | 'duration'>>} updatedData - Data to update.
 * @returns {{success: boolean, task?: Task, reason?: string, requiresConfirmation?: boolean, confirmationType?: string, taskIndex?: number, updatedData?: any}}
 */
export function updateTask(index, { description, startTime, duration }) {
    if (index < 0 || index >= tasks.length) {
        return { success: false, reason: 'Invalid task index.' };
    }

    const existingTask = tasks[index];
    const newDescription = description !== undefined ? description : existingTask.description;
    const newDuration = duration !== undefined ? duration : existingTask.duration;

    const validation = isValidTaskData(newDescription, newDuration);
    if (!validation.isValid) {
        return { success: false, reason: validation.reason };
    }

    // Create a temporary task object to check for overlaps without modifying the original yet
    if (startTime === undefined) {
        // Extract startTime from existing DateTime fields if available
        if (existingTask.startDateTime) {
            startTime = extractTimeFromDateTime(new Date(existingTask.startDateTime));
        } else {
            // TODO: remove this fallback once all tasks have startDateTime
            const { startDate } = getTaskDates(existingTask);
            startTime = extractTimeFromDateTime(startDate);
        }
    }

    // Create DateTime fields for the updated task
    const today = extractDateFromDateTime(new Date());
    const startDateTime = timeToDateTime(startTime, today);
    const endDateTime = calculateEndDateTime(startDateTime, newDuration);

    const taskWithUpdates = {
        ...existingTask,
        description: newDescription,
        duration: newDuration,
        startDateTime,
        endDateTime
    };

    // Check overlap against tasks *other* than the one being updated
    const originalEditingStateForCheck = existingTask.editing;
    existingTask.editing = false; // Temporarily set to false for checkOverlap
    const overlaps = checkOverlap(
        taskWithUpdates,
        tasks.filter((t) => t !== existingTask)
    );
    existingTask.editing = originalEditingStateForCheck; // Restore it

    if (overlaps.length > 0) {
        return createOverlapConfirmation(
            'UPDATE',
            { taskIndex: index, updatedData: { description, startTime, duration } },
            'Updating this task may overlap with other tasks. Would you like to reschedule them?'
        );
    }

    // No overlap or confirmed: apply updates
    existingTask.editing = false; // Ensure editing is turned off
    existingTask.description = newDescription;
    existingTask.duration = newDuration;
    existingTask.startDateTime = startDateTime;
    existingTask.endDateTime = endDateTime;

    performReschedule(existingTask);
    finalizeTaskModification(); // Single sort and save at the end

    return { success: true, task: existingTask };
}

/**
 * Confirms updating a task and performs rescheduling.
 * @param {number} index - Task index.
 * @param {{description: string, startTime: string, duration: number}} updatedData - Data to update.
 * @returns {{success: boolean, task?: Task, reason?: string}}
 */
export function confirmUpdateTaskAndReschedule(index, { description, startTime, duration }) {
    if (index < 0 || index >= tasks.length) {
        return { success: false, reason: 'Invalid task index.' };
    }
    const taskToUpdate = tasks[index];

    taskToUpdate.editing = false; // Ensure editing is turned off
    taskToUpdate.description = description !== undefined ? description : taskToUpdate.description;

    let newStartTime = startTime;
    if (newStartTime === undefined) {
        // Extract startTime from existing DateTime fields
        if (taskToUpdate.startDateTime) {
            newStartTime = extractTimeFromDateTime(new Date(taskToUpdate.startDateTime));
        } else {
            throw new Error('Task must have startDateTime field after migration');
        }
    }

    taskToUpdate.duration = duration !== undefined ? duration : taskToUpdate.duration;

    // Calculate and update DateTime fields
    const today = extractDateFromDateTime(new Date());
    const startDateTime = timeToDateTime(newStartTime, today);
    const endDateTime = calculateEndDateTime(startDateTime, taskToUpdate.duration);
    taskToUpdate.startDateTime = startDateTime;
    taskToUpdate.endDateTime = endDateTime;

    performReschedule(taskToUpdate, taskToUpdate); // Pass direct reference
    finalizeTaskModification(); // Single sort and save at the end
    return { success: true, task: taskToUpdate };
}

/**
 * Mark a task as completed.
 * @param {number} index - Task index.
 * @param {string} [currentTime24Hour] - Optional current time in 24-hour format (HH:MM) from UI.
 * @returns {{success: boolean, task?: Task, reason?: string, requiresConfirmation?: boolean, confirmationType?: string, oldEndTime?: string, newEndTime?: string, newDuration?: number}}
 */
export function completeTask(index, currentTime24Hour) {
    if (index < 0 || index >= tasks.length) {
        return { success: false, reason: 'Invalid task index.' };
    }
    const task = tasks[index];

    if (currentTime24Hour) {
        const currentTimeMinutes = calculateMinutes(currentTime24Hour);

        // Extract start and end times from DateTime fields
        const { startDate, endDate } = getTaskDates(task);
        const taskStartTime = extractTimeFromDateTime(startDate);
        const taskEndTime = extractTimeFromDateTime(endDate);
        const taskStartTimeMinutes = calculateMinutes(taskStartTime);
        const taskEndTimeMinutes = calculateMinutes(taskEndTime);

        if (currentTimeMinutes > taskEndTimeMinutes) {
            // Task finished late.
            const newEndTime = currentTime24Hour;
            const newDuration = Math.max(0, currentTimeMinutes - taskStartTimeMinutes);
            // Do not modify the task directly.
            return {
                success: true,
                task: { ...task }, // Return a copy
                requiresConfirmation: true,
                confirmationType: 'COMPLETE_LATE',
                oldEndTime: taskEndTime,
                newEndTime,
                newDuration
            };
        } else if (
            currentTimeMinutes < taskEndTimeMinutes &&
            currentTimeMinutes >= taskStartTimeMinutes
        ) {
            // Task finished early - update duration and DateTime fields
            task.duration = Math.max(0, currentTimeMinutes - taskStartTimeMinutes);
            task.status = 'completed';

            // Update DateTime fields
            if (task.startDateTime) {
                task.endDateTime = calculateEndDateTime(task.startDateTime, task.duration);
            } else {
                throw new Error('Task must have startDateTime field after migration');
            }

            finalizeTaskModification(); // Single sort and save at the end
            return { success: true, task };
        }
    }

    // If currentTime24Hour is not provided or task finished on time
    task.status = 'completed';
    finalizeTaskModification(); // Single sort and save at the end
    return { success: true, task };
}

/**
 * Confirm completion of a task that finished late, updating its schedule.
 * @param {number} index - Task index.
 * @param {string} newEndTime - The new end time in 24-hour format.
 * @param {number} newDuration - The new duration in minutes.
 * @returns {{success: boolean, task?: Task, reason?: string}}
 */
export function confirmCompleteLate(index, newEndTime, newDuration) {
    if (index < 0 || index >= tasks.length) {
        return { success: false, reason: 'Invalid task index.' };
    }
    const task = tasks[index];

    task.editing = false; // Ensure editing is turned off before reschedule
    task.status = 'completed';
    task.duration = newDuration;

    // Update DateTime fields
    if (task.startDateTime) {
        task.endDateTime = calculateEndDateTime(task.startDateTime, task.duration);
    } else {
        throw new Error('Task must have startDateTime field after migration');
    }

    performReschedule(task, task); // Pass direct reference
    finalizeTaskModification(); // Single sort and save at the end
    return { success: true, task };
}

/**
 * Mark a task for editing state.
 * @param {number} index - Task index.
 * @returns {{success: boolean, task?: Task, reason?: string}}
 */
export function editTask(index) {
    if (index < 0 || index >= tasks.length) {
        return { success: false, reason: 'Invalid task index.' };
    }

    // Reset all UI flags first, then set editing for the target task
    resetAllUIFlags();
    tasks[index].editing = true;

    // No sort or save needed as editing is a transient UI state not affecting logical order.
    return { success: true, task: tasks[index] };
}

/**
 * Cancel editing a task by clearing its editing state.
 * @param {number} index - Task index.
 * @returns {{success: boolean, task?: Task, reason?: string}}
 */
export function cancelEdit(index) {
    if (index < 0 || index >= tasks.length) {
        return { success: false, reason: 'Invalid task index.' };
    }
    if (tasks[index]) {
        tasks[index].editing = false;
    }
    // No sort or save needed as editing is a transient UI state.
    return { success: true, task: tasks[index] };
}

/**
 * Delete a task.
 * @param {number} index - Task index.
 * @param {boolean} confirmed - Whether the delete was confirmed by the user.
 * @returns {{success: boolean, requiresConfirmation?: boolean, reason?: string, message?: string}}
 */
export function deleteTask(index, confirmed = false) {
    if (index < 0 || index >= tasks.length) {
        return { success: false, reason: 'Invalid task index.' };
    }

    if (!confirmed) {
        if (tasks[index]) {
            tasks[index].confirmingDelete = true;
        } else {
            logger.error(
                `Task not found at index ${index} for delete confirmation. Tasks length: ${tasks.length}`
            );
            return { success: false, reason: 'Task not found at index for confirmation.' };
        }
        return {
            success: false,
            requiresConfirmation: true,
            reason: 'Confirmation required to delete task.'
        };
    }

    tasks.splice(index, 1);
    resetAllUIFlags(); // Reset all UI flags
    finalizeTaskModification(); // Single sort and save at the end
    return { success: true, message: 'Task deleted successfully.' };
}

/**
 * Delete all tasks.
 * @returns {{success: boolean, message?: string, tasksDeleted?: number, reason?: string}}
 */
export function deleteAllTasks() {
    if (tasks.length === 0) {
        return {
            success: true,
            tasksDeleted: 0
        };
    }

    const numTasksDeleted = tasks.length;
    updateTaskState([]); // note: calls saveTasks
    return {
        success: true,
        tasksDeleted: numTasksDeleted
    };
}

// ============================================================================
// OPTIMIZATION NOTES AND FUTURE IMPROVEMENTS
// ============================================================================

// TODO: Future optimization - Consider implementing debounced state persistence for high-frequency operations
// This would batch multiple rapid updates to reduce localStorage writes, but adds complexity.
// Implementation would involve:
// - Debouncing finalizeTaskModification() with ~100ms delay for non-critical operations
// - Immediate persistence for critical operations (delete, complete)
// - Timer management to prevent memory leaks
// Only implement if performance profiling shows localStorage writes are a bottleneck.
