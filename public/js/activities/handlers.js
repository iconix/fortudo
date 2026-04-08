import { showAlert } from '../modal-manager.js';
import { showToast } from '../toast-manager.js';
import { extractActivityFormData } from './form-utils.js';
import { addActivity, editActivity, removeActivity } from './manager.js';
import { onActivityCreated, onActivityEdited, onActivityDeleted } from '../app-coordinator.js';

function resolveActivityPayload(activityDataOrForm) {
    return activityDataOrForm instanceof HTMLFormElement
        ? extractActivityFormData(activityDataOrForm)
        : activityDataOrForm;
}

export async function handleAddActivity(activityDataOrForm) {
    const activityData = resolveActivityPayload(activityDataOrForm);
    if (!activityData) {
        return;
    }

    const result = await addActivity(activityData);
    if (!result.success) {
        showAlert(result.reason || 'Could not log activity.', 'sky');
        return;
    }

    onActivityCreated({ activity: result.activity });
    showToast('Activity logged.', { theme: 'sky' });
}

export async function handleEditActivity(activityId, updatesOrForm) {
    const updates = resolveActivityPayload(updatesOrForm);
    if (!updates) {
        return;
    }

    const result = await editActivity(activityId, updates);
    if (!result.success) {
        showAlert(result.reason || 'Could not update activity.', 'sky');
        return;
    }

    onActivityEdited({ activity: result.activity });
    showToast('Activity updated.', { theme: 'sky' });
}

export async function handleSaveActivityEdit(activityId, formElement) {
    return handleEditActivity(activityId, formElement);
}

export async function handleDeleteActivity(activityId) {
    const result = await removeActivity(activityId);
    if (!result.success) {
        showAlert(result.reason || 'Could not delete activity.', 'sky');
        return;
    }

    onActivityDeleted({ activity: result.activity });
    showToast('Activity deleted.', { theme: 'sky' });
}

export function createActivityCallbacks() {
    return {
        onAddActivity: handleAddActivity,
        onEditActivity: handleEditActivity,
        onDeleteActivity: handleDeleteActivity,
        onSaveActivityEdit: handleSaveActivityEdit
    };
}
