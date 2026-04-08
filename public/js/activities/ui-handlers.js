import { extractActivityFormData } from './form-utils.js';
import { getTodaysActivities } from './manager.js';
import { renderActivities } from './renderer.js';
import { handleAddActivity, handleEditActivity, handleDeleteActivity } from './handlers.js';

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
        /** @type {HTMLElement|null} */ (document.getElementById('activity-list'))
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

    await handleAddActivity(activityData);
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
        const activityItem = editActivityButton.closest('[data-activity-id]');
        const activityId =
            editActivityButton.dataset.activityId || activityItem?.getAttribute('data-activity-id');
        if (activityId) {
            const currentDescription =
                activityItem?.querySelector('.text-sm.text-slate-200')?.textContent?.trim() || '';
            const nextDescription = window.prompt('Edit activity description:', currentDescription);
            if (
                nextDescription !== null &&
                nextDescription.trim() !== '' &&
                nextDescription.trim() !== currentDescription
            ) {
                void handleEditActivity(activityId, {
                    description: nextDescription.trim()
                });
            }
        }
        return true;
    }

    const deleteActivityButton = target.closest('.btn-delete-activity');
    if (deleteActivityButton instanceof HTMLElement) {
        const activityItem = deleteActivityButton.closest('[data-activity-id]');
        const activityId =
            deleteActivityButton.dataset.activityId ||
            activityItem?.getAttribute('data-activity-id');
        if (activityId) {
            void handleDeleteActivity(activityId);
        }
        return true;
    }

    const taskElement = target.closest('.task-item, .task-card');
    const deleteButton = target.closest('.btn-delete, .btn-delete-unscheduled');

    if (!taskElement && !deleteButton) {
        const wasConfirming = deps.resetAllConfirmingDeleteFlags();
        if (wasConfirming) {
            deps.refreshUI();
        }
    }

    return false;
}
