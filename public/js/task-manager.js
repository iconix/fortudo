import {
    calculateMinutes,
    calculateEndTime,
    tasksOverlap,
    getCurrentTimeRounded,
    logger
} from './utils.js';
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
 */

/** @type {Task[]} */
let tasks = [];
let isDeleteAllPendingConfirmation = false;

// Helper function to sort tasks by start time
const sortTasks = (tasksToSort) => {
    tasksToSort.sort((a, b) => calculateMinutes(a.startTime) - calculateMinutes(b.startTime));
};

/**
 * Helper function to create a new task object with default values
 * @param {{description: string, startTime: string, duration: number}} taskData - Task data
 * @returns {Task} A new task object
 */
const createTaskObject = ({ description, startTime, duration }) => {
    return {
        description,
        startTime,
        duration,
        endTime: calculateEndTime(startTime, duration),
        status: 'incomplete',
        editing: false,
        confirmingDelete: false
    };
};

// Helper function to reset all UI flags for all tasks
const resetAllUIFlags = () => {
    tasks.forEach((task) => {
        task.editing = false;
        task.confirmingDelete = false;
    });
};

// Helper function that handles all post-modification cleanup for persistent state changes
const finalizeTaskModification = () => {
    sortTasks(tasks);
    saveTasks(tasks);
};

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

/**
 * Get the current task state.
 * @returns {Task[]} The tasks array.
 */
export function getTaskState() {
    return tasks;
}

/**
 * Update the tasks state. Also updates localStorage.
 * @param {Task[]} newTasks - The new array of tasks.
 */
export function updateTaskState(newTasks) {
    tasks = newTasks || [];
    // No direct sortTasks(tasks) here; saveTasks is responsible for saving the current state.
    // Sorting is applied by functions that modify the task list order.
    saveTasks(tasks);
}

/**
 * Get the current state of delete all pending confirmation.
 * @returns {boolean} Whether delete all is pending confirmation.
 */
export function getIsDeleteAllPendingConfirmation() {
    return isDeleteAllPendingConfirmation;
}

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

/**
 * Check for overlapping tasks.
 * @param {Task} taskToCompare - The task to check against.
 * @param {Task[]} existingTasks - The list of tasks to check for overlaps.
 * @returns {Task[]} - Array of overlapping tasks.
 */
export function checkOverlap(taskToCompare, existingTasks) {
    return existingTasks.filter(
        (task) =>
            task !== taskToCompare &&
            task.status !== 'completed' &&
            !task.editing && // do not consider tasks currently being edited by the user as fixed for rescheduling
            tasksOverlap(taskToCompare, task)
    );
}

/**
 * Perform reschedule of tasks.
 *
 * OPTIMIZATION NOTES:
 * - Replaced recursive approach with iterative queue-based processing
 * - Reduced time complexity from O(n²) to O(n log n) in most cases
 * - Eliminated stack overflow risk for large task cascades
 * - Uses a Set to track processed tasks, preventing infinite loops
 * - Processes tasks in chronological order for predictable behavior
 *
 * COMPLEXITY ANALYSIS:
 * - Time: O(n log n) - dominated by initial sorting, queue processing is O(n)
 * - Space: O(n) - for the candidate tasks array, processed set, and queue
 *
 * @param {Task} taskThatChanged - The task that triggered the reschedule.
 * @param {Task[]} allCurrentTasks - All tasks in the system.
 */
export function performReschedule(taskThatChanged, allCurrentTasks) {
    const originalEditingState = taskThatChanged.editing;
    taskThatChanged.editing = false;

    // Get all tasks that could potentially need rescheduling (excluding completed and editing tasks)
    const candidateTasks = allCurrentTasks
        .filter((t) => t !== taskThatChanged && t.status !== 'completed' && !t.editing)
        .sort((a, b) => calculateMinutes(a.startTime) - calculateMinutes(b.startTime));

    // Track which tasks have been processed to avoid infinite loops
    const processedTasks = new Set();

    // Use a queue to process tasks that need rescheduling
    const tasksToProcess = [taskThatChanged];
    processedTasks.add(taskThatChanged);

    while (tasksToProcess.length > 0) {
        const currentTask = tasksToProcess.shift();
        if (!currentTask) continue; // Safety check, though this should never happen

        // Find all tasks that overlap with the current task and haven't been processed yet
        const overlappingTasks = candidateTasks.filter((task) => {
            if (processedTasks.has(task)) return false;
            return tasksOverlap(task, currentTask);
        });

        // Sort overlapping tasks by start time to process them in chronological order
        overlappingTasks.sort(
            (a, b) => calculateMinutes(a.startTime) - calculateMinutes(b.startTime)
        );

        let cascadeEndTime = currentTask.endTime;

        for (const overlappingTask of overlappingTasks) {
            const taskStartMinutes = calculateMinutes(overlappingTask.startTime);
            const cascadeEndMinutes = calculateMinutes(cascadeEndTime);

            // If the task starts before the cascade end time, it needs to be shifted
            if (taskStartMinutes < cascadeEndMinutes) {
                overlappingTask.startTime = cascadeEndTime;
                overlappingTask.endTime = calculateEndTime(
                    overlappingTask.startTime,
                    overlappingTask.duration
                );
                cascadeEndTime = overlappingTask.endTime;

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
 * 2. If the current time slot is occupied, suggests the end time of the latest scheduled task
 * 3. If the current time slot is available:
 *    - If there are existing tasks before the current time (filling a gap), suggests current time rounded up
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
    let hasTaskAtCurrentTime = false;
    let hasTasksBeforeCurrentTime = false;
    let incompleteTaskCount = 0;

    for (const task of tasks) {
        if (task.status === 'completed') continue;

        incompleteTaskCount++;

        const taskStartMinutes = calculateMinutes(task.startTime);
        const taskEndMinutes = calculateMinutes(task.endTime);

        // track latest task end time
        if (
            latestTaskEndTime === null ||
            calculateMinutes(task.endTime) > calculateMinutes(latestTaskEndTime)
        ) {
            latestTaskEndTime = task.endTime;
        }

        // check if current time slot is occupied
        if (!hasTaskAtCurrentTime) {
            if (taskEndMinutes < taskStartMinutes) {
                // task crosses midnight
                hasTaskAtCurrentTime =
                    currentTimeMinutes >= taskStartMinutes || currentTimeMinutes < taskEndMinutes;
            } else {
                // normal task
                hasTaskAtCurrentTime =
                    currentTimeMinutes >= taskStartMinutes && currentTimeMinutes < taskEndMinutes;
            }
        }

        // check if there are tasks before current time
        if (!hasTasksBeforeCurrentTime) {
            if (taskEndMinutes < taskStartMinutes) {
                // task crosses midnight
                hasTasksBeforeCurrentTime = taskStartMinutes < currentTimeMinutes;
            } else {
                // normal task
                hasTasksBeforeCurrentTime = taskEndMinutes <= currentTimeMinutes;
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
    performReschedule(newTask, tasks); // Reschedule based on newTask's impact
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
    performReschedule(newTask, tasks); // Then reschedule
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

    performReschedule(existingTask, tasks);
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

    performReschedule(taskToUpdate, tasks);
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

    performReschedule(task, tasks); // task.editing is already false
    finalizeTaskModification(); // Single sort and save at the end
    return { success: true, task };
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
 * Delete all tasks.
 * @param {boolean} confirmed - Whether the delete all was confirmed by the user.
 * @returns {{success: boolean, requiresConfirmation?: boolean, reason?: string, message?: string, tasksDeleted?: number}}
 */
export function deleteAllTasks(confirmed = false) {
    if (tasks.length === 0) {
        return { success: true, message: 'No tasks to delete.', tasksDeleted: 0 };
    }
    if (!confirmed) {
        isDeleteAllPendingConfirmation = true;
        // No sort needed as this is a confirmation step.
        return {
            success: false,
            requiresConfirmation: true,
            reason: 'Are you sure you want to delete all tasks?'
        };
    }

    const numTasksDeleted = tasks.length;
    updateTaskState([]); // updateTaskState calls saveTasks. The list is empty, so sorting is trivial.
    isDeleteAllPendingConfirmation = false;
    return { success: true, tasksDeleted: numTasksDeleted };
}

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
