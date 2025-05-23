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
        // TODO: In a future step, dom-handler would use this to ask for confirmation.
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

    // Preserve ALL tasks' editing states before auto-rescheduling using stable identifiers
    const editingStatesMap = new Map();
    tasks.forEach(task => {
        const taskId = `${task.description}|${task.startTime}`;
        editingStatesMap.set(taskId, task.editing);
    });

    const originalEditingState = existingTask.editing; // Preserve user's editing state
    existingTask.editing = true; // Mark as programmatically changing for autoReschedule

    autoReschedule(taskWithUpdates, 'Updating');

    // Restore ALL tasks' editing states after auto-rescheduling using original identifiers
    tasks.forEach(task => {
        const taskId = `${task.description}|${task.startTime}`;
        // Try the current taskId first
        if (editingStatesMap.has(taskId)) {
            task.editing = editingStatesMap.get(taskId);
        } else {
            // If the task was rescheduled, try to find it by description only
            for (const [storedId, editingState] of editingStatesMap.entries()) {
                const [storedDescription] = storedId.split('|');
                if (storedDescription === task.description) {
                    task.editing = editingState;
                    break;
                }
            }
        }
    });

    // Update the specific task that was edited, preserving its non-editing state
    const updatedTaskIndex = tasks.findIndex(task =>
        task.description === taskWithUpdates.description &&
        task.startTime === taskWithUpdates.startTime &&
        task.duration === taskWithUpdates.duration
    );

    if (updatedTaskIndex !== -1) {
        // Update the task fields without replacing the entire object
        tasks[updatedTaskIndex].description = taskWithUpdates.description;
        tasks[updatedTaskIndex].startTime = taskWithUpdates.startTime;
        tasks[updatedTaskIndex].duration = taskWithUpdates.duration;
        tasks[updatedTaskIndex].endTime = taskWithUpdates.endTime;
        tasks[updatedTaskIndex].editing = false; // The task being updated should not be in edit mode after update
    } else {
        // Fallback: replace by original index if we can't find the updated task
        // TODO: This fallback might not be ideal if the task's position significantly changed due to sorting after rescheduling.
        // Consider if finding by a unique ID (if tasks had one) would be more robust.
        tasks[index] = { ...taskWithUpdates, editing: false };
    }

    tasks.sort((a, b) => calculateMinutes(a.startTime) - calculateMinutes(b.startTime));
    saveTasks(tasks);

    // Return the updated task after sorting
    const finalUpdatedTask = tasks.find(task =>
        task.description === taskWithUpdates.description &&
        task.startTime === taskWithUpdates.startTime &&
        task.duration === taskWithUpdates.duration
    );

    return { success: true, task: finalUpdatedTask || tasks[index] };
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
            // TODO: For this phase, let's simplify: if currentTime is provided, we use it.
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
            // TODO: For now, just update.
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
 * @returns {{success: boolean, requiresConfirmation?: boolean, reason?: string, message?: string}}
 */
export function deleteTask(index, confirmed = false) {
    if (index < 0 || index >= tasks.length) {
         return { success: false, reason: "Invalid task index." };
    }

    if (!confirmed) {
        // --- Begin Original Logic for setting confirmation ---
        if (tasks[index]) { // Check if task exists before modifying
            tasks[index].confirmingDelete = true;
        } else {
            // Should not happen if index is valid, but as a safeguard
            // TODO: Consider logging this unexpected state.
            return { success: false, reason: "Task not found at index for confirmation."};
        }
        // No saveTasks here, it's a UI state that app.js should handle by re-rendering.
        return { success: false, requiresConfirmation: true, reason: "Confirmation required to delete task." };
        // --- End Original Logic for setting confirmation ---
    }

    // --- Begin Original Logic for actual deletion ---
    tasks.splice(index, 1);
    // After a successful deletion, it's good practice to clear any other confirmingDelete flags
    // that might have been set (e.g., if user clicked delete on another task then confirmed this one).
    tasks.forEach(t => t.confirmingDelete = false);
    saveTasks(tasks);
    return { success: true, message: "Task deleted successfully." };
    // --- End Original Logic for actual deletion ---
    // TODO: Consider if autoReschedule is needed for tasks that were after the deleted one, if time gaps are not desired.
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
    // TODO: If editing state needed to be persisted (e.g., across page loads before saving),
    // then saveTasks() would be called here.
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
 * @returns {{success: boolean, requiresConfirmation?: boolean, reason?: string, message?: string}}
 */
export function deleteAllTasks(confirmed = false) {
    if (tasks.length === 0) {
        // If there are no tasks, the operation is vacuously successful.
        // No confirmation is needed, and no save operation is required.
        return { success: true, message: "No tasks to delete." };
    }
    if (!confirmed) {
        // For consistency, use 'reason' if the operation isn't a success yet.
        // TODO: Consider if a specific `confirmingDeleteAll` flag should be set on a global state/app level
        // rather than just returning requiresConfirmation. This could help UI manage this state.
        return { success: false, requiresConfirmation: true, reason: "Confirmation required to delete all tasks." };
    }
    setTasks([]); // Clears tasks and saves (which calls saveTasks)
    return { success: true, message: "All tasks deleted." }; // Success can have a message
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
    // TODO: If this state were to be saved (e.g. for recovery after refresh), saveTasks() would be needed.
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
