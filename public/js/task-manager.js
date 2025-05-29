import { calculateMinutes, calculateEndTime, getCurrentTimeRounded, logger } from './utils.js';
import { saveTasks } from './storage.js';

/**
 * @typedef {Object} Task
 * @property {string} description - task description
 * @property {string} startTime - start time in 24-hour format (HH:MM)
 * @property {string} endTime - end time in 24-hour format (HH:MM)
 * @property {number} duration - duration in minutes
 * @property {string} status - task status ("incomplete" or "completed")
 * @property {boolean} editing - whether task is being edited
 * @property {boolean} confirmingDelete - whether delete is being confirmed
 * @property {number} [_startMinutes] - cached start time in minutes
 * @property {number} [_endMinutes] - cached end time in minutes
 */

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
    tasks = newTasks || [];

    // Ensure all tasks have cached time values
    for (const task of tasks) {
        ensureTaskTimeCache(task);
    }

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

// Cache time calculations for tasks
const ensureTaskTimeCache = (task) => {
    if (task._startMinutes === undefined) {
        task._startMinutes = calculateMinutes(task.startTime);
    }
    if (task._endMinutes === undefined) {
        task._endMinutes = calculateMinutes(task.endTime);
    }
};

// Invalidate cached time values when task times change
const invalidateTaskTimeCache = (task) => {
    delete task._startMinutes;
    delete task._endMinutes;
};

// ============================================================================
// SORTING AND TASK UTILITIES
// ============================================================================

// Helper function to sort tasks by start time
const sortTasks = (tasksToSort) => {
    tasksToSort.sort((a, b) => calculateMinutes(a.startTime) - calculateMinutes(b.startTime));
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
    const endTime = calculateEndTime(startTime, duration);
    const task = {
        description,
        startTime,
        endTime,
        duration,
        status: 'incomplete',
        editing: false,
        confirmingDelete: false,
        // Cache time calculations at creation
        _startMinutes: calculateMinutes(startTime),
        _endMinutes: calculateMinutes(endTime)
    };
    return task;
};

// Helper function to finalize task modifications (sort and save)
const finalizeTaskModification = () => {
    invalidateTaskCaches(); // Invalidate caches when tasks change
    // Use cached sorted tasks for saving
    const sortedTasks = getSortedTasks();
    // Update the main tasks array to maintain sort order
    tasks.splice(0, tasks.length, ...sortedTasks);
    saveTasks(tasks);
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
 * Handles both normal day tasks and tasks that cross midnight.
 * @param {Task} task1 - First task
 * @param {Task} task2 - Second task
 * @returns {boolean} - Whether tasks overlap
 */
export function tasksOverlap(task1, task2) {
    // Ensure time calculations are cached
    ensureTaskTimeCache(task1);
    ensureTaskTimeCache(task2);

    // These values are guaranteed to be defined after ensureTaskTimeCache
    const start1 = task1._startMinutes;
    const end1 = task1._endMinutes;
    const start2 = task2._startMinutes;
    const end2 = task2._endMinutes;

    // Safety check - should never happen after ensureTaskTimeCache, but satisfies linter
    if (start1 === undefined || end1 === undefined || start2 === undefined || end2 === undefined) {
        console.error('Task time cache failed - cached time values are undefined');
        // Simple fallback - assume no overlap if cache failed
        return false;
    }

    // Early termination: if both tasks are in normal day (no midnight crossing)
    // and one ends before the other starts, no overlap
    const task1CrossesMidnight = end1 < start1;
    const task2CrossesMidnight = end2 < start2;

    if (!task1CrossesMidnight && !task2CrossesMidnight) {
        // Standard interval overlap check with early termination
        return start1 < end2 && start2 < end1;
    }

    // Handle midnight crossing cases (less common, so checked after)
    if (task1CrossesMidnight && !task2CrossesMidnight) {
        return start2 < end1 || start2 >= start1;
    }

    if (!task1CrossesMidnight && task2CrossesMidnight) {
        return start1 < end2 || start1 >= start2;
    }

    if (task1CrossesMidnight && task2CrossesMidnight) {
        return true;
    }

    return false;
}

/**
 * Check for overlapping tasks.
 * Uses cached time calculations and optimized overlap detection
 * @param {Task} taskToCompare - The task to check against.
 * @param {Task[]} existingTasks - The list of tasks to check for overlaps.
 * @returns {Task[]} - Array of overlapping tasks.
 */
export function checkOverlap(taskToCompare, existingTasks) {
    // Ensure the task to compare has cached time values
    // First invalidate any potentially stale cached values
    invalidateTaskTimeCache(taskToCompare);
    ensureTaskTimeCache(taskToCompare);

    // Early termination if no existing tasks
    if (existingTasks.length === 0) {
        return [];
    }

    const overlappingTasks = [];

    // Use optimized overlap detection with early termination
    for (const task of existingTasks) {
        // Skip self, completed tasks, and editing tasks
        if (task === taskToCompare || task.status === 'completed' || task.editing) {
            continue;
        }

        // Ensure task has cached time values
        ensureTaskTimeCache(task);

        // Use optimized overlap detection
        if (tasksOverlap(taskToCompare, task)) {
            overlappingTasks.push(task);
        }
    }

    return overlappingTasks;
}

/**
 * Perform reschedule of tasks.
 *
 * OPTIMIZATION NOTES:
 * - Uses cached sorted tasks to avoid redundant sorting
 * - Optimized overlap detection with cached time calculations
 * - Reduced time complexity from O(n²) to O(n log n) in most cases
 * - Eliminated stack overflow risk for large task cascades
 * - Uses a Set to track processed tasks, preventing infinite loops
 * - Processes tasks in chronological order for predictable behavior
 *
 * COMPLEXITY ANALYSIS:
 * - Time: O(n log n) - dominated by cached sorting, queue processing is O(n)
 * - Space: O(n) - for the candidate tasks array, processed set, and queue
 *
 * @param {Task} taskThatChanged - The task that triggered the reschedule.
 */
export function performReschedule(taskThatChanged) {
    const originalEditingState = taskThatChanged.editing;
    taskThatChanged.editing = false;

    // Ensure the task that changed has updated cached values
    invalidateTaskTimeCache(taskThatChanged);
    ensureTaskTimeCache(taskThatChanged);

    // Use cached sorted tasks and filter once
    const sortedTasks = getSortedTasks();
    const candidateTasks = [];

    // Single pass filtering with early termination
    for (const task of sortedTasks) {
        if (task === taskThatChanged || task.status === 'completed' || task.editing) {
            continue;
        }
        candidateTasks.push(task);
    }

    // Track which tasks have been processed to avoid infinite loops
    const processedTasks = new Set();

    // Use a queue to process tasks that need rescheduling
    const tasksToProcess = [taskThatChanged];
    processedTasks.add(taskThatChanged);

    while (tasksToProcess.length > 0) {
        const currentTask = tasksToProcess.shift();
        if (!currentTask) continue; // Safety check, though this should never happen

        // Ensure current task has cached time values
        ensureTaskTimeCache(currentTask);

        // Find all tasks that overlap with the current task and haven't been processed yet
        const overlappingTasks = [];
        for (const task of candidateTasks) {
            if (processedTasks.has(task)) continue;

            // Use optimized overlap detection
            if (tasksOverlap(task, currentTask)) {
                overlappingTasks.push(task);
            }
        }

        let cascadeEndTime = currentTask.endTime;
        let cascadeEndMinutes = currentTask._endMinutes || calculateMinutes(currentTask.endTime);

        for (const overlappingTask of overlappingTasks) {
            // Use cached time calculations
            ensureTaskTimeCache(overlappingTask);
            const taskStartMinutes = overlappingTask._startMinutes;

            // If the task starts before the cascade end time, it needs to be shifted
            if (taskStartMinutes < cascadeEndMinutes) {
                overlappingTask.startTime = cascadeEndTime;
                overlappingTask.endTime = calculateEndTime(
                    overlappingTask.startTime,
                    overlappingTask.duration
                );

                // Update cached values immediately
                overlappingTask._startMinutes = cascadeEndMinutes;
                overlappingTask._endMinutes = calculateMinutes(overlappingTask.endTime);

                cascadeEndTime = overlappingTask.endTime;
                cascadeEndMinutes = overlappingTask._endMinutes;

                // Mark as processed and add to queue for further cascade checking
                processedTasks.add(overlappingTask);
                tasksToProcess.push(overlappingTask);
            }
        }
    }

    taskThatChanged.editing = originalEditingState;
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
    const currentTimeMinutes = calculateMinutes(currentTimeRounded);

    let latestTaskEndTime = null;
    let latestTaskEndMinutes = -1;
    let hasTaskAtCurrentTime = false;
    let hasTasksBeforeCurrentTime = false;
    let incompleteTaskCount = 0;

    for (const task of tasks) {
        const taskStartMinutes = calculateMinutes(task.startTime);
        const taskEndMinutes = calculateMinutes(task.endTime);
        const isTaskCrossingMidnight = taskEndMinutes < taskStartMinutes;

        // only count incomplete tasks for the task count and latest end time
        if (task.status === 'incomplete') {
            incompleteTaskCount++;

            // track latest incomplete task end time
            if (taskEndMinutes > latestTaskEndMinutes) {
                latestTaskEndTime = task.endTime;
                latestTaskEndMinutes = taskEndMinutes;
            }

            // check if current time slot is occupied (only by incomplete tasks)
            if (
                !hasTaskAtCurrentTime &&
                isTimeInTask(
                    currentTimeMinutes,
                    taskStartMinutes,
                    taskEndMinutes,
                    isTaskCrossingMidnight
                )
            ) {
                hasTaskAtCurrentTime = true;
            }
        }

        // check if there are tasks (including completed ones) before current time
        if (!hasTasksBeforeCurrentTime) {
            hasTasksBeforeCurrentTime = taskStartMinutes < currentTimeMinutes;
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

/**
 * Helper function to check if a given time falls within a task's time range
 * @param {number} timeMinutes - Time to check in minutes since midnight
 * @param {number} taskStartMinutes - Task start time in minutes since midnight
 * @param {number} taskEndMinutes - Task end time in minutes since midnight
 * @param {boolean} crossesMidnight - Whether the task crosses midnight
 * @returns {boolean} True if the time falls within the task range
 */
function isTimeInTask(timeMinutes, taskStartMinutes, taskEndMinutes, crossesMidnight) {
    if (crossesMidnight) {
        // task crosses midnight
        return timeMinutes >= taskStartMinutes || timeMinutes < taskEndMinutes;
    } else {
        // normal task
        return timeMinutes >= taskStartMinutes && timeMinutes < taskEndMinutes;
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
    const taskWithUpdates = {
        ...existingTask,
        description: newDescription,
        startTime: startTime !== undefined ? startTime : existingTask.startTime,
        duration: newDuration
    };
    taskWithUpdates.endTime = calculateEndTime(taskWithUpdates.startTime, taskWithUpdates.duration);

    // Ensure the temporary task has cached time values for overlap detection
    // First invalidate any inherited cached values since times may have changed
    invalidateTaskTimeCache(taskWithUpdates);
    ensureTaskTimeCache(taskWithUpdates);

    // Check overlap against tasks *other* than the one being updated
    // For checkOverlap, the task being compared (taskWithUpdates) should not be considered 'editing'
    // This requires a slight adjustment if existingTask.editing was true.
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
    existingTask.startTime = startTime !== undefined ? startTime : existingTask.startTime;
    existingTask.duration = newDuration;
    existingTask.endTime = taskWithUpdates.endTime; // Calculated above

    // Invalidate cached time values since times may have changed
    invalidateTaskTimeCache(existingTask);

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
    taskToUpdate.startTime = startTime !== undefined ? startTime : taskToUpdate.startTime;
    taskToUpdate.duration = duration !== undefined ? duration : taskToUpdate.duration;
    taskToUpdate.endTime = calculateEndTime(taskToUpdate.startTime, taskToUpdate.duration);

    // Invalidate cached time values since times may have changed
    invalidateTaskTimeCache(taskToUpdate);

    performReschedule(taskToUpdate);
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
        const taskStartTimeMinutes = calculateMinutes(task.startTime);
        const taskEndTimeMinutes = calculateMinutes(task.endTime);

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
                oldEndTime: task.endTime,
                newEndTime,
                newDuration
            };
        } else if (
            currentTimeMinutes < taskEndTimeMinutes &&
            currentTimeMinutes >= taskStartTimeMinutes
        ) {
            // Task finished early.
            task.endTime = currentTime24Hour;
            task.duration = Math.max(0, currentTimeMinutes - taskStartTimeMinutes);
            task.status = 'completed'; // Also mark as completed

            // Invalidate cached time values since times changed
            invalidateTaskTimeCache(task);

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
    task.endTime = newEndTime;
    task.duration = newDuration;

    // Invalidate cached time values since times changed
    invalidateTaskTimeCache(task);

    performReschedule(task); // task.editing is already false
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
        message: 'All tasks deleted successfully.',
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
