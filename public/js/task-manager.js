import {
    calculateMinutes,
    calculateEndTime,
    tasksOverlap,
    convertTo24HourTime,
    // convertTo12HourTime, // Not directly used by task logic, more for rendering
    getCurrentTimeRounded
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
    tasks = newTasks || []; // Ensure tasks is an array
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
 * Auto-reschedule tasks to avoid overlap.
 * This version does not ask for confirmation and proceeds with rescheduling.
 * @param {Task} newTask - The new task to add or update
 * @param {string} trigger - The trigger for the reschedule (e.g., "Adding" or "Updating")
 * @returns {boolean} - True if rescheduling occurred or was not needed.
 */
export function autoReschedule(newTask, trigger = 'Adding') {
    const overlappingTasks = tasks.filter(task =>
        task !== newTask &&
        !task.editing && // Should not reschedule a task that is currently being edited elsewhere (by user)
        task.status !== 'completed' &&
        tasksOverlap(newTask, task)
    );

    if (overlappingTasks.length === 0) {
        return true; // No overlap, no reschedule needed
    }

    // console.log(`${trigger} this task will cause overlap. Auto-rescheduling...`);
    overlappingTasks.sort((a, b) => calculateMinutes(a.startTime) - calculateMinutes(b.startTime));

    let nextStartTime = newTask.endTime;
    for (const task of overlappingTasks) {
        // Avoid modifying the task if it's the same as newTask and being edited (though filter should prevent this)
        // This check is more about avoiding issues if newTask itself is in tasks array and gets picked.
        if (task === newTask) continue;


        task.startTime = nextStartTime;
        task.endTime = calculateEndTime(task.startTime, task.duration);
        nextStartTime = task.endTime;

        // Recursively reschedule. Mark as 'programmatically editing' to avoid issues
        // if 'editing' flag has other meanings (like UI state).
        const originalEditingState = task.editing;
        task.editing = true; // Indicate it's being adjusted by the system
        autoReschedule(task, trigger);
        task.editing = originalEditingState; // Restore original state
    }
    return true; // Rescheduling was attempted/done
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
 * @returns {{success: boolean, task?: Task, reason?: string, requiresConfirmation?: boolean, confirmationType?: string}}
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

    // Check for overlaps before adding
    const initialOverlappingTasks = tasks.filter(task =>
        task !== newTask &&
        !task.editing &&
        task.status !== 'completed' &&
        tasksOverlap(newTask, task)
    );

    if (initialOverlappingTasks.length > 0) {
        // In a future step, dom-handler would use this to ask for confirmation.
        // For now, we proceed as if confirmed, or could return requiresConfirmation.
        // Let's indicate confirmation would be needed.
        // The actual rescheduling will happen if the operation is confirmed by the caller.
        // This means addTask itself won't auto-reschedule without explicit instruction.
        // Or, for this phase, we just do it.
        // Decision: For now, autoReschedule is simplified and does it.
        // If we want user confirmation, autoReschedule itself needs to change or be called conditionally.
        autoReschedule(newTask, 'Adding');
    }

    tasks.push(newTask);
    tasks.sort((a, b) => calculateMinutes(a.startTime) - calculateMinutes(b.startTime));
    saveTasks(tasks);
    return { success: true, task: newTask };
}

/**
 * Update an existing task.
 * @param {number} index - Task index.
 * @param {Partial<Pick<Task, 'description' | 'startTime' | 'duration'>>} updatedData - Data to update.
 * @returns {{success: boolean, task?: Task, reason?: string, requiresConfirmation?: boolean, confirmationType?: string}}
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

    const taskWithUpdates = {
        ...existingTask,
        description: newDescription,
        startTime: startTime !== undefined ? startTime : existingTask.startTime,
        duration: newDuration,
    };
    taskWithUpdates.endTime = calculateEndTime(taskWithUpdates.startTime, taskWithUpdates.duration);


    const originalEditingState = existingTask.editing; // Preserve user's editing state
    existingTask.editing = true; // Mark as programmatically changing for autoReschedule
    autoReschedule(taskWithUpdates, 'Updating');
    existingTask.editing = originalEditingState;


    tasks[index] = { ...taskWithUpdates, editing: false }; // Ensure user editing is off after programmatic update
    tasks.sort((a, b) => calculateMinutes(a.startTime) - calculateMinutes(b.startTime));
    saveTasks(tasks);
    return { success: true, task: tasks[index] };
}

/**
 * Mark a task as completed.
 * @param {number} index - Task index.
 * @param {string} [currentTime24Hour] - Optional current time in 24-hour format (HH:MM) from UI.
 * @returns {{success: boolean, task?: Task, reason?: string, requiresConfirmation?: boolean, confirmationType?: string, oldEndTime?: string, newEndTime?: string}}
 */
export function completeTask(index, currentTime24Hour) {
    if (index < 0 || index >= tasks.length) {
        return { success: false, reason: "Invalid task index." };
    }
    const task = tasks[index];
    task.status = "completed";

    if (currentTime24Hour) {
        const currentTimeMinutes = calculateMinutes(currentTime24Hour);
        const taskStartTimeMinutes = calculateMinutes(task.startTime);
        const taskEndTimeMinutes = calculateMinutes(task.endTime);

        if (currentTimeMinutes > taskEndTimeMinutes) {
            // Task finished late.
            // This is where app.js used to window.confirm.
            // We return info so dom-handler can confirm.
            // For now, let's assume we want to provide this info back.
            // The actual update will be a separate call or based on confirmation.
            // For this phase, let's simplify: if currentTime is provided, we use it.
            const oldEndTime = task.endTime;
            task.endTime = currentTime24Hour;
            task.duration = Math.max(0, currentTimeMinutes - taskStartTimeMinutes); // ensure duration is not negative

            // Mark as programmatically changing for autoReschedule
            const originalEditingState = task.editing;
            task.editing = true;
            autoReschedule(task, "Completing"); // Reschedule subsequent tasks
            task.editing = originalEditingState;

            saveTasks(tasks);
            return { success: true, task, requiresConfirmation: true, confirmationType: 'COMPLETE_LATE', oldEndTime, newEndTime: task.endTime };
        } else if (currentTimeMinutes < taskEndTimeMinutes && currentTimeMinutes >= taskStartTimeMinutes) {
            // Task finished early.
            // Similar to above, this could be a confirmation.
            // For now, just update.
            task.endTime = currentTime24Hour;
            task.duration = Math.max(0, currentTimeMinutes - taskStartTimeMinutes);
            // No reschedule needed if finished early, as it frees up time.
            saveTasks(tasks);
            return { success: true, task };
        }
    }

    // Default case: no time adjustment or not applicable
    saveTasks(tasks);
    return { success: true, task: tasks[index] };
}

/**
 * Delete a task.
 * @param {number} index - Task index.
 * @param {boolean} confirmed - Whether the delete was confirmed by the user.
 * @returns {{success: boolean, requiresConfirmation?: boolean, reason?: string}}
 */
export function deleteTask(index, confirmed = false) {
    if (index < 0 || index >= tasks.length) {
         return { success: false, reason: "Invalid task index." };
    }
    if (!confirmed) {
        tasks[index].confirmingDelete = true; // UI reads this
        // No saveTasks here, it's a UI state.
        return { success: false, requiresConfirmation: true };
    }

    tasks.splice(index, 1);
    tasks.forEach(t => t.confirmingDelete = false); // Clear any other pending confirmations
    saveTasks(tasks);
    return { success: true };
}

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
        task.editing = (i === index);
        task.confirmingDelete = false; // Clear delete confirmation when editing
    });
    // No saveTasks() here as this is a UI state, not persistent data change.
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
    // No saveTasks() here.
    return { success: true, task: tasks[index] };
}

/**
 * Delete all tasks.
 * @param {boolean} confirmed - Whether the delete all was confirmed by the user.
 * @returns {{success: boolean, requiresConfirmation?: boolean}}
 */
export function deleteAllTasks(confirmed = false) {
    if (!confirmed && tasks.length > 0) { // Only require confirmation if there are tasks
        return { success: false, requiresConfirmation: true };
    }

    if (!confirmed) { // If not confirmed, don't proceed
        return { success: false, requiresConfirmation: true };
    }

    // If we get here, confirmed is true
    tasks.length = 0; // Clear the array
    saveTasks(tasks); // Always save when confirmed
    return { success: true };
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
    // This is a UI state change, typically doesn't need saving unless this state itself was persisted.
    // Given 'confirmingDelete' is transient, no saveTasks() here.
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
    // UI state change, no saveTasks().
    return changed;
}
