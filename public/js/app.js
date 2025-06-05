// Orchestrator: public/js/app.js
import {
    updateTaskState,
    getTaskState,
    addTask,
    confirmAddTaskAndReschedule,
    updateTask,
    updateUnscheduledTask,
    confirmUpdateTaskAndReschedule,
    deleteTask,
    deleteUnscheduledTask,
    completeTask,
    confirmCompleteLate,
    editTask,
    cancelEdit,
    deleteAllTasks,
    getSuggestedStartTime,
    resetAllConfirmingDeleteFlags,
    scheduleUnscheduledTask,
    confirmScheduleUnscheduledTask,
    reorderUnscheduledTask,
    getSortedUnscheduledTasks,
    toggleUnscheduledTaskCompleteState,
    unscheduleTask,
    toggleLockState,
    isScheduledTask,
    deleteAllScheduledTasks,
    deleteCompletedTasks
} from './task-manager.js';
import {
    renderTasks,
    renderUnscheduledTasks,
    updateStartTimeField,
    initializePageEventListeners,
    initializeModalEventListeners,
    showAlert,
    askConfirmation,
    getTaskFormElement,
    getCurrentTimeElement,
    getDeleteAllButtonElement,
    focusTaskDescriptionInput,
    extractTaskFormData,
    refreshActiveTaskColor,
    refreshStartTimeField,
    initializeTaskTypeToggle,
    startRealTimeClock,
    initializeUnscheduledTaskListEventListeners,
    triggerConfettiAnimation,
    populateUnscheduledTaskInlineEditForm,
    getUnscheduledTaskInlineFormData,
    showScheduleModal,
    getClearTasksDropdownMenuElement,
    getClearScheduledOptionElement,
    getClearOptionsDropdownTriggerButtonElement,
    getClearCompletedOptionElement,
    toggleClearTasksDropdown,
    closeClearTasksDropdown
} from './dom-handler.js';
import { loadTasksFromStorage } from './storage.js';
import {
    convertTo24HourTime,
    convertTo12HourTime,
    logger,
    calculateHoursAndMinutes
} from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const loadedTasks = loadTasksFromStorage();
    // Reset isEditingInline for all tasks loaded from storage
    loadedTasks.forEach((task) => {
        if (Object.prototype.hasOwnProperty.call(task, 'isEditingInline')) {
            task.isEditingInline = false;
        }
    });
    updateTaskState(loadedTasks);

    const allTasksInitial = getTaskState();
    const scheduledTasks = allTasksInitial.filter((task) => task.type === 'scheduled');

    const scheduledTaskEventCallbacks = {
        onCompleteTask: async (taskId, _taskIndex) => {
            const taskToComplete = getTaskState().find((t) => t.id === taskId);
            if (!taskToComplete) {
                logger.error(`Task with ID ${taskId} not found to complete.`);
                return;
            }

            const originalIndexForTaskManager = getTaskState().findIndex((t) => t.id === taskId);
            if (originalIndexForTaskManager === -1) {
                logger.error(
                    `Task with ID ${taskId} not found in original state for task manager.`
                );
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
            if (
                result.success &&
                result.requiresConfirmation &&
                result.confirmationType === 'COMPLETE_LATE' &&
                result.newEndTime &&
                result.newDuration
            ) {
                if (
                    await askConfirmation(
                        `Task completed! 🎉💪🏾 Do you want to update your schedule to show you finished at ${convertTo12HourTime(result.newEndTime)}? This helps keep your timeline accurate.`,
                        { ok: 'Yes', cancel: 'No' },
                        getThemeForTask(taskToComplete)
                    )
                ) {
                    confirmCompleteLate(
                        originalIndexForTaskManager,
                        result.newEndTime,
                        result.newDuration
                    );
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
            renderTasks(
                currentAllTasks.filter((t) => t.type === 'scheduled'),
                scheduledTaskEventCallbacks
            );
            renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks); // Also re-render unscheduled in case completion affects it

            // NOW, trigger confetti on the newly rendered (and existing) task element
            if (taskActuallyCompleted) {
                triggerConfettiAnimation(taskId);
            }
        },
        onLockTask: (taskId, _taskIndex) => {
            const result = toggleLockState(taskId);
            if (!result.success && result.reason) {
                showAlert(result.reason, getThemeForTaskId(taskId));
            }
            const currentAllTasks = getTaskState();
            renderTasks(
                currentAllTasks.filter((t) => t.type === 'scheduled'),
                scheduledTaskEventCallbacks
            );
        },
        onEditTask: (taskId, _taskIndex) => {
            const taskToEdit = getTaskState().find((t) => t.id === taskId);
            if (!taskToEdit || taskToEdit.type !== 'scheduled') {
                logger.warn('onEditTask for non-scheduled', taskId);
                return;
            }
            const originalIndexForTaskManager = getTaskState().indexOf(taskToEdit);
            editTask(originalIndexForTaskManager);
            const currentAllTasks = getTaskState();
            renderTasks(
                currentAllTasks.filter((t) => t.type === 'scheduled'),
                scheduledTaskEventCallbacks
            );
        },
        onDeleteTask: (taskId, _taskIndex) => {
            const taskToDelete = getTaskState().find((t) => t.id === taskId);
            if (!taskToDelete || taskToDelete.type !== 'scheduled') {
                logger.warn('onDeleteTask for non-scheduled', taskId);
                return;
            }
            const originalIndexForTaskManager = getTaskState().indexOf(taskToDelete);
            const result = deleteTask(originalIndexForTaskManager, taskToDelete.confirmingDelete);
            if (result.success) updateStartTimeField(getSuggestedStartTime(), true);
            else if (!result.requiresConfirmation && result.reason)
                showAlert(result.reason, getThemeForTaskId(taskId));
            const currentAllTasks = getTaskState();
            renderTasks(
                currentAllTasks.filter((t) => t.type === 'scheduled'),
                scheduledTaskEventCallbacks
            );
        },
        onUnscheduleTask: (taskId, _taskIndex) => {
            logger.info('Unschedule button clicked for', { taskId });
            const unscheduleResult = unscheduleTask(taskId);
            if (unscheduleResult.success) {
                // No specific alert for success, UI will refresh.
            } else if (unscheduleResult.reason) {
                showAlert(unscheduleResult.reason, 'teal');
            }
            // Re-render both lists as a task moves from scheduled to unscheduled
            const currentTasks = getTaskState();
            renderTasks(
                currentTasks.filter((t) => t.type === 'scheduled'),
                scheduledTaskEventCallbacks
            );
            renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);
            updateStartTimeField(getSuggestedStartTime(), true);
        },
        onSaveTaskEdit: async (taskId, formElement, _taskIndex) => {
            const taskData = extractTaskFormData(formElement);
            if (!taskData) {
                return;
            }

            const taskToSave = getTaskState().find((t) => t.id === taskId);
            if (!taskToSave || taskToSave.type !== 'scheduled') {
                logger.warn('onSaveTaskEdit for non-existent or non-scheduled task', {
                    taskId,
                    taskType: taskToSave?.type
                });
                return;
            }
            const originalIndexForTaskManager = getTaskState().indexOf(taskToSave);

            const updateResult = updateTask(originalIndexForTaskManager, taskData);
            await handleRescheduleConfirmation(updateResult, confirmUpdateTaskAndReschedule, () =>
                cancelEdit(originalIndexForTaskManager)
            );
            const currentAllTasksAfterUpdate = getTaskState();
            renderTasks(
                currentAllTasksAfterUpdate.filter((t) => t.type === 'scheduled'),
                scheduledTaskEventCallbacks
            );
        },
        onCancelEdit: (taskId, _taskIndex) => {
            const taskToCancel = getTaskState().find((t) => t.id === taskId);
            if (!taskToCancel || taskToCancel.type !== 'scheduled') {
                logger.warn('onCancelEdit for non-scheduled', taskId);
                return;
            }
            const originalIndexForTaskManager = getTaskState().indexOf(taskToCancel);
            cancelEdit(originalIndexForTaskManager);
            const currentAllTasks = getTaskState();
            renderTasks(
                currentAllTasks.filter((t) => t.type === 'scheduled'),
                scheduledTaskEventCallbacks
            );
        }
    };

    const unscheduledTaskEventCallbacks = {
        onScheduleUnscheduledTask: (taskId) => {
            const task = getTaskState().find((t) => t.id === taskId);
            if (task) {
                if (task.status === 'completed') {
                    showAlert('This task is already completed and cannot be scheduled.', 'indigo');
                    return;
                }
                showScheduleModal(
                    task.description,
                    calculateHoursAndMinutes(task.estDuration),
                    taskId
                );
            } else logger.error(`Task to schedule not found: ${taskId}`);
        },
        onEditUnscheduledTask: (taskId) => {
            const task = getTaskState().find((t) => t.id === taskId);
            if (task && task.type === 'unscheduled') {
                const currentlyEditing = getTaskState().find(
                    (t) => t.isEditingInline && t.id !== taskId
                );
                if (currentlyEditing) {
                    currentlyEditing.isEditingInline = false;
                }
                task.isEditingInline = !task.isEditingInline;
                if (task.isEditingInline) {
                    populateUnscheduledTaskInlineEditForm(taskId, task);
                }
                renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);
            } else {
                logger.error(`Unscheduled task not found for editing: ${taskId}`);
                showAlert('Could not find the task to edit.', 'teal');
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
                    confirmScheduleUnscheduledTask(
                        result.taskData.unscheduledTaskId,
                        result.taskData.newScheduledTaskData
                    );
                } else if (!userConfirmed) {
                    showAlert('Task not scheduled to avoid overlap.', 'indigo');
                }
            } else if (!result.success) {
                showAlert(result.reason, 'indigo');
            }
            const currentAllTasks = getTaskState();
            renderTasks(
                currentAllTasks.filter((t) => t.type === 'scheduled'),
                scheduledTaskEventCallbacks
            );
            renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);
        },
        onSaveUnscheduledTaskEdit: async (taskId) => {
            const task = getTaskState().find((t) => t.id === taskId);
            if (!task || task.type !== 'unscheduled' || !task.isEditingInline) {
                logger.error('Task not found or not in inline edit mode for saving:', taskId);
                return;
            }
            const updatedData = getUnscheduledTaskInlineFormData(taskId);
            if (!updatedData) return;
            const originalPriority = task.priority;
            const result = updateUnscheduledTask(taskId, updatedData);
            if (result.success) {
                task.isEditingInline = false;
                if (originalPriority !== updatedData.priority) {
                    renderUnscheduledTasks(
                        getSortedUnscheduledTasks(),
                        unscheduledTaskEventCallbacks
                    );
                } else {
                    // If priority didn't change, a full sort might not be needed, just re-render.
                    // However, getSortedUnscheduledTasks() is quick, so using it is simpler.
                    renderUnscheduledTasks(
                        getSortedUnscheduledTasks(),
                        unscheduledTaskEventCallbacks
                    );
                }
            } else {
                showAlert(result.reason || 'Could not save unscheduled task.', 'indigo');
            }
        },
        onCancelUnscheduledTaskEdit: (taskId) => {
            const task = getTaskState().find((t) => t.id === taskId);
            if (task && task.type === 'unscheduled' && task.isEditingInline) {
                task.isEditingInline = false;
                renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);
            } else {
                logger.warn('Task not found or not in inline edit mode for cancel:', taskId);
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
                showAlert(
                    result.reason || 'Could not update task completion status.',
                    getThemeForTaskId(taskId)
                );
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
            await handleAddTaskProcess(
                formElement,
                taskData,
                scheduledTaskEventCallbacks,
                unscheduledTaskEventCallbacks
            );
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
                    renderTasks(
                        currentAllTasks.filter((t) => t.type === 'scheduled'),
                        scheduledTaskEventCallbacks
                    );
                    renderUnscheduledTasks(
                        getSortedUnscheduledTasks(),
                        unscheduledTaskEventCallbacks
                    );
                }
            }
        }
    };

    const taskFormElement = getTaskFormElement();
    if (!taskFormElement) logger.error('CRITICAL: app.js could not find #task-form element.');

    initializePageEventListeners(appCallbacks, taskFormElement);
    initializeTaskTypeToggle();
    startRealTimeClock();
    initializeUnscheduledTaskListEventListeners(unscheduledTaskEventCallbacks);
    initializeModalEventListeners(unscheduledTaskEventCallbacks, appCallbacks);

    renderTasks(scheduledTasks, scheduledTaskEventCallbacks);
    renderUnscheduledTasks(getSortedUnscheduledTasks(), unscheduledTaskEventCallbacks);

    // Initialize Start Time field
    const suggested = getSuggestedStartTime();
    logger.debug('DOMContentLoaded - getSuggestedStartTime() returned:', suggested);
    updateStartTimeField(suggested, true);

    focusTaskDescriptionInput();

    setInterval(() => {
        refreshActiveTaskColor(getTaskState());
        refreshStartTimeField();
    }, 1000);

    // Setup event listener for the "Clear All Tasks" (main part of split button)
    const deleteAllButton = getDeleteAllButtonElement();
    if (deleteAllButton) {
        deleteAllButton.addEventListener('click', async (event) => {
            // This button now directly clears all tasks
            event.stopPropagation(); // Good practice, though maybe not strictly needed if not toggling a dropdown itself
            const tasksExist = getTaskState().length > 0;
            if (!tasksExist) {
                showAlert('There are no tasks to delete.', 'red');
                return;
            }
            if (
                await askConfirmation(
                    'Are you sure you want to delete ALL tasks (scheduled and unscheduled)? This action cannot be undone.',
                    undefined,
                    'red'
                )
            ) {
                const result = deleteAllTasks();
                if (result.success) {
                    showAlert(result.message || 'All tasks have been deleted.', 'red');
                    renderTasks([], scheduledTaskEventCallbacks);
                    renderUnscheduledTasks([], unscheduledTaskEventCallbacks);
                    updateStartTimeField(getSuggestedStartTime(), true);
                } else {
                    showAlert(result.reason || 'Failed to delete all tasks.', 'red');
                }
            }
            // No dropdown to close here, as this is a direct action button
        });
    }

    // Setup event listener for the Caret Button (dropdown trigger part of split button)
    const clearOptionsTriggerButton = getClearOptionsDropdownTriggerButtonElement();
    if (clearOptionsTriggerButton) {
        clearOptionsTriggerButton.addEventListener('click', (event) => {
            event.stopPropagation(); // Important to prevent global click listener from closing it immediately
            toggleClearTasksDropdown();
        });
    }

    // Setup event listener for the "Clear Scheduled Tasks" dropdown option
    const clearScheduledOption = getClearScheduledOptionElement();
    if (clearScheduledOption) {
        clearScheduledOption.addEventListener('click', async (event) => {
            event.preventDefault(); // It's an <a> tag
            const scheduledTasksExist = getTaskState().some((task) => task.type === 'scheduled');
            if (!scheduledTasksExist) {
                showAlert('There are no scheduled tasks to clear.', 'teal');
                closeClearTasksDropdown();
                return;
            }

            if (
                await askConfirmation(
                    "Are you sure you want to clear all tasks from Today's Schedule? Unscheduled tasks will not be affected.",
                    undefined,
                    'teal'
                )
            ) {
                const result = deleteAllScheduledTasks();
                if (result.success) {
                    showAlert(result.message || 'All scheduled tasks have been cleared.', 'teal');
                    const currentTasks = getTaskState();
                    renderTasks(
                        currentTasks.filter((t) => t.type === 'scheduled'),
                        scheduledTaskEventCallbacks
                    );
                    renderUnscheduledTasks(
                        getSortedUnscheduledTasks(),
                        unscheduledTaskEventCallbacks
                    );
                    updateStartTimeField(getSuggestedStartTime(), true);
                } else {
                    showAlert(result.reason || 'Failed to clear scheduled tasks.', 'red');
                }
            }
            closeClearTasksDropdown();
        });
    }

    // Setup event listener for the "Clear Completed Tasks" dropdown option
    const clearCompletedOption = getClearCompletedOptionElement();
    if (clearCompletedOption) {
        clearCompletedOption.addEventListener('click', async (event) => {
            event.preventDefault(); // It's an <a> tag
            const completedTasksExist = getTaskState().some((task) => task.status === 'completed');
            if (!completedTasksExist) {
                showAlert('There are no completed tasks to clear.', 'indigo');
                closeClearTasksDropdown();
                return;
            }

            if (
                await askConfirmation(
                    'Are you sure you want to clear all completed tasks? This will remove them from both scheduled and unscheduled lists.',
                    undefined,
                    'indigo' // Using indigo for completed, similar to unscheduled tasks theme
                )
            ) {
                const result = deleteCompletedTasks();
                if (result.success) {
                    showAlert(result.message || 'All completed tasks have been cleared.', 'indigo');
                    const currentTasks = getTaskState(); // Get the updated list
                    renderTasks(
                        currentTasks.filter((t) => t.type === 'scheduled'),
                        scheduledTaskEventCallbacks
                    );
                    renderUnscheduledTasks(
                        getSortedUnscheduledTasks(),
                        unscheduledTaskEventCallbacks
                    );
                    updateStartTimeField(getSuggestedStartTime(), true); // Update start time in case next task shifts
                } else {
                    showAlert(result.reason || 'Failed to clear completed tasks.', 'red');
                }
            }
            closeClearTasksDropdown();
        });
    }

    // Global click listener to close dropdown when clicking outside
    window.addEventListener('click', (event) => {
        const dropdownTrigger = getClearOptionsDropdownTriggerButtonElement(); // Use the new caret button as trigger
        const dropdownMenu = getClearTasksDropdownMenuElement();
        const mainClearAllButton = getDeleteAllButtonElement(); // Get the main clear all button

        if (dropdownTrigger && dropdownMenu && mainClearAllButton) {
            const target = event.target;
            if (target instanceof Node) {
                const isClickInsideCaret = dropdownTrigger.contains(target);
                const isClickInsideMenu = dropdownMenu.contains(target);
                const isClickInsideMainButton = mainClearAllButton.contains(target); // Check if click is on main button

                // Close if click is outside caret, outside menu, AND outside the main clear all button (to avoid closing when main button is clicked)
                if (!isClickInsideCaret && !isClickInsideMenu && !isClickInsideMainButton) {
                    closeClearTasksDropdown();
                }
            } else {
                closeClearTasksDropdown();
            }
        }
    });
});

// Helper function to determine the theme based on task type
function getThemeForTask(task) {
    return task?.type === 'scheduled' ? 'teal' : 'indigo';
}

// Helper function to determine the theme based on task type from task ID
function getThemeForTaskId(taskId) {
    const task = getTaskState().find((t) => t.id === taskId);
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

async function handleAddTaskProcess(
    formElement,
    initialTaskData,
    localScheduledTaskEventCallbacks,
    localUnscheduledTaskEventCallbacks
) {
    let operationResult = addTask(initialTaskData);

    if (operationResult.requiresConfirmation) {
        if (operationResult.confirmationType === 'RESCHEDULE_NEEDS_SHIFT_DUE_TO_LOCKED') {
            const userConfirmedShift = await askConfirmation(
                operationResult.reason,
                undefined,
                initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo'
            );
            if (userConfirmedShift && operationResult.adjustedTaskDataForResubmission) {
                // User confirmed the shift, resubmit with adjusted data
                operationResult = addTask(operationResult.adjustedTaskDataForResubmission, true);
            } else {
                showAlert(
                    'Task not added as the proposed shift due to a locked task was declined.',
                    initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo'
                );
                // End processing for this task addition attempt
                const currentAllTasksOnDeclineShift = getTaskState();
                renderTasks(
                    currentAllTasksOnDeclineShift.filter(isScheduledTask),
                    localScheduledTaskEventCallbacks
                );
                renderUnscheduledTasks(
                    getSortedUnscheduledTasks(),
                    localUnscheduledTaskEventCallbacks
                );
                return;
            }
        }
        // Removed the 'else' here to allow falling through to the next confirmation stage if the first wasn't 'NEEDS_SHIFT'
    }

    // Second stage of confirmation if needed (e.g., after a shift, it now overlaps others, or if initial overlap was with unlocked)
    if (operationResult.requiresConfirmation) {
        if (operationResult.confirmationType === 'RESCHEDULE_OVERLAPS_UNLOCKED_OTHERS') {
            const userConfirmedReschedule = await askConfirmation(
                operationResult.reason,
                undefined,
                initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo'
            );
            if (userConfirmedReschedule && operationResult.taskObjectToFinalize) {
                operationResult = confirmAddTaskAndReschedule({
                    taskObject: operationResult.taskObjectToFinalize
                });
            } else {
                showAlert(
                    'Task not added as rescheduling of other tasks was declined.',
                    initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo'
                );
                const currentAllTasksOnDeclineReschedule = getTaskState();
                renderTasks(
                    currentAllTasksOnDeclineReschedule.filter(isScheduledTask),
                    localScheduledTaskEventCallbacks
                );
                renderUnscheduledTasks(
                    getSortedUnscheduledTasks(),
                    localUnscheduledTaskEventCallbacks
                );
                return;
            }
        } else if (operationResult.confirmationType === 'RESCHEDULE_ADD') {
            // Handle legacy/original simple overlap if necessary
            const userConfirmedLegacy = await askConfirmation(
                operationResult.reason,
                undefined,
                initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo'
            );
            if (userConfirmedLegacy && operationResult.taskObject) {
                operationResult = confirmAddTaskAndReschedule({
                    taskObject: operationResult.taskObject
                });
            } else {
                showAlert(
                    'Task not added to avoid overlap.',
                    initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo'
                );
                const currentAllTasksOnDeclineLegacy = getTaskState();
                renderTasks(
                    currentAllTasksOnDeclineLegacy.filter(isScheduledTask),
                    localScheduledTaskEventCallbacks
                );
                renderUnscheduledTasks(
                    getSortedUnscheduledTasks(),
                    localUnscheduledTaskEventCallbacks
                );
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
            showAlert(
                operationResult.autoRescheduledMessage,
                initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo'
            );
        } else if (operationResult.message) {
            showAlert(
                operationResult.message,
                initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo'
            );
        }
    } else if (operationResult.reason) {
        showAlert(
            operationResult.reason,
            initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo'
        );
        focusTaskDescriptionInput();
    } else if (!operationResult.processed && !operationResult.success) {
        // Fallback for unhandled confirmation or silent failure
        logger.warn(
            "[app.js] handleAddTaskProcess: Operation did not succeed and had no specific reason or wasn't processed after confirmation.",
            operationResult
        );
        showAlert(
            'Could not process the task at this time.',
            initialTaskData.taskType === 'scheduled' ? 'teal' : 'indigo'
        );
    }

    const currentAllTasks = getTaskState();
    renderTasks(currentAllTasks.filter(isScheduledTask), localScheduledTaskEventCallbacks);
    renderUnscheduledTasks(getSortedUnscheduledTasks(), localUnscheduledTaskEventCallbacks);
}
