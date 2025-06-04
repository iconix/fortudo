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
    reorderUnscheduledTask,
    getSortedUnscheduledTasks,
    toggleUnscheduledTaskCompleteState,
    unscheduleTask,
    toggleLockState,
    isScheduledTask
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
    initializeUnscheduledTaskListEventListeners,
    triggerConfettiAnimation,
    populateUnscheduledTaskInlineEditForm,
    getUnscheduledTaskInlineFormData,
    toggleUnscheduledTaskInlineEdit,
    showScheduleModal
} from './dom-handler.js';
import { loadTasksFromStorage } from './storage.js';
import { convertTo24HourTime, convertTo12HourTime, logger, calculateHoursAndMinutes } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const loadedTasks = loadTasksFromStorage();
    // Reset isEditingInline for all tasks loaded from storage
    loadedTasks.forEach(task => {
        if (task.hasOwnProperty('isEditingInline')) {
            task.isEditingInline = false;
        }
    });
    updateTaskState(loadedTasks);

    const allTasksInitial = getTaskState();
    let scheduledTasks = allTasksInitial.filter(task => task.type === 'scheduled');
    let unscheduledTasks = allTasksInitial.filter(task => task.type === 'unscheduled');

    const scheduledTaskEventCallbacks = {
        onCompleteTask: async (taskId, taskIndex) => {
            const taskToComplete = getTaskState().find(t => t.id === taskId);
            if (!taskToComplete) {
                logger.error(`Task with ID ${taskId} not found to complete.`);
                return;
            }

            const originalIndexForTaskManager = getTaskState().findIndex(t => t.id === taskId);
            if (originalIndexForTaskManager === -1) {
                logger.error(`Task with ID ${taskId} not found in original state for task manager.`);
                return;
            }

            const currentTimeDisplayElement = getCurrentTimeElement();
            let currentTime24;
            if (currentTimeDisplayElement && currentTimeDisplayElement.textContent) {
                currentTime24 = convertTo24HourTime(currentTimeDisplayElement.textContent);
            }

            const result = completeTask(originalIndexForTaskManager, currentTime24);
            let taskActuallyCompleted = false;

            // Handle late completion case
            if (result.success && result.requiresConfirmation && result.confirmationType === 'COMPLETE_LATE' && result.newEndTime && result.newDuration) {
                if (await askConfirmation(
                    `Task completed! 🎉💪🏾 Do you want to update your schedule to show you finished at ${convertTo12HourTime(result.newEndTime)}? This helps keep your timeline accurate.`,
                    { ok: 'Yes', cancel: 'No' },
                    getThemeForTask(taskToComplete)
                )) {
                    confirmCompleteLate(originalIndexForTaskManager, result.newEndTime, result.newDuration);
                    updateStartTimeField(getSuggestedStartTime(), true);
                } else {
                    // If user declines late completion update, just mark it as completed normally
                    completeTask(originalIndexForTaskManager);
                }
                taskActuallyCompleted = true; // Task is considered completed even if they say no to late update for confetti purposes
            }
            // Handle normal completion case
            else if (result.success) {
                taskActuallyCompleted = true;
            }

            // First, re-render the tasks so the completed task appears correctly
            const currentAllTasks = getTaskState();
            renderTasks(currentAllTasks.filter(t => t.type === 'scheduled'), scheduledTaskEventCallbacks);
            renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks); // Also re-render unscheduled in case completion affects it

            // NOW, trigger confetti on the newly rendered (and existing) task element
            if (taskActuallyCompleted) {
                triggerConfettiAnimation(taskId);
            }
        },
        onLockTask: (taskId, taskIndex) => {
            const result = toggleLockState(taskId);
            if (!result.success && result.reason) {
                showAlert(result.reason, getThemeForTaskId(taskId));
            }
            const currentAllTasks = getTaskState();
            renderTasks(currentAllTasks.filter(t => t.type === 'scheduled'), scheduledTaskEventCallbacks);
        },
        onEditTask: (taskId, taskIndex) => {
            const taskToEdit = getTaskState().find(t => t.id === taskId);
            if (!taskToEdit || taskToEdit.type !== 'scheduled') { logger.warn("onEditTask for non-scheduled", taskId); return; }
            const originalIndexForTaskManager = getTaskState().indexOf(taskToEdit);
            editTask(originalIndexForTaskManager);
            const currentAllTasks = getTaskState();
            renderTasks(currentAllTasks.filter(t => t.type === 'scheduled'), scheduledTaskEventCallbacks);
        },
        onDeleteTask: (taskId, taskIndex) => {
            const taskToDelete = getTaskState().find(t => t.id === taskId);
            if (!taskToDelete || taskToDelete.type !== 'scheduled') { logger.warn("onDeleteTask for non-scheduled", taskId); return; }
            const originalIndexForTaskManager = getTaskState().indexOf(taskToDelete);
            const result = deleteTask(originalIndexForTaskManager, taskToDelete.confirmingDelete);
            if (result.success) updateStartTimeField(getSuggestedStartTime(), true);
            else if (!result.requiresConfirmation && result.reason) showAlert(result.reason, getThemeForTaskId(taskId));
            const currentAllTasks = getTaskState();
            renderTasks(currentAllTasks.filter(t => t.type === 'scheduled'), scheduledTaskEventCallbacks);
        },
        onUnscheduleTask: (taskId, taskIndex) => {
            logger.info('Unschedule button clicked for', {taskId, taskIndex});
            const unscheduleResult = unscheduleTask(taskId);
            if (unscheduleResult.success) {
                // No specific alert for success, UI will refresh.
            } else if (unscheduleResult.reason) {
                showAlert(unscheduleResult.reason, 'teal');
            }
            // Re-render both lists as a task moves from scheduled to unscheduled
            const currentTasks = getTaskState();
            renderTasks(currentTasks.filter(t => t.type === 'scheduled'), scheduledTaskEventCallbacks);
            renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);
            updateStartTimeField(getSuggestedStartTime(), true);
        },
        onSaveTaskEdit: async (taskId, formElement, taskIndex) => {
            const taskData = extractTaskFormData(formElement);
            if (!taskData) {
                return;
            }

            const taskToSave = getTaskState().find(t => t.id === taskId);
            if (!taskToSave || taskToSave.type !== 'scheduled') {
                logger.warn("onSaveTaskEdit for non-existent or non-scheduled task", {taskId, taskType: taskToSave?.type });
                return;
            }
            const originalIndexForTaskManager = getTaskState().indexOf(taskToSave);

            const updateResult = updateTask(originalIndexForTaskManager, taskData);
            await handleRescheduleConfirmation(updateResult, confirmUpdateTaskAndReschedule, () => cancelEdit(originalIndexForTaskManager));
            const currentAllTasksAfterUpdate = getTaskState();
            renderTasks(currentAllTasksAfterUpdate.filter(t => t.type === 'scheduled'), scheduledTaskEventCallbacks);
        },
        onCancelEdit: (taskId, taskIndex) => {
            const taskToCancel = getTaskState().find(t => t.id === taskId);
            if (!taskToCancel || taskToCancel.type !== 'scheduled') { logger.warn("onCancelEdit for non-scheduled", taskId); return; }
            const originalIndexForTaskManager = getTaskState().indexOf(taskToCancel);
            cancelEdit(originalIndexForTaskManager);
            const currentAllTasks = getTaskState();
            renderTasks(currentAllTasks.filter(t => t.type === 'scheduled'), scheduledTaskEventCallbacks);
        }
    };

    const unscheduledTaskEventCallbacks = {
        onScheduleUnscheduledTask: (taskId, taskName, estDurationText) => {
            const task = getTaskState().find(t => t.id === taskId);
            if(task) {
                if (task.status === 'completed') {
                    showAlert('This task is already completed and cannot be scheduled.', 'indigo');
                    return;
                }
                showScheduleModal(task.description, calculateHoursAndMinutes(task.estDuration), taskId);
            }
            else logger.error("Task to schedule not found: " + taskId);
        },
        onEditUnscheduledTask: (taskId) => {
            const task = getTaskState().find(t => t.id === taskId);
            if (task && task.type === 'unscheduled') {
                const currentlyEditing = getTaskState().find(t => t.isEditingInline && t.id !== taskId);
                if (currentlyEditing) {
                    currentlyEditing.isEditingInline = false;
                }
                task.isEditingInline = !task.isEditingInline;
                if (task.isEditingInline) {
                    populateUnscheduledTaskInlineEditForm(taskId, task);
                }
                renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);
            } else {
                logger.error("Unscheduled task not found for editing: " + taskId);
                showAlert("Could not find the task to edit.", 'teal');
            }
        },
        onDeleteUnscheduledTask: async (taskId) => {
            logger.info(`Attempting to delete unscheduled task: ${taskId}`);
            const result = deleteUnscheduledTask(taskId);
            if (result.success && result.message) {
                showAlert(result.message, 'teal');
            } else if (!result.requiresConfirmation && result.reason) {
                showAlert(result.reason, 'teal');
            }
            renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);
        },
        onConfirmScheduleTask: async (taskId, startTime, duration) => {
            const result = scheduleUnscheduledTask(taskId, startTime, duration);
            if (result.requiresConfirmation) {
                const userConfirmed = await askConfirmation(result.reason, undefined, 'indigo');
                if (userConfirmed && result.taskData) {
                    confirmScheduleUnscheduledTask(result.taskData.unscheduledTaskId, result.taskData.newScheduledTaskData);
                } else if(!userConfirmed) {
                    showAlert('Task not scheduled to avoid overlap.', 'indigo');
                }
            } else if (!result.success) {
                showAlert(result.reason, 'indigo');
            }
            const currentAllTasks = getTaskState();
            renderTasks(currentAllTasks.filter(t => t.type === 'scheduled'), scheduledTaskEventCallbacks);
            renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);
        },
        onSaveUnscheduledTaskEdit: async (taskId) => {
            const task = getTaskState().find(t => t.id === taskId);
            if (!task || task.type !== 'unscheduled' || !task.isEditingInline) {
                logger.error("Task not found or not in inline edit mode for saving:", taskId);
                return;
            }
            const updatedData = getUnscheduledTaskInlineFormData(taskId);
            if (!updatedData) return;
            const originalPriority = task.priority;
            const result = updateUnscheduledTask(taskId, updatedData);
            if (result.success) {
                task.isEditingInline = false;
                if (originalPriority !== updatedData.priority) {
                    renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);
                } else {
                    // If priority didn't change, a full sort might not be needed, just re-render.
                    // However, getSortedUnscheduledTasks() is quick, so using it is simpler.
                    renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);
                }
            } else {
                showAlert(result.reason || 'Could not save unscheduled task.', 'indigo');
            }
        },
        onCancelUnscheduledTaskEdit: (taskId) => {
            const task = getTaskState().find(t => t.id === taskId);
            if (task && task.type === 'unscheduled' && task.isEditingInline) {
                task.isEditingInline = false;
                renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);
            } else {
                logger.warn("Task not found or not in inline edit mode for cancel:", taskId);
            }
        },
        onDropUnscheduledTask: (draggedTaskId, targetTaskId) => {
            reorderUnscheduledTask(draggedTaskId, targetTaskId);
            renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);
        },
        onToggleCompleteUnscheduledTask: (taskId) => {
            logger.debug(`Toggling complete status for unscheduled task: ${taskId}`);
            const result = toggleUnscheduledTaskCompleteState(taskId);
            if (result && result.success) {
                renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);
                 // Optional: Trigger confetti for unscheduled tasks too?
                if (result.task && result.task.status === 'completed') {
                    // triggerConfettiAnimation(taskId); // You might need to adjust confetti for unscheduled if it uses different element IDs
                }
            } else {
                showAlert(result.reason || 'Could not update task completion status.', getThemeForTaskId(taskId));
            }
        }
    };

    const appCallbacks = {
        onTaskFormSubmit: async (formElement) => {
            const taskData = extractTaskFormData(formElement);
            if (!taskData) {
                focusTaskDescriptionInput();
                return;
            }
            // Make sure to pass the callbacks defined in DOMContentLoaded scope
            await handleAddTaskProcess(formElement, taskData, scheduledTaskEventCallbacks, unscheduledTaskEventCallbacks);
        },
        onDeleteAllTasks: async () => {
            if (await askConfirmation('Are you sure you want to delete ALL tasks? This cannot be undone.', undefined, 'teal')) {
                const result = deleteAllTasks();
                if (result.success) {
                    showAlert(result.message || `${result.tasksDeleted} tasks deleted.`, 'teal');
                    updateStartTimeField(getSuggestedStartTime(), true);
                    renderTasks([], scheduledTaskEventCallbacks);
                    renderUnscheduledTasks([], unscheduledTaskEventCallbacks);
                } else {
                    showAlert(result.reason || 'Failed to delete tasks.', 'teal');
                }
            }
        },
        onGlobalClick: (event) => {
            const target = event.target;
            const taskElement = target.closest('.task-item, .unscheduled-task-item');
            const deleteButton = target.closest('.btn-delete, .btn-delete-unscheduled');

            // If clicking outside of a task element and not on a delete button, reset all confirming delete flags
            if (!taskElement && !deleteButton) {
                const wasConfirming = resetAllConfirmingDeleteFlags();
                if (wasConfirming) {
                    const currentAllTasks = getTaskState();
                    renderTasks(currentAllTasks.filter(t => t.type === 'scheduled'), scheduledTaskEventCallbacks);
                    renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);
                }
            }
        }
    };

    const taskFormElement = getTaskFormElement();
    const deleteAllButtonElement = getDeleteAllButtonElement();
    if (!taskFormElement) logger.error('CRITICAL: app.js could not find #task-form element.');
    if (!deleteAllButtonElement) logger.error('CRITICAL: app.js could not find #delete-all button.');

    initializePageEventListeners(appCallbacks, taskFormElement, deleteAllButtonElement);
    initializeTaskTypeToggle();
    startRealTimeClock();
    initializeUnscheduledTaskListEventListeners(unscheduledTaskEventCallbacks);
    initializeModalEventListeners(unscheduledTaskEventCallbacks, appCallbacks);

    renderTasks(scheduledTasks, scheduledTaskEventCallbacks);
    renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);

    // Initialize Start Time field
    const suggested = getSuggestedStartTime();
    logger.info('DOMContentLoaded - getSuggestedStartTime() returned:', suggested);
    updateStartTimeField(suggested, true);

    focusTaskDescriptionInput();

    setInterval(() => {
        refreshActiveTaskColor(getTaskState());
        refreshStartTimeField();
    }, 1000);
});

// Helper function to determine the theme based on task type
function getThemeForTask(task) {
    return task?.type === 'scheduled' ? 'teal' : 'indigo';
}

// Helper function to determine the theme based on task type from task ID
function getThemeForTaskId(taskId) {
    const task = getTaskState().find(t => t.id === taskId);
    return getThemeForTask(task);
}

async function handleRescheduleConfirmation(opResult, confirmCallback, cancelCallback) {
    if (opResult.requiresConfirmation && opResult.taskData) {
        const userConfirmed = await askConfirmation(opResult.reason, undefined, 'teal');
        if (userConfirmed) {
            confirmCallback(opResult.taskData, opResult.originalIndex, opResult.conflictingTask);
            updateStartTimeField(getSuggestedStartTime(), true);
        } else {
            showAlert('Task operation cancelled to avoid overlap.', 'teal');
            if (cancelCallback) cancelCallback();
        }
    } else if (!opResult.success && opResult.reason) {
        showAlert(opResult.reason, 'teal');
        if (cancelCallback) cancelCallback();
    } else if (opResult.success && opResult.type === 'scheduled') {
        updateStartTimeField(getSuggestedStartTime(), true);
    }
}

async function handleAddTaskProcess(formElement, initialTaskData, localScheduledTaskEventCallbacks, localUnscheduledTaskEventCallbacks) {
    let operationResult = addTask(initialTaskData);

    if (operationResult.requiresConfirmation) {
        if (operationResult.confirmationType === 'RESCHEDULE_NEEDS_SHIFT_DUE_TO_LOCKED') {
            const userConfirmedShift = await askConfirmation(operationResult.reason, undefined, initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo');
            if (userConfirmedShift && operationResult.adjustedTaskDataForResubmission) {
                // User confirmed the shift, resubmit with adjusted data
                operationResult = addTask(operationResult.adjustedTaskDataForResubmission, true);
            } else {
                showAlert('Task not added as the proposed shift due to a locked task was declined.', initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo');
                // End processing for this task addition attempt
                const currentAllTasksOnDeclineShift = getTaskState();
                renderTasks(currentAllTasksOnDeclineShift.filter(isScheduledTask), localScheduledTaskEventCallbacks);
                renderUnscheduledTasks(getSortedUnscheduledTasks(), localUnscheduledTaskEventCallbacks);
                return;
            }
        }
        // Removed the 'else' here to allow falling through to the next confirmation stage if the first wasn't 'NEEDS_SHIFT'
    }

    // Second stage of confirmation if needed (e.g., after a shift, it now overlaps others, or if initial overlap was with unlocked)
    if (operationResult.requiresConfirmation) {
        if (operationResult.confirmationType === 'RESCHEDULE_OVERLAPS_UNLOCKED_OTHERS') {
            const userConfirmedReschedule = await askConfirmation(operationResult.reason, undefined, initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo');
            if (userConfirmedReschedule && operationResult.taskObjectToFinalize) {
                operationResult = confirmAddTaskAndReschedule({ taskObject: operationResult.taskObjectToFinalize });
            } else {
                showAlert('Task not added as rescheduling of other tasks was declined.', initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo');
                const currentAllTasksOnDeclineReschedule = getTaskState();
                renderTasks(currentAllTasksOnDeclineReschedule.filter(isScheduledTask), localScheduledTaskEventCallbacks);
                renderUnscheduledTasks(getSortedUnscheduledTasks(), localUnscheduledTaskEventCallbacks);
                return;
            }
        } else if (operationResult.confirmationType === 'RESCHEDULE_ADD') { // Handle legacy/original simple overlap if necessary
             const userConfirmedLegacy = await askConfirmation(operationResult.reason, undefined, initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo');
             if (userConfirmedLegacy && operationResult.taskObject) {
                operationResult = confirmAddTaskAndReschedule({ taskObject: operationResult.taskObject });
             } else {
                showAlert('Task not added to avoid overlap.', initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo');
                const currentAllTasksOnDeclineLegacy = getTaskState();
                renderTasks(currentAllTasksOnDeclineLegacy.filter(isScheduledTask), localScheduledTaskEventCallbacks);
                renderUnscheduledTasks(getSortedUnscheduledTasks(), localUnscheduledTaskEventCallbacks);
                return;
             }
        }
        // If there are other confirmation types not handled, operationResult might still be requiresConfirmation=true
        // but without a path to make it success=true.
    }

    if (operationResult.success) {
        formElement.reset();
        initializeTaskTypeToggle();
        if (initialTaskData.taskType === 'scheduled') {
            updateStartTimeField(getSuggestedStartTime(), true);
        }
        focusTaskDescriptionInput();
        if (operationResult.autoRescheduledMessage) {
            showAlert(operationResult.autoRescheduledMessage, initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo');
        } else if (operationResult.message) {
            showAlert(operationResult.message, initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo');
        }
    } else if (operationResult.reason) {
        showAlert(operationResult.reason, initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo');
        focusTaskDescriptionInput();
    } else if (!operationResult.processed && !operationResult.success) {
        // Fallback for unhandled confirmation or silent failure
        logger.warn('[app.js] handleAddTaskProcess: Operation did not succeed and had no specific reason or wasn\'t processed after confirmation.', operationResult);
        showAlert('Could not process the task at this time.', initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo');
    }

    const currentAllTasks = getTaskState();
    renderTasks(currentAllTasks.filter(isScheduledTask), localScheduledTaskEventCallbacks);
    renderUnscheduledTasks(getSortedUnscheduledTasks(), localUnscheduledTaskEventCallbacks);
}
