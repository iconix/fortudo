import {
    getTaskById,
    setTaskInlineEditing,
    deleteUnscheduledTask,
    scheduleUnscheduledTask,
    confirmScheduleUnscheduledTask,
    updateUnscheduledTask,
    toggleUnscheduledTaskCompleteState,
    getSuggestedStartTime
} from '../task-manager.js';
import { showAlert, askConfirmation, showScheduleModal } from '../modal-manager.js';
import {
    populateUnscheduledTaskInlineEditForm,
    getUnscheduledTaskInlineFormData
} from '../form-utils.js';
import { refreshUI } from '../dom-handler.js';
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
    if (result.success && result.message) {
        showAlert(result.message, 'teal');
    } else if (!result.requiresConfirmation && result.reason) {
        showAlert(result.reason, 'teal');
    }
    refreshUI();
}

export async function handleConfirmScheduleTask(taskId, startTime, duration) {
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
    refreshUI();
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
        refreshUI();
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
        refreshUI();
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
