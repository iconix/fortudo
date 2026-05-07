import {
    getTaskById,
    getTaskIndex,
    completeTask,
    confirmCompleteLate,
    toggleLockState,
    editTask,
    deleteTask,
    unscheduleTask,
    updateTask,
    confirmUpdateTaskAndReschedule,
    cancelEdit,
    getSortedUnscheduledTasks
} from './manager.js';
import {
    showAlert,
    askConfirmation,
    showGapTaskPicker,
    showScheduleModal
} from '../modal-manager.js';
import { showToast } from '../toast-manager.js';
import { extractTaskFormData } from './form-utils.js';
import { refreshUI, getCurrentTimeElement } from '../dom-renderer.js';
import {
    convertTo24HourTime,
    convertTo12HourTime,
    calculateHoursAndMinutes,
    logger,
    getThemeForTask
} from '../utils.js';
import { getThemeForTaskId, handleRescheduleConfirmation } from './confirmation-helpers.js';
import {
    onTaskCompleted,
    onTaskEdited,
    onTaskDeleted,
    onTaskUnscheduled
} from '../app-coordinator.js';

export async function handleCompleteTask(taskId, _taskIndex) {
    const taskToComplete = getTaskById(taskId);
    if (!taskToComplete) {
        logger.error(`Task with ID ${taskId} not found to complete.`);
        return;
    }

    const originalIndex = getTaskIndex(taskId);
    if (originalIndex === -1) {
        logger.error(`Task with ID ${taskId} not found in state.`);
        return;
    }

    const currentTimeDisplayElement = getCurrentTimeElement();
    let currentTime24;
    if (currentTimeDisplayElement && currentTimeDisplayElement.textContent) {
        currentTime24 = convertTo24HourTime(currentTimeDisplayElement.textContent);
    }

    const result = completeTask(originalIndex, currentTime24);
    let taskActuallyCompleted = false;

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
            const lateResult = confirmCompleteLate(
                originalIndex,
                result.newEndTime,
                result.newDuration
            );
            if (lateResult.success) {
                taskActuallyCompleted = true;
            } else {
                completeTask(originalIndex);
                taskActuallyCompleted = true;
                showAlert(
                    `Completed the task, but couldn't extend the end time: ${lateResult.reason}`,
                    getThemeForTask(taskToComplete)
                );
            }
        } else {
            completeTask(originalIndex);
            taskActuallyCompleted = true;
        }
    } else if (result.success) {
        taskActuallyCompleted = true;
    }

    if (taskActuallyCompleted) {
        onTaskCompleted({ task: getTaskById(taskId) || taskToComplete });
    } else {
        refreshUI();
    }
}

export function handleLockTask(taskId, _taskIndex) {
    const result = toggleLockState(taskId);
    if (result.success) {
        onTaskEdited({ task: result.task });
    } else if (result.reason) {
        showAlert(result.reason, getThemeForTaskId(taskId));
    }
}

export function handleEditTask(taskId, _taskIndex) {
    const taskToEdit = getTaskById(taskId);
    if (!taskToEdit || taskToEdit.type !== 'scheduled') {
        logger.warn('handleEditTask for non-scheduled', taskId);
        return;
    }
    const originalIndex = getTaskIndex(taskId);
    editTask(originalIndex);
    refreshUI();
}

export function handleDeleteTask(taskId, _taskIndex) {
    const taskToDelete = getTaskById(taskId);
    if (!taskToDelete || taskToDelete.type !== 'scheduled') {
        logger.warn('handleDeleteTask for non-scheduled', taskId);
        return;
    }
    const originalIndex = getTaskIndex(taskId);
    const result = deleteTask(originalIndex, taskToDelete.confirmingDelete);
    if (result.success) onTaskDeleted({ task: result.task || taskToDelete });
    else if (!result.requiresConfirmation && result.reason)
        showAlert(result.reason, getThemeForTaskId(taskId));
    if (!result.success) refreshUI();
}

export function handleUnscheduleTask(taskId, _taskIndex) {
    logger.info('Unschedule button clicked for', { taskId });
    const unscheduleResult = unscheduleTask(taskId);
    if (unscheduleResult.success) {
        onTaskUnscheduled({ task: unscheduleResult.task });
    } else if (unscheduleResult.reason) {
        showAlert(unscheduleResult.reason, 'teal');
        refreshUI();
    }
}

export async function handleSaveTaskEdit(taskId, formElement, _taskIndex) {
    const taskData = extractTaskFormData(formElement);
    if (!taskData) {
        return;
    }
    const categorySelect = formElement.querySelector('select[name="category"]');
    if (
        categorySelect instanceof HTMLSelectElement &&
        !Object.prototype.hasOwnProperty.call(taskData, 'category')
    ) {
        taskData.category = null;
    }

    const taskToSave = getTaskById(taskId);
    if (!taskToSave || taskToSave.type !== 'scheduled') {
        logger.warn('handleSaveTaskEdit for non-existent or non-scheduled task', {
            taskId,
            taskType: taskToSave?.type
        });
        return;
    }
    const originalIndex = getTaskIndex(taskId);

    const overlapEl = formElement.querySelector('.edit-overlap-warning');
    const reschedulePreApproved = !!(overlapEl && overlapEl.textContent.trim());

    const updateResult = updateTask(originalIndex, taskData);
    const finalResult = await handleRescheduleConfirmation(
        updateResult,
        confirmUpdateTaskAndReschedule,
        () => cancelEdit(originalIndex),
        { reschedulePreApproved }
    );
    if (finalResult?.success) {
        onTaskEdited({ task: finalResult.task });
    } else {
        refreshUI();
    }
}

export function handleCancelEdit(taskId, _taskIndex) {
    const taskToCancel = getTaskById(taskId);
    if (!taskToCancel || taskToCancel.type !== 'scheduled') {
        logger.warn('handleCancelEdit for non-scheduled', taskId);
        return;
    }
    const originalIndex = getTaskIndex(taskId);
    cancelEdit(originalIndex);
    refreshUI();
}

/**
 * Handle click on a schedule gap to show unscheduled task picker
 * @param {string} gapStartISO - Gap start time in ISO format
 * @param {string} gapEndISO - Gap end time in ISO format
 * @param {number} durationMinutes - Gap duration in minutes
 */
export function handleGapClick(gapStartISO, gapEndISO, durationMinutes) {
    const unscheduledTasks = getSortedUnscheduledTasks().filter((t) => t.status !== 'completed');

    if (unscheduledTasks.length === 0) {
        showToast('No unscheduled tasks to schedule.', { theme: 'teal' });
        return;
    }

    showGapTaskPicker(
        gapStartISO,
        gapEndISO,
        durationMinutes,
        unscheduledTasks,
        (taskId, gapStartTime) => {
            const task = getTaskById(taskId);
            if (task) {
                showScheduleModal(
                    task.description,
                    task.estDuration ? calculateHoursAndMinutes(task.estDuration) : 'N/A',
                    taskId,
                    gapStartTime
                );
            }
        }
    );
}

/**
 * Create the scheduled task callbacks object mapping on* names to handle* functions
 * @returns {Object} Callback object for scheduled task event delegation
 */
export function createScheduledTaskCallbacks() {
    return {
        onCompleteTask: handleCompleteTask,
        onLockTask: handleLockTask,
        onEditTask: handleEditTask,
        onDeleteTask: handleDeleteTask,
        onUnscheduleTask: handleUnscheduleTask,
        onSaveTaskEdit: handleSaveTaskEdit,
        onCancelEdit: handleCancelEdit,
        onGapClick: handleGapClick
    };
}
