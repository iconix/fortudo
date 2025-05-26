// Orchestrator: public/js/app.js
import {
    setTasks,
    getTasks,
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
    focusTaskDescriptionInput
} from './dom-handler.js';
import { loadTasks } from './storage.js';
import { calculateMinutes, convertTo24HourTime, convertTo12HourTime, logger } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const loadedTasks = loadTasks();
    setTasks(loadedTasks);

    const taskEventCallbacks = {
        onCompleteTask: (index) => {
            const currentTimeDisplayElement = document.getElementById('current-time');
            let currentTime24;
            if (currentTimeDisplayElement && currentTimeDisplayElement.textContent) {
                currentTime24 = convertTo24HourTime(currentTimeDisplayElement.textContent);
            }
            const result = completeTask(index, currentTime24);
            if (result.requiresConfirmation && result.confirmationType === 'COMPLETE_LATE' && result.newEndTime && result.newDuration !== undefined) {
                if (askConfirmation(`Task completed! 🎉💪🏾 Do you want to update your schedule to show you finished at ${convertTo12HourTime(result.newEndTime)}? This helps keep your timeline accurate.`)) {
                    confirmCompleteLate(index, result.newEndTime, result.newDuration);
                } else {
                    // User does not confirm, complete the task without changing time
                    completeTask(index);
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

            if (updateResult.requiresConfirmation && updateResult.confirmationType === 'RESCHEDULE_UPDATE') {
                if (askConfirmation(updateResult.reason || "Reschedule tasks?")) {
                    if (updateResult.taskIndex !== undefined && updateResult.updatedData) {
                        const confirmResult = confirmUpdateTaskAndReschedule(updateResult.taskIndex, updateResult.updatedData);
                        if (!confirmResult.success) {
                            showAlert("Failed to update task and reschedule.");
                        }
                    }
                } else {
                    showAlert("Task update cancelled to avoid rescheduling.");
                    cancelEdit(index); // Revert UI to non-editing state
                }
            } else if (!updateResult.success && updateResult.reason) {
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

            if (addResult.requiresConfirmation && addResult.confirmationType === 'RESCHEDULE_ADD') {
                if (askConfirmation(addResult.reason || "Reschedule tasks?")) {
                    const confirmResult = confirmAddTaskAndReschedule(addResult.taskData);
                    if (!confirmResult.success) {
                        showAlert("Failed to add task and reschedule.");
                    }
                } else {
                    showAlert("Task not added to avoid rescheduling.");
                }
            } else if (!addResult.success && addResult.reason) {
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
                if (askConfirmation(result.reason || "Are you sure you want to delete all tasks?")) {
                    result = deleteAllTasks(true);
                } else {
                    renderTasks(getTasks(), taskEventCallbacks); // Re-render to clear any confirmation states
                    return; // Exit, as user cancelled
                }
            }
            // At this point, deletion either happened or was not needed (no tasks).
            if (result.success) {
                if (result.message) showAlert(result.message);
                renderTasks(getTasks(), taskEventCallbacks);
                // Force update after deleting all tasks
                updateStartTimeField(getSuggestedStartTime(), true);
            } else if (result.reason && !result.requiresConfirmation) { // It's some other error
                showAlert(result.reason);
            }
        },
        onGlobalClick: (event) => {
            const target = /** @type {HTMLElement} */(event.target);
            let needsRender = false;

            let isClickOnTaskViewDeleteButton = false;
            const isButton = target.tagName === 'BUTTON';
            const hasBtnDeleteClass = target.classList && target.classList.contains('btn-delete');
            const hasDataTaskIndex = target.hasAttribute('data-task-index');
            const taskListElement = document.getElementById('task-list');
            const isContainedInTaskList = taskListElement ? taskListElement.contains(target) : false;

            if (isButton && hasBtnDeleteClass && hasDataTaskIndex && isContainedInTaskList) {
                isClickOnTaskViewDeleteButton = true;
            }

            if (!isClickOnTaskViewDeleteButton) {
                if (resetAllConfirmingDeleteFlags()) {
                    needsRender = true;
                }
            }

            const clickedInsideEditForm = target.closest('form[id^="edit-task-"]');
            const clickedOnEditButton = target.closest('.btn-edit');
            const clickedOnCheckbox = target.closest('.checkbox');

            if (!clickedInsideEditForm && !clickedOnEditButton && !clickedOnCheckbox && !isClickOnTaskViewDeleteButton) {
                if (resetAllEditingFlags()) needsRender = true;
            }

            if (needsRender) {
                renderTasks(getTasks(), taskEventCallbacks);
            }
        }
    };

    const taskFormElement = /** @type {HTMLFormElement|null} */ (document.getElementById('task-form'));
    const deleteAllButtonElement = /** @type {HTMLButtonElement|null} */ (document.getElementById('delete-all'));

    if (!taskFormElement) {
        logger.error("CRITICAL: app.js could not find #task-form element.");
    }
    if (!deleteAllButtonElement) {
        logger.error("CRITICAL: app.js could not find #delete-all button.");
    }

    initializePageEventListeners(appCallbacks, taskFormElement, deleteAllButtonElement);
    renderTasks(getTasks(), taskEventCallbacks);
    updateStartTimeField(getSuggestedStartTime());
    renderDateTime();
    focusTaskDescriptionInput();

    setInterval(renderDateTime, 1000);
});
