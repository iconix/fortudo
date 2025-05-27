// Orchestrator: public/js/app.js
import {
    updateTaskState,
    getTaskState,
    addTask,
    confirmAddTaskAndReschedule,
    updateTask,
    confirmUpdateTaskAndReschedule,
    deleteTask,
    completeTask,
    confirmCompleteLate,
    editTask,
    cancelEdit,
    deleteAllTasks,
    getSuggestedStartTime,
    isValidTaskData,
    resetAllConfirmingDeleteFlags,
    resetAllEditingFlags
} from './task-manager.js';
import {
    renderTasks,
    renderDateTime,
    updateStartTimeField,
    initializePageEventListeners,
    showAlert,
    askConfirmation,
    getTaskFormElement,
    focusTaskDescriptionInput,
    extractTaskFormData,
    updateActiveTaskColor
} from './dom-handler.js';
import { loadTasksFromStorage } from './storage.js';
import { convertTo24HourTime, convertTo12HourTime, logger, validateTaskFormData } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const loadedTasks = loadTasksFromStorage();
    updateTaskState(loadedTasks);

    const taskEventCallbacks = {
        /**
         * Handles task completion.
         * Checks if the task is being completed late and prompts for confirmation to update the schedule.
         * @param {number} index - The index of the task to complete.
         */
        onCompleteTask: (index) => {
            const currentTimeDisplayElement = document.getElementById('current-time');
            let currentTime24;
            if (currentTimeDisplayElement && currentTimeDisplayElement.textContent) {
                currentTime24 = convertTo24HourTime(currentTimeDisplayElement.textContent);
            }
            const result = completeTask(index, currentTime24);
            if (
                result.requiresConfirmation &&
                result.confirmationType === 'COMPLETE_LATE' &&
                result.newEndTime &&
                result.newDuration !== undefined
            ) {
                if (
                    askConfirmation(
                        `Task completed! 🎉💪🏾 Do you want to update your schedule to show you finished at ${convertTo12HourTime(result.newEndTime)}? This helps keep your timeline accurate.`
                    )
                ) {
                    confirmCompleteLate(index, result.newEndTime, result.newDuration);
                    updateStartTimeField(getSuggestedStartTime(), true);
                } else {
                    // User does not confirm, complete the task without changing time
                    completeTask(index);
                }
            }
            renderTasks(getTaskState(), taskEventCallbacks);
        },
        /**
         * Handles task editing.
         * Sets the task to editing mode and re-renders the task list.
         * @param {number} index - The index of the task to edit.
         */
        onEditTask: (index) => {
            editTask(index);
            renderTasks(getTaskState(), taskEventCallbacks);
        },
        /**
         * Handles task deletion.
         * Shows confirmation dialog and handles the deletion process.
         * @param {number} index - The index of the task to delete.
         */
        onDeleteTask: (index) => {
            const tasks = getTaskState();
            const taskToDelete = tasks[index];
            if (taskToDelete) {
                const result = deleteTask(index, taskToDelete.confirmingDelete);
                if (result.requiresConfirmation) {
                    // two-step delete pattern: deleteTask(index, false) in task-manager sets confirmingDelete = true.
                    // so renderTasks will reflect this, showing the confirm icon for user confirmation.
                } else if (result.success) {
                    updateStartTimeField(getSuggestedStartTime(), true);
                } else if (!result.success && result.reason) {
                    showAlert(result.reason);
                }
            }
            renderTasks(getTaskState(), taskEventCallbacks);
        },
        /**
         * Handles saving task edits.
         * Validates the form data, updates the task, and handles any confirmation dialogs for rescheduling.
         * @param {number} index - The index of the task being edited.
         * @param {FormData} formData - The form data containing updated task details.
         */
        onSaveTaskEdit: (index, formData) => {
            const { description, startTime, duration } = extractTaskFormData(formData);
            const validationResult = validateTaskFormData(description, duration, isValidTaskData);
            if (!validationResult.isValid) {
                if (validationResult.reason) showAlert(validationResult.reason);
                return;
            }
            const updateResult = updateTask(index, { description, startTime, duration });
            handleRescheduleConfirmation(updateResult, confirmUpdateTaskAndReschedule, () =>
                cancelEdit(index)
            );
            renderTasks(getTaskState(), taskEventCallbacks);
        },
        /**
         * Handles canceling task edits.
         * Reverts the task to non-editing mode and re-renders the task list.
         * @param {number} index - The index of the task to cancel editing for.
         */
        onCancelEdit: (index) => {
            cancelEdit(index);
            renderTasks(getTaskState(), taskEventCallbacks);
        }
    };

    const appCallbacks = {
        /**
         * Handles submission of the main task form.
         * Validates input data, adds the task, and handles any confirmation dialogs for rescheduling.
         * @param {FormData} formData - The form data containing task details.
         */
        onTaskFormSubmit: (formData) => {
            const { description, startTime, duration } = extractTaskFormData(formData);
            const validationResult = validateTaskFormData(description, duration, isValidTaskData);
            if (!validationResult.isValid) {
                if (validationResult.reason) showAlert(validationResult.reason);
                return;
            }
            const addResult = addTask({ description, startTime, duration });
            handleRescheduleConfirmation(addResult, confirmAddTaskAndReschedule, () => {});
            renderTasks(getTaskState(), taskEventCallbacks);

            // reset form and update ui
            const mainForm = getTaskFormElement();
            if (mainForm) mainForm.reset();
            updateStartTimeField(getSuggestedStartTime(), true);
            focusTaskDescriptionInput();
        },
        /**
         * Handles deletion of all tasks.
         * Shows confirmation dialog and handles the deletion process.
         */
        onDeleteAllTasks: () => {
            if (getTaskState().length === 0) {
                showAlert('There are no tasks to delete.');
                return;
            }
            let result = deleteAllTasks(false);
            if (result.requiresConfirmation) {
                if (
                    askConfirmation(result.reason || 'Are you sure you want to delete all tasks?')
                ) {
                    result = deleteAllTasks(true);
                } else {
                    renderTasks(getTaskState(), taskEventCallbacks); // re-render to clear any confirmation states
                    return; // exit, as user cancelled
                }
            }

            // at this point, deletion either succeeded or failed due to an error
            if (result.success) {
                if (result.message) showAlert(result.message);
                renderTasks(getTaskState(), taskEventCallbacks);
                // force update after deleting all tasks
                updateStartTimeField(getSuggestedStartTime(), true);
            } else {
                showAlert(result.reason || 'Failed to delete all tasks.');
            }
        },
        /**
         * Handles global click events on the document.
         * Manages resetting of editing and confirmation states when clicking outside relevant elements.
         * @param {Event} event - The click event.
         */
        onGlobalClick: (event) => {
            const target = /** @type {HTMLElement} */ (event.target);

            const isDeleteButton = target.matches('#task-list .btn-delete[data-task-index]');

            // reset confirmation flags unless clicking on delete button
            let needsRender = !isDeleteButton && resetAllConfirmingDeleteFlags();

            // reset editing flags unless clicking on specific elements
            const clickedOnEditElement = target.closest(
                'form[id^="edit-task-"], .btn-edit, .btn-edit-cancel, .checkbox'
            );
            if (!clickedOnEditElement && !isDeleteButton) {
                needsRender = resetAllEditingFlags() || needsRender;
            }

            if (needsRender) {
                renderTasks(getTaskState(), taskEventCallbacks);
            }
        }
    };

    const taskFormElement = /** @type {HTMLFormElement|null} */ (
        document.getElementById('task-form')
    );
    const deleteAllButtonElement = /** @type {HTMLButtonElement|null} */ (
        document.getElementById('delete-all')
    );

    if (!taskFormElement) {
        logger.error('CRITICAL: app.js could not find #task-form element.');
    }
    if (!deleteAllButtonElement) {
        logger.error('CRITICAL: app.js could not find #delete-all button.');
    }

    initializePageEventListeners(appCallbacks, taskFormElement, deleteAllButtonElement);
    renderTasks(getTaskState(), taskEventCallbacks);
    updateStartTimeField(getSuggestedStartTime());
    renderDateTime();
    focusTaskDescriptionInput();

    // Update time and active task late styling every second
    setInterval(() => {
        renderDateTime();
        updateActiveTaskColor(getTaskState());
    }, 1000);
});

/**
 * Handles the rescheduling confirmation flow for task updates and additions.
 * @param {Object} updateResult - The result object from the update/add operation
 * @param {Function} confirmCallback - Callback function to execute on confirmation
 * @param {Function} cancelCallback - Callback function to execute on cancellation
 */
function handleRescheduleConfirmation(updateResult, confirmCallback, cancelCallback) {
    // handle non-confirmation cases early
    if (!updateResult.requiresConfirmation) {
        if (!updateResult.success && updateResult.reason) {
            showAlert(updateResult.reason);
        }
        return;
    }

    const confirmationMessage = updateResult.reason || 'Reschedule tasks?';
    const userConfirmed = askConfirmation(confirmationMessage);

    // define confirmation type handlers
    const handlers = {
        RESCHEDULE_UPDATE: () => {
            if (!userConfirmed) {
                showAlert('Task not updated to avoid rescheduling.');
                cancelCallback();
                return;
            }

            if (updateResult.taskIndex !== undefined && updateResult.updatedData) {
                const confirmResult = confirmCallback(
                    updateResult.taskIndex,
                    updateResult.updatedData
                );
                if (confirmResult.success) {
                    updateStartTimeField(getSuggestedStartTime(), true);
                } else {
                    showAlert('Failed to update task and reschedule.');
                }
            }
        },
        RESCHEDULE_ADD: () => {
            if (!userConfirmed) {
                showAlert('Task not added to avoid rescheduling.');
                cancelCallback();
                return;
            }

            if (updateResult.taskData) {
                const confirmResult = confirmCallback(updateResult.taskData);
                if (!confirmResult.success) {
                    showAlert('Failed to add task and reschedule.');
                }
            }
        }
    };

    const handler = handlers[updateResult.confirmationType];
    if (handler) {
        handler();
    }
}
