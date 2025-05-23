// Orchestrator: public/js/app.js
import {
    setTasks,
    getTasks,
    addTask,
    updateTask,
    deleteTask,
    completeTask,
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
    focusTaskDescriptionInput
} from './dom-handler.js';
import { loadTasks } from './storage.js';
import { calculateMinutes, convertTo24HourTime, convertTo12HourTime } from './utils.js';

// let justClickedDeleteButton = false; // Flag to coordinate event handlers - No longer needed

document.addEventListener('DOMContentLoaded', () => {
    // Load initial data
    const loadedTasks = loadTasks();
    setTasks(loadedTasks);

    // --- Callback Definitions ---

    const taskEventCallbacks = {
        onCompleteTask: (index) => {
            const currentTimeDisplayElement = document.getElementById('current-time'); // Read current time from DOM
            let currentTime24;
            if (currentTimeDisplayElement && currentTimeDisplayElement.textContent) {
                currentTime24 = convertTo24HourTime(currentTimeDisplayElement.textContent);
            }
            const result = completeTask(index, currentTime24);
            if (result.requiresConfirmation && result.confirmationType === 'COMPLETE_LATE' && result.newEndTime) {
                if (askConfirmation(`Task completed! 🎉💪🏾 Do you want to update your schedule to show you finished at ${convertTo12HourTime(result.newEndTime)}? This helps keep your timeline accurate.`)) {
                    // Task manager already updated the task optimistically.
                } else {
                    // User said NO. Task manager's current completeTask already made the change.
                    // TODO: A more robust solution would involve taskManager.confirmCompleteLate(index, newEndTime)
                    // or taskManager.revertCompleteLate(index, oldEndTime).
                    // For now, we accept the optimistic update or would need to re-set task data from a snapshot.
                    // This part of the logic might need further refinement in task-manager if strict revert is needed.
                }
            }
            renderTasks(getTasks(), taskEventCallbacks);
        },
        onEditTask: (index) => {
            editTask(index);
            renderTasks(getTasks(), taskEventCallbacks);
        },
        onDeleteTask: (index) => {
            // justClickedDeleteButton = true; // Set flag indicating delete button was clicked - No longer needed

            const tasks = getTasks();
            const taskToDelete = tasks[index];
            if (taskToDelete) {
                let result = deleteTask(index, taskToDelete.confirmingDelete);
                if (result.requiresConfirmation) {
                    // The deleteTask(index, false) in task-manager sets confirmingDelete = true.
                    // renderTasks will reflect this, showing the confirm icon.
                } else if (!result.success && result.reason) {
                    showAlert(result.reason);
                }
            }
            // APP_DEBUG: Log task state before rendering after delete attempt
            // if (tasks[index]) { // Check if task still exists (it should, if only confirmation was set)
            //      console.log(`APP_DEBUG: onDeleteTask - Task at index ${index} before renderTasks:`, JSON.parse(JSON.stringify(tasks[index])));
            // } else {
            //      console.log(`APP_DEBUG: onDeleteTask - Task at index ${index} was deleted before renderTasks.`);
            // }
            renderTasks(getTasks(), taskEventCallbacks);
        },
        onSaveTaskEdit: (index, formData) => {
            const description = /** @type {string} */ (formData.get('description') || '');
            const startTime = /** @type {string} */ (formData.get('start-time') || '');
            const durationHours = formData.get('duration-hours') || '0';
            const durationMinutes = formData.get('duration-minutes') || '0';
            const duration = calculateMinutes(`${durationHours}:${durationMinutes}`);

            const validationResult = isValidTaskData(description, duration);
            if (!validationResult.isValid && validationResult.reason) {
                showAlert(validationResult.reason);
                return;
            }
            const updateResult = updateTask(index, { description, startTime, duration });
            if (!updateResult.success && updateResult.reason) {
                showAlert(updateResult.reason);
            }
            renderTasks(getTasks(), taskEventCallbacks);
        },
        onCancelEdit: (index) => {
            cancelEdit(index);
            renderTasks(getTasks(), taskEventCallbacks);
        }
    };

    const appCallbacks = {
        onTaskFormSubmit: (formData) => {
            const description = /** @type {string} */(formData.get('description') || '');
            const startTime = /** @type {string} */(formData.get('start-time') || '');
            const durationHours = formData.get('duration-hours') || '0';
            const durationMinutes = formData.get('duration-minutes') || '0';
            const duration = calculateMinutes(`${durationHours}:${durationMinutes}`);

            const validationResult = isValidTaskData(description, duration);
            if (!validationResult.isValid && validationResult.reason) {
                showAlert(validationResult.reason);
                return;
            }

            const addResult = addTask({ description, startTime, duration });
            if (!addResult.success && addResult.reason) {
                showAlert(addResult.reason);
            }

            renderTasks(getTasks(), taskEventCallbacks);
            const mainForm = getTaskFormElement();
            if (mainForm) mainForm.reset();
            updateStartTimeField(getSuggestedStartTime());
            focusTaskDescriptionInput();
        },
        onDeleteAllTasks: () => {
            if (getTasks().length === 0) {
                showAlert("There are no tasks to delete.");
                return;
            }
            let result = deleteAllTasks(false);
            if (result.requiresConfirmation) {
                // If confirmation is required, result.reason will contain the confirmation message.
                if (askConfirmation(result.reason || "Are you sure you want to delete all tasks?")) {
                    result = deleteAllTasks(true);
                } else {
                    // User cancelled confirmation, do nothing further.
                    return;
                }
            }
            // At this point, either deletion was done (if initially no tasks or confirmed), or not (if cancelled).
            // TODO: This logic could be simplified. If `deleteAllTasks(false)` sets a global state for confirmation,
            // the UI could react to that state directly. Then `deleteAllTasks(true)` is called if user confirms via UI.
            if (result.success) {
                if (result.message) showAlert(result.message); // Show success message if provided
                renderTasks(getTasks(), taskEventCallbacks);
                updateStartTimeField(getSuggestedStartTime());
            } else if (result.reason && !result.requiresConfirmation) {
                // Show reason only if it's a failure reason and not a pending confirmation message.
                showAlert(result.reason);
            }
        },
        onGlobalClick: (event) => {
            // if (justClickedDeleteButton) { // No longer needed
            //     justClickedDeleteButton = false; // Reset flag
            //     // console.log('APP_DEBUG: onGlobalClick - Ignoring click because justClickedDeleteButton was true.');
            //     return; // Skip global click logic if it was a delete button click handled by onDeleteTask
            // }

            const target = /** @type {HTMLElement} */(event.target);
            let needsRender = false;
            // console.log('APP_DEBUG: onGlobalClick triggered. Target:', target, 'target.tagName:', target.tagName);

            // Handling reset of confirmingDelete flags
            let isClickOnTaskViewDeleteButton = false;
            const isButton = target.tagName === 'BUTTON';
            const hasBtnDeleteClass = target.classList && target.classList.contains('btn-delete');
            const hasDataTaskIndex = target.hasAttribute('data-task-index');
            const taskListElement = document.getElementById('task-list');
            const isContainedInTaskList = taskListElement ? taskListElement.contains(target) : false;

            // console.log(`APP_DEBUG: onGlobalClick checks: isButton=${isButton}, hasBtnDeleteClass=${hasBtnDeleteClass}, hasDataTaskIndex=${hasDataTaskIndex}, isContainedInTaskList=${isContainedInTaskList}`);

            if (isButton && hasBtnDeleteClass && hasDataTaskIndex && isContainedInTaskList) {
                isClickOnTaskViewDeleteButton = true;
            }
            // console.log('APP_DEBUG: onGlobalClick - isClickOnTaskViewDeleteButton (final value):', isClickOnTaskViewDeleteButton);

            if (!isClickOnTaskViewDeleteButton) {
                // console.log('APP_DEBUG: onGlobalClick - Condition met to reset delete flags.');
                if (resetAllConfirmingDeleteFlags()) {
                    // console.log('APP_DEBUG: onGlobalClick - resetAllConfirmingDeleteFlags caused a change.');
                    needsRender = true;
                }
            }

            // Handling reset of editing flags
            const clickedInsideEditForm = target.closest('form[id^="edit-task-"]');
            const clickedOnEditButton = target.closest('.btn-edit'); // Button that initiates edit mode
            const clickedOnCheckbox = target.closest('.checkbox'); // Task completion checkbox

            // If the click is not inside an edit form, not on an "edit" button,
            // not on a checkbox, and not on a "delete" button (in view mode),
            // then consider it a click "outside" that should cancel editing states.
            if (!clickedInsideEditForm && !clickedOnEditButton && !clickedOnCheckbox && !isClickOnTaskViewDeleteButton) {
                // TODO: Consider if resetAllEditingFlags should also save the state if editing was a persisted attribute.
                // Currently, task-manager.js indicates editing is a transient UI state.
                if (resetAllEditingFlags()) needsRender = true;
            }

            if (needsRender) {
                renderTasks(getTasks(), taskEventCallbacks);
            }
        }
    };

    // Initialize Page
    const taskFormElement = /** @type {HTMLFormElement|null} */ (document.getElementById('task-form'));
    const deleteAllButtonElement = /** @type {HTMLButtonElement|null} */ (document.getElementById('delete-all'));

    if (!taskFormElement) {
        console.error("CRITICAL: app.js could not find #task-form element.");
    }
    if (!deleteAllButtonElement) {
        console.error("CRITICAL: app.js could not find #delete-all button.");
    }

    initializePageEventListeners(appCallbacks, taskFormElement, deleteAllButtonElement);
    renderTasks(getTasks(), taskEventCallbacks);
    updateStartTimeField(getSuggestedStartTime());
    renderDateTime(); // Initial render for date/time
    focusTaskDescriptionInput();

    setInterval(renderDateTime, 1000);
});
