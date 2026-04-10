import { showAlert } from '../modal-manager.js';
import { showToast } from '../toast-manager.js';
import { extractActivityFormData, extractActivityEditFormData } from './form-utils.js';
import {
    addActivity,
    editActivity,
    removeActivity,
    startTimer,
    stopTimer,
    getRunningActivity
} from './manager.js';
import { consumeActivitySmokeFailure } from './smoke-hooks.js';
import { onActivityCreated, onActivityEdited, onActivityDeleted } from '../app-coordinator.js';

function resolveActivityPayload(activityDataOrForm) {
    if (!(activityDataOrForm instanceof HTMLFormElement)) {
        return activityDataOrForm;
    }

    return activityDataOrForm.dataset.activityEdit === 'true'
        ? extractActivityEditFormData(activityDataOrForm)
        : extractActivityFormData(activityDataOrForm);
}

export async function handleAddActivity(activityDataOrForm) {
    const activityData = resolveActivityPayload(activityDataOrForm);
    if (!activityData) {
        return;
    }

    let result;
    try {
        if (consumeActivitySmokeFailure('manual-add')) {
            throw new Error('Smoke forced manual activity add failure.');
        }
        result = await addActivity(activityData);
    } catch {
        showAlert('Could not log activity.', 'sky');
        return { success: false, reason: 'Could not log activity.' };
    }

    if (!result.success) {
        showAlert(result.reason || 'Could not log activity.', 'sky');
        return {
            success: false,
            reason: result.reason || 'Could not log activity.'
        };
    }

    onActivityCreated({ activity: result.activity });
    showToast('Activity logged.', { theme: 'sky' });
    return result;
}

export async function handleEditActivity(activityId, updatesOrForm) {
    const updates = resolveActivityPayload(updatesOrForm);
    if (!updates) {
        return;
    }

    let result;
    try {
        result = await editActivity(activityId, updates);
    } catch {
        showAlert('Could not update activity.', 'sky');
        return { success: false, reason: 'Could not update activity.' };
    }

    if (!result.success) {
        showAlert(result.reason || 'Could not update activity.', 'sky');
        return {
            success: false,
            reason: result.reason || 'Could not update activity.'
        };
    }

    onActivityEdited({ activity: result.activity });
    showToast('Activity updated.', { theme: 'sky' });
    return result;
}

export async function handleSaveActivityEdit(activityId, formElement) {
    return handleEditActivity(activityId, formElement);
}

export async function handleDeleteActivity(activityId) {
    let result;
    try {
        result = await removeActivity(activityId);
    } catch {
        showAlert('Could not delete activity.', 'sky');
        return { success: false, reason: 'Could not delete activity.' };
    }

    if (!result.success) {
        showAlert(result.reason || 'Could not delete activity.', 'sky');
        return {
            success: false,
            reason: result.reason || 'Could not delete activity.'
        };
    }

    onActivityDeleted({ activity: result.activity });
    showToast('Activity deleted.', { theme: 'sky' });
    return result;
}

export async function handleStartTimer(timerData) {
    try {
        const runningActivity = getRunningActivity();
        if (runningActivity) {
            const stopResult = await stopTimer();
            if (!stopResult?.success) {
                showAlert(stopResult?.reason || 'Could not stop timer.', 'sky');
                return {
                    success: false,
                    reason: stopResult?.reason || 'Could not stop timer.'
                };
            }

            if (stopResult.activity) {
                onActivityCreated({ activity: stopResult.activity });
            }
        }

        const result = await startTimer(timerData);
        if (!result?.success) {
            showAlert(result?.reason || 'Could not start timer.', 'sky');
            return {
                success: false,
                reason: result?.reason || 'Could not start timer.'
            };
        }

        showToast('Timer started.', { theme: 'sky' });
        return result;
    } catch {
        showAlert('Could not start timer.', 'sky');
        return { success: false, reason: 'Could not start timer.' };
    }
}

export async function handleStopTimer() {
    let result;
    try {
        result = await stopTimer();
    } catch {
        showAlert('Could not stop timer.', 'sky');
        return { success: false, reason: 'Could not stop timer.' };
    }

    if (!result?.success) {
        showAlert(result?.reason || 'Could not stop timer.', 'sky');
        return {
            success: false,
            reason: result?.reason || 'Could not stop timer.'
        };
    }

    if (result.activity) {
        onActivityCreated({ activity: result.activity });
    }
    showToast('Timer stopped.', { theme: 'sky' });
    return result;
}

export function createActivityCallbacks() {
    return {
        onAddActivity: handleAddActivity,
        onEditActivity: handleEditActivity,
        onDeleteActivity: handleDeleteActivity,
        onSaveActivityEdit: handleSaveActivityEdit
    };
}
