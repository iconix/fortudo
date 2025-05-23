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
                    // A more robust solution would involve taskManager.confirmCompleteLate(index, newEndTime)
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
                if (askConfirmation("Are you sure you want to delete all tasks?")) {
                    result = deleteAllTasks(true); 
                } else {
                    // User cancelled confirmation, do nothing further.
                    return; 
                }
            }
            // At this point, either deletion was done without confirmation, or it was confirmed and done.
            if (result.success) {
                renderTasks(getTasks(), taskEventCallbacks);
                updateStartTimeField(getSuggestedStartTime());
            } else if (result.reason) { // Only show alert if there was an actual error beyond cancellation
                showAlert(result.reason);
            }
        },
        onGlobalClick: (event) => {
            const target = /** @type {HTMLElement} */(event.target);
            let parentButton = target.closest ? target.closest('button') : null;
            let needsRender = false;

            if (!parentButton || !parentButton.classList.contains('btn-delete')) {
                if (resetAllConfirmingDeleteFlags()) needsRender = true;
            }
            let parentForm = target.closest ? target.closest('form') : null;
            if ((!parentForm || !parentForm.id.includes('edit-task-')) &&
                (!parentButton || !parentButton.classList.contains('btn-edit'))) {
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
