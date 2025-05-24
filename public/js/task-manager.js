import {
    calculateMinutes,
    calculateEndTime,
    tasksOverlap,
    convertTo24HourTime,
    // convertTo12HourTime, // Not directly used by task logic, more for rendering
    getCurrentTimeRounded
} from './utils.js';
import { saveTasks } from './storage.js';

// Helper function to sort tasks by start time
const sortTasks = (tasksToSort) => {
    tasksToSort.sort((a, b) => calculateMinutes(a.startTime) - calculateMinutes(b.startTime));
};

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

/**
 * Get the current list of tasks.
 * @returns {Task[]} The tasks array.
 */
export function getTasks() {
    return tasks;
}

/**
 * Set the tasks list. Also updates localStorage.
 * @param {Task[]} newTasks - The new array of tasks.
 */
export function setTasks(newTasks) {
    tasks = newTasks || [];
    // No direct sortTasks(tasks) here; saveTasks is responsible for saving the current state.
    // Sorting is applied by functions that modify the task list order.
    saveTasks(tasks);
}

/**
 * Check if task data is valid.
 * @param {string} description - Task description.
 * @param {number} duration - Task duration in minutes.
 * @returns {{isValid: boolean, reason?: string}} Validation result.
 */
export function isValidTaskData(description, duration) {
    if (!description || description.trim() === "") {
        return { isValid: false, reason: "Description cannot be empty." };
    }
    if (isNaN(duration) || duration <= 0) {
        return { isValid: false, reason: "Duration must be a positive number." };
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
    return existingTasks.filter(task =>
        task !== taskToCompare &&
        task.status !== 'completed' &&
        !task.editing && // Important: do not consider tasks currently being edited by the user as fixed for rescheduling
        tasksOverlap(taskToCompare, task)
    );
}

/**
 * Perform reschedule of tasks.
 * @param {Task} taskThatChanged - The task that triggered the reschedule.
 * @param {Task[]} allCurrentTasks - All tasks in the system.
 */
export function performReschedule(taskThatChanged, allCurrentTasks) {
    // Ensure the task that changed is not considered for being shifted by itself in this run
    // and is also not considered 'editing' in the context of schedulable tasks.
    const originalEditingState = taskThatChanged.editing;
    taskThatChanged.editing = false; // Temporarily set to false for logic

    // Identify tasks that overlap with taskThatChanged and need to be shifted.
    // These are schedulable tasks whose current startTime is before taskThatChanged.endTime
    // AND they actually overlap taskThatChanged.
    const tasksToShift = allCurrentTasks.filter(t =>
        t !== taskThatChanged &&
        t.status !== 'completed' &&
        !t.editing &&
        tasksOverlap(t, taskThatChanged) // Ensure they actually overlap
    ).sort((a, b) => calculateMinutes(a.startTime) - calculateMinutes(b.startTime)); // Process in their current start order

    let currentCascadeEndTime = taskThatChanged.endTime;

    for (const task of tasksToShift) {
        // If the task (which we know overlaps taskThatChanged) starts before the current cascade end time,
        // it means it needs to be shifted.
        if (calculateMinutes(task.startTime) < calculateMinutes(currentCascadeEndTime)) {
            task.startTime = currentCascadeEndTime;
            task.endTime = calculateEndTime(task.startTime, task.duration);
            // This task has been shifted, so it becomes the new point for the cascade.
            currentCascadeEndTime = task.endTime; 
            // Recursively reschedule based on this shifted task, as it might affect others.
            performReschedule(task, allCurrentTasks); 
        }
        // If a task in tasksToShift already starts at/after currentCascadeEndTime,
        // it means a previous shift (or taskThatChanged itself) already pushed the cascade
        // beyond this task's original start. The recursive calls should handle this.
        // No, if it's in tasksToShift, it means it overlapped the *original* taskThatChanged.
        // It *must* be shifted if its current startTime < currentCascadeEndTime.
    }

    taskThatChanged.editing = originalEditingState; // Restore original state
}


/**
 * Get the suggested start time for a new task.
 * Uses the end time of the latest non-completed task if any exist,
 * otherwise uses the current time rounded up.
 * @returns {string} - Suggested start time in 24-hour format (HH:MM).
 */
export function getSuggestedStartTime() {
    const sortedIncompleteTasks = [...tasks]
        .filter(t => t.status !== 'completed')
        .sort((a, b) => calculateMinutes(a.startTime) - calculateMinutes(b.startTime));

    if (sortedIncompleteTasks.length === 0) {
        return getCurrentTimeRounded();
    }
    return sortedIncompleteTasks[sortedIncompleteTasks.length - 1].endTime;
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

    const newTask = {
        description,
        startTime,
        duration,
        endTime: calculateEndTime(startTime, duration),
        status: "incomplete",
        editing: false,
        confirmingDelete: false,
    };

    const overlaps = checkOverlap(newTask, tasks);
    if (overlaps.length > 0) {
        return {
            success: false,
            requiresConfirmation: true,
            confirmationType: 'RESCHEDULE_ADD',
            taskData: { description, startTime, duration }, // Pass original data back
            reason: "Adding this task may overlap with existing tasks. Would you like to reschedule the other tasks?"
        };
    }

    tasks.push(newTask);
    sortTasks(tasks); // Sort to place newTask correctly
    performReschedule(newTask, tasks); // Reschedule based on newTask's impact
    sortTasks(tasks); // Final sort to ensure canonical order after potential shifts
    saveTasks(tasks);
    return { success: true, task: newTask };
}

/**
 * Confirms adding a task and performs rescheduling.
 * @param {{description: string, startTime: string, duration: number}} taskData
 * @returns {{success: boolean, task?: Task}}
 */
export function confirmAddTaskAndReschedule({ description, startTime, duration }) {
    const newTask = {
        description,
        startTime,
        duration,
        endTime: calculateEndTime(startTime, duration),
        status: "incomplete",
        editing: false, // Ensure editing is false
        confirmingDelete: false,
    };
    tasks.push(newTask);
    sortTasks(tasks); // Sort first
    performReschedule(newTask, tasks); // Then reschedule
    sortTasks(tasks); // Final sort
    saveTasks(tasks);
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
        return { success: false, reason: "Invalid task index." };
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
        ...existingTask, // Maintain original non-updated properties like status
        description: newDescription,
        startTime: startTime !== undefined ? startTime : existingTask.startTime,
        duration: newDuration,
    };
    taskWithUpdates.endTime = calculateEndTime(taskWithUpdates.startTime, taskWithUpdates.duration);

    // Check overlap against tasks *other* than the one being updated
    // For checkOverlap, the task being compared (taskWithUpdates) should not be considered 'editing'
    // This requires a slight adjustment if existingTask.editing was true.
    const originalEditingStateForCheck = existingTask.editing;
    existingTask.editing = false; // Temporarily set to false for checkOverlap
    const overlaps = checkOverlap(taskWithUpdates, tasks.filter(t => t !== existingTask));
    existingTask.editing = originalEditingStateForCheck; // Restore it

    if (overlaps.length > 0) {
        return {
            success: false,
            requiresConfirmation: true,
            confirmationType: 'RESCHEDULE_UPDATE',
            taskIndex: index,
            updatedData: { description, startTime, duration }, // Pass original updates
            reason: "Updating this task may overlap with other tasks. Would you like to reschedule them?"
        };
    }

    // No overlap or confirmed: apply updates
    existingTask.editing = false; // Ensure editing is turned off
    existingTask.description = newDescription;
    existingTask.startTime = startTime !== undefined ? startTime : existingTask.startTime;
    existingTask.duration = newDuration;
    existingTask.endTime = taskWithUpdates.endTime; // Calculated above

    performReschedule(existingTask, tasks);
    sortTasks(tasks);
    saveTasks(tasks);

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
        return { success: false, reason: "Invalid task index." };
    }
    const taskToUpdate = tasks[index];

    taskToUpdate.editing = false; // Ensure editing is turned off
    taskToUpdate.description = description !== undefined ? description : taskToUpdate.description;
    taskToUpdate.startTime = startTime !== undefined ? startTime : taskToUpdate.startTime;
    taskToUpdate.duration = duration !== undefined ? duration : taskToUpdate.duration;
    taskToUpdate.endTime = calculateEndTime(taskToUpdate.startTime, taskToUpdate.duration);

    performReschedule(taskToUpdate, tasks);
    sortTasks(tasks);
    saveTasks(tasks);
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
        return { success: false, reason: "Invalid task index." };
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
                newEndTime: newEndTime,
                newDuration: newDuration
            };
        } else if (currentTimeMinutes < taskEndTimeMinutes && currentTimeMinutes >= taskStartTimeMinutes) {
            // Task finished early.
            task.endTime = currentTime24Hour;
            task.duration = Math.max(0, currentTimeMinutes - taskStartTimeMinutes);
            task.status = "completed"; // Also mark as completed
            sortTasks(tasks); // Sort as status change might affect order with filters
            saveTasks(tasks);
            return { success: true, task: task };
        }
    }

    // If currentTime24Hour is not provided or task finished on time
    task.status = "completed";
    sortTasks(tasks); // Sort as status change might affect order with filters
    saveTasks(tasks);
    return { success: true, task: task };
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
        return { success: false, reason: "Invalid task index." };
    }
    const task = tasks[index];

    task.editing = false; // Ensure editing is turned off before reschedule
    task.status = "completed";
    task.endTime = newEndTime;
    task.duration = newDuration;

    performReschedule(task, tasks); // task.editing is already false
    sortTasks(tasks);
    saveTasks(tasks);
    return { success: true, task: task };
}

/**
 * Delete a task.
 * @param {number} index - Task index.
 * @param {boolean} confirmed - Whether the delete was confirmed by the user.
 * @returns {{success: boolean, requiresConfirmation?: boolean, reason?: string, message?: string}}
 */
export function deleteTask(index, confirmed = false) {
    if (index < 0 || index >= tasks.length) {
         return { success: false, reason: "Invalid task index." };
    }

    if (!confirmed) {
        if (tasks[index]) {
            tasks[index].confirmingDelete = true;
        } else {
            // TODO: Consider logging this unexpected state.
            return { success: false, reason: "Task not found at index for confirmation."};
        }
        return { success: false, requiresConfirmation: true, reason: "Confirmation required to delete task." };
    }

    tasks.splice(index, 1);
    tasks.forEach(t => t.confirmingDelete = false); // Reset flag for all, just in case
    sortTasks(tasks); // Deletion might change order if sorted by something other than index
    saveTasks(tasks);
    return { success: true, message: "Task deleted successfully." };
    // TODO: Consider if performReschedule is needed for tasks that were after the deleted one, if time gaps are not desired.
    // For now, deleting a task does not trigger rescheduling of subsequent tasks.
}

// Removed old autoReschedule function.

/**
 * Mark a task for editing state.
 * @param {number} index - Task index.
 * @returns {{success: boolean, task?: Task, reason?: string}}
 */
export function editTask(index) {
    if (index < 0 || index >= tasks.length) {
        return { success: false, reason: "Invalid task index." };
    }
    tasks.forEach((task, i) => {
        task.editing = (i === index); // Set editing for the current task
        if (i !== index) task.confirmingDelete = false; // Reset delete confirmation for others
    });
    // Ensure the current task's delete confirmation is also reset if it was set
    if (tasks[index]) {
        tasks[index].confirmingDelete = false;
    }
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
        return { success: false, reason: "Invalid task index." };
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
        return { success: true, message: "No tasks to delete.", tasksDeleted: 0 };
    }
    if (!confirmed) {
        isDeleteAllPendingConfirmation = true;
        // No sort needed as this is a confirmation step.
        return { success: false, requiresConfirmation: true, reason: "Are you sure you want to delete all tasks?" };
    }

    const numTasksDeleted = tasks.length;
    setTasks([]); // setTasks calls saveTasks. The list is empty, so sorting is trivial.
    isDeleteAllPendingConfirmation = false;
    return { success: true, message: "All tasks deleted.", tasksDeleted: numTasksDeleted };
}

/**
 * Resets all 'confirmingDelete' flags to false for all tasks.
 * Useful when a global click occurs, and we want to cancel any pending delete confirmations.
 */
export function resetAllConfirmingDeleteFlags() {
    let changed = false;
    tasks.forEach(task => {
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
    tasks.forEach(task => {
        if (task.editing) {
            task.editing = false;
            changed = true;
        }
    });
    // No sort or save needed as this is a transient UI state.
    return changed;
}
