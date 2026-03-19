import { getTaskById } from './manager.js';
import { showAlert, askConfirmation } from '../modal-manager.js';
import { getThemeForTask } from '../utils.js';

/**
 * Determine the theme based on task ID
 * @param {string} taskId
 * @returns {'teal'|'indigo'}
 */
export function getThemeForTaskId(taskId) {
    const task = getTaskById(taskId);
    return getThemeForTask(task);
}

/**
 * Handle reschedule confirmations for task update operations
 * @param {Object} opResult - The operation result from updateTask
 * @param {Function} confirmCallback - Callback to invoke if user confirms
 * @param {Function} [cancelCallback] - Callback to invoke if user cancels
 */
export async function handleRescheduleConfirmation(
    opResult,
    confirmCallback,
    cancelCallback,
    options = {}
) {
    const { reschedulePreApproved = false } = options;

    // Handle UPDATE confirmation (taskIndex + updatedTaskObject)
    if (
        opResult.requiresConfirmation &&
        opResult.confirmationType === 'RESCHEDULE_UPDATE' &&
        opResult.taskIndex !== undefined &&
        opResult.updatedTaskObject
    ) {
        const userConfirmed =
            reschedulePreApproved ||
            (await askConfirmation(
                opResult.reason,
                { ok: 'Yes, reschedule', cancel: 'No, cancel' },
                'teal'
            ));
        if (userConfirmed) {
            const confirmResult = confirmCallback({
                taskIndex: opResult.taskIndex,
                updatedTaskObject: opResult.updatedTaskObject
            });
            if (confirmResult?.success) {
                return confirmResult;
            }
            if (confirmResult?.reason) {
                showAlert(confirmResult.reason, 'teal');
            }
        } else {
            showAlert('Task update cancelled to avoid overlap.', 'teal');
            if (cancelCallback) cancelCallback();
        }
    } else if (!opResult.success && opResult.reason) {
        showAlert(opResult.reason, 'teal');
        if (cancelCallback) cancelCallback();
    } else if (opResult.success) {
        return opResult;
    }
    return null;
}
