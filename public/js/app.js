// Orchestrator: public/js/app.js
import {
    updateTaskState,
    getTaskState,
    addTask,
    confirmAddTaskAndReschedule,
    updateTask,
    updateUnscheduledTask, // Imported
    confirmUpdateTaskAndReschedule,
    deleteTask, // This is the generic one, deleteUnscheduledTask is separate
    deleteUnscheduledTask, // Imported
    completeTask,
    confirmCompleteLate,
    editTask,
    cancelEdit,
    deleteAllTasks,
    getSuggestedStartTime,
    isValidTaskData,
    resetAllConfirmingDeleteFlags,
    resetAllEditingFlags,
    scheduleUnscheduledTask,
    confirmScheduleUnscheduledTask,
    reorderUnscheduledTask
} from './task-manager.js';
import {
    renderTasks,
    renderUnscheduledTasks,
    updateStartTimeField,
    initializePageEventListeners,
    initializeModalEventListeners,
    initializeDragAndDropUnscheduled,
    showAlert,
    askConfirmation,
    getTaskFormElement,
    getCurrentTimeElement,
    getDeleteAllButtonElement,
    focusTaskDescriptionInput,
    extractTaskFormData,
    refreshActiveTaskColor,
    refreshStartTimeField,
    disableStartTimeAutoUpdate,
    initializeTaskTypeToggle,
    startRealTimeClock,
    showScheduleModal,
    showEditUnscheduledModal, // Imported
    initializeUnscheduledTaskListEventListeners,
    triggerConfettiAnimation
} from './dom-handler.js';
import { loadTasksFromStorage } from './storage.js';
import { convertTo24HourTime, convertTo12HourTime, logger } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const loadedTasks = loadTasksFromStorage();
    updateTaskState(loadedTasks);

    const allTasksInitial = getTaskState();
    let scheduledTasks = allTasksInitial.filter(task => task.type === 'scheduled');
    let unscheduledTasks = allTasksInitial.filter(task => task.type === 'unscheduled');

    const scheduledTaskEventCallbacks = {
        onCompleteTask: async (taskId, taskIndex) => { /* ... (no changes from previous version) ... */
            const taskToComplete = getTaskState().find(t => t.id === taskId);
            if (!taskToComplete || taskToComplete.type !== 'scheduled') {
                 logger.warn("onCompleteTask called for non-scheduled or non-existent task", taskId); return;
            }
            const originalIndexForTaskManager = getTaskState().indexOf(taskToComplete);
            const currentTimeDisplayElement = getCurrentTimeElement();
            let currentTime24;
            if (currentTimeDisplayElement && currentTimeDisplayElement.textContent) {
                currentTime24 = convertTo24HourTime(currentTimeDisplayElement.textContent);
            }
            const result = completeTask(originalIndexForTaskManager, currentTime24);
            let taskActuallyCompleted = false;
            if (result.requiresConfirmation) {
                if (await askConfirmation( `Task completed! 🎉💪🏾 Do you want to update your schedule to show you finished at ${convertTo12HourTime(result.newEndTime)}? This helps keep your timeline accurate.`)) {
                    confirmCompleteLate(originalIndexForTaskManager, result.newEndTime, result.newDuration);
                    updateStartTimeField(getSuggestedStartTime(), true);
                    taskActuallyCompleted = true;
                } else {
                    const simpleCompleteResult = completeTask(originalIndexForTaskManager);
                    if(simpleCompleteResult.success) taskActuallyCompleted = true;
                }
            } else if (result.success) {
                taskActuallyCompleted = true;
            }
            if (taskActuallyCompleted) {
                triggerConfettiAnimation(taskId);
            }
            const currentAllTasks = getTaskState();
            renderTasks(currentAllTasks.filter(t => t.type === 'scheduled'), scheduledTaskEventCallbacks);
            renderUnscheduledTasks(currentAllTasks.filter(t => t.type === 'unscheduled'), unscheduledTaskEventCallbacks);
        },
        onEditTask: (taskId, taskIndex) => { /* ... (no changes from previous version) ... */
            const taskToEdit = getTaskState().find(t => t.id === taskId);
            if (!taskToEdit || taskToEdit.type !== 'scheduled') { logger.warn("onEditTask for non-scheduled", taskId); return; }
            const originalIndexForTaskManager = getTaskState().indexOf(taskToEdit);
            editTask(originalIndexForTaskManager);
            const currentAllTasks = getTaskState();
            renderTasks(currentAllTasks.filter(t => t.type === 'scheduled'), scheduledTaskEventCallbacks);
        },
        onDeleteTask: (taskId, taskIndex) => { /* ... (no changes from previous version) ... */
            const taskToDelete = getTaskState().find(t => t.id === taskId);
            if (!taskToDelete || taskToDelete.type !== 'scheduled') { logger.warn("onDeleteTask for non-scheduled", taskId); return; }
            const originalIndexForTaskManager = getTaskState().indexOf(taskToDelete);
            const result = deleteTask(originalIndexForTaskManager, taskToDelete.confirmingDelete);
            if (result.success) updateStartTimeField(getSuggestedStartTime(), true);
            else if (!result.requiresConfirmation && result.reason) showAlert(result.reason);
            const currentAllTasks = getTaskState();
            renderTasks(currentAllTasks.filter(t => t.type === 'scheduled'), scheduledTaskEventCallbacks);
        },
        onSaveTaskEdit: async (taskId, formData, taskIndex) => { /* ... (no changes from previous version) ... */
            const taskData = extractTaskFormData(formData);
            const taskToSave = getTaskState().find(t => t.id === taskId);
            if (!taskToSave || taskToSave.type !== 'scheduled') { logger.warn("onSaveTaskEdit for non-scheduled", taskId); return; }
            const originalIndexForTaskManager = getTaskState().indexOf(taskToSave);
            const validationResult = isValidTaskData(taskData.description, taskData.duration, taskData.taskType, taskData.startTime);
            if (!validationResult.isValid) { if (validationResult.reason) showAlert(validationResult.reason); return; }
            const updateResult = updateTask(originalIndexForTaskManager, taskData);
            await handleRescheduleConfirmation(updateResult, confirmUpdateTaskAndReschedule, () => cancelEdit(originalIndexForTaskManager));
            const currentAllTasks = getTaskState();
            renderTasks(currentAllTasks.filter(t => t.type === 'scheduled'), scheduledTaskEventCallbacks);
        },
        onCancelEdit: (taskId, taskIndex) => { /* ... (no changes from previous version) ... */
            const taskToCancel = getTaskState().find(t => t.id === taskId);
            if (!taskToCancel || taskToCancel.type !== 'scheduled') { logger.warn("onCancelEdit for non-scheduled", taskId); return; }
            const originalIndexForTaskManager = getTaskState().indexOf(taskToCancel);
            cancelEdit(originalIndexForTaskManager);
            const currentAllTasks = getTaskState();
            renderTasks(currentAllTasks.filter(t => t.type === 'scheduled'), scheduledTaskEventCallbacks);
        }
    };

    const unscheduledTaskEventCallbacks = {
        onScheduleUnscheduledTask: (taskName, estDurationText, taskId) => {
            const task = getTaskState().find(t => t.id === taskId);
            if(task) showScheduleModal(task.description, calculateHoursAndMinutes(task.estDuration), taskId);
            else logger.error("Task to schedule not found: " + taskId);
        },
        onEditUnscheduledTask: (taskId) => {
            const task = getTaskState().find(t => t.id === taskId);
            if (task && task.type === 'unscheduled') {
                showEditUnscheduledModal(task);
            } else {
                logger.error("Unscheduled task not found for editing: " + taskId);
                showAlert("Could not find the task to edit.");
            }
        },
        onDeleteUnscheduledTask: async (taskId) => {
            logger.info(`Attempting to delete unscheduled task: ${taskId}`);
            const taskIndex = getTaskState().findIndex(t => t.id === taskId && t.type === 'unscheduled');
            if (taskIndex === -1) { showAlert(`Task with ID ${taskId} not found.`); return; }
            if (await askConfirmation(`Are you sure you want to delete the unscheduled task "${getTaskState()[taskIndex].description}"?`)) {
                const result = deleteUnscheduledTask(taskId); // Use new specific delete function
                if (result.success) showAlert(result.message || 'Unscheduled task deleted.');
                else showAlert(result.reason || 'Failed to delete unscheduled task.');
                const currentAllTasks = getTaskState();
                renderUnscheduledTasks(currentAllTasks.filter(t => t.type === 'unscheduled'), unscheduledTaskEventCallbacks);
            }
        },
        onConfirmScheduleTask: async (taskId, startTime) => { /* ... (no changes from previous version) ... */
            const result = scheduleUnscheduledTask(taskId, startTime);
            if (result.requiresConfirmation) {
                const userConfirmed = await askConfirmation(result.reason);
                if (userConfirmed && result.taskData) {
                    confirmScheduleUnscheduledTask(result.taskData.unscheduledTaskId, result.taskData.newScheduledTaskData);
                } else if(!userConfirmed) {
                    showAlert('Task not scheduled to avoid overlap.');
                }
            } else if (!result.success) {
                showAlert(result.reason);
            }
            const currentAllTasks = getTaskState();
            renderTasks(currentAllTasks.filter(t => t.type === 'scheduled'), scheduledTaskEventCallbacks);
            renderUnscheduledTasks(currentAllTasks.filter(t => t.type === 'unscheduled'), unscheduledTaskEventCallbacks);
        },
        onConfirmEditUnscheduledTask: async (taskId, updatedData) => { // New callback
            const result = updateUnscheduledTask(taskId, updatedData);
            if (result.success) {
                // Optionally show a success message
            } else {
                showAlert(result.reason || "Failed to update unscheduled task.");
            }
            const currentAllTasks = getTaskState();
            renderUnscheduledTasks(currentAllTasks.filter(t => t.type === 'unscheduled'), unscheduledTaskEventCallbacks);
        },
        onDropUnscheduledTask: (draggedTaskId, targetTaskId) => { /* ... (no changes from previous version) ... */
            reorderUnscheduledTask(draggedTaskId, targetTaskId);
            const currentAllTasks = getTaskState();
            renderUnscheduledTasks(currentAllTasks.filter(t => t.type === 'unscheduled'), unscheduledTaskEventCallbacks);
        }
    };

    const appCallbacks = {
        onTaskFormSubmit: async (formData) => { /* ... (no changes from previous version) ... */ },
        onDeleteAllTasks: async () => { /* ... (no changes from previous version) ... */ },
        onGlobalClick: (event) => { /* ... (no changes from previous version) ... */ }
    };

    const taskFormElement = getTaskFormElement();
    const deleteAllButtonElement = getDeleteAllButtonElement();
    if (!taskFormElement) logger.error('CRITICAL: app.js could not find #task-form element.');
    if (!deleteAllButtonElement) logger.error('CRITICAL: app.js could not find #delete-all button.');

    initializePageEventListeners(appCallbacks, taskFormElement, deleteAllButtonElement);
    initializeTaskTypeToggle();
    startRealTimeClock();
    initializeUnscheduledTaskListEventListeners(unscheduledTaskEventCallbacks);
    initializeModalEventListeners(unscheduledTaskEventCallbacks);
    initializeDragAndDropUnscheduled(unscheduledTaskEventCallbacks);

    renderTasks(scheduledTasks, scheduledTaskEventCallbacks);
    renderUnscheduledTasks(unscheduledTasks, unscheduledTaskEventCallbacks);
    updateStartTimeField(getSuggestedStartTime());
    focusTaskDescriptionInput();

    setInterval(() => {
        refreshActiveTaskColor(getTaskState());
        refreshStartTimeField();
    }, 1000);
});

async function handleRescheduleConfirmation(opResult, confirmCallback, cancelCallback) { /* ... (no changes from previous version) ... */ }
