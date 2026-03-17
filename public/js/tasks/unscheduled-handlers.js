import {
    getTaskById,
    setTaskInlineEditing,
    deleteUnscheduledTask,
    scheduleUnscheduledTask,
    confirmScheduleUnscheduledTask,
    updateUnscheduledTask,
    toggleUnscheduledTaskCompleteState,
    getSuggestedStartTime
} from './manager.js';
import { showAlert, askConfirmation, showScheduleModal } from '../modal-manager.js';
import { showToast } from '../toast-manager.js';
import {
    populateUnscheduledTaskInlineEditForm,
    getUnscheduledTaskInlineFormData
} from './form-utils.js';
import { refreshUI } from '../dom-renderer.js';
import { onTaskUpdated, onTaskDeleted } from '../app-coordinator.js';
import { calculateHoursAndMinutes, logger } from '../utils.js';
import { getThemeForTaskId } from './confirmation-helpers.js';

export function handleScheduleUnscheduledTask(taskId) {
    const task = getTaskById(taskId);
    if (task) {
        if (task.status === 'completed') {
            showAlert('This task is already completed and cannot be scheduled.', 'indigo');
            return;
        }
        showScheduleModal(
            task.description,
            calculateHoursAndMinutes(task.estDuration),
            taskId,
            getSuggestedStartTime()
        );
    } else logger.error(`Task to schedule not found: ${taskId}`);
}

export function handleEditUnscheduledTask(taskId) {
    const task = getTaskById(taskId);
    if (task && task.type === 'unscheduled') {
        const isEditing = !task.isEditingInline;
        setTaskInlineEditing(taskId, isEditing);
        if (isEditing) {
            populateUnscheduledTaskInlineEditForm(taskId, task);
        }
        refreshUI();
    } else {
        logger.error(`Unscheduled task not found for editing: ${taskId}`);
        showAlert('Could not find the task to edit.', 'teal');
    }
}

export async function handleDeleteUnscheduledTask(taskId) {
    logger.info(`Attempting to delete unscheduled task: ${taskId}`);
    const result = deleteUnscheduledTask(taskId);
    if (result.success) {
        showToast(result.message || 'Task deleted.', { theme: 'teal' });
        onTaskDeleted(taskId);
    } else if (!result.requiresConfirmation && result.reason) {
        showAlert(result.reason, 'teal');
        refreshUI();
    } else {
        refreshUI();
    }
}

export async function handleConfirmScheduleTask(
    taskId,
    startTime,
    duration,
    reschedulePreApproved = false
) {
    const result = scheduleUnscheduledTask(taskId, startTime, duration);
    if (result.requiresConfirmation) {
        const userConfirmed =
            reschedulePreApproved || (await askConfirmation(result.reason, undefined, 'indigo'));
        if (userConfirmed && result.context) {
            const confirmResult = confirmScheduleUnscheduledTask(
                result.context.unscheduledTaskId,
                result.context.scheduledTaskData
            );
            if (confirmResult.success) {
                onTaskUpdated(confirmResult.task);
            } else {
                showAlert(confirmResult.reason || 'Task could not be scheduled.', 'indigo');
                refreshUI();
            }
        } else if (!userConfirmed) {
            showAlert('Task not scheduled to avoid overlap.', 'indigo');
            refreshUI();
        }
    } else if (!result.success) {
        showAlert(result.reason, 'indigo');
        refreshUI();
    } else {
        onTaskUpdated(result.task);
    }
}

export async function handleSaveUnscheduledTaskEdit(taskId) {
    const task = getTaskById(taskId);
    if (!task || task.type !== 'unscheduled' || !task.isEditingInline) {
        logger.error('Task not found or not in inline edit mode for saving:', taskId);
        return;
    }
    const updatedData = getUnscheduledTaskInlineFormData(taskId);
    if (!updatedData) return;
    const result = updateUnscheduledTask(taskId, updatedData);
    if (result.success) {
        setTaskInlineEditing(taskId, false);
        onTaskUpdated(result.task);
    } else {
        showAlert(result.reason || 'Could not save unscheduled task.', 'indigo');
    }
}

export function handleCancelUnscheduledTaskEdit(taskId) {
    const task = getTaskById(taskId);
    if (task && task.type === 'unscheduled' && task.isEditingInline) {
        setTaskInlineEditing(taskId, false);
        refreshUI();
    } else {
        logger.warn('Task not found or not in inline edit mode for cancel:', taskId);
    }
}

export function handleToggleCompleteUnscheduledTask(taskId) {
    logger.debug(`Toggling complete status for unscheduled task: ${taskId}`);
    const result = toggleUnscheduledTaskCompleteState(taskId);
    if (result && result.success) {
        onTaskUpdated(result.task);
    } else {
        showAlert(
            result.reason || 'Could not update task completion status.',
            getThemeForTaskId(taskId)
        );
    }
}

/**
 * Create the unscheduled task callbacks object mapping on* names to handle* functions
 * @returns {Object} Callback object for unscheduled task event delegation
 */
export function createUnscheduledTaskCallbacks() {
    return {
        onScheduleUnscheduledTask: handleScheduleUnscheduledTask,
        onEditUnscheduledTask: handleEditUnscheduledTask,
        onDeleteUnscheduledTask: handleDeleteUnscheduledTask,
        onConfirmScheduleTask: handleConfirmScheduleTask,
        onSaveUnscheduledTaskEdit: handleSaveUnscheduledTaskEdit,
        onCancelUnscheduledTaskEdit: handleCancelUnscheduledTaskEdit,
        onToggleCompleteUnscheduledTask: handleToggleCompleteUnscheduledTask
    };
}
