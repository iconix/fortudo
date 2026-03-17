import {
    addTask,
    confirmAddTaskAndReschedule,
    adjustAndCompleteTask,
    truncateCompletedTask
} from './manager.js';
import { showAlert, askConfirmation } from '../modal-manager.js';
import { showToast } from '../toast-manager.js';
import { focusTaskDescriptionInput, resetTaskFormPreviewState } from './form-utils.js';
import { triggerConfettiAnimation } from './scheduled-renderer.js';
import { refreshUI, initializeTaskTypeToggle } from '../dom-renderer.js';
import { onTaskAdded } from '../app-coordinator.js';
import { getThemeForTaskType, logger } from '../utils.js';

/**
 * Handle the full add-task flow including multi-stage confirmations
 * @param {HTMLFormElement} formElement - The task form element
 * @param {Object} initialTaskData - Extracted form data
 */
export async function handleAddTaskProcess(formElement, initialTaskData, options = {}) {
    const { reschedulePreApproved = false } = options;
    const theme = getThemeForTaskType(initialTaskData.taskType);

    let operationResult = addTask(initialTaskData);

    // Handle adjust running task confirmation (truncate or extend)
    if (
        operationResult.requiresConfirmation &&
        operationResult.confirmationType === 'ADJUST_RUNNING_TASK'
    ) {
        const buttonLabel = operationResult.isExtend
            ? 'Yes, extend & complete'
            : 'Yes, complete it';
        const userConfirmed = await askConfirmation(
            operationResult.reason,
            { ok: buttonLabel, cancel: 'No, reschedule instead' },
            theme
        );

        if (userConfirmed) {
            const adjustResult = adjustAndCompleteTask(
                operationResult.adjustableTask.id,
                operationResult.newEndTime
            );

            if (adjustResult.success) {
                triggerConfettiAnimation(operationResult.adjustableTask.id);
                operationResult = addTask({ ...initialTaskData, _skipAdjustCheck: true }, false);
            } else {
                showAlert(`Could not complete task: ${adjustResult.reason}`, theme);
                refreshUI();
                return;
            }
        } else {
            operationResult = addTask({ ...initialTaskData, _skipAdjustCheck: true }, false);
        }
    }

    // Handle truncate completed task confirmation
    if (
        operationResult.requiresConfirmation &&
        operationResult.confirmationType === 'TRUNCATE_COMPLETED_TASK'
    ) {
        const userConfirmed = await askConfirmation(
            operationResult.reason,
            { ok: 'Yes, truncate it', cancel: 'Cancel' },
            theme
        );

        if (userConfirmed) {
            const truncateResult = truncateCompletedTask(
                operationResult.completedTaskToTruncate.id,
                operationResult.newEndTime
            );

            if (truncateResult.success) {
                operationResult = addTask({ ...initialTaskData, _skipCompletedCheck: true }, false);
            } else {
                showAlert(`Could not truncate task: ${truncateResult.reason}`, theme);
                refreshUI();
                return;
            }
        } else {
            showAlert('Task not added.', theme);
            refreshUI();
            return;
        }
    }

    // First confirmation stage: locked task shift
    if (
        operationResult.requiresConfirmation &&
        operationResult.confirmationType === 'RESCHEDULE_NEEDS_SHIFT_DUE_TO_LOCKED'
    ) {
        const userConfirmedShift = await askConfirmation(operationResult.reason, undefined, theme);
        if (userConfirmedShift && operationResult.adjustedTaskDataForResubmission) {
            operationResult = addTask(operationResult.adjustedTaskDataForResubmission, true);
        } else {
            showAlert(
                'Task not added as the proposed shift due to a locked task was declined.',
                theme
            );
            refreshUI();
            return;
        }
    }

    // Second confirmation stage: unlocked task overlap
    if (
        operationResult.requiresConfirmation &&
        operationResult.confirmationType === 'RESCHEDULE_OVERLAPS_UNLOCKED_OTHERS'
    ) {
        const userConfirmedReschedule =
            reschedulePreApproved ||
            (await askConfirmation(operationResult.reason, undefined, theme));
        if (userConfirmedReschedule && operationResult.taskObjectToFinalize) {
            operationResult = confirmAddTaskAndReschedule({
                taskObjectToFinalize: operationResult.taskObjectToFinalize
            });
        } else {
            showAlert('Task not added as rescheduling of other tasks was declined.', theme);
            refreshUI();
            return;
        }
    }

    if (operationResult.success) {
        const taskType = formElement.querySelector('input[name="task-type"]:checked')?.value;
        formElement.reset();
        resetTaskFormPreviewState({
            hintElement: document.getElementById('end-time-hint'),
            warningElement: document.getElementById('overlap-warning'),
            buttonElement: document.getElementById('add-task-btn')
        });

        if (taskType) {
            const taskTypeRadio = formElement.querySelector(
                `input[name="task-type"][value="${taskType}"]`
            );
            if (taskTypeRadio) {
                taskTypeRadio.checked = true;
            }
        }

        initializeTaskTypeToggle();
        focusTaskDescriptionInput();
        onTaskAdded({
            type: initialTaskData.taskType,
            id: operationResult.taskId ?? operationResult.task?.id
        });

        if (operationResult.autoRescheduledMessage) {
            showToast(operationResult.autoRescheduledMessage, { theme });
        } else if (operationResult.message) {
            showToast(operationResult.message, { theme });
        }
    } else if (operationResult.reason) {
        showAlert(operationResult.reason, theme);
        focusTaskDescriptionInput();
    } else if (!operationResult.processed && !operationResult.success) {
        logger.warn(
            '[add-task-handler] handleAddTaskProcess: Operation did not succeed.',
            operationResult
        );
        showAlert('Could not process the task at this time.', theme);
    }

    if (!operationResult.success) {
        refreshUI();
    }
}
