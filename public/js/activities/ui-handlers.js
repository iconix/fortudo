import { extractActivityFormData } from './form-utils.js';
import { getTodaysActivities } from './manager.js';
import { renderActivities } from './renderer.js';
import { handleAddActivity, handleDeleteActivity, handleSaveActivityEdit } from './handlers.js';

let editingActivityId = null;

export function resetActivityInlineEditState() {
    editingActivityId = null;
}

function clearDeleteConfirmState(deps) {
    const wasConfirming = deps.resetAllConfirmingDeleteFlags();
    if (wasConfirming) {
        deps.refreshUI();
    }
}

export function syncActivitiesUI(enabled) {
    const activityToggleOption = document.getElementById('activity-toggle-option');
    const activitiesContainer = document.getElementById('activities-container');

    if (activityToggleOption) {
        activityToggleOption.classList.toggle('hidden', !enabled);
    }

    if (activitiesContainer) {
        activitiesContainer.classList.toggle('hidden', !enabled);
    }

    if (!enabled) {
        editingActivityId = null;
        const activityRadio = document.getElementById('activity');
        const scheduledRadio = document.getElementById('scheduled');
        if (activityRadio instanceof HTMLInputElement) {
            activityRadio.checked = false;
        }
        if (scheduledRadio instanceof HTMLInputElement) {
            scheduledRadio.checked = true;
        }
    }
}

export function renderTodayActivities(enabled) {
    if (!enabled) {
        return;
    }

    renderActivities(
        getTodaysActivities(),
        /** @type {HTMLElement|null} */ (document.getElementById('activity-list')),
        { editingActivityId }
    );
}

export async function handleActivityAwareFormSubmit(formElement, deps) {
    const selectedTaskType = new FormData(formElement).get('task-type')?.toString();
    if (!deps.activitiesEnabled || selectedTaskType !== 'activity') {
        await deps.handleTaskSubmit(formElement);
        return;
    }

    const activityData = extractActivityFormData(formElement);
    if (!activityData) {
        deps.focusTaskDescriptionInput();
        return;
    }

    const result = await handleAddActivity(activityData);
    if (!result?.success) {
        return;
    }

    formElement.reset();
    deps.resetTaskFormPreviewState({
        hintElement: document.getElementById('end-time-hint'),
        warningElement: document.getElementById('overlap-warning'),
        buttonElement: document.getElementById('add-task-btn')
    });

    const categorySelect = document.getElementById('category-select');
    if (categorySelect) {
        categorySelect.dispatchEvent(new Event('change'));
    }

    const activityRadio = formElement.querySelector('input[name="task-type"][value="activity"]');
    if (activityRadio instanceof HTMLInputElement) {
        activityRadio.checked = true;
    }

    deps.initializeTaskTypeToggle();
    deps.focusTaskDescriptionInput();
}

export function handleActivityListClick(target, deps) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    const editActivityButton = target.closest('.btn-edit-activity');
    if (editActivityButton instanceof HTMLElement) {
        const activityItem = editActivityButton.closest('.activity-item[data-activity-id]');
        const activityId =
            editActivityButton.dataset.activityId || activityItem?.getAttribute('data-activity-id');
        clearDeleteConfirmState(deps);
        if (activityId) {
            editingActivityId = activityId;
            deps.refreshUI();
        }
        return true;
    }

    const cancelActivityEditButton = target.closest('.btn-cancel-activity-edit');
    if (cancelActivityEditButton instanceof HTMLElement) {
        editingActivityId = null;
        deps.refreshUI();
        return true;
    }

    const saveActivityEditButton = target.closest('.btn-save-activity-edit');
    if (saveActivityEditButton instanceof HTMLElement) {
        const editForm = saveActivityEditButton.closest(
            'form.activity-inline-edit-form[data-activity-id]'
        );
        const activityId = editForm?.getAttribute('data-activity-id');
        if (activityId && editForm instanceof HTMLFormElement) {
            void handleSaveActivityEdit(activityId, editForm).then((result) => {
                if (result?.success) {
                    editingActivityId = null;
                }
                deps.refreshUI();
            });
        }
        return true;
    }

    const deleteActivityButton = target.closest('.btn-delete-activity');
    if (deleteActivityButton instanceof HTMLElement) {
        const activityItem = deleteActivityButton.closest('.activity-item[data-activity-id]');
        const activityId =
            deleteActivityButton.dataset.activityId ||
            activityItem?.getAttribute('data-activity-id');
        clearDeleteConfirmState(deps);
        if (activityId) {
            if (editingActivityId === activityId) {
                editingActivityId = null;
            }
            void handleDeleteActivity(activityId);
        }
        return true;
    }

    const taskElement = target.closest('.task-item, .task-card');
    const deleteButton = target.closest('.btn-delete, .btn-delete-unscheduled');

    if (!taskElement && !deleteButton) {
        clearDeleteConfirmState(deps);
    }

    return false;
}
